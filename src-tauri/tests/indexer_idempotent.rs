use ai_session_manager::services::indexer::upsert_session;
use rusqlite::Connection;

#[test]
fn upsert_session_should_be_idempotent() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "create table sessions(
            id integer primary key,
            source_tool text not null,
            source_id text not null,
            title text not null,
            source_path text not null,
            source_path_key text not null default '',
            workspace_path text not null default '',
            workspace_path_key text not null default '',
            is_subagent integer not null default 0,
            parent_source_id text,
            updated_at text not null default (datetime('now')),
            deleted_at text,
            deleted_by_user integer not null default 0,
            unique(source_tool, source_id)
        );",
    )
    .unwrap();
    upsert_session(
        &conn,
        "codex",
        "s1",
        "title1",
        "/tmp/a.jsonl",
        "/tmp",
        false,
        None,
    )
    .unwrap();
    upsert_session(
        &conn,
        "codex",
        "s1",
        "title2",
        "/tmp/a2.jsonl",
        "/tmp",
        false,
        None,
    )
    .unwrap();
    let count: i64 = conn
        .query_row(
            "select count(*) from sessions where source_tool='codex' and source_id='s1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let title: String = conn
        .query_row(
            "select title from sessions where source_tool='codex' and source_id='s1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let source_path_key: String = conn
        .query_row(
            "select source_path_key from sessions where source_tool='codex' and source_id='s1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let workspace_path_key: String = conn
        .query_row(
            "select workspace_path_key from sessions where source_tool='codex' and source_id='s1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);
    assert_eq!(title, "title2");
    assert_eq!(source_path_key, "/tmp/a2.jsonl");
    assert_eq!(workspace_path_key, "/tmp");
}

#[test]
fn upsert_session_should_normalize_windows_drive_letter() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "create table sessions(
            id integer primary key,
            source_tool text not null,
            source_id text not null,
            title text not null,
            source_path text not null,
            source_path_key text not null default '',
            workspace_path text not null default '',
            workspace_path_key text not null default '',
            is_subagent integer not null default 0,
            parent_source_id text,
            updated_at text not null default (datetime('now')),
            deleted_at text,
            deleted_by_user integer not null default 0,
            unique(source_tool, source_id)
        );",
    )
    .unwrap();

    upsert_session(
        &conn,
        "gemini",
        "sid-1",
        "title",
        "d:\\works\\ai-session\\file.jsonl",
        "\\\\?\\d:\\works\\ai-session",
        false,
        None,
    )
    .unwrap();

    let source_path: String = conn
        .query_row(
            "select source_path from sessions where source_tool='gemini' and source_id='sid-1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let workspace_path: String = conn
        .query_row(
            "select workspace_path from sessions where source_tool='gemini' and source_id='sid-1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let source_path_key: String = conn
        .query_row(
            "select source_path_key from sessions where source_tool='gemini' and source_id='sid-1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let workspace_path_key: String = conn
        .query_row(
            "select workspace_path_key from sessions where source_tool='gemini' and source_id='sid-1'",
            [],
            |r| r.get(0),
        )
        .unwrap();

    assert_eq!(source_path, "d:\\works\\ai-session\\file.jsonl");
    assert_eq!(workspace_path, "d:\\works\\ai-session");
    assert_eq!(source_path_key, "d:/works/ai-session/file.jsonl");
    assert_eq!(workspace_path_key, "d:/works/ai-session");
}
