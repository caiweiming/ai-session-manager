use ai_session_manager::path_identity::{display_path, is_same_or_child_path, path_key, same_path};

#[test]
fn display_path_should_only_trim_and_strip_verbatim_prefix() {
    assert_eq!(display_path(r"  \\?\d:\Works\Demo  "), r"d:\Works\Demo");
}

#[test]
fn display_path_should_convert_verbatim_unc_to_readable_unc() {
    assert_eq!(
        display_path(r"  \\?\UNC\server\share\repo  "),
        r"\\server\share\repo"
    );
}

#[test]
fn path_key_should_keep_posix_path() {
    assert_eq!(path_key("/Users/demo/app"), "/Users/demo/app");
}

#[test]
fn path_key_should_normalize_windows_drive_letter_path() {
    assert_eq!(path_key(r"\\?\d:\Works\Demo"), "d:/works/demo");
}

#[test]
fn path_key_should_normalize_unc_path() {
    assert_eq!(path_key(r"\\server\share\Repo"), "//server/share/repo");
    assert_eq!(
        path_key(r"\\?\UNC\server\share\Repo"),
        "//server/share/repo"
    );
}

#[test]
fn same_path_should_match_windows_and_slash_variants() {
    assert!(same_path(r"\\?\D:\Works\Demo", r"d:/works/demo"));
}

#[test]
fn same_path_should_match_unc_and_verbatim_unc_variants() {
    assert!(same_path(
        r"\\server\share\Repo",
        r"\\?\UNC\server\share\repo"
    ));
}

#[test]
fn is_same_or_child_path_should_match_descendant_path() {
    assert!(is_same_or_child_path("/repo/apps", "/repo/apps/desktop"));
}
