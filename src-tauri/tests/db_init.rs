use ai_session_manager::db::migrate::init_db;
use rusqlite::Connection;
use tempfile::NamedTempFile;

#[test]
fn init_db_should_create_core_tables() {
    let f = NamedTempFile::new().unwrap();
    init_db(f.path()).unwrap();
    let conn = Connection::open(f.path()).unwrap();
    for table in [
        "workspaces",
        "sessions",
        "messages",
        "artifacts",
        "settings",
        "scan_jobs",
    ] {
        let count: i64 = conn
            .query_row(
                "select count(*) from sqlite_master where type='table' and name=?1",
                [table],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "missing table: {table}");
    }
}
