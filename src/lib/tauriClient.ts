import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import packageJson from "../../package.json";

export type SessionRow = {
  sourceTool: string;
  sourceId: string;
  parentSourceId?: string;
  title: string;
  sourcePath: string;
  workspacePath?: string;
  isSubagent?: boolean;
  sizeBytes?: number;
  createdAt: string;
  updatedAt: string;
};

export type SessionMessage = {
  role: string;
  content: string;
  createdAt: string;
};

export type SessionDetail = {
  sourceTool: string;
  sourceId: string;
  title: string;
  sourcePath: string;
  workspacePath?: string;
  isSubagent?: boolean;
  createdAt?: string;
  updatedAt: string;
  sizeBytes?: number;
  inputTokens?: number;
  outputTokens?: number;
  messageTotal?: number;
  messageLoaded?: number;
  messages: SessionMessage[];
};

export type SubagentSessionRow = {
  sourceTool: string;
  sourceId: string;
  title: string;
  sourcePath: string;
  workspacePath?: string;
  createdAt: string;
  updatedAt: string;
};

export type RefreshSummary = {
  scannedFiles: number;
  indexedSessions: number;
  failedFiles: number;
  failedFileDetails?: {
    sourceTool: string;
    sourcePath: string;
    message: string;
  }[];
  claudeProjectPaths?: string[];
  claudeIndexEntries?: number;
  claudeIndexMissingFiles?: number;
  claudeIndexMissingSamples?: string[];
  claudeMainFiles?: number;
  claudeSubagentFiles?: number;
  claudeIndexedSessions?: number;
};

export type ToolSummaryRow = {
  sourceTool: string;
  sessionCount: number;
  totalSizeBytes: number;
};

export type OverviewSummary = {
  totalWorkspaces: number;
  totalSessions: number;
  activeSessions7d: number;
  trashSessions: number;
  totalSizeBytes: number;
  toolStats: ToolSummaryRow[];
};

export type TerminalOption = {
  id: string;
  label: string;
};

export type PlatformCapabilities = {
  os: string;
  terminalOptions: TerminalOption[];
  supportsRevealPath: boolean;
  supportsResumeInTerminal: boolean;
  revealPathDegradesToOpenParent: boolean;
};

export type AppSettings = {
  themeMode: "light" | "dark" | "system";
  hardDelete: boolean;
  terminalPreference: string;
  scanSources: {
    codex: boolean;
    claude: boolean;
    gemini: boolean;
  };
};

export type SessionMutationResult = {
  deletedSessions: number;
  deletedSourceFiles?: number;
  warnings?: string[];
};

export type TrashClearProgress = {
  deletedSessions: number;
  totalSessions: number;
};

type UpdateAppSettingsPayload = {
  themeMode?: "light" | "dark" | "system";
  hardDelete?: boolean;
  terminalPreference?: string;
  scanSources?: {
    codex?: boolean;
    claude?: boolean;
    gemini?: boolean;
  };
};

type ListSessionsPayload = {
  tool?: string;
  workspacePath?: string;
  keyword?: string;
  updatedWithinDays?: number;
  page: number;
  pageSize: number;
};

type GetSessionDetailPayload = {
  sourceTool: string;
  sourceId: string;
  includeSubagent?: boolean;
  inTrash?: boolean;
  messageLimit?: number;
};

type DeleteSessionPayload = {
  sourceTool: string;
  sourceId: string;
  hardDelete?: boolean;
  cascadeSubagents?: boolean;
};

type DeleteSessionsPayload = {
  targets: Array<{
    sourceTool: string;
    sourceId: string;
  }>;
  hardDelete?: boolean;
  cascadeSubagents?: boolean;
};

type RestoreSessionPayload = {
  sourceTool: string;
  sourceId: string;
  cascadeSubagents?: boolean;
};

type ListSubagentSessionsPayload = {
  sourceTool: string;
  parentSourceId: string;
  inTrash?: boolean;
};

type ExportSessionMarkdownPayload = {
  sourceTool: string;
  sourceId: string;
  includeSubagent?: boolean;
  targetPath?: string;
};

type OpenInExplorerPayload = {
  path: string;
  reveal?: boolean;
};

type OpenResumeInTerminalPayload = {
  sourceTool: string;
  sourceId: string;
  workspacePath: string;
  terminalPreference?: string;
};

type OpenExternalUrlPayload = {
  url: string;
};

type TauriInvokeArgs = Parameters<typeof invoke>[1];
type InjectedInvoke = <TResult>(command: string, args?: TauriInvokeArgs) => Promise<TResult>;
type TauriCommandError = {
  code?: string;
  message?: string;
};
type TauriUnlisten = () => void;

const isTauriUnavailableError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  if (message.includes("__TAURI_INTERNALS__")) return true;
  if (message.includes("reading 'invoke'")) return true;
  if (message.includes('reading "invoke"')) return true;
  return false;
};

type InvokeOptions<TArgs, TResult> = {
  command: string;
  args?: TArgs;
  fallback: TResult | ((args: TArgs | undefined) => TResult);
};

const resolveFallback = <TArgs, TResult>(
  fallback: InvokeOptions<TArgs, TResult>["fallback"],
  args: TArgs | undefined,
) => {
  return typeof fallback === "function"
    ? (fallback as (value: TArgs | undefined) => TResult)(args)
    : fallback;
};

const getInjectedInvoke = (): InjectedInvoke | null => {
  const candidate = (
    globalThis as typeof globalThis & {
      __AI_SESSION_MANAGER_INVOKE_MOCK__?: InjectedInvoke;
    }
  ).__AI_SESSION_MANAGER_INVOKE_MOCK__;
  return typeof candidate === "function" ? candidate : null;
};

const normalizeInvokeError = (error: unknown) => {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);

  if (error && typeof error === "object") {
    const record = error as TauriCommandError;
    if (typeof record.message === "string" && record.message.trim().length > 0) {
      const normalized = new Error(record.message);
      if (typeof record.code === "string" && record.code.trim().length > 0) {
        normalized.name = record.code;
      }
      return normalized;
    }
  }

  return new Error(String(error));
};

const invokeCommand = async <TResult>(command: string, args?: TauriInvokeArgs) => {
  const injectedInvoke = getInjectedInvoke();
  if (injectedInvoke) {
    return injectedInvoke<TResult>(command, args);
  }
  if (args === undefined) {
    return invoke<TResult>(command);
  }
  return invoke<TResult>(command, args);
};

const invokeWithTauriFallback = async <TResult, TArgs = undefined>({
  command,
  args,
  fallback,
}: InvokeOptions<TArgs, TResult>) => {
  try {
    if (args === undefined) {
      return await invokeCommand<TResult>(command);
    }
    return await invokeCommand<TResult>(command, args as TauriInvokeArgs);
  } catch (error) {
    if (isTauriUnavailableError(error)) {
      return resolveFallback(fallback, args);
    }
    throw normalizeInvokeError(error);
  }
};

const invokeVoidWithTauriFallback = async <TArgs = undefined>(
  options: InvokeOptions<TArgs, void>,
) => {
  await invokeWithTauriFallback(options);
};

const subscribeToTauriEvent = async <TPayload>(
  event: string,
  handler: (payload: TPayload) => void,
): Promise<TauriUnlisten> => {
  try {
    const unlisten = await listen<TPayload>(event, (message) => {
      handler(message.payload);
    });
    return unlisten;
  } catch (error) {
    if (isTauriUnavailableError(error)) {
      return () => {};
    }
    throw normalizeInvokeError(error);
  }
};

export const api = {
  health: async () => {
    return invokeWithTauriFallback({
      command: "health_check",
      fallback: "ok",
    });
  },
  refreshSessions: async () => {
    return invokeWithTauriFallback<RefreshSummary>({
      command: "refresh_sessions",
      fallback: {
        scannedFiles: 0,
        indexedSessions: 0,
        failedFiles: 0,
        failedFileDetails: [],
      },
    });
  },
  listSessions: async (payload: ListSessionsPayload) => {
    return invokeWithTauriFallback({
      command: "list_sessions",
      args: { payload },
      fallback: { rows: [] },
    });
  },
  getOverviewSummary: async () => {
    return invokeWithTauriFallback({
      command: "get_overview_summary",
      fallback: {
        totalWorkspaces: 0,
        totalSessions: 0,
        activeSessions7d: 0,
        trashSessions: 0,
        totalSizeBytes: 0,
        toolStats: [],
      },
    });
  },
  listTrashSessions: async (payload: ListSessionsPayload) => {
    return invokeWithTauriFallback({
      command: "list_trash_sessions",
      args: { payload },
      fallback: { rows: [] },
    });
  },
  getAppSettings: async (): Promise<AppSettings> => {
    return invokeWithTauriFallback({
      command: "get_app_settings",
      fallback: {
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
        scanSources: {
          codex: true,
          claude: true,
          gemini: true,
        },
      },
    });
  },
  getPlatformCapabilities: async (): Promise<PlatformCapabilities> => {
    return invokeWithTauriFallback({
      command: "get_platform_capabilities",
      fallback: {
        os: "unknown",
        terminalOptions: [{ id: "auto", label: "自动（推荐）" }],
        supportsRevealPath: true,
        supportsResumeInTerminal: false,
        revealPathDegradesToOpenParent: false,
      },
    });
  },
  updateAppSettings: async (payload: UpdateAppSettingsPayload): Promise<AppSettings> => {
    return invokeWithTauriFallback({
      command: "update_app_settings",
      args: { payload },
      fallback: (args) => ({
        themeMode: args?.payload.themeMode ?? "system",
        hardDelete: args?.payload.hardDelete ?? false,
        terminalPreference: args?.payload.terminalPreference ?? "auto",
        scanSources: {
          codex: args?.payload.scanSources?.codex ?? true,
          claude: args?.payload.scanSources?.claude ?? true,
          gemini: args?.payload.scanSources?.gemini ?? true,
        },
      }),
    });
  },
  getRuntimeWorkspace: async () => {
    const result = await invokeWithTauriFallback<string | null>({
      command: "get_runtime_workspace",
      fallback: null,
    });
    if (typeof result !== "string") return null;
    const trimmed = result.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  getAppVersion: async () => {
    return invokeWithTauriFallback<string>({
      command: "get_app_version",
      fallback: packageJson.version,
    });
  },
  getSessionDetail: async (payload: GetSessionDetailPayload) => {
    return invokeWithTauriFallback({
      command: "get_session_detail",
      args: { payload },
      fallback: { detail: null },
    });
  },
  listSubagentSessions: async (payload: ListSubagentSessionsPayload) => {
    return invokeWithTauriFallback({
      command: "list_subagent_sessions",
      args: { payload },
      fallback: { rows: [] },
    });
  },
  deleteSession: async (payload: DeleteSessionPayload) => {
    return invokeWithTauriFallback({
      command: "delete_session",
      args: { payload },
      fallback: { deletedSessions: 0, deletedSourceFiles: 0, warnings: [] },
    });
  },
  deleteSessions: async (payload: DeleteSessionsPayload) => {
    return invokeWithTauriFallback({
      command: "delete_sessions",
      args: { payload },
      fallback: { deletedSessions: 0, deletedSourceFiles: 0, warnings: [] },
    });
  },
  restoreSession: async (payload: RestoreSessionPayload) => {
    return invokeWithTauriFallback({
      command: "restore_session",
      args: { payload },
      fallback: { restoredSessions: 0 },
    });
  },
  clearTrash: async () => {
    return invokeWithTauriFallback({
      command: "clear_trash",
      fallback: { deletedSessions: 0, deletedSourceFiles: 0, warnings: [] },
    });
  },
  onTrashClearProgress: async (handler: (progress: TrashClearProgress) => void) => {
    return subscribeToTauriEvent<TrashClearProgress>("trash-clear-progress", handler);
  },
  exportSessionMarkdown: async (payload: ExportSessionMarkdownPayload) => {
    return invokeWithTauriFallback({
      command: "export_session_markdown",
      args: { payload },
      fallback: { path: "", canceled: true },
    });
  },
  openInExplorer: async (payload: OpenInExplorerPayload) => {
    await invokeVoidWithTauriFallback({
      command: "open_in_explorer",
      args: { payload },
      fallback: undefined,
    });
  },
  openResumeInTerminal: async (payload: OpenResumeInTerminalPayload) => {
    await invokeVoidWithTauriFallback({
      command: "open_resume_in_terminal",
      args: { payload },
      fallback: undefined,
    });
  },
  openExternalUrl: async (payload: OpenExternalUrlPayload) => {
    await invokeVoidWithTauriFallback({
      command: "open_external_url",
      args: { payload },
      fallback: undefined,
    });
  },
};
