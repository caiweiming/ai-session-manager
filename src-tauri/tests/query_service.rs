use ai_session_manager::services::query_service::{
    get_overview_summary, get_session_detail, list_sessions, list_sessions_with_scope,
    SessionListScope,
};
use rusqlite::Connection;

#[test]
fn list_sessions_should_return_new_fields_and_order_by_updated_at_desc() {
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
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            source_file_mtime integer not null default 0,
            message_cache_source_mtime integer not null default 0,
            message_cache_source_size integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, updated_at) values('codex','1','a','/tmp/a','2025-01-01 00:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, started_at, updated_at) values('codex','2','b','/tmp/b','2025-01-31 08:00:00','2025-02-01 00:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, updated_at, deleted_at) values('codex','3','c','/tmp/c','2025-03-01 00:00:00','2025-03-02 00:00:00')",
        [],
    )
    .unwrap();
    let rows = list_sessions(&conn, Some("codex"), None, None, None, 1, 20).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].source_tool, "codex");
    assert_eq!(rows[0].source_id, "2");
    assert_eq!(rows[0].title, "b");
    assert_eq!(rows[0].source_path, "/tmp/b");
    assert_eq!(rows[0].size_bytes, 0);
    assert_eq!(rows[0].created_at, "2025-01-31 08:00:00");
    assert_eq!(rows[0].updated_at, "2025-02-01 00:00:00");
    assert_eq!(rows[1].source_tool, "codex");
    assert_eq!(rows[1].source_id, "1");
    assert_eq!(rows[1].title, "a");
    assert_eq!(rows[1].source_path, "/tmp/a");
    assert_eq!(rows[1].created_at, "2025-01-01 00:00:00");
    assert_eq!(rows[1].updated_at, "2025-01-01 00:00:00");
}

#[test]
fn list_sessions_should_stably_order_by_updated_at_desc_then_id_desc() {
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
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            source_file_mtime integer not null default 0,
            message_cache_source_mtime integer not null default 0,
            message_cache_source_size integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, title, source_path, updated_at) values(10,'codex','s-10','t10','/tmp/10','2025-02-01 00:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, title, source_path, updated_at) values(11,'codex','s-11','t11','/tmp/11','2025-02-01 00:00:00')",
        [],
    )
    .unwrap();

    let rows = list_sessions(&conn, Some("codex"), None, None, None, 1, 20).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].source_id, "s-11");
    assert_eq!(rows[0].created_at, "2025-02-01 00:00:00");
    assert_eq!(rows[1].source_id, "s-10");
    assert_eq!(rows[1].created_at, "2025-02-01 00:00:00");
}

#[test]
fn list_sessions_should_cover_none_tool_branch() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "create table sessions(
            id integer primary key,
            source_tool text not null,
            source_id text not null,
            title text not null,
            source_path text not null,
            workspace_path text not null default '',
            is_subagent integer not null default 0,
            parent_source_id text,
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, updated_at) values('codex','c-1','ct','/tmp/c','2025-01-02 00:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, updated_at) values('claude','a-1','at','/tmp/a','2025-01-03 00:00:00')",
        [],
    )
    .unwrap();

    let rows = list_sessions(&conn, None, None, None, None, 1, 20).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].source_tool, "claude");
    assert_eq!(rows[0].source_id, "a-1");
    assert_eq!(rows[0].title, "at");
    assert_eq!(rows[0].source_path, "/tmp/a");
    assert_eq!(rows[0].created_at, "2025-01-03 00:00:00");
    assert_eq!(rows[0].updated_at, "2025-01-03 00:00:00");
    assert_eq!(rows[1].source_tool, "codex");
    assert_eq!(rows[1].source_id, "c-1");
    assert_eq!(rows[1].title, "ct");
    assert_eq!(rows[1].source_path, "/tmp/c");
    assert_eq!(rows[1].created_at, "2025-01-02 00:00:00");
    assert_eq!(rows[1].updated_at, "2025-01-02 00:00:00");
}

#[test]
fn get_session_detail_should_return_messages_ordered_by_seq() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "create table sessions(
            id integer primary key,
            source_tool text not null,
            source_id text not null,
            title text not null,
            source_path text not null,
            workspace_path text not null default '',
            is_subagent integer not null default 0,
            parent_source_id text,
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            source_file_mtime integer not null default 0,
            message_cache_source_mtime integer not null default 0,
            message_cache_source_size integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );
        create table messages(
            id integer primary key,
            session_id integer not null,
            role text not null,
            content text not null,
            seq integer not null,
            created_at text not null default (datetime('now'))
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, title, source_path, updated_at) values(10,'codex','sid-1','title','/tmp/x','2025-04-01 12:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into messages(session_id, role, content, seq) values(10,'assistant','third',3)",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into messages(session_id, role, content, seq) values(10,'user','first',1)",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into messages(session_id, role, content, seq) values(10,'assistant','second',2)",
        [],
    )
    .unwrap();

    let detail = get_session_detail(&conn, "codex", "sid-1", false, false)
        .unwrap()
        .expect("session detail should exist");
    assert_eq!(detail.session.source_tool, "codex");
    assert_eq!(detail.session.source_id, "sid-1");
    assert_eq!(detail.session.title, "title");
    assert_eq!(detail.session.source_path, "/tmp/x");
    assert_eq!(detail.session.size_bytes, 0);
    assert_eq!(detail.session.created_at, "2025-04-01 12:00:00");
    assert_eq!(detail.session.updated_at, "2025-04-01 12:00:00");
    assert_eq!(detail.messages.len(), 3);
    assert_eq!(detail.messages[0].seq, 1);
    assert_eq!(detail.messages[0].content, "first");
    assert_eq!(detail.messages[1].seq, 2);
    assert_eq!(detail.messages[1].content, "second");
    assert_eq!(detail.messages[2].seq, 3);
    assert_eq!(detail.messages[2].content, "third");
}

#[test]
fn get_session_detail_should_return_none_for_deleted_session() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "create table sessions(
            id integer primary key,
            source_tool text not null,
            source_id text not null,
            title text not null,
            source_path text not null,
            workspace_path text not null default '',
            is_subagent integer not null default 0,
            parent_source_id text,
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            source_file_mtime integer not null default 0,
            message_cache_source_mtime integer not null default 0,
            message_cache_source_size integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );
        create table messages(
            id integer primary key,
            session_id integer not null,
            role text not null,
            content text not null,
            seq integer not null,
            created_at text not null default (datetime('now'))
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, title, source_path, updated_at, deleted_at) values(20,'codex','sid-del','title-del','/tmp/del','2025-04-01 12:00:00','2025-04-02 12:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into messages(session_id, role, content, seq) values(20,'user','hidden',1)",
        [],
    )
    .unwrap();

    let detail = get_session_detail(&conn, "codex", "sid-del", false, false).unwrap();
    assert!(detail.is_none());
}

#[test]
fn list_sessions_should_filter_by_updated_within_days() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "create table sessions(
            id integer primary key,
            source_tool text not null,
            source_id text not null,
            title text not null,
            source_path text not null,
            workspace_path text not null default '',
            is_subagent integer not null default 0,
            parent_source_id text,
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, updated_at)
         values('codex','recent','recent','/tmp/recent', datetime('now', '-2 days'))",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, updated_at)
         values('codex','old','old','/tmp/old', datetime('now', '-40 days'))",
        [],
    )
    .unwrap();

    let rows = list_sessions(&conn, Some("codex"), None, None, Some(30), 1, 20).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].source_id, "recent");

    let all_rows = list_sessions(&conn, Some("codex"), None, None, None, 1, 20).unwrap();
    assert_eq!(all_rows.len(), 2);
}

#[test]
fn list_sessions_should_filter_by_keyword() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "create table sessions(
            id integer primary key,
            source_tool text not null,
            source_id text not null,
            title text not null,
            source_path text not null,
            workspace_path text not null default '',
            is_subagent integer not null default 0,
            parent_source_id text,
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );
        create table messages(
            id integer primary key,
            session_id integer not null,
            role text not null,
            content text not null,
            seq integer not null,
            created_at text not null default (datetime('now'))
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at)
         values('codex','alpha-id','排查 S3 签名','D:\\\\Works\\\\alpha\\\\a.jsonl','D:\\\\Works\\\\alpha','2026-04-20 10:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, workspace_path, updated_at)
         values('codex','beta-id','迁移日志索引','D:\\\\Works\\\\beta\\\\b.jsonl','D:\\\\Works\\\\beta','2026-04-20 11:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into messages(session_id, role, content, seq)
         values(
           (select id from sessions where source_tool='codex' and source_id='beta-id'),
           'user',
           '这里记录了 websocket 断连排查过程',
           1
         )",
        [],
    )
    .unwrap();

    let by_title = list_sessions(&conn, Some("codex"), None, Some("S3"), None, 1, 20).unwrap();
    assert_eq!(by_title.len(), 1);
    assert_eq!(by_title[0].source_id, "alpha-id");

    let by_path = list_sessions(&conn, Some("codex"), None, Some("beta"), None, 1, 20).unwrap();
    assert_eq!(by_path.len(), 1);
    assert_eq!(by_path[0].source_id, "beta-id");

    let by_source_id =
        list_sessions(&conn, Some("codex"), None, Some("alpha-id"), None, 1, 20).unwrap();
    assert_eq!(by_source_id.len(), 1);
    assert_eq!(by_source_id[0].source_id, "alpha-id");

    let by_message =
        list_sessions(&conn, Some("codex"), None, Some("websocket"), None, 1, 20).unwrap();
    assert_eq!(by_message.len(), 1);
    assert_eq!(by_message[0].source_id, "beta-id");
}

#[test]
fn list_sessions_should_filter_by_posix_workspace_path_key_prefix() {
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
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            source_file_mtime integer not null default 0,
            message_cache_source_mtime integer not null default 0,
            message_cache_source_size integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','posix-main','main','/Users/demo/work/a.jsonl','/Users/demo/work/a.jsonl','/Users/demo/work','/Users/demo/work','2026-05-01 09:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','posix-child','child','/Users/demo/work/nested/b.jsonl','/Users/demo/work/nested/b.jsonl','/Users/demo/work/nested','/Users/demo/work/nested','2026-05-01 10:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','posix-other','other','/Users/demo/other/c.jsonl','/Users/demo/other/c.jsonl','/Users/demo/other','/Users/demo/other','2026-05-01 11:00:00')",
        [],
    )
    .unwrap();

    assert_eq!(
        list_sessions(&conn, None, Some("/Users/demo/work"), None, None, 1, 20)
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn list_sessions_should_filter_by_posix_root_workspace_path_key() {
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
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            source_file_mtime integer not null default 0,
            message_cache_source_mtime integer not null default 0,
            message_cache_source_size integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','root','root','/session-root.jsonl','/session-root.jsonl','/','/','2026-05-02 09:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','usr','usr','/usr/demo/session.jsonl','/usr/demo/session.jsonl','/usr/demo','/usr/demo','2026-05-02 10:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','relative','relative','tmp/session.jsonl','tmp/session.jsonl','tmp','tmp','2026-05-02 11:00:00')",
        [],
    )
    .unwrap();

    let rows = list_sessions(&conn, None, Some("/"), None, None, 1, 20).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].source_id, "usr");
    assert_eq!(rows[1].source_id, "root");
}

#[test]
fn list_sessions_should_filter_by_windows_drive_root_workspace_path_key() {
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
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            source_file_mtime integer not null default 0,
            message_cache_source_mtime integer not null default 0,
            message_cache_source_size integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','drive-root','drive root','D:\\\\session-root.jsonl','d:/session-root.jsonl','D:\\\\','d:/','2026-05-02 09:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','drive-child','drive child','D:\\\\work\\\\demo\\\\session.jsonl','d:/work/demo/session.jsonl','D:\\\\work\\\\demo','d:/work/demo','2026-05-02 10:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','other-drive','other drive','E:\\\\other\\\\session.jsonl','e:/other/session.jsonl','E:\\\\other','e:/other','2026-05-02 11:00:00')",
        [],
    )
    .unwrap();

    let rows = list_sessions(&conn, None, Some("D:\\"), None, None, 1, 20).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].source_id, "drive-child");
    assert_eq!(rows[1].source_id, "drive-root");
}

#[test]
fn list_sessions_should_filter_by_unc_workspace_path_key_prefix() {
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
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            source_file_mtime integer not null default 0,
            message_cache_source_mtime integer not null default 0,
            message_cache_source_size integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','unc-main','unc main','\\\\server\\share\\repo\\a.jsonl','//server/share/repo/a.jsonl','\\\\server\\share\\repo','//server/share/repo','2026-05-03 09:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','unc-child','unc child','\\\\server\\share\\repo\\nested\\b.jsonl','//server/share/repo/nested/b.jsonl','\\\\?\\UNC\\server\\share\\repo\\nested','//server/share/repo/nested','2026-05-03 10:00:00')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(source_tool, source_id, title, source_path, source_path_key, workspace_path, workspace_path_key, updated_at)
         values('codex','unc-other','unc other','\\\\server\\share\\other\\c.jsonl','//server/share/other/c.jsonl','\\\\server\\share\\other','//server/share/other','2026-05-03 11:00:00')",
        [],
    )
    .unwrap();

    let rows = list_sessions(
        &conn,
        None,
        Some(r"\\?\UNC\server\share\repo"),
        None,
        None,
        1,
        20,
    )
    .unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].source_id, "unc-child");
    assert_eq!(rows[1].source_id, "unc-main");
}

#[test]
fn list_sessions_with_scope_should_return_trash_rows() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "create table sessions(
            id integer primary key,
            source_tool text not null,
            source_id text not null,
            title text not null,
            source_path text not null,
            workspace_path text not null default '',
            is_subagent integer not null default 0,
            parent_source_id text,
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, title, source_path, updated_at, deleted_at, deleted_by_user)
         values(1, 'codex', 'active', 'active', '/tmp/active', '2025-05-01 00:00:00', null, 0)",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, title, source_path, updated_at, deleted_at, deleted_by_user)
         values(2, 'codex', 'trash-1', 'trash 1', '/tmp/trash-1', '2025-05-01 00:00:00', '2025-05-02 00:00:00', 1)",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, title, source_path, updated_at, deleted_at, deleted_by_user)
         values(3, 'codex', 'trash-2', 'trash 2', '/tmp/trash-2', '2025-05-03 00:00:00', '2025-05-04 00:00:00', 1)",
        [],
    )
    .unwrap();

    let rows = list_sessions_with_scope(
        &conn,
        SessionListScope::Trash,
        Some("codex"),
        None,
        None,
        None,
        1,
        20,
    )
    .unwrap();

    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].source_id, "trash-2");
    assert_eq!(rows[1].source_id, "trash-1");
}

#[test]
fn get_overview_summary_should_exclude_deleted_subagent_rows_from_active_tool_stats() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "create table sessions(
            id integer primary key,
            source_tool text not null,
            source_id text not null,
            title text not null,
            source_path text not null,
            workspace_path text not null default '',
            is_subagent integer not null default 0,
            parent_source_id text,
            source_file_size integer not null default 0,
            input_token_count integer not null default 0,
            output_token_count integer not null default 0,
            started_at text,
            updated_at text not null,
            deleted_at text,
            deleted_by_user integer not null default 0
        );",
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, title, source_path, workspace_path, is_subagent, updated_at, source_file_size, deleted_by_user)
         values(1, 'codex', 'main-1', 'Main 1', '/tmp/main-1', 'D:\\work-a', 0, datetime('now'), 100, 0)",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, title, source_path, workspace_path, is_subagent, parent_source_id, updated_at, source_file_size, deleted_by_user)
         values(2, 'codex', 'sub-1', 'Sub 1', '/tmp/sub-1', 'D:\\work-a', 1, 'main-1', datetime('now'), 200, 0)",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, title, source_path, workspace_path, is_subagent, updated_at, source_file_size, deleted_by_user, deleted_at)
         values(3, 'claude', 'trash-1', 'Trash 1', '/tmp/trash-1', 'D:\\work-b', 0, datetime('now'), 300, 1, datetime('now'))",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into sessions(id, source_tool, source_id, title, source_path, workspace_path, is_subagent, parent_source_id, updated_at, source_file_size, deleted_by_user, deleted_at)
         values(4, 'claude', 'trash-sub-1', 'Trash Sub 1', '/tmp/trash-sub-1', 'D:\\work-b', 1, 'trash-1', datetime('now'), 400, 1, datetime('now'))",
        [],
    )
    .unwrap();

    let summary = get_overview_summary(&conn).unwrap();

    assert_eq!(summary.total_workspaces, 1);
    assert_eq!(summary.total_sessions, 1);
    assert_eq!(summary.active_sessions_7d, 1);
    assert_eq!(summary.trash_sessions, 1);
    assert_eq!(summary.total_size_bytes, 100);
    assert_eq!(summary.tool_stats.len(), 1);
    assert_eq!(summary.tool_stats[0].source_tool, "codex");
    assert_eq!(summary.tool_stats[0].session_count, 1);
    assert_eq!(summary.tool_stats[0].total_size_bytes, 100);
}
