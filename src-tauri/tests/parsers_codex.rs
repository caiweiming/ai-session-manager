use ai_session_manager::parsers::codex::{
    parse_codex_file, parse_codex_file_summary, parse_codex_session,
};
use std::fs;
use std::path::PathBuf;
use tempfile::tempdir;

#[test]
fn codex_parser_should_extract_session_and_messages_from_file() {
    let fixture =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/codex/session.json");
    let parsed = parse_codex_file(&fixture).unwrap();

    assert_eq!(parsed.source_tool, "codex");
    assert_eq!(parsed.source_id, "session_001");
    assert_eq!(parsed.title, "Codex sample session");
    assert_eq!(parsed.source_path, fixture.to_string_lossy());
    assert_eq!(parsed.workspace_path, fixture.to_string_lossy());
    assert_eq!(parsed.started_at, "2026-04-24T10:20:00Z");
    assert_eq!(parsed.updated_at, "2026-04-24T10:30:00Z");
    assert_eq!(parsed.messages.len(), 2);
    assert_eq!(parsed.messages[0].role, "user");
    assert_eq!(parsed.messages[0].content, "请帮我排查超时");
    assert_eq!(parsed.messages[0].created_at, "2026-04-24T10:20:00Z");
    assert_eq!(parsed.messages[1].role, "assistant");
    assert_eq!(parsed.messages[1].content, "我先看日志");
    assert_eq!(parsed.messages[1].created_at, "2026-04-24T10:21:00Z");
}

#[test]
fn codex_parser_should_parse_multiline_jsonl_file() {
    let fixture =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/codex/session_multi.jsonl");
    let parsed = parse_codex_file(&fixture).unwrap();

    assert_eq!(parsed.source_tool, "codex");
    assert_eq!(parsed.source_id, "session_jsonl_01");
    assert_eq!(parsed.title, "jsonl session");
}

#[test]
fn codex_parser_should_error_when_session_id_is_missing() {
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/codex/session_missing_id.json");
    let err = parse_codex_file(&fixture).unwrap_err();
    assert!(err.to_string().contains("session_id"));
}

#[test]
fn codex_parser_should_error_when_session_id_is_empty() {
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/codex/session_empty_id.json");
    let err = parse_codex_file(&fixture).unwrap_err();
    assert!(err.to_string().contains("session_id"));
}

#[test]
fn codex_parser_should_support_rollout_jsonl_session_meta_and_event_messages() {
    let raw = r#"{"timestamp":"2026-04-21T13:04:45.967Z","type":"session_meta","payload":{"id":"019db023-0fc9-7820-842a-dca6d4b9e6e7","timestamp":"2026-04-21T13:03:01.079Z","cwd":"D:\\Works\\demo"}}
{"timestamp":"2026-04-21T13:04:56.628Z","type":"event_msg","payload":{"type":"user_message","message":"请帮我分析这个仓库"}}
{"timestamp":"2026-04-21T13:04:57.628Z","type":"event_msg","payload":{"type":"agent_message","message":"我会先扫描项目结构"}}
{"timestamp":"2026-04-21T13:05:07.399Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"扫描完成，已定位关键模块。"}]}}"#;

    let parsed = parse_codex_session(raw).unwrap();

    assert_eq!(parsed.source_tool, "codex");
    assert_eq!(parsed.source_id, "019db023-0fc9-7820-842a-dca6d4b9e6e7");
    assert_eq!(parsed.title, "请帮我分析这个仓库");
    assert_eq!(parsed.workspace_path, "D:\\Works\\demo");
    assert_eq!(parsed.started_at, "2026-04-21T13:03:01.079Z");
    assert_eq!(parsed.updated_at, "2026-04-21T13:05:07.399Z");
    assert!(
        parsed
            .messages
            .iter()
            .any(|m| m.role == "user" && m.content == "请帮我分析这个仓库"),
        "expected user_message from event_msg to be parsed"
    );
    assert!(
        parsed
            .messages
            .iter()
            .any(|m| m.role == "assistant" && m.content == "扫描完成，已定位关键模块。"),
        "expected assistant content from response_item message to be parsed"
    );
}

#[test]
fn codex_parser_should_extract_parent_source_id_for_subagent_session() {
    let raw = r#"{"timestamp":"2026-04-24T06:31:40.451Z","type":"session_meta","payload":{"id":"019dbe2f-d9bb-7722-b2fa-cbda0f106c6d","timestamp":"2026-04-24T06:31:40.244Z","cwd":"D:\\Works\\ai-session","source":{"subagent":{"thread_spawn":{"parent_thread_id":"019dbb44-6cf6-7d93-8fe8-e7680efd0e23"}}}}}
{"timestamp":"2026-04-24T06:31:50.451Z","type":"event_msg","payload":{"type":"agent_message","message":"子代理执行中"}}"#;

    let parsed = parse_codex_session(raw).unwrap();
    assert!(parsed.is_subagent);
    assert_eq!(
        parsed.parent_source_id.as_deref(),
        Some("019dbb44-6cf6-7d93-8fe8-e7680efd0e23")
    );
}

#[test]
fn codex_parser_summary_should_skip_instruction_blocks_for_title() {
    let td = tempdir().unwrap();
    let session_file = td.path().join("session-summary.jsonl");
    fs::write(
        &session_file,
        r##"{"timestamp":"2026-04-27T08:00:00.000Z","type":"session_meta","payload":{"id":"summary-001","timestamp":"2026-04-27T08:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-27T08:00:01.000Z","type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"<permissions instructions> Filesystem sandboxing defines which files can be read or written."}]}}
{"timestamp":"2026-04-27T08:00:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions for D:\\Works\\ai-session"}]}}
{"timestamp":"2026-04-27T08:00:03.000Z","type":"event_msg","payload":{"type":"user_message","message":"请帮我修复会话标题显示异常"}}"##,
    )
    .unwrap();

    let parsed = parse_codex_file_summary(&session_file).unwrap();
    assert_eq!(parsed.source_id, "summary-001");
    assert_eq!(parsed.title, "请帮我修复会话标题显示异常");
}

#[test]
fn codex_parser_should_skip_instruction_like_user_messages_for_title() {
    let raw = r##"{"timestamp":"2026-04-27T09:00:00.000Z","type":"session_meta","payload":{"id":"title-001","timestamp":"2026-04-27T09:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-27T09:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions for D:\\Works\\ai-session"}]}}
{"timestamp":"2026-04-27T09:00:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"请帮我定位扫描卡顿的根因"}]}}"##;

    let parsed = parse_codex_session(raw).unwrap();
    assert_eq!(parsed.source_id, "title-001");
    assert_eq!(parsed.title, "请帮我定位扫描卡顿的根因");
}

#[test]
fn codex_parser_should_extract_input_and_output_tokens() {
    let raw = r#"{"timestamp":"2026-04-27T10:00:00.000Z","type":"session_meta","payload":{"id":"token-001","timestamp":"2026-04-27T10:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-27T10:00:05.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"第一段回复"}],"usage":{"input_tokens":1200,"output_tokens":320}}}
{"timestamp":"2026-04-27T10:00:10.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"第二段回复"}],"usage":{"prompt_tokens":800,"completion_tokens":260}}}"#;

    let parsed = parse_codex_session(raw).unwrap();
    assert_eq!(parsed.source_id, "token-001");
    assert_eq!(parsed.input_tokens, 2000);
    assert_eq!(parsed.output_tokens, 580);
}

#[test]
fn codex_parser_should_extract_token_count_total_usage_snapshot() {
    let raw = r#"{"timestamp":"2026-04-28T10:00:00.000Z","type":"session_meta","payload":{"id":"token-snapshot-001","timestamp":"2026-04-28T10:00:00.000Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-04-28T10:00:02.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":1200,"cached_input_tokens":900,"output_tokens":320,"reasoning_output_tokens":80,"total_tokens":1520}}}}
{"timestamp":"2026-04-28T10:00:03.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":2200,"cached_input_tokens":1500,"output_tokens":580,"reasoning_output_tokens":120,"total_tokens":2780}}}}"#;

    let parsed = parse_codex_session(raw).unwrap();
    assert_eq!(parsed.source_id, "token-snapshot-001");
    assert_eq!(parsed.input_tokens, 2200);
    assert_eq!(parsed.output_tokens, 580);
}

#[test]
fn codex_parser_summary_should_extract_token_snapshot_after_title_breakpoint() {
    let td = tempdir().unwrap();
    let session_file = td.path().join("session-summary-token-snapshot.jsonl");
    fs::write(
        &session_file,
        r#"{"timestamp":"2026-05-15T12:44:42.167Z","type":"session_meta","payload":{"id":"summary-token-001","timestamp":"2026-05-15T12:44:42.167Z","cwd":"D:\\Works\\ai-session"}}
{"timestamp":"2026-05-15T12:44:43.000Z","type":"event_msg","payload":{"type":"user_message","message":"请帮我检查为什么 token 显示为 0"}}
{"timestamp":"2026-05-15T12:44:44.000Z","type":"event_msg","payload":{"type":"token_count","info":null}}
{"timestamp":"2026-05-15T12:44:45.000Z","type":"event_msg","payload":{"type":"agent_message","message":"我先检查解析链路"}}
{"timestamp":"2026-05-15T12:44:46.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":14287,"cached_input_tokens":9600,"output_tokens":858,"reasoning_output_tokens":516,"total_tokens":15145}}}}"#,
    )
    .unwrap();

    let parsed = parse_codex_file_summary(&session_file).unwrap();
    assert_eq!(parsed.source_id, "summary-token-001");
    assert_eq!(parsed.title, "请帮我检查为什么 token 显示为 0");
    assert_eq!(parsed.input_tokens, 14287);
    assert_eq!(parsed.output_tokens, 858);
}
