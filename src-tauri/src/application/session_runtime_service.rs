use std::env;
use std::path::{Component, Path, PathBuf};

use anyhow::Result;

use crate::platform;
use crate::services::collector::resolve_home_codex_dir;

#[derive(Debug, Clone)]
pub struct OpenInExplorerRequest {
    pub path: String,
    pub reveal: bool,
}

#[derive(Debug, Clone)]
pub struct ResumeSessionRequest {
    pub source_tool: String,
    pub source_id: String,
    pub workspace_path: PathBuf,
}

fn normalize_workspace_path(path: &Path) -> String {
    let raw = path.to_string_lossy();

    #[cfg(target_os = "windows")]
    {
        raw.strip_prefix("\\\\?\\")
            .unwrap_or(&raw)
            .replace('/', "\\")
    }

    #[cfg(not(target_os = "windows"))]
    {
        raw.to_string()
    }
}

fn normalize_logical_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                let _ = normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }

    normalized
}

fn logical_absolute_path(path: &Path) -> Option<PathBuf> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        env::current_dir().ok()?.join(path)
    };

    Some(normalize_logical_path(&absolute))
}

pub fn detect_workspace_root_from(start: &Path) -> Option<String> {
    let start_dir = logical_absolute_path(start)?;
    let mut probe = start_dir.clone();
    loop {
        if probe.join(".git").exists() {
            return Some(normalize_workspace_path(&probe));
        }
        let Some(parent) = probe.parent() else {
            return Some(normalize_workspace_path(&start_dir));
        };
        probe = parent.to_path_buf();
    }
}

pub fn detect_runtime_workspace() -> Option<String> {
    let current = env::current_dir().ok()?;
    detect_workspace_root_from(&current)
}

pub fn default_codex_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Some(home) = env::var_os("USERPROFILE") {
            return resolve_home_codex_dir(Path::new(&home));
        }
        if let Some(home) = env::var_os("HOME") {
            return resolve_home_codex_dir(Path::new(&home));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(home) = env::var_os("HOME") {
            return resolve_home_codex_dir(Path::new(&home));
        }
        if let Some(home) = env::var_os("USERPROFILE") {
            return resolve_home_codex_dir(Path::new(&home));
        }
    }

    PathBuf::from(".codex")
}

pub fn open_in_explorer(request: OpenInExplorerRequest) -> Result<()> {
    platform::open_path(&request.path, request.reveal)
}

pub fn open_resume_in_terminal(
    payload: ResumeSessionRequest,
    terminal_preference: Option<String>,
) -> Result<()> {
    platform::resume_in_terminal(
        platform::ResumeTerminalRequest {
            source_tool: payload.source_tool,
            source_id: payload.source_id,
            workspace_path: payload.workspace_path,
        },
        terminal_preference,
    )
}
