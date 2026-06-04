#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsPayload {
    pub tool: Option<String>,
    pub workspace_path: Option<String>,
    pub keyword: Option<String>,
    pub updated_within_days: Option<i64>,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSessionDetailPayload {
    pub source_tool: String,
    pub source_id: String,
    pub include_subagent: Option<bool>,
    pub in_trash: Option<bool>,
    pub message_limit: Option<i64>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSubagentSessionsPayload {
    pub source_tool: String,
    pub parent_source_id: String,
    pub in_trash: Option<bool>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSessionPayload {
    pub source_tool: String,
    pub source_id: String,
    pub hard_delete: Option<bool>,
    pub cascade_subagents: Option<bool>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSessionTargetPayload {
    pub source_tool: String,
    pub source_id: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSessionsPayload {
    pub targets: Vec<DeleteSessionTargetPayload>,
    pub hard_delete: Option<bool>,
    pub cascade_subagents: Option<bool>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreSessionPayload {
    pub source_tool: String,
    pub source_id: String,
    pub cascade_subagents: Option<bool>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSessionMarkdownPayload {
    pub source_tool: String,
    pub source_id: String,
    pub include_subagent: Option<bool>,
    pub target_path: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenInExplorerPayload {
    pub path: String,
    pub reveal: Option<bool>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResumeInTerminalPayload {
    pub source_tool: String,
    pub source_id: String,
    pub workspace_path: String,
    pub terminal_preference: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenExternalUrlPayload {
    pub url: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSourcesPayload {
    pub codex: Option<bool>,
    pub claude: Option<bool>,
    pub gemini: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSourcesResponse {
    pub codex: bool,
    pub claude: bool,
    pub gemini: bool,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAppSettingsPayload {
    pub theme_mode: Option<String>,
    pub hard_delete: Option<bool>,
    pub terminal_preference: Option<String>,
    pub scan_sources: Option<ScanSourcesPayload>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListRow {
    pub source_tool: String,
    pub source_id: String,
    pub parent_source_id: Option<String>,
    pub title: String,
    pub source_path: String,
    pub workspace_path: String,
    pub is_subagent: bool,
    pub size_bytes: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListResponse {
    pub rows: Vec<SessionListRow>,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSummaryRow {
    pub source_tool: String,
    pub session_count: i64,
    pub total_size_bytes: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverviewSummaryResponse {
    pub total_workspaces: i64,
    pub total_sessions: i64,
    pub active_sessions_7d: i64,
    pub trash_sessions: i64,
    pub total_size_bytes: i64,
    pub tool_stats: Vec<ToolSummaryRow>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsResponse {
    pub theme_mode: String,
    pub hard_delete: bool,
    pub terminal_preference: String,
    pub scan_sources: ScanSourcesResponse,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOptionResponse {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilitiesResponse {
    pub os: String,
    pub terminal_options: Vec<TerminalOptionResponse>,
    pub supports_reveal_path: bool,
    pub supports_resume_in_terminal: bool,
    pub reveal_path_degrades_to_open_parent: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetail {
    pub source_tool: String,
    pub source_id: String,
    pub title: String,
    pub source_path: String,
    pub workspace_path: String,
    pub is_subagent: bool,
    pub created_at: String,
    pub updated_at: String,
    pub size_bytes: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub message_total: i64,
    pub message_loaded: i64,
    pub messages: Vec<SessionMessage>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetailResponse {
    pub detail: Option<SessionDetail>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSessionResponse {
    pub deleted_sessions: usize,
    pub deleted_source_files: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreSessionResponse {
    pub restored_sessions: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearTrashResponse {
    pub deleted_sessions: usize,
    pub deleted_source_files: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSessionMarkdownResponse {
    pub path: String,
    pub canceled: bool,
}
