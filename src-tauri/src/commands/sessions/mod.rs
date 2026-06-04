mod db_path_resolver;
mod handlers;
mod mappers;
mod models;

pub use db_path_resolver::DbPathResolver;
pub use handlers::{
    clear_trash_at, clear_trash_with_app_at, delete_session_at, delete_sessions_at, delete_sessions_with_app_at,
    export_session_markdown_at, get_app_settings_at,
    get_overview_summary_at, get_session_detail_at, list_sessions_at, list_subagent_sessions_at,
    list_trash_sessions_at, open_external_url_at, open_in_explorer_at, open_resume_in_terminal_at,
    refresh_sessions_at, restore_session_at, update_app_settings_at, CommandResult,
};
pub use models::*;

use std::path::{Path, PathBuf};

use tauri::State;

use crate::application::session_runtime_service::{default_codex_dir, detect_runtime_workspace};
use crate::services::sync_service::RefreshSummary;

fn with_default_db_path<T>(
    resolver: &DbPathResolver,
    operation: impl FnOnce(&Path) -> CommandResult<T>,
) -> CommandResult<T> {
    let path = resolver.db_path().map_err(|message| CommandError {
        code: "internal_error".to_string(),
        message,
    })?;
    operation(path)
}

#[cfg_attr(not(test), allow(dead_code))]
type ExportFileDialogFn = fn(&str) -> Option<PathBuf>;
#[cfg_attr(not(test), allow(dead_code))]
type OpenInExplorerHandlerFn = fn(&str, bool) -> CommandResult<()>;
type OpenResumeInTerminalHandlerFn = fn(OpenResumeInTerminalPayload) -> CommandResult<()>;
#[cfg(test)]
type OpenResumeInTerminalCall = (String, String, String, Option<String>);

fn default_export_file_dialog(filename: &str) -> Option<PathBuf> {
    rfd::FileDialog::new()
        .add_filter("Markdown", &["md"])
        .set_file_name(filename)
        .save_file()
}

fn choose_export_target(filename: &str) -> Option<PathBuf> {
    #[cfg(test)]
    if let Some(dialog) = test_export_file_dialog_override() {
        return dialog(filename);
    }

    default_export_file_dialog(filename)
}

fn open_in_explorer_with(
    payload: OpenInExplorerPayload,
    handler: OpenInExplorerHandlerFn,
) -> CommandResult<()> {
    handler(&payload.path, payload.reveal.unwrap_or(false))
}

fn open_resume_in_terminal_with(
    payload: OpenResumeInTerminalPayload,
    handler: OpenResumeInTerminalHandlerFn,
) -> CommandResult<()> {
    handler(payload)
}

#[tauri::command]
pub fn refresh_sessions(
    db_path_resolver: State<'_, DbPathResolver>,
) -> CommandResult<RefreshSummary> {
    with_default_db_path(&db_path_resolver, |db_path| {
        refresh_sessions_at(db_path, &default_codex_dir())
    })
}

#[tauri::command]
pub fn list_sessions(
    db_path_resolver: State<'_, DbPathResolver>,
    payload: ListSessionsPayload,
) -> CommandResult<SessionListResponse> {
    with_default_db_path(&db_path_resolver, |db_path| {
        list_sessions_at(db_path, payload)
    })
}

#[tauri::command]
pub fn list_trash_sessions(
    db_path_resolver: State<'_, DbPathResolver>,
    payload: ListSessionsPayload,
) -> CommandResult<SessionListResponse> {
    with_default_db_path(&db_path_resolver, |db_path| {
        list_trash_sessions_at(db_path, payload)
    })
}

#[tauri::command]
pub fn get_overview_summary(
    db_path_resolver: State<'_, DbPathResolver>,
) -> CommandResult<OverviewSummaryResponse> {
    with_default_db_path(&db_path_resolver, get_overview_summary_at)
}

#[tauri::command]
pub fn get_app_settings(
    db_path_resolver: State<'_, DbPathResolver>,
) -> CommandResult<AppSettingsResponse> {
    with_default_db_path(&db_path_resolver, get_app_settings_at)
}

#[tauri::command]
pub fn update_app_settings(
    db_path_resolver: State<'_, DbPathResolver>,
    payload: UpdateAppSettingsPayload,
) -> CommandResult<AppSettingsResponse> {
    with_default_db_path(&db_path_resolver, |db_path| {
        update_app_settings_at(db_path, payload)
    })
}

#[tauri::command]
pub fn get_session_detail(
    db_path_resolver: State<'_, DbPathResolver>,
    payload: GetSessionDetailPayload,
) -> CommandResult<SessionDetailResponse> {
    with_default_db_path(&db_path_resolver, |db_path| {
        get_session_detail_at(db_path, payload)
    })
}

#[tauri::command]
pub fn list_subagent_sessions(
    db_path_resolver: State<'_, DbPathResolver>,
    payload: ListSubagentSessionsPayload,
) -> CommandResult<SessionListResponse> {
    with_default_db_path(&db_path_resolver, |db_path| {
        list_subagent_sessions_at(db_path, payload)
    })
}

#[tauri::command]
pub fn delete_session(
    db_path_resolver: State<'_, DbPathResolver>,
    payload: DeleteSessionPayload,
) -> CommandResult<DeleteSessionResponse> {
    with_default_db_path(&db_path_resolver, |db_path| {
        delete_session_at(db_path, payload)
    })
}

#[tauri::command]
pub fn delete_sessions(
    app: tauri::AppHandle,
    db_path_resolver: State<'_, DbPathResolver>,
    payload: DeleteSessionsPayload,
) -> CommandResult<DeleteSessionResponse> {
    with_default_db_path(&db_path_resolver, |db_path| {
        delete_sessions_with_app_at(&app, db_path, payload)
    })
}

#[tauri::command]
pub fn restore_session(
    db_path_resolver: State<'_, DbPathResolver>,
    payload: RestoreSessionPayload,
) -> CommandResult<RestoreSessionResponse> {
    with_default_db_path(&db_path_resolver, |db_path| {
        restore_session_at(db_path, payload)
    })
}

#[tauri::command]
pub fn clear_trash(
    app: tauri::AppHandle,
    db_path_resolver: State<'_, DbPathResolver>,
) -> CommandResult<ClearTrashResponse> {
    with_default_db_path(&db_path_resolver, |db_path| {
        clear_trash_with_app_at(&app, db_path)
    })
}

fn export_session_markdown_with(
    resolver: &DbPathResolver,
    mut payload: ExportSessionMarkdownPayload,
) -> CommandResult<ExportSessionMarkdownResponse> {
    if payload
        .target_path
        .as_deref()
        .unwrap_or("")
        .trim()
        .is_empty()
    {
        let filename = crate::application::session_admin_service::build_export_dialog_filename(
            &payload.source_id,
        );
        let Some(path) = choose_export_target(&filename) else {
            return Ok(ExportSessionMarkdownResponse {
                path: String::new(),
                canceled: true,
            });
        };
        payload.target_path = Some(path.to_string_lossy().to_string());
    }

    with_default_db_path(resolver, |db_path| {
        export_session_markdown_at(db_path, payload)
    })
}

#[tauri::command]
pub fn export_session_markdown(
    db_path_resolver: State<'_, DbPathResolver>,
    payload: ExportSessionMarkdownPayload,
) -> CommandResult<ExportSessionMarkdownResponse> {
    export_session_markdown_with(&db_path_resolver, payload)
}

#[tauri::command]
pub fn get_runtime_workspace() -> CommandResult<Option<String>> {
    Ok(detect_runtime_workspace())
}

#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_platform_capabilities() -> CommandResult<PlatformCapabilitiesResponse> {
    let capabilities = crate::platform::get_platform_capabilities();

    Ok(PlatformCapabilitiesResponse {
        os: capabilities.os,
        terminal_options: capabilities
            .terminal_options
            .into_iter()
            .map(|item| TerminalOptionResponse {
                id: item.id,
                label: item.label,
            })
            .collect(),
        supports_reveal_path: capabilities.supports_reveal_path,
        supports_resume_in_terminal: capabilities.supports_resume_in_terminal,
        reveal_path_degrades_to_open_parent: capabilities.reveal_path_degrades_to_open_parent,
    })
}

#[tauri::command]
pub fn open_in_explorer(payload: OpenInExplorerPayload) -> CommandResult<()> {
    open_in_explorer_with(payload, open_in_explorer_at)
}

#[tauri::command]
pub fn open_resume_in_terminal(payload: OpenResumeInTerminalPayload) -> CommandResult<()> {
    open_resume_in_terminal_with(payload, open_resume_in_terminal_at)
}

#[tauri::command]
pub fn open_external_url(
    app: tauri::AppHandle,
    payload: OpenExternalUrlPayload,
) -> CommandResult<()> {
    open_external_url_at(app, payload)
}

#[cfg(test)]
thread_local! {
    static EXPORT_FILE_DIALOG_OVERRIDE: std::cell::Cell<Option<ExportFileDialogFn>> =
        const { std::cell::Cell::new(None) };
}

#[cfg(test)]
fn test_export_file_dialog_override() -> Option<ExportFileDialogFn> {
    EXPORT_FILE_DIALOG_OVERRIDE.with(std::cell::Cell::get)
}

#[cfg(test)]
struct ExportFileDialogGuard {
    previous: Option<ExportFileDialogFn>,
}

#[cfg(test)]
impl Drop for ExportFileDialogGuard {
    fn drop(&mut self) {
        EXPORT_FILE_DIALOG_OVERRIDE.with(|slot| slot.set(self.previous));
    }
}

#[cfg(test)]
fn install_export_file_dialog_for_test(replacement: ExportFileDialogFn) -> ExportFileDialogGuard {
    let previous = EXPORT_FILE_DIALOG_OVERRIDE.with(|slot| {
        let previous = slot.get();
        slot.set(Some(replacement));
        previous
    });
    ExportFileDialogGuard { previous }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};

    fn resolver_returning(path: PathBuf) -> DbPathResolver {
        DbPathResolver::from_resolver_for_test(
            Box::new(move || Ok(path.clone())),
            Box::new(|path| std::fs::create_dir_all(path)),
        )
    }

    fn resolver_failing(message: &'static str) -> DbPathResolver {
        DbPathResolver::from_resolver_for_test(
            Box::new(move || Err(message.to_string())),
            Box::new(|path| std::fs::create_dir_all(path)),
        )
    }

    thread_local! {
        static CALLED_OVERRIDE: Cell<bool> = const { Cell::new(false) };
        static OPEN_IN_EXPLORER_CALLS: RefCell<Vec<(String, bool)>> = const {
            RefCell::new(Vec::new())
        };
        static OPEN_RESUME_IN_TERMINAL_CALLS: RefCell<Vec<OpenResumeInTerminalCall>> = const {
            RefCell::new(Vec::new())
        };
    }

    fn record_open_in_explorer_call(path: &str, reveal: bool) -> CommandResult<()> {
        OPEN_IN_EXPLORER_CALLS.with(|calls| {
            calls.borrow_mut().push((path.to_string(), reveal));
        });
        Ok(())
    }

    fn record_open_resume_in_terminal_call(
        payload: OpenResumeInTerminalPayload,
    ) -> CommandResult<()> {
        OPEN_RESUME_IN_TERMINAL_CALLS.with(|calls| {
            calls.borrow_mut().push((
                payload.source_tool,
                payload.source_id,
                payload.workspace_path,
                payload.terminal_preference,
            ));
        });
        Ok(())
    }

    #[test]
    fn install_export_file_dialog_for_test_should_only_affect_current_thread() {
        fn return_none(_: &str) -> Option<PathBuf> {
            CALLED_OVERRIDE.with(|flag| flag.set(true));
            None
        }

        let _guard = install_export_file_dialog_for_test(return_none);
        let _ = choose_export_target("current-thread.md");
        let current_thread_called = CALLED_OVERRIDE.with(Cell::get);
        assert!(current_thread_called);

        let other_thread_override_missing = std::thread::spawn(|| {
            assert!(test_export_file_dialog_override().is_none());
            CALLED_OVERRIDE.with(Cell::get)
        })
        .join()
        .expect("thread should finish");

        assert!(!other_thread_override_missing);
    }

    #[test]
    fn export_session_markdown_should_return_canceled_when_dialog_is_dismissed() {
        let _guard = install_export_file_dialog_for_test(|_| None);
        let resolver = resolver_failing("cancel branch should not resolve db path");

        let result = export_session_markdown_with(
            &resolver,
            ExportSessionMarkdownPayload {
                source_tool: "codex".to_string(),
                source_id: "session-export-cancel-001".to_string(),
                include_subagent: None,
                target_path: None,
            },
        )
        .expect("cancel branch should return Ok response");

        assert!(result.canceled);
        assert_eq!(result.path, "");
    }

    #[test]
    fn with_default_db_path_should_forward_resolved_path() {
        let expected = PathBuf::from(r"D:\stable\ai-session-manager.db");
        let resolver = resolver_returning(expected.clone());
        let mut captured: Option<PathBuf> = None;

        let result = with_default_db_path(&resolver, |path| {
            captured = Some(path.to_path_buf());
            Ok::<_, CommandError>("ok".to_string())
        })
        .expect("path should forward");

        assert_eq!(result, "ok");
        assert_eq!(captured, Some(expected));
    }

    #[test]
    fn with_default_db_path_should_return_resolver_error() {
        let resolver = resolver_failing("无法解析应用数据目录");

        let err = with_default_db_path(&resolver, |_| Ok::<_, CommandError>(()))
            .expect_err("resolver error should bubble up");

        assert_eq!(err.code, "internal_error");
        assert_eq!(err.message, "无法解析应用数据目录");
    }

    #[test]
    fn open_in_explorer_should_forward_payload_to_handler() {
        OPEN_IN_EXPLORER_CALLS.with(|calls| calls.borrow_mut().clear());

        open_in_explorer_with(
            OpenInExplorerPayload {
                path: "D:\\temp\\session.md".to_string(),
                reveal: None,
            },
            record_open_in_explorer_call,
        )
        .expect("default reveal should forward");

        open_in_explorer_with(
            OpenInExplorerPayload {
                path: "D:\\temp\\session.md".to_string(),
                reveal: Some(true),
            },
            record_open_in_explorer_call,
        )
        .expect("explicit reveal should forward");

        OPEN_IN_EXPLORER_CALLS.with(|calls| {
            assert_eq!(
                calls.borrow().as_slice(),
                &[
                    ("D:\\temp\\session.md".to_string(), false),
                    ("D:\\temp\\session.md".to_string(), true),
                ]
            );
        });
    }

    #[test]
    fn get_platform_capabilities_should_include_auto_terminal_option() {
        let capabilities = super::get_platform_capabilities().expect("capabilities should load");

        assert!(!capabilities.os.is_empty());
        assert!(capabilities
            .terminal_options
            .iter()
            .any(|item| item.id == "auto"));
    }

    #[test]
    fn open_resume_in_terminal_should_forward_payload_to_handler() {
        OPEN_RESUME_IN_TERMINAL_CALLS.with(|calls| calls.borrow_mut().clear());

        open_resume_in_terminal_with(
            OpenResumeInTerminalPayload {
                source_tool: "codex".to_string(),
                source_id: "session-123".to_string(),
                workspace_path: "D:\\Works\\demo".to_string(),
                terminal_preference: Some("cmd".to_string()),
            },
            record_open_resume_in_terminal_call,
        )
        .expect("payload should forward");

        OPEN_RESUME_IN_TERMINAL_CALLS.with(|calls| {
            assert_eq!(
                calls.borrow().as_slice(),
                &[(
                    "codex".to_string(),
                    "session-123".to_string(),
                    "D:\\Works\\demo".to_string(),
                    Some("cmd".to_string()),
                )]
            );
        });
    }
}
