use ai_session_manager::domain::safety::{
    normalize_keyword, normalize_message_limit, normalize_page, normalize_page_size,
    normalize_updated_within_days, validate_deletable_source_path, validate_resume_source_id,
    validate_resume_workspace_path,
};
use std::fs;
use tempfile::tempdir;

#[test]
fn normalize_query_inputs_should_clamp_and_trim() {
    assert_eq!(normalize_page(0), 1);
    assert_eq!(normalize_page_size(9999), 500);
    assert_eq!(normalize_keyword(None), None);
    assert_eq!(normalize_keyword(Some("   ")), None);
    assert_eq!(normalize_message_limit(None), None);
    assert_eq!(normalize_message_limit(Some(0)), None);
    assert_eq!(normalize_message_limit(Some(1)), Some(20));
    assert_eq!(normalize_message_limit(Some(99999)), Some(5000));
    assert_eq!(normalize_updated_within_days(None), None);
    assert_eq!(normalize_updated_within_days(Some(-10)), Some(0));
    assert_eq!(normalize_updated_within_days(Some(99999)), Some(3650));
    assert_eq!(normalize_updated_within_days(Some(30)), Some(30));
    assert_eq!(
        normalize_keyword(Some("  alpha  ")),
        Some("alpha".to_string())
    );
    assert_eq!(
        normalize_keyword(Some(&"a".repeat(500)))
            .unwrap()
            .chars()
            .count(),
        200
    );
}

#[test]
fn validate_resume_workspace_path_should_reject_non_directory() {
    let td = tempdir().unwrap();
    let file_path = td.path().join("session.jsonl");
    fs::write(&file_path, "{}").unwrap();
    let missing_path = td.path().join("missing");

    assert!(validate_resume_workspace_path("").is_err());
    assert!(validate_resume_workspace_path(file_path.to_string_lossy().as_ref()).is_err());
    let missing_error =
        validate_resume_workspace_path(missing_path.to_string_lossy().as_ref()).unwrap_err();
    assert!(missing_error
        .to_string()
        .contains("failed to read metadata"));
    assert!(validate_resume_workspace_path(td.path().to_string_lossy().as_ref()).is_ok());
}

#[test]
fn validate_deletable_source_path_should_reject_directory_empty_and_missing_path() {
    let td = tempdir().unwrap();
    let dir_path = td.path().join("nested");
    fs::create_dir_all(&dir_path).unwrap();
    let file_path = td.path().join("session.jsonl");
    let missing_path = td.path().join("missing.jsonl");
    fs::write(&file_path, "{}").unwrap();

    assert!(validate_deletable_source_path("").is_err());
    assert!(validate_deletable_source_path(dir_path.to_string_lossy().as_ref()).is_err());
    assert!(validate_deletable_source_path(missing_path.to_string_lossy().as_ref()).is_err());
    assert!(validate_deletable_source_path(file_path.to_string_lossy().as_ref()).is_ok());
}

#[test]
fn validate_resume_source_id_should_reject_invalid_inputs() {
    assert!(validate_resume_source_id("").is_err());
    assert!(validate_resume_source_id("session 1").is_err());
    assert!(validate_resume_source_id(" session-1 ").is_err());
    assert_eq!(validate_resume_source_id("session-1").unwrap(), "session-1");
}
