use serde_json::Value;
use std::collections::HashSet;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::path_identity::display_path;

#[derive(Debug, Clone)]
pub struct ScanSource {
    pub tool: String,
    pub path: PathBuf,
}

pub struct Collector;

impl Default for Collector {
    fn default() -> Self {
        Self::new()
    }
}

impl Collector {
    pub fn new() -> Self {
        Self
    }

    pub fn scan_paths(&self, roots: &[PathBuf]) -> anyhow::Result<Vec<ScanSource>> {
        let mut out = Vec::new();
        for root in roots {
            for entry in WalkDir::new(root).into_iter().flatten() {
                let p = entry.path();
                if p.is_file() {
                    let s = p.to_string_lossy();
                    if s.contains("codex") {
                        out.push(ScanSource {
                            tool: "codex".into(),
                            path: p.to_path_buf(),
                        });
                    }
                    if s.contains("claude") {
                        out.push(ScanSource {
                            tool: "claude".into(),
                            path: p.to_path_buf(),
                        });
                    }
                    if s.contains("gemini") {
                        out.push(ScanSource {
                            tool: "gemini".into(),
                            path: p.to_path_buf(),
                        });
                    }
                }
            }
        }
        Ok(out)
    }
}

pub fn resolve_home_codex_dir(home_dir: &Path) -> PathBuf {
    home_dir.join(".codex")
}

pub fn resolve_home_claude_dir(home_dir: &Path) -> PathBuf {
    home_dir.join(".claude")
}

pub fn resolve_home_gemini_dir(home_dir: &Path) -> PathBuf {
    home_dir.join(".gemini")
}

pub fn collect_codex_files_under(root: &Path) -> anyhow::Result<Vec<PathBuf>> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let scan_root = resolve_codex_scan_root(root);
    let root_fallback = scan_root == root;

    let mut files = Vec::new();
    for entry in WalkDir::new(&scan_root).into_iter().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        if is_supported_codex_file(path, root_fallback) {
            files.push(path.to_path_buf());
        }
    }

    files.sort();
    Ok(files)
}

pub fn collect_claude_files_under(root: &Path) -> anyhow::Result<Vec<PathBuf>> {
    Ok(collect_claude_inventory_under(root)?.files)
}

pub fn collect_gemini_files_under(root: &Path) -> anyhow::Result<Vec<PathBuf>> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let tmp_root = resolve_gemini_scan_root(root);
    if !tmp_root.is_dir() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in WalkDir::new(&tmp_root).into_iter().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        if !file_name.to_ascii_lowercase().starts_with("session-") {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|v| v.to_str())
            .map(|v| v.to_ascii_lowercase());
        if !matches!(ext.as_deref(), Some("json" | "jsonl")) {
            continue;
        }

        let Some(chats_dir) = path.parent() else {
            continue;
        };
        if !chats_dir
            .file_name()
            .and_then(|v| v.to_str())
            .map(|v| v.eq_ignore_ascii_case("chats"))
            .unwrap_or(false)
        {
            continue;
        }
        if chats_dir.parent().is_none() {
            continue;
        }

        files.push(path.to_path_buf());
    }

    files.sort();
    Ok(files)
}

pub fn resolve_codex_scan_root(root: &Path) -> PathBuf {
    let sessions_root = root.join("sessions");
    if sessions_root.is_dir() {
        sessions_root
    } else {
        root.to_path_buf()
    }
}

pub fn resolve_claude_scan_root(root: &Path) -> PathBuf {
    root.join("projects")
}

pub fn resolve_gemini_scan_root(root: &Path) -> PathBuf {
    root.join("tmp")
}

pub fn is_supported_codex_file(path: &Path, root_fallback: bool) -> bool {
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .map(|v| v.to_ascii_lowercase());
    if !matches!(ext.as_deref(), Some("json" | "jsonl")) {
        return false;
    }

    if !root_fallback {
        return true;
    }

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    !matches!(file_name.as_str(), "history.jsonl")
}

#[derive(Debug, Clone, Default)]
pub struct ClaudeScanInventory {
    pub files: Vec<PathBuf>,
    pub project_paths: Vec<String>,
    pub main_files: usize,
    pub subagent_files: usize,
    pub index_entries: usize,
    pub index_missing_files: usize,
    pub index_missing_samples: Vec<String>,
}

pub fn collect_claude_inventory_under(root: &Path) -> anyhow::Result<ClaudeScanInventory> {
    if !root.exists() {
        return Ok(ClaudeScanInventory::default());
    }

    let projects_root = resolve_claude_scan_root(root);
    if !projects_root.is_dir() {
        return Ok(ClaudeScanInventory::default());
    }

    let mut inventory = ClaudeScanInventory::default();
    let mut discovered_projects = HashSet::new();

    for entry in std::fs::read_dir(&projects_root)? {
        let Ok(dir_entry) = entry else {
            continue;
        };
        let project_dir = dir_entry.path();
        if !project_dir.is_dir() {
            continue;
        }

        if let Some(project_path) = detect_claude_project_path(&project_dir) {
            discovered_projects.insert(project_path);
        }
    }

    for index_file in WalkDir::new(&projects_root).into_iter().flatten() {
        let path = index_file.path();
        if !path.is_file() {
            continue;
        }
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        if !file_name.eq_ignore_ascii_case("sessions-index.json") {
            continue;
        }

        let raw = match std::fs::read_to_string(path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let value: Value = match serde_json::from_str(&raw) {
            Ok(json) => json,
            Err(_) => continue,
        };
        let entries = value["entries"].as_array().cloned().unwrap_or_default();
        for entry in entries {
            if entry["isSidechain"].as_bool().unwrap_or(false) {
                continue;
            }
            let Some(full_path) = entry["fullPath"].as_str() else {
                continue;
            };
            if full_path.trim().is_empty() {
                continue;
            }
            inventory.index_entries += 1;
            if !Path::new(full_path).exists() {
                inventory.index_missing_files += 1;
                if inventory.index_missing_samples.len() < 50 {
                    inventory.index_missing_samples.push(full_path.to_string());
                }
            }
        }
    }

    let mut files = Vec::new();
    for entry in WalkDir::new(&projects_root).into_iter().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        if file_name.eq_ignore_ascii_case("sessions-index.json") {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|v| v.to_str())
            .map(|v| v.to_ascii_lowercase());
        if matches!(ext.as_deref(), Some("jsonl")) {
            let full_text = path.to_string_lossy();
            if full_text.contains("\\subagents\\") || full_text.contains("/subagents/") {
                inventory.subagent_files += 1;
            } else {
                inventory.main_files += 1;
            }
            files.push(path.to_path_buf());
        }
    }

    files.sort();
    inventory.files = files;
    let mut project_paths: Vec<String> = discovered_projects.into_iter().collect();
    project_paths.sort();
    inventory.project_paths = project_paths;
    Ok(inventory)
}

fn detect_claude_project_path(project_dir: &Path) -> Option<String> {
    let index_path = project_dir.join("sessions-index.json");
    if index_path.is_file() {
        if let Ok(raw) = std::fs::read_to_string(&index_path) {
            if let Ok(json) = serde_json::from_str::<Value>(&raw) {
                if let Some(path) = json["originalPath"]
                    .as_str()
                    .map(str::trim)
                    .filter(|v| !v.is_empty())
                {
                    return Some(normalize_windows_path(path));
                }
            }
        }
    }

    let mut main_jsonl_files = Vec::new();
    if let Ok(read_dir) = std::fs::read_dir(project_dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|v| v.to_str())
                .map(|v| v.to_ascii_lowercase());
            if matches!(ext.as_deref(), Some("jsonl")) {
                main_jsonl_files.push(path);
            }
        }
    }
    main_jsonl_files.sort();

    for path in main_jsonl_files {
        if let Some(workspace_path) = detect_workspace_from_jsonl_head(&path) {
            return Some(workspace_path);
        }
    }

    None
}

fn detect_workspace_from_jsonl_head(path: &Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    const MAX_SCAN_LINES: usize = 80;

    for (scanned, line) in reader.lines().enumerate() {
        if scanned >= MAX_SCAN_LINES {
            break;
        }
        let Ok(raw) = line else {
            continue;
        };
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        if let Some(path) = value["cwd"]
            .as_str()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            return Some(normalize_windows_path(path));
        }
        if let Some(path) = value["projectPath"]
            .as_str()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            return Some(normalize_windows_path(path));
        }
    }

    None
}

fn normalize_windows_path(raw: &str) -> String {
    display_path(raw)
}
