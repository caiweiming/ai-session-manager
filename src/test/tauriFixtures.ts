import type {
  AppSettings,
  PlatformCapabilities,
  OverviewSummary,
  RefreshSummary,
  SessionDetail,
  SessionMutationResult,
  SessionRow,
  SubagentSessionRow,
} from "../lib/tauriClient";
import packageJson from "../../package.json";

export const defaultAppVersion = packageJson.version;

export const defaultAppSettings: AppSettings = {
  themeMode: "system",
  hardDelete: false,
  terminalPreference: "auto",
  scanSources: {
    codex: true,
    claude: true,
    gemini: true,
  },
};

export const defaultPlatformCapabilities: PlatformCapabilities = {
  os: "windows",
  terminalOptions: [
    { id: "auto", label: "自动（推荐）" },
    { id: "windows_terminal", label: "Windows Terminal" },
    { id: "powershell", label: "PowerShell" },
    { id: "cmd", label: "cmd" },
  ],
  supportsRevealPath: true,
  supportsResumeInTerminal: true,
  revealPathDegradesToOpenParent: false,
};

export const defaultOverviewSummary: OverviewSummary = {
  totalWorkspaces: 1,
  totalSessions: 1,
  activeSessions7d: 1,
  trashSessions: 0,
  totalSizeBytes: 2048,
  toolStats: [{ sourceTool: "codex", sessionCount: 1, totalSizeBytes: 2048 }],
};

export const defaultRefreshSummary: RefreshSummary = {
  scannedFiles: 3,
  indexedSessions: 2,
  failedFiles: 1,
  failedFileDetails: [
    {
      sourceTool: "claude",
      sourcePath: "D:\\broken\\claude-session.jsonl",
      message: "invalid session_id: missing or empty",
    },
  ],
};

export const defaultSessionRow: SessionRow = {
  sourceTool: "codex",
  sourceId: "1",
  title: "Fix timeout",
  workspacePath: "D:\\Works\\ai-session",
  sourcePath: "/tmp/codex/session-1.jsonl",
  createdAt: "2026-04-24T09:50:00Z",
  updatedAt: "2026-04-24T10:00:00Z",
};

export const defaultSessionRows: SessionRow[] = [defaultSessionRow];

export const defaultSessionDetail: SessionDetail = {
  sourceTool: "codex",
  sourceId: "session-1",
  title: "Fix timeout",
  workspacePath: "D:\\Works\\ai-session",
  sourcePath: "/tmp/codex/session-1.jsonl",
  createdAt: "2026-04-24T09:50:00Z",
  updatedAt: "2026-04-24T10:00:00Z",
  sizeBytes: 2048,
  inputTokens: 1536,
  outputTokens: 928,
  messages: [
    {
      role: "user",
      content: "Please fix timeout issue",
      createdAt: "2026-04-24T09:50:00Z",
    },
  ],
};

export const defaultSubagentSessionRow: SubagentSessionRow = {
  sourceTool: "codex",
  sourceId: "sub-session-1",
  title: "子代理会话 1",
  workspacePath: "D:\\Works\\ai-session",
  sourcePath: "/tmp/codex/sub-session-1.jsonl",
  createdAt: "2026-04-24T10:00:20Z",
  updatedAt: "2026-04-24T10:01:00Z",
};

export const defaultSubagentRows: SubagentSessionRow[] = [defaultSubagentSessionRow];

export const defaultDeleteResult: SessionMutationResult = {
  deletedSessions: 1,
  deletedSourceFiles: 1,
  warnings: [],
};

export const defaultClearTrashResult: SessionMutationResult = {
  deletedSessions: 0,
  deletedSourceFiles: 0,
  warnings: [],
};

export const defaultRestoreResult = {
  restoredSessions: 1,
};

export const defaultExportResult = {
  path: "D:\\Works\\ai-session\\exports\\session-1.md",
  canceled: false,
};
