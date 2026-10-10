use std::collections::{HashMap, HashSet};
use std::fs;
use std::future::Future;
use std::io;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Semaphore;

const MAX_CONCURRENT_CHECKS: usize = 8;
const CHECK_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspacePathStatus {
    Available,
    Missing,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspacePathStatusReason {
    PermissionDenied,
    NotDirectory,
    Timeout,
    StorageUnavailable,
    IoError,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspacePathCheckResult {
    pub path: String,
    pub status: WorkspacePathStatus,
    pub reason: Option<WorkspacePathStatusReason>,
}

pub async fn check_workspace_paths(paths: Vec<String>) -> Vec<WorkspacePathCheckResult> {
    check_workspace_paths_with(paths, CHECK_TIMEOUT, |path| async move {
        let join_failure_path = path.clone();
        match tokio::task::spawn_blocking(move || check_workspace_path(path)).await {
            Ok(result) => result,
            Err(_) => unavailable(join_failure_path, WorkspacePathStatusReason::IoError),
        }
    })
    .await
}

async fn check_workspace_paths_with<C, F>(
    paths: Vec<String>,
    timeout_duration: Duration,
    checker: C,
) -> Vec<WorkspacePathCheckResult>
where
    C: Fn(String) -> F + Clone + Send + Sync + 'static,
    F: Future<Output = WorkspacePathCheckResult> + Send + 'static,
{
    let requested_paths = paths;
    let mut seen = HashSet::new();
    let unique_paths = requested_paths
        .iter()
        .filter(|path| seen.insert(crate::path_identity::path_key(path)))
        .cloned()
        .collect::<Vec<_>>();

    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_CHECKS));
    let mut tasks = Vec::with_capacity(unique_paths.len());
    for path in unique_paths {
        let semaphore = Arc::clone(&semaphore);
        let checker = checker.clone();
        let task_path = path.clone();
        let task = tokio::spawn(async move {
            let permit = semaphore.acquire_owned().await;
            let Ok(_permit) = permit else {
                return unavailable(task_path, WorkspacePathStatusReason::IoError);
            };

            match tokio::time::timeout(timeout_duration, checker(task_path.clone())).await {
                Ok(result) => result,
                Err(_) => unavailable(task_path, WorkspacePathStatusReason::Timeout),
            }
        });
        tasks.push((path, task));
    }

    let mut checked_by_key = HashMap::with_capacity(tasks.len());
    for (path, task) in tasks {
        let key = crate::path_identity::path_key(&path);
        let checked = match task.await {
            Ok(result) => result,
            Err(_) => unavailable(path, WorkspacePathStatusReason::IoError),
        };
        checked_by_key.insert(key, checked);
    }

    requested_paths
        .into_iter()
        .map(|path| {
            let key = crate::path_identity::path_key(&path);
            match checked_by_key.get(&key) {
                Some(checked) => result(path, checked.status, checked.reason),
                None => unavailable(path, WorkspacePathStatusReason::IoError),
            }
        })
        .collect()
}

fn check_workspace_path(path: String) -> WorkspacePathCheckResult {
    check_workspace_path_with_access_probe(path, probe_directory_access)
}

fn check_workspace_path_with_access_probe<P>(
    path: String,
    access_probe: P,
) -> WorkspacePathCheckResult
where
    P: FnOnce(&str) -> io::Result<()>,
{
    if is_foreign_absolute_path(&path) {
        return unavailable(path, WorkspacePathStatusReason::IoError);
    }

    match fs::metadata(&path) {
        Ok(metadata) if metadata.is_dir() => match access_probe(&path) {
            Ok(()) => result(path, WorkspacePathStatus::Available, None),
            Err(error) => classify_io_error(path, error),
        },
        Ok(_) => result(
            path,
            WorkspacePathStatus::Unavailable,
            Some(WorkspacePathStatusReason::NotDirectory),
        ),
        Err(error) => classify_io_error(path, error),
    }
}

fn probe_directory_access(path: &str) -> io::Result<()> {
    probe_directory_access_with(
        path,
        |candidate| {
            let mut entries = fs::read_dir(candidate)?;
            match entries.next() {
                Some(Err(error)) => Err(error),
                Some(Ok(_)) | None => Ok(()),
            }
        },
        |candidate| fs::metadata(Path::new(candidate).join(".")).map(|_| ()),
    )
}

fn probe_directory_access_with<R, S>(
    path: &str,
    enumerate_probe: R,
    search_probe: S,
) -> io::Result<()>
where
    R: FnOnce(&str) -> io::Result<()>,
    S: FnOnce(&str) -> io::Result<()>,
{
    enumerate_probe(path)?;
    search_probe(path)
}

#[cfg(windows)]
fn is_foreign_absolute_path(path: &str) -> bool {
    path.starts_with('/') && !path.starts_with("//")
}

#[cfg(not(windows))]
fn is_foreign_absolute_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    let has_windows_drive = bytes.len() >= 3
        && (bytes[0] as char).is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/');
    has_windows_drive || path.starts_with("\\\\")
}

fn classify_io_error(path: String, error: io::Error) -> WorkspacePathCheckResult {
    match error.kind() {
        io::ErrorKind::NotFound => result(path, WorkspacePathStatus::Missing, None),
        io::ErrorKind::PermissionDenied => result(
            path,
            WorkspacePathStatus::Unavailable,
            Some(WorkspacePathStatusReason::PermissionDenied),
        ),
        io::ErrorKind::NotConnected
        | io::ErrorKind::NetworkDown
        | io::ErrorKind::NetworkUnreachable
        | io::ErrorKind::HostUnreachable => result(
            path,
            WorkspacePathStatus::Unavailable,
            Some(WorkspacePathStatusReason::StorageUnavailable),
        ),
        _ => result(
            path,
            WorkspacePathStatus::Unavailable,
            Some(WorkspacePathStatusReason::IoError),
        ),
    }
}

fn result(
    path: String,
    status: WorkspacePathStatus,
    reason: Option<WorkspacePathStatusReason>,
) -> WorkspacePathCheckResult {
    WorkspacePathCheckResult {
        path,
        status,
        reason,
    }
}

fn unavailable(path: String, reason: WorkspacePathStatusReason) -> WorkspacePathCheckResult {
    result(path, WorkspacePathStatus::Unavailable, Some(reason))
}

#[cfg(test)]
mod tests {
    use super::{
        check_workspace_path, check_workspace_path_with_access_probe, check_workspace_paths_with,
        classify_io_error, probe_directory_access_with, result, WorkspacePathStatus,
        WorkspacePathStatusReason,
    };
    use std::fs;
    use std::io;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;
    use tempfile::tempdir;

    #[cfg(unix)]
    fn create_directory_symlink(
        target: &std::path::Path,
        link: &std::path::Path,
    ) -> std::io::Result<()> {
        std::os::unix::fs::symlink(target, link)
    }

    #[cfg(windows)]
    fn create_directory_symlink(
        target: &std::path::Path,
        link: &std::path::Path,
    ) -> std::io::Result<()> {
        std::os::windows::fs::symlink_dir(target, link)
    }

    #[test]
    fn workspace_status_service_classifies_directory_missing_path_and_file() {
        let temp = tempdir().expect("temporary directory should be created");
        let directory = temp.path().join("workspace");
        let missing = temp.path().join("missing");
        let file = temp.path().join("session.jsonl");
        fs::create_dir(&directory).expect("workspace directory should be created");
        fs::write(&file, "session").expect("regular file should be created");

        let results = [directory, missing, file]
            .into_iter()
            .map(|path| check_workspace_path(path.to_string_lossy().into_owned()))
            .collect::<Vec<_>>();

        assert_eq!(results[0].status, WorkspacePathStatus::Available);
        assert_eq!(results[0].reason, None);
        assert_eq!(results[1].status, WorkspacePathStatus::Missing);
        assert_eq!(results[1].reason, None);
        assert_eq!(results[2].status, WorkspacePathStatus::Unavailable);
        assert_eq!(
            results[2].reason,
            Some(WorkspacePathStatusReason::NotDirectory)
        );
    }

    #[test]
    fn workspace_status_service_classifies_permission_storage_and_other_io_errors() {
        let cases = [
            (
                io::ErrorKind::PermissionDenied,
                WorkspacePathStatusReason::PermissionDenied,
            ),
            (
                io::ErrorKind::NotConnected,
                WorkspacePathStatusReason::StorageUnavailable,
            ),
            (
                io::ErrorKind::InvalidData,
                WorkspacePathStatusReason::IoError,
            ),
        ];

        for (kind, expected_reason) in cases {
            let result = classify_io_error("workspace".to_string(), io::Error::from(kind));

            assert_eq!(result.status, WorkspacePathStatus::Unavailable, "{kind:?}");
            assert_eq!(result.reason, Some(expected_reason), "{kind:?}");
        }
    }

    #[test]
    fn workspace_status_service_follows_directory_links_and_reports_broken_links_missing() {
        let temp = tempdir().expect("temporary directory should be created");
        let target = temp.path().join("target");
        let valid_link = temp.path().join("valid-link");
        let broken_target = temp.path().join("absent-target");
        let broken_link = temp.path().join("broken-link");
        fs::create_dir(&target).expect("target directory should be created");

        for (link_target, link) in [(&target, &valid_link), (&broken_target, &broken_link)] {
            if let Err(error) = create_directory_symlink(link_target, link) {
                if cfg!(windows) && error.kind() == std::io::ErrorKind::PermissionDenied {
                    return;
                }
                panic!("directory symlink should be created: {error}");
            }
        }

        let available = check_workspace_path(valid_link.to_string_lossy().into_owned());
        let missing = check_workspace_path(broken_link.to_string_lossy().into_owned());

        assert_eq!(available.status, WorkspacePathStatus::Available);
        assert_eq!(available.reason, None);
        assert_eq!(missing.status, WorkspacePathStatus::Missing);
        assert_eq!(missing.reason, None);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn workspace_status_service_deduplicates_checks_but_returns_every_requested_alias() {
        let checks = Arc::new(AtomicUsize::new(0));
        let observed_checks = Arc::clone(&checks);

        let results = check_workspace_paths_with(
            vec![
                r"C:\Work\Project".to_string(),
                "c:/work/./project".to_string(),
                r"D:\Other".to_string(),
            ],
            Duration::from_secs(1),
            move |path| {
                let checks = Arc::clone(&observed_checks);
                async move {
                    checks.fetch_add(1, Ordering::SeqCst);
                    if path.starts_with("C:") {
                        tokio::time::sleep(Duration::from_millis(30)).await;
                    }
                    result(path, WorkspacePathStatus::Available, None)
                }
            },
        )
        .await;

        assert_eq!(checks.load(Ordering::SeqCst), 2);
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].path, r"C:\Work\Project");
        assert_eq!(results[1].path, "c:/work/./project");
        assert_eq!(results[1].status, WorkspacePathStatus::Available);
        assert_eq!(results[2].path, r"D:\Other");
    }

    #[test]
    fn workspace_status_service_requires_directory_access_after_metadata_succeeds() {
        let temp = tempdir().expect("temporary directory should be created");
        let directory = temp.path().join("restricted-workspace");
        fs::create_dir(&directory).expect("workspace directory should be created");

        let checked = check_workspace_path_with_access_probe(
            directory.to_string_lossy().into_owned(),
            |_| Err(io::Error::from(io::ErrorKind::PermissionDenied)),
        );

        assert_eq!(checked.status, WorkspacePathStatus::Unavailable);
        assert_eq!(
            checked.reason,
            Some(WorkspacePathStatusReason::PermissionDenied)
        );
    }

    #[test]
    fn workspace_status_service_requires_search_access_after_directory_enumeration_succeeds() {
        let checked = probe_directory_access_with(
            "workspace",
            |_| Ok(()),
            |_| Err(io::Error::from(io::ErrorKind::PermissionDenied)),
        );

        assert_eq!(checked.unwrap_err().kind(), io::ErrorKind::PermissionDenied);
    }

    #[cfg(unix)]
    #[test]
    fn workspace_status_service_reports_a_real_restricted_directory_when_enforced() {
        use std::os::unix::fs::PermissionsExt;

        let temp = tempdir().expect("temporary directory should be created");
        let directory = temp.path().join("restricted-workspace");
        fs::create_dir(&directory).expect("workspace directory should be created");
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o000))
            .expect("directory permissions should be restricted");

        let checked = check_workspace_path(directory.to_string_lossy().into_owned());

        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
            .expect("directory permissions should be restored");
        if fs::read_dir(&directory).is_ok() && checked.status == WorkspacePathStatus::Available {
            return;
        }
        assert_eq!(checked.status, WorkspacePathStatus::Unavailable);
        assert_eq!(
            checked.reason,
            Some(WorkspacePathStatusReason::PermissionDenied)
        );
    }

    #[cfg(unix)]
    #[test]
    fn workspace_status_service_rejects_readable_directory_without_search_permission() {
        use std::os::unix::fs::PermissionsExt;

        let temp = tempdir().expect("temporary directory should be created");
        let directory = temp.path().join("readable-not-searchable");
        fs::create_dir(&directory).expect("workspace directory should be created");
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o400))
            .expect("directory should retain read permission only");

        let can_enumerate = fs::read_dir(&directory).is_ok();
        let search_error = fs::metadata(directory.join(".")).err();
        if !can_enumerate
            || search_error.as_ref().map(io::Error::kind) != Some(io::ErrorKind::PermissionDenied)
        {
            fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
                .expect("directory permissions should be restored");
            return;
        }

        let checked = check_workspace_path(directory.to_string_lossy().into_owned());

        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
            .expect("directory permissions should be restored");
        assert_eq!(checked.status, WorkspacePathStatus::Unavailable);
        assert_eq!(
            checked.reason,
            Some(WorkspacePathStatusReason::PermissionDenied)
        );
    }

    #[test]
    fn workspace_status_service_rejects_foreign_platform_absolute_paths_as_unavailable() {
        #[cfg(windows)]
        let foreign_path = "/var/lib/ai-session/workspace";
        #[cfg(not(windows))]
        let foreign_path = r"Z:\ai-session\workspace";

        let checked = check_workspace_path(foreign_path.to_string());

        assert_eq!(checked.path, foreign_path);
        assert_eq!(checked.status, WorkspacePathStatus::Unavailable);
        assert_eq!(checked.reason, Some(WorkspacePathStatusReason::IoError));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn workspace_status_service_times_out_only_the_slow_path() {
        let results = check_workspace_paths_with(
            vec!["slow".to_string(), "fast".to_string()],
            Duration::from_millis(10),
            |path| async move {
                if path == "slow" {
                    std::future::pending::<()>().await;
                }
                result(path, WorkspacePathStatus::Available, None)
            },
        )
        .await;

        assert_eq!(results[0].path, "slow");
        assert_eq!(results[0].status, WorkspacePathStatus::Unavailable);
        assert_eq!(results[0].reason, Some(WorkspacePathStatusReason::Timeout));
        assert_eq!(results[1].path, "fast");
        assert_eq!(results[1].status, WorkspacePathStatus::Available);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn workspace_status_service_limits_checks_to_eight_concurrent_tasks() {
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let observed_active = Arc::clone(&active);
        let observed_peak = Arc::clone(&peak);
        let paths = (0..20).map(|index| format!("path-{index}")).collect();

        let results = check_workspace_paths_with(paths, Duration::from_secs(1), move |path| {
            let active = Arc::clone(&observed_active);
            let peak = Arc::clone(&observed_peak);
            async move {
                let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(current, Ordering::SeqCst);
                tokio::time::sleep(Duration::from_millis(20)).await;
                active.fetch_sub(1, Ordering::SeqCst);
                result(path, WorkspacePathStatus::Available, None)
            }
        })
        .await;

        assert_eq!(results.len(), 20);
        assert_eq!(peak.load(Ordering::SeqCst), 8);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn workspace_status_service_returns_empty_without_invoking_checker() {
        let checks = Arc::new(AtomicUsize::new(0));
        let observed_checks = Arc::clone(&checks);

        let results = check_workspace_paths_with(Vec::new(), Duration::from_secs(1), move |path| {
            let checks = Arc::clone(&observed_checks);
            async move {
                checks.fetch_add(1, Ordering::SeqCst);
                result(path, WorkspacePathStatus::Available, None)
            }
        })
        .await;

        assert!(results.is_empty());
        assert_eq!(checks.load(Ordering::SeqCst), 0);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn workspace_status_service_isolates_join_failures_as_io_errors() {
        let results = check_workspace_paths_with(
            vec!["panic".to_string()],
            Duration::from_secs(1),
            |_path| async move {
                panic!("simulated checker failure");
            },
        )
        .await;

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "panic");
        assert_eq!(results[0].status, WorkspacePathStatus::Unavailable);
        assert_eq!(results[0].reason, Some(WorkspacePathStatusReason::IoError));
    }
}
