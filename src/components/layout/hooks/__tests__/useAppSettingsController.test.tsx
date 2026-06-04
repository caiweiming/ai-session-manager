import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { invokeMock } from "../../../../test/mockTauriInvoke";
import { useAppSettingsController } from "../useAppSettingsController";

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

it("loads settings on demand and persists partial patches", async () => {
  const { result } = renderHook(() => useAppSettingsController());

  expect(result.current.settingsReady).toBe(false);
  expect(result.current.appSettings).toMatchObject({
    themeMode: "system",
    hardDelete: false,
    terminalPreference: "auto",
    scanSources: {
      codex: true,
      claude: true,
      gemini: true,
    },
  });

  await act(async () => {
    await result.current.loadSettings();
  });

  await waitFor(() => {
    expect(result.current.settingsReady).toBe(true);
  });
  expect(invokeMock).toHaveBeenCalledWith("get_app_settings");
  expect(invokeMock).toHaveBeenCalledWith("get_platform_capabilities");

  await act(async () => {
    await result.current.patchAppSettings({
      hardDelete: true,
      terminalPreference: "cmd",
      scanSources: {
        codex: true,
        claude: true,
        gemini: false,
      },
    });
  });

  expect(invokeMock).toHaveBeenCalledWith("update_app_settings", {
    payload: {
      hardDelete: true,
      terminalPreference: "cmd",
      scanSources: {
        codex: true,
        claude: true,
        gemini: false,
      },
    },
  });
  expect(result.current.appSettings).toMatchObject({
    themeMode: "system",
    hardDelete: true,
    terminalPreference: "cmd",
    scanSources: {
      codex: true,
      claude: true,
      gemini: false,
    },
  });
});

it("keeps the latest settings when an older load request resolves later", async () => {
  const firstLoad = createDeferred<{
    themeMode: "light";
    hardDelete: false;
    terminalPreference: "auto";
    scanSources: { codex: true; claude: true; gemini: true };
  }>();
  const secondLoad = createDeferred<{
    themeMode: "dark";
    hardDelete: true;
    terminalPreference: "cmd";
    scanSources: { codex: false; claude: true; gemini: true };
  }>();

  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_app_settings") {
      if (firstLoad.promise) {
        const promise = firstLoad.promise;
        // @ts-expect-error 仅测试中置空，确保第二次命中不同 deferred。
        firstLoad.promise = null;
        return promise;
      }
      return secondLoad.promise;
    }
    return null;
  });

  const { result } = renderHook(() => useAppSettingsController());

  await act(async () => {
    void result.current.loadSettings();
    void result.current.loadSettings();
  });

  await act(async () => {
    secondLoad.resolve({
      themeMode: "dark",
      hardDelete: true,
      terminalPreference: "cmd",
      scanSources: {
        codex: false,
        claude: true,
        gemini: true,
      },
    });
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(result.current.appSettings).toMatchObject({
      themeMode: "dark",
      hardDelete: true,
      terminalPreference: "cmd",
      scanSources: {
        codex: false,
        claude: true,
        gemini: true,
      },
    });
    expect(result.current.settingsReady).toBe(true);
  });

  await act(async () => {
    firstLoad.resolve({
      themeMode: "light",
      hardDelete: false,
      terminalPreference: "auto",
      scanSources: {
        codex: true,
        claude: true,
        gemini: true,
      },
    });
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(result.current.appSettings).toMatchObject({
      themeMode: "dark",
      hardDelete: true,
      terminalPreference: "cmd",
      scanSources: {
        codex: false,
        claude: true,
        gemini: true,
      },
    });
  });
});

it("marks settings as ready and keeps defaults when loading fails", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_app_settings") {
      throw new Error("load failed");
    }
    return null;
  });

  const { result } = renderHook(() => useAppSettingsController());

  await act(async () => {
    await result.current.loadSettings();
  });

  await waitFor(() => {
    expect(result.current.settingsReady).toBe(true);
  });
  expect(result.current.appSettings).toMatchObject({
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

it("keeps loaded app settings when platform capabilities loading fails", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_app_settings") {
      return {
        themeMode: "dark",
        hardDelete: true,
        terminalPreference: "cmd",
        scanSources: {
          codex: true,
          claude: false,
          gemini: true,
        },
      };
    }
    if (cmd === "get_platform_capabilities") {
      throw new Error("capabilities failed");
    }
    return null;
  });

  const { result } = renderHook(() => useAppSettingsController());

  await act(async () => {
    await result.current.loadSettings();
  });

  await waitFor(() => {
    expect(result.current.settingsReady).toBe(true);
  });
  expect(result.current.appSettings).toMatchObject({
    themeMode: "dark",
    hardDelete: true,
    terminalPreference: "cmd",
    scanSources: {
      codex: true,
      claude: false,
      gemini: true,
    },
  });
});

it("keeps loaded platform capabilities when app settings loading fails", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_app_settings") {
      throw new Error("settings failed");
    }
    if (cmd === "get_platform_capabilities") {
      return {
        os: "macos",
        terminalOptions: [
          { id: "auto", label: "自动（推荐）" },
          { id: "terminal", label: "Terminal.app" },
        ],
        supportsRevealPath: true,
        supportsResumeInTerminal: true,
        revealPathDegradesToOpenParent: false,
      };
    }
    return null;
  });

  const { result } = renderHook(() => useAppSettingsController());

  await act(async () => {
    await result.current.loadSettings();
  });

  await waitFor(() => {
    expect(result.current.settingsReady).toBe(true);
  });
  expect(result.current.appSettings).toMatchObject({
    themeMode: "system",
    hardDelete: false,
    terminalPreference: "auto",
    scanSources: {
      codex: true,
      claude: true,
      gemini: true,
    },
  });
  expect(result.current.platformCapabilities).toMatchObject({
    os: "macos",
    terminalOptions: [
      { id: "auto", label: "自动（推荐）" },
      { id: "terminal", label: "Terminal.app" },
    ],
    supportsResumeInTerminal: true,
  });
});

it("normalizes stale terminal preference against current platform capabilities", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_app_settings") {
      return {
        themeMode: "dark",
        hardDelete: true,
        terminalPreference: "windows_terminal",
        scanSources: {
          codex: true,
          claude: false,
          gemini: true,
        },
      };
    }
    if (cmd === "get_platform_capabilities") {
      return {
        os: "macos",
        terminalOptions: [
          { id: "auto", label: "自动（推荐）" },
          { id: "terminal", label: "Terminal.app" },
        ],
        supportsRevealPath: true,
        supportsResumeInTerminal: true,
        revealPathDegradesToOpenParent: false,
      };
    }
    return null;
  });

  const { result } = renderHook(() => useAppSettingsController());

  await act(async () => {
    await result.current.loadSettings();
  });

  await waitFor(() => {
    expect(result.current.settingsReady).toBe(true);
  });
  expect(result.current.appSettings).toMatchObject({
    themeMode: "dark",
    hardDelete: true,
    terminalPreference: "auto",
    scanSources: {
      codex: true,
      claude: false,
      gemini: true,
    },
  });
  expect(result.current.platformCapabilities).toMatchObject({
    os: "macos",
    terminalOptions: [
      { id: "auto", label: "自动（推荐）" },
      { id: "terminal", label: "Terminal.app" },
    ],
  });
});

it("keeps optimistic settings when persisting a patch fails", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "update_app_settings") {
      throw new Error("persist failed");
    }
    if (cmd === "get_app_settings") {
      return {
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
        scanSources: {
          codex: true,
          claude: true,
          gemini: true,
        },
      };
    }
    return null;
  });

  const { result } = renderHook(() => useAppSettingsController());

  await act(async () => {
    await result.current.patchAppSettings({
      hardDelete: true,
      terminalPreference: "cmd",
      scanSources: {
        codex: false,
        claude: true,
        gemini: false,
      },
    });
  });

  expect(result.current.appSettings).toMatchObject({
    themeMode: "system",
    hardDelete: true,
    terminalPreference: "cmd",
    scanSources: {
      codex: false,
      claude: true,
      gemini: false,
    },
  });
});
