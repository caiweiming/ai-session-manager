use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::Duration;

use notify::event::{ModifyKind, RenameMode};
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::application::session_settings_service::ScanSourcesRecord;

use super::collector::{
    is_supported_codex_file, resolve_claude_scan_root, resolve_codex_scan_root,
    resolve_gemini_scan_root, resolve_home_claude_dir, resolve_home_gemini_dir,
};
use super::sync_service::sync_watcher_events;

pub fn debounce_events(events: &[&str], _window: Duration) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for e in events {
        if out.last().map(|x| x == e).unwrap_or(false) {
            continue;
        }
        out.push((*e).to_string());
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatchEventKind {
    Upsert,
    Remove,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchEvent {
    pub source_tool: String,
    pub path: PathBuf,
    pub kind: WatchEventKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchRoot {
    pub source_tool: String,
    pub root_path: PathBuf,
}

pub fn coalesce_watch_events(events: &[WatchEvent]) -> Vec<WatchEvent> {
    let mut merged = Vec::new();
    let mut indexes: HashMap<(String, PathBuf), usize> = HashMap::new();

    for event in events {
        let key = (event.source_tool.clone(), event.path.clone());
        if let Some(index) = indexes.get(&key).copied() {
            merged[index] = event.clone();
            continue;
        }

        indexes.insert(key, merged.len());
        merged.push(event.clone());
    }

    merged
}

pub fn build_default_watch_roots(
    home_dir: &Path,
    codex_dir: &Path,
    scan_sources: &ScanSourcesRecord,
) -> Vec<WatchRoot> {
    let candidates = [
        ("codex", resolve_codex_scan_root(codex_dir)),
        (
            "claude",
            resolve_claude_scan_root(&resolve_home_claude_dir(home_dir)),
        ),
        (
            "gemini",
            resolve_gemini_scan_root(&resolve_home_gemini_dir(home_dir)),
        ),
    ];

    let mut roots = Vec::new();
    for (source_tool, root_path) in candidates {
        let enabled = match source_tool {
            "codex" => scan_sources.codex,
            "claude" => scan_sources.claude,
            "gemini" => scan_sources.gemini,
            _ => false,
        };
        if !enabled {
            continue;
        }
        if root_path.is_dir() {
            roots.push(WatchRoot {
                source_tool: source_tool.to_string(),
                root_path,
            });
        }
    }
    roots
}

pub fn start_default_watcher(
    db_path: PathBuf,
    home_dir: PathBuf,
    codex_dir: PathBuf,
    scan_sources: ScanSourcesRecord,
    debounce_window: Duration,
) -> anyhow::Result<()> {
    let roots = build_default_watch_roots(&home_dir, &codex_dir, &scan_sources);
    if roots.is_empty() {
        return Ok(());
    }

    thread::spawn(move || {
        if let Err(err) = run_default_watcher_loop(db_path, roots, debounce_window) {
            eprintln!("[warn] watcher.loop error={err}");
        }
    });

    Ok(())
}

fn run_default_watcher_loop(
    db_path: PathBuf,
    roots: Vec<WatchRoot>,
    debounce_window: Duration,
) -> anyhow::Result<()> {
    let (tx, rx) = mpsc::channel();
    let mut watcher = RecommendedWatcher::new(
        move |result| {
            let _ = tx.send(result);
        },
        Config::default(),
    )?;

    for root in &roots {
        watcher.watch(&root.root_path, RecursiveMode::Recursive)?;
    }

    loop {
        let mut batch = Vec::new();
        let first = match rx.recv() {
            Ok(value) => value,
            Err(_) => break,
        };
        batch.push(first);

        loop {
            match rx.recv_timeout(debounce_window) {
                Ok(value) => batch.push(value),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return Ok(()),
            }
        }

        let mut mapped = Vec::new();
        for item in batch {
            match item {
                Ok(event) => mapped.extend(map_notify_event(&roots, &event)),
                Err(err) => eprintln!("[warn] watcher.event error={err}"),
            }
        }

        let merged = coalesce_watch_events(&mapped);
        if merged.is_empty() {
            continue;
        }

        if let Err(err) = sync_watcher_events(&db_path, &merged) {
            eprintln!("[warn] watcher.sync error={err}");
        }
    }

    Ok(())
}

pub fn map_notify_event(roots: &[WatchRoot], event: &Event) -> Vec<WatchEvent> {
    match &event.kind {
        EventKind::Create(_)
        | EventKind::Modify(ModifyKind::Data(_))
        | EventKind::Modify(ModifyKind::Metadata(_))
        | EventKind::Modify(ModifyKind::Any) => event
            .paths
            .iter()
            .filter_map(|path| {
                match_rooted_session_path(roots, path).map(|(source_tool, path)| WatchEvent {
                    source_tool,
                    path,
                    kind: WatchEventKind::Upsert,
                })
            })
            .collect(),
        EventKind::Remove(_) => event
            .paths
            .iter()
            .filter_map(|path| {
                match_rooted_session_path(roots, path).map(|(source_tool, path)| WatchEvent {
                    source_tool,
                    path,
                    kind: WatchEventKind::Remove,
                })
            })
            .collect(),
        EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
            if event.paths.len() < 2 {
                return Vec::new();
            }

            let mut mapped = Vec::new();
            if let Some((source_tool, path)) = match_rooted_session_path(roots, &event.paths[0]) {
                mapped.push(WatchEvent {
                    source_tool,
                    path,
                    kind: WatchEventKind::Remove,
                });
            }
            if let Some((source_tool, path)) = match_rooted_session_path(roots, &event.paths[1]) {
                mapped.push(WatchEvent {
                    source_tool,
                    path,
                    kind: WatchEventKind::Upsert,
                });
            }
            mapped
        }
        _ => Vec::new(),
    }
}

fn match_rooted_session_path(
    roots: &[WatchRoot],
    path: &std::path::Path,
) -> Option<(String, PathBuf)> {
    let candidate = path.to_path_buf();

    for root in roots {
        if !candidate.starts_with(&root.root_path) {
            continue;
        }
        if !is_supported_session_file(&root.source_tool, &root.root_path, &candidate) {
            continue;
        }
        return Some((root.source_tool.clone(), candidate));
    }

    None
}

fn is_supported_session_file(
    source_tool: &str,
    root_path: &std::path::Path,
    path: &std::path::Path,
) -> bool {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    match source_tool {
        "codex" => {
            let root_fallback = root_path
                .file_name()
                .and_then(|value| value.to_str())
                .map(|value| !value.eq_ignore_ascii_case("sessions"))
                .unwrap_or(true);
            is_supported_codex_file(path, root_fallback) && path.starts_with(root_path)
        }
        "claude" => ext == "jsonl" && !file_name.eq_ignore_ascii_case("sessions-index.json"),
        "gemini" => {
            matches!(ext.as_str(), "json" | "jsonl")
                && file_name.to_ascii_lowercase().starts_with("session-")
                && path
                    .parent()
                    .and_then(|parent| parent.file_name())
                    .and_then(|value| value.to_str())
                    .map(|value| value.eq_ignore_ascii_case("chats"))
                    .unwrap_or(false)
        }
        _ => false,
    }
}
