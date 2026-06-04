use ai_session_manager::commands::sessions::{get_session_detail_at, GetSessionDetailPayload};
use ai_session_manager::db::migrate::init_db;
use ai_session_manager::domain::events::SessionEvent;
use ai_session_manager::services::sync_service::sync_watcher_events;
use ai_session_manager::services::sync_service::{refresh_codex_sessions, refresh_home_sessions};
use ai_session_manager::services::watcher::{coalesce_watch_events, WatchEvent, WatchEventKind};
use rusqlite::Connection;
use std::fs;
#[cfg(target_os = "windows")]
use std::path::PathBuf;
use tempfile::tempdir;

#[test]
fn refresh_codex_sessions_should_be_idempotent_for_same_source_id() {
    let temp = tempdir().unwrap();
    let db_path = temp.path().join("test.db");
    init_db(&db_path).unwrap();

    let codex_dir = temp.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("session.json"),
        r#"{
  "session_id": "session_001",
  "title": "Codex sample session",
  "updated_at": "2026-04-24T10:30:00Z",
  "messages": [
    {
      "role": "user",
      "content": "请帮我排查超时",
      "created_at": "2026-04-24T10:20:00Z"
    },
    {
      "role": "assistant",
      "content": "我先看日志",
      "created_at": "2026-04-24T10:21:00Z"
    }
  ]
}"#,
    )
    .unwrap();

    fs::write(
        codex_dir.join("broken.json"),
        r#"{"title":"missing session id"}"#,
    )
    .unwrap();

    let first = refresh_codex_sessions(&db_path, &codex_dir).unwrap();
    assert_eq!(first.scanned_files, 2);
    assert_eq!(first.indexed_sessions, 1);
    assert_eq!(first.failed_files, 1);

    fs::write(
        codex_dir.join("session.json"),
        r#"{
  "session_id": "session_001",
  "title": "Codex sample session updated",
  "updated_at": "2026-04-24T10:40:00Z",
  "messages": [
    {
      "role": "assistant",
      "content": "新的第一条",
      "created_at": "2026-04-24T10:31:00Z"
    },
    {
      "role": "user",
      "content": "新的第二条",
      "created_at": "2026-04-24T10:32:00Z"
    },
    {
      "role": "assistant",
      "content": "新的第三条",
      "created_at": "2026-04-24T10:33:00Z"
    }
  ]
}"#,
    )
    .unwrap();

    let second = refresh_codex_sessions(&db_path, &codex_dir).unwrap();
    assert_eq!(second.scanned_files, 2);
    assert_eq!(second.indexed_sessions, 1);
    assert_eq!(second.failed_files, 1);

    let conn = Connection::open(&db_path).unwrap();
    let session_count: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and source_id='session_001'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let title: String = conn
        .query_row(
            "select title from sessions where source_tool='codex' and source_id='session_001'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let started_at: String = conn
        .query_row(
            "select started_at from sessions where source_tool='codex' and source_id='session_001'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let message_count: i64 = conn
        .query_row(
            "select count(*) from messages where session_id=(select id from sessions where source_tool='codex' and source_id='session_001')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(session_count, 1);
    assert_eq!(title, "Codex sample session updated");
    assert_eq!(started_at, "2026-04-24 18:20:00");
    assert_eq!(message_count, 0);
    drop(conn);

    let detail = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "session_001".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap()
    .detail
    .unwrap();
    assert_eq!(detail.messages.len(), 3);
}

#[test]
fn refresh_codex_sessions_should_index_summary_when_messages_table_is_missing() {
    let temp = tempdir().unwrap();
    let db_path = temp.path().join("test.db");
    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute("drop table messages", []).unwrap();
    drop(conn);

    let codex_dir = temp.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("session.json"),
        r#"{
  "session_id": "session_rollback_001",
  "title": "Rollback test",
  "updated_at": "2026-04-24T11:00:00Z",
  "messages": [
    { "role": "user", "content": "msg-1", "created_at": "2026-04-24T11:00:01Z" }
  ]
}"#,
    )
    .unwrap();

    let summary = refresh_codex_sessions(&db_path, &codex_dir).unwrap();
    assert_eq!(summary.scanned_files, 1);
    assert_eq!(summary.indexed_sessions, 1);
    assert_eq!(summary.failed_files, 0);

    let conn = Connection::open(&db_path).unwrap();
    let session_count: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and source_id='session_rollback_001'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let message_count: i64 = conn
        .query_row(
            "select count(*) from messages where session_id in (
               select id from sessions where source_tool='codex' and source_id='session_rollback_001'
             )",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(session_count, 1);
    assert_eq!(message_count, 0);
    drop(conn);

    let detail = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "session_rollback_001".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap()
    .detail
    .unwrap();
    assert_eq!(detail.messages.len(), 1);
}

#[test]
fn refresh_codex_sessions_should_prune_removed_files_and_restore_when_file_returns() {
    let temp = tempdir().unwrap();
    let db_path = temp.path().join("test.db");
    init_db(&db_path).unwrap();

    let codex_dir = temp.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("session-a.json"),
        r#"{
  "session_id": "session_a",
  "title": "Session A",
  "updated_at": "2026-04-24T11:10:00Z",
  "messages": [{ "role": "user", "content": "a-1", "created_at": "2026-04-24T11:10:01Z" }]
}"#,
    )
    .unwrap();
    fs::write(
        codex_dir.join("session-b.json"),
        r#"{
  "session_id": "session_b",
  "title": "Session B",
  "updated_at": "2026-04-24T11:20:00Z",
  "messages": [{ "role": "user", "content": "b-1", "created_at": "2026-04-24T11:20:01Z" }]
}"#,
    )
    .unwrap();

    let first = refresh_codex_sessions(&db_path, &codex_dir).unwrap();
    assert_eq!(first.scanned_files, 2);
    assert_eq!(first.indexed_sessions, 2);
    assert_eq!(first.failed_files, 0);

    fs::remove_file(codex_dir.join("session-b.json")).unwrap();
    let second = refresh_codex_sessions(&db_path, &codex_dir).unwrap();
    assert_eq!(second.scanned_files, 1);
    assert_eq!(second.indexed_sessions, 1);
    assert_eq!(second.failed_files, 0);

    let conn = Connection::open(&db_path).unwrap();
    let active_count: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and deleted_at is null",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let removed_soft_deleted: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and source_id='session_b' and deleted_at is not null",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let removed_message_count: i64 = conn
        .query_row(
            "select count(*) from messages where session_id in (
               select id from sessions where source_tool='codex' and source_id='session_b'
             )",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(active_count, 1);
    assert_eq!(removed_soft_deleted, 1);
    assert_eq!(removed_message_count, 0);
    drop(conn);

    fs::write(
        codex_dir.join("session-b.json"),
        r#"{
  "session_id": "session_b",
  "title": "Session B Restored",
  "updated_at": "2026-04-24T11:40:00Z",
  "messages": [{ "role": "assistant", "content": "b-restore", "created_at": "2026-04-24T11:40:01Z" }]
}"#,
    )
    .unwrap();
    let third = refresh_codex_sessions(&db_path, &codex_dir).unwrap();
    assert_eq!(third.scanned_files, 2);
    assert_eq!(third.indexed_sessions, 2);
    assert_eq!(third.failed_files, 0);

    let conn = Connection::open(&db_path).unwrap();
    let restored_count: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and source_id='session_b' and deleted_at is null",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let restored_message_count: i64 = conn
        .query_row(
            "select count(*) from messages where session_id in (
               select id from sessions where source_tool='codex' and source_id='session_b' and deleted_at is null
             )",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(restored_count, 1);
    assert_eq!(restored_message_count, 0);
    drop(conn);

    let detail = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "session_b".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap()
    .detail
    .unwrap();
    assert_eq!(detail.messages.len(), 1);
    assert_eq!(detail.messages[0].content, "b-restore");
}

#[test]
fn refresh_codex_sessions_should_rebuild_instruction_like_title_even_when_file_unchanged() {
    let temp = tempdir().unwrap();
    let db_path = temp.path().join("test.db");
    init_db(&db_path).unwrap();

    let codex_dir = temp.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    let session_file = codex_dir.join("session.jsonl");
    fs::write(
        &session_file,
        r#"{"timestamp":"2026-04-27T08:00:00.000Z","type":"session_meta","payload":{"id":"session_fix_title","timestamp":"2026-04-27T08:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-27T08:00:03.000Z","type":"event_msg","payload":{"type":"user_message","message":"请帮我修复会话标题显示异常"}}"#,
    )
    .unwrap();

    let first = refresh_codex_sessions(&db_path, &codex_dir).unwrap();
    assert_eq!(first.scanned_files, 1);
    assert_eq!(first.failed_files, 0);

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "update sessions
         set title='<permissions instructions> Filesystem sandboxing...'
         where source_tool='codex' and source_id='session_fix_title'",
        [],
    )
    .unwrap();
    drop(conn);

    let second = refresh_codex_sessions(&db_path, &codex_dir).unwrap();
    assert_eq!(second.scanned_files, 1);
    assert_eq!(second.failed_files, 0);

    let conn = Connection::open(&db_path).unwrap();
    let title: String = conn
        .query_row(
            "select title from sessions where source_tool='codex' and source_id='session_fix_title'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(title, "请帮我修复会话标题显示异常");
}

#[cfg(target_os = "windows")]
#[test]
fn refresh_codex_sessions_should_keep_session_active_across_verbatim_path_aliases() {
    let temp = tempdir().unwrap();
    let db_path = temp.path().join("test.db");
    init_db(&db_path).unwrap();

    let codex_dir = temp.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("session.jsonl"),
        r#"{"timestamp":"2026-05-01T08:00:00.000Z","type":"session_meta","payload":{"id":"session_alias_keep","timestamp":"2026-05-01T08:00:00.000Z","cwd":"D:\\Works\\demo"}}
{"timestamp":"2026-05-01T08:00:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"第一次刷新"}} "#,
    )
    .unwrap();

    let first = refresh_codex_sessions(&db_path, &codex_dir).unwrap();
    assert_eq!(first.scanned_files, 1);
    assert_eq!(first.indexed_sessions, 1);
    assert_eq!(first.failed_files, 0);

    let canonical_codex_dir = std::fs::canonicalize(&codex_dir).unwrap();
    let canonical_text = canonical_codex_dir.to_string_lossy().to_string();
    let verbatim_codex_dir = if canonical_text.starts_with(r"\\?\") {
        PathBuf::from(canonical_text)
    } else {
        PathBuf::from(format!(r"\\?\{}", canonical_text))
    };

    let second = refresh_codex_sessions(&db_path, &verbatim_codex_dir).unwrap();
    assert_eq!(second.scanned_files, 1);
    assert_eq!(second.indexed_sessions, 1);
    assert_eq!(second.failed_files, 0);

    let conn = Connection::open(&db_path).unwrap();
    let session_count: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and source_id='session_alias_keep'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let active_count: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and source_id='session_alias_keep' and deleted_at is null",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let deleted_count: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and source_id='session_alias_keep' and deleted_at is not null",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let source_path_key: String = conn
        .query_row(
            "select source_path_key from sessions where source_tool='codex' and source_id='session_alias_keep'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(session_count, 1);
    assert_eq!(active_count, 1);
    assert_eq!(deleted_count, 0);
    assert!(source_path_key.ends_with("/session.jsonl"));
}

#[test]
fn refresh_home_sessions_should_keep_other_sources_when_single_source_has_parse_failure() {
    let temp = tempdir().unwrap();
    let db_path = temp.path().join("home-refresh.db");
    init_db(&db_path).unwrap();

    let home_dir = temp.path().join("home");
    let codex_dir = home_dir.join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("session.json"),
        r#"{
  "session_id": "home_codex_ok_1",
  "title": "Home Codex OK",
  "updated_at": "2026-05-02T09:00:00Z",
  "messages": [
    { "role": "user", "content": "keep working", "created_at": "2026-05-02T09:00:01Z" }
  ]
}"#,
    )
    .unwrap();

    let claude_project_dir = home_dir
        .join(".claude")
        .join("projects")
        .join("demo-project");
    fs::create_dir_all(&claude_project_dir).unwrap();
    fs::write(
        claude_project_dir.join("broken-session.jsonl"),
        r#"{"sessionId":"","cwd":"D:\\Works\\demo"}"#,
    )
    .unwrap();

    let gemini_chat_dir = home_dir
        .join(".gemini")
        .join("tmp")
        .join("demo-project")
        .join("chats");
    fs::create_dir_all(&gemini_chat_dir).unwrap();
    fs::write(
        gemini_chat_dir.join("session-gemini.jsonl"),
        r#"{"sessionId":"gemini-home-1","title":"Gemini Home OK","updatedAt":"2026-05-02T10:00:00Z","workspacePath":"/tmp/demo","messages":[{"role":"user","text":"gemini still indexed","timestamp":"2026-05-02T10:00:01Z"}]}"#,
    )
    .unwrap();

    let summary = refresh_home_sessions(&db_path, &codex_dir).unwrap();

    assert_eq!(summary.indexed_sessions, 2);
    assert_eq!(summary.failed_files, 1);
    assert_eq!(summary.scanned_files, 3);

    let conn = Connection::open(&db_path).unwrap();
    let codex_count: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and source_id='home_codex_ok_1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let gemini_count: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='gemini' and source_id='gemini-home-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(codex_count, 1);
    assert_eq!(gemini_count, 1);
}

#[test]
fn sync_watcher_events_should_incrementally_update_changed_file_once_per_batch() {
    let temp = tempdir().unwrap();
    let db_path = temp.path().join("watcher-sync.db");
    init_db(&db_path).unwrap();

    let codex_dir = temp.path().join(".codex");
    fs::create_dir_all(&codex_dir).unwrap();
    let session_file = codex_dir.join("session.json");

    fs::write(
        &session_file,
        r#"{
  "session_id": "watcher_session_001",
  "title": "Watcher Demo",
  "updated_at": "2026-05-14T09:00:00Z",
  "messages": [
    {
      "role": "user",
      "content": "first",
      "created_at": "2026-05-14T09:00:01Z"
    }
  ]
}"#,
    )
    .unwrap();

    let first = refresh_codex_sessions(&db_path, &codex_dir).unwrap();
    assert_eq!(first.scanned_files, 1);
    assert_eq!(first.indexed_sessions, 1);
    assert_eq!(first.failed_files, 0);

    fs::write(
        &session_file,
        r#"{
  "session_id": "watcher_session_001",
  "title": "Watcher Demo Updated",
  "updated_at": "2026-05-14T09:05:00Z",
  "messages": [
    {
      "role": "user",
      "content": "first",
      "created_at": "2026-05-14T09:00:01Z"
    },
    {
      "role": "assistant",
      "content": "second",
      "created_at": "2026-05-14T09:05:01Z"
    }
  ]
}"#,
    )
    .unwrap();

    let events = coalesce_watch_events(&[
        WatchEvent {
            source_tool: "codex".to_string(),
            path: session_file.clone(),
            kind: WatchEventKind::Upsert,
        },
        WatchEvent {
            source_tool: "codex".to_string(),
            path: session_file.clone(),
            kind: WatchEventKind::Upsert,
        },
    ]);

    let result = sync_watcher_events(&db_path, &events).unwrap();

    assert_eq!(result.processed_files, 1);
    assert_eq!(result.indexed_sessions, 1);
    assert_eq!(result.failed_files, 0);
    assert_eq!(result.removed_sessions, 0);
    assert_eq!(result.emitted_events.len(), 2);
    assert!(result.emitted_events.iter().any(|event| {
        matches!(
            event,
            SessionEvent::SessionUpdated(payload)
                if payload.source_tool == "codex"
                    && payload.source_id == "watcher_session_001"
        )
    }));
    assert!(result.emitted_events.iter().any(|event| {
        matches!(
            event,
            SessionEvent::MessageAppended(payload)
                if payload.source_tool == "codex"
                    && payload.source_id == "watcher_session_001"
                    && payload.content == "second"
        )
    }));

    let detail = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "watcher_session_001".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap()
    .detail
    .unwrap();

    assert_eq!(detail.title, "Watcher Demo Updated");
    assert_eq!(detail.messages.len(), 2);
    assert_eq!(detail.messages[1].content, "second");
}
