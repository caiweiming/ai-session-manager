use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Instant;
use std::time::UNIX_EPOCH;

use rusqlite::{params_from_iter, Connection};
use serde::Serialize;

use crate::application::session_settings_service::ScanSourcesRecord;
use crate::db::migrate::init_db;
use crate::domain::events::SessionEvent;
use crate::parsers::claude::parse_claude_file;
use crate::parsers::claude::parse_claude_file_summary;
use crate::parsers::codex::parse_codex_file;
use crate::parsers::codex::parse_codex_file_summary;
use crate::parsers::gemini::parse_gemini_file;
use crate::parsers::gemini::parse_gemini_file_summary;
use crate::path_identity::path_key;
use crate::time_utils::now_shanghai_string;

use super::collector::{
    collect_claude_inventory_under, collect_codex_files_under, collect_gemini_files_under,
    resolve_home_claude_dir, resolve_home_gemini_dir,
};
use super::indexer::{
    upsert_parsed_session_summary_with_file_meta, upsert_parsed_session_with_file_meta,
};
use super::parser_adapter::{
    adapt_parse_warning, adapt_parsed_session_events, ExistingSessionSnapshot,
};
use super::watcher::{WatchEvent, WatchEventKind};

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FailedFileDetail {
    pub source_tool: String,
    pub source_path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RefreshSummary {
    pub scanned_files: usize,
    pub indexed_sessions: usize,
    pub failed_files: usize,
    pub failed_file_details: Vec<FailedFileDetail>,
    pub claude_project_paths: Vec<String>,
    pub claude_index_entries: usize,
    pub claude_index_missing_files: usize,
    pub claude_index_missing_samples: Vec<String>,
    pub claude_main_files: usize,
    pub claude_subagent_files: usize,
    pub claude_indexed_sessions: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LogLevel {
    Info,
    Warn,
    Error,
}

impl LogLevel {
    fn as_str(self) -> &'static str {
        match self {
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
        }
    }
}

fn build_source_refresh_log_line(
    source_tool: &str,
    summary: &RefreshSummary,
    elapsed_ms: u128,
) -> (LogLevel, String) {
    let attempts = summary.indexed_sessions + summary.failed_files;
    let parse_success_rate = if attempts == 0 {
        100.0
    } else {
        (summary.indexed_sessions as f64 / attempts as f64) * 100.0
    };
    let elapsed_seconds = (elapsed_ms as f64) / 1000.0;
    let index_throughput_sps = if elapsed_seconds <= f64::EPSILON {
        summary.indexed_sessions as f64
    } else {
        summary.indexed_sessions as f64 / elapsed_seconds
    };
    let level = if summary.failed_files > 0 || summary.claude_index_missing_files > 0 {
        LogLevel::Warn
    } else {
        LogLevel::Info
    };

    let mut line = format!(
        "sync.source tool={source_tool} scanned_files={} indexed_sessions={} failed_files={} elapsed_ms={} parse_success_rate={parse_success_rate:.2} index_throughput_sps={index_throughput_sps:.2}",
        summary.scanned_files, summary.indexed_sessions, summary.failed_files, elapsed_ms
    );

    if source_tool == "claude" {
        line.push_str(&format!(
            " claude_index_entries={} claude_index_missing_files={} claude_main_files={} claude_subagent_files={} claude_indexed_sessions={}",
            summary.claude_index_entries,
            summary.claude_index_missing_files,
            summary.claude_main_files,
            summary.claude_subagent_files,
            summary.claude_indexed_sessions
        ));
    }

    (level, line)
}

fn emit_refresh_log(level: LogLevel, line: &str) {
    eprintln!("[{}] {line}", level.as_str());
}

fn refresh_source_with_observability(
    source_tool: &str,
    refresh: impl FnOnce() -> anyhow::Result<RefreshSummary>,
) -> RefreshSummary {
    let started_at = Instant::now();
    match refresh() {
        Ok(summary) => {
            let (level, line) = build_source_refresh_log_line(
                source_tool,
                &summary,
                started_at.elapsed().as_millis(),
            );
            emit_refresh_log(level, &line);
            summary
        }
        Err(err) => {
            emit_refresh_log(
                LogLevel::Error,
                &format!(
                    "sync.source tool={source_tool} scanned_files=0 indexed_sessions=0 failed_files=1 elapsed_ms={} error={}",
                    started_at.elapsed().as_millis(),
                    err
                ),
            );
            RefreshSummary {
                failed_files: 1,
                failed_file_details: vec![FailedFileDetail {
                    source_tool: source_tool.to_string(),
                    source_path: String::new(),
                    message: err.to_string(),
                }],
                ..RefreshSummary::default()
            }
        }
    }
}

fn aggregate_refresh_summaries(
    codex: RefreshSummary,
    claude: RefreshSummary,
    gemini: RefreshSummary,
) -> RefreshSummary {
    RefreshSummary {
        scanned_files: codex.scanned_files + claude.scanned_files + gemini.scanned_files,
        indexed_sessions: codex.indexed_sessions
            + claude.indexed_sessions
            + gemini.indexed_sessions,
        failed_files: codex.failed_files + claude.failed_files + gemini.failed_files,
        failed_file_details: codex
            .failed_file_details
            .into_iter()
            .chain(claude.failed_file_details)
            .chain(gemini.failed_file_details)
            .collect(),
        claude_project_paths: claude.claude_project_paths,
        claude_index_entries: claude.claude_index_entries,
        claude_index_missing_files: claude.claude_index_missing_files,
        claude_index_missing_samples: claude.claude_index_missing_samples,
        claude_main_files: claude.claude_main_files,
        claude_subagent_files: claude.claude_subagent_files,
        claude_indexed_sessions: claude.claude_indexed_sessions,
    }
}

#[derive(Debug, Clone)]
struct SourceFileMeta {
    size: i64,
    mtime: i64,
}

#[derive(Debug, Clone)]
struct StoredSyncMeta {
    title: String,
    source_file_size: i64,
    source_file_mtime: i64,
    message_count: i64,
    deleted_by_user: bool,
    deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WatchSyncResult {
    pub processed_files: usize,
    pub indexed_sessions: usize,
    pub failed_files: usize,
    pub removed_sessions: usize,
    pub emitted_events: Vec<SessionEvent>,
}

fn is_instruction_like_stored_title(title: &str) -> bool {
    let lower = title.to_ascii_lowercase();
    lower.contains("<permissions instructions>")
        || lower.contains("filesystem sandboxing")
        || lower.starts_with("# agents.md instructions")
}

fn mark_removed_sessions(
    conn: &Connection,
    source_tool: &str,
    files: &[PathBuf],
) -> anyhow::Result<()> {
    if files.is_empty() {
        let deleted_at = now_shanghai_string();
        conn.execute(
            "update sessions
             set deleted_at=?1
             where source_tool=?2 and deleted_at is null",
            rusqlite::params![deleted_at, source_tool],
        )?;
    } else {
        let deleted_at = now_shanghai_string();
        let placeholders = vec!["?"; files.len()].join(",");
        let sql = format!(
            "update sessions
             set deleted_at=?1
             where source_tool=?2
               and deleted_by_user=0
               and deleted_at is null
               and source_path_key not in ({placeholders})"
        );
        let current_paths: Vec<String> = files
            .iter()
            .map(|path| path_key(&path.to_string_lossy()))
            .collect();
        let mut sql_params: Vec<String> = Vec::with_capacity(current_paths.len() + 2);
        sql_params.push(deleted_at.clone());
        sql_params.push(source_tool.to_string());
        sql_params.extend(current_paths);
        conn.execute(&sql, params_from_iter(sql_params.iter()))?;
    }

    let has_messages_table: i64 = conn.query_row(
        "select count(*) from sqlite_master where type='table' and name='messages'",
        [],
        |row| row.get(0),
    )?;
    if has_messages_table > 0 {
        conn.execute(
            "delete from messages
             where session_id in (
               select id from sessions
               where source_tool=?1
                 and deleted_at is not null
                 and deleted_by_user=0
             )",
            rusqlite::params![source_tool],
        )?;
    }
    Ok(())
}

fn read_source_file_meta(path: &Path) -> anyhow::Result<SourceFileMeta> {
    let metadata = std::fs::metadata(path)?;
    let modified = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();

    Ok(SourceFileMeta {
        size: metadata.len() as i64,
        mtime: modified.as_secs() as i64,
    })
}

fn load_existing_sync_meta(
    conn: &Connection,
    source_tool: &str,
) -> anyhow::Result<HashMap<String, StoredSyncMeta>> {
    let mut stmt = conn.prepare(
        "select source_path_key, title, source_file_size, source_file_mtime, message_count, deleted_by_user, deleted_at
         from sessions
         where source_tool=?1",
    )?;

    let mut rows = stmt.query([source_tool])?;
    let mut map = HashMap::new();
    while let Some(row) = rows.next()? {
        let source_path_key: String = row.get(0)?;
        map.insert(
            source_path_key,
            StoredSyncMeta {
                title: row.get(1)?,
                source_file_size: row.get(2)?,
                source_file_mtime: row.get(3)?,
                message_count: row.get(4)?,
                deleted_by_user: row.get::<_, i64>(5)? != 0,
                deleted_at: row.get(6)?,
            },
        );
    }
    Ok(map)
}

fn build_existing_session_snapshot(meta: &StoredSyncMeta) -> ExistingSessionSnapshot {
    ExistingSessionSnapshot {
        title: meta.title.clone(),
        message_count: meta.message_count.max(0) as usize,
        deleted_by_user: meta.deleted_by_user,
        deleted_at: meta.deleted_at.clone(),
    }
}

fn refresh_sessions_for_tool(
    db_path: &Path,
    source_tool: &str,
    files: Vec<PathBuf>,
    parse_summary: fn(&Path) -> anyhow::Result<crate::parsers::ParsedSession>,
) -> anyhow::Result<RefreshSummary> {
    init_db(db_path)?;
    let mut conn = Connection::open(db_path)?;
    let existing_meta = load_existing_sync_meta(&conn, source_tool)?;
    let mut failed_samples: Vec<String> = Vec::new();

    let mut summary = RefreshSummary {
        scanned_files: files.len(),
        ..RefreshSummary::default()
    };

    for file in &files {
        let path_key = path_key(&file.to_string_lossy());
        let file_meta = read_source_file_meta(file);
        if let Ok(meta) = &file_meta {
            if let Some(stored) = existing_meta.get(&path_key) {
                let is_same_size = stored.source_file_size == meta.size;
                let is_same_mtime = stored.source_file_mtime == meta.mtime;
                let is_active = stored.deleted_at.as_deref().is_none();
                let is_user_deleted = stored.deleted_by_user;
                let title_needs_rebuild = is_instruction_like_stored_title(&stored.title);
                if is_same_size
                    && is_same_mtime
                    && (is_active || is_user_deleted)
                    && !title_needs_rebuild
                {
                    summary.indexed_sessions += 1;
                    continue;
                }
            }
        }

        let result = match file_meta {
            Ok(meta) => parse_summary(file).and_then(|parsed| {
                upsert_parsed_session_summary_with_file_meta(
                    &mut conn, &parsed, meta.size, meta.mtime,
                )
            }),
            Err(err) => Err(err),
        };
        match result {
            Ok(_) => summary.indexed_sessions += 1,
            Err(err) => {
                summary.failed_files += 1;
                summary.failed_file_details.push(FailedFileDetail {
                    source_tool: source_tool.to_string(),
                    source_path: file.display().to_string(),
                    message: err.to_string(),
                });
                if failed_samples.len() < 3 {
                    failed_samples.push(format!("{} ({})", file.display(), err));
                }
            }
        }
    }

    if summary.failed_files > 0 {
        emit_refresh_log(
            LogLevel::Warn,
            &format!(
                "sync.parse_warning tool={source_tool} failed_files={} samples={}",
                summary.failed_files,
                failed_samples.join(" | ")
            ),
        );
    }

    mark_removed_sessions(&conn, source_tool, &files)?;
    Ok(summary)
}

fn parse_file_for_tool(
    source_tool: &str,
    path: &Path,
) -> anyhow::Result<crate::parsers::ParsedSession> {
    match source_tool {
        "codex" => parse_codex_file(path),
        "claude" => parse_claude_file(path),
        "gemini" => parse_gemini_file(path),
        other => Err(anyhow::anyhow!("unsupported source tool: {other}")),
    }
}

fn soft_delete_session_by_path(
    conn: &Connection,
    source_tool: &str,
    source_path_key: &str,
) -> anyhow::Result<usize> {
    let deleted_at = now_shanghai_string();
    let updated = conn.execute(
        "update sessions
         set deleted_at=?1
         where source_tool=?2
           and source_path_key=?3
           and deleted_by_user=0
           and deleted_at is null",
        rusqlite::params![deleted_at, source_tool, source_path_key],
    )?;

    if updated > 0 {
        let has_messages_table: i64 = conn.query_row(
            "select count(*) from sqlite_master where type='table' and name='messages'",
            [],
            |row| row.get(0),
        )?;
        if has_messages_table > 0 {
            conn.execute(
                "delete from messages
                 where session_id in (
                   select id from sessions
                   where source_tool=?1
                     and source_path_key=?2
                     and deleted_at is not null
                     and deleted_by_user=0
                 )",
                rusqlite::params![source_tool, source_path_key],
            )?;
        }
    }

    Ok(updated)
}

pub fn sync_watcher_events(
    db_path: &Path,
    events: &[WatchEvent],
) -> anyhow::Result<WatchSyncResult> {
    init_db(db_path)?;
    let mut conn = Connection::open(db_path)?;
    let existing_meta_by_tool = {
        let mut by_tool = HashMap::new();
        for tool in ["codex", "claude", "gemini"] {
            by_tool.insert(tool.to_string(), load_existing_sync_meta(&conn, tool)?);
        }
        by_tool
    };

    let mut result = WatchSyncResult::default();

    for event in events {
        match event.kind {
            WatchEventKind::Upsert => {
                result.processed_files += 1;
                let file_meta = match read_source_file_meta(&event.path) {
                    Ok(value) => value,
                    Err(err) => {
                        result.failed_files += 1;
                        result.emitted_events.push(adapt_parse_warning(
                            &event.source_tool,
                            &event.path.to_string_lossy(),
                            &err.to_string(),
                        ));
                        continue;
                    }
                };

                let parsed = match parse_file_for_tool(&event.source_tool, &event.path) {
                    Ok(value) => value,
                    Err(err) => {
                        result.failed_files += 1;
                        result.emitted_events.push(adapt_parse_warning(
                            &event.source_tool,
                            &event.path.to_string_lossy(),
                            &err.to_string(),
                        ));
                        continue;
                    }
                };

                let source_path_key = path_key(&parsed.source_path);
                let existing_snapshot = existing_meta_by_tool
                    .get(&event.source_tool)
                    .and_then(|map| map.get(&source_path_key))
                    .map(build_existing_session_snapshot);
                let emitted = adapt_parsed_session_events(existing_snapshot.as_ref(), &parsed);

                upsert_parsed_session_with_file_meta(
                    &mut conn,
                    &parsed,
                    file_meta.size,
                    file_meta.mtime,
                )?;

                result.indexed_sessions += 1;
                result.emitted_events.extend(emitted);
            }
            WatchEventKind::Remove => {
                let source_path_key = path_key(&event.path.to_string_lossy());
                let removed =
                    soft_delete_session_by_path(&conn, &event.source_tool, &source_path_key)?;
                result.removed_sessions += removed;
            }
        }
    }

    Ok(result)
}

pub fn refresh_codex_sessions(db_path: &Path, codex_dir: &Path) -> anyhow::Result<RefreshSummary> {
    let files = collect_codex_files_under(codex_dir)?;
    refresh_sessions_for_tool(db_path, "codex", files, parse_codex_file_summary)
}

pub fn refresh_claude_sessions(
    db_path: &Path,
    claude_dir: &Path,
) -> anyhow::Result<RefreshSummary> {
    let inventory = collect_claude_inventory_under(claude_dir)?;
    let mut summary = refresh_sessions_for_tool(
        db_path,
        "claude",
        inventory.files.clone(),
        parse_claude_file_summary,
    )?;

    summary.claude_index_entries = inventory.index_entries;
    summary.claude_index_missing_files = inventory.index_missing_files;
    summary.claude_index_missing_samples = inventory.index_missing_samples.clone();
    summary.claude_project_paths = inventory.project_paths.clone();
    summary.claude_main_files = inventory.main_files;
    summary.claude_subagent_files = inventory.subagent_files;
    summary.claude_indexed_sessions = summary.indexed_sessions;

    Ok(summary)
}

pub fn refresh_gemini_sessions(
    db_path: &Path,
    gemini_dir: &Path,
) -> anyhow::Result<RefreshSummary> {
    let files = collect_gemini_files_under(gemini_dir)?;
    refresh_sessions_for_tool(db_path, "gemini", files, parse_gemini_file_summary)
}

pub fn refresh_home_sessions_with_sources(
    db_path: &Path,
    codex_dir: &Path,
    scan_sources: &ScanSourcesRecord,
) -> anyhow::Result<RefreshSummary> {
    let home_dir = codex_dir.parent().unwrap_or_else(|| Path::new("."));
    let claude_dir = resolve_home_claude_dir(home_dir);
    let gemini_dir = resolve_home_gemini_dir(home_dir);

    let codex = if scan_sources.codex {
        refresh_source_with_observability("codex", || refresh_codex_sessions(db_path, codex_dir))
    } else {
        RefreshSummary::default()
    };
    let claude = if scan_sources.claude {
        refresh_source_with_observability("claude", || {
            refresh_claude_sessions(db_path, &claude_dir)
        })
    } else {
        RefreshSummary::default()
    };
    let gemini = if scan_sources.gemini {
        refresh_source_with_observability("gemini", || {
            refresh_gemini_sessions(db_path, &gemini_dir)
        })
    } else {
        RefreshSummary::default()
    };

    Ok(aggregate_refresh_summaries(codex, claude, gemini))
}

pub fn refresh_home_sessions(db_path: &Path, codex_dir: &Path) -> anyhow::Result<RefreshSummary> {
    refresh_home_sessions_with_sources(db_path, codex_dir, &ScanSourcesRecord::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_source_refresh_log_line_should_include_metrics_and_warn_level_for_failures() {
        let summary = RefreshSummary {
            scanned_files: 4,
            indexed_sessions: 3,
            failed_files: 1,
            ..RefreshSummary::default()
        };

        let (level, line) = build_source_refresh_log_line("codex", &summary, 2_000);

        assert_eq!(level, LogLevel::Warn);
        assert!(line.contains("tool=codex"));
        assert!(line.contains("elapsed_ms=2000"));
        assert!(line.contains("parse_success_rate=75.00"));
        assert!(line.contains("index_throughput_sps=1.50"));
    }

    #[test]
    fn refresh_source_with_observability_should_convert_source_error_into_failed_summary() {
        let summary = refresh_source_with_observability("claude", || {
            Err(anyhow::anyhow!("permission denied"))
        });

        assert_eq!(summary.scanned_files, 0);
        assert_eq!(summary.indexed_sessions, 0);
        assert_eq!(summary.failed_files, 1);
    }

    #[test]
    fn aggregate_refresh_summaries_should_keep_successful_sources_when_one_source_errors() {
        let codex = RefreshSummary {
            scanned_files: 2,
            indexed_sessions: 2,
            failed_files: 0,
            ..RefreshSummary::default()
        };
        let claude = RefreshSummary {
            scanned_files: 0,
            indexed_sessions: 0,
            failed_files: 1,
            ..RefreshSummary::default()
        };
        let gemini = RefreshSummary {
            scanned_files: 3,
            indexed_sessions: 2,
            failed_files: 1,
            ..RefreshSummary::default()
        };

        let merged = aggregate_refresh_summaries(codex, claude, gemini);

        assert_eq!(merged.scanned_files, 5);
        assert_eq!(merged.indexed_sessions, 4);
        assert_eq!(merged.failed_files, 2);
    }
}
