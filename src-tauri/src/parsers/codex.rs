use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use super::{ParsedMessage, ParsedSession};
use anyhow::{anyhow, bail};
use serde_json::Value;

use crate::path_identity::display_path;

const DEFAULT_TIME: &str = "1970-01-01T00:00:00Z";

pub fn parse_codex_file(path: &Path) -> anyhow::Result<ParsedSession> {
    let raw = fs::read_to_string(path)?;
    parse_codex_json(&raw, path.to_string_lossy().to_string())
}

pub fn parse_codex_file_summary(path: &Path) -> anyhow::Result<ParsedSession> {
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .map(|v| v.to_ascii_lowercase())
        .unwrap_or_default();
    if ext == "json" {
        let mut parsed = parse_codex_file(path)?;
        parsed.messages.clear();
        return Ok(parsed);
    }

    let source_path = path.to_string_lossy().to_string();
    let file = fs::File::open(path)?;
    let reader = BufReader::new(file);

    let mut source_id: Option<String> = None;
    let mut workspace_path: Option<String> = None;
    let mut started_at = String::new();
    let mut title_text: Option<String> = None;
    let mut title_priority = u8::MAX;
    let mut is_subagent = false;
    let mut parent_source_id: Option<String> = None;
    let mut token_usage = TokenUsageAccumulator::default();

    const MAX_TITLE_SCAN_LINES: usize = 24;
    let mut line_count = 0usize;
    for line in reader.lines() {
        line_count += 1;

        let raw = line?;
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(entry) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };

        if source_id.is_none() {
            if let Some(id) = valid_session_id(&entry) {
                source_id = Some(id.to_string());
            } else if let Some(id) = non_empty_str(&entry["payload"]["id"]) {
                source_id = Some(id.to_string());
            }
        }

        if workspace_path.is_none() {
            if let Some(path) = extract_workspace_path(std::slice::from_ref(&entry)) {
                workspace_path = Some(path);
            }
        }

        if started_at.is_empty() {
            if let Some(ts) = non_empty_str(&entry["payload"]["timestamp"]) {
                started_at = ts.to_string();
            } else if let Some(ts) = non_empty_str(&entry["timestamp"]) {
                started_at = ts.to_string();
            } else if let Some(ts) = non_empty_str(&entry["created_at"]) {
                started_at = ts.to_string();
            }
        }

        if line_count <= MAX_TITLE_SCAN_LINES {
            if let Some((priority, text)) = extract_entry_title_candidate(&entry) {
                if summarize_text_as_title(&text).is_some()
                    && (title_text.is_none() || priority < title_priority)
                {
                    title_text = Some(text);
                    title_priority = priority;
                }
            }
        }

        if !is_subagent {
            is_subagent = extract_is_subagent(std::slice::from_ref(&entry));
        }
        if parent_source_id.is_none() {
            parent_source_id = extract_parent_source_id(std::slice::from_ref(&entry));
        }
        token_usage.record(&entry);
    }

    let (input_tokens, output_tokens) = token_usage.finish();

    let source_id = source_id.ok_or_else(|| anyhow!("invalid session_id: missing or empty"))?;
    let title = title_text
        .as_deref()
        .and_then(summarize_text_as_title)
        .unwrap_or_else(|| extract_title(None, &[], &source_path, &source_id));
    let workspace_path = workspace_path.unwrap_or_else(|| source_path.clone());
    let started_at = if started_at.is_empty() {
        DEFAULT_TIME.to_string()
    } else {
        started_at
    };

    Ok(ParsedSession {
        source_tool: "codex".to_string(),
        source_id,
        title,
        source_path,
        workspace_path,
        is_subagent,
        parent_source_id,
        started_at: started_at.clone(),
        updated_at: started_at,
        input_tokens,
        output_tokens,
        message_count: 0,
        messages: Vec::new(),
    })
}

pub fn parse_codex_session(raw: &str) -> anyhow::Result<ParsedSession> {
    parse_codex_json(raw, String::new())
}

fn parse_codex_json(raw: &str, source_path: String) -> anyhow::Result<ParsedSession> {
    let entries = parse_entries(raw)?;
    let source_id = extract_source_id(&entries)
        .ok_or_else(|| anyhow!("invalid session_id: missing or empty"))?;

    let session_entry = entries.iter().find(|item| valid_session_id(item).is_some());
    let mut messages = extract_legacy_messages(session_entry);
    messages.extend(extract_flat_messages(&entries));
    messages.extend(extract_event_messages(&entries));
    messages.extend(extract_response_messages(&entries));

    let title = extract_title(session_entry, &messages, &source_path, &source_id);
    let updated_at = extract_updated_at(session_entry, &entries);
    let started_at = extract_started_at(session_entry, &entries, &messages, &updated_at);
    let workspace_path = extract_workspace_path(&entries).unwrap_or_else(|| source_path.clone());
    let is_subagent = extract_is_subagent(&entries);
    let parent_source_id = extract_parent_source_id(&entries);
    let (input_tokens, output_tokens) = extract_token_usage_from_entries(&entries);

    // 兜底，避免空消息导致详情面板完全无可读信息。
    if messages.is_empty() {
        messages.push(ParsedMessage {
            role: "dev".to_string(),
            content: "该会话无可解析消息".to_string(),
            created_at: updated_at.clone(),
        });
    }

    Ok(ParsedSession {
        source_tool: "codex".to_string(),
        source_id,
        title,
        source_path,
        workspace_path,
        is_subagent,
        parent_source_id,
        started_at,
        updated_at,
        input_tokens,
        output_tokens,
        message_count: messages.len(),
        messages,
    })
}

fn parse_entries(raw: &str) -> anyhow::Result<Vec<serde_json::Value>> {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) {
        return Ok(vec![value]);
    }

    let mut entries = Vec::new();
    for line in raw.lines().map(str::trim).filter(|line| !line.is_empty()) {
        entries.push(serde_json::from_str::<serde_json::Value>(line)?);
    }

    if entries.is_empty() {
        bail!("empty codex payload");
    }
    Ok(entries)
}

fn valid_session_id(value: &serde_json::Value) -> Option<&str> {
    let id = value["session_id"].as_str()?;
    if id.trim().is_empty() {
        return None;
    }
    Some(id)
}

fn non_empty_str(value: &Value) -> Option<&str> {
    let text = value.as_str()?;
    if text.trim().is_empty() {
        return None;
    }
    Some(text)
}

fn extract_source_id(entries: &[Value]) -> Option<String> {
    for entry in entries {
        if let Some(session_id) = valid_session_id(entry) {
            return Some(session_id.to_string());
        }
        if let Some(id) = non_empty_str(&entry["payload"]["id"]) {
            return Some(id.to_string());
        }
    }
    None
}

fn extract_legacy_messages(session_entry: Option<&Value>) -> Vec<ParsedMessage> {
    let mut messages = Vec::new();
    if let Some(entry) = session_entry {
        if let Some(items) = entry["messages"].as_array() {
            for item in items {
                let content = item["content"]
                    .as_str()
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                if content.is_empty() {
                    continue;
                }
                messages.push(ParsedMessage {
                    role: item["role"].as_str().unwrap_or("user").to_string(),
                    content,
                    created_at: item["created_at"]
                        .as_str()
                        .unwrap_or(DEFAULT_TIME)
                        .to_string(),
                });
            }
        }
    }
    messages
}

fn extract_event_messages(entries: &[Value]) -> Vec<ParsedMessage> {
    let mut messages = Vec::new();
    for entry in entries {
        let role = match entry["type"].as_str() {
            Some("event_msg") => match entry["payload"]["type"].as_str() {
                Some("user_message") => Some("user"),
                Some("agent_message") => Some("assistant"),
                _ => None,
            },
            _ => None,
        };
        let Some(role) = role else {
            continue;
        };

        let content = entry["payload"]["message"]
            .as_str()
            .unwrap_or_default()
            .trim();
        if content.is_empty() {
            continue;
        }
        messages.push(ParsedMessage {
            role: role.to_string(),
            content: content.to_string(),
            created_at: entry_timestamp(entry).unwrap_or_else(|| DEFAULT_TIME.to_string()),
        });
    }
    messages
}

fn extract_flat_messages(entries: &[Value]) -> Vec<ParsedMessage> {
    let mut messages = Vec::new();
    for entry in entries {
        let role = entry["role"].as_str();
        let content = entry["content"].as_str();
        let (Some(role), Some(content)) = (role, content) else {
            continue;
        };
        let trimmed = content.trim();
        if trimmed.is_empty() {
            continue;
        }
        messages.push(ParsedMessage {
            role: role.to_string(),
            content: trimmed.to_string(),
            created_at: entry["created_at"]
                .as_str()
                .unwrap_or(DEFAULT_TIME)
                .to_string(),
        });
    }
    messages
}

fn extract_response_messages(entries: &[Value]) -> Vec<ParsedMessage> {
    let mut messages = Vec::new();
    for entry in entries {
        if entry["type"].as_str() != Some("response_item") {
            continue;
        }
        if entry["payload"]["type"].as_str() != Some("message") {
            continue;
        }

        let role = entry["payload"]["role"]
            .as_str()
            .unwrap_or("assistant")
            .to_string();
        let content = extract_response_text(&entry["payload"]["content"]);
        let Some(content) = content else {
            continue;
        };

        messages.push(ParsedMessage {
            role,
            content,
            created_at: entry_timestamp(entry).unwrap_or_else(|| DEFAULT_TIME.to_string()),
        });
    }
    messages
}

fn extract_response_text(content: &Value) -> Option<String> {
    let mut parts = Vec::new();
    for part in content.as_array()? {
        if let Some(text) = part["text"].as_str() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                parts.push(trimmed.to_string());
            }
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("\n"))
}

fn entry_timestamp(entry: &Value) -> Option<String> {
    if let Some(ts) = non_empty_str(&entry["timestamp"]) {
        return Some(ts.to_string());
    }
    if let Some(ts) = non_empty_str(&entry["payload"]["timestamp"]) {
        return Some(ts.to_string());
    }
    if let Some(ts) = entry["ts"].as_i64() {
        return Some(ts.to_string());
    }
    None
}

fn extract_title(
    session_entry: Option<&Value>,
    messages: &[ParsedMessage],
    source_path: &str,
    source_id: &str,
) -> String {
    if let Some(entry) = session_entry {
        if let Some(title) = non_empty_str(&entry["title"]) {
            return title.to_string();
        }
    }

    if let Some(summary) = summarize_messages_as_title(messages) {
        return summary;
    }

    if !source_path.trim().is_empty() {
        if let Some(file_name) = PathBuf::from(source_path)
            .file_name()
            .and_then(|name| name.to_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            return file_name.to_string();
        }
    }

    format!("session-{source_id}")
}

fn summarize_messages_as_title(messages: &[ParsedMessage]) -> Option<String> {
    for priority in 0..=2 {
        if let Some(summary) = messages
            .iter()
            .filter(|message| title_role_priority(&message.role) == priority)
            .filter_map(|message| summarize_text_as_title(&message.content))
            .next()
        {
            return Some(summary);
        }
    }
    None
}

fn summarize_text_as_title(content: &str) -> Option<String> {
    let normalized = content.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() || is_instruction_like_title_text(&normalized) {
        return None;
    }

    const MAX_CHARS: usize = 48;
    let mut chars = normalized.chars();
    let preview: String = chars.by_ref().take(MAX_CHARS).collect();
    if chars.next().is_some() {
        return Some(format!("{preview}..."));
    }
    Some(preview)
}

fn extract_entry_title_candidate(entry: &Value) -> Option<(u8, String)> {
    if let Some(text) = non_empty_str(&entry["payload"]["message"]) {
        let priority = match entry["payload"]["type"].as_str() {
            Some("user_message") => 0,
            Some("agent_message") => 1,
            _ => 2,
        };
        return Some((priority, text.to_string()));
    }
    if let Some(text) = non_empty_str(&entry["content"]) {
        let role = entry["role"].as_str().unwrap_or_default();
        return Some((title_role_priority(role), text.to_string()));
    }
    if entry["type"].as_str() == Some("response_item")
        && entry["payload"]["type"].as_str() == Some("message")
    {
        let role = entry["payload"]["role"].as_str().unwrap_or("assistant");
        let text = extract_response_text(&entry["payload"]["content"])?;
        return Some((title_role_priority(role), text));
    }
    None
}

fn title_role_priority(role: &str) -> u8 {
    match role {
        "user" => 0,
        "assistant" | "agent" => 1,
        _ => 2,
    }
}

fn is_instruction_like_title_text(content: &str) -> bool {
    let lower = content.to_ascii_lowercase();
    lower.contains("<permissions instructions>")
        || lower.contains("filesystem sandboxing defines which files can be read or written")
        || lower.contains("<skills_instructions>")
        || lower.contains("<collaboration_mode>")
        || lower.contains("<environment_context>")
        || lower.starts_with("# agents.md instructions")
        || lower.contains("### available skills")
}

fn extract_updated_at(session_entry: Option<&Value>, entries: &[Value]) -> String {
    if let Some(entry) = session_entry {
        if let Some(updated_at) = non_empty_str(&entry["updated_at"]) {
            return updated_at.to_string();
        }
    }

    let mut latest = String::new();
    for entry in entries {
        if let Some(ts) = entry_timestamp(entry) {
            if ts > latest {
                latest = ts;
            }
        }
    }

    if latest.is_empty() {
        DEFAULT_TIME.to_string()
    } else {
        latest
    }
}

fn extract_started_at(
    session_entry: Option<&Value>,
    entries: &[Value],
    messages: &[ParsedMessage],
    fallback_updated_at: &str,
) -> String {
    if let Some(entry) = session_entry {
        if let Some(started_at) = non_empty_str(&entry["started_at"]) {
            return started_at.to_string();
        }
        if let Some(created_at) = non_empty_str(&entry["created_at"]) {
            return created_at.to_string();
        }
    }

    let mut earliest = String::new();
    for entry in entries {
        if let Some(ts) = non_empty_str(&entry["timestamp"]) {
            update_earliest(&mut earliest, ts);
        }
        if let Some(ts) = non_empty_str(&entry["payload"]["timestamp"]) {
            update_earliest(&mut earliest, ts);
        }
        if let Some(ts) = non_empty_str(&entry["created_at"]) {
            update_earliest(&mut earliest, ts);
        }
        if let Some(ts) = non_empty_str(&entry["payload"]["created_at"]) {
            update_earliest(&mut earliest, ts);
        }
        if let Some(ts) = entry["ts"].as_i64() {
            update_earliest(&mut earliest, &ts.to_string());
        }
    }
    for message in messages {
        if message.created_at == DEFAULT_TIME {
            continue;
        }
        update_earliest(&mut earliest, &message.created_at);
    }

    let mut started_at = if earliest.is_empty() {
        fallback_updated_at.to_string()
    } else {
        earliest
    };

    if started_at.as_str() > fallback_updated_at {
        started_at = fallback_updated_at.to_string();
    }

    started_at
}

fn update_earliest(current: &mut String, candidate: &str) {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return;
    }
    if current.is_empty() || trimmed < current.as_str() {
        *current = trimmed.to_string();
    }
}

fn extract_workspace_path(entries: &[Value]) -> Option<String> {
    for entry in entries {
        if let Some(path) = non_empty_str(&entry["payload"]["cwd"]) {
            return Some(normalize_workspace_path(path));
        }
        if let Some(path) = non_empty_str(&entry["cwd"]) {
            return Some(normalize_workspace_path(path));
        }
        if let Some(path) = non_empty_str(&entry["payload"]["workspace_path"]) {
            return Some(normalize_workspace_path(path));
        }
        if let Some(path) = non_empty_str(&entry["workspace_path"]) {
            return Some(normalize_workspace_path(path));
        }
    }
    None
}

fn extract_is_subagent(entries: &[Value]) -> bool {
    for entry in entries {
        if entry["type"].as_str() != Some("session_meta") {
            continue;
        }
        if !entry["payload"]["source"]["subagent"].is_null() {
            return true;
        }
        if !entry["source"]["subagent"].is_null() {
            return true;
        }
    }
    false
}

fn extract_parent_source_id(entries: &[Value]) -> Option<String> {
    for entry in entries {
        if entry["type"].as_str() != Some("session_meta") {
            continue;
        }
        if let Some(parent) = non_empty_str(
            &entry["payload"]["source"]["subagent"]["thread_spawn"]["parent_thread_id"],
        ) {
            return Some(parent.to_string());
        }
        if let Some(parent) =
            non_empty_str(&entry["source"]["subagent"]["thread_spawn"]["parent_thread_id"])
        {
            return Some(parent.to_string());
        }
    }
    None
}

fn normalize_workspace_path(raw: &str) -> String {
    display_path(raw)
}

fn extract_token_usage_from_entries(entries: &[Value]) -> (i64, i64) {
    let mut token_usage = TokenUsageAccumulator::default();
    for entry in entries {
        token_usage.record(entry);
    }
    token_usage.finish()
}

fn extract_token_usage_from_entry(entry: &Value) -> (i64, i64) {
    let usage_candidates = [
        &entry["usage"],
        &entry["payload"]["usage"],
        &entry["response"]["usage"],
        &entry["payload"]["response"]["usage"],
        &entry["token_usage"],
        &entry["payload"]["token_usage"],
        &entry["metrics"]["usage"],
        &entry["payload"]["metrics"]["usage"],
    ];

    for candidate in usage_candidates {
        if let Some((input_tokens, output_tokens)) = extract_token_usage_from_object(candidate) {
            return (input_tokens, output_tokens);
        }
    }

    (0, 0)
}

fn extract_token_usage_total_snapshot(entry: &Value) -> Option<(i64, i64)> {
    if entry["type"].as_str() != Some("event_msg") {
        return None;
    }
    if entry["payload"]["type"].as_str() != Some("token_count") {
        return None;
    }

    let snapshot_candidates = [
        &entry["payload"]["info"]["total_token_usage"],
        &entry["payload"]["info"]["totalTokenUsage"],
        &entry["info"]["total_token_usage"],
        &entry["info"]["totalTokenUsage"],
        &entry["payload"]["total_token_usage"],
        &entry["payload"]["totalTokenUsage"],
        &entry["total_token_usage"],
        &entry["totalTokenUsage"],
    ];

    for candidate in snapshot_candidates {
        if let Some((input_tokens, output_tokens)) = extract_token_usage_from_object(candidate) {
            return Some((input_tokens, output_tokens));
        }
    }

    None
}

#[derive(Default)]
struct TokenUsageAccumulator {
    input_tokens: i64,
    output_tokens: i64,
    snapshot_input_tokens: i64,
    snapshot_output_tokens: i64,
    has_snapshot: bool,
}

impl TokenUsageAccumulator {
    fn record(&mut self, entry: &Value) {
        if let Some((total_input_tokens, total_output_tokens)) =
            extract_token_usage_total_snapshot(entry)
        {
            self.has_snapshot = true;
            self.snapshot_input_tokens = self.snapshot_input_tokens.max(total_input_tokens);
            self.snapshot_output_tokens = self.snapshot_output_tokens.max(total_output_tokens);
            return;
        }

        let (entry_input_tokens, entry_output_tokens) = extract_token_usage_from_entry(entry);
        self.input_tokens += entry_input_tokens;
        self.output_tokens += entry_output_tokens;
    }

    fn finish(self) -> (i64, i64) {
        if self.has_snapshot {
            return (self.snapshot_input_tokens, self.snapshot_output_tokens);
        }

        (self.input_tokens, self.output_tokens)
    }
}

fn extract_token_usage_from_object(value: &Value) -> Option<(i64, i64)> {
    if !value.is_object() {
        return None;
    }

    let input_tokens = extract_i64_by_keys(
        value,
        &[
            "input_tokens",
            "inputTokens",
            "prompt_tokens",
            "promptTokens",
            "input_token_count",
            "prompt_token_count",
        ],
    )
    .unwrap_or(0);
    let output_tokens = extract_i64_by_keys(
        value,
        &[
            "output_tokens",
            "outputTokens",
            "completion_tokens",
            "completionTokens",
            "output_token_count",
            "completion_token_count",
        ],
    )
    .unwrap_or(0);

    if input_tokens == 0 && output_tokens == 0 {
        return None;
    }

    Some((input_tokens, output_tokens))
}

fn extract_i64_by_keys(value: &Value, keys: &[&str]) -> Option<i64> {
    for key in keys {
        let candidate = &value[*key];
        if let Some(number) = parse_value_as_i64(candidate) {
            return Some(number);
        }
    }
    None
}

fn parse_value_as_i64(value: &Value) -> Option<i64> {
    if let Some(number) = value.as_i64() {
        return Some(number.max(0));
    }
    if let Some(number) = value.as_u64() {
        return Some(number as i64);
    }
    if let Some(text) = value.as_str() {
        return text.trim().parse::<i64>().ok().map(|number| number.max(0));
    }
    None
}
