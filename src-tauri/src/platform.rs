use anyhow::Result;
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TerminalOption {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlatformCapabilities {
    pub os: String,
    pub terminal_options: Vec<TerminalOption>,
    pub supports_reveal_path: bool,
    pub supports_resume_in_terminal: bool,
    pub reveal_path_degrades_to_open_parent: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResumeTerminalRequest {
    pub source_tool: String,
    pub source_id: String,
    pub workspace_path: PathBuf,
}

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(any(test, target_os = "macos"))]
pub mod macos;

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
pub mod linux;

pub fn get_platform_capabilities() -> PlatformCapabilities {
    #[cfg(target_os = "windows")]
    {
        return windows::capabilities();
    }

    #[cfg(target_os = "macos")]
    {
        return macos::capabilities();
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return linux::capabilities();
    }
}

pub fn open_path(path: &str, reveal: bool) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        return windows::open_path(path, reveal);
    }

    #[cfg(target_os = "macos")]
    {
        return macos::open_path(path, reveal);
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return linux::open_path(path, reveal);
    }
}

pub fn resume_in_terminal(
    payload: ResumeTerminalRequest,
    terminal_preference: Option<String>,
) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        return windows::resume_in_terminal(payload, terminal_preference);
    }

    #[cfg(target_os = "macos")]
    {
        return macos::resume_in_terminal(payload, terminal_preference);
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return linux::resume_in_terminal(payload, terminal_preference);
    }
}

pub(crate) fn normalize_terminal_preference(terminal_preference: Option<String>) -> String {
    terminal_preference
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("auto")
        .to_ascii_lowercase()
}

pub(crate) fn validate_terminal_preference(
    terminal_preference: Option<String>,
    allowed_values: &[&str],
) -> Result<String> {
    let normalized = normalize_terminal_preference(terminal_preference);
    if allowed_values.iter().any(|value| *value == normalized) {
        return Ok(normalized);
    }

    Err(anyhow::anyhow!(
        "unsupported terminal preference: {}",
        normalized
    ))
}

#[cfg(any(test, not(target_os = "windows")))]
pub(crate) fn shell_command_for_resume(source_tool: &str, source_id: &str) -> String {
    match source_tool {
        "claude" | "gemini" => format!(
            "{} --resume {}",
            shell_single_quote(source_tool),
            shell_single_quote(source_id)
        ),
        _ => format!("codex resume {}", shell_single_quote(source_id)),
    }
}

#[cfg(any(test, not(target_os = "windows")))]
pub(crate) fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

#[cfg(test)]
mod tests {
    use super::validate_terminal_preference;

    #[test]
    fn validate_terminal_preference_should_reject_unknown_value() {
        let err =
            validate_terminal_preference(Some("not-a-terminal".to_string()), &["auto", "cmd"])
                .expect_err("unknown preference should error");

        assert_eq!(
            err.to_string(),
            "unsupported terminal preference: not-a-terminal"
        );
    }

    #[test]
    fn validate_terminal_preference_should_normalize_blank_to_auto() {
        let preference = validate_terminal_preference(Some("   ".to_string()), &["auto"])
            .expect("blank preference should normalize");

        assert_eq!(preference, "auto");
    }
}
