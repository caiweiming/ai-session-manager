use std::path::PathBuf;
use std::process::Command;

use anyhow::Result;

use super::{
    shell_command_for_resume, shell_single_quote, validate_terminal_preference,
    PlatformCapabilities, ResumeTerminalRequest, TerminalOption,
};

pub fn capabilities() -> PlatformCapabilities {
    capabilities_with_detector(terminal_candidate_available)
}

#[derive(Debug, Clone, Copy)]
struct TerminalCandidate {
    id: &'static str,
    label: &'static str,
    app_name: &'static str,
    command: Option<&'static str>,
}

fn terminal_candidates() -> &'static [TerminalCandidate] {
    &[
        TerminalCandidate {
            id: "terminal",
            label: "Terminal",
            app_name: "Terminal",
            command: None,
        },
        TerminalCandidate {
            id: "iterm",
            label: "iTerm",
            app_name: "iTerm",
            command: None,
        },
        TerminalCandidate {
            id: "wezterm",
            label: "WezTerm",
            app_name: "WezTerm",
            command: Some("wezterm"),
        },
        TerminalCandidate {
            id: "alacritty",
            label: "Alacritty",
            app_name: "Alacritty",
            command: Some("alacritty"),
        },
        TerminalCandidate {
            id: "kitty",
            label: "Kitty",
            app_name: "kitty",
            command: Some("kitty"),
        },
        TerminalCandidate {
            id: "ghostty",
            label: "Ghostty",
            app_name: "Ghostty",
            command: Some("ghostty"),
        },
    ]
}

fn capabilities_with_detector(
    is_available: impl Fn(&TerminalCandidate) -> bool,
) -> PlatformCapabilities {
    let mut terminal_options = vec![TerminalOption {
        id: "auto".to_string(),
        label: "自动（推荐）".to_string(),
    }];
    terminal_options.extend(
        terminal_candidates()
            .iter()
            .filter(|candidate| is_available(candidate))
            .map(|candidate| TerminalOption {
                id: candidate.id.to_string(),
                label: candidate.label.to_string(),
            }),
    );

    PlatformCapabilities {
        os: "macos".to_string(),
        terminal_options,
        supports_reveal_path: true,
        supports_resume_in_terminal: true,
        reveal_path_degrades_to_open_parent: false,
    }
}

fn terminal_candidate_available(candidate: &TerminalCandidate) -> bool {
    macos_app_exists(candidate.app_name)
        || candidate
            .command
            .is_some_and(|command| command_available(command))
}

fn macos_app_exists(app_name: &str) -> bool {
    let app_bundle = format!("{app_name}.app");
    let mut locations = vec![
        PathBuf::from("/Applications").join(&app_bundle),
        PathBuf::from("/Applications")
            .join("Utilities")
            .join(&app_bundle),
        PathBuf::from("/System")
            .join("Applications")
            .join("Utilities")
            .join(&app_bundle),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        locations.push(PathBuf::from(home).join("Applications").join(&app_bundle));
    }

    locations.iter().any(|path| path.exists())
}

fn command_available(command: &str) -> bool {
    Command::new("sh")
        .args(["-lc", &format!("command -v '{}' >/dev/null 2>&1", command)])
        .status()
        .is_ok_and(|status| status.success())
}

pub fn open_path(path: &str, reveal: bool) -> Result<()> {
    let mut command = Command::new("open");
    if reveal {
        command.arg("-R");
    }
    command.arg(path);
    command.spawn()?;
    Ok(())
}

pub fn resume_in_terminal(
    payload: ResumeTerminalRequest,
    terminal_preference: Option<String>,
) -> Result<()> {
    let ResumeTerminalRequest {
        source_tool,
        source_id,
        workspace_path,
    } = payload;
    let terminal_preference =
        validate_terminal_preference(terminal_preference, &allowed_terminal_preferences())?;
    let shell_command = format!(
        "cd {} && {}",
        shell_single_quote(&workspace_path.to_string_lossy()),
        shell_command_for_resume(&source_tool, &source_id)
    );

    if terminal_preference != "auto" {
        spawn_terminal(
            &terminal_preference,
            &workspace_path.to_string_lossy(),
            &shell_command,
        )?;
        return Ok(());
    }

    let mut last_error = None;
    for candidate in auto_terminal_candidates() {
        match spawn_terminal(candidate, &workspace_path.to_string_lossy(), &shell_command) {
            Ok(()) => return Ok(()),
            Err(err) => last_error = Some(err),
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("no supported terminal launcher available")))
}

fn allowed_terminal_preferences() -> Vec<&'static str> {
    std::iter::once("auto")
        .chain(terminal_candidates().iter().map(|candidate| candidate.id))
        .collect()
}

fn auto_terminal_candidates() -> Vec<&'static str> {
    terminal_candidates()
        .iter()
        .map(|candidate| candidate.id)
        .collect()
}

fn spawn_terminal(terminal: &str, workspace: &str, shell_command: &str) -> Result<()> {
    match terminal {
        "terminal" => spawn_terminal_app(shell_command),
        "iterm" => spawn_iterm(shell_command),
        "wezterm" => {
            Command::new("wezterm")
                .args([
                    "start",
                    "--cwd",
                    workspace,
                    "--",
                    "sh",
                    "-lc",
                    shell_command,
                ])
                .spawn()?;
            Ok(())
        }
        "alacritty" => {
            Command::new("alacritty")
                .args([
                    "--working-directory",
                    workspace,
                    "-e",
                    "sh",
                    "-lc",
                    shell_command,
                ])
                .spawn()?;
            Ok(())
        }
        "kitty" => {
            Command::new("kitty")
                .args(["--directory", workspace, "sh", "-lc", shell_command])
                .spawn()?;
            Ok(())
        }
        "ghostty" => {
            Command::new("ghostty")
                .arg(format!("--working-directory={workspace}"))
                .args(["-e", "sh", "-lc", shell_command])
                .spawn()?;
            Ok(())
        }
        other => Err(anyhow::anyhow!("unsupported terminal preference: {other}")),
    }
}

fn spawn_terminal_app(shell_command: &str) -> Result<()> {
    Command::new("osascript")
        .arg("-e")
        .arg(format!(
            "tell application \"Terminal\" to do script {}",
            apple_script_string(&shell_command)
        ))
        .arg("-e")
        .arg("tell application \"Terminal\" to activate")
        .spawn()?;
    Ok(())
}

fn spawn_iterm(shell_command: &str) -> Result<()> {
    Command::new("osascript")
        .arg("-e")
        .arg(format!(
            "tell application \"iTerm\" to create window with default profile command {}",
            apple_script_string(shell_command)
        ))
        .arg("-e")
        .arg("tell application \"iTerm\" to activate")
        .spawn()?;
    Ok(())
}

fn apple_script_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn candidates_should_include_common_macos_terminals() {
        let ids = terminal_candidates()
            .iter()
            .map(|candidate| candidate.id)
            .collect::<Vec<_>>();

        for expected in [
            "terminal",
            "iterm",
            "wezterm",
            "alacritty",
            "kitty",
            "ghostty",
        ] {
            assert!(
                ids.contains(&expected),
                "missing terminal candidate: {expected}"
            );
        }
    }

    #[test]
    fn capabilities_should_expose_only_detected_macos_terminals() {
        let capabilities = capabilities_with_detector(|candidate| {
            matches!(candidate.id, "terminal" | "iterm" | "wezterm")
        });
        let ids = capabilities
            .terminal_options
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(ids, vec!["auto", "terminal", "iterm", "wezterm"]);
    }

    #[test]
    fn resume_in_terminal_should_reject_invalid_terminal_preference() {
        let err = resume_in_terminal(
            ResumeTerminalRequest {
                source_tool: "codex".to_string(),
                source_id: "session-1".to_string(),
                workspace_path: PathBuf::from("."),
            },
            Some("bogus".to_string()),
        )
        .expect_err("invalid preference should error before spawning");

        assert_eq!(err.to_string(), "unsupported terminal preference: bogus");
    }
}
