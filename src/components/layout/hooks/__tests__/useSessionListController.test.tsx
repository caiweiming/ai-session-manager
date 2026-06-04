import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invokeMock } from "../../../../test/mockTauriInvoke";
import { useSessionListController } from "../useSessionListController";

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  invokeMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

it("waits for first scan completion before loading overview and session list", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 1,
        totalSessions: 1,
        activeSessions7d: 1,
        trashSessions: 0,
        totalSizeBytes: 1024,
        toolStats: [{ sourceTool: "codex", sessionCount: 1, totalSizeBytes: 1024 }],
      };
    }
    if (cmd === "list_sessions") {
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: "codex-main-1",
            title: "Codex 主会话",
            workspacePath: "D:\\Works\\ai-session",
            sourcePath: "D:\\Works\\ai-session\\.codex\\sessions\\main.jsonl",
            createdAt: "2026-05-01T08:00:00Z",
            updatedAt: "2026-05-01T09:00:00Z",
          },
        ],
      };
    }
    return null;
  });

  const { result, rerender } = renderHook(
    (props: {
      workspaceReady: boolean;
      bootstrapState: "loading" | "ready" | "error";
      scanVersion: number;
      claudeProjectPaths: string[];
    }) => useSessionListController(props),
    {
      initialProps: {
        workspaceReady: true,
        bootstrapState: "ready",
        scanVersion: -1,
        claudeProjectPaths: [],
      },
    },
  );

  expect(result.current.sessionsState).toBe("loading");
  expect(result.current.rows).toEqual([]);
  expect(result.current.overviewSummary).toBeNull();
  expect(invokeMock).not.toHaveBeenCalledWith("get_overview_summary");
  expect(invokeMock).not.toHaveBeenCalledWith("list_sessions", expect.anything());

  rerender({
    workspaceReady: true,
    bootstrapState: "ready",
    scanVersion: 0,
    claudeProjectPaths: [],
  });

  await waitFor(() => {
    expect(result.current.sessionsState).toBe("ready");
    expect(result.current.overviewSummary).toMatchObject({ totalSessions: 1 });
    expect(result.current.rows[0]?.sourceId).toBe("codex-main-1");
  });
});

it("loads overview and session list from scanVersion and builds claude hints", async () => {
  let overviewCallCount = 0;
  let listCallCount = 0;

  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: Record<string, unknown> }) => {
    if (cmd === "get_overview_summary") {
      overviewCallCount += 1;
      return {
        totalWorkspaces: 2,
        totalSessions: overviewCallCount + 1,
        activeSessions7d: 2,
        trashSessions: 0,
        totalSizeBytes: 4096,
        toolStats: [
          { sourceTool: "claude", sessionCount: 1, totalSizeBytes: 2048 },
          { sourceTool: "codex", sessionCount: 1, totalSizeBytes: 2048 },
        ],
      };
    }
    if (cmd === "list_sessions") {
      listCallCount += 1;
      return {
        rows: [
          {
            sourceTool: "claude",
            sourceId: `claude-main-${listCallCount}`,
            title: listCallCount === 1 ? "Claude 主会话" : "Claude 重扫后会话",
            workspacePath: "D:\\Works\\claude-project",
            sourcePath: "D:\\Works\\claude-project\\.claude\\history\\main.jsonl",
            createdAt: "2026-05-01T08:00:00Z",
            updatedAt: "2026-05-01T09:00:00Z",
          },
        ],
      };
    }
    if (cmd === "list_trash_sessions") {
      return { rows: [] };
    }
    return null;
  });

  const { result, rerender } = renderHook(
    (props: {
      workspaceReady: boolean;
      bootstrapState: "loading" | "ready" | "error";
      scanVersion: number;
      claudeProjectPaths: string[];
    }) => useSessionListController(props),
    {
      initialProps: {
        workspaceReady: true,
        bootstrapState: "ready",
        scanVersion: 0,
        claudeProjectPaths: ["D:\\Works\\claude-project"],
      },
    },
  );

  await waitFor(() => {
    expect(result.current.sessionsState).toBe("ready");
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.overviewSummary).toMatchObject({ totalSessions: 2 });
  });
  expect(result.current.rows[0]?.parentSourceId).toBeUndefined();
  expect(invokeMock).toHaveBeenCalledWith("get_overview_summary");
  expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
    payload: { page: 1, pageSize: 1000 },
  });

  rerender({
    workspaceReady: true,
    bootstrapState: "ready",
    scanVersion: 1,
    claudeProjectPaths: ["D:\\Works\\claude-project"],
  });

  await waitFor(() => {
    expect(overviewCallCount).toBe(2);
    expect(listCallCount).toBe(2);
    expect(result.current.overviewSummary).toMatchObject({ totalSessions: 3 });
    expect(result.current.rows[0]?.sourceId).toBe("claude-main-2");
  });

  act(() => {
    result.current.setSelectedTool("claude");
  });
  expect(result.current.groupPathHints).toEqual(["D:\\Works\\claude-project"]);

  act(() => {
    result.current.setSearchKeyword("主会话");
  });

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
      payload: {
        tool: "claude",
        keyword: "主会话",
        page: 1,
        pageSize: 1000,
      },
    });
  });
  expect(result.current.groupPathHints).toEqual([]);

  rerender({
    workspaceReady: true,
    bootstrapState: "error",
    scanVersion: 2,
    claudeProjectPaths: [],
  });

  await waitFor(() => {
    expect(result.current.sessionsState).toBe("error");
    expect(result.current.rows).toEqual([]);
  });
});

it("maps parentSourceId from api rows for subagent relationships", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 1,
        totalSessions: 2,
        activeSessions7d: 2,
        trashSessions: 0,
        totalSizeBytes: 2048,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 2048 }],
      };
    }
    if (cmd === "list_sessions") {
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: "main-1",
            title: "主会话",
            workspacePath: "D:\\Works\\ai-session",
            sourcePath: "D:\\Works\\ai-session\\.codex\\sessions\\main.jsonl",
            createdAt: "2026-05-01T08:00:00Z",
            updatedAt: "2026-05-01T09:00:00Z",
          },
          {
            sourceTool: "codex",
            sourceId: "sub-1",
            parentSourceId: "main-1",
            title: "子会话",
            workspacePath: "D:\\Works\\ai-session",
            sourcePath: "D:\\Works\\ai-session\\.codex\\sessions\\sub.jsonl",
            isSubagent: true,
            createdAt: "2026-05-01T08:10:00Z",
            updatedAt: "2026-05-01T09:10:00Z",
          },
        ],
      };
    }
    return null;
  });

  const { result } = renderHook(() =>
    useSessionListController({
      workspaceReady: true,
      bootstrapState: "ready",
      scanVersion: 0,
      claudeProjectPaths: [],
    }),
  );

  await waitFor(() => {
    expect(result.current.sessionsState).toBe("ready");
    expect(result.current.rows).toHaveLength(2);
  });

  expect(result.current.rows[0]?.parentSourceId).toBeUndefined();
  expect(result.current.rows[1]).toMatchObject({
    sourceId: "sub-1",
    isSubagent: true,
    parentSourceId: "main-1",
  });
});

it("keeps existing overview summary when bootstrap state changes from ready to error", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 3,
        totalSessions: 9,
        activeSessions7d: 4,
        trashSessions: 1,
        totalSizeBytes: 8192,
        toolStats: [{ sourceTool: "codex", sessionCount: 9, totalSizeBytes: 8192 }],
      };
    }
    if (cmd === "list_sessions") {
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: "codex-main-1",
            title: "Codex 主会话",
            workspacePath: "D:\\Works\\ai-session",
            sourcePath: "D:\\Works\\ai-session\\.codex\\sessions\\main.jsonl",
            createdAt: "2026-05-01T08:00:00Z",
            updatedAt: "2026-05-01T09:00:00Z",
          },
        ],
      };
    }
    return null;
  });

  const { result, rerender } = renderHook(
    (props: {
      workspaceReady: boolean;
      bootstrapState: "loading" | "ready" | "error";
      scanVersion: number;
      claudeProjectPaths: string[];
    }) => useSessionListController(props),
    {
      initialProps: {
        workspaceReady: true,
        bootstrapState: "ready",
        scanVersion: 0,
        claudeProjectPaths: [],
      },
    },
  );

  await waitFor(() => {
    expect(result.current.sessionsState).toBe("ready");
    expect(result.current.overviewSummary).toMatchObject({
      totalWorkspaces: 3,
      totalSessions: 9,
    });
  });

  rerender({
    workspaceReady: true,
    bootstrapState: "error",
    scanVersion: 1,
    claudeProjectPaths: [],
  });

  await waitFor(() => {
    expect(result.current.sessionsState).toBe("error");
    expect(result.current.rows).toEqual([]);
  });
  expect(result.current.overviewSummary).toMatchObject({
    totalWorkspaces: 3,
    totalSessions: 9,
  });
});

it("ignores stale overview list result after switching to trash view", async () => {
  const overviewDeferred = createDeferred<{
    rows: Array<{
      sourceTool: string;
      sourceId: string;
      title: string;
      workspacePath: string;
      sourcePath: string;
      createdAt: string;
      updatedAt: string;
    }>;
  }>();
  const trashDeferred = createDeferred<{
    rows: Array<{
      sourceTool: string;
      sourceId: string;
      title: string;
      workspacePath: string;
      sourcePath: string;
      createdAt: string;
      updatedAt: string;
    }>;
  }>();

  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 1,
        totalSessions: 2,
        activeSessions7d: 1,
        trashSessions: 1,
        totalSizeBytes: 1024,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 1024 }],
      };
    }
    if (cmd === "list_sessions") {
      return overviewDeferred.promise;
    }
    if (cmd === "list_trash_sessions") {
      return trashDeferred.promise;
    }
    return null;
  });

  const { result } = renderHook(() =>
    useSessionListController({
      workspaceReady: true,
      bootstrapState: "ready",
      scanVersion: 0,
      claudeProjectPaths: [],
    }),
  );

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
      payload: { page: 1, pageSize: 1000 },
    });
  });

  act(() => {
    result.current.setViewMode("trash");
  });

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("list_trash_sessions", {
      payload: { page: 1, pageSize: 1000 },
    });
  });

  await act(async () => {
    trashDeferred.resolve({
      rows: [
        {
          sourceTool: "codex",
          sourceId: "trash-1",
          title: "回收站结果",
          workspacePath: "D:\\Works\\trash",
          sourcePath: "D:\\Works\\trash\\one.jsonl",
          createdAt: "2026-05-01T08:00:00Z",
          updatedAt: "2026-05-01T09:00:00Z",
        },
      ],
    });
  });

  await waitFor(() => {
    expect(result.current.sessionsState).toBe("ready");
    expect(result.current.rows[0]?.sourceId).toBe("trash-1");
  });

  await act(async () => {
    overviewDeferred.resolve({
      rows: [
        {
          sourceTool: "codex",
          sourceId: "overview-1",
          title: "旧总览结果",
          workspacePath: "D:\\Works\\overview",
          sourcePath: "D:\\Works\\overview\\one.jsonl",
          createdAt: "2026-05-02T08:00:00Z",
          updatedAt: "2026-05-02T09:00:00Z",
        },
      ],
    });
  });

  expect(result.current.rows[0]?.sourceId).toBe("trash-1");
});

it("only queries latest keyword when search input changes rapidly", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 1,
        totalSessions: 2,
        activeSessions7d: 1,
        trashSessions: 0,
        totalSizeBytes: 1024,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 1024 }],
      };
    }
    if (cmd === "list_sessions") {
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: "main-1",
            title: "Alpha",
            workspacePath: "D:\\Works\\alpha",
            sourcePath: "D:\\Works\\alpha\\main.jsonl",
            createdAt: "2026-05-01T08:00:00Z",
            updatedAt: "2026-05-01T09:00:00Z",
          },
        ],
      };
    }
    return null;
  });

  const { result } = renderHook(() =>
    useSessionListController({
      workspaceReady: true,
      bootstrapState: "ready",
      scanVersion: 0,
      claudeProjectPaths: [],
    }),
  );

  await waitFor(() => {
    expect(result.current.sessionsState).toBe("ready");
  });

  vi.useFakeTimers();
  invokeMock.mockClear();

  act(() => {
    result.current.setSearchKeyword("主");
  });
  act(() => {
    result.current.setSearchKeyword("主会话");
  });

  await act(async () => {
    await vi.runAllTimersAsync();
  });

  const keywordCalls = invokeMock.mock.calls.filter(
    (call) => call[0] === "list_sessions" && typeof call[1]?.payload?.keyword === "string",
  );
  expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
    payload: {
      keyword: "主会话",
      page: 1,
      pageSize: 1000,
    },
  });
  expect(keywordCalls).toHaveLength(1);
});

it("resets tool, keyword, date filter, and view mode back to default browsing state", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 1,
        totalSessions: 2,
        activeSessions7d: 1,
        trashSessions: 1,
        totalSizeBytes: 1024,
        toolStats: [
          { sourceTool: "claude", sessionCount: 1, totalSizeBytes: 512 },
          { sourceTool: "codex", sessionCount: 1, totalSizeBytes: 512 },
        ],
      };
    }
    if (cmd === "list_sessions") {
      return {
        rows: [
          {
            sourceTool: "claude",
            sourceId: "claude-main",
            title: "Claude 主会话",
            workspacePath: "D:\\Works\\claude-project",
            sourcePath: "D:\\Works\\claude-project\\.claude\\history\\main.jsonl",
            createdAt: "2026-05-01T08:00:00Z",
            updatedAt: "2026-05-01T09:00:00Z",
          },
        ],
      };
    }
    if (cmd === "list_trash_sessions") {
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: "trash-row",
            title: "回收站会话",
            workspacePath: "D:\\Works\\trash",
            sourcePath: "D:\\Works\\trash\\one.jsonl",
            createdAt: "2026-05-02T08:00:00Z",
            updatedAt: "2026-05-02T09:00:00Z",
          },
        ],
      };
    }
    return null;
  });

  const { result } = renderHook(() =>
    useSessionListController({
      workspaceReady: true,
      bootstrapState: "ready",
      scanVersion: 0,
      claudeProjectPaths: ["D:\\Works\\claude-project"],
    }),
  );

  await waitFor(() => {
    expect(result.current.sessionsState).toBe("ready");
  });

  act(() => {
    result.current.setSelectedTool("claude");
    result.current.setSearchKeyword("主会话");
    result.current.setUpdatedWithinDays(7);
    result.current.setViewMode("trash");
  });

  await waitFor(() => {
    expect(result.current.viewMode).toBe("trash");
  });

  act(() => {
    result.current.resetBrowseState();
  });

  await waitFor(() => {
    expect(result.current.selectedTool).toBeNull();
    expect(result.current.searchKeyword).toBe("");
    expect(result.current.updatedWithinDays).toBeNull();
    expect(result.current.viewMode).toBe("overview");
  });
});
