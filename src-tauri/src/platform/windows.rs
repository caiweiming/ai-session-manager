use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{anyhow, Result};

use super::{
    validate_terminal_preference, PlatformCapabilities, ResumeTerminalRequest, TerminalOption,
};

pub fn capabilities() -> PlatformCapabilities {
    capabilities_with_detector(terminal_candidate_available)
}

#[derive(Debug, Clone, Copy)]
struct TerminalCandidate {
    id: &'static str,
    label: &'static str,
    commands: &'static [&'static str],
}

fn terminal_candidates() -> &'static [TerminalCandidate] {
    &[
        TerminalCandidate {
            id: "windows_terminal",
            label: "Windows Terminal",
            commands: &["wt.exe"],
        },
        TerminalCandidate {
            id: "pwsh",
            label: "PowerShell 7",
            commands: &["pwsh.exe"],
        },
        TerminalCandidate {
            id: "powershell",
            label: "PowerShell",
            commands: &["powershell.exe"],
        },
        TerminalCandidate {
            id: "cmd",
            label: "cmd",
            commands: &["cmd.exe"],
        },
        TerminalCandidate {
            id: "wezterm",
            label: "WezTerm",
            commands: &["wezterm.exe"],
        },
        TerminalCandidate {
            id: "alacritty",
            label: "Alacritty",
            commands: &["alacritty.exe"],
        },
        TerminalCandidate {
            id: "kitty",
            label: "Kitty",
            commands: &["kitty.exe"],
        },
        TerminalCandidate {
            id: "conemu",
            label: "ConEmu",
            commands: &["ConEmu64.exe", "ConEmu.exe"],
        },
        TerminalCandidate {
            id: "cmder",
            label: "Cmder",
            commands: &["Cmder.exe"],
        },
        TerminalCandidate {
            id: "git_bash",
            label: "Git Bash",
            commands: &["bash.exe"],
        },
        TerminalCandidate {
            id: "msys2",
            label: "MSYS2",
            commands: &["mintty.exe"],
        },
        TerminalCandidate {
            id: "cygwin",
            label: "Cygwin",
            commands: &["mintty.exe"],
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
        os: "windows".to_string(),
        terminal_options,
        supports_reveal_path: true,
        supports_resume_in_terminal: true,
        reveal_path_degrades_to_open_parent: false,
    }
}

fn terminal_candidate_available(candidate: &TerminalCandidate) -> bool {
    if matches!(candidate.id, "msys2" | "cygwin") {
        return common_windows_terminal_paths(candidate.id)
            .iter()
            .any(|path| path.exists());
    }

    candidate.commands.iter().any(|command| {
        command_available(command)
            || common_windows_terminal_paths(candidate.id)
                .iter()
                .any(|path| path.exists())
    })
}

fn command_available(command: &str) -> bool {
    Command::new("where.exe")
        .arg(command)
        .output()
        .is_ok_and(|output| output.status.success())
}

fn common_windows_terminal_paths(candidate_id: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(program_files) = env::var_os("ProgramFiles") {
        let program_files = PathBuf::from(program_files);
        match candidate_id {
            "pwsh" => paths.push(program_files.join("PowerShell").join("7").join("pwsh.exe")),
            "wezterm" => paths.push(program_files.join("WezTerm").join("wezterm.exe")),
            "alacritty" => paths.push(program_files.join("Alacritty").join("alacritty.exe")),
            "kitty" => paths.push(program_files.join("kitty").join("kitty.exe")),
            "conemu" => paths.push(program_files.join("ConEmu").join("ConEmu64.exe")),
            "cmder" => paths.push(program_files.join("Cmder").join("Cmder.exe")),
            "git_bash" => paths.push(program_files.join("Git").join("bin").join("bash.exe")),
            "msys2" => paths.push(PathBuf::from("C:\\msys64\\usr\\bin\\mintty.exe")),
            "cygwin" => paths.push(PathBuf::from("C:\\cygwin64\\bin\\mintty.exe")),
            _ => {}
        }
    }

    paths
}

pub fn open_path(path: &str, reveal: bool) -> Result<()> {
    let sanitized = path.strip_prefix("\\\\?\\").unwrap_or(path);
    let normalized = sanitized.replace('/', "\\");
    let mut command = Command::new("explorer.exe");
    if reveal {
        command.arg("/select,").arg(&normalized);
    } else {
        command.arg(&normalized);
    }
    command.spawn()?;
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TerminalLauncher {
    WindowsTerminal,
    Pwsh,
    PowerShell,
    Cmd,
    WezTerm,
    Alacritty,
    Kitty,
    ConEmu,
    Cmder,
    GitBash,
    Msys2,
    Cygwin,
}

#[cfg(target_os = "windows")]
fn ps_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(target_os = "windows")]
fn cmd_double_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

#[cfg(target_os = "windows")]
fn resolve_cli_path(env_var: &str, npm_binary: &str, where_binary: &str, fallback: &str) -> String {
    if let Ok(explicit) = env::var(env_var) {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() && Path::new(trimmed).exists() {
            return trimmed.to_string();
        }
    }

    if let Some(app_data) = env::var_os("APPDATA") {
        let npm_path = PathBuf::from(app_data).join("npm").join(npm_binary);
        if npm_path.exists() {
            return npm_path.to_string_lossy().to_string();
        }
    }

    if let Ok(output) = Command::new("where.exe").arg(where_binary).output() {
        if output.status.success() {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                if let Some(first) = stdout.lines().map(str::trim).find(|line| !line.is_empty()) {
                    return first.to_string();
                }
            }
        }
    }

    fallback.to_string()
}

#[cfg(target_os = "windows")]
fn resolve_cli_for_tool(source_tool: &str) -> String {
    match source_tool {
        "claude" => resolve_cli_path("CLAUDE_CLI_PATH", "claude.cmd", "claude.cmd", "claude"),
        "gemini" => resolve_cli_path("GEMINI_CLI_PATH", "gemini.cmd", "gemini.cmd", "gemini"),
        _ => resolve_cli_path("CODEX_CLI_PATH", "codex.cmd", "codex.cmd", "codex"),
    }
}

#[cfg(target_os = "windows")]
fn build_powershell_resume_command(source_tool: &str, cli_path: &str, source_id: &str) -> String {
    if source_tool == "claude" || source_tool == "gemini" {
        format!(
            "{} --resume {}",
            ps_single_quote(cli_path),
            ps_single_quote(source_id)
        )
    } else {
        format!(
            "{} resume {}",
            ps_single_quote(cli_path),
            ps_single_quote(source_id)
        )
    }
}

#[cfg(target_os = "windows")]
fn build_cmd_resume_command(source_tool: &str, cli_path: &str, source_id: &str) -> String {
    if source_tool == "claude" || source_tool == "gemini" {
        format!(
            "{} --resume {}",
            cmd_double_quote(cli_path),
            cmd_double_quote(source_id)
        )
    } else {
        format!(
            "{} resume {}",
            cmd_double_quote(cli_path),
            cmd_double_quote(source_id)
        )
    }
}

#[cfg(target_os = "windows")]
fn sh_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

#[cfg(target_os = "windows")]
fn build_bash_resume_command(source_tool: &str, cli_path: &str, source_id: &str) -> String {
    let cli = cli_path.replace('\\', "/");
    if source_tool == "claude" || source_tool == "gemini" {
        format!(
            "{} --resume {}",
            sh_single_quote(&cli),
            sh_single_quote(source_id)
        )
    } else {
        format!(
            "{} resume {}",
            sh_single_quote(&cli),
            sh_single_quote(source_id)
        )
    }
}

pub fn resume_in_terminal(
    payload: ResumeTerminalRequest,
    terminal_preference: Option<String>,
) -> Result<()> {
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

    let ResumeTerminalRequest {
        source_tool,
        source_id,
        workspace_path,
    } = payload;
    let workspace_path_string = workspace_path.to_string_lossy().to_string();
    let cli_path = resolve_cli_for_tool(&source_tool);
    let resume_command = build_powershell_resume_command(&source_tool, &cli_path, &source_id);
    let terminal_preference =
        validate_terminal_preference(terminal_preference, &allowed_terminal_preferences())?;
    let script = format!(
        "Set-Location -LiteralPath {}\n& {}",
        ps_single_quote(&workspace_path_string),
        resume_command
    );
    let cmd_resume = build_cmd_resume_command(&source_tool, &cli_path, &source_id);
    let cmd_chain = format!(
        "cd /d {} && {}",
        cmd_double_quote(&workspace_path_string),
        cmd_resume
    );
    let bash_resume = build_bash_resume_command(&source_tool, &cli_path, &source_id);
    let bash_chain = format!(
        "cd {} && {}; exec bash -i",
        sh_single_quote(&workspace_path_string.replace('\\', "/")),
        bash_resume
    );

    let mut last_error = None;
    let is_auto = terminal_preference == "auto";

    for launcher in launcher_chain(&terminal_preference) {
        match spawn_terminal_launcher(
            launcher,
            &workspace_path_string,
            &script,
            &cmd_chain,
            &bash_chain,
            CREATE_NEW_CONSOLE,
        ) {
            Ok(()) => return Ok(()),
            Err(err) if !is_auto => return Err(err),
            Err(err) => last_error = Some(err),
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow!("no supported terminal launcher available")))
}

fn allowed_terminal_preferences() -> Vec<&'static str> {
    std::iter::once("auto")
        .chain(terminal_candidates().iter().map(|candidate| candidate.id))
        .collect()
}

fn launcher_chain(terminal_preference: &str) -> Vec<TerminalLauncher> {
    match terminal_preference {
        "windows_terminal" => vec![TerminalLauncher::WindowsTerminal],
        "pwsh" => vec![TerminalLauncher::Pwsh],
        "powershell" => vec![TerminalLauncher::PowerShell],
        "cmd" => vec![TerminalLauncher::Cmd],
        "wezterm" => vec![TerminalLauncher::WezTerm],
        "alacritty" => vec![TerminalLauncher::Alacritty],
        "kitty" => vec![TerminalLauncher::Kitty],
        "conemu" => vec![TerminalLauncher::ConEmu],
        "cmder" => vec![TerminalLauncher::Cmder],
        "git_bash" => vec![TerminalLauncher::GitBash],
        "msys2" => vec![TerminalLauncher::Msys2],
        "cygwin" => vec![TerminalLauncher::Cygwin],
        "auto" => vec![
            TerminalLauncher::WindowsTerminal,
            TerminalLauncher::Pwsh,
            TerminalLauncher::PowerShell,
            TerminalLauncher::Cmd,
            TerminalLauncher::WezTerm,
            TerminalLauncher::Alacritty,
            TerminalLauncher::Kitty,
            TerminalLauncher::ConEmu,
            TerminalLauncher::Cmder,
            TerminalLauncher::GitBash,
            TerminalLauncher::Msys2,
            TerminalLauncher::Cygwin,
        ],
        _ => vec![TerminalLauncher::PowerShell],
    }
}

fn spawn_terminal_launcher(
    launcher: TerminalLauncher,
    workspace_path: &str,
    script: &str,
    cmd_chain: &str,
    bash_chain: &str,
    creation_flags: u32,
) -> Result<()> {
    match launcher {
        TerminalLauncher::WindowsTerminal => {
            spawn_windows_terminal(workspace_path, script, creation_flags)
        }
        TerminalLauncher::Pwsh => spawn_pwsh(script, creation_flags),
        TerminalLauncher::PowerShell => spawn_powershell(script, creation_flags),
        TerminalLauncher::Cmd => spawn_cmd(cmd_chain, creation_flags),
        TerminalLauncher::WezTerm => spawn_wezterm(workspace_path, script, creation_flags),
        TerminalLauncher::Alacritty => spawn_alacritty(workspace_path, script, creation_flags),
        TerminalLauncher::Kitty => spawn_kitty(workspace_path, script, creation_flags),
        TerminalLauncher::ConEmu => spawn_conemu(workspace_path, script, creation_flags),
        TerminalLauncher::Cmder => spawn_cmder(workspace_path, cmd_chain, creation_flags),
        TerminalLauncher::GitBash => spawn_git_bash(bash_chain, creation_flags),
        TerminalLauncher::Msys2 => spawn_mintty("C:\\msys64\\usr\\bin\\mintty.exe", bash_chain),
        TerminalLauncher::Cygwin => spawn_mintty("C:\\cygwin64\\bin\\mintty.exe", bash_chain),
    }
}

fn spawn_windows_terminal(workspace_path: &str, script: &str, creation_flags: u32) -> Result<()> {
    use std::os::windows::process::CommandExt;

    Command::new("wt.exe")
        .arg("-d")
        .arg(workspace_path)
        .arg("powershell.exe")
        .arg("-NoExit")
        .arg("-Command")
        .arg(script)
        .creation_flags(creation_flags)
        .spawn()?;
    Ok(())
}

fn spawn_powershell(script: &str, creation_flags: u32) -> Result<()> {
    use std::os::windows::process::CommandExt;

    Command::new("powershell.exe")
        .arg("-NoExit")
        .arg("-Command")
        .arg(script)
        .creation_flags(creation_flags)
        .spawn()?;
    Ok(())
}

fn spawn_pwsh(script: &str, creation_flags: u32) -> Result<()> {
    use std::os::windows::process::CommandExt;

    Command::new("pwsh.exe")
        .arg("-NoExit")
        .arg("-Command")
        .arg(script)
        .creation_flags(creation_flags)
        .spawn()?;
    Ok(())
}

fn spawn_cmd(cmd_chain: &str, creation_flags: u32) -> Result<()> {
    use std::os::windows::process::CommandExt;

    Command::new("cmd.exe")
        .arg("/K")
        .arg(cmd_chain)
        .creation_flags(creation_flags)
        .spawn()?;
    Ok(())
}

fn spawn_wezterm(workspace_path: &str, script: &str, creation_flags: u32) -> Result<()> {
    use std::os::windows::process::CommandExt;

    Command::new("wezterm.exe")
        .arg("start")
        .arg("--cwd")
        .arg(workspace_path)
        .arg("--")
        .arg("powershell.exe")
        .arg("-NoExit")
        .arg("-Command")
        .arg(script)
        .creation_flags(creation_flags)
        .spawn()?;
    Ok(())
}

fn spawn_alacritty(workspace_path: &str, script: &str, creation_flags: u32) -> Result<()> {
    use std::os::windows::process::CommandExt;

    Command::new("alacritty.exe")
        .arg("--working-directory")
        .arg(workspace_path)
        .arg("-e")
        .arg("powershell.exe")
        .arg("-NoExit")
        .arg("-Command")
        .arg(script)
        .creation_flags(creation_flags)
        .spawn()?;
    Ok(())
}

fn spawn_kitty(workspace_path: &str, script: &str, creation_flags: u32) -> Result<()> {
    use std::os::windows::process::CommandExt;

    Command::new("kitty.exe")
        .arg("--directory")
        .arg(workspace_path)
        .arg("powershell.exe")
        .arg("-NoExit")
        .arg("-Command")
        .arg(script)
        .creation_flags(creation_flags)
        .spawn()?;
    Ok(())
}

fn spawn_conemu(workspace_path: &str, script: &str, creation_flags: u32) -> Result<()> {
    use std::os::windows::process::CommandExt;

    let executable = if command_available("ConEmu64.exe") {
        "ConEmu64.exe"
    } else {
        "ConEmu.exe"
    };
    Command::new(executable)
        .arg("-Dir")
        .arg(workspace_path)
        .arg("-run")
        .arg("powershell.exe")
        .arg("-NoExit")
        .arg("-Command")
        .arg(script)
        .creation_flags(creation_flags)
        .spawn()?;
    Ok(())
}

fn spawn_cmder(workspace_path: &str, cmd_chain: &str, creation_flags: u32) -> Result<()> {
    use std::os::windows::process::CommandExt;

    Command::new("Cmder.exe")
        .arg("/START")
        .arg(workspace_path)
        .arg("cmd.exe")
        .arg("/K")
        .arg(cmd_chain)
        .creation_flags(creation_flags)
        .spawn()?;
    Ok(())
}

fn spawn_git_bash(bash_chain: &str, creation_flags: u32) -> Result<()> {
    use std::os::windows::process::CommandExt;

    Command::new("bash.exe")
        .arg("--login")
        .arg("-i")
        .arg("-c")
        .arg(bash_chain)
        .creation_flags(creation_flags)
        .spawn()?;
    Ok(())
}

fn spawn_mintty(executable: &str, bash_chain: &str) -> Result<()> {
    let command = if Path::new(executable).exists() {
        executable
    } else {
        "mintty.exe"
    };
    Command::new(command)
        .args(["bash", "-lc", bash_chain])
        .spawn()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn auto_should_fall_back_from_windows_terminal_to_powershell_then_cmd() {
        assert_eq!(
            launcher_chain("auto"),
            vec![
                TerminalLauncher::WindowsTerminal,
                TerminalLauncher::Pwsh,
                TerminalLauncher::PowerShell,
                TerminalLauncher::Cmd,
                TerminalLauncher::WezTerm,
                TerminalLauncher::Alacritty,
                TerminalLauncher::Kitty,
                TerminalLauncher::ConEmu,
                TerminalLauncher::Cmder,
                TerminalLauncher::GitBash,
                TerminalLauncher::Msys2,
                TerminalLauncher::Cygwin,
            ]
        );
    }

    #[test]
    fn candidates_should_include_common_windows_terminals() {
        let ids = terminal_candidates()
            .iter()
            .map(|candidate| candidate.id)
            .collect::<Vec<_>>();

        for expected in [
            "windows_terminal",
            "pwsh",
            "powershell",
            "cmd",
            "wezterm",
            "alacritty",
            "kitty",
            "conemu",
            "cmder",
            "git_bash",
            "msys2",
            "cygwin",
        ] {
            assert!(
                ids.contains(&expected),
                "missing terminal candidate: {expected}"
            );
        }
    }

    #[test]
    fn capabilities_should_expose_only_detected_windows_terminals() {
        let capabilities = capabilities_with_detector(|candidate| {
            matches!(
                candidate.id,
                "windows_terminal" | "pwsh" | "git_bash" | "cmd"
            )
        });
        let ids = capabilities
            .terminal_options
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            ids,
            vec!["auto", "windows_terminal", "pwsh", "cmd", "git_bash"]
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
