use ai_session_manager::application::session_settings_service::ScanSourcesRecord;
use ai_session_manager::services::watcher::{
    build_default_watch_roots, coalesce_watch_events, debounce_events, map_notify_event,
    WatchEvent, WatchEventKind, WatchRoot,
};
use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
use notify::{Event, EventKind};
use std::path::PathBuf;
use std::time::Duration;
use tempfile::tempdir;

#[test]
fn debounce_should_merge_burst_events() {
    let events = vec!["a", "a", "a", "b"];
    let merged = debounce_events(&events, Duration::from_millis(200));
    assert_eq!(merged, vec!["a".to_string(), "b".to_string()]);
}

#[test]
fn coalesce_watch_events_should_keep_latest_operation_per_path() {
    let events = vec![
        WatchEvent {
            source_tool: "codex".to_string(),
            path: PathBuf::from("D:\\demo\\a.jsonl"),
            kind: WatchEventKind::Upsert,
        },
        WatchEvent {
            source_tool: "codex".to_string(),
            path: PathBuf::from("D:\\demo\\a.jsonl"),
            kind: WatchEventKind::Upsert,
        },
        WatchEvent {
            source_tool: "codex".to_string(),
            path: PathBuf::from("D:\\demo\\b.jsonl"),
            kind: WatchEventKind::Upsert,
        },
        WatchEvent {
            source_tool: "codex".to_string(),
            path: PathBuf::from("D:\\demo\\a.jsonl"),
            kind: WatchEventKind::Remove,
        },
    ];

    let merged = coalesce_watch_events(&events);

    assert_eq!(
        merged,
        vec![
            WatchEvent {
                source_tool: "codex".to_string(),
                path: PathBuf::from("D:\\demo\\a.jsonl"),
                kind: WatchEventKind::Remove,
            },
            WatchEvent {
                source_tool: "codex".to_string(),
                path: PathBuf::from("D:\\demo\\b.jsonl"),
                kind: WatchEventKind::Upsert,
            },
        ]
    );
}

#[test]
fn map_notify_event_should_filter_supported_paths_and_expand_rename() {
    let roots = vec![
        WatchRoot {
            source_tool: "codex".to_string(),
            root_path: PathBuf::from("D:\\home\\.codex"),
        },
        WatchRoot {
            source_tool: "claude".to_string(),
            root_path: PathBuf::from("D:\\home\\.claude"),
        },
        WatchRoot {
            source_tool: "gemini".to_string(),
            root_path: PathBuf::from("D:\\home\\.gemini"),
        },
    ];

    let rename_event = Event {
        kind: EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
        paths: vec![
            PathBuf::from("D:\\home\\.codex\\sessions\\old-session.jsonl"),
            PathBuf::from("D:\\home\\.codex\\sessions\\new-session.jsonl"),
        ],
        attrs: Default::default(),
    };
    let create_event = Event {
        kind: EventKind::Create(CreateKind::File),
        paths: vec![
            PathBuf::from("D:\\home\\.claude\\projects\\demo\\session.jsonl"),
            PathBuf::from("D:\\home\\.claude\\projects\\demo\\sessions-index.json"),
        ],
        attrs: Default::default(),
    };
    let remove_event = Event {
        kind: EventKind::Remove(RemoveKind::File),
        paths: vec![
            PathBuf::from("D:\\home\\.gemini\\tmp\\demo\\chats\\session-1.json"),
            PathBuf::from("D:\\home\\.gemini\\tmp\\demo\\other\\ignore.txt"),
        ],
        attrs: Default::default(),
    };

    let rename_mapped = map_notify_event(&roots, &rename_event);
    let create_mapped = map_notify_event(&roots, &create_event);
    let remove_mapped = map_notify_event(&roots, &remove_event);

    assert_eq!(
        rename_mapped,
        vec![
            WatchEvent {
                source_tool: "codex".to_string(),
                path: PathBuf::from("D:\\home\\.codex\\sessions\\old-session.jsonl"),
                kind: WatchEventKind::Remove,
            },
            WatchEvent {
                source_tool: "codex".to_string(),
                path: PathBuf::from("D:\\home\\.codex\\sessions\\new-session.jsonl"),
                kind: WatchEventKind::Upsert,
            },
        ]
    );
    assert_eq!(
        create_mapped,
        vec![WatchEvent {
            source_tool: "claude".to_string(),
            path: PathBuf::from("D:\\home\\.claude\\projects\\demo\\session.jsonl"),
            kind: WatchEventKind::Upsert,
        }]
    );
    assert_eq!(
        remove_mapped,
        vec![WatchEvent {
            source_tool: "gemini".to_string(),
            path: PathBuf::from("D:\\home\\.gemini\\tmp\\demo\\chats\\session-1.json"),
            kind: WatchEventKind::Remove,
        }]
    );
}

#[test]
fn map_notify_event_should_ignore_codex_root_history_file() {
    let roots = vec![WatchRoot {
        source_tool: "codex".to_string(),
        root_path: PathBuf::from("D:\\home\\.codex\\sessions"),
    }];

    let event = Event {
        kind: EventKind::Create(CreateKind::File),
        paths: vec![
            PathBuf::from("D:\\home\\.codex\\history.jsonl"),
            PathBuf::from("D:\\home\\.codex\\sessions\\2026\\05\\17\\session-1.jsonl"),
        ],
        attrs: Default::default(),
    };

    let mapped = map_notify_event(&roots, &event);

    assert_eq!(
        mapped,
        vec![WatchEvent {
            source_tool: "codex".to_string(),
            path: PathBuf::from("D:\\home\\.codex\\sessions\\2026\\05\\17\\session-1.jsonl"),
            kind: WatchEventKind::Upsert,
        }]
    );
}

#[test]
fn map_notify_event_should_ignore_codex_history_file_in_root_fallback_mode() {
    let roots = vec![WatchRoot {
        source_tool: "codex".to_string(),
        root_path: PathBuf::from("D:\\home\\.codex"),
    }];

    let event = Event {
        kind: EventKind::Create(CreateKind::File),
        paths: vec![
            PathBuf::from("D:\\home\\.codex\\history.jsonl"),
            PathBuf::from("D:\\home\\.codex\\session.json"),
        ],
        attrs: Default::default(),
    };

    let mapped = map_notify_event(&roots, &event);

    assert_eq!(
        mapped,
        vec![WatchEvent {
            source_tool: "codex".to_string(),
            path: PathBuf::from("D:\\home\\.codex\\session.json"),
            kind: WatchEventKind::Upsert,
        }]
    );
}

#[test]
fn map_notify_event_should_ignore_claude_root_history_file() {
    let roots = vec![WatchRoot {
        source_tool: "claude".to_string(),
        root_path: PathBuf::from("D:\\home\\.claude\\projects"),
    }];

    let event = Event {
        kind: EventKind::Create(CreateKind::File),
        paths: vec![
            PathBuf::from("D:\\home\\.claude\\history.jsonl"),
            PathBuf::from("D:\\home\\.claude\\projects\\demo\\session.jsonl"),
        ],
        attrs: Default::default(),
    };

    let mapped = map_notify_event(&roots, &event);

    assert_eq!(
        mapped,
        vec![WatchEvent {
            source_tool: "claude".to_string(),
            path: PathBuf::from("D:\\home\\.claude\\projects\\demo\\session.jsonl"),
            kind: WatchEventKind::Upsert,
        }]
    );
}

#[test]
fn build_default_watch_roots_should_include_existing_source_dirs_only() {
    let temp = tempdir().unwrap();
    let home_dir = temp.path().join("home");
    let codex_dir = home_dir.join(".codex");
    let codex_sessions_dir = codex_dir.join("sessions");
    let claude_dir = home_dir.join(".claude");
    let claude_projects_dir = claude_dir.join("projects");
    let gemini_dir = home_dir.join(".gemini");
    let gemini_tmp_dir = gemini_dir.join("tmp");

    std::fs::create_dir_all(&codex_sessions_dir).unwrap();
    std::fs::create_dir_all(&claude_projects_dir).unwrap();
    std::fs::create_dir_all(&gemini_tmp_dir).unwrap();

    let roots = build_default_watch_roots(&home_dir, &codex_dir, &ScanSourcesRecord::default());

    assert_eq!(
        roots,
        vec![
            WatchRoot {
                source_tool: "codex".to_string(),
                root_path: codex_sessions_dir,
            },
            WatchRoot {
                source_tool: "claude".to_string(),
                root_path: claude_projects_dir,
            },
            WatchRoot {
                source_tool: "gemini".to_string(),
                root_path: gemini_tmp_dir,
            },
        ]
    );
}

#[test]
fn build_default_watch_roots_should_fallback_to_codex_root_when_sessions_dir_is_missing() {
    let temp = tempdir().unwrap();
    let home_dir = temp.path().join("home");
    let codex_dir = home_dir.join(".codex");

    std::fs::create_dir_all(&codex_dir).unwrap();

    let roots = build_default_watch_roots(&home_dir, &codex_dir, &ScanSourcesRecord::default());

    assert_eq!(
        roots,
        vec![WatchRoot {
            source_tool: "codex".to_string(),
            root_path: codex_dir,
        }]
    );
}

#[test]
fn build_default_watch_roots_should_skip_disabled_sources() {
    let temp = tempdir().unwrap();
    let home_dir = temp.path().join("home");
    let codex_dir = home_dir.join(".codex");
    let claude_dir = home_dir.join(".claude").join("projects");
    let gemini_dir = home_dir.join(".gemini").join("tmp");

    std::fs::create_dir_all(&codex_dir).unwrap();
    std::fs::create_dir_all(&claude_dir).unwrap();
    std::fs::create_dir_all(&gemini_dir).unwrap();

    let roots = build_default_watch_roots(
        &home_dir,
        &codex_dir,
        &ScanSourcesRecord {
            codex: false,
            claude: true,
            gemini: false,
        },
    );

    assert_eq!(
        roots,
        vec![WatchRoot {
            source_tool: "claude".to_string(),
            root_path: claude_dir,
        }]
    );
}
