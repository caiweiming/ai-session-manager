import { beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { invokeMock } from "./test/mockTauriInvoke";
import { defaultAppVersion } from "./test/tauriFixtures";
import { api } from "./lib/tauriClient";
import App from "./App";

beforeEach(() => {
  invokeMock.mockClear();
});

it("calls tauri list_sessions and renders app shell", async () => {
  render(<App />);
  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("list_sessions", expect.anything());
  });
  expect(screen.getByTestId("main-area")).toBeInTheDocument();
});

it("calls refresh_sessions with expected command and returns summary shape", async () => {
  const result = await api.refreshSessions();

  expect(invokeMock).toHaveBeenCalledWith("refresh_sessions");
  expect(result).toMatchObject({
    scannedFiles: expect.any(Number),
    indexedSessions: expect.any(Number),
    failedFiles: expect.any(Number),
    failedFileDetails: expect.any(Array),
  });
});

it("calls get_session_detail with payload and returns detail shape", async () => {
  const payload = { sourceId: "session-1", sourceTool: "codex" };
  const result = await api.getSessionDetail(payload);

  expect(invokeMock).toHaveBeenCalledWith("get_session_detail", { payload });
  expect(result).toMatchObject({
    detail: {
      sourceId: payload.sourceId,
      sourceTool: payload.sourceTool,
      messages: expect.any(Array),
    },
  });
});

it("throws when refresh_sessions invoke fails", async () => {
  const error = new Error("refresh failed");
  invokeMock.mockRejectedValueOnce(error);

  await expect(api.refreshSessions()).rejects.toThrow("refresh failed");
});

it("throws when health_check invoke fails with real error", async () => {
  const error = new Error("health failed");
  invokeMock.mockRejectedValueOnce(error);

  await expect(api.health()).rejects.toThrow("health failed");
});

it("throws when list_sessions invoke fails", async () => {
  const error = new Error("list failed");
  invokeMock.mockRejectedValueOnce(error);

  await expect(api.listSessions({ page: 1, pageSize: 20 })).rejects.toThrow("list failed");
});

it("decodes structured tauri command errors into standard Error messages", async () => {
  invokeMock.mockRejectedValueOnce({
    code: "invalid_argument",
    message: "invalid path: empty",
  });

  try {
    await api.openInExplorer({ path: "   ", reveal: false });
    throw new Error("expected openInExplorer to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("invalid path: empty");
  }
});

it("throws when get_session_detail invoke fails", async () => {
  const error = new Error("detail failed");
  invokeMock.mockRejectedValueOnce(error);

  await expect(api.getSessionDetail({ sourceId: "session-1", sourceTool: "codex" })).rejects.toThrow("detail failed");
});

it("calls list_subagent_sessions with payload and returns rows shape", async () => {
  const payload = { sourceTool: "codex", parentSourceId: "session-1" };
  const result = await api.listSubagentSessions(payload);

  expect(invokeMock).toHaveBeenCalledWith("list_subagent_sessions", { payload });
  expect(result).toMatchObject({
    rows: expect.any(Array),
  });
});

it("calls delete_session with payload and returns structured summary shape", async () => {
  const payload = {
    sourceTool: "codex",
    sourceId: "session-1",
    cascadeSubagents: true,
  };
  const result = await api.deleteSession(payload);

  expect(invokeMock).toHaveBeenCalledWith("delete_session", { payload });
  expect(result).toMatchObject({
    deletedSessions: expect.any(Number),
    deletedSourceFiles: expect.any(Number),
    warnings: expect.any(Array),
  });
});

it("calls delete_sessions with payload and returns structured summary shape", async () => {
  const payload = {
    targets: [
      { sourceTool: "codex", sourceId: "session-1" },
      { sourceTool: "codex", sourceId: "session-2" },
    ],
    hardDelete: true,
    cascadeSubagents: true,
  };
  const result = await api.deleteSessions(payload);

  expect(invokeMock).toHaveBeenCalledWith("delete_sessions", { payload });
  expect(result).toMatchObject({
    deletedSessions: expect.any(Number),
    deletedSourceFiles: expect.any(Number),
    warnings: expect.any(Array),
  });
});

it("calls clear_trash and returns structured summary shape", async () => {
  const result = await api.clearTrash();

  expect(invokeMock).toHaveBeenCalledWith("clear_trash");
  expect(result).toMatchObject({
    deletedSessions: expect.any(Number),
    deletedSourceFiles: expect.any(Number),
    warnings: expect.any(Array),
  });
});

it("calls export_session_markdown with payload and returns output path", async () => {
  const payload = {
    sourceTool: "codex",
    sourceId: "session-1",
  };
  const result = await api.exportSessionMarkdown(payload);

  expect(invokeMock).toHaveBeenCalledWith("export_session_markdown", { payload });
  expect(result).toMatchObject({
    path: expect.any(String),
    canceled: expect.any(Boolean),
  });
});

it("calls settings and runtime commands with stable payload contracts", async () => {
  const workspace = await api.getRuntimeWorkspace();
  const settings = await api.getAppSettings();
  const updated = await api.updateAppSettings({ terminalPreference: "cmd" });
  const summary = await api.getOverviewSummary();

  expect(invokeMock).toHaveBeenCalledWith("get_runtime_workspace");
  expect(invokeMock).toHaveBeenCalledWith("get_app_settings");
  expect(invokeMock).toHaveBeenCalledWith("update_app_settings", {
    payload: { terminalPreference: "cmd" },
  });
  expect(invokeMock).toHaveBeenCalledWith("get_overview_summary");
  expect(workspace).toBe("D:\\Works\\ai-session");
  expect(settings.terminalPreference).toBe("auto");
  expect(updated.terminalPreference).toBe("cmd");
  expect(summary.toolStats).toEqual(expect.any(Array));
});

it("calls version and external url commands with stable contracts", async () => {
  const version = await api.getAppVersion();
  await api.openExternalUrl({
    url: "https://github.com/Ming/ai-session/releases/latest",
  });

  expect(invokeMock).toHaveBeenCalledWith("get_app_version");
  expect(invokeMock).toHaveBeenCalledWith("open_external_url", {
    payload: { url: "https://github.com/Ming/ai-session/releases/latest" },
  });
  expect(version).toBe(defaultAppVersion);
});

it("falls back when refresh_sessions is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.refreshSessions()).resolves.toEqual({
    scannedFiles: 0,
    indexedSessions: 0,
    failedFiles: 0,
    failedFileDetails: [],
  });
});

it("falls back when list_sessions is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.listSessions({ page: 1, pageSize: 20 })).resolves.toEqual({ rows: [] });
});

it("falls back when get_session_detail is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.getSessionDetail({ sourceId: "session-1", sourceTool: "codex" })).resolves.toEqual({
    detail: null,
  });
});

it("falls back when list_subagent_sessions is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.listSubagentSessions({ sourceTool: "codex", parentSourceId: "session-1" })).resolves.toEqual({
    rows: [],
  });
});

it("falls back when delete_session is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.deleteSession({ sourceId: "session-1", sourceTool: "codex" })).resolves.toEqual({
    deletedSessions: 0,
    deletedSourceFiles: 0,
    warnings: [],
  });
});

it("falls back when delete_sessions is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.deleteSessions({
    targets: [{ sourceId: "session-1", sourceTool: "codex" }],
    hardDelete: true,
    cascadeSubagents: true,
  })).resolves.toEqual({
    deletedSessions: 0,
    deletedSourceFiles: 0,
    warnings: [],
  });
});

it("falls back when clear_trash is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.clearTrash()).resolves.toEqual({
    deletedSessions: 0,
    deletedSourceFiles: 0,
    warnings: [],
  });
});

it("falls back when export_session_markdown is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.exportSessionMarkdown({ sourceId: "session-1", sourceTool: "codex" })).resolves.toEqual({
    path: "",
    canceled: true,
  });
});

it("falls back when get_app_settings is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.getAppSettings()).resolves.toEqual({
    themeMode: "system",
    hardDelete: false,
    terminalPreference: "auto",
    scanSources: {
      codex: true,
      claude: true,
      gemini: true,
    },
  });
});

it("falls back when update_app_settings is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.updateAppSettings({ hardDelete: true })).resolves.toEqual({
    themeMode: "system",
    hardDelete: true,
    terminalPreference: "auto",
    scanSources: {
      codex: true,
      claude: true,
      gemini: true,
    },
  });
});

it("falls back when get_overview_summary is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.getOverviewSummary()).resolves.toEqual({
    totalWorkspaces: 0,
    totalSessions: 0,
    activeSessions7d: 0,
    trashSessions: 0,
    totalSizeBytes: 0,
    toolStats: [],
  });
});

it("returns null when runtime workspace is blank string", async () => {
  invokeMock.mockResolvedValueOnce("   ");

  await expect(api.getRuntimeWorkspace()).resolves.toBeNull();
});

it("falls back when open_in_explorer is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(api.openInExplorer({ path: "D:\\Works\\ai-session", reveal: false })).resolves.toBeUndefined();
});

it("falls back when open_resume_in_terminal is unavailable in non-tauri runtime", async () => {
  invokeMock.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  await expect(
    api.openResumeInTerminal({
      sourceTool: "codex",
      sourceId: "session-1",
      workspacePath: "D:\\Works\\ai-session",
      terminalPreference: "auto",
    }),
  ).resolves.toBeUndefined();
});

it("prefers injected invoke contract in browser runtime before tauri fallback", async () => {
  const injectedInvoke = vi.fn(async (command: string, args?: unknown) => {
    if (command === "refresh_sessions") {
      return {
        scannedFiles: 5,
        indexedSessions: 3,
        failedFiles: 1,
        failedFileDetails: [
          {
            sourceTool: "claude",
            sourcePath: "D:\\broken\\browser-mock.jsonl",
            message: "invalid session id",
          },
        ],
      };
    }
    if (command === "list_sessions") {
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: "browser-mock",
            title: "浏览器态契约 mock",
            sourcePath: "D:\\mock\\browser-mock.jsonl",
            createdAt: "2026-05-13T10:00:00Z",
            updatedAt: "2026-05-13T10:00:00Z",
          },
        ],
      };
    }
    return { command, args };
  });
  window.__AI_SESSION_MANAGER_INVOKE_MOCK__ = injectedInvoke;
  invokeMock.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'invoke')"));

  try {
    await expect(api.refreshSessions()).resolves.toEqual({
      scannedFiles: 5,
      indexedSessions: 3,
      failedFiles: 1,
      failedFileDetails: [
        {
          sourceTool: "claude",
          sourcePath: "D:\\broken\\browser-mock.jsonl",
          message: "invalid session id",
        },
      ],
    });
    await expect(api.listSessions({ page: 1, pageSize: 20 })).resolves.toEqual({
      rows: [
        {
          sourceTool: "codex",
          sourceId: "browser-mock",
          title: "浏览器态契约 mock",
          sourcePath: "D:\\mock\\browser-mock.jsonl",
          createdAt: "2026-05-13T10:00:00Z",
          updatedAt: "2026-05-13T10:00:00Z",
        },
      ],
    });
    expect(injectedInvoke).toHaveBeenCalledWith("refresh_sessions", undefined);
    expect(injectedInvoke).toHaveBeenCalledWith("list_sessions", {
      payload: { page: 1, pageSize: 20 },
    });
    expect(invokeMock).not.toHaveBeenCalled();
  } finally {
    delete window.__AI_SESSION_MANAGER_INVOKE_MOCK__;
  }
});
