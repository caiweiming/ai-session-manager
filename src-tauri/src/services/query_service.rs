use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};

use crate::path_identity::path_key;
use crate::time_utils::shanghai_time_days_ago;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionListScope {
    Active,
    Trash,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionRow {
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

#[derive(Debug, Clone, serde::Serialize)]
pub struct MessageRow {
    pub role: String,
    pub content: String,
    pub seq: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionMetaRow {
    pub session_id: i64,
    pub source_tool: String,
    pub source_id: String,
    pub title: String,
    pub source_path: String,
    pub workspace_path: String,
    pub is_subagent: bool,
    pub size_bytes: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub source_file_mtime: i64,
    pub source_file_size: i64,
    pub message_cache_source_mtime: i64,
    pub message_cache_source_size: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionDetail {
    pub session: SessionMetaRow,
    pub messages: Vec<MessageRow>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct OverviewToolRow {
    pub source_tool: String,
    pub session_count: i64,
    pub total_size_bytes: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct OverviewSummaryData {
    pub total_workspaces: i64,
    pub total_sessions: i64,
    pub active_sessions_7d: i64,
    pub trash_sessions: i64,
    pub total_size_bytes: i64,
    pub tool_stats: Vec<OverviewToolRow>,
}

pub fn list_sessions(
    conn: &Connection,
    tool: Option<&str>,
    workspace_path: Option<&str>,
    keyword: Option<&str>,
    updated_within_days: Option<i64>,
    page: i64,
    page_size: i64,
) -> anyhow::Result<Vec<SessionRow>> {
    list_sessions_with_scope(
        conn,
        SessionListScope::Active,
        tool,
        workspace_path,
        keyword,
        updated_within_days,
        page,
        page_size,
    )
}

// Keep filtering inputs explicit at the service boundary.
#[allow(clippy::too_many_arguments)]
pub fn list_sessions_with_scope(
    conn: &Connection,
    scope: SessionListScope,
    tool: Option<&str>,
    workspace_path: Option<&str>,
    keyword: Option<&str>,
    updated_within_days: Option<i64>,
    page: i64,
    page_size: i64,
) -> anyhow::Result<Vec<SessionRow>> {
    let offset = (page - 1) * page_size;
    let mut out = Vec::new();
    let workspace_path = workspace_path
        .map(str::trim)
        .filter(|path| !path.is_empty());
    let workspace_key = workspace_path
        .as_ref()
        .map(|path| path_key(path))
        .filter(|key| !key.is_empty());
    let workspace_like = workspace_key.as_deref().map(|key| {
        if key.ends_with('/') {
            format!("{key}%")
        } else {
            format!("{key}/%")
        }
    });
    let keyword = keyword.map(str::trim).filter(|value| !value.is_empty());

    let mut sql = String::from(
        "select s.source_tool, s.source_id, s.parent_source_id, s.title, s.source_path, s.workspace_path, s.is_subagent, s.source_file_size, coalesce(s.started_at, s.updated_at) as created_at, s.updated_at
         from sessions s
         where 1=1",
    );
    let mut query_params: Vec<Value> = Vec::new();

    match scope {
        SessionListScope::Active => {
            sql.push_str(
                " and s.deleted_at is null and s.deleted_by_user=0
                  and (
                    s.is_subagent=0
                    or (
                      s.source_tool='claude'
                      and s.is_subagent=1
                      and trim(coalesce(s.parent_source_id, '')) <> ''
                      and not exists (
                        select 1
                        from sessions parent
                        where parent.source_tool=s.source_tool
                          and parent.source_id=s.parent_source_id
                          and parent.is_subagent=0
                          and parent.deleted_at is null
                          and parent.deleted_by_user=0
                      )
                    )
                  )",
            );
        }
        SessionListScope::Trash => {
            sql.push_str(
                " and s.deleted_by_user=1
                  and (
                    s.is_subagent=0
                    or (
                      s.source_tool='claude'
                      and s.is_subagent=1
                      and trim(coalesce(s.parent_source_id, '')) <> ''
                      and not exists (
                        select 1
                        from sessions parent
                        where parent.source_tool=s.source_tool
                          and parent.source_id=s.parent_source_id
                          and parent.is_subagent=0
                          and parent.deleted_by_user=1
                      )
                    )
                  )",
            );
        }
    }

    if let Some(tool) = tool.map(str::trim).filter(|tool| !tool.is_empty()) {
        sql.push_str(" and s.source_tool=?");
        query_params.push(Value::Text(tool.to_string()));
    }

    if let (Some(path), Some(prefix)) = (workspace_key.as_deref(), workspace_like.as_deref()) {
        sql.push_str(" and (s.workspace_path_key=? or s.workspace_path_key like ?)");
        query_params.push(Value::Text(path.to_string()));
        query_params.push(Value::Text(prefix.to_string()));
    }

    if let Some(term) = keyword {
        let pattern = format!("%{term}%");
        sql.push_str(
            " and (
                s.source_id like ?
                or s.title like ?
                or s.source_path like ?
                or s.workspace_path like ?
                or exists (
                    select 1
                    from messages m
                    where m.session_id=s.id
                      and m.content like ?
                )
            )",
        );
        query_params.push(Value::Text(pattern.clone()));
        query_params.push(Value::Text(pattern.clone()));
        query_params.push(Value::Text(pattern.clone()));
        query_params.push(Value::Text(pattern.clone()));
        query_params.push(Value::Text(pattern));
    }

    match scope {
        SessionListScope::Active => {
            if let Some(days) = updated_within_days {
                sql.push_str(" and s.updated_at >= ?");
                query_params.push(Value::Text(shanghai_time_days_ago(days.max(0))));
            }
            sql.push_str(" order by s.updated_at desc, s.id desc");
        }
        SessionListScope::Trash => {
            sql.push_str(" order by s.deleted_at desc, s.updated_at desc, s.id desc");
        }
    }

    sql.push_str(" limit ? offset ?");
    query_params.push(Value::Integer(page_size));
    query_params.push(Value::Integer(offset));

    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params_from_iter(query_params.iter()))?;
    while let Some(r) = rows.next()? {
        out.push(SessionRow {
            source_tool: r.get(0)?,
            source_id: r.get(1)?,
            parent_source_id: r.get(2)?,
            title: r.get(3)?,
            source_path: r.get(4)?,
            workspace_path: r.get(5)?,
            is_subagent: r.get::<_, i64>(6)? != 0,
            size_bytes: r.get(7)?,
            created_at: r.get(8)?,
            updated_at: r.get(9)?,
        });
    }
    Ok(out)
}

pub fn get_session_detail(
    conn: &Connection,
    source_tool: &str,
    source_id: &str,
    include_subagent: bool,
    in_trash: bool,
) -> anyhow::Result<Option<SessionDetail>> {
    let Some(session) =
        find_session_meta(conn, source_tool, source_id, include_subagent, in_trash)?
    else {
        return Ok(None);
    };
    let messages = list_session_messages(conn, session.session_id, None)?;
    Ok(Some(SessionDetail { session, messages }))
}

pub fn find_session_meta(
    conn: &Connection,
    source_tool: &str,
    source_id: &str,
    include_subagent: bool,
    in_trash: bool,
) -> anyhow::Result<Option<SessionMetaRow>> {
    let sql = if include_subagent && in_trash {
        "select id, source_tool, source_id, title, source_path, workspace_path, is_subagent, source_file_size, input_token_count, output_token_count, source_file_mtime, source_file_size, message_cache_source_mtime, message_cache_source_size, coalesce(started_at, updated_at) as created_at, updated_at
         from sessions
         where source_tool=?1 and source_id=?2 and deleted_by_user=1"
    } else if include_subagent {
        "select id, source_tool, source_id, title, source_path, workspace_path, is_subagent, source_file_size, input_token_count, output_token_count, source_file_mtime, source_file_size, message_cache_source_mtime, message_cache_source_size, coalesce(started_at, updated_at) as created_at, updated_at
         from sessions
         where source_tool=?1 and source_id=?2 and deleted_at is null and deleted_by_user=0"
    } else if in_trash {
        "select id, source_tool, source_id, title, source_path, workspace_path, is_subagent, source_file_size, input_token_count, output_token_count, source_file_mtime, source_file_size, message_cache_source_mtime, message_cache_source_size, coalesce(started_at, updated_at) as created_at, updated_at
         from sessions
         where source_tool=?1 and source_id=?2 and deleted_by_user=1 and is_subagent=0"
    } else {
        "select id, source_tool, source_id, title, source_path, workspace_path, is_subagent, source_file_size, input_token_count, output_token_count, source_file_mtime, source_file_size, message_cache_source_mtime, message_cache_source_size, coalesce(started_at, updated_at) as created_at, updated_at
         from sessions
         where source_tool=?1 and source_id=?2 and deleted_at is null and deleted_by_user=0 and is_subagent=0"
    };

    conn.query_row(sql, params![source_tool, source_id], |r| {
        Ok(SessionMetaRow {
            session_id: r.get(0)?,
            source_tool: r.get(1)?,
            source_id: r.get(2)?,
            title: r.get(3)?,
            source_path: r.get(4)?,
            workspace_path: r.get(5)?,
            is_subagent: r.get::<_, i64>(6)? != 0,
            size_bytes: r.get(7)?,
            input_tokens: r.get(8)?,
            output_tokens: r.get(9)?,
            source_file_mtime: r.get(10)?,
            source_file_size: r.get(11)?,
            message_cache_source_mtime: r.get(12)?,
            message_cache_source_size: r.get(13)?,
            created_at: r.get(14)?,
            updated_at: r.get(15)?,
        })
    })
    .optional()
    .map_err(Into::into)
}

pub fn is_session_message_cache_fresh(session: &SessionMetaRow) -> bool {
    session.message_cache_source_mtime == session.source_file_mtime
        && session.message_cache_source_size == session.source_file_size
}

pub fn list_session_messages(
    conn: &Connection,
    session_id: i64,
    limit: Option<i64>,
) -> anyhow::Result<Vec<MessageRow>> {
    let mut messages = Vec::new();
    if let Some(limit) = limit {
        let mut stmt = conn.prepare(
            "select q.role, q.content, q.seq, q.created_at
             from (
               select role, content, seq, created_at
               from messages
               where session_id=?1
               order by seq desc
               limit ?2
             ) q
             order by q.seq asc",
        )?;
        let mut rows = stmt.query(params![session_id, limit])?;
        while let Some(r) = rows.next()? {
            messages.push(MessageRow {
                role: r.get(0)?,
                content: r.get(1)?,
                seq: r.get(2)?,
                created_at: r.get(3)?,
            });
        }
    } else {
        let mut stmt = conn.prepare(
            "select role, content, seq, created_at from messages where session_id=?1 order by seq asc",
        )?;
        let mut rows = stmt.query(params![session_id])?;
        while let Some(r) = rows.next()? {
            messages.push(MessageRow {
                role: r.get(0)?,
                content: r.get(1)?,
                seq: r.get(2)?,
                created_at: r.get(3)?,
            });
        }
    }
    Ok(messages)
}

pub fn count_session_messages(conn: &Connection, session_id: i64) -> anyhow::Result<i64> {
    conn.query_row(
        "select count(*) from messages where session_id=?1",
        params![session_id],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

pub fn list_subagent_sessions(
    conn: &Connection,
    source_tool: &str,
    parent_source_id: &str,
    in_trash: bool,
) -> anyhow::Result<Vec<SessionRow>> {
    let sql = if in_trash {
        "with recursive session_tree(id, source_tool, source_id, title, source_path, workspace_path, is_subagent, size_bytes, created_at, updated_at) as (
            select id, source_tool, source_id, title, source_path, workspace_path, is_subagent, source_file_size, coalesce(started_at, updated_at), updated_at
            from sessions
            where source_tool=?1 and parent_source_id=?2 and deleted_by_user=1 and is_subagent=1
          union all
            select child.id, child.source_tool, child.source_id, child.title, child.source_path, child.workspace_path, child.is_subagent, child.source_file_size, coalesce(child.started_at, child.updated_at), child.updated_at
            from sessions child
            inner join session_tree tree
              on child.source_tool=tree.source_tool and child.parent_source_id=tree.source_id
            where child.deleted_by_user=1 and child.is_subagent=1
        )
        select id, source_tool, source_id, title, source_path, workspace_path, is_subagent, size_bytes, created_at, updated_at
        from session_tree
        order by updated_at desc, id desc"
    } else {
        "with recursive session_tree(id, source_tool, source_id, title, source_path, workspace_path, is_subagent, size_bytes, created_at, updated_at) as (
            select id, source_tool, source_id, title, source_path, workspace_path, is_subagent, source_file_size, coalesce(started_at, updated_at), updated_at
            from sessions
            where source_tool=?1 and parent_source_id=?2 and deleted_at is null and deleted_by_user=0 and is_subagent=1
          union all
            select child.id, child.source_tool, child.source_id, child.title, child.source_path, child.workspace_path, child.is_subagent, child.source_file_size, coalesce(child.started_at, child.updated_at), child.updated_at
            from sessions child
            inner join session_tree tree
              on child.source_tool=tree.source_tool and child.parent_source_id=tree.source_id
            where child.deleted_at is null and child.deleted_by_user=0 and child.is_subagent=1
        )
        select id, source_tool, source_id, title, source_path, workspace_path, is_subagent, size_bytes, created_at, updated_at
        from session_tree
        order by updated_at desc, id desc"
    };

    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query(params![source_tool, parent_source_id])?;
    let mut out = Vec::new();
    while let Some(r) = rows.next()? {
        out.push(SessionRow {
            source_tool: r.get(1)?,
            source_id: r.get(2)?,
            parent_source_id: Some(parent_source_id.to_string()),
            title: r.get(3)?,
            source_path: r.get(4)?,
            workspace_path: r.get(5)?,
            is_subagent: r.get::<_, i64>(6)? != 0,
            size_bytes: r.get(7)?,
            created_at: r.get(8)?,
            updated_at: r.get(9)?,
        });
    }
    Ok(out)
}

pub fn get_overview_summary(conn: &Connection) -> anyhow::Result<OverviewSummaryData> {
    let active_main_scope = "from sessions
        where deleted_at is null
          and deleted_by_user=0
          and is_subagent=0";

    let total_workspaces: i64 = conn.query_row(
        &format!(
            "select count(distinct workspace_path) {active_main_scope} and trim(workspace_path)<>''"
        ),
        [],
        |row| row.get(0),
    )?;
    let total_sessions: i64 =
        conn.query_row(&format!("select count(*) {active_main_scope}"), [], |row| {
            row.get(0)
        })?;
    let active_sessions_7d: i64 = conn.query_row(
        &format!("select count(*) {active_main_scope} and updated_at>=?1"),
        params![shanghai_time_days_ago(7)],
        |row| row.get(0),
    )?;
    let trash_sessions: i64 = conn.query_row(
        "select count(*)
         from sessions
         where deleted_by_user=1
           and is_subagent=0",
        [],
        |row| row.get(0),
    )?;
    let total_size_bytes: i64 = conn.query_row(
        &format!("select coalesce(sum(source_file_size), 0) {active_main_scope}"),
        [],
        |row| row.get(0),
    )?;

    let mut stmt = conn.prepare(
        "select source_tool,
                count(*) as session_count,
                coalesce(sum(source_file_size), 0) as total_size_bytes
         from sessions
         where deleted_at is null
           and deleted_by_user=0
           and is_subagent=0
         group by source_tool
         order by session_count desc, source_tool asc",
    )?;
    let tool_stats = stmt
        .query_map([], |row| {
            Ok(OverviewToolRow {
                source_tool: row.get(0)?,
                session_count: row.get(1)?,
                total_size_bytes: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(OverviewSummaryData {
        total_workspaces,
        total_sessions,
        active_sessions_7d,
        trash_sessions,
        total_size_bytes,
        tool_stats,
    })
}
