use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::migrate::init_db;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanSourcesRecord {
    pub codex: bool,
    pub claude: bool,
    pub gemini: bool,
}

impl Default for ScanSourcesRecord {
    fn default() -> Self {
        Self {
            codex: true,
            claude: true,
            gemini: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppSettingsRecord {
    pub theme_mode: String,
    pub hard_delete: bool,
    pub terminal_preference: String,
    pub scan_sources: ScanSourcesRecord,
}

#[derive(Debug, Clone)]
pub struct UpdateAppSettingsRequest {
    pub theme_mode: Option<String>,
    pub hard_delete: Option<bool>,
    pub terminal_preference: Option<String>,
    pub scan_sources: Option<ScanSourcesRecord>,
}

pub fn load_app_settings(db_path: &Path) -> anyhow::Result<AppSettingsRecord> {
    init_db(db_path)?;
    let conn = Connection::open(db_path)?;
    ensure_settings_row(&conn)
}

pub fn update_app_settings(
    db_path: &Path,
    request: UpdateAppSettingsRequest,
) -> anyhow::Result<AppSettingsRecord> {
    init_db(db_path)?;
    let mut conn = Connection::open(db_path)?;
    let tx = conn.transaction()?;

    let current = ensure_settings_row(&tx)?;
    let next = AppSettingsRecord {
        theme_mode: request.theme_mode.unwrap_or(current.theme_mode),
        hard_delete: request.hard_delete.unwrap_or(current.hard_delete),
        terminal_preference: request
            .terminal_preference
            .unwrap_or(current.terminal_preference),
        scan_sources: request.scan_sources.unwrap_or(current.scan_sources),
    };

    tx.execute(
        "insert into settings(
            id,
            theme_mode,
            hard_delete,
            terminal_preference,
            scan_codex_enabled,
            scan_claude_enabled,
            scan_gemini_enabled
         )
         values(1, ?1, ?2, ?3, ?4, ?5, ?6)
         on conflict(id) do update set
           theme_mode=excluded.theme_mode,
           hard_delete=excluded.hard_delete,
           terminal_preference=excluded.terminal_preference,
           scan_codex_enabled=excluded.scan_codex_enabled,
           scan_claude_enabled=excluded.scan_claude_enabled,
           scan_gemini_enabled=excluded.scan_gemini_enabled",
        params![
            next.theme_mode,
            if next.hard_delete { 1 } else { 0 },
            next.terminal_preference,
            if next.scan_sources.codex { 1 } else { 0 },
            if next.scan_sources.claude { 1 } else { 0 },
            if next.scan_sources.gemini { 1 } else { 0 },
        ],
    )?;

    tx.commit()?;
    Ok(next)
}

fn ensure_settings_row(conn: &Connection) -> anyhow::Result<AppSettingsRecord> {
    let maybe_row = query_settings_row(conn)?;

    if let Some(row) = maybe_row {
        return Ok(row);
    }

    conn.execute(
        "insert into settings(
            id,
            theme_mode,
            hard_delete,
            terminal_preference,
            scan_codex_enabled,
            scan_claude_enabled,
            scan_gemini_enabled
         )
         values(1, 'system', 0, 'auto', 1, 1, 1)
         on conflict(id) do nothing",
        [],
    )?;

    query_settings_row(conn)?
        .ok_or_else(|| anyhow::anyhow!("settings row missing after initialization"))
}

fn query_settings_row(conn: &Connection) -> anyhow::Result<Option<AppSettingsRecord>> {
    conn.query_row(
        "select
            theme_mode,
            hard_delete,
            terminal_preference,
            scan_codex_enabled,
            scan_claude_enabled,
            scan_gemini_enabled
         from settings
         where id=1",
        [],
        |row| {
            Ok(AppSettingsRecord {
                theme_mode: row.get::<_, String>(0)?,
                hard_delete: row.get::<_, i64>(1)? != 0,
                terminal_preference: row.get::<_, String>(2)?,
                scan_sources: ScanSourcesRecord {
                    codex: row.get::<_, i64>(3)? != 0,
                    claude: row.get::<_, i64>(4)? != 0,
                    gemini: row.get::<_, i64>(5)? != 0,
                },
            })
        },
    )
    .optional()
    .map_err(Into::into)
}
