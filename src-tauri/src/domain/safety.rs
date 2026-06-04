use anyhow::{anyhow, bail, Context};
use std::path::PathBuf;

pub const MAX_PAGE_SIZE: i64 = 500;
pub const MAX_KEYWORD_CHARS: usize = 200;
pub const MIN_MESSAGE_LIMIT: i64 = 20;
pub const MAX_MESSAGE_LIMIT: i64 = 5000;
pub const MAX_UPDATED_WITHIN_DAYS: i64 = 3650;

pub fn normalize_page(page: i64) -> i64 {
    page.max(1)
}

pub fn normalize_page_size(page_size: i64) -> i64 {
    page_size.clamp(1, MAX_PAGE_SIZE)
}

pub fn normalize_keyword(keyword: Option<&str>) -> Option<String> {
    let trimmed = keyword?.trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(trimmed.chars().take(MAX_KEYWORD_CHARS).collect())
}

pub fn normalize_message_limit(limit: Option<i64>) -> Option<i64> {
    limit
        .filter(|value| *value > 0)
        .map(|value| value.clamp(MIN_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT))
}

pub fn normalize_updated_within_days(days: Option<i64>) -> Option<i64> {
    days.map(|value| value.clamp(0, MAX_UPDATED_WITHIN_DAYS))
}

pub fn validate_resume_source_id(source_id: &str) -> anyhow::Result<String> {
    if source_id.is_empty() {
        bail!("invalid source_id: empty");
    }

    if !source_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | ':' | '.'))
    {
        bail!("invalid source_id");
    }

    Ok(source_id.to_string())
}

pub fn validate_resume_workspace_path(raw_path: &str) -> anyhow::Result<PathBuf> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        bail!("invalid workspace_path: empty");
    }

    let path = PathBuf::from(trimmed);
    let metadata = std::fs::metadata(&path)
        .with_context(|| format!("failed to read metadata for {}", path.display()))?;
    if !metadata.is_dir() {
        bail!("workspace_path is not a directory: {}", path.display());
    }

    Ok(path)
}

pub fn validate_deletable_source_path(raw_path: &str) -> anyhow::Result<PathBuf> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        bail!("source path is empty");
    }

    let path = PathBuf::from(trimmed);
    let metadata = std::fs::metadata(&path)
        .with_context(|| format!("failed to read metadata for {}", path.display()))?;
    if metadata.is_dir() {
        return Err(anyhow!("source path is a directory, refused to delete"));
    }

    Ok(path)
}
