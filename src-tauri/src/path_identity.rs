pub fn display_path(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some(stripped) = strip_verbatim_unc_prefix(trimmed) {
        return format!(r"\\{}", stripped.replace('/', "\\"));
    }

    trimmed
        .strip_prefix("\\\\?\\")
        .unwrap_or(trimmed)
        .to_string()
}

pub fn path_key(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Some(key) = normalize_windows_path_key(trimmed) {
        return key;
    }

    let without_verbatim = trimmed.strip_prefix("\\\\?\\").unwrap_or(trimmed);
    if let Some(key) = normalize_windows_path_key(without_verbatim) {
        return key;
    }

    normalize_posix_path_key(without_verbatim)
}

pub fn same_path(left: &str, right: &str) -> bool {
    path_key(left) == path_key(right)
}

pub fn is_same_or_child_path(parent: &str, candidate: &str) -> bool {
    let parent_key = path_key(parent);
    let candidate_key = path_key(candidate);

    if parent_key.is_empty() || candidate_key.is_empty() {
        return parent_key == candidate_key;
    }

    if parent_key == candidate_key {
        return true;
    }

    if let Some(stripped) = candidate_key.strip_prefix(&parent_key) {
        return stripped.starts_with('/');
    }

    false
}

fn normalize_windows_path_key(raw: &str) -> Option<String> {
    if let Some(key) = normalize_unc_path_key(raw) {
        return Some(key);
    }

    let bytes = raw.as_bytes();
    if bytes.len() < 3 {
        return None;
    }

    let drive = bytes[0] as char;
    let separator = bytes[2] as char;
    if !drive.is_ascii_alphabetic()
        || bytes[1] as char != ':'
        || (separator != '\\' && separator != '/')
    {
        return None;
    }

    let mut normalized = String::with_capacity(raw.len());
    normalized.push(drive.to_ascii_lowercase());
    normalized.push(':');
    normalized.push('/');

    let suffix = normalize_components(&raw[3..], true);
    if !suffix.is_empty() {
        normalized.push_str(&suffix.to_ascii_lowercase());
    } else if normalized.ends_with('/') && normalized.len() > 3 {
        normalized.pop();
    }

    Some(normalized)
}

fn normalize_unc_path_key(raw: &str) -> Option<String> {
    let suffix = if let Some(stripped) = strip_verbatim_unc_prefix(raw) {
        stripped
    } else if raw.starts_with("\\\\") && !raw.starts_with("\\\\?\\") {
        &raw[2..]
    } else {
        return None;
    };

    let mut parts = split_components(suffix, true)
        .into_iter()
        .filter(|component| !component.is_empty())
        .collect::<Vec<_>>();
    if parts.len() < 2 {
        return None;
    }

    let server = parts.remove(0).to_ascii_lowercase();
    let share = parts.remove(0).to_ascii_lowercase();
    let remainder = normalize_components(&parts.join("/"), true).to_ascii_lowercase();

    let mut normalized = format!("//{server}/{share}");
    if !remainder.is_empty() {
        normalized.push('/');
        normalized.push_str(&remainder);
    }
    Some(normalized)
}

fn normalize_posix_path_key(raw: &str) -> String {
    let has_root = raw.starts_with('/');
    let normalized = normalize_components(raw, false);

    if has_root {
        if normalized.is_empty() {
            "/".to_string()
        } else {
            format!("/{normalized}")
        }
    } else {
        normalized
    }
}

fn normalize_components(raw: &str, treat_backslash_as_separator: bool) -> String {
    let is_absolute =
        raw.starts_with('/') || (treat_backslash_as_separator && raw.starts_with('\\'));
    let mut parts: Vec<String> = Vec::new();

    for component in split_components(raw, treat_backslash_as_separator) {
        match component {
            "" | "." => {}
            ".." => {
                if let Some(last) = parts.last() {
                    if last != ".." {
                        parts.pop();
                    } else if !is_absolute {
                        parts.push("..".to_string());
                    }
                } else if !is_absolute {
                    parts.push("..".to_string());
                }
            }
            value => parts.push(value.to_string()),
        }
    }

    parts.join("/")
}

fn split_components(raw: &str, treat_backslash_as_separator: bool) -> Vec<&str> {
    if treat_backslash_as_separator {
        raw.split(['/', '\\']).collect()
    } else {
        raw.split('/').collect()
    }
}

fn strip_verbatim_unc_prefix(raw: &str) -> Option<&str> {
    raw.strip_prefix("\\\\?\\UNC\\")
        .or_else(|| raw.strip_prefix("\\\\?\\UNC/"))
}
