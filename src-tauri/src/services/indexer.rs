use rusqlite::{params, Connection};

use crate::parsers::ParsedSession;
use crate::path_identity::{display_path, path_key};
use crate::time_utils::{normalize_to_shanghai, now_shanghai_string, shanghai_time_from_unix};

// Keep the stable call shape used across import paths.
#[allow(clippy::too_many_arguments)]
pub fn upsert_session(
    conn: &Connection,
    tool: &str,
    source_id: &str,
    title: &str,
    source_path: &str,
    workspace_path: &str,
    is_subagent: bool,
    parent_source_id: Option<&str>,
) -> anyhow::Result<()> {
    let source_path_display = display_path(source_path);
    let source_path_key = path_key(source_path);
    let workspace_path_display = display_path(workspace_path);
    let workspace_path_key = path_key(workspace_path);
    let updated_at = now_shanghai_string();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, is_subagent, parent_source_id, updated_at)
         values(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         on conflict(source_tool, source_id) do update set
           title=excluded.title,
           source_path=excluded.source_path,
           source_path_key=excluded.source_path_key,
           workspace_path=excluded.workspace_path,
           workspace_path_key=excluded.workspace_path_key,
           is_subagent=excluded.is_subagent,
           parent_source_id=excluded.parent_source_id,
           updated_at=?10,
           deleted_at=case
             when sessions.deleted_by_user=1 then sessions.deleted_at
             else null
           end,
           deleted_by_user=sessions.deleted_by_user",
        params![
            tool,
            source_id,
            title,
            source_path_display,
            source_path_key,
            workspace_path_display,
            workspace_path_key,
            is_subagent as i64,
            parent_source_id,
            updated_at
        ],
    )?;
    Ok(())
}

pub fn upsert_parsed_session(conn: &mut Connection, parsed: &ParsedSession) -> anyhow::Result<()> {
    upsert_parsed_session_with_file_meta(conn, parsed, 0, 0)
}

pub fn replace_session_messages_with_cache_meta(
    conn: &mut Connection,
    session_id: i64,
    parsed: &ParsedSession,
    cache_source_size: i64,
    cache_source_mtime: i64,
) -> anyhow::Result<()> {
    let tx = conn.transaction()?;

    tx.execute(
        "delete from messages where session_id=?1",
        params![session_id],
    )?;

    for (index, message) in parsed.messages.iter().enumerate() {
        tx.execute(
            "insert into messages(session_id, role, content, seq, created_at)
             values(?1, ?2, ?3, ?4, ?5)",
            params![
                session_id,
                message.role,
                message.content,
                index as i64 + 1,
                normalize_to_shanghai(&message.created_at)
            ],
        )?;
    }

    tx.execute(
        "update sessions
         set message_cache_source_size=?2,
             message_cache_source_mtime=?3,
             message_count=?4
         where id=?1",
        params![
            session_id,
            cache_source_size,
            cache_source_mtime,
            parsed.messages.len() as i64
        ],
    )?;

    tx.commit()?;
    Ok(())
}

pub fn upsert_parsed_session_with_file_meta(
    conn: &mut Connection,
    parsed: &ParsedSession,
    source_file_size: i64,
    source_file_mtime: i64,
) -> anyhow::Result<()> {
    let source_path_display = display_path(&parsed.source_path);
    let source_path_key = path_key(&parsed.source_path);
    let workspace_path_display = display_path(&parsed.workspace_path);
    let workspace_path_key = path_key(&parsed.workspace_path);
    let started_at = normalize_to_shanghai(&parsed.started_at);
    let updated_at = normalize_to_shanghai(&parsed.updated_at);
    let tx = conn.transaction()?;

    tx.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, is_subagent, parent_source_id, started_at, updated_at, source_file_size, source_file_mtime, input_token_count, output_token_count, message_count)
         values(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
         on conflict(source_tool, source_id) do update set
           title=excluded.title,
           source_path=excluded.source_path,
           source_path_key=excluded.source_path_key,
           workspace_path=excluded.workspace_path,
           workspace_path_key=excluded.workspace_path_key,
           is_subagent=excluded.is_subagent,
           parent_source_id=excluded.parent_source_id,
           started_at=case
             when sessions.started_at is null or trim(sessions.started_at)='' then excluded.started_at
             when excluded.started_at is null or trim(excluded.started_at)='' then sessions.started_at
             when excluded.started_at < sessions.started_at then excluded.started_at
             else sessions.started_at
           end,
           updated_at=excluded.updated_at,
           source_file_size=excluded.source_file_size,
           source_file_mtime=excluded.source_file_mtime,
           message_cache_source_size=excluded.source_file_size,
           message_cache_source_mtime=excluded.source_file_mtime,
           input_token_count=excluded.input_token_count,
           output_token_count=excluded.output_token_count,
           message_count=excluded.message_count,
           deleted_at=case
             when sessions.deleted_by_user=1 then sessions.deleted_at
             else null
           end,
           deleted_by_user=sessions.deleted_by_user",
        params![
            parsed.source_tool,
            parsed.source_id,
            parsed.title,
            source_path_display,
            source_path_key,
            workspace_path_display,
            workspace_path_key,
            parsed.is_subagent as i64,
            parsed.parent_source_id,
            started_at,
            updated_at,
            source_file_size,
            source_file_mtime,
            parsed.input_tokens,
            parsed.output_tokens,
            parsed.messages.len() as i64
        ],
    )?;

    let session_id: i64 = tx.query_row(
        "select id from sessions where source_tool=?1 and source_id=?2",
        params![parsed.source_tool, parsed.source_id],
        |row| row.get(0),
    )?;

    tx.execute(
        "delete from messages where session_id=?1",
        params![session_id],
    )?;

    for (index, message) in parsed.messages.iter().enumerate() {
        tx.execute(
            "insert into messages(session_id, role, content, seq, created_at)
             values(?1, ?2, ?3, ?4, ?5)",
            params![
                session_id,
                message.role,
                message.content,
                index as i64 + 1,
                normalize_to_shanghai(&message.created_at)
            ],
        )?;
    }

    tx.commit()?;
    Ok(())
}

pub fn upsert_parsed_session_summary_with_file_meta(
    conn: &mut Connection,
    parsed: &ParsedSession,
    source_file_size: i64,
    source_file_mtime: i64,
) -> anyhow::Result<()> {
    let source_path_display = display_path(&parsed.source_path);
    let source_path_key = path_key(&parsed.source_path);
    let workspace_path_display = display_path(&parsed.workspace_path);
    let workspace_path_key = path_key(&parsed.workspace_path);
    let started_at = normalize_to_shanghai(&parsed.started_at);
    let updated_at = normalize_to_shanghai(&parsed.updated_at);
    let updated_at_from_mtime = if source_file_mtime > 0 {
        shanghai_time_from_unix(source_file_mtime)
    } else {
        String::new()
    };
    let tx = conn.transaction()?;

    tx.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, is_subagent, parent_source_id, started_at, updated_at, source_file_size, source_file_mtime, input_token_count, output_token_count, message_count)
         values(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
         on conflict(source_tool, source_id) do update set
           title=excluded.title,
           source_path=excluded.source_path,
           source_path_key=excluded.source_path_key,
           workspace_path=excluded.workspace_path,
           workspace_path_key=excluded.workspace_path_key,
           is_subagent=excluded.is_subagent,
           parent_source_id=excluded.parent_source_id,
           started_at=case
             when sessions.started_at is null or trim(sessions.started_at)='' then excluded.started_at
             when excluded.started_at is null or trim(excluded.started_at)='' then sessions.started_at
             when excluded.started_at < sessions.started_at then excluded.started_at
             else sessions.started_at
           end,
           updated_at=case
             when excluded.source_file_mtime > 0 then ?17
             when excluded.updated_at is null or trim(excluded.updated_at)='' then sessions.updated_at
             else excluded.updated_at
           end,
           source_file_size=excluded.source_file_size,
           source_file_mtime=excluded.source_file_mtime,
           message_cache_source_size=case
             when sessions.source_file_size = excluded.source_file_size
              and sessions.source_file_mtime = excluded.source_file_mtime
             then sessions.message_cache_source_size
             else 0
           end,
           message_cache_source_mtime=case
             when sessions.source_file_size = excluded.source_file_size
              and sessions.source_file_mtime = excluded.source_file_mtime
             then sessions.message_cache_source_mtime
             else 0
           end,
           input_token_count=excluded.input_token_count,
           output_token_count=excluded.output_token_count,
           message_count=excluded.message_count,
           deleted_at=case
             when sessions.deleted_by_user=1 then sessions.deleted_at
             else null
           end,
           deleted_by_user=sessions.deleted_by_user",
        params![
            parsed.source_tool,
            parsed.source_id,
            parsed.title,
            source_path_display,
            source_path_key,
            workspace_path_display,
            workspace_path_key,
            parsed.is_subagent as i64,
            parsed.parent_source_id,
            started_at,
            updated_at,
            source_file_size,
            source_file_mtime,
            parsed.input_tokens,
            parsed.output_tokens,
            parsed.message_count as i64,
            updated_at_from_mtime
        ],
    )?;

    tx.commit()?;
    Ok(())
}
