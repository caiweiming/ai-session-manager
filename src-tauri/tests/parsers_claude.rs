use ai_session_manager::parsers::claude::parse_claude_session;

#[test]
fn claude_parser_should_parse_main_session_jsonl() {
    let raw = r#"{"type":"permission-mode","permissionMode":"default","sessionId":"c1"}
{"type":"user","isMeta":false,"timestamp":"2026-04-12T01:40:01.764Z","cwd":"D:\\Works\\demo","sessionId":"c1","message":{"role":"user","content":"你好"}}
{"type":"assistant","isMeta":false,"timestamp":"2026-04-12T01:40:07.091Z","cwd":"D:\\Works\\demo","sessionId":"c1","message":{"role":"assistant","content":[{"type":"text","text":"你好！"}],"usage":{"input_tokens":11,"output_tokens":22}}}"#;
    let parsed = parse_claude_session(raw).unwrap();
    assert_eq!(parsed.source_id, "c1");
    assert_eq!(parsed.source_tool, "claude");
    assert_eq!(parsed.workspace_path, "D:\\Works\\demo");
    assert!(parsed.messages.iter().any(|m| m.content == "你好"));
    assert!(parsed.messages.iter().any(|m| m.content == "你好！"));
    assert_eq!(parsed.input_tokens, 11);
    assert_eq!(parsed.output_tokens, 22);
}

#[test]
fn claude_parser_should_mark_subagent_and_parent_source_id() {
    let raw = r#"{"type":"user","isSidechain":true,"sessionId":"parent-1","agentId":"a123","cwd":"D:\\Works\\demo","timestamp":"2026-04-12T01:00:00Z","message":{"role":"user","content":"子代理任务"}}"#;
    let parsed = parse_claude_session(raw).unwrap();
    assert!(parsed.is_subagent);
    assert_eq!(parsed.parent_source_id.as_deref(), Some("parent-1"));
    assert_eq!(parsed.source_id, "parent-1:agent:a123");
}
