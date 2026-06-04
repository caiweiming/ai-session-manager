use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail};
use rusqlite::{params, params_from_iter, Connection, ToSql};

use crate::application::session_query_service::{load_session_detail, SessionDetailRequest};
use crate::domain::safety::{
    validate_deletable_source_path, validate_resume_source_id, validate_resume_workspace_path,
};
use crate::services::exporter::{render_markdown, MarkdownMessage};
use crate::time_utils::now_shanghai_string;

#[derive(Debug, Clone, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
    pub deleted_sessions: usize,
    pub deleted_source_files: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashClearProgress {
    pub deleted_sessions: usize,
    pub total_sessions: usize,
}

#[derive(Debug, Clone)]
pub struct ValidatedResumePayload {
    pub source_tool: String,
    pub source_id: String,
    pub workspace_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct ValidatedOpenInExplorerPayload {
    pub path: String,
    pub reveal: bool,
}

#[derive(Debug, Clone)]
pub struct DeleteSessionRequest {
    pub source_tool: String,
    pub source_id: String,
    pub hard_delete: bool,
    pub cascade_subagents: bool,
}

#[derive(Debug, Clone)]
pub struct DeleteSessionTarget {
    pub source_tool: String,
    pub source_id: String,
}

#[derive(Debug, Clone)]
pub struct DeleteSessionsRequest {
    pub targets: Vec<DeleteSessionTarget>,
    pub hard_delete: bool,
    pub cascade_subagents: bool,
}

#[derive(Debug, Clone)]
pub struct RestoreSessionRequest {
    pub source_tool: String,
    pub source_id: String,
    pub cascade_subagents: bool,
}

#[derive(Debug, Clone)]
pub struct ExportSessionMarkdownRequest {
    pub source_tool: String,
    pub source_id: String,
    pub include_subagent: bool,
    pub target_path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ExportSessionMarkdownResult {
    pub path: PathBuf,
}

pub fn fetch_source_paths(
    conn: &Connection,
    session_ids: &[i64],
) -> anyhow::Result<Vec<(i64, String)>> {
    if session_ids.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = vec!["?"; session_ids.len()].join(",");
    let mut stmt = conn.prepare(&format!(
        "select id, coalesce(source_path, '')
         from sessions
         where id in ({placeholders})
         order by id asc"
    ))?;

    let rows = stmt.query_map(params_from_iter(session_ids.iter()), |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn soft_delete_session_ids(conn: &Connection, session_ids: &[i64]) -> anyhow::Result<usize> {
    if session_ids.is_empty() {
        return Ok(0);
    }

    let deleted_at = now_shanghai_string();
    let placeholders = vec!["?"; session_ids.len()].join(",");
    let mut sql_params: Vec<&dyn ToSql> = Vec::with_capacity(session_ids.len() + 1);
    sql_params.push(&deleted_at);
    for session_id in session_ids {
        sql_params.push(session_id);
    }

    conn.execute(
        &format!(
            "update sessions
             set deleted_at=?1, deleted_by_user=1
             where deleted_at is null and id in ({placeholders})"
        ),
        params_from_iter(sql_params),
    )
    .map_err(Into::into)
}

pub fn purge_deleted_session_ids(
    conn: &mut Connection,
    session_ids: &[i64],
) -> anyhow::Result<MutationResult> {
    let mut result = MutationResult::default();
    if session_ids.is_empty() {
        return Ok(result);
    }

    let mut grouped_paths: Vec<(String, PathBuf, String, Vec<i64>)> = Vec::new();
    let mut path_indexes: HashMap<String, usize> = HashMap::new();
    for (session_id, source_path) in fetch_source_paths(conn, session_ids)? {
        let display_path = display_warning_path(source_path.trim());
        let delete_path = match validate_deletable_source_path(&source_path) {
            Ok(path) => path,
            Err(err) => {
                result.warnings.push(format!("{display_path}: {err}"));
                continue;
            }
        };
        let key = canonical_delete_key(&delete_path);
        if let Some(index) = path_indexes.get(&key).copied() {
            grouped_paths[index].3.push(session_id);
        } else {
            path_indexes.insert(key.clone(), grouped_paths.len());
            grouped_paths.push((key, delete_path, display_path, vec![session_id]));
        }
    }

    let purgeable_ids = grouped_paths
        .iter()
        .flat_map(|(_, _, _, ids)| ids.iter().copied())
        .collect::<Vec<_>>();

    match purge_session_rows(conn, &purgeable_ids) {
        Ok(deleted_sessions) => {
            result.deleted_sessions = deleted_sessions;
            for (_, delete_path, display_path, _) in grouped_paths {
                match std::fs::remove_file(&delete_path) {
                    Ok(_) => {
                        result.deleted_source_files += 1;
                    }
                    Err(err) => {
                        result.warnings.push(format!("{display_path}: {err}"));
                    }
                }
            }
        }
        Err(err) => {
            result
                .warnings
                .push(format!("database purge failed: {err}"));
        }
    }
    Ok(result)
}

pub fn validate_resume_payload(
    source_tool: &str,
    source_id: &str,
    workspace_path: &str,
) -> anyhow::Result<ValidatedResumePayload> {
    let source_tool = source_tool.trim().to_ascii_lowercase();
    if !matches!(source_tool.as_str(), "codex" | "claude" | "gemini") {
        bail!("unsupported source tool");
    }

    let source_id = validate_resume_source_id(source_id.trim())?;
    let workspace_path = validate_resume_workspace_path(workspace_path.trim())?;

    Ok(ValidatedResumePayload {
        source_tool,
        source_id,
        workspace_path,
    })
}

pub fn validate_export_target_path(target_path: &str) -> anyhow::Result<PathBuf> {
    let trimmed = target_path.trim();
    if trimmed.is_empty() {
        bail!("invalid export target path: empty");
    }

    let path = PathBuf::from(trimmed);
    if path.exists() && path.is_dir() {
        bail!("export target path is a directory");
    }

    Ok(path)
}

pub fn validate_open_in_explorer_payload(
    path: &str,
    reveal: bool,
) -> anyhow::Result<ValidatedOpenInExplorerPayload> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        bail!("invalid path: empty");
    }

    let target = PathBuf::from(trimmed);
    if !target.exists() {
        bail!("path does not exist");
    }

    Ok(ValidatedOpenInExplorerPayload {
        path: trimmed.to_string(),
        reveal,
    })
}

pub fn delete_session(
    db_path: &Path,
    request: DeleteSessionRequest,
) -> anyhow::Result<MutationResult> {
    let mut conn = open_initialized_connection(db_path)?;
    let target_ids = {
        let tx = conn.transaction()?;
        let target_ids = resolve_target_session_ids(
            &tx,
            &request.source_tool,
            &request.source_id,
            request.cascade_subagents,
        )?;

        if target_ids.is_empty() {
            tx.commit()?;
            return Ok(MutationResult::default());
        }

        let deleted_sessions = soft_delete_session_ids(&tx, &target_ids)?;
        tx.commit()?;

        if !request.hard_delete {
            return Ok(MutationResult {
                deleted_sessions,
                deleted_source_files: 0,
                warnings: Vec::new(),
            });
        }

        target_ids
    };

    purge_deleted_session_ids(&mut conn, &target_ids)
}

pub fn delete_sessions(
    db_path: &Path,
    request: DeleteSessionsRequest,
) -> anyhow::Result<MutationResult> {
    delete_sessions_with_progress(db_path, request, 200, |_| {})
}

pub fn delete_sessions_with_progress<F>(
    db_path: &Path,
    request: DeleteSessionsRequest,
    batch_size: usize,
    mut on_progress: F,
) -> anyhow::Result<MutationResult>
where
    F: FnMut(TrashClearProgress),
{
    if request.targets.is_empty() {
        return Ok(MutationResult::default());
    }

    let mut conn = open_initialized_connection(db_path)?;
    let mut all_target_ids = Vec::new();

    {
        let tx = conn.transaction()?;
        for target in &request.targets {
            let mut target_ids = resolve_target_session_ids(
                &tx,
                &target.source_tool,
                &target.source_id,
                request.cascade_subagents,
            )?;
            all_target_ids.append(&mut target_ids);
        }

        all_target_ids.sort_unstable();
        all_target_ids.dedup();

        if all_target_ids.is_empty() {
            tx.commit()?;
            return Ok(MutationResult::default());
        }

        let deleted_sessions = soft_delete_session_ids(&tx, &all_target_ids)?;
        tx.commit()?;

        if !request.hard_delete {
            return Ok(MutationResult {
                deleted_sessions,
                deleted_source_files: 0,
                warnings: Vec::new(),
            });
        }
    }

    let total_sessions = all_target_ids.len();
    let effective_batch_size = batch_size.max(1);
    let mut result = MutationResult::default();

    for batch in all_target_ids.chunks(effective_batch_size) {
        let batch_result = purge_deleted_session_ids(&mut conn, batch)?;
        result.deleted_sessions += batch_result.deleted_sessions;
        result.deleted_source_files += batch_result.deleted_source_files;
        result.warnings.extend(batch_result.warnings);
        on_progress(TrashClearProgress {
            deleted_sessions: result.deleted_sessions,
            total_sessions,
        });
    }

    Ok(result)
}

pub fn restore_session(db_path: &Path, request: RestoreSessionRequest) -> anyhow::Result<usize> {
    let mut conn = open_initialized_connection(db_path)?;
    let tx = conn.transaction()?;

    let target_ids = resolve_target_session_ids(
        &tx,
        &request.source_tool,
        &request.source_id,
        request.cascade_subagents,
    )?;

    if target_ids.is_empty() {
        tx.commit()?;
        return Ok(0);
    }

    let placeholders = vec!["?"; target_ids.len()].join(",");
    let mut restore_params: Vec<&dyn ToSql> = Vec::with_capacity(target_ids.len());
    for session_id in &target_ids {
        restore_params.push(session_id);
    }

    let restored = tx.execute(
        &format!(
            "update sessions
             set deleted_at=null, deleted_by_user=0
             where deleted_by_user=1 and id in ({placeholders})"
        ),
        params_from_iter(restore_params),
    )?;

    tx.commit()?;
    Ok(restored)
}

pub fn clear_trash(db_path: &Path) -> anyhow::Result<MutationResult> {
    clear_trash_with_progress(db_path, 200, |_| {})
}

pub fn clear_trash_with_progress<F>(
    db_path: &Path,
    batch_size: usize,
    mut on_progress: F,
) -> anyhow::Result<MutationResult>
where
    F: FnMut(TrashClearProgress),
{
    let mut conn = open_initialized_connection(db_path)?;
    let mut ids_stmt = conn.prepare("select id from sessions where deleted_by_user=1")?;
    let ids = ids_stmt
        .query_map([], |row| row.get::<_, i64>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(ids_stmt);

    if ids.is_empty() {
        return Ok(MutationResult::default());
    }

    let total_sessions = ids.len();
    let mut result = MutationResult::default();
    let effective_batch_size = batch_size.max(1);

    for batch in ids.chunks(effective_batch_size) {
        let batch_result = purge_deleted_session_ids(&mut conn, batch)?;
        result.deleted_sessions += batch_result.deleted_sessions;
        result.deleted_source_files += batch_result.deleted_source_files;
        result.warnings.extend(batch_result.warnings);
        on_progress(TrashClearProgress {
            deleted_sessions: result.deleted_sessions,
            total_sessions,
        });
    }

    Ok(result)
}

pub fn build_export_dialog_filename(source_id: &str) -> String {
    format!(
        "{}.md",
        sanitize_filename_component(source_id, "session", 64)
    )
}

pub fn export_session_markdown(
    db_path: &Path,
    request: ExportSessionMarkdownRequest,
) -> anyhow::Result<ExportSessionMarkdownResult> {
    let detail = load_session_detail(
        db_path,
        SessionDetailRequest {
            source_tool: request.source_tool,
            source_id: request.source_id,
            include_subagent: request.include_subagent,
            in_trash: false,
            message_limit: None,
        },
    )?
    .ok_or_else(|| anyhow!("session not found"))?;

    let rows: Vec<MarkdownMessage<'_>> = detail
        .messages
        .iter()
        .map(|message| MarkdownMessage {
            role: message.role.as_str(),
            content: message.content.as_str(),
            created_at: message.created_at.as_str(),
        })
        .collect();
    let title = if detail.title.trim().is_empty() {
        detail.source_id.as_str()
    } else {
        detail.title.as_str()
    };
    let markdown = render_markdown(title, &rows);

    let output_path = if let Some(target_path) = request
        .target_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
    {
        validate_export_target_path(target_path)?
    } else {
        let output_dir = Path::new(&detail.source_path)
            .parent()
            .map(Path::to_path_buf)
            .filter(|path| path.exists())
            .unwrap_or_else(std::env::temp_dir);
        let title_part = sanitize_filename_component(title, "session", 48);
        let id_part = sanitize_filename_component(&detail.source_id, "id", 48);
        output_dir.join(format!("{title_part}-{id_part}.md"))
    };

    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(&output_path, markdown)?;

    Ok(ExportSessionMarkdownResult { path: output_path })
}

pub fn resolve_target_session_ids(
    conn: &Connection,
    source_tool: &str,
    source_id: &str,
    cascade_subagents: bool,
) -> anyhow::Result<Vec<i64>> {
    let mut stmt = if cascade_subagents {
        conn.prepare(
            "with recursive session_tree(id, source_id) as (
                select id, source_id
                from sessions
                where source_tool=?1 and source_id=?2
              union all
                select child.id, child.source_id
                from sessions child
                inner join session_tree tree
                  on child.source_tool=?1 and child.parent_source_id=tree.source_id
            )
            select distinct id from session_tree
            order by id asc",
        )?
    } else {
        conn.prepare(
            "select id
             from sessions
             where source_tool=?1 and source_id=?2
             order by id asc",
        )?
    };

    let mut rows = stmt.query(params![source_tool, source_id])?;
    let mut ids = Vec::new();
    while let Some(row) = rows.next()? {
        ids.push(row.get(0)?);
    }
    Ok(ids)
}

fn purge_session_rows(conn: &mut Connection, session_ids: &[i64]) -> anyhow::Result<usize> {
    if session_ids.is_empty() {
        return Ok(0);
    }

    let placeholders = vec!["?"; session_ids.len()].join(",");
    let tx = conn.transaction()?;

    tx.execute(
        &format!("delete from artifacts where session_id in ({placeholders})"),
        params_from_iter(session_ids.iter()),
    )?;
    tx.execute(
        &format!("delete from session_tags where session_id in ({placeholders})"),
        params_from_iter(session_ids.iter()),
    )?;
    tx.execute(
        &format!("delete from messages where session_id in ({placeholders})"),
        params_from_iter(session_ids.iter()),
    )?;
    let deleted = tx.execute(
        &format!("delete from sessions where deleted_by_user=1 and id in ({placeholders})"),
        params_from_iter(session_ids.iter()),
    )?;

    tx.commit()?;
    Ok(deleted)
}

fn display_warning_path(raw_path: &str) -> String {
    if raw_path.is_empty() {
        return "(empty)".to_string();
    }

    #[cfg(target_os = "windows")]
    {
        raw_path
            .strip_prefix("\\\\?\\")
            .unwrap_or(raw_path)
            .replace('/', "\\")
    }

    #[cfg(not(target_os = "windows"))]
    {
        raw_path.to_string()
    }
}

fn canonical_delete_key(path: &Path) -> String {
    let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let raw = canonical.to_string_lossy();

    #[cfg(target_os = "windows")]
    {
        raw.strip_prefix("\\\\?\\")
            .unwrap_or(&raw)
            .replace('/', "\\")
            .to_ascii_lowercase()
    }

    #[cfg(not(target_os = "windows"))]
    {
        raw.into_owned()
    }
}

fn sanitize_filename_component(value: &str, fallback: &str, max_len: usize) -> String {
    let mut sanitized = String::new();
    for ch in value.trim().chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            sanitized.push(ch);
        } else {
            sanitized.push('_');
        }
    }

    let compact = sanitized.trim_matches('_').to_string();
    let compact = if compact.is_empty() {
        fallback.to_string()
    } else {
        compact
    };

    compact.chars().take(max_len).collect()
}

fn open_initialized_connection(db_path: &Path) -> anyhow::Result<Connection> {
    crate::db::migrate::init_db(db_path)?;
    Ok(Connection::open(db_path)?)
}
