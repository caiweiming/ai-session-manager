use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

use anyhow::{anyhow, bail};
use serde_json::Value;

use super::{ParsedMessage, ParsedSession};
use crate::path_identity::display_path;

const DEFAULT_TIME: &str = "1970-01-01T00:00:00Z";

pub fn parse_gemini_file(path: &Path) -> anyhow::Result<ParsedSession> {
    let raw = fs::read_to_string(path)?;
    parse_gemini_json(&raw, path)
}

pub fn parse_gemini_file_summary(path: &Path) -> anyhow::Result<ParsedSession> {
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .map(|v| v.to_ascii_lowercase())
        .unwrap_or_default();

    if ext == "json" {
        let mut parsed = parse_gemini_file(path)?;
        parsed.messages.clear();
        return Ok(parsed);
    }

    let source_path = path.to_string_lossy().to_string();
    let workspace_path = detect_workspace_path(path).unwrap_or_else(|| source_path.clone());

    let file = fs::File::open(path)?;
    let reader = BufReader::new(file);

    let mut session_id: Option<String> = None;
    let mut started_at = String::new();
    let mut updated_at = String::new();
    let mut title_text: Option<String> = None;
    let mut input_tokens = 0i64;
    let mut output_tokens = 0i64;

    const MAX_SCAN_LINES: usize = 180;
    for (line_count, line) in reader.lines().enumerate() {
        if line_count >= MAX_SCAN_LINES {
            break;
        }

        let raw = line?;
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(entry) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };

        if session_id.is_none() {
            session_id = extract_session_id(&entry);
        }

        if started_at.is_empty() {
            if let Some(ts) =
                non_empty_str(&entry["startTime"]).or_else(|| non_empty_str(&entry["timestamp"]))
            {
                started_at = ts.to_string();
            }
        }

        if let Some(ts) = non_empty_str(&entry["lastUpdated"])
            .or_else(|| non_empty_str(&entry["$set"]["lastUpdated"]))
            .or_else(|| non_empty_str(&entry["timestamp"]))
        {
            if ts > updated_at.as_str() {
                updated_at = ts.to_string();
            }
        }

        if title_text.is_none() {
            if let Some(text) = extract_title_candidate(&entry) {
                title_text = Some(text);
            }
        }

        let (entry_input, entry_output) = extract_token_usage_from_entry(&entry);
        input_tokens += entry_input;
        output_tokens += entry_output;
    }

    let session_id = session_id.ok_or_else(|| anyhow!("invalid session_id: missing or empty"))?;
    let title = title_text
        .as_deref()
        .and_then(summarize_text_as_title)
        .unwrap_or_else(|| fallback_title(path, &session_id));
    let started_at = if started_at.is_empty() {
        DEFAULT_TIME.to_string()
    } else {
        started_at
    };
    let updated_at = if updated_at.is_empty() {
        started_at.clone()
    } else {
        updated_at
    };

    Ok(ParsedSession {
        source_tool: "gemini".to_string(),
        source_id: session_id,
        title,
        source_path,
        workspace_path,
        is_subagent: false,
        parent_source_id: None,
        started_at,
        updated_at,
        input_tokens,
        output_tokens,
        message_count: 0,
        messages: Vec::new(),
    })
}

pub fn parse_gemini_session(raw: &str) -> anyhow::Result<ParsedSession> {
    let virtual_path = Path::new("");
    parse_gemini_json(raw, virtual_path)
}

fn parse_gemini_json(raw: &str, source_path: &Path) -> anyhow::Result<ParsedSession> {
    let entries = parse_entries(raw)?;

    let source_path_text = source_path.to_string_lossy().to_string();
    let workspace_path =
        detect_workspace_path(source_path).unwrap_or_else(|| source_path_text.clone());

    let mut session_id = extract_session_id_from_entries(&entries);
    if session_id.is_none() {
        session_id = extract_session_id_from_filename(source_path);
    }
    let session_id = session_id.ok_or_else(|| anyhow!("invalid session_id: missing or empty"))?;

    let started_at = extract_started_at(&entries);
    let updated_at = extract_updated_at(&entries, &started_at);

    let mut ordered_messages: Vec<ParsedMessage> = Vec::new();
    let mut id_to_index: HashMap<String, usize> = HashMap::new();

    for entry in &entries {
        if let Some(message) = extract_message_from_entry(entry) {
            let id = non_empty_str(&entry["id"]).map(str::to_string);
            if let Some(message_id) = id {
                if let Some(existing) = id_to_index.get(&message_id).copied() {
                    ordered_messages[existing] = message;
                } else {
                    let next = ordered_messages.len();
                    id_to_index.insert(message_id, next);
                    ordered_messages.push(message);
                }
            } else {
                ordered_messages.push(message);
            }
        }
    }

    let title = summarize_messages_as_title(&ordered_messages)
        .unwrap_or_else(|| fallback_title(source_path, &session_id));
    let (input_tokens, output_tokens) = extract_token_usage_from_entries(&entries);

    let messages = if ordered_messages.is_empty() {
        vec![ParsedMessage {
            role: "dev".to_string(),
            content: "该会话无可解析消息".to_string(),
            created_at: updated_at.clone(),
        }]
    } else {
        ordered_messages
    };

    Ok(ParsedSession {
        source_tool: "gemini".to_string(),
        source_id: session_id,
        title,
        source_path: source_path_text,
        workspace_path,
        is_subagent: false,
        parent_source_id: None,
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
        if let Some(messages) = value["messages"].as_array() {
            let mut entries = Vec::with_capacity(messages.len() + 1);
            entries.push(value.clone());
            entries.extend(messages.iter().cloned());
            return Ok(entries);
        }
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
        bail!("empty gemini payload");
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

fn extract_session_id_from_entries(entries: &[Value]) -> Option<String> {
    for entry in entries {
        if let Some(value) = extract_session_id(entry) {
            return Some(value);
        }
    }
    None
}

fn extract_session_id_from_filename(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_str()?.trim();
    if let Some(candidate) = stem.split('-').next_back() {
        if !candidate.trim().is_empty() {
            return Some(candidate.trim().to_string());
        }
    }
    None
}

fn detect_workspace_path(path: &Path) -> Option<String> {
    let chats_dir = path.parent()?;
    if chats_dir
        .file_name()
        .and_then(|v| v.to_str())
        .map(|v| !v.eq_ignore_ascii_case("chats"))
        .unwrap_or(true)
    {
        return None;
    }

    let project_dir = chats_dir.parent()?;
    let project_root_file = project_dir.join(".project_root");
    if project_root_file.is_file() {
        if let Ok(raw) = fs::read_to_string(project_root_file) {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                return Some(normalize_workspace_path(trimmed));
            }
        }
    }

    Some(normalize_workspace_path(&project_dir.to_string_lossy()))
}

fn normalize_workspace_path(raw: &str) -> String {
    display_path(raw)
}

fn extract_started_at(entries: &[Value]) -> String {
    let mut earliest = String::new();
    for entry in entries {
        if let Some(ts) =
            non_empty_str(&entry["startTime"]).or_else(|| non_empty_str(&entry["timestamp"]))
        {
            if earliest.is_empty() || ts < earliest.as_str() {
                earliest = ts.to_string();
            }
        }
    }
    if earliest.is_empty() {
        DEFAULT_TIME.to_string()
    } else {
        earliest
    }
}

fn extract_updated_at(entries: &[Value], fallback: &str) -> String {
    let mut latest = String::new();
    for entry in entries {
        if let Some(ts) = non_empty_str(&entry["lastUpdated"])
            .or_else(|| non_empty_str(&entry["$set"]["lastUpdated"]))
            .or_else(|| non_empty_str(&entry["timestamp"]))
        {
            if ts > latest.as_str() {
                latest = ts.to_string();
            }
        }
    }
    if latest.is_empty() {
        fallback.to_string()
    } else {
        latest
    }
}

fn extract_message_from_entry(entry: &Value) -> Option<ParsedMessage> {
    let entry_type = non_empty_str(&entry["type"])?;

    let role = match entry_type {
        "user" => "user",
        "gemini" => "assistant",
        "error" | "info" => "dev",
        _ => return None,
    }
    .to_string();

    let content = if entry_type == "user" {
        extract_text_from_content(&entry["content"])?
    } else if let Some(text) = non_empty_str(&entry["content"]).and_then(summarize_text_as_content)
    {
        text
    } else if entry_type == "error" || entry_type == "info" {
        non_empty_str(&entry["content"])
            .map(str::trim)
            .unwrap_or_default()
            .to_string()
    } else {
        return None;
    };

    if content.is_empty() {
        return None;
    }

    let created_at = non_empty_str(&entry["timestamp"])
        .unwrap_or(DEFAULT_TIME)
        .to_string();

    Some(ParsedMessage {
        role,
        content,
        created_at,
    })
}

fn extract_title_candidate(entry: &Value) -> Option<String> {
    let entry_type = non_empty_str(&entry["type"]).unwrap_or_default();
    if entry_type != "user" && entry_type != "gemini" {
        return None;
    }
    let content = if entry_type == "user" {
        extract_text_from_content(&entry["content"])?
    } else {
        non_empty_str(&entry["content"]).and_then(summarize_text_as_content)?
    };
    summarize_text_as_title(&content)
}

fn extract_text_from_content(content: &Value) -> Option<String> {
    if let Some(text) = non_empty_str(content).and_then(summarize_text_as_content) {
        return Some(text);
    }

    let mut parts = Vec::new();
    for item in content.as_array().into_iter().flatten() {
        if let Some(text) = non_empty_str(&item["text"]).and_then(summarize_text_as_content) {
            parts.push(text);
            continue;
        }
        if let Some(text) = non_empty_str(&item["content"]).and_then(summarize_text_as_content) {
            parts.push(text);
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("\n"))
}

fn summarize_text_as_content(content: &str) -> Option<String> {
    let compact = content.trim();
    if compact.is_empty() || is_instruction_like(compact) {
        return None;
    }
    Some(compact.to_string())
}

fn summarize_messages_as_title(messages: &[ParsedMessage]) -> Option<String> {
    for priority in 0..=1 {
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

fn title_role_priority(role: &str) -> u8 {
    match role {
        "user" => 0,
        _ => 1,
    }
}

fn summarize_text_as_title(content: &str) -> Option<String> {
    let normalized = content.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() || is_instruction_like(&normalized) {
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

fn fallback_title(path: &Path, source_id: &str) -> String {
    if let Some(file_name) = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
    {
        if !file_name.is_empty() {
            return file_name.to_string();
        }
    }
    format!("session-{source_id}")
}

fn is_instruction_like(content: &str) -> bool {
    let lower = content.to_ascii_lowercase();
    lower.contains("<permissions instructions>")
        || lower.contains("<skills_instructions>")
        || lower.contains("<environment_context>")
        || lower.contains("filesystem sandboxing defines which files can be read or written")
        || lower.starts_with("# agents.md instructions")
}

fn extract_token_usage_from_entries(entries: &[Value]) -> (i64, i64) {
    let mut input = 0i64;
    let mut output = 0i64;
    for entry in entries {
        let (entry_input, entry_output) = extract_token_usage_from_entry(entry);
        input += entry_input;
        output += entry_output;
    }
    (input, output)
}

fn extract_token_usage_from_entry(entry: &Value) -> (i64, i64) {
    let candidates = [
        &entry["tokens"],
        &entry["usage"],
        &entry["message"]["tokens"],
        &entry["message"]["usage"],
    ];
    for candidate in candidates {
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

    let input = extract_i64_by_keys(value, &["input", "input_tokens", "inputTokens"]).unwrap_or(0);
    let output =
        extract_i64_by_keys(value, &["output", "output_tokens", "outputTokens"]).unwrap_or(0);

    if input == 0 && output == 0 {
        return None;
    }
    Some((input, output))
}

fn extract_i64_by_keys(value: &Value, keys: &[&str]) -> Option<i64> {
    for key in keys {
        let candidate = &value[*key];
        if let Some(number) = parse_i64(candidate) {
            return Some(number);
        }
    }
    None
}

fn parse_i64(value: &Value) -> Option<i64> {
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
