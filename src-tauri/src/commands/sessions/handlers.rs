use std::path::Path;

use tauri::Emitter;

use super::mappers::{
    map_app_settings, map_overview_summary, map_session_detail, map_session_list_row,
};
use super::models::{
    AppSettingsResponse, ClearTrashResponse, CommandError, DeleteSessionPayload,
    DeleteSessionResponse, DeleteSessionsPayload, ExportSessionMarkdownPayload, ExportSessionMarkdownResponse,
    GetSessionDetailPayload, ListSessionsPayload, ListSubagentSessionsPayload,
    OpenExternalUrlPayload, OpenResumeInTerminalPayload, OverviewSummaryResponse,
    RestoreSessionPayload, RestoreSessionResponse, ScanSourcesPayload, SessionDetailResponse,
    SessionListResponse, UpdateAppSettingsPayload,
};
use crate::application::session_admin_service::{
    clear_trash as clear_trash_service, clear_trash_with_progress as clear_trash_with_progress_service,
    delete_session as delete_session_service, delete_sessions as delete_sessions_service,
    delete_sessions_with_progress as delete_sessions_with_progress_service,
    export_session_markdown as export_session_markdown_service,
    restore_session as restore_session_service, validate_open_in_explorer_payload,
    validate_resume_payload, DeleteSessionRequest, DeleteSessionTarget, DeleteSessionsRequest,
    ExportSessionMarkdownRequest, RestoreSessionRequest,
};
use crate::application::session_query_service::{
    load_overview_summary, load_session_detail, load_session_list, load_subagent_sessions,
    SessionDetailRequest, SessionListRequest, SessionListScope as AppSessionListScope,
    SubagentSessionsRequest,
};
use crate::application::session_runtime_service::{
    open_in_explorer as open_in_explorer_service,
    open_resume_in_terminal as open_resume_in_terminal_service, OpenInExplorerRequest,
    ResumeSessionRequest,
};
use crate::application::session_settings_service::{
    load_app_settings as load_app_settings_record,
    update_app_settings as update_app_settings_record, ScanSourcesRecord, UpdateAppSettingsRequest,
};
use crate::db::migrate::init_db;
use crate::domain::safety::{normalize_page, normalize_page_size};
use crate::services::sync_service::RefreshSummary;

pub type CommandResult<T> = Result<T, CommandError>;

fn invalid_argument(message: impl Into<String>) -> CommandError {
    CommandError {
        code: "invalid_argument".to_string(),
        message: message.into(),
    }
}

fn not_found(message: impl Into<String>) -> CommandError {
    CommandError {
        code: "not_found".to_string(),
        message: message.into(),
    }
}

fn unsupported_operation(message: impl Into<String>) -> CommandError {
    CommandError {
        code: "unsupported_operation".to_string(),
        message: message.into(),
    }
}

fn internal_error(message: impl Into<String>) -> CommandError {
    CommandError {
        code: "internal_error".to_string(),
        message: message.into(),
    }
}

fn map_anyhow_error(error: anyhow::Error) -> CommandError {
    let message = error.to_string();
    if message == "session not found" {
        return not_found(message);
    }

    if message == "unsupported source tool"
        || message.starts_with("unsupported terminal preference:")
    {
        return unsupported_operation(message);
    }

    if message.starts_with("invalid ")
        || message.starts_with("workspace_path is not a directory:")
        || message.starts_with("path does not exist")
        || message.starts_with("export target path is a directory")
        || message.starts_with("failed to read metadata for ")
        || message.starts_with("source path is empty")
        || message.starts_with("source path is a directory")
    {
        return invalid_argument(message);
    }

    internal_error(message)
}

fn normalize_pagination(payload: &ListSessionsPayload) -> (i64, i64) {
    (
        normalize_page(payload.page),
        normalize_page_size(payload.page_size),
    )
}

fn merge_scan_sources(
    current: &AppSettingsResponse,
    payload: Option<ScanSourcesPayload>,
) -> Option<ScanSourcesRecord> {
    let payload = payload?;
    Some(ScanSourcesRecord {
        codex: payload.codex.unwrap_or(current.scan_sources.codex),
        claude: payload.claude.unwrap_or(current.scan_sources.claude),
        gemini: payload.gemini.unwrap_or(current.scan_sources.gemini),
    })
}

pub fn refresh_sessions_at(db_path: &Path, codex_dir: &Path) -> CommandResult<RefreshSummary> {
    init_db(db_path).map_err(map_anyhow_error)?;
    let settings = load_app_settings_record(db_path).map_err(map_anyhow_error)?;
    crate::services::sync_service::refresh_home_sessions_with_sources(
        db_path,
        codex_dir,
        &settings.scan_sources,
    )
    .map_err(map_anyhow_error)
}

pub fn list_sessions_at(
    db_path: &Path,
    payload: ListSessionsPayload,
) -> CommandResult<SessionListResponse> {
    let (page, page_size) = normalize_pagination(&payload);
    let rows = load_session_list(
        db_path,
        SessionListRequest {
            scope: AppSessionListScope::Active,
            tool: payload.tool,
            workspace_path: payload.workspace_path,
            keyword: payload.keyword,
            updated_within_days: payload.updated_within_days,
            page,
            page_size,
        },
    )
    .map_err(map_anyhow_error)?;

    Ok(SessionListResponse {
        rows: rows.into_iter().map(map_session_list_row).collect(),
        page,
        page_size,
    })
}

pub fn list_trash_sessions_at(
    db_path: &Path,
    payload: ListSessionsPayload,
) -> CommandResult<SessionListResponse> {
    let (page, page_size) = normalize_pagination(&payload);
    let rows = load_session_list(
        db_path,
        SessionListRequest {
            scope: AppSessionListScope::Trash,
            tool: payload.tool,
            workspace_path: payload.workspace_path,
            keyword: payload.keyword,
            updated_within_days: payload.updated_within_days,
            page,
            page_size,
        },
    )
    .map_err(map_anyhow_error)?;
    Ok(SessionListResponse {
        rows: rows.into_iter().map(map_session_list_row).collect(),
        page,
        page_size,
    })
}

pub fn get_session_detail_at(
    db_path: &Path,
    payload: GetSessionDetailPayload,
) -> CommandResult<SessionDetailResponse> {
    let detail = load_session_detail(
        db_path,
        SessionDetailRequest {
            source_tool: payload.source_tool,
            source_id: payload.source_id,
            include_subagent: payload.include_subagent.unwrap_or(false),
            in_trash: payload.in_trash.unwrap_or(false),
            message_limit: payload.message_limit,
        },
    )
    .map_err(map_anyhow_error)?
    .map(map_session_detail);

    Ok(SessionDetailResponse { detail })
}

pub fn list_subagent_sessions_at(
    db_path: &Path,
    payload: ListSubagentSessionsPayload,
) -> CommandResult<SessionListResponse> {
    let rows = load_subagent_sessions(
        db_path,
        SubagentSessionsRequest {
            source_tool: payload.source_tool,
            parent_source_id: payload.parent_source_id,
            in_trash: payload.in_trash.unwrap_or(false),
        },
    )
    .map_err(map_anyhow_error)?;
    let page_size = rows.len() as i64;

    Ok(SessionListResponse {
        rows: rows.into_iter().map(map_session_list_row).collect(),
        page: 1,
        page_size,
    })
}

pub fn get_overview_summary_at(db_path: &Path) -> CommandResult<OverviewSummaryResponse> {
    load_overview_summary(db_path)
        .map(map_overview_summary)
        .map_err(map_anyhow_error)
}

pub fn get_app_settings_at(db_path: &Path) -> CommandResult<AppSettingsResponse> {
    load_app_settings_record(db_path)
        .map(map_app_settings)
        .map_err(map_anyhow_error)
}

pub fn update_app_settings_at(
    db_path: &Path,
    payload: UpdateAppSettingsPayload,
) -> CommandResult<AppSettingsResponse> {
    let current = get_app_settings_at(db_path)?;
    update_app_settings_record(
        db_path,
        UpdateAppSettingsRequest {
            theme_mode: payload.theme_mode,
            hard_delete: payload.hard_delete,
            terminal_preference: payload.terminal_preference,
            scan_sources: merge_scan_sources(&current, payload.scan_sources),
        },
    )
    .map(map_app_settings)
    .map_err(map_anyhow_error)
}

pub fn delete_session_at(
    db_path: &Path,
    payload: DeleteSessionPayload,
) -> CommandResult<DeleteSessionResponse> {
    let result = delete_session_service(
        db_path,
        DeleteSessionRequest {
            source_tool: payload.source_tool,
            source_id: payload.source_id,
            hard_delete: payload.hard_delete.unwrap_or(false),
            cascade_subagents: payload.cascade_subagents.unwrap_or(true),
        },
    )
    .map_err(map_anyhow_error)?;
    Ok(DeleteSessionResponse {
        deleted_sessions: result.deleted_sessions,
        deleted_source_files: result.deleted_source_files,
        warnings: result.warnings,
    })
}

pub fn delete_sessions_at(
    db_path: &Path,
    payload: DeleteSessionsPayload,
) -> CommandResult<DeleteSessionResponse> {
    let result = delete_sessions_service(
        db_path,
        DeleteSessionsRequest {
            targets: payload
                .targets
                .into_iter()
                .map(|target| DeleteSessionTarget {
                    source_tool: target.source_tool,
                    source_id: target.source_id,
                })
                .collect(),
            hard_delete: payload.hard_delete.unwrap_or(false),
            cascade_subagents: payload.cascade_subagents.unwrap_or(true),
        },
    )
    .map_err(map_anyhow_error)?;
    Ok(DeleteSessionResponse {
        deleted_sessions: result.deleted_sessions,
        deleted_source_files: result.deleted_source_files,
        warnings: result.warnings,
    })
}

pub fn delete_sessions_with_app_at(
    app: &tauri::AppHandle,
    db_path: &Path,
    payload: DeleteSessionsPayload,
) -> CommandResult<DeleteSessionResponse> {
    let result = delete_sessions_with_progress_service(
        db_path,
        DeleteSessionsRequest {
            targets: payload
                .targets
                .into_iter()
                .map(|target| DeleteSessionTarget {
                    source_tool: target.source_tool,
                    source_id: target.source_id,
                })
                .collect(),
            hard_delete: payload.hard_delete.unwrap_or(false),
            cascade_subagents: payload.cascade_subagents.unwrap_or(true),
        },
        200,
        |progress| {
            let _ = app.emit("trash-clear-progress", &progress);
        },
    )
    .map_err(map_anyhow_error)?;
    Ok(DeleteSessionResponse {
        deleted_sessions: result.deleted_sessions,
        deleted_source_files: result.deleted_source_files,
        warnings: result.warnings,
    })
}

pub fn restore_session_at(
    db_path: &Path,
    payload: RestoreSessionPayload,
) -> CommandResult<RestoreSessionResponse> {
    let restored = restore_session_service(
        db_path,
        RestoreSessionRequest {
            source_tool: payload.source_tool,
            source_id: payload.source_id,
            cascade_subagents: payload.cascade_subagents.unwrap_or(true),
        },
    )
    .map_err(map_anyhow_error)?;
    Ok(RestoreSessionResponse {
        restored_sessions: restored,
    })
}

pub fn clear_trash_with_app_at(
    app: &tauri::AppHandle,
    db_path: &Path,
) -> CommandResult<ClearTrashResponse> {
    let result = clear_trash_with_progress_service(db_path, 200, |progress| {
        let _ = app.emit("trash-clear-progress", &progress);
    })
    .map_err(map_anyhow_error)?;
    Ok(ClearTrashResponse {
        deleted_sessions: result.deleted_sessions,
        deleted_source_files: result.deleted_source_files,
        warnings: result.warnings,
    })
}

pub fn clear_trash_at(db_path: &Path) -> CommandResult<ClearTrashResponse> {
    let result = clear_trash_service(db_path).map_err(map_anyhow_error)?;
    Ok(ClearTrashResponse {
        deleted_sessions: result.deleted_sessions,
        deleted_source_files: result.deleted_source_files,
        warnings: result.warnings,
    })
}

pub fn export_session_markdown_at(
    db_path: &Path,
    payload: ExportSessionMarkdownPayload,
) -> CommandResult<ExportSessionMarkdownResponse> {
    let exported = export_session_markdown_service(
        db_path,
        ExportSessionMarkdownRequest {
            source_tool: payload.source_tool,
            source_id: payload.source_id,
            include_subagent: payload.include_subagent.unwrap_or(false),
            target_path: payload.target_path,
        },
    )
    .map_err(map_anyhow_error)?;
    Ok(ExportSessionMarkdownResponse {
        path: exported.path.to_string_lossy().to_string(),
        canceled: false,
    })
}

pub fn open_in_explorer_at(path: &str, reveal: bool) -> CommandResult<()> {
    let validated = validate_open_in_explorer_payload(path, reveal).map_err(map_anyhow_error)?;

    open_in_explorer_service(OpenInExplorerRequest {
        path: validated.path,
        reveal: validated.reveal,
    })
    .map_err(map_anyhow_error)
}

pub fn open_resume_in_terminal_at(payload: OpenResumeInTerminalPayload) -> CommandResult<()> {
    let validated = validate_resume_payload(
        &payload.source_tool,
        &payload.source_id,
        &payload.workspace_path,
    )
    .map_err(map_anyhow_error)?;

    open_resume_in_terminal_service(
        ResumeSessionRequest {
            source_tool: validated.source_tool,
            source_id: validated.source_id,
            workspace_path: validated.workspace_path,
        },
        payload.terminal_preference,
    )
    .map_err(map_anyhow_error)
}

pub fn open_external_url_at(
    _app: tauri::AppHandle,
    payload: OpenExternalUrlPayload,
) -> CommandResult<()> {
    tauri_plugin_opener::open_url(payload.url, None::<String>)
        .map_err(|error| internal_error(error.to_string()))
}
