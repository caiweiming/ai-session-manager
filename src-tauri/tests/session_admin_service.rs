use ai_session_manager::application::session_admin_service::{
    build_export_dialog_filename, clear_trash, clear_trash_with_progress, delete_session,
    delete_sessions_with_progress, export_session_markdown, purge_deleted_session_ids,
    resolve_target_session_ids, restore_session, validate_open_in_explorer_payload,
    DeleteSessionRequest, DeleteSessionTarget, DeleteSessionsRequest, ExportSessionMarkdownRequest,
    RestoreSessionRequest,
};
use ai_session_manager::commands::sessions::refresh_sessions_at;
use ai_session_manager::db::migrate::init_db;
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use tempfile::tempdir;

#[test]
fn resolve_target_session_ids_should_follow_cascade_flag() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "create table sessions(
            id integer primary key,
            source_tool text not null,
            source_id text not null,
            parent_source_id text
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, parent_source_id)
         values(1, 'codex', 'main-1', null)",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, parent_source_id)
         values(2, 'codex', 'sub-1', 'main-1')",
        [],
    )
    .unwrap();

    let cascaded = resolve_target_session_ids(&conn, "codex", "main-1", true).unwrap();
    assert_eq!(cascaded, vec![1, 2]);

    let single = resolve_target_session_ids(&conn, "codex", "main-1", false).unwrap();
    assert_eq!(single, vec![1]);
}

#[test]
fn resolve_target_session_ids_should_return_cascaded_ids_in_ascending_order() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "create table sessions(
            id integer primary key,
            source_tool text not null,
            source_id text not null,
            parent_source_id text
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, parent_source_id)
         values(10, 'codex', 'main-order', null)",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, parent_source_id)
         values(100, 'codex', 'sub-order-100', 'main-order')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, parent_source_id)
         values(50, 'codex', 'sub-order-50', 'main-order')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, parent_source_id)
         values(75, 'codex', 'sub-order-75', 'main-order')",
        [],
    )
    .unwrap();

    let cascaded = resolve_target_session_ids(&conn, "codex", "main-order", true).unwrap();
    assert_eq!(cascaded, vec![10, 50, 75, 100]);
}
#[test]
fn export_session_markdown_should_write_default_markdown_beside_source_file() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-export-service.db");
    let codex_dir = td.path().join(".codex");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("export-service.json"),
        r#"{
  "session_id": "export-service-1",
  "title": "Export Service / Demo",
  "updated_at": "2026-05-01T02:00:00Z",
  "messages": [
    {
      "role": "user",
      "content": "hello",
      "created_at": "2026-05-01T02:00:00Z"
    },
    {
      "role": "assistant",
      "content": "world",
      "created_at": "2026-05-01T02:00:01Z"
    }
  ]
}"#,
    )
    .unwrap();

    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    let exported = export_session_markdown(
        &db_path,
        ExportSessionMarkdownRequest {
            source_tool: "codex".to_string(),
            source_id: "export-service-1".to_string(),
            include_subagent: false,
            target_path: None,
        },
    )
    .unwrap();

    assert!(exported.path.exists());
    assert_eq!(
        exported.path.file_name().and_then(|value| value.to_str()),
        Some("Export_Service___Demo-export-service-1.md")
    );

    let markdown = fs::read_to_string(&exported.path).unwrap();
    assert!(markdown.contains("## user · 2026-05-01 10:00:00"));
    assert!(markdown.contains("## assistant · 2026-05-01 10:00:01"));
    assert!(markdown.contains("hello"));
    assert!(markdown.contains("world"));
    assert_eq!(
        build_export_dialog_filename("export-service-1"),
        "export-service-1.md"
    );
}

#[test]
fn export_session_markdown_should_preserve_code_blocks_and_tool_call_snippets() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-export-rich.db");
    let codex_dir = td.path().join(".codex");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("export-rich.json"),
        r#"{
  "session_id": "export-rich-1",
  "title": "Export Rich",
  "updated_at": "2026-05-01T02:00:06Z",
  "messages": [
    {
      "role": "assistant",
      "content": "下面是脚本：\n```bash\necho hi\n```",
      "created_at": "2026-05-01T02:00:05Z"
    },
    {
      "role": "tool",
      "content": "shell(\"echo hi\")\nexitCode: 0",
      "created_at": "2026-05-01T02:00:06Z"
    }
  ]
}"#,
    )
    .unwrap();

    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    let exported = export_session_markdown(
        &db_path,
        ExportSessionMarkdownRequest {
            source_tool: "codex".to_string(),
            source_id: "export-rich-1".to_string(),
            include_subagent: false,
            target_path: None,
        },
    )
    .unwrap();

    let markdown = fs::read_to_string(&exported.path).unwrap();
    assert!(markdown.contains("## assistant · 2026-05-01 10:00:05"));
    assert!(markdown.contains("## tool · 2026-05-01 10:00:06"));
    assert!(markdown.contains("```bash\necho hi\n```"));
    assert!(markdown.contains("```text\nshell(\"echo hi\")\nexitCode: 0\n```"));
}

#[test]
fn export_session_markdown_should_allow_retry_after_initial_io_failure() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-export-retry.db");
    let codex_dir = td.path().join(".codex");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("export-retry.json"),
        r#"{
  "session_id": "export-retry-1",
  "title": "Export Retry",
  "updated_at": "2026-05-01T02:00:00Z",
  "messages": [
    {
      "role": "user",
      "content": "retry me",
      "created_at": "2026-05-01T02:00:00Z"
    }
  ]
}"#,
    )
    .unwrap();

    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    let blocked_parent = td.path().join("blocked-parent");
    fs::write(&blocked_parent, "not-a-directory").unwrap();
    let blocked_target = blocked_parent.join("retry.md");

    let first_try = export_session_markdown(
        &db_path,
        ExportSessionMarkdownRequest {
            source_tool: "codex".to_string(),
            source_id: "export-retry-1".to_string(),
            include_subagent: false,
            target_path: Some(blocked_target.to_string_lossy().to_string()),
        },
    );
    assert!(first_try.is_err());
    assert!(!blocked_target.exists());

    let valid_target = td.path().join("exports").join("retry.md");
    let second_try = export_session_markdown(
        &db_path,
        ExportSessionMarkdownRequest {
            source_tool: "codex".to_string(),
            source_id: "export-retry-1".to_string(),
            include_subagent: false,
            target_path: Some(valid_target.to_string_lossy().to_string()),
        },
    )
    .unwrap();

    assert_eq!(second_try.path, valid_target);
    assert!(second_try.path.exists());
    let markdown = fs::read_to_string(&second_try.path).unwrap();
    assert!(markdown.contains("retry me"));
}

#[test]
fn validate_open_in_explorer_payload_should_reject_missing_target() {
    let td = tempdir().unwrap();
    let missing = td.path().join("missing.txt");

    let err = validate_open_in_explorer_payload(missing.to_string_lossy().as_ref(), false)
        .expect_err("missing path should be rejected");
    assert!(err.to_string().contains("path does not exist"));
}

#[test]
fn session_admin_service_should_handle_delete_restore_and_clear_trash() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-admin-service.db");
    let codex_dir = td.path().join(".codex");
    let session_file = codex_dir.join("service-delete.jsonl");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        &session_file,
        r#"{"timestamp":"2026-04-26T12:00:00.000Z","type":"session_meta","payload":{"id":"service-delete-001","timestamp":"2026-04-26T12:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-26T12:00:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"主会话-service"}}"#,
    )
    .unwrap();

    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    let deleted = delete_session(
        &db_path,
        DeleteSessionRequest {
            source_tool: "codex".to_string(),
            source_id: "service-delete-001".to_string(),
            hard_delete: false,
            cascade_subagents: true,
        },
    )
    .unwrap();
    assert_eq!(deleted.deleted_sessions, 1);
    assert_eq!(deleted.deleted_source_files, 0);
    assert!(deleted.warnings.is_empty());
    assert!(session_file.exists());

    let restored = restore_session(
        &db_path,
        RestoreSessionRequest {
            source_tool: "codex".to_string(),
            source_id: "service-delete-001".to_string(),
            cascade_subagents: true,
        },
    )
    .unwrap();
    assert_eq!(restored, 1);

    let deleted_again = delete_session(
        &db_path,
        DeleteSessionRequest {
            source_tool: "codex".to_string(),
            source_id: "service-delete-001".to_string(),
            hard_delete: false,
            cascade_subagents: true,
        },
    )
    .unwrap();
    assert_eq!(deleted_again.deleted_sessions, 1);

    let cleared = clear_trash(&db_path).unwrap();
    assert_eq!(cleared.deleted_sessions, 1);
    assert_eq!(cleared.deleted_source_files, 1);
    assert!(cleared.warnings.is_empty());
    assert!(!session_file.exists());
}

#[test]
fn clear_trash_with_progress_should_report_batched_progress() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-clear-trash-progress.db");
    let codex_dir = td.path().join(".codex");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();

    for index in 0..5 {
        let session_id = format!("progress-session-{index}");
        let session_file = codex_dir.join(format!("{session_id}.jsonl"));
        fs::write(
            &session_file,
            format!(
                r#"{{"timestamp":"2026-04-26T12:00:00.000Z","type":"session_meta","payload":{{"id":"{session_id}","timestamp":"2026-04-26T12:00:00.000Z","cwd":"D:\\Works\\ai-session"}}}}
{{"timestamp":"2026-04-26T12:00:01.000Z","type":"event_msg","payload":{{"type":"user_message","message":"{session_id}"}}}}"#
            ),
        )
        .unwrap();
    }

    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    for index in 0..5 {
        delete_session(
            &db_path,
            DeleteSessionRequest {
                source_tool: "codex".to_string(),
                source_id: format!("progress-session-{index}"),
                hard_delete: false,
                cascade_subagents: true,
            },
        )
        .unwrap();
    }

    let mut reported = Vec::new();
    let cleared = clear_trash_with_progress(&db_path, 2, |progress| {
        reported.push((progress.deleted_sessions, progress.total_sessions));
    })
    .unwrap();

    assert_eq!(cleared.deleted_sessions, 5);
    assert_eq!(cleared.deleted_source_files, 5);
    assert!(cleared.warnings.is_empty());
    assert_eq!(reported, vec![(2, 5), (4, 5), (5, 5)]);
}

#[test]
fn delete_sessions_with_progress_should_report_batched_progress() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-delete-batch-progress.db");
    let codex_dir = td.path().join(".codex");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();

    for index in 0..5 {
        let session_id = format!("delete-progress-{index}");
        let session_file = codex_dir.join(format!("{session_id}.jsonl"));
        fs::write(
            &session_file,
            format!(
                r#"{{"timestamp":"2026-04-26T12:00:00.000Z","type":"session_meta","payload":{{"id":"{session_id}","timestamp":"2026-04-26T12:00:00.000Z","cwd":"D:\\Works\\ai-session"}}}}
{{"timestamp":"2026-04-26T12:00:01.000Z","type":"event_msg","payload":{{"type":"user_message","message":"{session_id}"}}}}"#
            ),
        )
        .unwrap();
    }

    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    let mut reported = Vec::new();
    let deleted = delete_sessions_with_progress(
        &db_path,
        DeleteSessionsRequest {
            targets: (0..5)
                .map(|index| DeleteSessionTarget {
                    source_tool: "codex".to_string(),
                    source_id: format!("delete-progress-{index}"),
                })
                .collect(),
            hard_delete: true,
            cascade_subagents: true,
        },
        2,
        |progress| {
            reported.push((progress.deleted_sessions, progress.total_sessions));
        },
    )
    .unwrap();

    assert_eq!(deleted.deleted_sessions, 5);
    assert_eq!(deleted.deleted_source_files, 5);
    assert!(deleted.warnings.is_empty());
    assert_eq!(reported, vec![(2, 5), (4, 5), (5, 5)]);
}

#[test]
fn delete_session_hard_delete_should_keep_source_file_when_database_purge_fails() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions-admin-hard-delete-blocked.db");
    let codex_dir = td.path().join(".codex");
    let session_file = codex_dir.join("service-delete-blocked.jsonl");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        &session_file,
        r#"{"timestamp":"2026-04-26T12:00:00.000Z","type":"session_meta","payload":{"id":"service-delete-blocked-001","timestamp":"2026-04-26T12:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-26T12:00:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"主会话-service-blocked"}}"#,
    )
    .unwrap();

    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    let session_id: i64 = conn
        .query_row(
            "select id from sessions where source_tool='codex' and source_id='service-delete-blocked-001'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    conn.execute(
        "update sessions
         set deleted_at='2026-05-01 10:00:00', deleted_by_user=1
         where id=?1",
        [session_id],
    )
    .unwrap();
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
    assert!(session_file.exists());

    let conn = Connection::open(&db_path).unwrap();
    let row_state: (i64, i64) = conn
        .query_row(
            "select deleted_by_user,
                    case when deleted_at is not null then 1 else 0 end
             from sessions
             where source_tool='codex' and source_id='service-delete-blocked-001'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(row_state, (1, 1));
}
