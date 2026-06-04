use ai_session_manager::application::session_admin_service::purge_deleted_session_ids;
use ai_session_manager::commands::sessions::{
    clear_trash_at, delete_session_at, delete_sessions_at, export_session_markdown_at,
    get_runtime_workspace, get_session_detail_at, list_sessions_at, list_subagent_sessions_at,
    open_in_explorer_at, open_resume_in_terminal_at, refresh_sessions_at, update_app_settings_at,
    DeleteSessionPayload, DeleteSessionsPayload, DeleteSessionTargetPayload,
    ExportSessionMarkdownPayload, GetSessionDetailPayload, ListSessionsPayload,
    ListSubagentSessionsPayload, OpenResumeInTerminalPayload, ScanSourcesPayload,
    UpdateAppSettingsPayload,
};
use ai_session_manager::db::migrate::init_db;
use rusqlite::Connection;
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tempfile::tempdir;

#[test]
fn sessions_commands_should_refresh_list_and_get_detail_with_real_data() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions.db");
    init_db(&db_path).unwrap();

    let codex_dir = td.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("session.json"),
        r#"{
  "session_id": "session_cmd_001",
  "title": "Command Integration Session",
  "updated_at": "2026-04-24T12:00:00Z",
  "messages": [
    {
      "role": "user",
      "content": "第一条",
      "created_at": "2026-04-24T11:59:00Z"
    },
    {
      "role": "assistant",
      "content": "第二条",
      "created_at": "2026-04-24T12:00:00Z"
    }
  ]
}"#,
    )
    .unwrap();

    let refresh = refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    assert!(refresh.indexed_sessions > 0);

    let list = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("codex".to_string()),
            workspace_path: None,
            keyword: None,
            updated_within_days: None,
            page: 1,
            page_size: 20,
        },
    )
    .unwrap();
    assert!(!list.rows.is_empty());
    assert_eq!(list.rows[0].source_tool, "codex");
    assert_eq!(list.rows[0].source_id, "session_cmd_001");
    assert_eq!(list.rows[0].title, "Command Integration Session");
    assert!(!list.rows[0].created_at.is_empty());
    let conn = Connection::open(&db_path).unwrap();
    let messages_before_detail: i64 = conn
        .query_row(
            "select count(*) from messages where session_id=(select id from sessions where source_tool='codex' and source_id='session_cmd_001')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(messages_before_detail, 0);
    drop(conn);

    let first = &list.rows[0];
    let detail = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: first.source_tool.clone(),
            source_id: first.source_id.clone(),
            include_subagent: None,
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap();

    let list_json = serde_json::to_value(&list).unwrap();
    assert_eq!(list_json["rows"][0]["sourceTool"], json!("codex"));
    assert_eq!(list_json["rows"][0]["sourceId"], json!("session_cmd_001"));
    assert_eq!(
        list_json["rows"][0]["title"],
        json!("Command Integration Session")
    );
    assert_eq!(
        list_json["rows"][0]["createdAt"],
        json!("2026-04-24 19:59:00")
    );
    assert!(list_json["rows"][0].get("source_tool").is_none());
    assert!(list_json["rows"][0].get("source_id").is_none());

    let detail_data = detail.detail.as_ref().expect("detail should exist");
    assert_eq!(detail_data.source_tool, "codex");
    assert_eq!(detail_data.source_id, "session_cmd_001");
    assert_eq!(detail_data.title, "Command Integration Session");
    assert_eq!(detail_data.created_at, "2026-04-24 19:59:00");
    assert!(detail_data.size_bytes > 0);
    assert_eq!(detail_data.input_tokens, 0);
    assert_eq!(detail_data.output_tokens, 0);
    assert_eq!(detail_data.messages.len(), 2);
    assert_eq!(detail_data.messages[0].role, "user");
    assert_eq!(detail_data.messages[0].content, "第一条");
    assert_eq!(detail_data.messages[0].created_at, "2026-04-24 19:59:00");
    assert_eq!(detail_data.messages[1].role, "assistant");
    assert_eq!(detail_data.messages[1].content, "第二条");
    assert_eq!(detail_data.messages[1].created_at, "2026-04-24 20:00:00");

    let conn = Connection::open(&db_path).unwrap();
    let messages_after_detail: i64 = conn
        .query_row(
            "select count(*) from messages where session_id=(select id from sessions where source_tool='codex' and source_id='session_cmd_001')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(messages_after_detail, 2);
    drop(conn);

    let detail_json = serde_json::to_value(&detail).unwrap();
    assert_eq!(detail_json["detail"]["sourceTool"], json!("codex"));
    assert_eq!(detail_json["detail"]["sourceId"], json!("session_cmd_001"));
    assert_eq!(
        detail_json["detail"]["title"],
        json!("Command Integration Session")
    );
    assert_eq!(
        detail_json["detail"]["createdAt"],
        json!("2026-04-24 19:59:00")
    );
    assert!(detail_json["detail"]["sizeBytes"].as_i64().unwrap_or(0) > 0);
    assert_eq!(detail_json["detail"]["inputTokens"], json!(0));
    assert_eq!(detail_json["detail"]["outputTokens"], json!(0));
    assert_eq!(
        detail_json["detail"]["messages"][0]["createdAt"],
        json!("2026-04-24 19:59:00")
    );
    assert!(detail_json["detail"].get("session").is_none());
    assert!(detail_json["detail"]["messages"][0].get("seq").is_none());
}

#[test]
fn sessions_commands_should_scan_claude_project_sessions_from_home_path() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions.db");
    init_db(&db_path).unwrap();

    let codex_dir = td.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();

    let claude_project_dir = td
        .path()
        .join(".claude")
        .join("projects")
        .join("D--Works-demo");
    fs::create_dir_all(&claude_project_dir).unwrap();
    fs::write(
        claude_project_dir.join("11111111-2222-3333-4444-555555555555.jsonl"),
        r#"{"type":"permission-mode","permissionMode":"default","sessionId":"11111111-2222-3333-4444-555555555555"}
{"type":"user","isMeta":false,"timestamp":"2026-04-12T01:40:01.764Z","cwd":"D:\\Works\\demo","sessionId":"11111111-2222-3333-4444-555555555555","message":{"role":"user","content":"你好 Claude"}}
{"type":"assistant","isMeta":false,"timestamp":"2026-04-12T01:40:07.091Z","cwd":"D:\\Works\\demo","sessionId":"11111111-2222-3333-4444-555555555555","message":{"role":"assistant","content":[{"type":"text","text":"你好！"}]}}"#,
    )
    .unwrap();

    let refresh = refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    assert_eq!(refresh.scanned_files, 1);
    assert_eq!(refresh.failed_files, 0);

    let list = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("claude".to_string()),
            workspace_path: None,
            keyword: None,
            updated_within_days: None,
            page: 1,
            page_size: 20,
        },
    )
    .unwrap();
    assert_eq!(list.rows.len(), 1);
    assert_eq!(list.rows[0].source_tool, "claude");
    assert_eq!(list.rows[0].workspace_path, "D:\\Works\\demo");
}

#[test]
fn sessions_commands_should_scan_gemini_project_sessions_from_home_path() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions.db");
    init_db(&db_path).unwrap();

    let codex_dir = td.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();

    let gemini_project_dir = td.path().join(".gemini").join("tmp").join("D--Works-music");
    let chats_dir = gemini_project_dir.join("chats");
    fs::create_dir_all(&chats_dir).unwrap();
    fs::write(gemini_project_dir.join(".project_root"), "D:\\Works\\music").unwrap();
    fs::write(
        chats_dir.join("session-5a287105-f132-46fb-a4a1-1d45b425dc4d.jsonl"),
        r#"{"sessionId":"5a287105-f132-46fb-a4a1-1d45b425dc4d","startTime":"2026-04-27T02:00:00.000Z","lastUpdated":"2026-04-27T02:05:00.000Z","kind":"main"}
{"type":"user","timestamp":"2026-04-27T02:00:01.000Z","content":[{"text":"帮我整理目录"}]}
{"type":"gemini","timestamp":"2026-04-27T02:00:02.000Z","content":"好的，先扫描目录结构。","tokens":{"input":15,"output":9}}"#,
    )
    .unwrap();

    let refresh = refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    assert_eq!(refresh.failed_files, 0);
    assert!(refresh.indexed_sessions >= 1);

    let list = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("gemini".to_string()),
            workspace_path: None,
            keyword: None,
            updated_within_days: None,
            page: 1,
            page_size: 20,
        },
    )
    .unwrap();
    assert_eq!(list.rows.len(), 1);
    assert_eq!(list.rows[0].source_tool, "gemini");
    assert_eq!(list.rows[0].workspace_path, "D:\\Works\\music");

    let detail = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "gemini".to_string(),
            source_id: "5a287105-f132-46fb-a4a1-1d45b425dc4d".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap()
    .detail
    .expect("gemini detail should exist");
    assert_eq!(detail.input_tokens, 15);
    assert_eq!(detail.output_tokens, 9);
    assert!(detail
        .messages
        .iter()
        .any(|m| m.content.contains("帮我整理目录")));
}

#[test]
fn refresh_sessions_should_respect_persisted_scan_source_strategy() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-scan-settings.db");
    init_db(&db_path).unwrap();

    let codex_dir = td.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("session.json"),
        r#"{
  "session_id": "codex-only-1",
  "title": "Codex Session",
  "updated_at": "2026-04-24T12:00:00Z",
  "messages": [{"role":"user","content":"hello","created_at":"2026-04-24T11:59:00Z"}]
}"#,
    )
    .unwrap();

    let claude_project_dir = td.path().join(".claude").join("projects").join("demo");
    fs::create_dir_all(&claude_project_dir).unwrap();
    fs::write(
        claude_project_dir.join("11111111-2222-3333-4444-555555555555.jsonl"),
        r#"{"type":"user","isMeta":false,"timestamp":"2026-04-12T01:40:01.764Z","cwd":"D:\\Works\\demo","sessionId":"11111111-2222-3333-4444-555555555555","message":{"role":"user","content":"你好 Claude"}}"#,
    )
    .unwrap();

    let gemini_project_dir = td.path().join(".gemini").join("tmp").join("D--Works-music");
    let chats_dir = gemini_project_dir.join("chats");
    fs::create_dir_all(&chats_dir).unwrap();
    fs::write(
        chats_dir.join("session-5a287105-f132-46fb-a4a1-1d45b425dc4d.jsonl"),
        r#"{"sessionId":"5a287105-f132-46fb-a4a1-1d45b425dc4d","startTime":"2026-04-27T02:00:00.000Z","lastUpdated":"2026-04-27T02:05:00.000Z","kind":"main"}"#,
    )
    .unwrap();

    update_app_settings_at(
        &db_path,
        UpdateAppSettingsPayload {
            theme_mode: None,
            hard_delete: None,
            terminal_preference: None,
            scan_sources: Some(ScanSourcesPayload {
                codex: Some(true),
                claude: Some(false),
                gemini: Some(false),
            }),
        },
    )
    .unwrap();

    let refresh = refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    assert_eq!(refresh.scanned_files, 1);
    assert_eq!(refresh.indexed_sessions, 1);
    assert_eq!(refresh.failed_files, 0);

    let codex_list = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("codex".to_string()),
            workspace_path: None,
            keyword: None,
            updated_within_days: None,
            page: 1,
            page_size: 20,
        },
    )
    .unwrap();
    assert_eq!(codex_list.rows.len(), 1);

    let claude_list = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("claude".to_string()),
            workspace_path: None,
            keyword: None,
            updated_within_days: None,
            page: 1,
            page_size: 20,
        },
    )
    .unwrap();
    assert!(claude_list.rows.is_empty());

    let gemini_list = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("gemini".to_string()),
            workspace_path: None,
            keyword: None,
            updated_within_days: None,
            page: 1,
            page_size: 20,
        },
    )
    .unwrap();
    assert!(gemini_list.rows.is_empty());
}

#[test]
fn sessions_commands_should_index_rollout_jsonl_from_real_codex_shape() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-rollout.db");
    init_db(&db_path).unwrap();

    let codex_dir = td.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("rollout.jsonl"),
        r#"{"timestamp":"2026-04-21T13:04:45.967Z","type":"session_meta","payload":{"id":"019db023-0fc9-7820-842a-dca6d4b9e6e7","timestamp":"2026-04-21T13:03:01.079Z","cwd":"D:\\Works\\demo"}}
{"timestamp":"2026-04-21T13:04:56.628Z","type":"event_msg","payload":{"type":"user_message","message":"请帮我分析这个仓库"}}
{"timestamp":"2026-04-21T13:05:07.399Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"扫描完成，已定位关键模块。"}]}}"#,
    )
    .unwrap();

    let refresh = refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    assert_eq!(refresh.scanned_files, 1);
    assert_eq!(refresh.indexed_sessions, 1);
    assert_eq!(refresh.failed_files, 0);

    let list = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("codex".to_string()),
            workspace_path: None,
            keyword: None,
            updated_within_days: None,
            page: 1,
            page_size: 20,
        },
    )
    .unwrap();
    assert_eq!(list.rows.len(), 1);
    assert_eq!(
        list.rows[0].source_id,
        "019db023-0fc9-7820-842a-dca6d4b9e6e7"
    );
    assert_eq!(list.rows[0].workspace_path, "D:\\Works\\demo");

    let conn = Connection::open(&db_path).unwrap();
    let stored_paths: (String, String, String, String) = conn
        .query_row(
            "select source_path, source_path_key, workspace_path, workspace_path_key
             from sessions
             where source_tool='codex' and source_id='019db023-0fc9-7820-842a-dca6d4b9e6e7'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap();
    drop(conn);
    assert!(stored_paths.0.ends_with("rollout.jsonl"));
    assert!(stored_paths.1.ends_with("rollout.jsonl"));
    assert_eq!(stored_paths.2, "D:\\Works\\demo");
    assert_eq!(stored_paths.3, "d:/works/demo");

    let detail = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "019db023-0fc9-7820-842a-dca6d4b9e6e7".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap();
    let detail = detail.detail.expect("detail should exist");
    assert_eq!(detail.workspace_path, "D:\\Works\\demo");
    assert!(detail
        .messages
        .iter()
        .any(|m| m.role == "user" && m.content == "请帮我分析这个仓库"));
    assert!(detail
        .messages
        .iter()
        .any(|m| m.role == "assistant" && m.content == "扫描完成，已定位关键模块。"));
}

#[test]
fn export_session_markdown_should_write_markdown_file_for_selected_session() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-export.db");
    init_db(&db_path).unwrap();

    let codex_dir = td.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("export-target.jsonl"),
        r#"{"timestamp":"2026-04-21T13:04:45.967Z","type":"session_meta","payload":{"id":"session-export-001","timestamp":"2026-04-21T13:03:01.079Z","cwd":"D:\\Works\\demo"}}
{"timestamp":"2026-04-21T13:04:56.628Z","type":"event_msg","payload":{"type":"user_message","message":"请导出这段会话"}}
{"timestamp":"2026-04-21T13:05:07.399Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"导出功能正常。"}]}}"#,
    )
    .unwrap();
    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    let export_target = td.path().join("exports").join("session-export-001.md");
    let export_target_input = export_target.to_string_lossy().replace('\\', "/");

    let exported = export_session_markdown_at(
        &db_path,
        ExportSessionMarkdownPayload {
            source_tool: "codex".to_string(),
            source_id: "session-export-001".to_string(),
            include_subagent: None,
            target_path: Some(export_target_input.clone()),
        },
    )
    .unwrap();
    assert!(!exported.canceled);
    assert_eq!(exported.path, export_target_input);
    let exported_path = PathBuf::from(&exported.path);
    assert!(exported_path.exists());

    let markdown = fs::read_to_string(exported_path).unwrap();
    assert!(markdown.contains("# "));
    assert!(markdown.contains("请导出这段会话"));
    assert!(markdown.contains("导出功能正常。"));
}

#[test]
fn export_session_markdown_should_reject_directory_target() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-export-dir.db");
    let codex_dir = td.path().join(".codex");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("export.json"),
        r#"{"session_id":"export-dir-1","title":"Export Dir","updated_at":"2026-05-01T02:00:00Z","messages":[{"role":"user","content":"hello","created_at":"2026-05-01T02:00:00Z"}]}"#,
    )
    .unwrap();
    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    let result = export_session_markdown_at(
        &db_path,
        ExportSessionMarkdownPayload {
            source_tool: "codex".to_string(),
            source_id: "export-dir-1".to_string(),
            include_subagent: None,
            target_path: Some(td.path().to_string_lossy().to_string()),
        },
    );
    assert!(result.is_err());
}

#[test]
fn delete_session_should_soft_delete_main_and_related_subagent_by_default() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-delete.db");
    init_db(&db_path).unwrap();

    let codex_dir = td.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("main.jsonl"),
        r#"{"timestamp":"2026-04-26T11:00:00.000Z","type":"session_meta","payload":{"id":"main-session-001","timestamp":"2026-04-26T11:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-26T11:00:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"主会话"}}"#,
    )
    .unwrap();
    fs::write(
        codex_dir.join("subagent.jsonl"),
        r#"{"timestamp":"2026-04-26T11:05:00.000Z","type":"session_meta","payload":{"id":"sub-session-001","timestamp":"2026-04-26T11:05:00.000Z","cwd":"D:\\Works\\ai-session","source":{"subagent":{"thread_spawn":{"parent_thread_id":"main-session-001"}}}}}
{"timestamp":"2026-04-26T11:05:01.000Z","type":"event_msg","payload":{"type":"agent_message","message":"子代理会话"}}"#,
    )
    .unwrap();

    let refresh = refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    assert_eq!(refresh.indexed_sessions, 2);

    let deleted = delete_session_at(
        &db_path,
        DeleteSessionPayload {
            source_tool: "codex".to_string(),
            source_id: "main-session-001".to_string(),
            hard_delete: None,
            cascade_subagents: None,
        },
    )
    .unwrap();
    assert_eq!(deleted.deleted_sessions, 2);
    assert_eq!(deleted.deleted_source_files, 0);
    assert!(deleted.warnings.is_empty());

    let conn = Connection::open(&db_path).unwrap();
    let active: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and deleted_at is null",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let deleted_rows: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and source_id in ('main-session-001','sub-session-001') and deleted_at is not null",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let user_deleted_rows: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and source_id in ('main-session-001','sub-session-001') and deleted_by_user=1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(active, 0);
    assert_eq!(deleted_rows, 2);
    assert_eq!(user_deleted_rows, 2);
}

#[test]
fn delete_session_hard_delete_should_remove_source_files_and_rows() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-delete-hard.db");
    init_db(&db_path).unwrap();

    let codex_dir = td.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    let main_path = codex_dir.join("main-hard.jsonl");
    let sub_path = codex_dir.join("sub-hard.jsonl");
    fs::write(
        &main_path,
        r#"{"timestamp":"2026-04-26T11:00:00.000Z","type":"session_meta","payload":{"id":"main-session-hard-001","timestamp":"2026-04-26T11:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-26T11:00:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"主会话-hard"}}"#,
    )
    .unwrap();
    fs::write(
        &sub_path,
        r#"{"timestamp":"2026-04-26T11:05:00.000Z","type":"session_meta","payload":{"id":"sub-session-hard-001","timestamp":"2026-04-26T11:05:00.000Z","cwd":"D:\\Works\\ai-session","source":{"subagent":{"thread_spawn":{"parent_thread_id":"main-session-hard-001"}}}}}
{"timestamp":"2026-04-26T11:05:01.000Z","type":"event_msg","payload":{"type":"agent_message","message":"子代理会话-hard"}}"#,
    )
    .unwrap();

    let refresh = refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    assert_eq!(refresh.indexed_sessions, 2);

    let deleted = delete_session_at(
        &db_path,
        DeleteSessionPayload {
            source_tool: "codex".to_string(),
            source_id: "main-session-hard-001".to_string(),
            hard_delete: Some(true),
            cascade_subagents: None,
        },
    )
    .unwrap();
    assert_eq!(deleted.deleted_sessions, 2);
    assert_eq!(deleted.deleted_source_files, 2);
    assert!(deleted.warnings.is_empty());

    assert!(!main_path.exists());
    assert!(!sub_path.exists());

    let conn = Connection::open(&db_path).unwrap();
    let remaining_rows: i64 = conn
        .query_row("select count(*) from sessions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(remaining_rows, 0);
}

#[test]
fn clear_trash_should_permanently_delete_source_files_and_rows() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-clear-trash.db");
    init_db(&db_path).unwrap();

    let codex_dir = td.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    let main_path = codex_dir.join("main-clear.jsonl");
    fs::write(
        &main_path,
        r#"{"timestamp":"2026-04-26T12:00:00.000Z","type":"session_meta","payload":{"id":"main-session-clear-001","timestamp":"2026-04-26T12:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-26T12:00:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"主会话-clear"}}"#,
    )
    .unwrap();

    let refresh = refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    assert_eq!(refresh.indexed_sessions, 1);

    let deleted = delete_session_at(
        &db_path,
        DeleteSessionPayload {
            source_tool: "codex".to_string(),
            source_id: "main-session-clear-001".to_string(),
            hard_delete: Some(false),
            cascade_subagents: None,
        },
    )
    .unwrap();
    assert_eq!(deleted.deleted_sessions, 1);
    assert_eq!(deleted.deleted_source_files, 0);
    assert!(deleted.warnings.is_empty());
    assert!(main_path.exists());

    let cleared = clear_trash_at(&db_path).unwrap();
    assert_eq!(cleared.deleted_sessions, 1);
    assert_eq!(cleared.deleted_source_files, 1);
    assert!(cleared.warnings.is_empty());
    assert!(!main_path.exists());

    let conn = Connection::open(&db_path).unwrap();
    let remaining_rows: i64 = conn
        .query_row("select count(*) from sessions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(remaining_rows, 0);
}

#[test]
fn clear_trash_should_keep_unsafe_rows_and_return_warning() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-unsafe-trash.db");
    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at, deleted_by_user, deleted_at)
         values(?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
        (
            "codex",
            "unsafe-trash-session",
            "Unsafe Trash",
            td.path().to_string_lossy().to_string(),
            td.path().to_string_lossy().to_string(),
            "2026-05-01 10:00:00",
            "2026-05-01 10:01:00",
        ),
    )
    .unwrap();
    drop(conn);

    let result = clear_trash_at(&db_path).unwrap();
    assert_eq!(result.deleted_sessions, 0);
    assert_eq!(
        result.warnings,
        vec![format!(
            "{}: source path is a directory, refused to delete",
            td.path().to_string_lossy()
        )]
    );
    assert_eq!(result.warnings.len(), 1);

    let conn = Connection::open(&db_path).unwrap();
    let remaining: i64 = conn
        .query_row(
            "select count(*) from sessions where source_id='unsafe-trash-session'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(remaining, 1);
}

#[test]
fn delete_sessions_at_should_hard_delete_multiple_trash_targets_in_one_call() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-delete-batch-hard.db");
    init_db(&db_path).unwrap();

    let codex_dir = td.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    let first_path = codex_dir.join("trash-batch-1.jsonl");
    let second_path = codex_dir.join("trash-batch-2.jsonl");
    fs::write(
        &first_path,
        r#"{"timestamp":"2026-04-26T12:00:00.000Z","type":"session_meta","payload":{"id":"trash-batch-1","timestamp":"2026-04-26T12:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-26T12:00:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"batch-1"}}"#,
    )
    .unwrap();
    fs::write(
        &second_path,
        r#"{"timestamp":"2026-04-26T12:10:00.000Z","type":"session_meta","payload":{"id":"trash-batch-2","timestamp":"2026-04-26T12:10:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-26T12:10:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"batch-2"}}"#,
    )
    .unwrap();

    let refresh = refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    assert_eq!(refresh.indexed_sessions, 2);

    for source_id in ["trash-batch-1", "trash-batch-2"] {
        let deleted = delete_session_at(
            &db_path,
            DeleteSessionPayload {
                source_tool: "codex".to_string(),
                source_id: source_id.to_string(),
                hard_delete: Some(false),
                cascade_subagents: None,
            },
        )
        .unwrap();
        assert_eq!(deleted.deleted_sessions, 1);
    }

    let deleted = delete_sessions_at(
        &db_path,
        DeleteSessionsPayload {
            targets: vec![
                DeleteSessionTargetPayload {
                    source_tool: "codex".to_string(),
                    source_id: "trash-batch-1".to_string(),
                },
                DeleteSessionTargetPayload {
                    source_tool: "codex".to_string(),
                    source_id: "trash-batch-2".to_string(),
                },
            ],
            hard_delete: Some(true),
            cascade_subagents: Some(true),
        },
    )
    .unwrap();

    assert_eq!(deleted.deleted_sessions, 2);
    assert_eq!(deleted.deleted_source_files, 2);
    assert!(deleted.warnings.is_empty());
    assert!(!first_path.exists());
    assert!(!second_path.exists());

    let conn = Connection::open(&db_path).unwrap();
    let remaining_rows: i64 = conn
        .query_row("select count(*) from sessions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(remaining_rows, 0);
}

#[test]
fn purge_deleted_session_ids_should_return_warning_when_database_purge_is_blocked() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-purge-blocked.db");
    init_db(&db_path).unwrap();

    let source_path = td.path().join("blocked-delete.jsonl");
    fs::write(&source_path, "blocked").unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at, deleted_by_user, deleted_at)
         values(?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
        (
            "codex",
            "blocked-purge-session",
            "Blocked Purge",
            source_path.to_string_lossy().to_string(),
            td.path().to_string_lossy().to_string(),
            "2026-05-01 10:00:00",
            "2026-05-01 10:01:00",
        ),
    )
    .unwrap();
    let session_id = conn.last_insert_rowid();
    drop(conn);

    let blocking_conn = Connection::open(&db_path).unwrap();
    blocking_conn.execute_batch("begin immediate").unwrap();

    let mut conn = Connection::open(&db_path).unwrap();
    let result = purge_deleted_session_ids(&mut conn, &[session_id]).unwrap();

    blocking_conn.execute_batch("rollback").unwrap();

    assert_eq!(result.deleted_sessions, 0);
    assert_eq!(result.deleted_source_files, 0);
    assert_eq!(result.warnings.len(), 1);
    assert!(result.warnings[0].starts_with("database purge failed:"));
    assert!(source_path.exists());

    let conn = Connection::open(&db_path).unwrap();
    let remaining: i64 = conn
        .query_row(
            "select count(*) from sessions where source_id='blocked-purge-session'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(remaining, 1);
}

#[cfg(target_os = "windows")]
#[test]
fn purge_deleted_session_ids_should_dedupe_windows_path_aliases() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-duplicate-paths.db");
    init_db(&db_path).unwrap();

    let source_path = td.path().join("duplicate-path.jsonl");
    fs::write(&source_path, "duplicate").unwrap();
    let alias_path = std::fs::canonicalize(&source_path)
        .unwrap()
        .to_string_lossy()
        .to_string();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at, deleted_by_user, deleted_at)
         values(?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
        (
            "codex",
            "duplicate-path-a",
            "Duplicate Path A",
            source_path.to_string_lossy().to_string(),
            td.path().to_string_lossy().to_string(),
            "2026-05-01 10:00:00",
            "2026-05-01 10:01:00",
        ),
    )
    .unwrap();
    let first_id = conn.last_insert_rowid();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at, deleted_by_user, deleted_at)
         values(?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
        (
            "codex",
            "duplicate-path-b",
            "Duplicate Path B",
            alias_path,
            td.path().to_string_lossy().to_string(),
            "2026-05-01 10:00:00",
            "2026-05-01 10:01:00",
        ),
    )
    .unwrap();
    let second_id = conn.last_insert_rowid();
    drop(conn);

    let mut conn = Connection::open(&db_path).unwrap();
    let result = purge_deleted_session_ids(&mut conn, &[first_id, second_id]).unwrap();

    assert_eq!(result.deleted_sessions, 2);
    assert_eq!(result.deleted_source_files, 1);
    assert!(result.warnings.is_empty());
    assert!(!source_path.exists());

    let conn = Connection::open(&db_path).unwrap();
    let remaining: i64 = conn
        .query_row("select count(*) from sessions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(remaining, 0);
}

#[test]
fn sessions_commands_should_list_and_open_subagent_detail_when_requested() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-subagent.db");
    init_db(&db_path).unwrap();

    let codex_dir = td.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("main.jsonl"),
        r#"{"timestamp":"2026-04-26T12:00:00.000Z","type":"session_meta","payload":{"id":"main-session-002","timestamp":"2026-04-26T12:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-26T12:00:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"主会话-2"}}"#,
    )
    .unwrap();
    fs::write(
        codex_dir.join("subagent-a.jsonl"),
        r#"{"timestamp":"2026-04-26T12:05:00.000Z","type":"session_meta","payload":{"id":"sub-session-a","timestamp":"2026-04-26T12:05:00.000Z","cwd":"D:\\Works\\ai-session","source":{"subagent":{"thread_spawn":{"parent_thread_id":"main-session-002"}}}}}
{"timestamp":"2026-04-26T12:05:01.000Z","type":"event_msg","payload":{"type":"agent_message","message":"子代理A"}}"#,
    )
    .unwrap();

    let refresh = refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    assert_eq!(refresh.indexed_sessions, 2);

    let subagents = list_subagent_sessions_at(
        &db_path,
        ListSubagentSessionsPayload {
            source_tool: "codex".to_string(),
            parent_source_id: "main-session-002".to_string(),
            in_trash: None,
        },
    )
    .unwrap();
    assert_eq!(subagents.rows.len(), 1);
    assert_eq!(subagents.rows[0].source_id, "sub-session-a");
    assert!(!subagents.rows[0].created_at.is_empty());

    let hidden_without_flag = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "sub-session-a".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap();
    assert!(hidden_without_flag.detail.is_none());

    let visible_with_flag = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "sub-session-a".to_string(),
            include_subagent: Some(true),
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap();
    let detail = visible_with_flag
        .detail
        .expect("subagent detail should exist");
    assert_eq!(detail.source_id, "sub-session-a");
    assert!(detail
        .messages
        .iter()
        .any(|message| message.content == "子代理A"));
}

#[test]
fn open_resume_in_terminal_should_validate_payload() {
    let td = tempdir().unwrap();
    let workspace = td.path().join("workspace");
    fs::create_dir_all(&workspace).unwrap();

    let unsupported = open_resume_in_terminal_at(OpenResumeInTerminalPayload {
        source_tool: "unknown-tool".to_string(),
        source_id: "session-1".to_string(),
        workspace_path: workspace.to_string_lossy().to_string(),
        terminal_preference: None,
    });
    assert!(unsupported.is_err());
    assert_eq!(unsupported.err().unwrap().code, "unsupported_operation");

    let invalid_id = open_resume_in_terminal_at(OpenResumeInTerminalPayload {
        source_tool: "codex".to_string(),
        source_id: "session 1".to_string(),
        workspace_path: workspace.to_string_lossy().to_string(),
        terminal_preference: None,
    });
    assert!(invalid_id.is_err());
    assert_eq!(invalid_id.err().unwrap().code, "invalid_argument");

    let missing_workspace = open_resume_in_terminal_at(OpenResumeInTerminalPayload {
        source_tool: "codex".to_string(),
        source_id: "session-1".to_string(),
        workspace_path: td.path().join("missing-dir").to_string_lossy().to_string(),
        terminal_preference: None,
    });
    assert!(missing_workspace.is_err());
    assert_eq!(missing_workspace.err().unwrap().code, "invalid_argument");
}

#[test]
fn open_in_explorer_should_validate_payload() {
    let invalid = open_in_explorer_at("   ", false);
    assert!(invalid.is_err());
    assert_eq!(invalid.err().unwrap().code, "invalid_argument");

    let td = tempdir().unwrap();
    let missing = td.path().join("missing.txt");
    let missing_result = open_in_explorer_at(missing.to_string_lossy().as_ref(), false);
    assert!(missing_result.is_err());
    assert_eq!(missing_result.err().unwrap().code, "invalid_argument");
}

#[test]
fn get_runtime_workspace_should_return_some_workspace_path() {
    let workspace = get_runtime_workspace().unwrap();
    assert!(workspace.is_some());
    assert!(!workspace.unwrap().trim().is_empty());
}

#[test]
fn list_sessions_at_should_truncate_long_keyword_before_query() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-long-keyword.db");
    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at)
         values(?1, ?2, ?3, ?4, ?5, ?6)",
        (
            "codex",
            "long-keyword-session",
            "a".repeat(200),
            "D:\\tmp\\session.jsonl",
            "D:\\tmp",
            "2026-05-01 09:00:00",
        ),
    )
    .unwrap();

    let result = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("codex".to_string()),
            workspace_path: None,
            keyword: Some("a".repeat(500)),
            updated_within_days: None,
            page: 1,
            page_size: 20,
        },
    )
    .unwrap();

    assert_eq!(result.rows.len(), 1);
    assert_eq!(result.rows[0].source_id, "long-keyword-session");
}

#[test]
fn list_sessions_at_should_clamp_updated_within_days_before_query() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-updated-days.db");
    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at)
         values(?1, ?2, ?3, ?4, ?5, ?6)",
        (
            "codex",
            "updated-days-recent",
            "Updated Days Recent",
            "D:\\tmp\\updated-days-recent.jsonl",
            "D:\\tmp",
            "2999-05-01 09:00:00",
        ),
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at)
         values(?1, ?2, ?3, ?4, ?5, ?6)",
        (
            "codex",
            "updated-days-legacy",
            "Updated Days Legacy",
            "D:\\tmp\\updated-days-legacy.jsonl",
            "D:\\tmp",
            "1900-05-01 09:00:00",
        ),
    )
    .unwrap();

    let result = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("codex".to_string()),
            workspace_path: None,
            keyword: None,
            updated_within_days: Some(99999),
            page: 1,
            page_size: 20,
        },
    )
    .unwrap();

    assert_eq!(result.rows.len(), 1);
    assert_eq!(result.rows[0].source_id, "updated-days-recent");
}

#[test]
fn list_sessions_at_should_return_normalized_pagination_window() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-pagination.db");
    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    for (source_id, title, updated_at) in [
        (
            "page-session-001",
            "Pagination Session 1",
            "2026-05-01 09:00:00",
        ),
        (
            "page-session-002",
            "Pagination Session 2",
            "2026-05-02 09:00:00",
        ),
        (
            "page-session-003",
            "Pagination Session 3",
            "2026-05-03 09:00:00",
        ),
    ] {
        conn.execute(
            "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at)
             values(?1, ?2, ?3, ?4, ?5, ?6)",
            (
                "codex",
                source_id,
                title,
                format!("D:\\tmp\\{source_id}.jsonl"),
                "D:\\tmp",
                updated_at,
            ),
        )
        .unwrap();
    }
    drop(conn);

    let first_page = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("codex".to_string()),
            workspace_path: None,
            keyword: None,
            updated_within_days: None,
            page: 0,
            page_size: 1,
        },
    )
    .unwrap();
    assert_eq!(first_page.rows.len(), 1);
    assert_eq!(first_page.rows[0].source_id, "page-session-003");
    let first_page_json = serde_json::to_value(&first_page).unwrap();
    assert_eq!(first_page_json["page"], json!(1));
    assert_eq!(first_page_json["pageSize"], json!(1));

    let second_page = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("codex".to_string()),
            workspace_path: None,
            keyword: None,
            updated_within_days: None,
            page: 2,
            page_size: 1,
        },
    )
    .unwrap();
    assert_eq!(second_page.rows.len(), 1);
    assert_eq!(second_page.rows[0].source_id, "page-session-002");
    let second_page_json = serde_json::to_value(&second_page).unwrap();
    assert_eq!(second_page_json["page"], json!(2));
    assert_eq!(second_page_json["pageSize"], json!(1));

    let clamped_page_size = list_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("codex".to_string()),
            workspace_path: None,
            keyword: None,
            updated_within_days: None,
            page: 1,
            page_size: 9999,
        },
    )
    .unwrap();
    assert_eq!(clamped_page_size.rows.len(), 3);
    let clamped_page_size_json = serde_json::to_value(&clamped_page_size).unwrap();
    assert_eq!(clamped_page_size_json["page"], json!(1));
    assert_eq!(clamped_page_size_json["pageSize"], json!(500));
}

#[test]
fn list_trash_sessions_at_should_paginate_filtered_rows_only() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-trash-pagination.db");
    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    for (source_tool, source_id, title, updated_at, deleted_at, deleted_by_user) in [
        (
            "codex",
            "trash-codex-latest",
            "Trash Codex Latest",
            "2026-05-03 09:30:00",
            Some("2026-05-03 10:00:00"),
            1,
        ),
        (
            "codex",
            "trash-codex-earlier",
            "Trash Codex Earlier",
            "2026-05-02 09:30:00",
            Some("2026-05-02 10:00:00"),
            1,
        ),
        (
            "gemini",
            "trash-gemini",
            "Trash Gemini",
            "2026-05-01 09:30:00",
            Some("2026-05-01 10:00:00"),
            1,
        ),
        (
            "codex",
            "active-codex",
            "Active Codex",
            "2026-05-04 09:30:00",
            None,
            0,
        ),
    ] {
        conn.execute(
            "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at, deleted_by_user, deleted_at)
             values(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            (
                source_tool,
                source_id,
                title,
                format!("D:\\trash\\{source_id}.jsonl"),
                "D:\\trash",
                updated_at,
                deleted_by_user,
                deleted_at,
            ),
        )
        .unwrap();
    }
    drop(conn);

    let first_page = ai_session_manager::commands::sessions::list_trash_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("codex".to_string()),
            workspace_path: None,
            keyword: Some("Trash Codex".to_string()),
            updated_within_days: None,
            page: 1,
            page_size: 1,
        },
    )
    .unwrap();
    assert_eq!(first_page.rows.len(), 1);
    assert_eq!(first_page.rows[0].source_id, "trash-codex-latest");
    let first_page_json = serde_json::to_value(&first_page).unwrap();
    assert_eq!(first_page_json["page"], json!(1));
    assert_eq!(first_page_json["pageSize"], json!(1));

    let second_page = ai_session_manager::commands::sessions::list_trash_sessions_at(
        &db_path,
        ListSessionsPayload {
            tool: Some("codex".to_string()),
            workspace_path: None,
            keyword: Some("Trash Codex".to_string()),
            updated_within_days: None,
            page: 2,
            page_size: 1,
        },
    )
    .unwrap();
    assert_eq!(second_page.rows.len(), 1);
    assert_eq!(second_page.rows[0].source_id, "trash-codex-earlier");
}
