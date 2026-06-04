use std::io::ErrorKind;
use std::process::Command;

use anyhow::{anyhow, Result};

use super::{
    shell_command_for_resume, validate_terminal_preference, PlatformCapabilities,
    ResumeTerminalRequest, TerminalOption,
};

pub fn capabilities() -> PlatformCapabilities {
    capabilities_with_detector(terminal_candidate_available)
}

#[derive(Debug, Clone, Copy)]
struct TerminalCandidate {
    id: &'static str,
    label: &'static str,
}

fn terminal_candidates() -> &'static [TerminalCandidate] {
    &[
        TerminalCandidate {
            id: "xdg-terminal-exec",
            label: "系统终端",
        },
        TerminalCandidate {
            id: "x-terminal-emulator",
            label: "系统终端（兼容）",
        },
        TerminalCandidate {
            id: "gnome-terminal",
            label: "GNOME Terminal",
        },
        TerminalCandidate {
            id: "kgx",
            label: "GNOME Console",
        },
        TerminalCandidate {
            id: "konsole",
            label: "Konsole",
        },
        TerminalCandidate {
            id: "xfce4-terminal",
            label: "Xfce Terminal",
        },
        TerminalCandidate {
            id: "mate-terminal",
            label: "MATE Terminal",
        },
        TerminalCandidate {
            id: "lxterminal",
            label: "LXTerminal",
        },
        TerminalCandidate {
            id: "tilix",
            label: "Tilix",
        },
        TerminalCandidate {
            id: "terminator",
            label: "Terminator",
        },
        TerminalCandidate {
            id: "wezterm",
            label: "WezTerm",
        },
        TerminalCandidate {
            id: "kitty",
            label: "Kitty",
        },
        TerminalCandidate {
            id: "alacritty",
            label: "Alacritty",
        },
        TerminalCandidate {
            id: "ghostty",
            label: "Ghostty",
        },
        TerminalCandidate {
            id: "deepin-terminal",
            label: "Deepin Terminal",
        },
        TerminalCandidate {
            id: "qterminal",
            label: "QTerminal",
        },
        TerminalCandidate {
            id: "foot",
            label: "foot",
        },
        TerminalCandidate {
            id: "st",
            label: "st",
        },
        TerminalCandidate {
            id: "xterm",
            label: "xterm",
        },
        TerminalCandidate {
            id: "urxvt",
            label: "rxvt-unicode",
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
        os: std::env::consts::OS.to_string(),
        terminal_options,
        supports_reveal_path: true,
        supports_resume_in_terminal: true,
        reveal_path_degrades_to_open_parent: true,
    }
}

fn terminal_candidate_available(candidate: &TerminalCandidate) -> bool {
    Command::new("sh")
        .args([
            "-lc",
            &format!("command -v '{}' >/dev/null 2>&1", candidate.id),
        ])
        .status()
        .is_ok_and(|status| status.success())
}

pub fn open_path(path: &str, reveal: bool) -> Result<()> {
    let open_target = if reveal {
        std::path::Path::new(path)
            .parent()
            .map(|parent| parent.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string())
    } else {
        path.to_string()
    };
    Command::new("xdg-open").arg(open_target).spawn()?;
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
    let workspace = workspace_path.to_string_lossy().to_string();
    let shell_command = format!(
        "cd '{}' && {}",
        workspace.replace('\'', "'\"'\"'"),
        shell_command_for_resume(&source_tool, &source_id)
    );

    if terminal_preference != "auto" {
        spawn_terminal(&terminal_preference, &workspace, &shell_command)?;
        return Ok(());
    }

    let candidates = auto_terminal_candidates();
    let mut last_error: Option<anyhow::Error> = None;
    for candidate in candidates {
        match spawn_terminal(candidate, &workspace, &shell_command) {
            Ok(()) => return Ok(()),
            Err(err) => {
                if err
                    .downcast_ref::<std::io::Error>()
                    .is_some_and(|io_err| io_err.kind() == ErrorKind::NotFound)
                {
                    last_error = Some(err);
                    continue;
                }
                last_error = Some(err);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow!("no supported terminal emulator found")))
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
        "xdg-terminal-exec" => {
            Command::new("xdg-terminal-exec")
                .args(["sh", "-lc", shell_command])
                .current_dir(workspace)
                .spawn()?;
        }
        "x-terminal-emulator" => {
            Command::new("x-terminal-emulator")
                .args(["-e", "sh", "-lc", shell_command])
                .current_dir(workspace)
                .spawn()?;
        }
        "gnome-terminal" => {
            Command::new("gnome-terminal")
                .args([
                    "--working-directory",
                    workspace,
                    "--",
                    "sh",
                    "-lc",
                    shell_command,
                ])
                .spawn()?;
        }
        "kgx" => {
            Command::new("kgx")
                .args([
                    "--working-directory",
                    workspace,
                    "--",
                    "sh",
                    "-lc",
                    shell_command,
                ])
                .spawn()?;
        }
        "konsole" => {
            Command::new("konsole")
                .args(["--workdir", workspace, "-e", "sh", "-lc", shell_command])
                .spawn()?;
        }
        "xfce4-terminal" => {
            Command::new("xfce4-terminal")
                .args([
                    "--working-directory",
                    workspace,
                    "--command",
                    &format!("sh -lc '{}'", shell_command.replace('\'', "'\"'\"'")),
                ])
                .spawn()?;
        }
        "mate-terminal" => {
            Command::new("mate-terminal")
                .args([
                    "--working-directory",
                    workspace,
                    "-e",
                    &format!("sh -lc '{}'", shell_command.replace('\'', "'\"'\"'")),
                ])
                .spawn()?;
        }
        "lxterminal" => {
            Command::new("lxterminal")
                .arg(format!("--working-directory={workspace}"))
                .args(["-e", "sh", "-lc", shell_command])
                .spawn()?;
        }
        "tilix" => {
            Command::new("tilix")
                .arg(format!("--working-directory={workspace}"))
                .args(["-e", "sh", "-lc", shell_command])
                .spawn()?;
        }
        "terminator" => {
            Command::new("terminator")
                .arg(format!("--working-directory={workspace}"))
                .args(["-x", "sh", "-lc", shell_command])
                .spawn()?;
        }
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
        }
        "kitty" => {
            Command::new("kitty")
                .args(["--directory", workspace, "sh", "-lc", shell_command])
                .spawn()?;
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
        }
        "ghostty" => {
            Command::new("ghostty")
                .arg(format!("--working-directory={workspace}"))
                .args(["-e", "sh", "-lc", shell_command])
                .spawn()?;
        }
        "deepin-terminal" | "qterminal" | "foot" | "st" | "xterm" | "urxvt" => {
            Command::new(terminal)
                .args(["-e", "sh", "-lc", shell_command])
                .current_dir(workspace)
                .spawn()?;
        }
        other => {
            return Err(anyhow!("unsupported terminal preference: {other}"));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn auto_candidates_should_start_with_xdg_terminal_exec() {
        assert_eq!(
            auto_terminal_candidates().first().copied(),
            Some("xdg-terminal-exec")
        );
    }

    #[test]
    fn auto_candidates_should_include_common_linux_terminals() {
        for expected in [
            "xdg-terminal-exec",
            "x-terminal-emulator",
            "gnome-terminal",
            "kgx",
            "konsole",
            "xfce4-terminal",
            "mate-terminal",
            "lxterminal",
            "tilix",
            "terminator",
            "wezterm",
            "kitty",
            "alacritty",
            "ghostty",
            "deepin-terminal",
            "qterminal",
            "foot",
            "st",
            "xterm",
            "urxvt",
        ] {
            assert!(
                auto_terminal_candidates().contains(&expected),
                "missing terminal candidate: {expected}"
            );
        }
    }

    #[test]
    fn capabilities_should_expose_only_detected_linux_terminals() {
        let capabilities = capabilities_with_detector(|candidate| {
            matches!(
                candidate.id,
                "x-terminal-emulator" | "wezterm" | "kitty" | "xterm"
            )
        });
        let ids = capabilities
            .terminal_options
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            ids,
            vec!["auto", "x-terminal-emulator", "wezterm", "kitty", "xterm"]
        );
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
