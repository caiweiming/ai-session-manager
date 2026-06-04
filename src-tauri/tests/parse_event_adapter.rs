use ai_session_manager::domain::events::SessionEvent;
use ai_session_manager::parsers::{ParsedMessage, ParsedSession};
use ai_session_manager::services::parser_adapter::{
    adapt_parse_warning, adapt_parsed_session_events, ExistingSessionSnapshot,
};

fn build_parsed_session(messages: &[(&str, &str)]) -> ParsedSession {
    ParsedSession {
        source_tool: "codex".to_string(),
        source_id: "session-adapter-001".to_string(),
        title: "Adapter Demo".to_string(),
        source_path: "D:\\demo\\session.jsonl".to_string(),
        workspace_path: "D:\\demo".to_string(),
        is_subagent: false,
        parent_source_id: None,
        started_at: "2026-05-14T08:00:00Z".to_string(),
        updated_at: "2026-05-14T08:10:00Z".to_string(),
        input_tokens: 12,
        output_tokens: 34,
        message_count: messages.len(),
        messages: messages
            .iter()
            .enumerate()
            .map(|(index, (role, content))| ParsedMessage {
                role: (*role).to_string(),
                content: (*content).to_string(),
                created_at: format!("2026-05-14T08:{:02}:00Z", index),
            })
            .collect(),
    }
}

#[test]
fn adapt_parsed_session_events_should_emit_discovered_for_new_session() {
    let parsed = build_parsed_session(&[("user", "first message")]);

    let events = adapt_parsed_session_events(None, &parsed);

    assert_eq!(events.len(), 1);
    assert!(matches!(
        &events[0],
        SessionEvent::SessionDiscovered(event)
            if event.source_tool == "codex"
                && event.source_id == "session-adapter-001"
                && event.title == "Adapter Demo"
    ));
}

#[test]
fn adapt_parsed_session_events_should_emit_update_and_new_messages_for_existing_session() {
    let parsed = build_parsed_session(&[
        ("user", "first message"),
        ("assistant", "second message"),
        ("assistant", "third message"),
    ]);
    let existing = ExistingSessionSnapshot {
        title: "Old Title".to_string(),
        message_count: 2,
        deleted_by_user: false,
        deleted_at: None,
    };

    let events = adapt_parsed_session_events(Some(&existing), &parsed);

    assert_eq!(events.len(), 2);
    assert!(matches!(
        &events[0],
        SessionEvent::SessionUpdated(event)
            if event.source_tool == "codex" && event.source_id == "session-adapter-001"
    ));
    assert!(matches!(
        &events[1],
        SessionEvent::MessageAppended(event)
            if event.source_tool == "codex"
                && event.source_id == "session-adapter-001"
                && event.role == "assistant"
                && event.content == "third message"
    ));
}

#[test]
fn adapt_parse_warning_should_wrap_parse_failure_as_domain_event() {
    let event = adapt_parse_warning("gemini", "D:\\demo\\broken.jsonl", "invalid session id");

    assert!(matches!(
        event,
        SessionEvent::ParseWarning(payload)
            if payload.source_tool == "gemini"
                && payload.source_path == "D:\\demo\\broken.jsonl"
                && payload.message == "invalid session id"
    ));
}
