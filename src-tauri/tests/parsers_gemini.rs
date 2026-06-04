use ai_session_manager::parsers::gemini::{
    parse_gemini_file, parse_gemini_file_summary, parse_gemini_session,
};
use std::fs;
use tempfile::tempdir;

#[test]
fn parse_gemini_session_should_parse_jsonl_shape() {
    let raw = r#"{"sessionId":"5a287105-f132-46fb-a4a1-1d45b425dc4d","startTime":"2026-04-28T10:00:00.000Z","lastUpdated":"2026-04-28T10:05:00.000Z","kind":"main"}
{"type":"user","timestamp":"2026-04-28T10:00:03.000Z","content":[{"text":"请帮我总结这个项目结构"}]}
{"type":"gemini","timestamp":"2026-04-28T10:00:08.000Z","content":"好的，我先扫描目录。","tokens":{"input":120,"output":45}}
{"$set":{"lastUpdated":"2026-04-28T10:10:00.000Z"}}"#;

    let parsed = parse_gemini_session(raw).unwrap();
    assert_eq!(parsed.source_tool, "gemini");
    assert_eq!(parsed.source_id, "5a287105-f132-46fb-a4a1-1d45b425dc4d");
    assert_eq!(parsed.started_at, "2026-04-28T10:00:00.000Z");
    assert_eq!(parsed.updated_at, "2026-04-28T10:10:00.000Z");
    assert_eq!(parsed.input_tokens, 120);
    assert_eq!(parsed.output_tokens, 45);
    assert_eq!(parsed.messages.len(), 2);
    assert_eq!(parsed.messages[0].role, "user");
    assert!(parsed.messages[0].content.contains("项目结构"));
    assert_eq!(parsed.messages[1].role, "assistant");
    assert!(parsed.title.contains("请帮我总结这个项目结构"));
}

#[test]
fn parse_gemini_file_and_summary_should_resolve_workspace_and_tokens() {
    let td = tempdir().unwrap();
    let project_dir = td.path().join(".gemini").join("tmp").join("D--Works-music");
    let chats_dir = project_dir.join("chats");
    fs::create_dir_all(&chats_dir).unwrap();
    fs::write(project_dir.join(".project_root"), "d:\\works\\music").unwrap();

    let file = chats_dir.join("session-abc123.jsonl");
    fs::write(
        &file,
        r#"{"sessionId":"abc123","startTime":"2026-04-27T02:00:00.000Z","lastUpdated":"2026-04-27T02:00:00.000Z","kind":"main"}
{"type":"user","timestamp":"2026-04-27T02:00:01.000Z","content":[{"text":"你好"}]}
{"type":"gemini","timestamp":"2026-04-27T02:00:02.000Z","content":"你好，我在。","tokens":{"input":"12","output":"8"}}"#,
    )
    .unwrap();

    let full = parse_gemini_file(&file).unwrap();
    assert_eq!(full.workspace_path, "d:\\works\\music");
    assert_eq!(full.source_id, "abc123");
    assert_eq!(full.input_tokens, 12);
    assert_eq!(full.output_tokens, 8);
    assert_eq!(full.messages.len(), 2);

    let summary = parse_gemini_file_summary(&file).unwrap();
    assert_eq!(summary.source_id, "abc123");
    assert_eq!(summary.workspace_path, "d:\\works\\music");
    assert_eq!(summary.input_tokens, 12);
    assert_eq!(summary.output_tokens, 8);
    assert!(summary.messages.is_empty());
}
