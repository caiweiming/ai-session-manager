import { vi } from "vitest";
import {
  defaultAppSettings,
  defaultAppVersion,
  defaultPlatformCapabilities,
  defaultClearTrashResult,
  defaultDeleteResult,
  defaultExportResult,
  defaultOverviewSummary,
  defaultRefreshSummary,
  defaultRestoreResult,
  defaultSessionDetail,
  defaultSessionRows,
  defaultSubagentRows,
} from "./tauriFixtures";

export const invokeMock = vi.fn(async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string } }) => {
  if (cmd === "health_check") return "ok";
  if (cmd === "get_runtime_workspace") return "D:\\Works\\ai-session";
  if (cmd === "get_app_version") return defaultAppVersion;
  if (cmd === "get_app_settings") return defaultAppSettings;
  if (cmd === "get_platform_capabilities") return defaultPlatformCapabilities;
  if (cmd === "update_app_settings") {
    const payload = args?.payload as
      | {
          themeMode?: "light" | "dark" | "system";
          hardDelete?: boolean;
          terminalPreference?: string;
          scanSources?: {
            codex?: boolean;
            claude?: boolean;
            gemini?: boolean;
          };
        }
      | undefined;
    return {
      themeMode: payload?.themeMode ?? defaultAppSettings.themeMode,
      hardDelete: payload?.hardDelete ?? defaultAppSettings.hardDelete,
      terminalPreference: payload?.terminalPreference ?? defaultAppSettings.terminalPreference,
      scanSources: {
        codex: payload?.scanSources?.codex ?? defaultAppSettings.scanSources.codex,
        claude: payload?.scanSources?.claude ?? defaultAppSettings.scanSources.claude,
        gemini: payload?.scanSources?.gemini ?? defaultAppSettings.scanSources.gemini,
      },
    };
  }
  if (cmd === "get_overview_summary") return defaultOverviewSummary;
  if (cmd === "refresh_sessions") return defaultRefreshSummary;
  if (cmd === "list_sessions") return { rows: defaultSessionRows };
  if (cmd === "get_session_detail") {
    const sourceTool = args?.payload?.sourceTool ?? "codex";
    const sourceId = args?.payload?.sourceId ?? "session-1";
    return {
      detail: {
        ...defaultSessionDetail,
        sourceTool,
        sourceId,
      },
    };
  }
  if (cmd === "list_subagent_sessions") return { rows: defaultSubagentRows };
  if (cmd === "list_trash_sessions") {
    return { rows: [] };
  }
  if (cmd === "delete_session") return defaultDeleteResult;
  if (cmd === "delete_sessions") return defaultDeleteResult;
  if (cmd === "restore_session") return defaultRestoreResult;
  if (cmd === "clear_trash") return defaultClearTrashResult;
  if (cmd === "export_session_markdown") return defaultExportResult;
  if (cmd === "open_resume_in_terminal") {
    return null;
  }
  if (cmd === "open_external_url") return null;
  return null;
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));
