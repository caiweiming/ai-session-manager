pub struct MarkdownMessage<'a> {
    pub role: &'a str,
    pub content: &'a str,
    pub created_at: &'a str,
}

pub fn render_markdown(title: &str, rows: &[MarkdownMessage<'_>]) -> String {
    let normalized_title = if title.trim().is_empty() {
        "未命名会话"
    } else {
        title.trim()
    };

    let mut out = format!("# {}\n\n", normalized_title);
    for row in rows {
        let role = if row.role.trim().is_empty() {
            "unknown"
        } else {
            row.role.trim()
        };
        let created_at = if row.created_at.trim().is_empty() {
            "unknown-time"
        } else {
            row.created_at.trim()
        };

        out.push_str(&format!("## {} · {}\n\n", role, created_at));
        out.push_str(&render_message_body(role, row.content));
        out.push('\n');
    }
    out
}

fn render_message_body(role: &str, content: &str) -> String {
    let trimmed = content.trim_end();
    if trimmed.is_empty() {
        return "_(empty)_\n".to_string();
    }

    if matches!(role, "tool" | "dev") && !trimmed.contains("```") {
        return format!("```text\n{}\n```\n", trimmed);
    }

    format!("{}\n", trimmed)
}
