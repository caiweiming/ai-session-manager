pub mod claude;
pub mod codex;
pub mod gemini;

#[derive(Debug, Clone)]
pub struct ParsedMessage {
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct ParsedSession {
    pub source_tool: String,
    pub source_id: String,
    pub title: String,
    pub source_path: String,
    pub workspace_path: String,
    pub is_subagent: bool,
    pub parent_source_id: Option<String>,
    pub started_at: String,
    pub updated_at: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub message_count: usize,
    pub messages: Vec<ParsedMessage>,
}
