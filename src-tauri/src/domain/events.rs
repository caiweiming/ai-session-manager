use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDiscovered {
    pub source_tool: String,
    pub source_id: String,
    pub title: String,
    pub source_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionUpdated {
    pub source_tool: String,
    pub source_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageAppended {
    pub source_tool: String,
    pub source_id: String,
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseWarning {
    pub source_tool: String,
    pub source_path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum SessionEvent {
    SessionDiscovered(SessionDiscovered),
    SessionUpdated(SessionUpdated),
    MessageAppended(MessageAppended),
    ParseWarning(ParseWarning),
}
