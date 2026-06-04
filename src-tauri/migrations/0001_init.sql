create table if not exists workspaces (
  id integer primary key,
  path text not null unique,
  name text not null,
  enabled integer not null default 1,
  last_scanned_at text
);

create table if not exists sessions (
  id integer primary key,
  source_tool text not null,
  source_id text not null,
  title text not null,
  workspace_id integer,
  source_path text not null,
  source_path_key text not null default '',
  workspace_path text not null default '',
  workspace_path_key text not null default '',
  is_subagent integer not null default 0,
  parent_source_id text,
  started_at text,
  ended_at text,
  updated_at text not null default (datetime('now', '+8 hours')),
  source_file_size integer not null default 0,
  source_file_mtime integer not null default 0,
  input_token_count integer not null default 0,
  output_token_count integer not null default 0,
  message_count integer not null default 0,
  size_bytes integer not null default 0,
  deleted_by_user integer not null default 0,
  deleted_at text,
  foreign key (workspace_id) references workspaces(id),
  unique(source_tool, source_id)
);

create table if not exists messages (
  id integer primary key,
  session_id integer not null,
  role text not null,
  content text not null,
  seq integer not null,
  created_at text not null default (datetime('now', '+8 hours')),
  metadata_json text,
  foreign key (session_id) references sessions(id)
);

create table if not exists artifacts (
  id integer primary key,
  session_id integer not null,
  message_id integer,
  artifact_path text not null,
  bytes integer not null default 0,
  change_type text,
  foreign key (session_id) references sessions(id),
  foreign key (message_id) references messages(id)
);

create table if not exists tags (
  id integer primary key,
  tag text not null unique
);

create table if not exists session_tags (
  session_id integer not null,
  tag_id integer not null,
  primary key (session_id, tag_id),
  foreign key (session_id) references sessions(id),
  foreign key (tag_id) references tags(id)
);

create table if not exists settings (
  id integer primary key check (id = 1),
  theme_mode text not null default 'system',
  auto_scan_hidden_dirs integer not null default 1,
  hard_delete integer not null default 0,
  default_workspace text,
  terminal_preference text not null default 'auto'
);

create table if not exists scan_jobs (
  id integer primary key,
  workspace_id integer,
  status text not null,
  started_at text not null default (datetime('now', '+8 hours')),
  finished_at text,
  error_message text,
  foreign key (workspace_id) references workspaces(id)
);

create index if not exists idx_sessions_tool_updated_deleted
  on sessions(source_tool, updated_at desc, deleted_at);
create index if not exists idx_messages_session_seq on messages(session_id, seq);
create index if not exists idx_messages_content on messages(content);
