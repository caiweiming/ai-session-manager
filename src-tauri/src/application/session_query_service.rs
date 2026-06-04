use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::migrate::init_db;
use crate::domain::safety::{
    normalize_keyword, normalize_message_limit, normalize_page, normalize_page_size,
    normalize_updated_within_days,
};
use crate::parsers::claude::parse_claude_file;
use crate::parsers::codex::parse_codex_file;
use crate::parsers::gemini::parse_gemini_file;
use crate::services::indexer::replace_session_messages_with_cache_meta;
use crate::services::query_service::{
    count_session_messages, find_session_meta, get_overview_summary,
    is_session_message_cache_fresh, list_session_messages, list_sessions_with_scope,
    list_subagent_sessions, OverviewSummaryData, OverviewToolRow,
    SessionListScope as QuerySessionListScope,
};

#[derive(Debug, Clone)]
pub enum SessionListScope {
    Active,
    Trash,
}

#[derive(Debug, Clone)]
pub struct SessionListRequest {
    pub scope: SessionListScope,
    pub tool: Option<String>,
    pub workspace_path: Option<String>,
    pub keyword: Option<String>,
    pub updated_within_days: Option<i64>,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Clone)]
pub struct SessionDetailRequest {
    pub source_tool: String,
    pub source_id: String,
    pub include_subagent: bool,
    pub in_trash: bool,
    pub message_limit: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct SubagentSessionsRequest {
    pub source_tool: String,
    pub parent_source_id: String,
    pub in_trash: bool,
}

#[derive(Debug, Clone)]
pub struct SessionMessage {
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct SessionListItem {
    pub source_tool: String,
    pub source_id: String,
    pub parent_source_id: Option<String>,
    pub title: String,
    pub source_path: String,
    pub workspace_path: String,
    pub is_subagent: bool,
    pub size_bytes: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct SessionDetailResult {
    pub source_tool: String,
    pub source_id: String,
    pub title: String,
    pub source_path: String,
    pub workspace_path: String,
    pub is_subagent: bool,
    pub created_at: String,
    pub updated_at: String,
    pub size_bytes: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub message_total: i64,
    pub message_loaded: i64,
    pub messages: Vec<SessionMessage>,
}

#[derive(Debug, Clone)]
pub struct OverviewToolSummary {
    pub source_tool: String,
    pub session_count: i64,
    pub total_size_bytes: i64,
}

#[derive(Debug, Clone)]
pub struct OverviewSummaryResult {
    pub total_workspaces: i64,
    pub total_sessions: i64,
    pub active_sessions_7d: i64,
    pub trash_sessions: i64,
    pub total_size_bytes: i64,
    pub tool_stats: Vec<OverviewToolSummary>,
}

fn open_initialized_connection(db_path: &Path) -> anyhow::Result<Connection> {
    init_db(db_path)?;
    Ok(Connection::open(db_path)?)
}

pub fn load_session_list(
    db_path: &Path,
    request: SessionListRequest,
) -> anyhow::Result<Vec<SessionListItem>> {
    let conn = open_initialized_connection(db_path)?;
    let keyword = normalize_keyword(request.keyword.as_deref());
    let updated_within_days = normalize_updated_within_days(request.updated_within_days);
    let page = normalize_page(request.page);
    let page_size = normalize_page_size(request.page_size);

    let scope = match request.scope {
        SessionListScope::Active => QuerySessionListScope::Active,
        SessionListScope::Trash => QuerySessionListScope::Trash,
    };

    let rows = list_sessions_with_scope(
        &conn,
        scope,
        request.tool.as_deref(),
        request.workspace_path.as_deref(),
        keyword.as_deref(),
        updated_within_days,
        page,
        page_size,
    )?;
    Ok(rows.into_iter().map(map_session_list_item).collect())
}

pub fn load_session_detail(
    db_path: &Path,
    request: SessionDetailRequest,
) -> anyhow::Result<Option<SessionDetailResult>> {
    let mut conn = open_initialized_connection(db_path)?;
    let message_limit = normalize_message_limit(request.message_limit);

    let maybe_meta = find_session_meta(
        &conn,
        &request.source_tool,
        &request.source_id,
        request.include_subagent,
        request.in_trash,
    )?;

    let Some(meta) = maybe_meta else {
        return Ok(None);
    };

    if !is_session_message_cache_fresh(&meta) {
        hydrate_session_messages_if_stale(&mut conn, &meta)?;
    }

    let messages: Vec<SessionMessage> =
        list_session_messages(&conn, meta.session_id, message_limit)?
            .into_iter()
            .map(|message| SessionMessage {
                role: message.role,
                content: message.content,
                created_at: message.created_at,
            })
            .collect();
    let message_total = count_session_messages(&conn, meta.session_id)?;

    Ok(Some(SessionDetailResult {
        source_tool: meta.source_tool,
        source_id: meta.source_id,
        title: meta.title,
        source_path: meta.source_path,
        workspace_path: meta.workspace_path,
        is_subagent: meta.is_subagent,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        size_bytes: meta.size_bytes,
        input_tokens: meta.input_tokens,
        output_tokens: meta.output_tokens,
        message_total,
        message_loaded: messages.len() as i64,
        messages,
    }))
}

fn hydrate_session_messages_if_stale(
    conn: &mut Connection,
    meta: &crate::services::query_service::SessionMetaRow,
) -> anyhow::Result<()> {
    let source_path = PathBuf::from(&meta.source_path);
    let parsed = match meta.source_tool.as_str() {
        "codex" => parse_codex_file(&source_path)?,
        "claude" => parse_claude_file(&source_path)?,
        "gemini" => parse_gemini_file(&source_path)?,
        _ => return Ok(()),
    };

    replace_session_messages_with_cache_meta(
        conn,
        meta.session_id,
        &parsed,
        meta.source_file_size,
        meta.source_file_mtime,
    )
}

pub fn load_subagent_sessions(
    db_path: &Path,
    request: SubagentSessionsRequest,
) -> anyhow::Result<Vec<SessionListItem>> {
    let conn = open_initialized_connection(db_path)?;
    let mut rows = list_subagent_sessions(
        &conn,
        &request.source_tool,
        &request.parent_source_id,
        request.in_trash,
    )?;

    for row in &mut rows {
        if let Some(title) =
            query_subagent_snippet_title(&conn, &row.source_tool, &row.source_id, request.in_trash)
        {
            row.title = title;
        }
    }

    Ok(rows.into_iter().map(map_session_list_item).collect())
}

pub fn load_overview_summary(db_path: &Path) -> anyhow::Result<OverviewSummaryResult> {
    let conn = open_initialized_connection(db_path)?;
    let summary = get_overview_summary(&conn)?;
    Ok(map_overview_summary(summary))
}

fn summarize_first_paragraph(content: &str) -> Option<String> {
    let normalized = content.replace('\r', "\n");
    let paragraph = normalized
        .split("\n\n")
        .flat_map(|block| block.split('\n'))
        .map(str::trim)
        .find(|line| !line.is_empty())?;

    const MAX_CHARS: usize = 96;
    let mut out = String::new();
    for (count, ch) in paragraph.chars().enumerate() {
        if count >= MAX_CHARS {
            out.push_str("...");
            break;
        }
        out.push(ch);
    }
    Some(out)
}

fn query_subagent_snippet_title(
    conn: &Connection,
    source_tool: &str,
    source_id: &str,
    in_trash: bool,
) -> Option<String> {
    let scope = if in_trash {
        "s.deleted_by_user=1"
    } else {
        "s.deleted_at is null and s.deleted_by_user=0"
    };

    let sql = format!(
        "select m.content
         from sessions s
         inner join messages m on m.session_id=s.id
         where s.source_tool=?1 and s.source_id=?2 and {scope}
           and length(trim(m.content))>0
           and m.role in ('user','assistant','ai','tool','dev')
         order by
           case m.role
             when 'user' then 0
             when 'assistant' then 1
             when 'ai' then 1
             else 2
           end,
           m.seq asc
         limit 1"
    );

    let content = conn
        .query_row(&sql, params![source_tool, source_id], |row| {
            row.get::<_, String>(0)
        })
        .optional()
        .ok()
        .flatten()?;

    summarize_first_paragraph(&content)
}

fn map_session_list_item(row: crate::services::query_service::SessionRow) -> SessionListItem {
    SessionListItem {
        source_tool: row.source_tool,
        source_id: row.source_id,
        parent_source_id: row.parent_source_id,
        title: row.title,
        source_path: row.source_path,
        workspace_path: row.workspace_path,
        is_subagent: row.is_subagent,
        size_bytes: row.size_bytes,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn map_overview_summary(summary: OverviewSummaryData) -> OverviewSummaryResult {
    OverviewSummaryResult {
        total_workspaces: summary.total_workspaces,
        total_sessions: summary.total_sessions,
        active_sessions_7d: summary.active_sessions_7d,
        trash_sessions: summary.trash_sessions,
        total_size_bytes: summary.total_size_bytes,
        tool_stats: summary
            .tool_stats
            .into_iter()
            .map(map_overview_tool_row)
            .collect(),
    }
}

fn map_overview_tool_row(row: OverviewToolRow) -> OverviewToolSummary {
    OverviewToolSummary {
        source_tool: row.source_tool,
        session_count: row.session_count,
        total_size_bytes: row.total_size_bytes,
    }
}
