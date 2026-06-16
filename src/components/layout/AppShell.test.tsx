import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { api } from "../../lib/tauriClient";
import { defaultAppVersion } from "../../test/tauriFixtures";

const invokeMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());
const originalFetch = global.fetch;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

const defaultRows = [
  {
    sourceTool: "codex",
    sourceId: "alpha-id",
    title: "真实会话 Alpha：排查 S3 签名失效",
    workspacePath: "D:\\Works\\huobao-novel-main",
    sourcePath: "D:\\QA\\workspace-alpha\\history\\alpha.jsonl",
    createdAt: "2026-04-21T09:00:00Z",
    updatedAt: "2026-04-21T10:00:00Z",
  },
  {
    sourceTool: "codex",
    sourceId: "beta-id",
    title: "真实会话 Beta：迁移旧日志索引",
    workspacePath: "D:\\Works\\ops-console",
    sourcePath: "E:\\Prod\\workspace-beta\\logs\\beta.jsonl",
    createdAt: "2026-04-22T08:00:00Z",
    updatedAt: "2026-04-22T09:30:00Z",
  },
];

let listRowsQueue: typeof defaultRows[];
type FailedFileDetail = {
  sourceTool: string;
  sourcePath: string;
  message: string;
};

type FailedFilesScenarioOptions = {
  failedFileDetails: FailedFileDetail[];
  scannedFiles?: number;
  indexedSessions?: number;
  platformCapabilities?: Partial<{
    os: string;
    terminalOptions: Array<{ id: string; label: string }>;
    supportsRevealPath: boolean;
    supportsResumeInTerminal: boolean;
    revealPathDegradesToOpenParent: boolean;
  }>;
  commandHandlers?: Record<
    string,
    (args?: { payload?: Record<string, unknown> }) => unknown | Promise<unknown>
  >;
};

type FailedFileAction =
  | "copy-failed-file-path"
  | "reveal-failed-file"
  | "ignore-failed-file"
  | "unignore-failed-file";

const getCommandCallCount = (commandName: string) => {
  return invokeMock.mock.calls.filter((call) => call[0] === commandName).length;
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const expandAllGroups = async () => {
  await waitFor(() => {
    expect(screen.queryAllByLabelText(/^toggle-group-/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("group-expand-toggle")).toBeEnabled();
  });
  const button = screen.getByLabelText("group-expand-toggle") as HTMLButtonElement;
  if (!button.disabled && button.textContent?.includes("全部展开")) {
    fireEvent.click(button);
  }
};

const clickElement = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

const waitForScanIdle = async () => {
  await waitFor(() => {
    expect(screen.queryByTestId("main-scan-status")).not.toBeInTheDocument();
  });
};

const waitForFailedFileCount = async (count: number) => {
  await waitFor(() => {
    expect(screen.getByLabelText("open-scan-failures-drawer")).toHaveTextContent(String(count));
  });
};

const waitForFailedFilesReady = async (count: number) => {
  await waitForFailedFileCount(count);
  await waitForScanIdle();
};

const openFailedFilesDrawer = async () => {
  const drawerButton = await screen.findByLabelText("open-scan-failures-drawer");
  await clickElement(drawerButton);
  return drawerButton;
};

const closeFailedFilesDrawer = async () => {
  await clickElement(screen.getByLabelText("close-scan-failures-panel"));
};

const findFailedFileActionButton = (action: FailedFileAction, sourcePath: string) => {
  return screen.findByLabelText(`${action}-${sourcePath}`);
};

const getIgnoredFilesToggle = (count: number) => {
  return screen.getByRole("button", { name: `已忽略 ${count} 个文件` });
};

const findIgnoredFilesToggle = (count: number) => {
  return screen.findByRole("button", { name: `已忽略 ${count} 个文件` });
};

const createFailedFileDetail = (
  sourceTool: string,
  sourcePath: string,
  message: string,
): FailedFileDetail => ({
  sourceTool,
  sourcePath,
  message,
});

const setupFailedFilesScenario = ({
  failedFileDetails,
  scannedFiles = failedFileDetails.length,
  indexedSessions = 0,
  platformCapabilities,
  commandHandlers,
}: FailedFilesScenarioOptions) => {
  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: Record<string, unknown> }) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "get_app_version") {
      return defaultAppVersion;
    }
    if (cmd === "get_app_settings") {
      return {
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
      };
    }
    if (cmd === "get_platform_capabilities") {
      return {
        os: "windows",
        terminalOptions: [{ id: "auto", label: "自动（推荐）" }],
        supportsRevealPath: true,
        supportsResumeInTerminal: true,
        revealPathDegradesToOpenParent: false,
        ...platformCapabilities,
      };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 1,
        totalSessions: 0,
        activeSessions7d: 0,
        trashSessions: 0,
        totalSizeBytes: 0,
        toolStats: [],
      };
    }
    if (cmd === "refresh_sessions") {
      return {
        scannedFiles,
        indexedSessions,
        failedFiles: failedFileDetails.length,
        failedFileDetails,
      };
    }
    if (cmd === "list_sessions" || cmd === "list_trash_sessions") {
      return { rows: [] };
    }
    if (cmd === "get_session_detail") {
      return { detail: null };
    }
    if (cmd === "list_subagent_sessions") {
      return { rows: [] };
    }
    const customHandler = commandHandlers?.[cmd];
    if (customHandler) {
      return customHandler(args);
    }
    return null;
  });
};

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset();
  listRowsQueue = [defaultRows];
  window.localStorage.clear();
  global.fetch = originalFetch;

  listenMock.mockResolvedValue(() => {});

  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string; includeSubagent?: boolean; messageLimit?: number } }) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "get_app_version") {
      return defaultAppVersion;
    }
    if (cmd === "get_app_settings") {
      return {
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
      };
    }
    if (cmd === "get_platform_capabilities") {
      return {
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
    }
    if (cmd === "update_app_settings") {
      const payload = args?.payload as
        | {
            themeMode?: "light" | "dark" | "system";
            hardDelete?: boolean;
            terminalPreference?: string;
          }
        | undefined;
      return {
        themeMode: payload?.themeMode ?? "system",
        hardDelete: payload?.hardDelete ?? false,
        terminalPreference: payload?.terminalPreference ?? "auto",
      };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 2,
        totalSessions: 2,
        activeSessions7d: 2,
        trashSessions: 0,
        totalSizeBytes: 4096,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 4096 }],
      };
    }
    if (cmd === "refresh_sessions") {
      return {
        scannedFiles: 1,
        indexedSessions: 1,
        failedFiles: 0,
      };
    }
    if (cmd === "list_sessions") {
      const rows = listRowsQueue.length > 1 ? (listRowsQueue.shift() ?? []) : (listRowsQueue[0] ?? []);
      return { rows };
    }
    if (cmd === "list_trash_sessions") {
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: "trash-id",
            title: "回收站会话",
            workspacePath: "D:\\Works\\huobao-novel-main",
            sourcePath: "D:\\QA\\workspace-alpha\\history\\trash.jsonl",
            createdAt: "2026-04-10T09:00:00Z",
            updatedAt: "2026-04-10T10:00:00Z",
          },
        ],
      };
    }
    if (cmd === "get_session_detail") {
      const sourceTool = args?.payload?.sourceTool ?? "codex";
      const sourceId = args?.payload?.sourceId ?? "alpha-id";
      const isSubagent = args?.payload?.includeSubagent === true;
      return {
        detail: {
          sourceTool,
          sourceId,
          title: isSubagent ? "子代理会话详情" : "S3 签名问题定位",
          workspacePath: "D:\\Works\\huobao-novel-main",
          sourcePath: isSubagent ? "D:\\QA\\workspace-alpha\\history\\sub-1.jsonl" : "D:\\QA\\workspace-alpha\\history\\alpha.jsonl",
          createdAt: "2026-04-21T09:00:00Z",
          updatedAt: "2026-04-21T10:00:00Z",
          messages: [
            {
              role: "assistant",
              content: isSubagent ? "子代理返回：已完成子任务分析。" : "assistant 返回：建议统一签名算法版本。",
              createdAt: "2026-04-21 10:00:02",
            },
          ],
        },
      };
    }
    if (cmd === "list_subagent_sessions") {
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: "sub-session-1",
            title: "子代理会话 #1",
            workspacePath: "D:\\Works\\huobao-novel-main",
            sourcePath: "D:\\QA\\workspace-alpha\\history\\sub-1.jsonl",
            createdAt: "2026-04-21T10:00:20Z",
            updatedAt: "2026-04-21T10:01:00Z",
          },
        ],
      };
    }
    if (cmd === "delete_session") {
      return { deletedSessions: 2, deletedSourceFiles: 2, warnings: [] };
    }
    if (cmd === "restore_session") {
      return { restoredSessions: 2 };
    }
    if (cmd === "clear_trash") {
      return { deletedSessions: 3, deletedSourceFiles: 3, warnings: [] };
    }
    if (cmd === "export_session_markdown") {
      return { path: "D:\\Works\\huobao-novel-main\\alpha-id.md", canceled: false };
    }
    if (cmd === "open_resume_in_terminal") {
      return null;
    }
    return null;
  });
});

afterEach(() => {
  global.fetch = originalFetch;
});

it("places app version under the brand title next to the logo", async () => {
  await act(async () => {
    render(<AppShell />);
  });

  const brand = document.querySelector(".brand") as HTMLElement;
  const brandText = within(brand).getByText("AI 会话管理");
  const brandMeta = brandText.closest(".brand-meta");

  expect(brandMeta).not.toBeNull();
  expect(brandMeta).toContainElement(screen.getByLabelText("app-update-entry"));
});

it("startup triggers refresh_sessions", async () => {
  render(<AppShell />);

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("refresh_sessions");
    expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
      payload: { page: 1, pageSize: 1000 },
    });
  });
  expect(screen.queryByText("真实会话 Alpha：排查 S3 签名失效")).not.toBeInTheDocument();
  await expandAllGroups();
  expect(await screen.findByText("真实会话 Alpha：排查 S3 签名失效")).toBeInTheDocument();
  expect(screen.getByText("真实会话 Beta：迁移旧日志索引")).toBeInTheDocument();
  expect(screen.getByLabelText("select-row-codex:alpha-id")).toBeInTheDocument();
  expect(screen.getByLabelText("select-row-codex:beta-id")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "创建时间" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "更新时间" })).toBeInTheDocument();
  expect(screen.getAllByText("2026-04-21T09:00:00Z").length).toBeGreaterThan(0);
  expect(screen.getAllByText("2026-04-21T10:00:00Z").length).toBeGreaterThan(0);
  const refreshIndex = invokeMock.mock.calls.findIndex((call) => call[0] === "refresh_sessions");
  const listIndex = invokeMock.mock.calls.findIndex((call) => call[0] === "list_sessions");
  expect(refreshIndex).toBeGreaterThanOrEqual(0);
  expect(listIndex).toBeGreaterThanOrEqual(0);
});

it("startup keeps runtime -> settings before refresh, overview, and list", async () => {
  render(<AppShell />);

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_runtime_workspace");
    expect(invokeMock).toHaveBeenCalledWith("get_app_settings");
    expect(invokeMock).toHaveBeenCalledWith("refresh_sessions");
    expect(invokeMock).toHaveBeenCalledWith("get_overview_summary");
    expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
      payload: { page: 1, pageSize: 1000 },
    });
  });

  const runtimeIndex = invokeMock.mock.calls.findIndex((call) => call[0] === "get_runtime_workspace");
  const settingsIndex = invokeMock.mock.calls.findIndex((call) => call[0] === "get_app_settings");
  const refreshIndex = invokeMock.mock.calls.findIndex((call) => call[0] === "refresh_sessions");
  const overviewIndex = invokeMock.mock.calls.findIndex((call) => call[0] === "get_overview_summary");
  const listIndex = invokeMock.mock.calls.findIndex((call) => call[0] === "list_sessions");

  expect(runtimeIndex).toBeGreaterThanOrEqual(0);
  expect(settingsIndex).toBeGreaterThanOrEqual(0);
  expect(refreshIndex).toBeGreaterThan(runtimeIndex);
  expect(refreshIndex).toBeGreaterThan(settingsIndex);
  expect(overviewIndex).toBeGreaterThan(settingsIndex);
  expect(listIndex).toBeGreaterThan(settingsIndex);
});

it("does not render inline subagent expand controls in the overview table", async () => {
  render(<AppShell />);

  await expandAllGroups();
  expect(screen.queryByText("子代理会话 #1")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("toggle-subagents-codex:alpha-id")).not.toBeInTheDocument();
  expect(getCommandCallCount("list_subagent_sessions")).toBe(0);
});

it("shows sticky group summary while scrolling within the overview table", async () => {
  render(<AppShell />);

  await expandAllGroups();
  const viewport = screen.getByTestId("session-table-viewport");
  fireEvent.scroll(viewport, { target: { scrollTop: 60 } });

  const stickyGroup = await screen.findByTestId("session-table-sticky-group");
  expect(stickyGroup).toHaveTextContent("D:\\Works\\huobao-novel-main");
  expect(stickyGroup).toHaveTextContent("1 个会话");
});

it("renders the overview table inside a constrained flex container", async () => {
  render(<AppShell />);

  await expandAllGroups();

  const tableContainer = document.querySelector(".table-container");
  const tableWrap = document.querySelector(".session-table-wrap");
  const viewport = screen.getByTestId("session-table-viewport");

  expect(tableContainer).not.toBeNull();
  expect(tableWrap).not.toBeNull();
  expect((tableContainer as HTMLElement).classList.contains("table-container")).toBe(true);
  expect((tableWrap as HTMLElement).classList.contains("session-table-wrap")).toBe(true);
  expect(viewport).toBeInTheDocument();
});

it("switches sticky group after scrolling into the next overview directory group", async () => {
  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string; includeSubagent?: boolean; messageLimit?: number; parentSourceId?: string } }) => {
    if (cmd === "get_runtime_workspace") return "D:\\Works\\ai-session";
    if (cmd === "get_app_settings") {
      return { themeMode: "system", hardDelete: false, terminalPreference: "auto" };
    }
    if (cmd === "get_platform_capabilities") {
      return {
        os: "windows",
        terminalOptions: [
          { id: "auto", label: "自动（推荐）" },
          { id: "windows_terminal", label: "Windows Terminal" },
        ],
        supportsRevealPath: true,
        supportsResumeInTerminal: true,
        revealPathDegradesToOpenParent: false,
      };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 1,
        totalSessions: 2,
        activeSessions7d: 2,
        trashSessions: 0,
        totalSizeBytes: 4096,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 4096 }],
      };
    }
    if (cmd === "refresh_sessions") return { scannedFiles: 1, indexedSessions: 1, failedFiles: 0 };
    if (cmd === "list_sessions") return { rows: defaultRows };
    if (cmd === "list_subagent_sessions") {
      if (args?.payload?.parentSourceId === "alpha-id") {
        return {
          rows: Array.from({ length: 4 }, (_, index) => ({
            sourceTool: "codex",
            sourceId: `alpha-sub-${index + 1}`,
            title: `Alpha 子会话 ${index + 1}`,
            workspacePath: "D:\\Works\\huobao-novel-main",
            sourcePath: `D:\\QA\\workspace-alpha\\history\\sub-${index + 1}.jsonl`,
            createdAt: "2026-04-21T10:00:20Z",
            updatedAt: "2026-04-21T10:01:00Z",
          })),
        };
      }
      if (args?.payload?.parentSourceId === "beta-id") {
        return {
          rows: Array.from({ length: 4 }, (_, index) => ({
            sourceTool: "codex",
            sourceId: `beta-sub-${index + 1}`,
            title: `Beta 子会话 ${index + 1}`,
            workspacePath: "D:\\Works\\ops-console",
            sourcePath: `E:\\Prod\\workspace-beta\\logs\\sub-${index + 1}.jsonl`,
            createdAt: "2026-04-22T10:00:20Z",
            updatedAt: "2026-04-22T10:01:00Z",
          })),
        };
      }
      return { rows: [] };
    }
    if (cmd === "get_session_detail") {
      const sourceTool = args?.payload?.sourceTool ?? "codex";
      const sourceId = args?.payload?.sourceId ?? "alpha-id";
      return {
        detail: {
          sourceTool,
          sourceId,
          title: sourceId === "beta-id" ? "Beta 详情" : "Alpha 详情",
          workspacePath: "D:\\Works\\huobao-novel-main",
          sourcePath: "D:\\QA\\workspace-alpha\\history\\alpha.jsonl",
          createdAt: "2026-04-21T09:00:00Z",
          updatedAt: "2026-04-21T10:00:00Z",
          messages: [],
        },
      };
    }
    return null;
  });

  render(<AppShell />);

  await expandAllGroups();
  const viewport = screen.getByTestId("session-table-viewport");

  fireEvent.scroll(viewport, { target: { scrollTop: 60 } });
  expect(await screen.findByTestId("session-table-sticky-group")).toHaveTextContent("D:\\Works\\huobao-novel-main");

  fireEvent.scroll(viewport, { target: { scrollTop: 160 } });
  expect(await screen.findByTestId("session-table-sticky-group")).toHaveTextContent("D:\\Works\\ops-console");
});

it("clicking rescan-local-data triggers refresh_sessions again", async () => {
  listRowsQueue = [
    [
      {
        sourceTool: "codex",
        sourceId: "first",
        title: "首次扫描结果",
        sourcePath: "D:\\scan\\first.jsonl",
        createdAt: "2026-04-20T08:00:00Z",
        updatedAt: "2026-04-20T09:00:00Z",
      },
    ],
    [
      {
        sourceTool: "codex",
        sourceId: "second",
        title: "重扫后新结果",
        sourcePath: "F:\\scan\\second.jsonl",
        createdAt: "2026-04-24T08:00:00Z",
        updatedAt: "2026-04-24T09:00:00Z",
      },
    ],
  ];

  render(<AppShell />);

  await waitFor(() => {
    expect(getCommandCallCount("refresh_sessions")).toBe(1);
    expect(getCommandCallCount("list_sessions")).toBeGreaterThanOrEqual(1);
  });
  await expandAllGroups();
  expect(await screen.findByText("首次扫描结果")).toBeInTheDocument();
  await waitFor(
    () => {
      expect(screen.getByLabelText("rescan-local-data")).not.toBeDisabled();
    },
    { timeout: 1200 },
  );

  fireEvent.click(screen.getByLabelText("rescan-local-data"));

  await waitFor(() => {
    expect(getCommandCallCount("refresh_sessions")).toBe(2);
    expect(getCommandCallCount("list_sessions")).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText("rescan-local-data")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("rescan-local-data-icon")).toHaveClass("spinning");
  });
  await expandAllGroups();
  expect(await screen.findByText("重扫后新结果")).toBeInTheDocument();
  expect(screen.queryByText("首次扫描结果")).not.toBeInTheDocument();
});

it("shows readable scan failure inline and allows retry after startup refresh fails", async () => {
  let refreshCallCount = 0;

  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string; includeSubagent?: boolean; messageLimit?: number } }) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
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
    if (cmd === "get_platform_capabilities") {
      return {
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
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 1,
        totalSessions: 0,
        activeSessions7d: 0,
        trashSessions: 0,
        totalSizeBytes: 0,
        toolStats: [],
      };
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
      };
    }
    if (cmd === "list_sessions") {
      return {
        rows: refreshCallCount >= 2
          ? [
              {
                sourceTool: "codex",
                sourceId: "retry-success",
                title: "重试后扫描成功",
                sourcePath: "D:\\scan\\retry-success.jsonl",
                createdAt: "2026-04-24T08:00:00Z",
                updatedAt: "2026-04-24T09:00:00Z",
              },
            ]
          : [],
      };
    }
    if (cmd === "list_trash_sessions") {
      return { rows: [] };
    }
    if (cmd === "get_session_detail") {
      return { detail: null };
    }
    if (cmd === "list_subagent_sessions") {
      return { rows: [] };
    }
    return null;
  });

  render(<AppShell />);

  expect(await screen.findByTestId("main-area-scan-error")).toBeInTheDocument();
  expect(screen.getByText("扫描本地会话失败：scan root missing")).toBeInTheDocument();
  await waitFor(() => {
    expect(within(screen.getByTestId("main-area-scan-error")).getByRole("button")).toHaveTextContent("重新扫描");
  });
  const retryButton = within(screen.getByTestId("main-area-scan-error")).getByRole("button");
  expect(retryButton).toBeInTheDocument();

  fireEvent.click(retryButton);

  await waitFor(() => {
    expect(getCommandCallCount("refresh_sessions")).toBe(2);
  });
  await waitFor(() => {
    expect(screen.queryByTestId("main-area-scan-error")).not.toBeInTheDocument();
  });
  expect(screen.getByLabelText("open-scan-failures-drawer")).toHaveTextContent("1");
  await expandAllGroups();
  expect(await screen.findByText("重试后扫描成功")).toBeInTheDocument();
});

it("switches to the shared center scan status after clicking retry scan from the main area error state", async () => {
  let refreshCallCount = 0;
  const retryDeferred = createDeferred<{ scannedFiles: number; indexedSessions: number; failedFiles: number }>();

  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
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
    if (cmd === "get_platform_capabilities") {
      return {
        os: "windows",
        terminalOptions: [{ id: "auto", label: "自动（推荐）" }],
        supportsRevealPath: true,
        supportsResumeInTerminal: true,
        revealPathDegradesToOpenParent: false,
      };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 1,
        totalSessions: 0,
        activeSessions7d: 0,
        trashSessions: 0,
        totalSizeBytes: 0,
        toolStats: [],
      };
    }
    if (cmd === "refresh_sessions") {
      refreshCallCount += 1;
      if (refreshCallCount === 1) {
        throw new Error("scan root missing");
      }
      return retryDeferred.promise;
    }
    if (cmd === "list_sessions" || cmd === "list_trash_sessions") {
      return { rows: [] };
    }
    if (cmd === "get_session_detail") {
      return { detail: null };
    }
    if (cmd === "list_subagent_sessions") {
      return { rows: [] };
    }
    return null;
  });

  render(<AppShell />);

  expect(await screen.findByText("扫描本地会话失败：scan root missing")).toBeInTheDocument();

  fireEvent.click(within(screen.getByTestId("main-area-scan-error")).getByRole("button"));

  await waitFor(() => {
    expect(screen.getByTestId("main-scan-status")).toBeInTheDocument();
    expect(screen.getByText("数据扫描中")).toBeInTheDocument();
  });

  await act(async () => {
    retryDeferred.resolve({ scannedFiles: 2, indexedSessions: 1, failedFiles: 1 });
  });

  await waitFor(() => {
    expect(screen.queryByTestId("main-area-scan-error")).not.toBeInTheDocument();
  });
});

it("opens a failed file drawer from the sidebar metric and shows failed file details", async () => {
  setupFailedFilesScenario({
    failedFileDetails: [
      createFailedFileDetail(
        "claude",
        "D:\\broken\\claude-session.jsonl",
        "invalid session_id: missing or empty",
      ),
      createFailedFileDetail(
        "gemini",
        "D:\\broken\\gemini-session.jsonl",
        "invalid message envelope",
      ),
    ],
    scannedFiles: 3,
    indexedSessions: 2,
  });

  render(<AppShell />);

  await waitFor(() => {
    expect(screen.getByLabelText("open-scan-failures-drawer")).toHaveTextContent("2");
  });

  await openFailedFilesDrawer();

  const panel = await screen.findByTestId("scan-failures-panel");
  expect(panel).toBeInTheDocument();
  expect(await findFailedFileActionButton("copy-failed-file-path", "D:\\broken\\claude-session.jsonl")).toBeInTheDocument();
  expect(await findFailedFileActionButton("reveal-failed-file", "D:\\broken\\claude-session.jsonl")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重新扫描" })).toBeInTheDocument();
  expect(screen.getByText("D:\\broken\\claude-session.jsonl")).toBeInTheDocument();
  expect(screen.getByText("invalid session_id: missing or empty")).toBeInTheDocument();
  expect(screen.getByText("D:\\broken\\gemini-session.jsonl")).toBeInTheDocument();
  expect(screen.getByText("invalid message envelope")).toBeInTheDocument();
});

it("does not show a top banner for failed files and relies on the drawer entry instead", async () => {
  setupFailedFilesScenario({
    failedFileDetails: [
      createFailedFileDetail(
        "claude",
        "D:\\broken\\drawer-only.jsonl",
        "invalid session_id: missing or empty",
      ),
    ],
    scannedFiles: 2,
    indexedSessions: 1,
  });

  render(<AppShell />);

  expect(screen.queryByTestId("main-scan-banner")).not.toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByLabelText("open-scan-failures-drawer")).toHaveTextContent("1");
  });

  await openFailedFilesDrawer();
  expect(await screen.findByText("D:\\broken\\drawer-only.jsonl")).toBeInTheDocument();
});

it("reveals failed files from the drawer and falls back to opening the parent directory", async () => {
  let openInExplorerCallCount = 0;

  setupFailedFilesScenario({
    failedFileDetails: [
      createFailedFileDetail(
        "claude",
        "D:\\broken\\nested\\claude-session.jsonl",
        "invalid session_id: missing or empty",
      ),
    ],
    platformCapabilities: {
      revealPathDegradesToOpenParent: true,
    },
    commandHandlers: {
      open_in_explorer: () => {
        openInExplorerCallCount += 1;
        if (openInExplorerCallCount === 1) {
          throw new Error("reveal failed");
        }
        return null;
      },
    },
  });

  render(<AppShell />);

  await waitFor(() => {
    expect(screen.getByLabelText("open-scan-failures-drawer")).toHaveTextContent("1");
  });
  await openFailedFilesDrawer();

  const revealButton = await findFailedFileActionButton("reveal-failed-file", "D:\\broken\\nested\\claude-session.jsonl");
  fireEvent.click(revealButton);

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("open_in_explorer", {
      payload: {
        path: "D:\\broken\\nested\\claude-session.jsonl",
        reveal: true,
      },
    });
    expect(invokeMock).toHaveBeenCalledWith("open_in_explorer", {
      payload: {
        path: "D:\\broken\\nested",
        reveal: false,
      },
    });
  });
});

it("shows transient success feedback after copying a failed file path", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  setupFailedFilesScenario({
    failedFileDetails: [
      createFailedFileDetail(
        "claude",
        "D:\\broken\\claude-session.jsonl",
        "invalid session_id: missing or empty",
      ),
    ],
  });

  render(<AppShell />);

  await openFailedFilesDrawer();

  const copyButton = await findFailedFileActionButton("copy-failed-file-path", "D:\\broken\\claude-session.jsonl");
  fireEvent.click(copyButton);

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledWith("D:\\broken\\claude-session.jsonl");
  });
  expect(copyButton).toHaveClass("copied");
  expect(copyButton).toHaveAttribute("title", "已复制");
  await waitFor(() => {
    expect(copyButton).not.toHaveClass("copied");
    expect(copyButton).toHaveAttribute("title", "复制路径");
  }, { timeout: 2600 });
});

it("ignores failed files and updates count and drawer sections immediately", async () => {
  setupFailedFilesScenario({
    failedFileDetails: [
      createFailedFileDetail(
        "claude",
        "D:\\broken\\claude-session.jsonl",
        "invalid session_id: missing or empty",
      ),
      createFailedFileDetail(
        "gemini",
        "D:\\broken\\gemini-session.jsonl",
        "invalid message envelope",
      ),
    ],
    scannedFiles: 2,
  });

  render(<AppShell />);

  await waitForFailedFilesReady(2);
  await openFailedFilesDrawer();
  const firstIgnoreButton = await findFailedFileActionButton("ignore-failed-file", "D:\\broken\\claude-session.jsonl");
  await clickElement(firstIgnoreButton);
  await waitForFailedFilesReady(1);
  const ignoredSingleToggle = getIgnoredFilesToggle(1);
  expect(ignoredSingleToggle).toBeInTheDocument();
  await clickElement(ignoredSingleToggle);
  expect(screen.getByLabelText("unignore-failed-file-D:\\broken\\claude-session.jsonl")).toBeInTheDocument();
  const secondIgnoreButton = await findFailedFileActionButton("ignore-failed-file", "D:\\broken\\gemini-session.jsonl");
  await clickElement(secondIgnoreButton);
  await waitForFailedFileCount(0);
  expect(screen.getByText("当前待处理 0 个，已忽略 2 个")).toBeInTheDocument();
  expect(getIgnoredFilesToggle(2)).toBeInTheDocument();
});

it("persists ignored failed files across remounts and allows restoring them", async () => {
  setupFailedFilesScenario({
    failedFileDetails: [
      createFailedFileDetail(
        "claude",
        "D:\\broken\\persisted.jsonl",
        "invalid session_id: missing or empty",
      ),
    ],
  });

  const firstRender = render(<AppShell />);

  await waitForFailedFilesReady(1);
  await openFailedFilesDrawer();
  await clickElement(await findFailedFileActionButton("ignore-failed-file", "D:\\broken\\persisted.jsonl"));

  firstRender.unmount();
  render(<AppShell />);

  const drawerButton = screen.getByLabelText("open-scan-failures-drawer");
  await waitFor(() => {
    expect(drawerButton).not.toBeDisabled();
  });
  expect(drawerButton).toHaveTextContent("0");

  await clickElement(drawerButton);
  const ignoredPersistedToggle = await findIgnoredFilesToggle(1);
  await clickElement(ignoredPersistedToggle);
  await clickElement(screen.getByLabelText("unignore-failed-file-D:\\broken\\persisted.jsonl"));
  await waitForFailedFileCount(1);
});

it("restores all ignored failed files from one action", async () => {
  setupFailedFilesScenario({
    failedFileDetails: [
      createFailedFileDetail(
        "claude",
        "D:\\broken\\batch-one.jsonl",
        "invalid session_id: missing or empty",
      ),
      createFailedFileDetail(
        "gemini",
        "D:\\broken\\batch-two.jsonl",
        "invalid message envelope",
      ),
    ],
    scannedFiles: 2,
  });

  render(<AppShell />);

  await waitForFailedFilesReady(2);
  await openFailedFilesDrawer();
  const firstIgnoreButton = await findFailedFileActionButton("ignore-failed-file", "D:\\broken\\batch-one.jsonl");
  await clickElement(firstIgnoreButton);
  await waitForFailedFilesReady(1);
  const secondIgnoreButton = await findFailedFileActionButton("ignore-failed-file", "D:\\broken\\batch-two.jsonl");
  await clickElement(secondIgnoreButton);

  expect(await findIgnoredFilesToggle(2)).toBeInTheDocument();
  await clickElement(screen.getByRole("button", { name: "全部取消忽略" }));
  await waitForFailedFileCount(2);
  await waitFor(() => {
    expect(screen.queryByText("已忽略 2 个文件")).not.toBeInTheDocument();
  });
});

it("keeps ignored files collapsed by default and resets to collapsed after reopening the drawer", async () => {
  setupFailedFilesScenario({
    failedFileDetails: [
      createFailedFileDetail(
        "claude",
        "D:\\broken\\collapsed.jsonl",
        "invalid session_id: missing or empty",
      ),
    ],
  });

  render(<AppShell />);

  await waitForFailedFileCount(1);
  await openFailedFilesDrawer();
  fireEvent.click(await findFailedFileActionButton("ignore-failed-file", "D:\\broken\\collapsed.jsonl"));

  const collapseToggle = await findIgnoredFilesToggle(1);
  expect(screen.queryByLabelText("unignore-failed-file-D:\\broken\\collapsed.jsonl")).not.toBeInTheDocument();

  fireEvent.click(collapseToggle);
  expect(await screen.findByLabelText("unignore-failed-file-D:\\broken\\collapsed.jsonl")).toBeInTheDocument();

  await closeFailedFilesDrawer();
  await openFailedFilesDrawer();

  expect(await findIgnoredFilesToggle(1)).toBeInTheDocument();
  expect(screen.queryByLabelText("unignore-failed-file-D:\\broken\\collapsed.jsonl")).not.toBeInTheDocument();
});

it("changing date filter triggers reload with updatedWithinDays payload", async () => {
  listRowsQueue = [
    [
      {
        sourceTool: "codex",
        sourceId: "recent-30",
        title: "最近30天会话",
        sourcePath: "D:\\scan\\recent-30.jsonl",
        createdAt: "2026-04-20T08:00:00Z",
        updatedAt: "2026-04-20T09:00:00Z",
      },
    ],
    [
      {
        sourceTool: "codex",
        sourceId: "recent-7",
        title: "最近7天会话",
        sourcePath: "D:\\scan\\recent-7.jsonl",
        createdAt: "2026-04-25T08:00:00Z",
        updatedAt: "2026-04-25T09:00:00Z",
      },
    ],
  ];

  render(<AppShell />);

  await waitFor(() => {
    expect(getCommandCallCount("list_sessions")).toBeGreaterThanOrEqual(1);
  });
  await expandAllGroups();
  expect(await screen.findByText("最近30天会话")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("session-date-filter"));
  fireEvent.click(screen.getByRole("button", { name: "最近 7 天" }));

  await waitFor(() => {
    expect(getCommandCallCount("refresh_sessions")).toBe(1);
    expect(getCommandCallCount("list_sessions")).toBeGreaterThanOrEqual(2);
  });
  expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
    payload: { updatedWithinDays: 7, page: 1, pageSize: 1000 },
  });
  await expandAllGroups();
  expect(await screen.findByText("最近7天会话")).toBeInTheDocument();
  expect(screen.queryByText("最近30天会话")).not.toBeInTheDocument();
});

it("shows reset button only when list state leaves default and resets search, filters, sort, and view", async () => {
  render(<AppShell />);

  await waitFor(() => {
    expect(screen.getByLabelText("rescan-local-data")).not.toBeDisabled();
  });

  const resetButton = screen.getByRole("button", { name: "重置筛选" });
  expect(resetButton).toBeDisabled();

  fireEvent.change(screen.getByLabelText("session-search-input"), {
    target: { value: "排查" },
  });
  fireEvent.click(screen.getByLabelText("session-date-filter"));
  fireEvent.click(screen.getByRole("button", { name: "最近 7 天" }));
  fireEvent.click(screen.getByLabelText("session-sort-mode"));
  fireEvent.click(screen.getByRole("button", { name: "大小从小到大" }));
  fireEvent.click(screen.getByLabelText("switch-trash"));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "重置筛选" })).not.toBeDisabled();
  });

  fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "重置筛选" })).toBeDisabled();
    expect(screen.getByLabelText("session-search-input")).toHaveValue("");
    expect(screen.queryByText("回收站会话")).not.toBeInTheDocument();
    expect(screen.getByLabelText("session-date-filter")).toHaveTextContent("全部时间");
    expect(screen.getByLabelText("session-sort-mode")).toHaveTextContent("默认排序");
    expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
      payload: { page: 1, pageSize: 1000 },
    });
  });
});

it("uses one group toggle button that switches label with group expand state", async () => {
  render(<AppShell />);

  await waitFor(() => {
    expect(screen.queryAllByLabelText(/^toggle-group-/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("group-expand-toggle")).toBeEnabled();
  });

  const toggleButton = screen.getByLabelText("group-expand-toggle");
  expect(toggleButton).toHaveTextContent("全部展开");

  fireEvent.click(toggleButton);

  await waitFor(() => {
    expect(screen.getByLabelText("group-expand-toggle")).toHaveTextContent("全部折叠");
  });

  fireEvent.click(screen.getByLabelText("group-expand-toggle"));

  await waitFor(() => {
    expect(screen.getByLabelText("group-expand-toggle")).toHaveTextContent("全部展开");
  });

  expect(screen.queryByLabelText("expand-all-groups")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("collapse-all-groups")).not.toBeInTheDocument();
});

it("keeps expand-all in sync when filtered rows replace an already expanded list", async () => {
  const filteredRowsDeferred = createDeferred<{
    rows: Array<{
      sourceTool: string;
      sourceId: string;
      title: string;
      sourcePath: string;
      createdAt: string;
      updatedAt: string;
    }>;
  }>();
  let listCallCount = 0;

  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: { updatedWithinDays?: number } }) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "get_app_settings") {
      return {
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
      };
    }
    if (cmd === "get_platform_capabilities") {
      return {
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
    }
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
    if (cmd === "refresh_sessions") {
      return {
        scannedFiles: 1,
        indexedSessions: 1,
        failedFiles: 0,
      };
    }
    if (cmd === "list_sessions") {
      listCallCount += 1;
      if (args?.payload?.updatedWithinDays === 7) {
        return filteredRowsDeferred.promise;
      }
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: `recent-30-${listCallCount}`,
            title: "最近30天会话",
            sourcePath: "D:\\scan\\recent-30.jsonl",
            createdAt: "2026-04-20T08:00:00Z",
            updatedAt: "2026-04-20T09:00:00Z",
          },
        ],
      };
    }
    return null;
  });

  render(<AppShell />);

  await waitFor(() => {
    expect(getCommandCallCount("list_sessions")).toBeGreaterThanOrEqual(1);
  });
  await expandAllGroups();
  expect(await screen.findByText("最近30天会话")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("session-date-filter"));
  fireEvent.click(screen.getByRole("button", { name: "最近 7 天" }));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
      payload: { updatedWithinDays: 7, page: 1, pageSize: 1000 },
    });
  });

  await expandAllGroups();

  filteredRowsDeferred.resolve({
    rows: [
      {
        sourceTool: "codex",
        sourceId: "recent-7",
        title: "最近7天会话",
        sourcePath: "D:\\scan\\recent-7.jsonl",
        createdAt: "2026-04-25T08:00:00Z",
        updatedAt: "2026-04-25T09:00:00Z",
      },
    ],
  });

  expect(await screen.findByText("最近7天会话")).toBeInTheDocument();
});

it("changing keyword triggers list_sessions with keyword and does not refresh scan", async () => {
  listRowsQueue = [
    [
      {
        sourceTool: "codex",
        sourceId: "alpha-keyword",
        title: "排查支付超时",
        sourcePath: "D:\\scan\\alpha.jsonl",
        createdAt: "2026-04-20T08:00:00Z",
        updatedAt: "2026-04-20T09:00:00Z",
      },
      {
        sourceTool: "codex",
        sourceId: "beta-keyword",
        title: "迁移日志索引",
        sourcePath: "D:\\scan\\beta.jsonl",
        createdAt: "2026-04-22T08:00:00Z",
        updatedAt: "2026-04-22T09:00:00Z",
      },
    ],
    [
      {
        sourceTool: "codex",
        sourceId: "alpha-keyword",
        title: "排查支付超时",
        sourcePath: "D:\\scan\\filtered-alpha.jsonl",
        createdAt: "2026-04-20T08:00:00Z",
        updatedAt: "2026-04-20T09:00:00Z",
      },
    ],
  ];

  render(<AppShell />);

  await waitFor(() => {
    expect(getCommandCallCount("refresh_sessions")).toBe(1);
    expect(getCommandCallCount("list_sessions")).toBeGreaterThanOrEqual(1);
  });
  await expandAllGroups();
  expect(await screen.findByText("排查支付超时")).toBeInTheDocument();
  expect(screen.getByText("迁移日志索引")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("session-search-input"), {
    target: { value: "支付" },
  });

  await waitFor(() => {
    expect(getCommandCallCount("refresh_sessions")).toBe(1);
    expect(getCommandCallCount("list_sessions")).toBeGreaterThanOrEqual(2);
  });
  expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
    payload: { keyword: "支付", page: 1, pageSize: 1000 },
  });

  await expandAllGroups();
  expect(await screen.findByRole("button", { name: "排查支付超时" })).toBeInTheDocument();
  expect(screen.queryByText("迁移日志索引")).not.toBeInTheDocument();
});

it("inspector is hidden by default and can be toggled by session selection", async () => {
  render(<AppShell />);
  expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  expect(screen.getByTestId("main-area")).toBeInTheDocument();
  expect(screen.getByTestId("inspector")).toHaveClass("collapsed");

  await expandAllGroups();
  fireEvent.click(await screen.findByText("真实会话 Alpha：排查 S3 签名失效"));
  expect(screen.getByTestId("inspector")).toBeInTheDocument();
  expect(screen.getByTestId("inspector")).not.toHaveClass("collapsed");

  fireEvent.click(screen.getByLabelText("close-inspector-pane"));
  expect(screen.getByTestId("inspector")).toHaveClass("collapsed");
});

it("closes scan failures drawer when selecting a session to open inspector", async () => {
  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string; includeSubagent?: boolean; messageLimit?: number } }) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "get_app_settings") {
      return {
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
      };
    }
    if (cmd === "get_platform_capabilities") {
      return {
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
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 2,
        totalSessions: 2,
        activeSessions7d: 2,
        trashSessions: 0,
        totalSizeBytes: 4096,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 4096 }],
      };
    }
    if (cmd === "refresh_sessions") {
      return {
        scannedFiles: 2,
        indexedSessions: 2,
        failedFiles: 1,
        failedFileDetails: [
          createFailedFileDetail(
            "claude",
            "D:\\broken\\drawer-overlap.jsonl",
            "invalid session_id: missing or empty",
          ),
        ],
      };
    }
    if (cmd === "list_sessions") {
      return { rows: defaultRows };
    }
    if (cmd === "list_trash_sessions") {
      return { rows: [] };
    }
    if (cmd === "get_session_detail") {
      const sourceTool = args?.payload?.sourceTool ?? "codex";
      const sourceId = args?.payload?.sourceId ?? "alpha-id";
      return {
        detail: {
          sourceTool,
          sourceId,
          title: "S3 签名问题定位",
          workspacePath: "D:\\Works\\huobao-novel-main",
          sourcePath: "D:\\QA\\workspace-alpha\\history\\alpha.jsonl",
          createdAt: "2026-04-21T09:00:00Z",
          updatedAt: "2026-04-21T10:00:00Z",
          messages: [
            {
              role: "assistant",
              content: "assistant 返回：建议统一签名算法版本。",
              createdAt: "2026-04-21 10:00:02",
            },
          ],
        },
      };
    }
    if (cmd === "list_subagent_sessions") {
      return { rows: [] };
    }
    return null;
  });

  render(<AppShell />);

  await waitForFailedFilesReady(1);
  await openFailedFilesDrawer();
  expect(screen.getByTestId("scan-failures-panel")).not.toHaveClass("collapsed");

  await expandAllGroups();
  fireEvent.click(await screen.findByText("真实会话 Alpha：排查 S3 签名失效"));

  await waitFor(() => {
    expect(screen.getByTestId("inspector")).not.toHaveClass("collapsed");
    expect(screen.getByTestId("scan-failures-panel")).toHaveClass("collapsed");
  });
});

it("closes inspector when opening scan failures drawer", async () => {
  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string; includeSubagent?: boolean; messageLimit?: number } }) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "get_app_settings") {
      return {
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
      };
    }
    if (cmd === "get_platform_capabilities") {
      return {
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
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 2,
        totalSessions: 2,
        activeSessions7d: 2,
        trashSessions: 0,
        totalSizeBytes: 4096,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 4096 }],
      };
    }
    if (cmd === "refresh_sessions") {
      return {
        scannedFiles: 2,
        indexedSessions: 2,
        failedFiles: 1,
        failedFileDetails: [
          createFailedFileDetail(
            "claude",
            "D:\\broken\\drawer-overlap.jsonl",
            "invalid session_id: missing or empty",
          ),
        ],
      };
    }
    if (cmd === "list_sessions") {
      return { rows: defaultRows };
    }
    if (cmd === "list_trash_sessions") {
      return { rows: [] };
    }
    if (cmd === "get_session_detail") {
      const sourceTool = args?.payload?.sourceTool ?? "codex";
      const sourceId = args?.payload?.sourceId ?? "alpha-id";
      return {
        detail: {
          sourceTool,
          sourceId,
          title: "S3 签名问题定位",
          workspacePath: "D:\\Works\\huobao-novel-main",
          sourcePath: "D:\\QA\\workspace-alpha\\history\\alpha.jsonl",
          createdAt: "2026-04-21T09:00:00Z",
          updatedAt: "2026-04-21T10:00:00Z",
          messages: [
            {
              role: "assistant",
              content: "assistant 返回：建议统一签名算法版本。",
              createdAt: "2026-04-21 10:00:02",
            },
          ],
        },
      };
    }
    if (cmd === "list_subagent_sessions") {
      return { rows: [] };
    }
    return null;
  });

  render(<AppShell />);

  await expandAllGroups();
  fireEvent.click(await screen.findByText("真实会话 Alpha：排查 S3 签名失效"));

  await waitFor(() => {
    expect(screen.getByTestId("inspector")).not.toHaveClass("collapsed");
  });

  await waitForFailedFilesReady(1);
  fireEvent.click(screen.getByLabelText("open-scan-failures-drawer"));

  await waitFor(() => {
    expect(screen.getByTestId("scan-failures-panel")).not.toHaveClass("collapsed");
    expect(screen.getByTestId("inspector")).toHaveClass("collapsed");
  });
});

it("requests get_session_detail and opens conversation modal after selecting session", async () => {
  render(<AppShell />);

  await expandAllGroups();
  fireEvent.click(await screen.findByText("真实会话 Alpha：排查 S3 签名失效"));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: { sourceTool: "codex", sourceId: "alpha-id", includeSubagent: false, inTrash: false, messageLimit: 120 },
    });
  });
  expect(screen.getByText("对话记录")).toBeInTheDocument();
  expect(screen.getByLabelText("open-conversation-modal")).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByLabelText("open-conversation-modal")).not.toBeDisabled();
  });
  fireEvent.click(screen.getByLabelText("open-conversation-modal"));
  expect(await screen.findByTestId("conversation-modal")).toHaveClass("active");
  expect(screen.getByLabelText("close-conversation-modal")).toBeInTheDocument();
});

it("exports session markdown from inspector action", async () => {
  render(<AppShell />);

  await expandAllGroups();
  fireEvent.click(await screen.findByText("真实会话 Alpha：排查 S3 签名失效"));
  await screen.findByText("S3 签名问题定位");

  fireEvent.click(screen.getByRole("button", { name: "导出为 Markdown" }));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("export_session_markdown", {
      payload: { sourceTool: "codex", sourceId: "alpha-id", includeSubagent: false },
    });
  });
});

it("deletes from inspector with hardDelete enabled when switch is on", async () => {
  render(<AppShell />);

  await expandAllGroups();
  fireEvent.click(await screen.findByText("真实会话 Alpha：排查 S3 签名失效"));
  await screen.findByText("S3 签名问题定位");

  fireEvent.click(screen.getByLabelText("hard-delete-toggle"));
  fireEvent.click(await screen.findByRole("button", { name: "永久删除此记录" }));
  expect(await screen.findByTestId("inspector-hard-delete-confirm-modal")).toHaveClass("active");
  fireEvent.click(screen.getByLabelText("confirm-inspector-hard-delete"));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("delete_session", {
      payload: {
        sourceTool: "codex",
        sourceId: "alpha-id",
        hardDelete: true,
        cascadeSubagents: true,
      },
    });
  });
});

it("shows loading mask while session detail is fetching", async () => {
  const detailDeferred = createDeferred<{ detail: { sourceTool: string; sourceId: string; title: string; workspacePath: string; sourcePath: string; createdAt: string; updatedAt: string; messages: Array<{ role: string; content: string; createdAt: string }> } }>();

  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string; includeSubagent?: boolean; messageLimit?: number } }) => {
    if (cmd === "get_runtime_workspace") return "D:\\Works\\ai-session";
    if (cmd === "get_app_settings") {
      return { themeMode: "system", hardDelete: false, terminalPreference: "auto" };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 2,
        totalSessions: 2,
        activeSessions7d: 2,
        trashSessions: 0,
        totalSizeBytes: 4096,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 4096 }],
      };
    }
    if (cmd === "refresh_sessions") return { scannedFiles: 1, indexedSessions: 1, failedFiles: 0 };
    if (cmd === "list_sessions") return { rows: defaultRows };
    if (cmd === "list_subagent_sessions") return { rows: [] };
    if (cmd === "get_session_detail") return detailDeferred.promise;
    if (cmd === "delete_session") return { deletedSessions: 0 };
    return null;
  });

  render(<AppShell />);
  await expandAllGroups();
  fireEvent.click(await screen.findByText("真实会话 Alpha：排查 S3 签名失效"));
  expect(await screen.findByTestId("inspector-loading-mask")).toBeInTheDocument();

  detailDeferred.resolve({
    detail: {
      sourceTool: "codex",
      sourceId: "alpha-id",
      title: "S3 签名问题定位",
      workspacePath: "D:\\Works\\huobao-novel-main",
      sourcePath: "D:\\QA\\workspace-alpha\\history\\alpha.jsonl",
      createdAt: "2026-04-21T09:00:00Z",
      updatedAt: "2026-04-21T10:00:00Z",
      messages: [{ role: "assistant", content: "assistant 返回：建议统一签名算法版本。", createdAt: "2026-04-21 10:00:02" }],
    },
  });

  await waitFor(() => {
    expect(screen.queryByTestId("inspector-loading-mask")).not.toBeInTheDocument();
  });
});

it("opens subagent summary modal and replays subagent conversation", async () => {
  render(<AppShell />);

  await expandAllGroups();
  fireEvent.click(await screen.findByText("真实会话 Alpha：排查 S3 签名失效"));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("list_subagent_sessions", {
      payload: { sourceTool: "codex", parentSourceId: "alpha-id", inTrash: false },
    });
  });
  await screen.findByText("1 个");

  fireEvent.click(screen.getByLabelText("open-subagent-summary"));
  expect(await screen.findByTestId("subagent-summary-modal")).toHaveClass("active");

  fireEvent.click(await screen.findByLabelText("open-subagent-sub-session-1"));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: { sourceTool: "codex", sourceId: "sub-session-1", includeSubagent: true },
    });
  });
  expect(await screen.findByText("子代理返回：已完成子任务分析。")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("close-subagent-summary-modal"));
  expect(screen.getByTestId("subagent-summary-modal")).not.toHaveClass("active");
});

it("clicking summary entry shows empty tip when no subagent sessions", async () => {
  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string; includeSubagent?: boolean; messageLimit?: number } }) => {
    if (cmd === "get_runtime_workspace") return "D:\\Works\\ai-session";
    if (cmd === "get_app_settings") {
      return { themeMode: "system", hardDelete: false, terminalPreference: "auto" };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 2,
        totalSessions: 2,
        activeSessions7d: 2,
        trashSessions: 0,
        totalSizeBytes: 4096,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 4096 }],
      };
    }
    if (cmd === "refresh_sessions") return { scannedFiles: 1, indexedSessions: 1, failedFiles: 0 };
    if (cmd === "list_sessions") return { rows: defaultRows };
    if (cmd === "list_subagent_sessions") return { rows: [] };
    if (cmd === "get_session_detail") {
      const sourceTool = args?.payload?.sourceTool ?? "codex";
      const sourceId = args?.payload?.sourceId ?? "alpha-id";
      return {
        detail: {
          sourceTool,
          sourceId,
          title: "S3 签名问题定位",
          workspacePath: "D:\\Works\\huobao-novel-main",
          sourcePath: "D:\\QA\\workspace-alpha\\history\\alpha.jsonl",
          createdAt: "2026-04-21T09:00:00Z",
          updatedAt: "2026-04-21T10:00:00Z",
          messages: [{ role: "assistant", content: "assistant 返回：建议统一签名算法版本。", createdAt: "2026-04-21 10:00:02" }],
        },
      };
    }
    return null;
  });

  render(<AppShell />);
  await expandAllGroups();
  fireEvent.click(await screen.findByText("真实会话 Alpha：排查 S3 签名失效"));
  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("list_subagent_sessions", {
      payload: { sourceTool: "codex", parentSourceId: "alpha-id", inTrash: false },
    });
  });
  await screen.findByText("0 个");

  fireEvent.click(screen.getByLabelText("open-subagent-summary"));
  expect(await screen.findByText("当前主会话无子代理会话。")).toBeInTheDocument();
  expect(screen.getByTestId("subagent-summary-modal")).not.toHaveClass("active");
});

it("clicking the same session twice closes inspector", async () => {
  render(<AppShell />);

  await expandAllGroups();
  const alpha = await screen.findByText("真实会话 Alpha：排查 S3 签名失效");
  fireEvent.click(alpha);
  expect(screen.getByTestId("inspector")).not.toHaveClass("collapsed");

  fireEvent.click(alpha);
  expect(screen.getByTestId("inspector")).toHaveClass("collapsed");
});

it("clicking another session switches inspector detail", async () => {
  render(<AppShell />);

  await expandAllGroups();
  fireEvent.click(await screen.findByText("真实会话 Alpha：排查 S3 签名失效"));
  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: { sourceTool: "codex", sourceId: "alpha-id", includeSubagent: false, inTrash: false, messageLimit: 120 },
    });
  });

  fireEvent.click(await screen.findByText("真实会话 Beta：迁移旧日志索引"));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: { sourceTool: "codex", sourceId: "beta-id", includeSubagent: false, inTrash: false, messageLimit: 120 },
    });
  });
  expect(screen.getByTestId("inspector")).not.toHaveClass("collapsed");
});

it("does not render fake group header when list_sessions returns empty rows", async () => {
  listRowsQueue = [[]];

  render(<AppShell />);

  expect(await screen.findByText("暂无会话数据")).toBeInTheDocument();
  expect(screen.queryByLabelText(/select-group-/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/toggle-group-/)).not.toBeInTheDocument();
  expect(screen.queryByText("12.5 MB")).not.toBeInTheDocument();
  expect(screen.queryByText("4.2 MB")).not.toBeInTheDocument();
});

it("does not render fake group header when refresh chain fails", async () => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_runtime_workspace") return "D:\\Works\\ai-session";
    if (cmd === "get_app_settings") {
      return { themeMode: "system", hardDelete: false, terminalPreference: "auto" };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 0,
        totalSessions: 0,
        activeSessions7d: 0,
        trashSessions: 0,
        totalSizeBytes: 0,
        toolStats: [],
      };
    }
    if (cmd === "refresh_sessions") {
      throw new Error("refresh failed");
    }
    return null;
  });

  render(<AppShell />);

  await waitFor(() => {
    expect(getCommandCallCount("refresh_sessions")).toBe(1);
  });
  expect(await screen.findByText("暂无会话数据")).toBeInTheDocument();
  expect(screen.queryByLabelText(/select-group-/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/toggle-group-/)).not.toBeInTheDocument();
  expect(screen.queryByText("12.5 MB")).not.toBeInTheDocument();
  expect(screen.queryByText("4.2 MB")).not.toBeInTheDocument();
});

it("renders project path as group header for codex sessions", async () => {
  render(<AppShell />);

  expect(await screen.findByLabelText("toggle-group-D:\\Works\\huobao-novel-main")).toBeInTheDocument();
  expect(screen.getByLabelText("toggle-group-D:\\Works\\ops-console")).toBeInTheDocument();
});

it("opens workspace directory when clicking group path text", async () => {
  render(<AppShell />);

  const pathButton = await screen.findByLabelText("open-group-path-D:\\Works\\huobao-novel-main");
  fireEvent.click(pathButton);

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("open_in_explorer", {
      payload: { path: "D:\\Works\\huobao-novel-main", reveal: false },
    });
  });
});

it("groups by project path and supports per-group collapse", async () => {
  listRowsQueue = [
    [
      {
        sourceTool: "codex",
        sourceId: "alpha-1",
        title: "小说项目会话 A",
        workspacePath: "D:\\Works\\huobao-novel-main",
        sourcePath: "D:\\Works\\huobao-novel-main\\.codex\\sessions\\a.jsonl",
        createdAt: "2026-04-22T08:30:00Z",
        updatedAt: "2026-04-22T10:00:00Z",
      },
      {
        sourceTool: "codex",
        sourceId: "alpha-2",
        title: "小说项目会话 B",
        workspacePath: "D:\\Works\\huobao-novel-main",
        sourcePath: "D:\\Works\\huobao-novel-main\\.codex\\sessions\\b.jsonl",
        createdAt: "2026-04-22T07:30:00Z",
        updatedAt: "2026-04-22T09:00:00Z",
      },
      {
        sourceTool: "codex",
        sourceId: "ops-1",
        title: "运维项目会话 C",
        workspacePath: "D:\\Works\\ops-console",
        sourcePath: "D:\\Works\\ops-console\\.codex\\sessions\\c.jsonl",
        createdAt: "2026-04-21T08:30:00Z",
        updatedAt: "2026-04-21T09:30:00Z",
      },
    ],
  ];

  render(<AppShell />);

  expect(await screen.findByLabelText("toggle-group-D:\\Works\\huobao-novel-main")).toBeInTheDocument();
  expect(screen.getByLabelText("toggle-group-D:\\Works\\ops-console")).toBeInTheDocument();
  expect(screen.queryByText("小说项目会话 A")).not.toBeInTheDocument();
  expect(screen.queryByText("小说项目会话 B")).not.toBeInTheDocument();
  expect(screen.queryByText("运维项目会话 C")).not.toBeInTheDocument();

  await expandAllGroups();
  expect(screen.getByText("小说项目会话 A")).toBeInTheDocument();
  expect(screen.getByText("小说项目会话 B")).toBeInTheDocument();
  expect(screen.getByText("运维项目会话 C")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("toggle-group-D:\\Works\\huobao-novel-main"));

  expect(screen.queryByText("小说项目会话 A")).not.toBeInTheDocument();
  expect(screen.queryByText("小说项目会话 B")).not.toBeInTheDocument();
  expect(screen.getByText("运维项目会话 C")).toBeInTheDocument();
});

it("resumes session via row action in terminal", async () => {
  render(<AppShell />);

  await expandAllGroups();
  const restoreButton = await screen.findByLabelText("restore-row-codex:alpha-id");
  fireEvent.click(restoreButton);

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("open_resume_in_terminal", {
      payload: {
        sourceTool: "codex",
        sourceId: "alpha-id",
        workspacePath: "D:\\Works\\huobao-novel-main",
        terminalPreference: "auto",
      },
    });
  });
  expect(screen.getByTestId("inspector")).toHaveClass("collapsed");
});

it("disables row resume action when platform does not support terminal resume", async () => {
  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string; includeSubagent?: boolean; messageLimit?: number } }) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "get_app_settings") {
      return {
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
      };
    }
    if (cmd === "get_platform_capabilities") {
      return {
        os: "linux",
        terminalOptions: [{ id: "auto", label: "自动（推荐）" }],
        supportsRevealPath: true,
        supportsResumeInTerminal: false,
        revealPathDegradesToOpenParent: false,
      };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 2,
        totalSessions: 2,
        activeSessions7d: 2,
        trashSessions: 0,
        totalSizeBytes: 4096,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 4096 }],
      };
    }
    if (cmd === "refresh_sessions") {
      return {
        scannedFiles: 1,
        indexedSessions: 1,
        failedFiles: 0,
      };
    }
    if (cmd === "list_sessions") {
      return { rows: defaultRows };
    }
    if (cmd === "open_resume_in_terminal") {
      return null;
    }
    return null;
  });

  render(<AppShell />);

  await expandAllGroups();
  const restoreButton = await screen.findByLabelText("restore-row-codex:alpha-id");
  expect(restoreButton).toBeDisabled();

  fireEvent.click(restoreButton);

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_platform_capabilities");
  });
  expect(invokeMock).not.toHaveBeenCalledWith("open_resume_in_terminal", expect.anything());
});

it("toggles group by group-info action", async () => {
  render(<AppShell />);

  await expandAllGroups();
  expect(await screen.findByText("真实会话 Alpha：排查 S3 签名失效")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("toggle-group-D:\\Works\\huobao-novel-main"));
  expect(screen.queryByText("真实会话 Alpha：排查 S3 签名失效")).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("toggle-group-D:\\Works\\huobao-novel-main"));
  expect(await screen.findByText("真实会话 Alpha：排查 S3 签名失效")).toBeInTheDocument();
});

it("keeps rescan disabled while startup scan is running and delays list loading until scan completes", async () => {
  const refreshDeferred = createDeferred<{ scannedFiles: number; indexedSessions: number; failedFiles: number }>();
  let refreshCallCount = 0;

  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "get_app_settings") {
      return { themeMode: "system", hardDelete: false, terminalPreference: "auto" };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 2,
        totalSessions: 2,
        activeSessions7d: 2,
        trashSessions: 0,
        totalSizeBytes: 4096,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 4096 }],
      };
    }
    if (cmd === "refresh_sessions") {
      refreshCallCount += 1;
      if (refreshCallCount === 1) {
        return refreshDeferred.promise;
      }
      return { scannedFiles: 1, indexedSessions: 1, failedFiles: 0 };
    }
    if (cmd === "list_sessions") {
      return { rows: defaultRows };
    }
    return null;
  });

  render(<AppShell />);

  await waitFor(() => {
    expect(getCommandCallCount("refresh_sessions")).toBe(1);
    expect(screen.getByLabelText("rescan-local-data")).toBeDisabled();
    expect(screen.getByLabelText("rescan-local-data")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("rescan-local-data-icon")).toHaveClass("spinning");
    expect(screen.getByTestId("main-scan-status")).toBeInTheDocument();
    expect(screen.getByText("数据扫描中")).toBeInTheDocument();
    expect(screen.getByTestId("main-scan-status").parentElement).toHaveClass("app-shell");
    expect(screen.queryByTestId("sidebar-scan-status")).not.toBeInTheDocument();
  });
  expect(getCommandCallCount("list_sessions")).toBe(0);

  fireEvent.click(screen.getByLabelText("rescan-local-data"));
  expect(getCommandCallCount("refresh_sessions")).toBe(1);

  refreshDeferred.resolve({ scannedFiles: 1, indexedSessions: 1, failedFiles: 0 });

  await waitFor(() => {
    expect(screen.getByLabelText("rescan-local-data")).not.toBeDisabled();
    expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
      payload: { page: 1, pageSize: 1000 },
    });
  });
  expect(await screen.findByLabelText("toggle-group-D:\\Works\\huobao-novel-main")).toBeInTheDocument();

  const refreshCountBeforeManualRescan = getCommandCallCount("refresh_sessions");
  fireEvent.click(screen.getByLabelText("rescan-local-data"));

  await waitFor(() => {
    expect(getCommandCallCount("refresh_sessions")).toBe(refreshCountBeforeManualRescan + 1);
  });
});

it("requests first session list only after startup scan finishes", async () => {
  const refreshDeferred = createDeferred<{ scannedFiles: number; indexedSessions: number; failedFiles: number }>();
  const listDeferred = createDeferred<{ rows: typeof defaultRows }>();

  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "get_app_settings") {
      return { themeMode: "system", hardDelete: false, terminalPreference: "auto" };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 2,
        totalSessions: 2,
        activeSessions7d: 2,
        trashSessions: 0,
        totalSizeBytes: 4096,
        toolStats: [{ sourceTool: "codex", sessionCount: 2, totalSizeBytes: 4096 }],
      };
    }
    if (cmd === "refresh_sessions") {
      return refreshDeferred.promise;
    }
    if (cmd === "list_sessions") {
      return listDeferred.promise;
    }
    return null;
  });

  render(<AppShell />);

  await waitFor(() => {
    expect(getCommandCallCount("refresh_sessions")).toBe(1);
    expect(screen.getByLabelText("rescan-local-data")).toBeDisabled();
    expect(screen.getByLabelText("rescan-local-data")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("rescan-local-data-icon")).toHaveClass("spinning");
    expect(screen.getByTestId("main-scan-status")).toBeInTheDocument();
    expect(screen.getByText("数据扫描中")).toBeInTheDocument();
    expect(screen.getByTestId("main-scan-status").parentElement).toHaveClass("app-shell");
    expect(screen.queryByTestId("sidebar-scan-status")).not.toBeInTheDocument();
  });
  expect(screen.getByLabelText("rescan-local-data")).toBeDisabled();
  expect(getCommandCallCount("list_sessions")).toBe(0);

  refreshDeferred.resolve({ scannedFiles: 1, indexedSessions: 1, failedFiles: 0 });

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
      payload: { page: 1, pageSize: 1000 },
    });
  });
  expect(screen.getByLabelText("rescan-local-data")).toBeDisabled();

  await waitFor(
    () => {
      expect(screen.getByLabelText("rescan-local-data")).not.toBeDisabled();
    },
    { timeout: 1200 },
  );

  listDeferred.resolve({ rows: defaultRows });

  await waitFor(() => {
    expect(screen.getByLabelText("toggle-group-D:\\Works\\huobao-novel-main")).toBeInTheDocument();
  });
});

it("deletes session with default cascadeSubagents enabled", async () => {
  render(<AppShell />);

  await expandAllGroups();
  await screen.findByText("真实会话 Alpha：排查 S3 签名失效");
  fireEvent.click(screen.getByLabelText("delete-row-codex:alpha-id"));
  fireEvent.click(screen.getByLabelText("confirm-delete-popover"));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("delete_session", {
      payload: {
        sourceTool: "codex",
        sourceId: "alpha-id",
        cascadeSubagents: true,
      },
    });
  });
});

it("does not refresh list after delete no-op without warnings", async () => {
  let listCallCount = 0;
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_runtime_workspace") return "D:\\Works\\ai-session";
    if (cmd === "get_app_settings") {
      return { themeMode: "system", hardDelete: false, terminalPreference: "auto" };
    }
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
    if (cmd === "refresh_sessions") return { scannedFiles: 1, indexedSessions: 1, failedFiles: 0 };
    if (cmd === "list_sessions") {
      listCallCount += 1;
      return { rows: defaultRows };
    }
    if (cmd === "list_subagent_sessions") return { rows: [] };
    if (cmd === "delete_session") {
      return { deletedSessions: 0, deletedSourceFiles: 0, warnings: [] };
    }
    return null;
  });

  render(<AppShell />);
  await expandAllGroups();
  await screen.findByText("真实会话 Alpha：排查 S3 签名失效");
  const listCallCountBeforeDelete = listCallCount;
  fireEvent.click(screen.getByLabelText("delete-row-codex:alpha-id"));
  fireEvent.click(screen.getByLabelText("confirm-delete-popover"));

  await waitFor(() => {
    expect(getCommandCallCount("delete_session")).toBe(1);
  });
  expect(listCallCount).toBe(listCallCountBeforeDelete);
});

it("refreshes list after delete warning because backend already moved the row into trash", async () => {
  let listCallCount = 0;
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_runtime_workspace") return "D:\\Works\\ai-session";
    if (cmd === "get_app_settings") {
      return { themeMode: "system", hardDelete: false, terminalPreference: "auto" };
    }
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
    if (cmd === "refresh_sessions") return { scannedFiles: 1, indexedSessions: 1, failedFiles: 0 };
    if (cmd === "list_sessions") {
      listCallCount += 1;
      return listCallCount <= 3
        ? {
            rows: [
              {
                sourceTool: "codex",
                sourceId: "alpha-id",
                title: "真实会话 Alpha：排查 S3 签名失效",
                workspacePath: "D:\\Works\\ai-session",
                sourcePath: "D:\\Works\\ai-session\\alpha.jsonl",
                createdAt: "2026-04-21T09:00:00Z",
                updatedAt: "2026-04-21T10:00:00Z",
              },
            ],
          }
        : { rows: [] };
    }
    if (cmd === "list_subagent_sessions") return { rows: [] };
    if (cmd === "delete_session") {
      return {
        deletedSessions: 0,
        deletedSourceFiles: 0,
        warnings: ["D:\\unsafe: source path is a directory, refused to delete"],
      };
    }
    return null;
  });

  render(<AppShell />);
  await expandAllGroups();
  await screen.findByText("真实会话 Alpha：排查 S3 签名失效");
  const listCallCountBeforeDelete = listCallCount;
  fireEvent.click(screen.getByLabelText("delete-row-codex:alpha-id"));
  fireEvent.click(screen.getByLabelText("confirm-delete-popover"));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("delete_session", {
      payload: {
        sourceTool: "codex",
        sourceId: "alpha-id",
        cascadeSubagents: true,
      },
    });
    expect(listCallCount).toBe(listCallCountBeforeDelete + 1);
  });
});

it("resets inspector and reloads list after deleting the active session", async () => {
  listRowsQueue = [
    [
      {
        sourceTool: "codex",
        sourceId: "alpha-id",
        title: "真实会话 Alpha：排查 S3 签名失效",
        workspacePath: "D:\\Works\\huobao-novel-main",
        sourcePath: "D:\\QA\\workspace-alpha\\history\\alpha.jsonl",
        createdAt: "2026-04-21T09:00:00Z",
        updatedAt: "2026-04-21T10:00:00Z",
      },
      {
        sourceTool: "codex",
        sourceId: "beta-id",
        title: "真实会话 Beta：迁移旧日志索引",
        workspacePath: "D:\\Works\\ops-console",
        sourcePath: "E:\\Prod\\workspace-beta\\logs\\beta.jsonl",
        createdAt: "2026-04-22T08:00:00Z",
        updatedAt: "2026-04-22T09:30:00Z",
      },
    ],
    [
      {
        sourceTool: "codex",
        sourceId: "alpha-id",
        title: "真实会话 Alpha：排查 S3 签名失效",
        workspacePath: "D:\\Works\\huobao-novel-main",
        sourcePath: "D:\\QA\\workspace-alpha\\history\\alpha.jsonl",
        createdAt: "2026-04-21T09:00:00Z",
        updatedAt: "2026-04-21T10:00:00Z",
      },
      {
        sourceTool: "codex",
        sourceId: "beta-id",
        title: "真实会话 Beta：迁移旧日志索引",
        workspacePath: "D:\\Works\\ops-console",
        sourcePath: "E:\\Prod\\workspace-beta\\logs\\beta.jsonl",
        createdAt: "2026-04-22T08:00:00Z",
        updatedAt: "2026-04-22T09:30:00Z",
      },
    ],
    [
      {
        sourceTool: "codex",
        sourceId: "alpha-id",
        title: "真实会话 Alpha：排查 S3 签名失效",
        workspacePath: "D:\\Works\\huobao-novel-main",
        sourcePath: "D:\\QA\\workspace-alpha\\history\\alpha.jsonl",
        createdAt: "2026-04-21T09:00:00Z",
        updatedAt: "2026-04-21T10:00:00Z",
      },
      {
        sourceTool: "codex",
        sourceId: "beta-id",
        title: "真实会话 Beta：迁移旧日志索引",
        workspacePath: "D:\\Works\\ops-console",
        sourcePath: "E:\\Prod\\workspace-beta\\logs\\beta.jsonl",
        createdAt: "2026-04-22T08:00:00Z",
        updatedAt: "2026-04-22T09:30:00Z",
      },
    ],
    [
      {
        sourceTool: "codex",
        sourceId: "beta-id",
        title: "真实会话 Beta：迁移旧日志索引",
        workspacePath: "D:\\Works\\ops-console",
        sourcePath: "E:\\Prod\\workspace-beta\\logs\\beta.jsonl",
        createdAt: "2026-04-22T08:00:00Z",
        updatedAt: "2026-04-22T09:30:00Z",
      },
    ],
  ];

  render(<AppShell />);

  await expandAllGroups();
  fireEvent.click(await screen.findByText("真实会话 Alpha：排查 S3 签名失效"));
  await waitFor(() => {
    expect(screen.getByTestId("inspector")).not.toHaveClass("collapsed");
  });

  fireEvent.click(screen.getByLabelText("delete-row-codex:alpha-id"));
  fireEvent.click(screen.getByLabelText("confirm-delete-popover"));

  await waitFor(() => {
    expect(getCommandCallCount("delete_session")).toBe(1);
    expect(getCommandCallCount("list_sessions")).toBeGreaterThanOrEqual(2);
  });

  expect(screen.getByTestId("inspector")).toHaveClass("collapsed");
  expect(screen.queryByText("S3 签名问题定位")).not.toBeInTheDocument();
  expect(invokeMock).toHaveBeenCalledWith("list_sessions", {
    payload: { page: 1, pageSize: 1000 },
  });
});


it("switches to trash mode and loads trash sessions", async () => {
  render(<AppShell />);

  await waitFor(() => {
    expect(screen.getByLabelText("rescan-local-data")).not.toBeDisabled();
  });
  fireEvent.click(await screen.findByLabelText("switch-trash"));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("list_trash_sessions", {
      payload: { page: 1, pageSize: 1000 },
    });
  });
  await expandAllGroups();
  expect(await screen.findByText("回收站会话")).toBeInTheDocument();
});

it("trash row shows restore action only and loads detail in trash scope", async () => {
  render(<AppShell />);

  await waitFor(() => {
    expect(screen.getByLabelText("rescan-local-data")).not.toBeDisabled();
  });
  fireEvent.click(await screen.findByLabelText("switch-trash"));
  await waitFor(() => {
    expect(getCommandCallCount("list_trash_sessions")).toBeGreaterThan(0);
  });

  await expandAllGroups();
  fireEvent.click(await screen.findByText("回收站会话"));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
      payload: { sourceTool: "codex", sourceId: "trash-id", includeSubagent: false, inTrash: true, messageLimit: 120 },
    });
    expect(invokeMock).toHaveBeenCalledWith("list_subagent_sessions", {
      payload: { sourceTool: "codex", parentSourceId: "trash-id", inTrash: true },
    });
  });

  expect(screen.getByLabelText("restore-trash-row-codex:trash-id")).toBeInTheDocument();
  expect(screen.queryByLabelText("delete-row-codex:trash-id")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("restore-row-codex:trash-id")).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("restore-trash-row-codex:trash-id"));
  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("restore_session", {
      payload: {
        sourceTool: "codex",
        sourceId: "trash-id",
        cascadeSubagents: true,
      },
    });
  });
});

it("restores selected trash sessions and supports clearing trash", async () => {
  render(<AppShell />);

  await waitFor(() => {
    expect(screen.getByLabelText("rescan-local-data")).not.toBeDisabled();
  });
  fireEvent.click(await screen.findByLabelText("switch-trash"));
  await waitFor(() => {
    expect(getCommandCallCount("list_trash_sessions")).toBeGreaterThan(0);
  });

  await expandAllGroups();
  fireEvent.click(await screen.findByLabelText("select-row-codex:trash-id"));
  fireEvent.click(screen.getByRole("button", { name: "恢复所选 (1)" }));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("restore_session", {
      payload: {
        sourceTool: "codex",
        sourceId: "trash-id",
        cascadeSubagents: true,
      },
    });
  });

  fireEvent.click(screen.getByRole("button", { name: "清空回收站" }));
  expect(await screen.findByTestId("clear-trash-confirm-modal")).toHaveClass("active");
  fireEvent.click(screen.getByRole("button", { name: "确认清空" }));
  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("clear_trash");
  });
});

it("shows trash clear progress overlay while clearing and hides it after completion", async () => {
  const deferred = createDeferred<{ deletedSessions: number; deletedSourceFiles: number; warnings: string[] }>();
  let progressListener: ((event: { payload: { deletedSessions: number; totalSessions: number } }) => void) | null = null;

  listenMock.mockImplementation(async (eventName: string, callback: typeof progressListener) => {
    if (eventName === "trash-clear-progress") {
      progressListener = callback;
    }
    return () => {};
  });

  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string; includeSubagent?: boolean; messageLimit?: number } }) => {
    if (cmd === "clear_trash") {
      return deferred.promise;
    }
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "get_app_version") {
      return defaultAppVersion;
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
    if (cmd === "get_platform_capabilities") {
      return {
        os: "windows",
        terminalOptions: [{ id: "auto", label: "自动（推荐）" }],
        supportsRevealPath: true,
        supportsResumeInTerminal: true,
        revealPathDegradesToOpenParent: false,
      };
    }
    if (cmd === "refresh_sessions") {
      return {
        scannedFiles: 0,
        indexedSessions: 0,
        failedFiles: 0,
        failedFileDetails: [],
      };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 1,
        totalSessions: 1,
        activeSessions7d: 1,
        trashSessions: 1,
        totalSizeBytes: 128,
        toolStats: [{ sourceTool: "codex", sessionCount: 1, totalSizeBytes: 128 }],
      };
    }
    if (cmd === "list_sessions") {
      return { rows: defaultRows };
    }
    if (cmd === "list_trash_sessions") {
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: "trash-id",
            title: "Trash Session",
            workspacePath: "D:\\Works\\trash",
            sourcePath: "D:\\Works\\trash\\trash.jsonl",
            createdAt: "2026-04-21T09:00:00Z",
            updatedAt: "2026-04-21T10:00:00Z",
          },
        ],
      };
    }
    if (cmd === "get_session_detail") {
      return { detail: null };
    }
    if (cmd === "list_subagent_sessions") {
      return { rows: [] };
    }
    if (cmd === "restore_session") {
      return { restoredSessions: 1 };
    }
    if (cmd === "delete_session") {
      return { deletedSessions: 1, deletedSourceFiles: 0, warnings: [] };
    }
    if (cmd === "open_external_url") {
      return null;
    }
    return null;
  });

  render(<AppShell />);

  await waitFor(() => {
    expect(screen.getByLabelText("rescan-local-data")).not.toBeDisabled();
  });
  fireEvent.click(await screen.findByLabelText("switch-trash"));
  await waitFor(() => {
    expect(getCommandCallCount("list_trash_sessions")).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getByRole("button", { name: "清空回收站" }));
  fireEvent.click(await screen.findByRole("button", { name: "确认清空" }));

  await waitFor(() => {
    expect(screen.getByTestId("main-trash-clear-status")).toBeInTheDocument();
  });
  expect(screen.getByText("正在删除回收站会话")).toBeInTheDocument();

  await act(async () => {
    progressListener?.({ payload: { deletedSessions: 2, totalSessions: 5 } });
  });

  await waitFor(() => {
    expect(screen.getByText("已处理 2 / 5")).toBeInTheDocument();
  });

  await act(async () => {
    deferred.resolve({
      deletedSessions: 5,
      deletedSourceFiles: 5,
      warnings: [],
    });
  });

  await waitFor(() => {
    expect(screen.queryByTestId("main-trash-clear-status")).not.toBeInTheDocument();
  });
});

it("shows progress overlay while batch hard deleting trash selections", async () => {
  const deferred = createDeferred<{ deletedSessions: number; deletedSourceFiles: number; warnings: string[] }>();
  let progressListener: ((event: { payload: { deletedSessions: number; totalSessions: number } }) => void) | null = null;

  listenMock.mockImplementation(async (eventName: string, callback: typeof progressListener) => {
    if (eventName === "trash-clear-progress") {
      progressListener = callback;
    }
    return () => {};
  });

  invokeMock.mockImplementation(async (cmd: string, args?: { payload?: { sourceTool?: string; sourceId?: string; includeSubagent?: boolean; messageLimit?: number } }) => {
    if (cmd === "delete_sessions") {
      return deferred.promise;
    }
    if (cmd === "get_runtime_workspace") {
      return "D:\\Works\\ai-session";
    }
    if (cmd === "get_app_version") {
      return defaultAppVersion;
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
    if (cmd === "get_platform_capabilities") {
      return {
        os: "windows",
        terminalOptions: [{ id: "auto", label: "自动（推荐）" }],
        supportsRevealPath: true,
        supportsResumeInTerminal: true,
        revealPathDegradesToOpenParent: false,
      };
    }
    if (cmd === "refresh_sessions") {
      return {
        scannedFiles: 0,
        indexedSessions: 0,
        failedFiles: 0,
        failedFileDetails: [],
      };
    }
    if (cmd === "get_overview_summary") {
      return {
        totalWorkspaces: 1,
        totalSessions: 1,
        activeSessions7d: 1,
        trashSessions: 1,
        totalSizeBytes: 128,
        toolStats: [{ sourceTool: "codex", sessionCount: 1, totalSizeBytes: 128 }],
      };
    }
    if (cmd === "list_sessions") {
      return { rows: defaultRows };
    }
    if (cmd === "list_trash_sessions") {
      return {
        rows: [
          {
            sourceTool: "codex",
            sourceId: "trash-id",
            title: "Trash Session",
            workspacePath: "D:\\Works\\trash",
            sourcePath: "D:\\Works\\trash\\trash.jsonl",
            createdAt: "2026-04-21T09:00:00Z",
            updatedAt: "2026-04-21T10:00:00Z",
          },
        ],
      };
    }
    if (cmd === "get_session_detail") {
      return { detail: null };
    }
    if (cmd === "list_subagent_sessions") {
      return { rows: [] };
    }
    if (cmd === "restore_session") {
      return { restoredSessions: 1 };
    }
    if (cmd === "delete_session") {
      return { deletedSessions: 1, deletedSourceFiles: 0, warnings: [] };
    }
    if (cmd === "open_external_url") {
      return null;
    }
    return null;
  });

  render(<AppShell />);

  await waitFor(() => {
    expect(screen.getByLabelText("rescan-local-data")).not.toBeDisabled();
  });
  fireEvent.click(await screen.findByLabelText("switch-trash"));
  await waitFor(() => {
    expect(getCommandCallCount("list_trash_sessions")).toBeGreaterThan(0);
  });

  await expandAllGroups();
  fireEvent.click(await screen.findByLabelText("select-row-codex:trash-id"));
  fireEvent.click(screen.getByLabelText("batch-delete-sessions"));
  fireEvent.click(await screen.findByRole("button", { name: "确认永久删除" }));

  await waitFor(() => {
    expect(screen.getByTestId("main-trash-clear-status")).toBeInTheDocument();
  });

  await act(async () => {
    progressListener?.({ payload: { deletedSessions: 1, totalSessions: 3 } });
  });

  await waitFor(() => {
    expect(screen.getByText("已处理 1 / 3")).toBeInTheDocument();
  });

  await act(async () => {
    deferred.resolve({
      deletedSessions: 3,
      deletedSourceFiles: 3,
      warnings: [],
    });
  });

  await waitFor(() => {
    expect(screen.queryByTestId("main-trash-clear-status")).not.toBeInTheDocument();
  });
});

it("shows confirm modal before batch hard delete in trash mode", async () => {
  render(<AppShell />);

  await waitFor(() => {
    expect(screen.getByLabelText("rescan-local-data")).not.toBeDisabled();
  });
  fireEvent.click(await screen.findByLabelText("switch-trash"));
  await waitFor(() => {
    expect(getCommandCallCount("list_trash_sessions")).toBeGreaterThan(0);
  });

  await expandAllGroups();
  fireEvent.click(await screen.findByLabelText("select-row-codex:trash-id"));
  fireEvent.click(screen.getByLabelText("batch-delete-sessions"));

  expect(await screen.findByTestId("trash-batch-delete-confirm-modal")).toHaveClass("active");
  fireEvent.click(screen.getByRole("button", { name: "确认永久删除" }));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("delete_sessions", {
      payload: {
        targets: [
          {
            sourceTool: "codex",
            sourceId: "trash-id",
          },
        ],
        hardDelete: true,
        cascadeSubagents: true,
      },
    });
  });
});

it("uses the shared danger action style for toolbar and trash delete actions", async () => {
  render(<AppShell />);

  expect(screen.getByLabelText("batch-delete-sessions")).toHaveClass("btn-danger-solid");

  fireEvent.click(await screen.findByLabelText("switch-trash"));
  await waitFor(() => {
    expect(getCommandCallCount("list_trash_sessions")).toBeGreaterThan(0);
  });

  await expandAllGroups();
  fireEvent.click(screen.getByLabelText("select-row-codex:trash-id"));
  expect(screen.getByLabelText("batch-delete-sessions")).toHaveClass("btn-danger-solid");

  fireEvent.click(screen.getByLabelText("batch-delete-sessions"));
  expect(await screen.findByRole("button", { name: "确认永久删除" })).toHaveClass("btn-danger-solid");

  fireEvent.click(screen.getByRole("button", { name: "清空回收站" }));
  expect(await screen.findByRole("button", { name: "确认清空" })).toHaveClass("btn-danger-solid");
});

it("shows update-available state in the version entry and opens the update popover", async () => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      tag_name: "v0.2.0",
      html_url: "https://github.com/caiweiming/ai-session-manager/releases/tag/v0.2.0",
      published_at: "2026-05-29T12:00:00Z",
      body: "更新说明",
    }),
  })) as typeof fetch;

  await act(async () => {
    render(<AppShell />);
  });

  await waitFor(() => {
    expect(screen.getByLabelText("app-update-entry")).toHaveTextContent("有新版本");
  });

  await clickElement(screen.getByLabelText("app-update-entry"));
  expect(screen.getByTestId("update-popover")).toBeInTheDocument();
  expect(screen.getByText("v0.2.0")).toBeInTheDocument();
});

it("checks updates against the public GitHub repository", async () => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      tag_name: "v0.1.1",
      html_url: "https://github.com/caiweiming/ai-session-manager/releases/tag/v0.1.1",
      published_at: "2026-06-04T12:00:00Z",
      body: "更新说明",
    }),
  })) as typeof fetch;

  await act(async () => {
    render(<AppShell />);
  });

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/caiweiming/ai-session-manager/releases/latest",
    );
  });
});

it("shows a no public release hint when GitHub latest release returns 404", async () => {
  global.fetch = vi.fn(async () => ({
    ok: false,
    status: 404,
    json: async () => ({}),
  })) as typeof fetch;

  await act(async () => {
    render(<AppShell />);
  });

  await waitFor(() => {
    expect(screen.getByLabelText("app-update-entry")).toHaveTextContent(`v${defaultAppVersion}`);
  });

  await clickElement(screen.getByLabelText("app-update-entry"));

  await waitFor(() => {
    expect(screen.getByText("暂无公开发布版本")).toBeInTheDocument();
  });
});

it("opens the default releases page when no latest release is available", async () => {
  const openExternalSpy = vi.spyOn(api, "openExternalUrl").mockResolvedValue(undefined);
  global.fetch = vi.fn(async () => ({
    ok: false,
    status: 404,
    json: async () => ({}),
  })) as typeof fetch;

  await act(async () => {
    render(<AppShell />);
  });

  await clickElement(screen.getByLabelText("app-update-entry"));
  await clickElement(screen.getByRole("button", { name: "打开发布页" }));

  expect(openExternalSpy).toHaveBeenCalledWith({
    url: "https://github.com/caiweiming/ai-session-manager/releases",
  });
});

it("renders the update popover outside the sidebar clipping container", async () => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      tag_name: "v0.2.0",
      html_url: "https://github.com/caiweiming/ai-session-manager/releases/tag/v0.2.0",
      published_at: "2026-05-29T12:00:00Z",
      body: "更新说明",
    }),
  })) as typeof fetch;

  await act(async () => {
    render(<AppShell />);
  });

  await waitFor(() => {
    expect(screen.getByLabelText("app-update-entry")).toHaveTextContent("有新版本");
  });

  await clickElement(screen.getByLabelText("app-update-entry"));

  const popover = screen.getByTestId("update-popover");
  expect(document.body).toContainElement(popover);
  expect(screen.getByTestId("sidebar")).not.toContainElement(popover);
});

it("closes the update popover when clicking outside", async () => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      tag_name: "v0.2.0",
      html_url: "https://github.com/caiweiming/ai-session-manager/releases/tag/v0.2.0",
      published_at: "2026-05-29T12:00:00Z",
      body: "更新说明",
    }),
  })) as typeof fetch;

  await act(async () => {
    render(<AppShell />);
  });

  await waitFor(() => {
    expect(screen.getByLabelText("app-update-entry")).toHaveTextContent("有新版本");
  });

  await clickElement(screen.getByLabelText("app-update-entry"));
  expect(screen.getByTestId("update-popover")).toBeInTheDocument();

  await clickElement(screen.getByLabelText("switch-overview"));

  await waitFor(() => {
    expect(screen.queryByTestId("update-popover")).not.toBeInTheDocument();
  });
});

it("closes the update popover when pressing Escape", async () => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      tag_name: "v0.2.0",
      html_url: "https://github.com/caiweiming/ai-session-manager/releases/tag/v0.2.0",
      published_at: "2026-05-29T12:00:00Z",
      body: "更新说明",
    }),
  })) as typeof fetch;

  await act(async () => {
    render(<AppShell />);
  });

  await waitFor(() => {
    expect(screen.getByLabelText("app-update-entry")).toHaveTextContent("有新版本");
  });

  await clickElement(screen.getByLabelText("app-update-entry"));
  expect(screen.getByTestId("update-popover")).toBeInTheDocument();

  await act(async () => {
    fireEvent.keyDown(document, { key: "Escape" });
  });

  await waitFor(() => {
    expect(screen.queryByTestId("update-popover")).not.toBeInTheDocument();
  });
});

it("repositions the update popover when the window resizes", async () => {
  const rectState = { top: 24, left: 32, bottom: 42, right: 120, width: 88, height: 18 };
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      tag_name: "v0.2.0",
      html_url: "https://github.com/caiweiming/ai-session-manager/releases/tag/v0.2.0",
      published_at: "2026-05-29T12:00:00Z",
      body: "更新说明",
    }),
  })) as typeof fetch;

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRectMock() {
    const element = this as HTMLElement;
    if (element.getAttribute("aria-label") === "app-update-entry") {
      return {
        ...rectState,
        x: rectState.left,
        y: rectState.top,
        toJSON: () => rectState,
      } as DOMRect;
    }
    return originalGetBoundingClientRect.call(this);
  };

  try {
    await act(async () => {
      render(<AppShell />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText("app-update-entry")).toHaveTextContent("有新版本");
    });

    await clickElement(screen.getByLabelText("app-update-entry"));

    await waitFor(() => {
      expect(screen.getByTestId("update-popover")).toHaveStyle({ top: "52px", left: "32px" });
    });

    rectState.top = 64;
    rectState.left = 96;
    rectState.bottom = 82;
    rectState.right = 184;

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("update-popover")).toHaveStyle({ top: "92px", left: "96px" });
    });
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  }
});

it("repositions the update popover when the window scrolls", async () => {
  const rectState = { top: 40, left: 28, bottom: 58, right: 116, width: 88, height: 18 };
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      tag_name: "v0.2.0",
      html_url: "https://github.com/caiweiming/ai-session-manager/releases/tag/v0.2.0",
      published_at: "2026-05-29T12:00:00Z",
      body: "更新说明",
    }),
  })) as typeof fetch;

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRectMock() {
    const element = this as HTMLElement;
    if (element.getAttribute("aria-label") === "app-update-entry") {
      return {
        ...rectState,
        x: rectState.left,
        y: rectState.top,
        toJSON: () => rectState,
      } as DOMRect;
    }
    return originalGetBoundingClientRect.call(this);
  };

  try {
    await act(async () => {
      render(<AppShell />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText("app-update-entry")).toHaveTextContent("有新版本");
    });

    await clickElement(screen.getByLabelText("app-update-entry"));

    await waitFor(() => {
      expect(screen.getByTestId("update-popover")).toHaveStyle({ top: "68px", left: "28px" });
    });

    rectState.top = 112;
    rectState.left = 140;
    rectState.bottom = 130;
    rectState.right = 228;

    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("update-popover")).toHaveStyle({ top: "140px", left: "140px" });
    });
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  }
});

it("allows manually checking updates and opens the release page when an update is available", async () => {
  const openExternalSpy = vi.spyOn(api, "openExternalUrl").mockResolvedValue(undefined);
  let requestCount = 0;
  global.fetch = vi.fn(async () => {
    requestCount += 1;
    return {
      ok: true,
      json: async () => ({
        tag_name: "v0.2.0",
        html_url: "https://github.com/caiweiming/ai-session-manager/releases/tag/v0.2.0",
        published_at: "2026-05-29T12:00:00Z",
        body: "更新说明",
      }),
    } as Response;
  }) as typeof fetch;

  await act(async () => {
    render(<AppShell />);
  });

  await waitFor(() => {
    expect(screen.getByLabelText("app-update-entry")).toHaveTextContent("有新版本");
  });

  await clickElement(screen.getByLabelText("app-update-entry"));
  await clickElement(screen.getByRole("button", { name: "检查更新" }));
  await clickElement(screen.getByRole("button", { name: "打开发布页" }));

  await waitFor(() => {
    expect(requestCount).toBeGreaterThanOrEqual(2);
  });
  expect(openExternalSpy).toHaveBeenCalledWith({
    url: "https://github.com/caiweiming/ai-session-manager/releases/tag/v0.2.0",
  });
});

it("shows an inline error hint in the update popover when manual update checking fails", async () => {
  let requestCount = 0;
  global.fetch = vi.fn(async () => {
    requestCount += 1;
    return {
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response;
  }) as typeof fetch;

  await act(async () => {
    render(<AppShell />);
  });

  await clickElement(screen.getByLabelText("app-update-entry"));
  await clickElement(screen.getByRole("button", { name: "检查更新" }));

  await waitFor(() => {
    expect(requestCount).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("暂时无法检查更新")).toBeInTheDocument();
  });
});
