pub fn normalize_windows_drive_letter_path(raw: &str) -> String {
    let text = raw.trim();
    if let Some(stripped) = text.strip_prefix("\\\\?\\") {
        return normalize_windows_drive_letter_path(stripped);
    }

    if text.len() >= 3 {
        let bytes = text.as_bytes();
        let first = bytes[0] as char;
        let second = bytes[1] as char;
        let third = bytes[2] as char;
        if first.is_ascii_alphabetic() && second == ':' && (third == '\\' || third == '/') {
            return format!("{}{}", first.to_ascii_uppercase(), &text[1..]);
        }
    }

    text.to_string()
}
