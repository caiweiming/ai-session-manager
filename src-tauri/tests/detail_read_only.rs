use ai_session_manager::commands::sessions::{
    delete_session_at, get_session_detail_at, refresh_sessions_at, DeleteSessionPayload,
    GetSessionDetailPayload,
};
use ai_session_manager::db::migrate::init_db;
use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;
use tempfile::tempdir;

#[test]
fn refresh_sessions_should_only_persist_summary_before_detail_queries() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions.db");
    let codex_dir = td.path().join(".codex");
    let session_file = codex_dir.join("session.json");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        &session_file,
        r#"{"session_id":"read-only-1","title":"Read Only","updated_at":"2026-05-01T01:00:00Z","messages":[{"role":"user","content":"原始消息","created_at":"2026-05-01T01:00:00Z"},{"role":"assistant","content":"原始回答","created_at":"2026-05-01T01:00:01Z"}]}"#,
    )
    .unwrap();

    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    let message_count: i64 = conn
        .query_row("select count(*) from messages", [], |row| row.get(0))
        .unwrap();
    assert_eq!(message_count, 0);

    let detail = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "read-only-1".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap()
    .detail
    .unwrap();
    assert_eq!(detail.messages.len(), 2);

    let conn = Connection::open(&db_path).unwrap();
    let hydrated_message_count: i64 = conn
        .query_row("select count(*) from messages", [], |row| row.get(0))
        .unwrap();
    assert_eq!(hydrated_message_count, 2);
}

#[test]
fn get_session_detail_should_not_reparse_file_during_read() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions.db");
    let codex_dir = td.path().join(".codex");
    let session_file = codex_dir.join("session.json");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        &session_file,
        r#"{"session_id":"read-only-2","title":"Read Only","updated_at":"2026-05-01T01:00:00Z","messages":[{"role":"user","content":"原始消息","created_at":"2026-05-01T01:00:00Z"},{"role":"assistant","content":"原始回答","created_at":"2026-05-01T01:00:01Z"}]}"#,
    )
    .unwrap();
    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    let detail = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "read-only-2".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap()
    .detail
    .unwrap();
    assert!(detail
        .messages
        .iter()
        .any(|message| message.content == "原始回答"));

    fs::write(
        &session_file,
        r#"{"session_id":"read-only-2","title":"Read Only","updated_at":"2026-05-01T01:10:00Z","messages":[{"role":"assistant","content":"被读请求重写的新消息","created_at":"2026-05-01T01:10:00Z"}]}"#,
    )
    .unwrap();

    let detail_after_file_change = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "read-only-2".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: None,
        },
    )
    .unwrap()
    .detail
    .unwrap();

    assert!(!detail_after_file_change
        .messages
        .iter()
        .any(|message| message.content == "被读请求重写的新消息"));
    assert!(detail_after_file_change
        .messages
        .iter()
        .any(|message| message.content == "原始回答"));
}

#[test]
fn refresh_sessions_should_keep_summary_for_user_deleted_trash_rows() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions.db");
    let codex_dir = td.path().join(".codex");
    let session_file = codex_dir.join("session.json");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        &session_file,
        r#"{"session_id":"trash-read-1","title":"Trash Read","updated_at":"2026-05-01T01:00:00Z","messages":[{"role":"user","content":"进入回收站前的消息","created_at":"2026-05-01T01:00:00Z"},{"role":"assistant","content":"进入回收站前的回答","created_at":"2026-05-01T01:00:01Z"}]}"#,
    )
    .unwrap();

    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();
    delete_session_at(
        &db_path,
        DeleteSessionPayload {
            source_tool: "codex".to_string(),
            source_id: "trash-read-1".to_string(),
            hard_delete: Some(false),
            cascade_subagents: Some(true),
        },
    )
    .unwrap();

    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    let message_count: i64 = conn
        .query_row(
            "select count(*)
             from messages m
             inner join sessions s on s.id = m.session_id
             where s.source_tool='codex' and s.source_id='trash-read-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(message_count, 0);
    let trash_state: (i64, i64) = conn
        .query_row(
            "select deleted_by_user,
                    case when deleted_at is not null then 1 else 0 end
             from sessions
             where source_tool='codex' and source_id='trash-read-1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(trash_state, (1, 1));
    drop(conn);

    let detail = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "trash-read-1".to_string(),
            include_subagent: None,
            in_trash: Some(true),
            message_limit: None,
        },
    )
    .unwrap()
    .detail
    .unwrap();
    assert_eq!(detail.messages.len(), 2);
}

#[test]
fn get_session_detail_should_apply_message_limit_before_loading_messages() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions.db");
    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "insert into sessions(
            source_tool, source_id, title, source_path, workspace_path, started_at, updated_at
         ) values(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            "codex",
            "limited-read-1",
            "Limited Read",
            "D:\\temp\\limited-read-1.json",
            "D:\\temp",
            "2026-05-01 09:00:00",
            "2026-05-01 09:00:25",
        ],
    )
    .unwrap();
    let session_id: i64 = conn
        .query_row(
            "select id from sessions where source_tool='codex' and source_id='limited-read-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    for seq in 1..=5 {
        conn.execute(
            "insert into messages(session_id, role, content, seq, created_at)
             values(?1, ?2, x'00ff', ?3, ?4)",
            params![
                session_id,
                "user",
                seq,
                format!("2026-05-01 09:00:{seq:02}")
            ],
        )
        .unwrap();
    }
    for seq in 6..=25 {
        conn.execute(
            "insert into messages(session_id, role, content, seq, created_at)
             values(?1, ?2, ?3, ?4, ?5)",
            params![
                session_id,
                "assistant",
                format!("safe-{seq}"),
                seq,
                format!("2026-05-01 09:00:{seq:02}")
            ],
        )
        .unwrap();
    }
    drop(conn);

    let detail = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "limited-read-1".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: Some(20),
        },
    )
    .unwrap()
    .detail
    .unwrap();

    assert_eq!(detail.message_total, 25);
    assert_eq!(detail.messages.len(), 20);
    assert_eq!(detail.messages[0].content, "safe-6");
    assert_eq!(detail.messages[19].content, "safe-25");
}

#[test]
fn get_session_detail_should_surface_metrics_query_errors() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("sessions.db");
    let codex_dir = td.path().join(".codex");
    init_db(&db_path).unwrap();
    fs::create_dir_all(&codex_dir).unwrap();
    fs::write(
        codex_dir.join("session.json"),
        r#"{"session_id":"metrics-error-1","title":"Metrics Error","updated_at":"2026-05-01T01:00:00Z","messages":[{"role":"user","content":"原始消息","created_at":"2026-05-01T01:00:00Z"}]}"#,
    )
    .unwrap();
    refresh_sessions_at(&db_path, &PathBuf::from(&codex_dir)).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "update sessions
         set source_file_size='not-a-number'
         where source_tool='codex' and source_id='metrics-error-1'",
        [],
    )
    .unwrap();
    drop(conn);

    let err = get_session_detail_at(
        &db_path,
        GetSessionDetailPayload {
            source_tool: "codex".to_string(),
            source_id: "metrics-error-1".to_string(),
            include_subagent: None,
            in_trash: None,
            message_limit: Some(20),
        },
    )
    .unwrap_err();

    assert_eq!(err.code, "internal_error");
    assert!(err.message.contains("source_file_size"));
}
