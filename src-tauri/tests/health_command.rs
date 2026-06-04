use ai_session_manager::commands::health::health_check;

#[test]
fn health_check_should_return_ok() {
    assert_eq!(health_check(), "ok");
}
