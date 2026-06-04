pub fn soft_delete_sql() -> &'static str {
    "update sessions set deleted_at = datetime('now', '+8 hours') where source_tool=?1 and source_id=?2"
}

pub fn hard_delete_sql() -> &'static str {
    "delete from sessions where source_tool=?1 and source_id=?2"
}
