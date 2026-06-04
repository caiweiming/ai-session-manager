use ai_session_manager::services::exporter::{render_markdown, MarkdownMessage};

#[test]
fn render_markdown_should_preserve_timestamp_code_block_and_tool_snippet() {
    let md = render_markdown(
        "Title",
        &[
            MarkdownMessage {
                role: "user",
                content: "hello",
                created_at: "2026-05-01T02:00:00Z",
            },
            MarkdownMessage {
                role: "assistant",
                content: "下面是脚本：\n```bash\necho hi\n```",
                created_at: "2026-05-01T02:00:05Z",
            },
            MarkdownMessage {
                role: "tool",
                content: "shell(\"echo hi\")\nexitCode: 0",
                created_at: "2026-05-01T02:00:06Z",
            },
        ],
    );

    assert!(md.contains("# Title"));
    assert!(md.contains("## user · 2026-05-01T02:00:00Z"));
    assert!(md.contains("## assistant · 2026-05-01T02:00:05Z"));
    assert!(md.contains("## tool · 2026-05-01T02:00:06Z"));
    assert!(md.contains("```bash\necho hi\n```"));
    assert!(md.contains("```text\nshell(\"echo hi\")\nexitCode: 0\n```"));
}
