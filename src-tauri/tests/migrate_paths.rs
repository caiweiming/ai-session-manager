use ai_session_manager::db::migrate::init_db;
use rusqlite::Connection;
use tempfile::tempdir;

#[test]
fn init_db_should_upgrade_legacy_schema_without_workspace_path_key() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("legacy-upgrade.db");
    let conn = Connection::open(&db_path).unwrap();
    conn.execute_batch(
        r#"
        create table if not exists workspaces (
          id integer primary key,
          path text not null unique,
          name text not null,
          enabled integer not null default 1,
          last_scanned_at text
        );

        create table if not exists sessions (
          id integer primary key,
          source_tool text not null,
          source_id text not null,
          title text not null,
          workspace_id integer,
          source_path text not null,
          workspace_path text not null default '',
          started_at text,
          ended_at text,
          updated_at text not null default (datetime('now', '+8 hours')),
          size_bytes integer not null default 0,
          deleted_at text,
          foreign key (workspace_id) references workspaces(id),
          unique(source_tool, source_id)
        );

        create table if not exists messages (
          id integer primary key,
          session_id integer not null,
          role text not null,
          content text not null,
          seq integer not null,
          created_at text not null default (datetime('now', '+8 hours')),
          metadata_json text,
          foreign key (session_id) references sessions(id)
        );

        create table if not exists artifacts (
          id integer primary key,
          session_id integer not null,
          message_id integer,
          artifact_path text not null,
          bytes integer not null default 0,
          change_type text,
          foreign key (session_id) references sessions(id),
          foreign key (message_id) references messages(id)
        );

        create table if not exists tags (
          id integer primary key,
          tag text not null unique
        );

        create table if not exists session_tags (
          session_id integer not null,
          tag_id integer not null,
          primary key (session_id, tag_id),
          foreign key (session_id) references sessions(id),
          foreign key (tag_id) references tags(id)
        );

        create table if not exists settings (
          id integer primary key check (id = 1),
          theme_mode text not null default 'system',
          auto_scan_hidden_dirs integer not null default 1,
          hard_delete integer not null default 0,
          default_workspace text
        );

        create table if not exists scan_jobs (
          id integer primary key,
          workspace_id integer,
          status text not null,
          started_at text not null default (datetime('now', '+8 hours')),
          finished_at text,
          error_message text,
          foreign key (workspace_id) references workspaces(id)
        );

        create index if not exists idx_sessions_tool_updated_deleted
          on sessions(source_tool, updated_at desc, deleted_at);
        create index if not exists idx_messages_session_seq
          on messages(session_id, seq);
        create index if not exists idx_messages_content
          on messages(content);
        "#,
    )
    .unwrap();
    drop(conn);

    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    let workspace_path_key_exists: i64 = conn
        .query_row(
            "select count(*)
             from pragma_table_info('sessions')
             where name = 'workspace_path_key'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let index_exists: i64 = conn
        .query_row(
            "select count(*)
             from sqlite_master
             where type = 'index'
               and name = 'idx_sessions_workspace_path_key'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    assert_eq!(workspace_path_key_exists, 1);
    assert_eq!(index_exists, 1);
}

#[test]
fn init_db_should_normalize_existing_session_paths_drive_letter() {
    let td = tempdir().unwrap();
    let db_path = td.path().join("migrate-paths.db");
    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    conn.pragma_update(None, "user_version", 1).unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at)
         values(?1, ?2, ?3, ?4, ?5, ?6)",
        (
            "codex",
            "sid-path-1",
            "path-case",
            "\\\\?\\d:\\works\\demo\\.codex\\sessions\\a.jsonl",
            "d:\\works\\demo",
            "2026-04-30 00:00:00",
        ),
    )
    .unwrap();
    drop(conn);

    init_db(&db_path).unwrap();

    let conn = Connection::open(&db_path).unwrap();
    let source_path: String = conn
        .query_row(
            "select source_path from sessions where source_tool='codex' and source_id='sid-path-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let workspace_path: String = conn
        .query_row(
            "select workspace_path from sessions where source_tool='codex' and source_id='sid-path-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let workspace_path_key: String = conn
        .query_row(
            "select workspace_path_key from sessions where source_tool='codex' and source_id='sid-path-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let user_version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();

    assert_eq!(source_path, "D:\\works\\demo\\.codex\\sessions\\a.jsonl");
    assert_eq!(workspace_path, "D:\\works\\demo");
    assert_eq!(workspace_path_key, "d:/works/demo");
    assert_eq!(user_version, 5);
}
