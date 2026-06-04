import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { invokeMock } from "../../../../test/mockTauriInvoke";
import { useSessionMutationController } from "../useSessionMutationController";

beforeEach(() => {
  invokeMock.mockClear();
});

it("overview 模式 delete 使用传入 hardDelete", async () => {
  const onAfterMutation = vi.fn();
  const { result } = renderHook(() =>
    useSessionMutationController({
      viewMode: "overview",
      terminalPreference: "auto",
      supportsResumeInTerminal: true,
      onAfterMutation,
    }),
  );

  await act(async () => {
    await result.current.handleDeleteSession("codex", "session-1", { hardDelete: false });
  });

  expect(invokeMock).toHaveBeenCalledWith("delete_session", {
    payload: {
      sourceTool: "codex",
      sourceId: "session-1",
      hardDelete: false,
      cascadeSubagents: true,
    },
  });
  expect(onAfterMutation).toHaveBeenCalledTimes(1);
});

it("trash 模式 delete 强制 hardDelete=true", async () => {
  const { result } = renderHook(() =>
    useSessionMutationController({
      viewMode: "trash",
      terminalPreference: "auto",
      supportsResumeInTerminal: true,
      onAfterMutation: vi.fn(),
    }),
  );

  await act(async () => {
    await result.current.handleDeleteSession("codex", "trash-1", { hardDelete: false });
  });

  expect(invokeMock).toHaveBeenCalledWith("delete_session", {
    payload: {
      sourceTool: "codex",
      sourceId: "trash-1",
      hardDelete: true,
      cascadeSubagents: true,
    },
  });
});

it("delete 成功时触发 onAfterMutation", async () => {
  const onAfterMutation = vi.fn();
  const { result } = renderHook(() =>
    useSessionMutationController({
      viewMode: "overview",
      terminalPreference: "auto",
      supportsResumeInTerminal: true,
      onAfterMutation,
    }),
  );

  await act(async () => {
    await result.current.handleDeleteSession("codex", "session-1");
  });

  expect(onAfterMutation).toHaveBeenCalledTimes(1);
});

it("delete no-op 且无 warnings 时不触发 onAfterMutation", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "delete_session") {
      return { deletedSessions: 0, deletedSourceFiles: 0, warnings: [] };
    }
    return null;
  });

  const onAfterMutation = vi.fn();
  const { result } = renderHook(() =>
    useSessionMutationController({
      viewMode: "overview",
      terminalPreference: "auto",
      supportsResumeInTerminal: true,
      onAfterMutation,
    }),
  );

  await act(async () => {
    const ok = await result.current.handleDeleteSession("codex", "session-1");
    expect(ok).toBe(true);
  });

  expect(onAfterMutation).not.toHaveBeenCalled();
});

it("delete warnings 时触发 onAfterMutation", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "delete_session") {
      return { deletedSessions: 0, deletedSourceFiles: 0, warnings: ["warn"] };
    }
    return null;
  });

  const onAfterMutation = vi.fn();
  const { result } = renderHook(() =>
    useSessionMutationController({
      viewMode: "overview",
      terminalPreference: "auto",
      supportsResumeInTerminal: true,
      onAfterMutation,
    }),
  );

  await act(async () => {
    const ok = await result.current.handleDeleteSession("codex", "session-1");
    expect(ok).toBe(false);
  });

  expect(onAfterMutation).toHaveBeenCalledTimes(1);
});

it("trash 模式批量永久删除应走单次批量命令而不是逐条删除", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "delete_sessions") {
      return { deletedSessions: 2, deletedSourceFiles: 2, warnings: [] };
    }
    if (cmd === "delete_session") {
      return { deletedSessions: 1, deletedSourceFiles: 1, warnings: [] };
    }
    return null;
  });

  const onAfterMutation = vi.fn();
  const { result } = renderHook(() =>
    useSessionMutationController({
      viewMode: "trash",
      terminalPreference: "auto",
      supportsResumeInTerminal: true,
      onAfterMutation,
    }),
  );

  await act(async () => {
    const ok = await result.current.handleBatchDeleteSessions([
      { sourceTool: "codex", sourceId: "trash-1" },
      { sourceTool: "codex", sourceId: "trash-2" },
    ], { hardDelete: true });
    expect(ok).toBe(true);
  });

  expect(invokeMock).toHaveBeenCalledWith("delete_sessions", {
    payload: {
      targets: [
        { sourceTool: "codex", sourceId: "trash-1" },
        { sourceTool: "codex", sourceId: "trash-2" },
      ],
      hardDelete: true,
      cascadeSubagents: true,
    },
  });
  expect(invokeMock).not.toHaveBeenCalledWith("delete_session", expect.anything());
  expect(onAfterMutation).toHaveBeenCalledTimes(1);
});

it("handleResumeSession 带上 terminalPreference", async () => {
  const { result } = renderHook(() =>
    useSessionMutationController({
      viewMode: "overview",
      terminalPreference: "windows_terminal",
      supportsResumeInTerminal: true,
      onAfterMutation: vi.fn(),
    }),
  );

  await act(async () => {
    await result.current.handleResumeSession({
      sourceTool: "codex",
      sourceId: "session-1",
      workspacePath: "D:\\Works\\ai-session",
    });
  });

  expect(invokeMock).toHaveBeenCalledWith("open_resume_in_terminal", {
    payload: {
      sourceTool: "codex",
      sourceId: "session-1",
      workspacePath: "D:\\Works\\ai-session",
      terminalPreference: "windows_terminal",
    },
  });
});

it("handleResumeSession skips backend call when current platform does not support terminal resume", async () => {
  const { result } = renderHook(() =>
    useSessionMutationController({
      viewMode: "overview",
      terminalPreference: "terminal",
      supportsResumeInTerminal: false,
      onAfterMutation: vi.fn(),
    }),
  );

  await act(async () => {
    await result.current.handleResumeSession({
      sourceTool: "codex",
      sourceId: "session-1",
      workspacePath: "/Users/demo/project",
    });
  });

  expect(invokeMock).not.toHaveBeenCalledWith("open_resume_in_terminal", expect.anything());
});

it("handleOpenWorkspacePath 对未知路径静默跳过", async () => {
  const { result } = renderHook(() =>
    useSessionMutationController({
      viewMode: "overview",
      terminalPreference: "auto",
      supportsResumeInTerminal: true,
      onAfterMutation: vi.fn(),
    }),
  );

  await act(async () => {
    await result.current.handleOpenWorkspacePath("未知路径");
    await result.current.handleOpenWorkspacePath("   ");
  });

  expect(invokeMock).not.toHaveBeenCalledWith("open_in_explorer", expect.anything());
});

it("handleExportSession 保留 includeSubagent", async () => {
  const { result } = renderHook(() =>
    useSessionMutationController({
      viewMode: "overview",
      terminalPreference: "auto",
      supportsResumeInTerminal: true,
      onAfterMutation: vi.fn(),
    }),
  );

  await act(async () => {
    await result.current.handleExportSession({
      sourceTool: "codex",
      sourceId: "sub-session-1",
      includeSubagent: true,
    });
  });

  expect(invokeMock).toHaveBeenCalledWith("export_session_markdown", {
    payload: {
      sourceTool: "codex",
      sourceId: "sub-session-1",
      includeSubagent: true,
    },
  });
});
