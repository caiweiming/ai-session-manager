use crate::domain::events::{
    MessageAppended, ParseWarning, SessionDiscovered, SessionEvent, SessionUpdated,
};
use crate::parsers::ParsedSession;

#[derive(Debug, Clone)]
pub struct ExistingSessionSnapshot {
    pub title: String,
    pub message_count: usize,
    pub deleted_by_user: bool,
    pub deleted_at: Option<String>,
}

pub fn adapt_parsed_session_events(
    existing: Option<&ExistingSessionSnapshot>,
    parsed: &ParsedSession,
) -> Vec<SessionEvent> {
    let mut events = Vec::new();

    match existing {
        None => {
            events.push(SessionEvent::SessionDiscovered(SessionDiscovered {
                source_tool: parsed.source_tool.clone(),
                source_id: parsed.source_id.clone(),
                title: parsed.title.clone(),
                source_path: parsed.source_path.clone(),
            }));
        }
        Some(snapshot) => {
            let was_soft_deleted = snapshot
                .deleted_at
                .as_deref()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);
            let title_changed = snapshot.title != parsed.title;
            let is_reactivated = was_soft_deleted && !snapshot.deleted_by_user;

            if title_changed || parsed.message_count != snapshot.message_count || is_reactivated {
                events.push(SessionEvent::SessionUpdated(SessionUpdated {
                    source_tool: parsed.source_tool.clone(),
                    source_id: parsed.source_id.clone(),
                }));
            }

            if snapshot.message_count > 0 && parsed.messages.len() > snapshot.message_count {
                for message in parsed.messages.iter().skip(snapshot.message_count) {
                    events.push(SessionEvent::MessageAppended(MessageAppended {
                        source_tool: parsed.source_tool.clone(),
                        source_id: parsed.source_id.clone(),
                        role: message.role.clone(),
                        content: message.content.clone(),
                    }));
                }
            }
        }
    }

    events
}

pub fn adapt_parse_warning(source_tool: &str, source_path: &str, message: &str) -> SessionEvent {
    SessionEvent::ParseWarning(ParseWarning {
        source_tool: source_tool.to_string(),
        source_path: source_path.to_string(),
        message: message.to_string(),
    })
}
