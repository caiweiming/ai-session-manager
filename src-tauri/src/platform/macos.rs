use std::path::{Path, PathBuf};
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
    let profile_path = create_terminal_resume_launcher(shell_command)?;
    Command::new("open")
        .args(["-a", "Terminal"])
        .arg(profile_path)
        .spawn()?;
    Ok(())
}

fn create_terminal_resume_launcher(shell_command: &str) -> Result<PathBuf> {
    let base_name = format!(
        "ai-session-resume-{}-{}",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join(format!("{base_name}.command"));
    let profile_path = temp_dir.join(format!("{base_name}.terminal"));

    std::fs::write(
        &script_path,
        terminal_resume_launcher_script(shell_command, &profile_path),
    )?;
    std::fs::write(&profile_path, terminal_resume_profile_plist(&script_path))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&script_path)?.permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&script_path, permissions)?;
    }

    Ok(profile_path)
}

fn terminal_resume_launcher_script(shell_command: &str, profile_path: &Path) -> String {
    format!(
        "#!/bin/sh\nrm -f -- \"$0\" {}\nexec \"${{SHELL:-/bin/sh}}\" -lc {}\n",
        shell_single_quote(&profile_path.to_string_lossy()),
        shell_single_quote(shell_command)
    )
}

fn terminal_resume_profile_plist(script_path: &Path) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CommandString</key>
	<string>{}</string>
	<key>RunCommandAsShell</key>
	<true/>
	<key>name</key>
	<string>AI Session Resume</string>
	<key>type</key>
	<string>Window Settings</string>
</dict>
</plist>
"#,
        xml_escape(&script_path.to_string_lossy())
    )
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn spawn_iterm(shell_command: &str) -> Result<()> {
    let script_path = create_iterm_resume_launcher(shell_command)?;
    Command::new("osascript")
        .arg("-e")
        .arg(iterm_resume_script(&script_path))
        .arg("-e")
        .arg("tell application \"iTerm\" to activate")
        .spawn()?;
    Ok(())
}

fn create_iterm_resume_launcher(shell_command: &str) -> Result<PathBuf> {
    let script_path = std::env::temp_dir().join(format!(
        "ai-session-resume-iterm-{}-{}.command",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    std::fs::write(&script_path, iterm_resume_launcher_script(shell_command))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&script_path)?.permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&script_path, permissions)?;
    }

    Ok(script_path)
}

fn iterm_resume_launcher_script(shell_command: &str) -> String {
    format!(
        "#!/bin/sh\nrm -f -- \"$0\"\nexec \"${{SHELL:-/bin/sh}}\" -lc {}\n",
        shell_single_quote(shell_command)
    )
}

fn iterm_resume_script(script_path: &Path) -> String {
    format!(
        "tell application \"iTerm\" to create window with default profile command {}",
        apple_script_string(&script_path.to_string_lossy())
    )
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

    #[test]
    fn terminal_profile_should_launch_script_as_session_command() {
        let profile =
            terminal_resume_profile_plist(&PathBuf::from("/tmp/ai-session-resume.command"));

        assert!(profile.contains("<key>CommandString</key>"));
        assert!(profile.contains("<string>/tmp/ai-session-resume.command</string>"));
        assert!(profile.contains("<key>RunCommandAsShell</key>\n\t<true/>"));
    }

    #[test]
    fn terminal_launcher_script_should_remove_profile_and_execute_restore_command() {
        let script = terminal_resume_launcher_script(
            "cd '/tmp/work' && codex resume 'session-1'",
            &PathBuf::from("/tmp/ai-session-resume.terminal"),
        );

        assert!(script.starts_with("#!/bin/sh\n"));
        assert!(script.contains("rm -f -- \"$0\" '/tmp/ai-session-resume.terminal'"));
        assert!(script.contains("exec \"${SHELL:-/bin/sh}\" -lc 'cd '\"'\"'/tmp/work'\"'\"' && codex resume '\"'\"'session-1'\"'\"''"));
    }

    #[test]
    fn iterm_script_should_launch_script_as_profile_command() {
        let script = iterm_resume_script(&PathBuf::from("/tmp/ai-session-resume.command"));

        assert!(
            script.contains("create window with default profile command"),
            "iTerm should launch a command instead of feeding stdin to an interactive shell"
        );
        assert!(
            script.contains("\"/tmp/ai-session-resume.command\""),
            "iTerm should launch the temporary restore script"
        );
        assert!(
            !script.contains("write text"),
            "iTerm should not type the restore command into zsh startup stdin"
        );
    }

    #[test]
    fn iterm_launcher_script_should_execute_restore_command() {
        let script = iterm_resume_launcher_script("cd '/tmp/work' && codex resume 'session-1'");

        assert!(script.starts_with("#!/bin/sh\n"));
        assert!(script.contains("rm -f -- \"$0\""));
        assert!(script.contains("exec \"${SHELL:-/bin/sh}\" -lc 'cd '\"'\"'/tmp/work'\"'\"' && codex resume '\"'\"'session-1'\"'\"''"));
    }
}
