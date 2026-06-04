use ai_session_manager::services::collector::{
    collect_claude_inventory_under, collect_codex_files_under, collect_gemini_files_under,
    resolve_home_claude_dir, resolve_home_codex_dir, resolve_home_gemini_dir,
};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

#[test]
fn resolve_home_codex_dir_should_return_home_dot_codex() {
    let home = Path::new("/tmp/test-home");
    let resolved = resolve_home_codex_dir(home);
    assert_eq!(resolved, home.join(".codex"));
}

#[test]
fn resolve_home_claude_dir_should_return_home_dot_claude() {
    let home = Path::new("/tmp/test-home");
    let resolved = resolve_home_claude_dir(home);
    assert_eq!(resolved, home.join(".claude"));
}

#[test]
fn resolve_home_gemini_dir_should_return_home_dot_gemini() {
    let home = Path::new("/tmp/test-home");
    let resolved = resolve_home_gemini_dir(home);
    assert_eq!(resolved, home.join(".gemini"));
}

#[test]
fn collect_codex_files_under_should_only_include_json_and_jsonl() {
    let root = TempDir::new().unwrap();

    let nested = root.path().join("nested");
    fs::create_dir_all(&nested).unwrap();

    let json_file = root.path().join("session.json");
    let jsonl_file = nested.join("events.jsonl");
    let txt_file = nested.join("note.txt");
    let md_file = root.path().join("readme.md");

    fs::write(&json_file, "{}").unwrap();
    fs::write(&jsonl_file, "{}\n").unwrap();
    fs::write(&txt_file, "ignore").unwrap();
    fs::write(&md_file, "ignore").unwrap();

    let files = collect_codex_files_under(root.path()).unwrap();
    let mut expected = vec![json_file, jsonl_file];
    expected.sort();
    assert_eq!(files, expected);
}

#[test]
fn collect_codex_files_under_should_ignore_history_file_when_falling_back_to_root() {
    let root = TempDir::new().unwrap();

    let valid_session = root.path().join("session.json");
    let valid_jsonl = root.path().join("rollout-2026-05-17-demo.jsonl");
    let history_file = root.path().join("history.jsonl");

    fs::write(&valid_session, r#"{"session_id":"fallback-1"}"#).unwrap();
    fs::write(&valid_jsonl, r#"{"session_id":"fallback-2"}"#).unwrap();
    fs::write(&history_file, r#"{"session_id":"should-ignore"}"#).unwrap();

    let files = collect_codex_files_under(root.path()).unwrap();
    assert_eq!(files, vec![valid_jsonl, valid_session]);
}

#[test]
fn collect_codex_files_under_should_return_empty_for_missing_root() {
    let missing = Path::new("tests/fixtures/not-exists");
    let files = collect_codex_files_under(missing).unwrap();
    assert!(files.is_empty());
}

#[test]
fn collect_codex_files_under_should_prefer_sessions_directory_when_present() {
    let root = TempDir::new().unwrap();
    let sessions_dir = root
        .path()
        .join("sessions")
        .join("2026")
        .join("04")
        .join("26");
    fs::create_dir_all(&sessions_dir).unwrap();

    let valid_session = sessions_dir.join("rollout-2026-04-26T21-00-00-abc.jsonl");
    let noisy_root_file = root.path().join(".sandbox").join("setup_marker.json");
    fs::create_dir_all(noisy_root_file.parent().unwrap()).unwrap();

    fs::write(&valid_session, "{}\n").unwrap();
    fs::write(&noisy_root_file, "{}").unwrap();

    let files = collect_codex_files_under(root.path()).unwrap();
    assert_eq!(files, vec![valid_session]);
}

#[test]
fn collect_claude_inventory_under_should_report_index_health_and_files() {
    let root = TempDir::new().unwrap();
    let claude_root = root.path().join(".claude");
    let project = claude_root.join("projects").join("D--Works-demo");
    let subagents = project
        .join("11111111-2222-3333-4444-555555555555")
        .join("subagents");
    fs::create_dir_all(&subagents).unwrap();

    let main_file = project.join("11111111-2222-3333-4444-555555555555.jsonl");
    let sub_file = subagents.join("agent-a1b2c3d.jsonl");
    fs::write(
        &main_file,
        "{\"sessionId\":\"11111111-2222-3333-4444-555555555555\"}\n",
    )
    .unwrap();
    fs::write(
        &sub_file,
        "{\"sessionId\":\"11111111-2222-3333-4444-555555555555\",\"isSidechain\":true}\n",
    )
    .unwrap();

    let index_path = project.join("sessions-index.json");
    fs::write(
        &index_path,
        format!(
            "{{\"version\":1,\"entries\":[{{\"sessionId\":\"11111111-2222-3333-4444-555555555555\",\"fullPath\":\"{}\",\"isSidechain\":false}},{{\"sessionId\":\"22222222-3333-4444-5555-666666666666\",\"fullPath\":\"{}\",\"isSidechain\":false}}]}}",
            main_file.to_string_lossy().replace('\\', "\\\\"),
            project.join("22222222-3333-4444-5555-666666666666.jsonl").to_string_lossy().replace('\\', "\\\\")
        ),
    )
    .unwrap();

    let inventory = collect_claude_inventory_under(&claude_root).unwrap();
    assert_eq!(inventory.main_files, 1);
    assert_eq!(inventory.subagent_files, 1);
    assert_eq!(inventory.index_entries, 2);
    assert_eq!(inventory.index_missing_files, 1);
    assert_eq!(inventory.files.len(), 2);
}

#[test]
fn collect_gemini_files_under_should_only_include_session_json_and_jsonl_under_chats() {
    let root = TempDir::new().unwrap();
    let gemini_root = root.path().join(".gemini");

    let valid_project = gemini_root.join("tmp").join("D--Works-demo").join("chats");
    fs::create_dir_all(&valid_project).unwrap();

    let valid_json = valid_project.join("session-aaa.json");
    let valid_jsonl = valid_project.join("session-bbb.jsonl");
    let ignored_txt = valid_project.join("session-ccc.txt");
    let ignored_name = valid_project.join("note.jsonl");
    fs::write(&valid_json, "{\"sessionId\":\"a\"}").unwrap();
    fs::write(&valid_jsonl, "{\"sessionId\":\"b\"}\n").unwrap();
    fs::write(&ignored_txt, "ignore").unwrap();
    fs::write(&ignored_name, "ignore").unwrap();

    let outside_chats = gemini_root
        .join("tmp")
        .join("D--Works-demo")
        .join("history")
        .join("session-outside.jsonl");
    fs::create_dir_all(outside_chats.parent().unwrap()).unwrap();
    fs::write(&outside_chats, "{\"sessionId\":\"x\"}\n").unwrap();

    let files = collect_gemini_files_under(&gemini_root).unwrap();
    assert_eq!(files, vec![valid_json, valid_jsonl]);
}
