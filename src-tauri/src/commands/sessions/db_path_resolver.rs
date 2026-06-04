use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Manager, Runtime};

const DEFAULT_DB_FILENAME: &str = "ai-session-manager.db";

type ResolveDbPathFn = Box<dyn Fn() -> Result<PathBuf, String> + Send + Sync>;
type EnsureDirFn = Box<dyn Fn(&Path) -> std::io::Result<()> + Send + Sync>;

pub struct DbPathResolver {
    cached: OnceLock<PathBuf>,
    init_lock: Mutex<()>,
    resolve_db_path: ResolveDbPathFn,
    ensure_dir: EnsureDirFn,
}

impl DbPathResolver {
    pub fn new<R: Runtime>(app_handle: AppHandle<R>) -> Self {
        Self {
            cached: OnceLock::new(),
            init_lock: Mutex::new(()),
            resolve_db_path: Box::new(move || {
                app_handle
                    .path()
                    .app_local_data_dir()
                    .map(|dir| dir.join(DEFAULT_DB_FILENAME))
                    .map_err(|_| "无法解析应用数据目录".to_string())
            }),
            ensure_dir: Box::new(|path| std::fs::create_dir_all(path)),
        }
    }

    pub fn db_path(&self) -> Result<&Path, String> {
        if let Some(path) = self.cached.get() {
            return Ok(path.as_path());
        }

        let _guard = self
            .init_lock
            .lock()
            .expect("db path resolver init lock should not be poisoned");

        if let Some(path) = self.cached.get() {
            return Ok(path.as_path());
        }

        let db_path = (self.resolve_db_path)()?;
        let parent = db_path
            .parent()
            .ok_or_else(|| "无法解析应用数据目录".to_string())?;

        (self.ensure_dir)(parent).map_err(|err| format!("无法创建应用数据目录: {err}"))?;

        Ok(self.cached.get_or_init(|| db_path).as_path())
    }

    #[cfg(test)]
    pub(crate) fn from_resolver_for_test(
        resolve_db_path: ResolveDbPathFn,
        ensure_dir: EnsureDirFn,
    ) -> Self {
        Self {
            cached: OnceLock::new(),
            init_lock: Mutex::new(()),
            resolve_db_path,
            ensure_dir,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    use tempfile::tempdir;

    #[test]
    fn db_path_should_resolve_stable_database_file_and_create_parent_dir() {
        let td = tempdir().expect("tempdir should exist");
        let app_dir = td.path().join("app-local");
        let resolver = DbPathResolver::from_resolver_for_test(
            Box::new({
                let app_dir = app_dir.clone();
                move || Ok(app_dir.join(DEFAULT_DB_FILENAME))
            }),
            Box::new(|path| std::fs::create_dir_all(path)),
        );

        let resolved = resolver
            .db_path()
            .expect("db path should resolve")
            .to_path_buf();

        assert_eq!(resolved, app_dir.join(DEFAULT_DB_FILENAME));
        assert!(app_dir.is_dir());
    }

    #[test]
    fn db_path_should_return_error_when_app_dir_cannot_be_resolved() {
        let resolver = DbPathResolver::from_resolver_for_test(
            Box::new(|| Err("无法解析应用数据目录".to_string())),
            Box::new(|path| std::fs::create_dir_all(path)),
        );

        let err = resolver.db_path().expect_err("resolver should fail");
        assert_eq!(err, "无法解析应用数据目录");
    }

    #[test]
    fn db_path_should_return_error_when_directory_creation_fails() {
        let resolver = DbPathResolver::from_resolver_for_test(
            Box::new(|| Ok(PathBuf::from("app-local").join(DEFAULT_DB_FILENAME))),
            Box::new(|_| Err(io::Error::other("permission denied"))),
        );

        let err = resolver.db_path().expect_err("create_dir_all should fail");
        assert_eq!(err, "无法创建应用数据目录: permission denied");
    }

    #[test]
    fn db_path_should_cache_first_successful_result() {
        let td = tempdir().expect("tempdir should exist");
        let app_dir = td.path().join("cached");
        let resolve_calls = Arc::new(AtomicUsize::new(0));
        let resolver = DbPathResolver::from_resolver_for_test(
            Box::new({
                let app_dir = app_dir.clone();
                let resolve_calls = Arc::clone(&resolve_calls);
                move || {
                    resolve_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(app_dir.join(DEFAULT_DB_FILENAME))
                }
            }),
            Box::new(|path| std::fs::create_dir_all(path)),
        );

        let first = resolver
            .db_path()
            .expect("first lookup should succeed")
            .to_path_buf();
        let second = resolver
            .db_path()
            .expect("second lookup should succeed")
            .to_path_buf();

        assert_eq!(first, second);
        assert_eq!(resolve_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn db_path_should_only_resolve_and_create_directory_once_under_concurrent_first_access() {
        let td = tempdir().expect("tempdir should exist");
        let app_dir = td.path().join("concurrent");
        let resolve_calls = Arc::new(AtomicUsize::new(0));
        let ensure_calls = Arc::new(AtomicUsize::new(0));
        let resolver = Arc::new(DbPathResolver::from_resolver_for_test(
            Box::new({
                let app_dir = app_dir.clone();
                let resolve_calls = Arc::clone(&resolve_calls);
                move || {
                    resolve_calls.fetch_add(1, Ordering::SeqCst);
                    std::thread::sleep(std::time::Duration::from_millis(25));
                    Ok(app_dir.join(DEFAULT_DB_FILENAME))
                }
            }),
            Box::new({
                let ensure_calls = Arc::clone(&ensure_calls);
                move |path| {
                    ensure_calls.fetch_add(1, Ordering::SeqCst);
                    std::fs::create_dir_all(path)
                }
            }),
        ));

        let first_resolver = Arc::clone(&resolver);
        let first = std::thread::spawn(move || {
            first_resolver
                .db_path()
                .expect("first concurrent lookup should succeed")
                .to_path_buf()
        });

        let second_resolver = Arc::clone(&resolver);
        let second = std::thread::spawn(move || {
            second_resolver
                .db_path()
                .expect("second concurrent lookup should succeed")
                .to_path_buf()
        });

        let first = first.join().expect("first thread should finish");
        let second = second.join().expect("second thread should finish");

        assert_eq!(first, app_dir.join(DEFAULT_DB_FILENAME));
        assert_eq!(second, app_dir.join(DEFAULT_DB_FILENAME));
        assert_eq!(resolve_calls.load(Ordering::SeqCst), 1);
        assert_eq!(ensure_calls.load(Ordering::SeqCst), 1);
    }
}
