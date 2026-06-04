use ai_session_manager::application::session_query_service::load_overview_summary;
use ai_session_manager::application::session_settings_service::{
    load_app_settings, update_app_settings, ScanSourcesRecord, UpdateAppSettingsRequest,
};
use ai_session_manager::db::migrate::init_db;
use rusqlite::{params, Connection};
use tempfile::tempdir;

#[test]
fn load_overview_summary_should_exclude_subagents_and_aggregate_trash_counts() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("overview-settings.db");
    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "insert into sessions(
            source_tool, source_id, title, source_path, workspace_path, is_subagent,
            parent_source_id, started_at, updated_at, source_file_size, deleted_by_user, deleted_at
         ) values(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            "codex",
            "main-1",
            "Main 1",
            "D:\\temp\\main-1.jsonl",
            "D:\\workspace-a",
            0,
            Option::<String>::None,
            "2026-05-01 09:00:00",
            "2099-05-01 09:00:00",
            1024,
            0,
            Option::<String>::None,
        ],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(
            source_tool, source_id, title, source_path, workspace_path, is_subagent,
            parent_source_id, started_at, updated_at, source_file_size, deleted_by_user, deleted_at
         ) values(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            "claude",
            "main-2",
            "Main 2",
            "D:\\temp\\main-2.jsonl",
            "D:\\workspace-b",
            0,
            Option::<String>::None,
            "2026-05-01 10:00:00",
            "2099-05-01 10:00:00",
            2048,
            0,
            Option::<String>::None,
        ],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(
            source_tool, source_id, title, source_path, workspace_path, is_subagent,
            parent_source_id, started_at, updated_at, source_file_size, deleted_by_user, deleted_at
         ) values(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            "codex",
            "sub-1",
            "Sub 1",
            "D:\\temp\\sub-1.jsonl",
            "D:\\workspace-a",
            1,
            "main-1",
            "2026-05-01 09:30:00",
            "2099-05-01 09:30:00",
            512,
            0,
            Option::<String>::None,
        ],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(
            source_tool, source_id, title, source_path, workspace_path, is_subagent,
            parent_source_id, started_at, updated_at, source_file_size, deleted_by_user, deleted_at
         ) values(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            "codex",
            "trash-1",
            "Trash 1",
            "D:\\temp\\trash-1.jsonl",
            "D:\\workspace-c",
            0,
            Option::<String>::None,
            "2026-04-20 09:00:00",
            "2099-04-20 09:00:00",
            4096,
            1,
            "2099-04-21 09:00:00",
        ],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(
            source_tool, source_id, title, source_path, workspace_path, is_subagent,
            parent_source_id, started_at, updated_at, source_file_size, deleted_by_user, deleted_at
         ) values(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            "codex",
            "trash-sub-1",
            "Trash Sub 1",
            "D:\\temp\\trash-sub-1.jsonl",
            "D:\\workspace-c",
            1,
            "trash-1",
            "2026-04-20 09:10:00",
            "2099-04-20 09:10:00",
            256,
            1,
            "2099-04-21 09:10:00",
        ],
    )
    .unwrap();
    drop(conn);

    let summary = load_overview_summary(&db_path).unwrap();

    assert_eq!(summary.total_workspaces, 2);
    assert_eq!(summary.total_sessions, 2);
    assert_eq!(summary.active_sessions_7d, 2);
    assert_eq!(summary.trash_sessions, 1);
    assert_eq!(summary.total_size_bytes, 3072);
    assert_eq!(summary.tool_stats.len(), 2);
    assert!(summary
        .tool_stats
        .iter()
        .any(|row| row.source_tool == "codex" && row.session_count == 1));
    assert!(summary
        .tool_stats
        .iter()
        .any(|row| row.source_tool == "claude" && row.session_count == 1));
}

#[test]
fn update_app_settings_should_preserve_unspecified_fields() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("app-settings.db");

    let initial = load_app_settings(&db_path).unwrap();
    assert_eq!(initial.theme_mode, "system");
    assert!(!initial.hard_delete);
    assert_eq!(initial.terminal_preference, "auto");
    assert_eq!(
        initial.scan_sources,
        ScanSourcesRecord {
            codex: true,
            claude: true,
            gemini: true,
        }
    );

    let updated = update_app_settings(
        &db_path,
        UpdateAppSettingsRequest {
            theme_mode: Some("dark".to_string()),
            hard_delete: None,
            terminal_preference: Some("cmd".to_string()),
            scan_sources: None,
        },
    )
    .unwrap();

    assert_eq!(updated.theme_mode, "dark");
    assert!(!updated.hard_delete);
    assert_eq!(updated.terminal_preference, "cmd");
    assert_eq!(
        updated.scan_sources,
        ScanSourcesRecord {
            codex: true,
            claude: true,
            gemini: true,
        }
    );

    let reloaded = load_app_settings(&db_path).unwrap();
    assert_eq!(reloaded.theme_mode, "dark");
    assert!(!reloaded.hard_delete);
    assert_eq!(reloaded.terminal_preference, "cmd");
    assert_eq!(
        reloaded.scan_sources,
        ScanSourcesRecord {
            codex: true,
            claude: true,
            gemini: true,
        }
    );
}

#[test]
fn update_app_settings_should_persist_scan_source_strategy() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("app-settings-scan-sources.db");

    let updated = update_app_settings(
        &db_path,
        UpdateAppSettingsRequest {
            theme_mode: None,
            hard_delete: Some(true),
            terminal_preference: None,
            scan_sources: Some(ScanSourcesRecord {
                codex: true,
                claude: false,
                gemini: false,
            }),
        },
    )
    .unwrap();

    assert!(updated.hard_delete);
    assert_eq!(
        updated.scan_sources,
        ScanSourcesRecord {
            codex: true,
            claude: false,
            gemini: false,
        }
    );

    let reloaded = load_app_settings(&db_path).unwrap();
    assert_eq!(
        reloaded.scan_sources,
        ScanSourcesRecord {
            codex: true,
            claude: false,
            gemini: false,
        }
    );
}

#[test]
fn load_app_settings_should_tolerate_default_row_being_created_during_initialization() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("app-settings-race.db");
    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute_batch(
        "create trigger settings_init_race
         before insert on settings
         when new.id = 1
         begin
           insert or ignore into settings(id, theme_mode, hard_delete, terminal_preference)
           values(1, 'system', 0, 'auto');
         end;",
    )
    .unwrap();
    drop(conn);

    let settings = load_app_settings(&db_path).unwrap();
    assert_eq!(settings.theme_mode, "system");
    assert!(!settings.hard_delete);
    assert_eq!(settings.terminal_preference, "auto");
    assert_eq!(
        settings.scan_sources,
        ScanSourcesRecord {
            codex: true,
            claude: true,
            gemini: true,
        }
    );

    let reloaded = load_app_settings(&db_path).unwrap();
    assert_eq!(reloaded.theme_mode, "system");
    assert!(!reloaded.hard_delete);
    assert_eq!(reloaded.terminal_preference, "auto");
    assert_eq!(
        reloaded.scan_sources,
        ScanSourcesRecord {
            codex: true,
            claude: true,
            gemini: true,
        }
    );
}
