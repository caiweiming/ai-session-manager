use ai_session_manager::domain::events::SessionDiscovered;

#[test]
fn session_discovered_should_serialize_with_source_tool() {
    let evt = SessionDiscovered {
        source_tool: "codex".into(),
        source_id: "abc".into(),
        title: "demo".into(),
        source_path: "/tmp/a.json".into(),
    };
    let v = serde_json::to_value(evt).unwrap();
    assert_eq!(v["source_tool"], "codex");
}
