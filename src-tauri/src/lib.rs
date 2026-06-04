use std::time::Duration;
use tauri::Manager;

pub mod application;
pub mod commands;
pub mod db;
pub mod domain;
pub mod parsers;
pub mod path_identity;
pub mod path_utils;
pub mod platform;
pub mod services;
pub mod time_utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let resolver = commands::sessions::DbPathResolver::new(app.handle().clone());
            let db_path = resolver.db_path().map(|path| path.to_path_buf());
            app.manage(resolver);

            if let Ok(db_path) = db_path {
                let codex_dir = application::session_runtime_service::default_codex_dir();
                let home_dir = codex_dir
                    .parent()
                    .map(|path| path.to_path_buf())
                    .unwrap_or_else(|| std::path::PathBuf::from("."));
                let scan_sources =
                    application::session_settings_service::load_app_settings(&db_path)
                        .map(|settings| settings.scan_sources)
                        .unwrap_or_default();
                if let Err(err) = services::watcher::start_default_watcher(
                    db_path,
                    home_dir,
                    codex_dir,
                    scan_sources,
                    Duration::from_millis(250),
                ) {
                    eprintln!("[warn] watcher.start error={err}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sessions::refresh_sessions,
            commands::sessions::list_sessions,
            commands::sessions::list_trash_sessions,
            commands::sessions::get_overview_summary,
            commands::sessions::get_app_settings,
            commands::sessions::update_app_settings,
            commands::sessions::get_session_detail,
            commands::sessions::list_subagent_sessions,
            commands::sessions::delete_session,
            commands::sessions::delete_sessions,
            commands::sessions::restore_session,
            commands::sessions::clear_trash,
            commands::sessions::export_session_markdown,
            commands::sessions::get_runtime_workspace,
            commands::sessions::get_app_version,
            commands::sessions::get_platform_capabilities,
            commands::sessions::open_in_explorer,
            commands::sessions::open_resume_in_terminal,
            commands::sessions::open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
