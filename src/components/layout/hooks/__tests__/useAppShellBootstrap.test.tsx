import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invokeMock } from "../../../../test/mockTauriInvoke";
import { useAppShellBootstrap } from "../useAppShellBootstrap";

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

it("keeps scan feedback visible for a minimum duration after a fast rescan", async () => {
  const loadSettings = vi.fn(async () => {});
  let refreshCallCount = 0;

  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "refresh_sessions") {
      refreshCallCount += 1;
      if (refreshCallCount === 1) {
        throw new Error("scan root missing");
      }
      return {
        scannedFiles: 1,
        indexedSessions: 1,
        failedFiles: 0,
      };
    }
    return null;
  });

  const { result, rerender } = renderHook(
    (props: { settingsReady: boolean; loadSettings: () => Promise<void> }) => useAppShellBootstrap(props),
    {
      initialProps: {
        settingsReady: false,
        loadSettings,
      },
    },
  );

  await waitFor(() => {
    expect(loadSettings).toHaveBeenCalledTimes(1);
  });

  rerender({
    settingsReady: true,
    loadSettings,
  });

  await waitFor(() => {
    expect(result.current.scanErrorMessage).toBe("扫描本地会话失败：scan root missing");
  });

  act(() => {
    result.current.onRescan();
  });

  await waitFor(() => {
    expect(result.current.scanInFlight).toBe(true);
  });
  expect(result.current.scanInFlight).toBe(true);

  await waitFor(
    () => {
      expect(result.current.scanInFlight).toBe(false);
    },
    { timeout: 1500 },
  );
});

it("keeps runtime -> settings -> refresh order, exposes scanVersion sentinel, and blocks rescan while loading", async () => {
  const refreshDeferred = createDeferred<{
    scannedFiles: number;
    indexedSessions: number;
    failedFiles: number;
    claudeProjectPaths?: string[];
  }>();
  const callOrder: string[] = [];
  const loadSettings = vi.fn(async () => {
    callOrder.push("load_settings");
  });

  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_runtime_workspace") {
      callOrder.push("get_runtime_workspace");
      return "D:\\Works\\ai-session";
    }
    if (cmd === "refresh_sessions") {
      callOrder.push("refresh_sessions");
      return refreshDeferred.promise;
    }
    return null;
  });

  const { result, rerender } = renderHook(
    (props: { settingsReady: boolean; loadSettings: () => Promise<void> }) => useAppShellBootstrap(props),
    {
      initialProps: {
        settingsReady: false,
        loadSettings,
      },
    },
  );

  expect(result.current.scanVersion).toBe(-1);
  expect(result.current.bootstrapState).toBe("loading");

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_runtime_workspace");
    expect(loadSettings).toHaveBeenCalledTimes(1);
  });
  expect(callOrder).toEqual(["get_runtime_workspace", "load_settings"]);

  act(() => {
    result.current.onRescan();
  });
  expect(invokeMock.mock.calls.filter((call) => call[0] === "refresh_sessions")).toHaveLength(0);

  rerender({
    settingsReady: true,
    loadSettings,
  });

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("refresh_sessions");
  });
  expect(callOrder).toEqual(["get_runtime_workspace", "load_settings", "refresh_sessions"]);
  expect(result.current.bootstrapState).toBe("ready");
  expect(result.current.scanInFlight).toBe(true);

  act(() => {
    result.current.onRescan();
  });
  expect(invokeMock.mock.calls.filter((call) => call[0] === "refresh_sessions")).toHaveLength(1);

  await act(async () => {
    refreshDeferred.resolve({
      scannedFiles: 1,
      indexedSessions: 1,
      failedFiles: 0,
      claudeProjectPaths: ["D:\\Works\\claude-project"],
    });
  });

  await waitFor(() => {
    expect(result.current.bootstrapState).toBe("ready");
    expect(result.current.scanVersion).toBe(0);
    expect(result.current.claudeProjectPaths).toEqual(["D:\\Works\\claude-project"]);
  });
  expect(result.current.scanInFlight).toBe(true);
  expect(result.current.scanErrorMessage).toBeNull();
  expect(result.current.lastScanSummary).toMatchObject({
    scannedFiles: 1,
    indexedSessions: 1,
    failedFiles: 0,
  });

  await waitFor(
    () => {
      expect(result.current.scanInFlight).toBe(false);
    },
    { timeout: 1500 },
  );
});

it("surfaces readable scan error state and allows retry after a failed refresh", async () => {
  const loadSettings = vi.fn(async () => {});
  let refreshCallCount = 0;

  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "refresh_sessions") {
      refreshCallCount += 1;
      if (refreshCallCount === 1) {
        throw new Error("scan root missing");
      }
      return {
        scannedFiles: 2,
        indexedSessions: 1,
        failedFiles: 1,
        failedFileDetails: [
          {
            sourceTool: "claude",
            sourcePath: "D:\\broken\\retry.jsonl",
            message: "invalid session_id: missing or empty",
          },
        ],
      };
    }
    return null;
  });

  const { result, rerender } = renderHook(
    (props: { settingsReady: boolean; loadSettings: () => Promise<void> }) => useAppShellBootstrap(props),
    {
      initialProps: {
        settingsReady: false,
        loadSettings,
      },
    },
  );

  await waitFor(() => {
    expect(loadSettings).toHaveBeenCalledTimes(1);
  });

  rerender({
    settingsReady: true,
    loadSettings,
  });

  await waitFor(() => {
    expect(result.current.bootstrapState).toBe("error");
  });
  expect(result.current.scanErrorMessage).toBe("扫描本地会话失败：scan root missing");
  expect(result.current.lastScanSummary).toBeNull();

  await waitFor(
    () => {
      expect(result.current.scanInFlight).toBe(false);
    },
    { timeout: 1500 },
  );

  act(() => {
    result.current.onRescan();
  });

  await waitFor(() => {
    expect(result.current.bootstrapState).toBe("ready");
    expect(result.current.scanVersion).toBe(0);
    expect(result.current.scanFailedFiles).toBe(1);
  });
  expect(result.current.scanInFlight).toBe(true);
  expect(result.current.lastScanSummary).toMatchObject({
    scannedFiles: 2,
    indexedSessions: 1,
    failedFiles: 1,
    failedFileDetails: [
      {
        sourceTool: "claude",
        sourcePath: "D:\\broken\\retry.jsonl",
        message: "invalid session_id: missing or empty",
      },
    ],
  });

  await waitFor(
    () => {
      expect(result.current.scanInFlight).toBe(false);
    },
    { timeout: 1500 },
  );
});

it("filters ignored failed files out of scan counts and detail visibility", async () => {
  const loadSettings = vi.fn(async () => {});

  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "refresh_sessions") {
      return {
        scannedFiles: 2,
        indexedSessions: 0,
        failedFiles: 2,
        failedFileDetails: [
          {
            sourceTool: "claude",
            sourcePath: "D:\\broken\\one.jsonl",
            message: "invalid session_id: missing or empty",
          },
          {
            sourceTool: "gemini",
            sourcePath: "D:\\broken\\two.jsonl",
            message: "invalid message envelope",
          },
        ],
      };
    }
    return null;
  });

  const { result, rerender } = renderHook(
    (props: { settingsReady: boolean; loadSettings: () => Promise<void> }) => useAppShellBootstrap(props),
    {
      initialProps: {
        settingsReady: false,
        loadSettings,
      },
    },
  );

  await waitFor(() => {
    expect(loadSettings).toHaveBeenCalledTimes(1);
  });

  rerender({
    settingsReady: true,
    loadSettings,
  });

  await waitFor(() => {
    expect(result.current.scanFailedFiles).toBe(2);
    expect(result.current.visibleFailedFileDetails).toHaveLength(2);
  });

  act(() => {
    result.current.ignoreFailedFile({
      sourceTool: "claude",
      sourcePath: "D:\\broken\\one.jsonl",
      message: "invalid session_id: missing or empty",
    });
  });

  await waitFor(() => {
    expect(result.current.scanFailedFiles).toBe(1);
    expect(result.current.scanErrorMessage).toBeNull();
    expect(result.current.visibleFailedFileDetails).toHaveLength(1);
    expect(result.current.ignoredFailedFileDetails).toHaveLength(1);
  });

  act(() => {
    result.current.ignoreFailedFile({
      sourceTool: "gemini",
      sourcePath: "D:\\broken\\two.jsonl",
      message: "invalid message envelope",
    });
  });

  await waitFor(() => {
    expect(result.current.scanFailedFiles).toBe(0);
    expect(result.current.scanErrorMessage).toBeNull();
    expect(result.current.visibleFailedFileDetails).toHaveLength(0);
    expect(result.current.ignoredFailedFileDetails).toHaveLength(2);
  });
});
