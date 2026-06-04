use super::models::{
    AppSettingsResponse, OverviewSummaryResponse, ScanSourcesResponse, SessionDetail,
    SessionListRow, SessionMessage, ToolSummaryRow,
};
use crate::application::session_query_service::{
    OverviewSummaryResult, OverviewToolSummary, SessionDetailResult, SessionListItem,
};
use crate::application::session_settings_service::{AppSettingsRecord, ScanSourcesRecord};

pub fn map_session_list_row(row: SessionListItem) -> SessionListRow {
    SessionListRow {
        source_tool: row.source_tool,
        source_id: row.source_id,
        parent_source_id: row.parent_source_id,
        title: row.title,
        source_path: row.source_path,
        workspace_path: row.workspace_path,
        is_subagent: row.is_subagent,
        size_bytes: row.size_bytes,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

pub fn map_session_detail(detail: SessionDetailResult) -> SessionDetail {
    SessionDetail {
        source_tool: detail.source_tool,
        source_id: detail.source_id,
        title: detail.title,
        source_path: detail.source_path,
        workspace_path: detail.workspace_path,
        is_subagent: detail.is_subagent,
        created_at: detail.created_at,
        updated_at: detail.updated_at,
        size_bytes: detail.size_bytes,
        input_tokens: detail.input_tokens,
        output_tokens: detail.output_tokens,
        message_total: detail.message_total,
        message_loaded: detail.message_loaded,
        messages: detail
            .messages
            .into_iter()
            .map(|message| SessionMessage {
                role: message.role,
                content: message.content,
                created_at: message.created_at,
            })
            .collect(),
    }
}

pub fn map_overview_tool_summary(row: OverviewToolSummary) -> ToolSummaryRow {
    ToolSummaryRow {
        source_tool: row.source_tool,
        session_count: row.session_count,
        total_size_bytes: row.total_size_bytes,
    }
}

pub fn map_overview_summary(summary: OverviewSummaryResult) -> OverviewSummaryResponse {
    OverviewSummaryResponse {
        total_workspaces: summary.total_workspaces,
        total_sessions: summary.total_sessions,
        active_sessions_7d: summary.active_sessions_7d,
        trash_sessions: summary.trash_sessions,
        total_size_bytes: summary.total_size_bytes,
        tool_stats: summary
            .tool_stats
            .into_iter()
            .map(map_overview_tool_summary)
            .collect(),
    }
}

fn map_scan_sources(record: ScanSourcesRecord) -> ScanSourcesResponse {
    ScanSourcesResponse {
        codex: record.codex,
        claude: record.claude,
        gemini: record.gemini,
    }
}

pub fn map_app_settings(record: AppSettingsRecord) -> AppSettingsResponse {
    AppSettingsResponse {
        theme_mode: record.theme_mode,
        hard_delete: record.hard_delete,
        terminal_preference: record.terminal_preference,
        scan_sources: map_scan_sources(record.scan_sources),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_session_list_row_preserves_key_fields() {
        let row = SessionListItem {
            source_tool: "codex".to_string(),
            source_id: "session-001".to_string(),
            parent_source_id: Some("parent-001".to_string()),
            title: "title".to_string(),
            source_path: "/tmp/session.json".to_string(),
            workspace_path: "/workspace".to_string(),
            is_subagent: true,
            size_bytes: 4096,
            created_at: "2026-05-10T08:00:00Z".to_string(),
            updated_at: "2026-05-10T09:00:00Z".to_string(),
        };

        let mapped = map_session_list_row(row);

        assert_eq!(mapped.source_tool, "codex");
        assert_eq!(mapped.source_id, "session-001");
        assert_eq!(mapped.parent_source_id.as_deref(), Some("parent-001"));
        assert_eq!(mapped.title, "title");
        assert_eq!(mapped.size_bytes, 4096);
    }

    #[test]
    fn map_session_detail_preserves_counts_and_message_timestamps() {
        let detail = SessionDetailResult {
            source_tool: "codex".to_string(),
            source_id: "session-002".to_string(),
            title: "detail".to_string(),
            source_path: "/tmp/detail.json".to_string(),
            workspace_path: "/workspace".to_string(),
            is_subagent: false,
            created_at: "2026-05-10T08:10:00Z".to_string(),
            updated_at: "2026-05-10T09:10:00Z".to_string(),
            size_bytes: 8192,
            input_tokens: 12,
            output_tokens: 34,
            message_total: 3,
            message_loaded: 2,
            messages: vec![
                crate::application::session_query_service::SessionMessage {
                    role: "user".to_string(),
                    content: "hello".to_string(),
                    created_at: "2026-05-10T08:11:00Z".to_string(),
                },
                crate::application::session_query_service::SessionMessage {
                    role: "assistant".to_string(),
                    content: "world".to_string(),
                    created_at: "2026-05-10T08:12:00Z".to_string(),
                },
            ],
        };

        let mapped = map_session_detail(detail);

        assert_eq!(mapped.message_total, 3);
        assert_eq!(mapped.message_loaded, 2);
        assert_eq!(
            mapped
                .messages
                .iter()
                .map(|message| message.created_at.as_str())
                .collect::<Vec<_>>(),
            vec!["2026-05-10T08:11:00Z", "2026-05-10T08:12:00Z"]
        );
    }

    #[test]
    fn map_overview_summary_preserves_tool_stats() {
        let summary = OverviewSummaryResult {
            total_workspaces: 1,
            total_sessions: 2,
            active_sessions_7d: 3,
            trash_sessions: 4,
            total_size_bytes: 5,
            tool_stats: vec![
                OverviewToolSummary {
                    source_tool: "codex".to_string(),
                    session_count: 6,
                    total_size_bytes: 7,
                },
                OverviewToolSummary {
                    source_tool: "other".to_string(),
                    session_count: 8,
                    total_size_bytes: 9,
                },
            ],
        };

        let mapped = map_overview_summary(summary);

        assert_eq!(mapped.tool_stats.len(), 2);
        assert_eq!(mapped.tool_stats[0].source_tool, "codex");
        assert_eq!(mapped.tool_stats[0].session_count, 6);
        assert_eq!(mapped.tool_stats[0].total_size_bytes, 7);
        assert_eq!(mapped.tool_stats[1].source_tool, "other");
    }

    #[test]
    fn map_app_settings_preserves_user_preferences() {
        let record = AppSettingsRecord {
            theme_mode: "dark".to_string(),
            hard_delete: true,
            terminal_preference: "wezterm".to_string(),
            scan_sources: ScanSourcesRecord {
                codex: true,
                claude: false,
                gemini: true,
            },
        };

        let mapped = map_app_settings(record);

        assert_eq!(mapped.theme_mode, "dark");
        assert!(mapped.hard_delete);
        assert_eq!(mapped.terminal_preference, "wezterm");
        assert!(mapped.scan_sources.codex);
        assert!(!mapped.scan_sources.claude);
        assert!(mapped.scan_sources.gemini);
    }
}
