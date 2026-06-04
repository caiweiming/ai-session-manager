use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub source_tool: String,
    pub source_id: String,
    pub title: String,
    pub source_path: String,
}
