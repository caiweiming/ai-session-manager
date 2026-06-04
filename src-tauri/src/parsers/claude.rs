use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail};
use serde_json::Value;

use super::{ParsedMessage, ParsedSession};
use crate::path_identity::display_path;

const DEFAULT_TIME: &str = "1970-01-01T00:00:00Z";

pub fn parse_claude_file(path: &Path) -> anyhow::Result<ParsedSession> {
    let raw = fs::read_to_string(path)?;
    parse_claude_json(&raw, path.to_string_lossy().to_string())
}

pub fn parse_claude_file_summary(path: &Path) -> anyhow::Result<ParsedSession> {
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .map(|v| v.to_ascii_lowercase())
        .unwrap_or_default();
    if ext == "json" {
        let mut parsed = parse_claude_file(path)?;
        parsed.messages.clear();
        return Ok(parsed);
    }

    let source_path = path.to_string_lossy().to_string();
    let file = fs::File::open(path)?;
    let reader = BufReader::new(file);

    let mut base_session_id: Option<String> = None;
    let mut detected_agent_id: Option<String> = derive_agent_id_from_path(path);
    let mut workspace_path: Option<String> = None;
    let mut started_at = String::new();
    let mut title_text: Option<String> = None;
    let mut title_priority = u8::MAX;
    let mut is_subagent = is_subagent_path(path);
    let mut input_tokens = 0i64;
    let mut output_tokens = 0i64;

    const MAX_META_SCAN_LINES: usize = 120;
    const MAX_TITLE_SCAN_LINES: usize = 40;
    let mut line_count = 0usize;

    for line in reader.lines() {
        if line_count >= MAX_META_SCAN_LINES {
            break;
        }
        line_count += 1;

        let raw = line?;
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(entry) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };

        if base_session_id.is_none() {
            if let Some(id) = extract_session_id(&entry) {
                base_session_id = Some(id);
            }
        }

        if detected_agent_id.is_none() {
            if let Some(agent_id) = non_empty_str(&entry["agentId"]) {
                detected_agent_id = Some(agent_id.to_string());
            }
        }

        if !is_subagent {
            is_subagent = entry["isSidechain"].as_bool().unwrap_or(false)
                || non_empty_str(&entry["agentId"]).is_some();
        }

        if workspace_path.is_none() {
            if let Some(path) =
                non_empty_str(&entry["cwd"]).or_else(|| non_empty_str(&entry["projectPath"]))
            {
                workspace_path = Some(normalize_workspace_path(path));
            }
        }

        if started_at.is_empty() {
            if let Some(ts) =
                non_empty_str(&entry["timestamp"]).or_else(|| non_empty_str(&entry["created"]))
            {
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

        let (entry_input_tokens, entry_output_tokens) = extract_token_usage_from_entry(&entry);
        input_tokens += entry_input_tokens;
        output_tokens += entry_output_tokens;
    }

    let base_session_id =
        base_session_id.ok_or_else(|| anyhow!("invalid session_id: missing or empty"))?;
    let source_id = compose_source_id(
        &base_session_id,
        detected_agent_id.as_deref(),
        is_subagent,
        path,
    );
    let parent_source_id = if is_subagent {
        Some(base_session_id.clone())
    } else {
        None
    };
    let title = title_text
        .as_deref()
        .and_then(summarize_text_as_title)
        .unwrap_or_else(|| extract_title(&[], &source_path, &source_id));
    let workspace_path = workspace_path.unwrap_or_else(|| source_path.clone());
    let started_at = if started_at.is_empty() {
        DEFAULT_TIME.to_string()
    } else {
        started_at
    };

    Ok(ParsedSession {
        source_tool: "claude".to_string(),
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

pub fn parse_claude_session(raw: &str) -> anyhow::Result<ParsedSession> {
    parse_claude_json(raw, String::new())
}

fn parse_claude_json(raw: &str, source_path: String) -> anyhow::Result<ParsedSession> {
    let entries = parse_entries(raw)?;
    let base_session_id = extract_source_id(&entries)
        .ok_or_else(|| anyhow!("invalid session_id: missing or empty"))?;

    let mut is_subagent =
        source_path.contains("\\subagents\\") || source_path.contains("/subagents/");
    let mut agent_id: Option<String> = derive_agent_id_from_path(Path::new(&source_path));
    let mut messages = Vec::new();

    for entry in &entries {
        if !is_subagent {
            is_subagent = entry["isSidechain"].as_bool().unwrap_or(false)
                || non_empty_str(&entry["agentId"]).is_some();
        }
        if agent_id.is_none() {
            if let Some(value) = non_empty_str(&entry["agentId"]) {
                agent_id = Some(value.to_string());
            }
        }
        if let Some(message) = extract_message_from_entry(entry) {
            messages.push(message);
        }
    }

    let source_id = compose_source_id(
        &base_session_id,
        agent_id.as_deref(),
        is_subagent,
        Path::new(&source_path),
    );
    let parent_source_id = if is_subagent {
        Some(base_session_id.clone())
    } else {
        None
    };
    let updated_at = extract_updated_at(&entries);
    let started_at = extract_started_at(&entries, &messages, &updated_at);
    let workspace_path = extract_workspace_path(&entries).unwrap_or_else(|| source_path.clone());
    let title = extract_title(&messages, &source_path, &source_id);
    let (input_tokens, output_tokens) = extract_token_usage_from_entries(&entries);

    if messages.is_empty() {
        messages.push(ParsedMessage {
            role: "dev".to_string(),
            content: "该会话无可解析消息".to_string(),
            created_at: updated_at.clone(),
        });
    }

    Ok(ParsedSession {
        source_tool: "claude".to_string(),
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

fn parse_entries(raw: &str) -> anyhow::Result<Vec<Value>> {
    if let Ok(value) = serde_json::from_str::<Value>(raw) {
        if value.is_array() {
            return Ok(value.as_array().cloned().unwrap_or_default());
        }
        return Ok(vec![value]);
    }

    let mut entries = Vec::new();
    for line in raw.lines().map(str::trim).filter(|line| !line.is_empty()) {
        entries.push(serde_json::from_str::<Value>(line)?);
    }

    if entries.is_empty() {
        bail!("empty claude payload");
    }
    Ok(entries)
}

fn non_empty_str(value: &Value) -> Option<&str> {
    let text = value.as_str()?;
    if text.trim().is_empty() {
        return None;
    }
    Some(text)
}

fn extract_session_id(entry: &Value) -> Option<String> {
    non_empty_str(&entry["sessionId"])
        .or_else(|| non_empty_str(&entry["session_id"]))
        .map(str::to_string)
}

fn extract_source_id(entries: &[Value]) -> Option<String> {
    for entry in entries {
        if let Some(session_id) = extract_session_id(entry) {
            return Some(session_id);
        }
    }
    None
}

fn extract_message_from_entry(entry: &Value) -> Option<ParsedMessage> {
    let entry_type = non_empty_str(&entry["type"]).unwrap_or_default();
    if entry_type != "user" && entry_type != "assistant" {
        return None;
    }
    if entry["isMeta"].as_bool().unwrap_or(false) {
        return None;
    }

    let message = &entry["message"];
    if !message.is_object() {
        return None;
    }

    let role = non_empty_str(&message["role"])
        .unwrap_or(entry_type)
        .to_string();
    let content = extract_message_content(message)?;
    if content.is_empty() {
        return None;
    }
    if is_instruction_like_title_text(&content) {
        return None;
    }

    let created_at = non_empty_str(&entry["timestamp"])
        .or_else(|| non_empty_str(&entry["created_at"]))
        .unwrap_or(DEFAULT_TIME)
        .to_string();

    Some(ParsedMessage {
        role,
        content,
        created_at,
    })
}

fn extract_message_content(message: &Value) -> Option<String> {
    if let Some(text) = non_empty_str(&message["content"]) {
        return summarize_raw_message_text(text);
    }

    let mut parts = Vec::new();
    for item in message["content"].as_array().into_iter().flatten() {
        if let Some(kind) = non_empty_str(&item["type"]) {
            if kind == "thinking" || kind == "tool_use" || kind == "tool_result" {
                continue;
            }
        }
        if let Some(text) = non_empty_str(&item["text"]).and_then(summarize_raw_message_text) {
            parts.push(text);
            continue;
        }
        if let Some(text) = non_empty_str(&item["content"]).and_then(summarize_raw_message_text) {
            parts.push(text);
        }
    }

    if parts.is_empty() {
        return None;
    }
    Some(parts.join("\n"))
}

fn summarize_raw_message_text(text: &str) -> Option<String> {
    let compact = text.trim();
    if compact.is_empty() {
        return None;
    }
    if is_instruction_like_title_text(compact) {
        return None;
    }
    Some(compact.to_string())
}

fn extract_title(messages: &[ParsedMessage], source_path: &str, source_id: &str) -> String {
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
    let entry_type = non_empty_str(&entry["type"]).unwrap_or_default();
    if entry_type != "user" && entry_type != "assistant" {
        return None;
    }
    if entry["isMeta"].as_bool().unwrap_or(false) {
        return None;
    }
    let message = &entry["message"];
    let role = non_empty_str(&message["role"]).unwrap_or(entry_type);
    let content = extract_message_content(message)?;
    Some((title_role_priority(role), content))
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
        || lower.contains("<skills_instructions>")
        || lower.contains("<environment_context>")
        || lower.contains("<local-command-caveat>")
        || lower.contains("<command-name>")
        || lower.contains("<local-command-stdout>")
        || lower.contains("filesystem sandboxing defines which files can be read or written")
        || lower.starts_with("# agents.md instructions")
        || lower == "no prompt"
}

fn extract_updated_at(entries: &[Value]) -> String {
    let mut latest = String::new();
    for entry in entries {
        if let Some(ts) =
            non_empty_str(&entry["timestamp"]).or_else(|| non_empty_str(&entry["modified"]))
        {
            if ts > latest.as_str() {
                latest = ts.to_string();
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
    entries: &[Value],
    messages: &[ParsedMessage],
    fallback_updated_at: &str,
) -> String {
    let mut earliest = String::new();
    for entry in entries {
        if let Some(ts) =
            non_empty_str(&entry["timestamp"]).or_else(|| non_empty_str(&entry["created"]))
        {
            update_earliest(&mut earliest, ts);
        }
    }
    for message in messages {
        if message.created_at == DEFAULT_TIME {
            continue;
        }
        update_earliest(&mut earliest, &message.created_at);
    }
    if earliest.is_empty() {
        fallback_updated_at.to_string()
    } else {
        earliest
    }
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
        if let Some(path) =
            non_empty_str(&entry["cwd"]).or_else(|| non_empty_str(&entry["projectPath"]))
        {
            return Some(normalize_workspace_path(path));
        }
    }
    None
}

fn normalize_workspace_path(raw: &str) -> String {
    display_path(raw)
}

fn is_subagent_path(path: &Path) -> bool {
    let text = path.to_string_lossy();
    text.contains("\\subagents\\") || text.contains("/subagents/")
}

fn derive_agent_id_from_path(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_str()?.trim();
    if let Some(value) = stem.strip_prefix("agent-") {
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

fn compose_source_id(
    base_session_id: &str,
    agent_id: Option<&str>,
    is_subagent: bool,
    path: &Path,
) -> String {
    if !is_subagent {
        return base_session_id.to_string();
    }
    if let Some(agent) = agent_id {
        return format!("{base_session_id}:agent:{agent}");
    }
    let fallback = path
        .file_stem()
        .and_then(|v| v.to_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("subagent");
    format!("{base_session_id}:sub:{fallback}")
}

fn extract_token_usage_from_entries(entries: &[Value]) -> (i64, i64) {
    let mut input_tokens = 0i64;
    let mut output_tokens = 0i64;
    for entry in entries {
        let (entry_input_tokens, entry_output_tokens) = extract_token_usage_from_entry(entry);
        input_tokens += entry_input_tokens;
        output_tokens += entry_output_tokens;
    }
    (input_tokens, output_tokens)
}

fn extract_token_usage_from_entry(entry: &Value) -> (i64, i64) {
    let usage_candidates = [
        &entry["usage"],
        &entry["message"]["usage"],
        &entry["payload"]["usage"],
        &entry["response"]["usage"],
        &entry["token_usage"],
    ];

    for candidate in usage_candidates {
        if let Some((input, output)) = extract_token_usage_from_object(candidate) {
            return (input, output);
        }
    }

    (0, 0)
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
            "cache_read_input_tokens",
            "cache_creation_input_tokens",
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
