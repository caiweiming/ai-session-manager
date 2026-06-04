use rusqlite::{params, Connection};
use std::path::Path;

use crate::path_identity::path_key;
use crate::time_utils::normalize_to_shanghai;

const INIT_SQL: &str = include_str!("../../migrations/0001_init.sql");
const DATETIME_NORMALIZE_USER_VERSION: i64 = 1;
const PATH_NORMALIZE_USER_VERSION: i64 = 2;
const MESSAGE_CACHE_META_USER_VERSION: i64 = 3;
const PATH_IDENTITY_KEYS_USER_VERSION: i64 = 4;
const SESSION_MESSAGE_COUNT_USER_VERSION: i64 = 5;

pub fn init_db(db_path: &Path) -> anyhow::Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch(INIT_SQL)?;
    ensure_sessions_workspace_path_column(&conn)?;
    ensure_sessions_is_subagent_column(&conn)?;
    ensure_sessions_parent_source_id_column(&conn)?;
    ensure_sessions_source_file_meta_columns(&conn)?;
    ensure_sessions_deleted_by_user_column(&conn)?;
    ensure_sessions_message_cache_columns(&conn)?;
    ensure_sessions_message_count_column(&conn)?;
    ensure_settings_terminal_preference_column(&conn)?;
    ensure_settings_scan_source_columns(&conn)?;
    ensure_datetime_columns_use_shanghai(&conn)?;
    ensure_path_columns_use_normalized_drive_letter(&conn)?;
    ensure_sessions_message_cache_meta(&conn)?;
    ensure_sessions_path_identity_keys(&conn)?;
    ensure_sessions_message_count_meta(&conn)?;
    Ok(())
}

fn ensure_settings_terminal_preference_column(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare("pragma table_info(settings)")?;
    let mut rows = stmt.query([])?;
    let mut has_terminal_preference = false;

    while let Some(row) = rows.next()? {
        let col_name: String = row.get(1)?;
        if col_name == "terminal_preference" {
            has_terminal_preference = true;
            break;
        }
    }

    if !has_terminal_preference {
        conn.execute(
            "alter table settings add column terminal_preference text not null default 'auto'",
            [],
        )?;
    }

    Ok(())
}

fn ensure_sessions_workspace_path_column(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare("pragma table_info(sessions)")?;
    let mut rows = stmt.query([])?;
    let mut has_workspace_path = false;

    while let Some(row) = rows.next()? {
        let col_name: String = row.get(1)?;
        if col_name == "workspace_path" {
            has_workspace_path = true;
            break;
        }
    }

    if !has_workspace_path {
        conn.execute(
            "alter table sessions add column workspace_path text not null default ''",
            [],
        )?;
    }

    conn.execute(
        "update sessions
         set workspace_path = source_path
         where workspace_path is null or trim(workspace_path) = ''",
        [],
    )?;
    conn.execute(
        "update sessions
         set workspace_path = substr(workspace_path, 5)
         where workspace_path like '\\\\?\\%'",
        [],
    )?;

    Ok(())
}

fn ensure_sessions_is_subagent_column(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare("pragma table_info(sessions)")?;
    let mut rows = stmt.query([])?;
    let mut has_is_subagent = false;

    while let Some(row) = rows.next()? {
        let col_name: String = row.get(1)?;
        if col_name == "is_subagent" {
            has_is_subagent = true;
            break;
        }
    }

    if !has_is_subagent {
        conn.execute(
            "alter table sessions add column is_subagent integer not null default 0",
            [],
        )?;
    }

    Ok(())
}

fn ensure_sessions_parent_source_id_column(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare("pragma table_info(sessions)")?;
    let mut rows = stmt.query([])?;
    let mut has_parent_source_id = false;

    while let Some(row) = rows.next()? {
        let col_name: String = row.get(1)?;
        if col_name == "parent_source_id" {
            has_parent_source_id = true;
            break;
        }
    }

    if !has_parent_source_id {
        conn.execute("alter table sessions add column parent_source_id text", [])?;
    }

    Ok(())
}

fn ensure_sessions_source_file_meta_columns(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare("pragma table_info(sessions)")?;
    let mut rows = stmt.query([])?;
    let mut has_source_file_size = false;
    let mut has_source_file_mtime = false;
    let mut has_input_token_count = false;
    let mut has_output_token_count = false;

    while let Some(row) = rows.next()? {
        let col_name: String = row.get(1)?;
        if col_name == "source_file_size" {
            has_source_file_size = true;
        }
        if col_name == "source_file_mtime" {
            has_source_file_mtime = true;
        }
        if col_name == "input_token_count" {
            has_input_token_count = true;
        }
        if col_name == "output_token_count" {
            has_output_token_count = true;
        }
    }

    if !has_source_file_size {
        conn.execute(
            "alter table sessions add column source_file_size integer not null default 0",
            [],
        )?;
    }

    if !has_source_file_mtime {
        conn.execute(
            "alter table sessions add column source_file_mtime integer not null default 0",
            [],
        )?;
    }

    if !has_input_token_count {
        conn.execute(
            "alter table sessions add column input_token_count integer not null default 0",
            [],
        )?;
    }

    if !has_output_token_count {
        conn.execute(
            "alter table sessions add column output_token_count integer not null default 0",
            [],
        )?;
    }

    Ok(())
}

fn ensure_sessions_deleted_by_user_column(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare("pragma table_info(sessions)")?;
    let mut rows = stmt.query([])?;
    let mut has_deleted_by_user = false;

    while let Some(row) = rows.next()? {
        let col_name: String = row.get(1)?;
        if col_name == "deleted_by_user" {
            has_deleted_by_user = true;
            break;
        }
    }

    if !has_deleted_by_user {
        conn.execute(
            "alter table sessions add column deleted_by_user integer not null default 0",
            [],
        )?;
    }

    Ok(())
}

fn ensure_sessions_message_cache_columns(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare("pragma table_info(sessions)")?;
    let mut rows = stmt.query([])?;
    let mut has_message_cache_mtime = false;
    let mut has_message_cache_size = false;

    while let Some(row) = rows.next()? {
        let col_name: String = row.get(1)?;
        if col_name == "message_cache_source_mtime" {
            has_message_cache_mtime = true;
        }
        if col_name == "message_cache_source_size" {
            has_message_cache_size = true;
        }
    }

    if !has_message_cache_mtime {
        conn.execute(
            "alter table sessions add column message_cache_source_mtime integer not null default 0",
            [],
        )?;
    }

    if !has_message_cache_size {
        conn.execute(
            "alter table sessions add column message_cache_source_size integer not null default 0",
            [],
        )?;
    }

    Ok(())
}

fn ensure_settings_scan_source_columns(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare("pragma table_info(settings)")?;
    let mut rows = stmt.query([])?;
    let mut has_scan_codex_enabled = false;
    let mut has_scan_claude_enabled = false;
    let mut has_scan_gemini_enabled = false;

    while let Some(row) = rows.next()? {
        let col_name: String = row.get(1)?;
        if col_name == "scan_codex_enabled" {
            has_scan_codex_enabled = true;
        }
        if col_name == "scan_claude_enabled" {
            has_scan_claude_enabled = true;
        }
        if col_name == "scan_gemini_enabled" {
            has_scan_gemini_enabled = true;
        }
    }

    if !has_scan_codex_enabled {
        conn.execute(
            "alter table settings add column scan_codex_enabled integer not null default 1",
            [],
        )?;
    }
    if !has_scan_claude_enabled {
        conn.execute(
            "alter table settings add column scan_claude_enabled integer not null default 1",
            [],
        )?;
    }
    if !has_scan_gemini_enabled {
        conn.execute(
            "alter table settings add column scan_gemini_enabled integer not null default 1",
            [],
        )?;
    }

    Ok(())
}

fn ensure_sessions_message_count_column(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare("pragma table_info(sessions)")?;
    let mut rows = stmt.query([])?;
    let mut has_message_count = false;

    while let Some(row) = rows.next()? {
        let col_name: String = row.get(1)?;
        if col_name == "message_count" {
            has_message_count = true;
            break;
        }
    }

    if !has_message_count {
        conn.execute(
            "alter table sessions add column message_count integer not null default 0",
            [],
        )?;
    }

    Ok(())
}

fn ensure_datetime_columns_use_shanghai(conn: &Connection) -> anyhow::Result<()> {
    let user_version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if user_version >= DATETIME_NORMALIZE_USER_VERSION {
        return Ok(());
    }

    normalize_datetime_column(conn, "sessions", "id", "started_at")?;
    normalize_datetime_column(conn, "sessions", "id", "ended_at")?;
    normalize_datetime_column(conn, "sessions", "id", "updated_at")?;
    normalize_datetime_column(conn, "sessions", "id", "deleted_at")?;
    normalize_datetime_column(conn, "messages", "id", "created_at")?;
    normalize_datetime_column(conn, "workspaces", "id", "last_scanned_at")?;
    normalize_datetime_column(conn, "scan_jobs", "id", "started_at")?;
    normalize_datetime_column(conn, "scan_jobs", "id", "finished_at")?;
    conn.pragma_update(None, "user_version", DATETIME_NORMALIZE_USER_VERSION)?;
    Ok(())
}

fn ensure_path_columns_use_normalized_drive_letter(conn: &Connection) -> anyhow::Result<()> {
    let user_version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if user_version >= PATH_NORMALIZE_USER_VERSION {
        return Ok(());
    }

    conn.execute(
        "update sessions
         set source_path = substr(source_path, 5)
         where source_path like '\\\\?\\%'",
        [],
    )?;
    conn.execute(
        "update sessions
         set workspace_path = substr(workspace_path, 5)
         where workspace_path like '\\\\?\\%'",
        [],
    )?;

    conn.execute(
        "update sessions
         set source_path = upper(substr(source_path, 1, 1)) || substr(source_path, 2)
         where length(source_path) >= 3
           and substr(source_path, 2, 1) = ':'
           and (substr(source_path, 3, 1) = '\\' or substr(source_path, 3, 1) = '/')",
        [],
    )?;
    conn.execute(
        "update sessions
         set workspace_path = upper(substr(workspace_path, 1, 1)) || substr(workspace_path, 2)
         where length(workspace_path) >= 3
           and substr(workspace_path, 2, 1) = ':'
           and (substr(workspace_path, 3, 1) = '\\' or substr(workspace_path, 3, 1) = '/')",
        [],
    )?;

    conn.pragma_update(None, "user_version", PATH_NORMALIZE_USER_VERSION)?;
    Ok(())
}

fn ensure_sessions_message_cache_meta(conn: &Connection) -> anyhow::Result<()> {
    let user_version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if user_version >= MESSAGE_CACHE_META_USER_VERSION {
        return Ok(());
    }

    conn.execute(
        "update sessions
         set message_cache_source_mtime = source_file_mtime,
             message_cache_source_size = source_file_size
         where exists (
           select 1 from messages where messages.session_id = sessions.id
         )",
        [],
    )?;

    conn.pragma_update(None, "user_version", MESSAGE_CACHE_META_USER_VERSION)?;
    Ok(())
}

fn ensure_sessions_path_identity_keys(conn: &Connection) -> anyhow::Result<()> {
    ensure_sessions_path_identity_key_columns(conn)?;

    let user_version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if user_version >= PATH_IDENTITY_KEYS_USER_VERSION {
        return Ok(());
    }

    backfill_sessions_path_identity_keys(conn)?;
    create_sessions_workspace_path_key_index(conn)?;
    conn.pragma_update(None, "user_version", PATH_IDENTITY_KEYS_USER_VERSION)?;
    Ok(())
}

fn ensure_sessions_message_count_meta(conn: &Connection) -> anyhow::Result<()> {
    let user_version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if user_version >= SESSION_MESSAGE_COUNT_USER_VERSION {
        return Ok(());
    }

    conn.execute(
        "update sessions
         set message_count = (
           select count(*) from messages where messages.session_id = sessions.id
         )
         where message_count = 0",
        [],
    )?;

    conn.pragma_update(None, "user_version", SESSION_MESSAGE_COUNT_USER_VERSION)?;
    Ok(())
}

fn ensure_sessions_path_identity_key_columns(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare("pragma table_info(sessions)")?;
    let mut rows = stmt.query([])?;
    let mut has_source_path_key = false;
    let mut has_workspace_path_key = false;

    while let Some(row) = rows.next()? {
        let col_name: String = row.get(1)?;
        if col_name == "source_path_key" {
            has_source_path_key = true;
        }
        if col_name == "workspace_path_key" {
            has_workspace_path_key = true;
        }
    }

    if !has_source_path_key {
        conn.execute(
            "alter table sessions add column source_path_key text not null default ''",
            [],
        )?;
    }

    if !has_workspace_path_key {
        conn.execute(
            "alter table sessions add column workspace_path_key text not null default ''",
            [],
        )?;
    }

    create_sessions_workspace_path_key_index(conn)?;
    Ok(())
}

fn backfill_sessions_path_identity_keys(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare(
        "select id, source_path, workspace_path
         from sessions",
    )?;
    let mut rows = stmt.query([])?;
    let mut updates: Vec<(i64, String, String)> = Vec::new();

    while let Some(row) = rows.next()? {
        let id: i64 = row.get(0)?;
        let source_path: String = row.get(1)?;
        let workspace_path: String = row.get(2)?;
        updates.push((id, path_key(&source_path), path_key(&workspace_path)));
    }

    for (id, source_path_key, workspace_path_key) in updates {
        conn.execute(
            "update sessions
             set source_path_key = ?1,
                 workspace_path_key = ?2
             where id = ?3",
            params![source_path_key, workspace_path_key, id],
        )?;
    }

    Ok(())
}

fn create_sessions_workspace_path_key_index(conn: &Connection) -> anyhow::Result<()> {
    conn.execute(
        "create index if not exists idx_sessions_workspace_path_key on sessions(workspace_path_key)",
        [],
    )?;
    Ok(())
}

fn normalize_datetime_column(
    conn: &Connection,
    table: &str,
    id_column: &str,
    datetime_column: &str,
) -> anyhow::Result<()> {
    let has_table: i64 = conn.query_row(
        "select count(*) from sqlite_master where type='table' and name=?1",
        params![table],
        |row| row.get(0),
    )?;
    if has_table == 0 {
        return Ok(());
    }

    let query_sql = format!(
        "select {id_column}, {datetime_column}
         from {table}
         where {datetime_column} is not null and trim({datetime_column}) <> ''"
    );
    let mut stmt = conn.prepare(&query_sql)?;
    let mut rows = stmt.query([])?;
    let mut updates: Vec<(i64, String)> = Vec::new();

    while let Some(row) = rows.next()? {
        let id: i64 = row.get(0)?;
        let raw: String = row.get(1)?;
        let normalized = normalize_to_shanghai(&raw);
        if normalized != raw {
            updates.push((id, normalized));
        }
    }

    if updates.is_empty() {
        return Ok(());
    }

    let update_sql = format!(
        "update {table}
         set {datetime_column}=?1
         where {id_column}=?2"
    );
    for (id, normalized) in updates {
        conn.execute(&update_sql, params![normalized, id])?;
    }

    Ok(())
}
