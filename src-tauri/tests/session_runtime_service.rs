use ai_session_manager::application::session_runtime_service::detect_workspace_root_from;
use ai_session_manager::platform::get_platform_capabilities;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tempfile::tempdir;

fn current_dir_mutex() -> &'static Mutex<()> {
    static CURRENT_DIR_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();
    CURRENT_DIR_MUTEX.get_or_init(|| Mutex::new(()))
}

struct CurrentDirGuard {
    _lock: std::sync::MutexGuard<'static, ()>,
    original: std::path::PathBuf,
}

impl CurrentDirGuard {
    fn set_to(path: &Path) -> Self {
        let lock = current_dir_mutex().lock().unwrap();
        let original = std::env::current_dir().unwrap();
        std::env::set_current_dir(path).unwrap();
        Self {
            _lock: lock,
            original,
        }
    }
}

impl Drop for CurrentDirGuard {
    fn drop(&mut self) {
        std::env::set_current_dir(&self.original).unwrap();
    }
}

fn expected_workspace_path(path: &Path) -> String {
    let raw = path.to_string_lossy();

    #[cfg(target_os = "windows")]
    {
        raw.strip_prefix("\\\\?\\").unwrap_or(&raw).to_string()
    }

    #[cfg(not(target_os = "windows"))]
    {
        raw.to_string()
    }
}

#[test]
fn platform_capabilities_should_always_include_auto_terminal_preference() {
    let capabilities = get_platform_capabilities();

    assert!(capabilities
        .terminal_options
        .iter()
        .any(|item| item.id == "auto"));
}

#[test]
fn platform_capabilities_should_report_current_os() {
    let capabilities = get_platform_capabilities();

    #[cfg(target_os = "windows")]
    assert_eq!(capabilities.os, "windows");

    #[cfg(target_os = "macos")]
    assert_eq!(capabilities.os, "macos");

    #[cfg(all(unix, not(target_os = "macos")))]
    assert_eq!(capabilities.os, std::env::consts::OS);
}

#[test]
#[cfg(target_os = "windows")]
fn detect_workspace_root_from_should_strip_verbatim_prefix_on_windows() {
    let td = tempdir().unwrap();
    let repo = td.path().join("repo");
    let nested = repo.join("apps").join("desktop");
    fs::create_dir_all(repo.join(".git")).unwrap();
    fs::create_dir_all(&nested).unwrap();

    let verbatim_nested = format!(r"\\?\{}", nested.display());
    let detected = detect_workspace_root_from(Path::new(&verbatim_nested));

    assert_eq!(detected, Some(expected_workspace_path(&repo)));
}

#[cfg(target_os = "windows")]
fn create_logical_dir_link(link: &Path, target: &Path) {
    let status = std::process::Command::new("cmd.exe")
        .arg("/C")
        .arg("mklink")
        .arg("/J")
        .arg(link)
        .arg(target)
        .status()
        .unwrap();

    assert!(status.success(), "mklink /J should succeed");
}

#[cfg(unix)]
fn create_logical_dir_link(link: &Path, target: &Path) {
    std::os::unix::fs::symlink(target, link).unwrap();
}

#[test]
fn detect_workspace_root_from_should_return_nearest_git_root() {
    let td = tempdir().unwrap();
    let repo = td.path().join("repo");
    let nested = repo.join("apps").join("desktop");
    fs::create_dir_all(repo.join(".git")).unwrap();
    fs::create_dir_all(&nested).unwrap();

    let detected = detect_workspace_root_from(&nested);

    assert_eq!(detected, Some(expected_workspace_path(&repo)));
}

#[test]
fn detect_workspace_root_from_should_fall_back_to_start_dir_when_git_missing() {
    let td = tempdir().unwrap();
    let nested = td.path().join("workspace").join("apps").join("desktop");
    fs::create_dir_all(&nested).unwrap();

    let detected = detect_workspace_root_from(&nested);

    assert_eq!(detected, Some(expected_workspace_path(&nested)));
}

#[test]
fn detect_workspace_root_from_should_return_canonical_git_root_for_relative_start() {
    let td = tempdir().unwrap();
    let repo = td.path().join("repo");
    let nested = repo.join("apps").join("desktop");
    fs::create_dir_all(repo.join(".git")).unwrap();
    fs::create_dir_all(&nested).unwrap();

    let _guard = CurrentDirGuard::set_to(td.path());

    let detected = detect_workspace_root_from(Path::new("repo/apps/desktop"));

    assert_eq!(detected, Some(expected_workspace_path(&repo)));
}

#[test]
fn current_dir_guard_should_restore_original_directory_after_drop() {
    let td = tempdir().unwrap();
    let original = std::env::current_dir().unwrap();

    {
        let _guard = CurrentDirGuard::set_to(td.path());
        assert_eq!(std::env::current_dir().unwrap(), td.path());
    }

    assert_eq!(std::env::current_dir().unwrap(), original);
}

#[test]
fn detect_workspace_root_from_should_preserve_logical_root_path() {
    let td = tempdir().unwrap();
    let physical_repo = td.path().join("physical-repo");
    let logical_root = td.path().join("logical-root");
    let logical_nested = logical_root.join("apps").join("desktop");
    fs::create_dir_all(physical_repo.join(".git")).unwrap();
    fs::create_dir_all(physical_repo.join("apps").join("desktop")).unwrap();
    create_logical_dir_link(&logical_root, &physical_repo);

    let detected = detect_workspace_root_from(&logical_nested);

    assert_eq!(detected, Some(expected_workspace_path(&logical_root)));
}
