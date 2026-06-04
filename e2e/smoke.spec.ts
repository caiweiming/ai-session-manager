import { expect, test, type Page } from "@playwright/test";

const installInvokeContractMock = async (page: Page) => {
  await page.addInitScript(() => {
    const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

    const state = {
      refreshCount: 0,
      commandLog: [] as Array<{ command: string; args: unknown }>,
      exportLog: [] as Array<{ sourceTool: string; sourceId: string }>,
      sessions: [
        {
          sourceTool: "codex",
          sourceId: "session-alpha",
          title: "排查支付超时",
          workspacePath: "D:\\Works\\workspace-alpha",
          sourcePath: "D:\\Works\\workspace-alpha\\.codex\\history\\session-alpha.jsonl",
          createdAt: "2026-04-21T09:00:00Z",
          updatedAt: "2026-04-21T10:00:00Z",
          sizeBytes: 2048,
        },
        {
          sourceTool: "claude",
          sourceId: "session-beta",
          title: "迁移日志索引",
          workspacePath: "D:\\Works\\workspace-beta",
          sourcePath: "D:\\Works\\workspace-beta\\.claude\\projects\\session-beta.jsonl",
          createdAt: "2026-04-20T08:00:00Z",
          updatedAt: "2026-04-20T09:00:00Z",
          sizeBytes: 1024,
        },
      ],
      trashSessions: [] as Array<{
        sourceTool: string;
        sourceId: string;
        title: string;
        workspacePath: string;
        sourcePath: string;
        createdAt: string;
        updatedAt: string;
        sizeBytes?: number;
      }>,
      details: {
        "codex:session-alpha": {
          sourceTool: "codex",
          sourceId: "session-alpha",
          title: "排查支付超时",
          workspacePath: "D:\\Works\\workspace-alpha",
          sourcePath: "D:\\Works\\workspace-alpha\\.codex\\history\\session-alpha.jsonl",
          createdAt: "2026-04-21T09:00:00Z",
          updatedAt: "2026-04-21T10:00:00Z",
          sizeBytes: 2048,
          inputTokens: 1200,
          outputTokens: 860,
          messageTotal: 2,
          messageLoaded: 2,
          messages: [
            {
              role: "user",
              content: "请排查支付超时问题",
              createdAt: "2026-04-21T09:01:00Z",
            },
            {
              role: "assistant",
              content: "建议先检查网关重试和签名链路。",
              createdAt: "2026-04-21T09:02:00Z",
            },
          ],
        },
        "claude:session-beta": {
          sourceTool: "claude",
          sourceId: "session-beta",
          title: "迁移日志索引",
          workspacePath: "D:\\Works\\workspace-beta",
          sourcePath: "D:\\Works\\workspace-beta\\.claude\\projects\\session-beta.jsonl",
          createdAt: "2026-04-20T08:00:00Z",
          updatedAt: "2026-04-20T09:00:00Z",
          sizeBytes: 1024,
          inputTokens: 640,
          outputTokens: 320,
          messageTotal: 1,
          messageLoaded: 1,
          messages: [
            {
              role: "assistant",
              content: "日志索引迁移脚本已准备完成。",
              createdAt: "2026-04-20T08:30:00Z",
            },
          ],
        },
      } as Record<string, unknown>,
    };

    const matchesKeyword = (row: { title: string; sourceId: string; sourcePath: string }, keyword?: string) => {
      const trimmed = keyword?.trim();
      if (!trimmed) return true;
      return [row.title, row.sourceId, row.sourcePath].some((value) => value.toLowerCase().includes(trimmed.toLowerCase()));
    };

    const buildOverviewSummary = () => {
      const totalSizeBytes = state.sessions.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0);
      const toolTotals = new Map<string, { sessionCount: number; totalSizeBytes: number }>();
      for (const row of state.sessions) {
        const current = toolTotals.get(row.sourceTool) ?? { sessionCount: 0, totalSizeBytes: 0 };
        current.sessionCount += 1;
        current.totalSizeBytes += row.sizeBytes ?? 0;
        toolTotals.set(row.sourceTool, current);
      }
      return {
        totalWorkspaces: 2,
        totalSessions: state.sessions.length,
        activeSessions7d: state.sessions.length,
        trashSessions: state.trashSessions.length,
        totalSizeBytes,
        toolStats: Array.from(toolTotals.entries()).map(([sourceTool, summary]) => ({
          sourceTool,
          sessionCount: summary.sessionCount,
          totalSizeBytes: summary.totalSizeBytes,
        })),
      };
    };

    const listRows = (payload?: { tool?: string; keyword?: string }) => {
      return state.sessions.filter((row) => {
        if (payload?.tool && row.sourceTool !== payload.tool) {
          return false;
        }
        return matchesKeyword(row, payload.keyword);
      });
    };

    const invokeMock = async (command: string, args?: { payload?: Record<string, unknown> }) => {
      state.commandLog.push({ command, args: clone(args ?? null) });

      if (command === "health_check") return "ok";
      if (command === "get_runtime_workspace") return "D:\\Works\\ai-session";
      if (command === "get_app_settings") {
        return {
          themeMode: "system",
          hardDelete: false,
          terminalPreference: "auto",
        };
      }
      if (command === "get_platform_capabilities") {
        return {
          os: "windows",
          terminalOptions: [
            { id: "auto", label: "自动（推荐）" },
            { id: "windows_terminal", label: "Windows Terminal" },
            { id: "powershell", label: "PowerShell" },
          ],
          supportsRevealPath: true,
          supportsResumeInTerminal: true,
          revealPathDegradesToOpenParent: false,
        };
      }
      if (command === "refresh_sessions") {
        state.refreshCount += 1;
        return state.refreshCount === 1
          ? {
              scannedFiles: 2,
              indexedSessions: 2,
              failedFiles: 1,
            }
          : {
              scannedFiles: 2,
              indexedSessions: 1,
              failedFiles: 0,
            };
      }
      if (command === "get_overview_summary") {
        return buildOverviewSummary();
      }
      if (command === "list_sessions") {
        return {
          rows: clone(listRows(args?.payload as { tool?: string; keyword?: string } | undefined)),
        };
      }
      if (command === "list_trash_sessions") {
        return {
          rows: clone(state.trashSessions),
        };
      }
      if (command === "get_session_detail") {
        const payload = args?.payload ?? {};
        const key = `${payload.sourceTool ?? "unknown"}:${payload.sourceId ?? "unknown"}`;
        return {
          detail: clone(state.details[key] ?? null),
        };
      }
      if (command === "list_subagent_sessions") {
        return { rows: [] };
      }
      if (command === "delete_session") {
        const payload = args?.payload ?? {};
        const index = state.sessions.findIndex(
          (row) => row.sourceTool === payload.sourceTool && row.sourceId === payload.sourceId,
        );
        if (index >= 0) {
          const [removed] = state.sessions.splice(index, 1);
          state.trashSessions.unshift(removed);
        }
        return {
          deletedSessions: index >= 0 ? 1 : 0,
          deletedSourceFiles: index >= 0 ? 1 : 0,
          warnings: [],
        };
      }
      if (command === "restore_session") {
        return { restoredSessions: 0 };
      }
      if (command === "clear_trash") {
        const deletedSessions = state.trashSessions.length;
        state.trashSessions = [];
        return {
          deletedSessions,
          deletedSourceFiles: deletedSessions,
          warnings: [],
        };
      }
      if (command === "export_session_markdown") {
        const payload = (args?.payload ?? {}) as { sourceTool: string; sourceId: string };
        state.exportLog.push({
          sourceTool: payload.sourceTool,
          sourceId: payload.sourceId,
        });
        return {
          path: `D:\\Exports\\${payload.sourceId}.md`,
          canceled: false,
        };
      }
      if (command === "open_in_explorer" || command === "open_resume_in_terminal") {
        return null;
      }
      return null;
    };

    Object.assign(window as Record<string, unknown>, {
      __AI_SESSION_MANAGER_E2E_STATE__: state,
      __AI_SESSION_MANAGER_INVOKE_MOCK__: invokeMock,
    });
  });
};

const getCommandCallCount = async (page: Page, command: string) => {
  return page.evaluate((name) => {
    const state = (window as unknown as {
      __AI_SESSION_MANAGER_E2E_STATE__?: { commandLog: Array<{ command: string }> };
    }).__AI_SESSION_MANAGER_E2E_STATE__;
    return state?.commandLog.filter((entry) => entry.command === name).length ?? 0;
  }, command);
};

const expandAllGroups = async (page: Page) => {
  const expandAllButton = page.getByLabel("expand-all-groups");
  await expect(expandAllButton).toBeVisible();
  if (await expandAllButton.isDisabled()) {
    return;
  }
  await expandAllButton.click();
};

test("app shell smoke: startup, scan, search, inspect, export, delete", async ({ page }) => {
  await installInvokeContractMock(page);
  await page.goto("http://localhost:1420");

  await expect(page.locator("[data-testid='sidebar']")).toBeVisible();
  const mainArea = page.locator("[data-testid='main-area']");
  await expect(mainArea).toBeVisible();
  await expect(mainArea).toHaveAttribute("data-sessions-state", "ready");

  const failedMetric = page.locator(".sidebar-metric-row", {
    hasText: "扫描异常文件数",
  });
  await expect(failedMetric.locator(".sidebar-metric-value")).toHaveText("1");

  await expect(page.locator("[data-testid='inspector']")).toHaveClass(/collapsed/);

  await expandAllGroups(page);
  await expect(page.getByRole("button", { name: "排查支付超时" })).toBeVisible();
  await expect(page.getByRole("button", { name: "迁移日志索引" })).toBeVisible();

  await page.getByLabel("session-search-input").fill("支付");
  await expect(page.getByRole("button", { name: "排查支付超时" })).toBeVisible();
  await expect(page.getByRole("button", { name: "迁移日志索引" })).toHaveCount(0);

  await page.getByRole("button", { name: "排查支付超时" }).click();

  const inspector = page.locator("[data-testid='inspector']");
  await expect(inspector).not.toHaveClass(/collapsed/);
  await expect(inspector.locator(".inspector-title-text")).toHaveText("排查支付超时");
  await expect(inspector.locator(".chat-content").first()).toContainText("请排查支付超时问题");

  await page.getByRole("button", { name: "导出为 Markdown" }).click();
  await expect(page.getByText("Markdown 已导出：D:\\Exports\\session-alpha.md")).toBeVisible();

  await page.getByLabel("close-inspector-pane").click();
  await expect(page.locator("[data-testid='inspector']")).toHaveClass(/collapsed/);

  await page.getByLabel("delete-row-codex:session-alpha").click();
  await expect(page.getByTestId("delete-popover")).toBeVisible();
  await page.getByLabel("confirm-delete-popover").click();

  await expect(page.getByRole("button", { name: "排查支付超时" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "迁移日志索引" })).toHaveCount(0);
  await expect(page.locator("[data-testid='inspector']")).toHaveClass(/collapsed/);

  const listSessionsCountBeforeClearSearch = await getCommandCallCount(page, "list_sessions");
  await page.getByLabel("session-search-input").fill("");
  await expect.poll(() => getCommandCallCount(page, "list_sessions")).toBeGreaterThan(listSessionsCountBeforeClearSearch);
  await expandAllGroups(page);
  await expect(page.getByRole("button", { name: "迁移日志索引" })).toBeVisible();

  await page.getByLabel("rescan-local-data").click();
  await expect.poll(() => getCommandCallCount(page, "refresh_sessions")).toBe(2);
  await expect(failedMetric.locator(".sidebar-metric-value")).toHaveText("0");
  await expect.poll(() => getCommandCallCount(page, "export_session_markdown")).toBe(1);
  await expect.poll(() => getCommandCallCount(page, "delete_session")).toBe(1);
});

test("overview sticky parent appears while scrolling expanded subagent rows", async ({ page }) => {
  await page.addInitScript(() => {
    const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

    const sessions = [
      {
        sourceTool: "codex",
        sourceId: "main-sticky",
        title: "主会话 Sticky",
        workspacePath: "D:\\Works\\sticky-demo",
        sourcePath: "D:\\Works\\sticky-demo\\.codex\\history\\main-sticky.jsonl",
        createdAt: "2026-04-21T09:00:00Z",
        updatedAt: "2026-04-21T10:00:00Z",
        sizeBytes: 2048,
      },
      {
        sourceTool: "codex",
        sourceId: "main-follow",
        title: "主会话 Follow",
        workspacePath: "D:\\Works\\sticky-demo",
        sourcePath: "D:\\Works\\sticky-demo\\.codex\\history\\main-follow.jsonl",
        createdAt: "2026-04-21T11:00:00Z",
        updatedAt: "2026-04-21T12:00:00Z",
        sizeBytes: 1024,
      },
    ];

    const invokeMock = async (command: string, args?: { payload?: Record<string, unknown> }) => {
      if (command === "health_check") return "ok";
      if (command === "get_runtime_workspace") return "D:\\Works\\ai-session";
      if (command === "get_app_settings") {
        return {
          themeMode: "system",
          hardDelete: false,
          terminalPreference: "auto",
        };
      }
      if (command === "get_platform_capabilities") {
        return {
          os: "windows",
          terminalOptions: [{ id: "auto", label: "自动（推荐）" }],
          supportsRevealPath: true,
          supportsResumeInTerminal: true,
          revealPathDegradesToOpenParent: false,
        };
      }
      if (command === "refresh_sessions") {
        return {
          scannedFiles: 2,
          indexedSessions: 2,
          failedFiles: 0,
          failedFileDetails: [],
        };
      }
      if (command === "get_overview_summary") {
        return {
          totalWorkspaces: 1,
          totalSessions: sessions.length,
          activeSessions7d: sessions.length,
          trashSessions: 0,
          totalSizeBytes: sessions.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0),
          toolStats: [{ sourceTool: "codex", sessionCount: sessions.length, totalSizeBytes: 3072 }],
        };
      }
      if (command === "list_sessions") {
        return { rows: clone(sessions) };
      }
      if (command === "list_trash_sessions") {
        return { rows: [] };
      }
      if (command === "get_session_detail") {
        return { detail: null };
      }
      if (command === "list_subagent_sessions") {
        const parentSourceId = args?.payload?.parentSourceId;
        if (parentSourceId === "main-sticky") {
          return {
            rows: Array.from({ length: 14 }, (_, index) => ({
              sourceTool: "codex",
              sourceId: `sub-${index + 1}`,
              title: `子会话 ${index + 1}`,
              workspacePath: "D:\\Works\\sticky-demo",
              sourcePath: `D:\\Works\\sticky-demo\\.codex\\history\\sub-${index + 1}.jsonl`,
              createdAt: "2026-04-21T10:00:20Z",
              updatedAt: "2026-04-21T10:01:00Z",
            })),
          };
        }
        return { rows: [] };
      }
      return null;
    };

    Object.assign(window as Record<string, unknown>, {
      __AI_SESSION_MANAGER_INVOKE_MOCK__: invokeMock,
    });
  });

  await page.goto("http://localhost:1420");
  await expect(page.locator("[data-testid='main-area']")).toHaveAttribute("data-sessions-state", "ready");

  const expandAllButton = page.getByLabel("group-expand-toggle");
  await expect(expandAllButton).toBeVisible();
  await expandAllButton.click();

  await page.getByLabel("toggle-subagents-codex:main-sticky").click();
  await expect(page.getByText("子会话 1")).toBeVisible();

  const tableContainer = page.locator(".table-container");
  const viewport = page.locator("[data-testid='session-table-viewport']");
  await expect(viewport).toBeVisible();

  await viewport.evaluate((element) => {
    element.scrollTop = 260;
    element.dispatchEvent(new Event("scroll"));
  });

  await expect(viewport.getByTestId("session-table-sticky-parent")).toBeVisible();
  await expect(viewport.getByTestId("session-table-sticky-parent")).toContainText("主会话 Sticky");

  const scrollState = await page.evaluate(() => {
    const tableContainer = document.querySelector(".table-container") as HTMLElement | null;
    const viewport = document.querySelector("[data-testid='session-table-viewport']") as HTMLElement | null;
    const sticky = document.querySelector("[data-testid='session-table-sticky-parent']") as HTMLElement | null;
    return {
      tableContainerScrollTop: tableContainer?.scrollTop ?? null,
      viewportScrollTop: viewport?.scrollTop ?? null,
      stickyExists: Boolean(sticky),
      stickyText: sticky?.textContent ?? null,
    };
  });

  expect(scrollState.tableContainerScrollTop).toBe(0);
  expect(scrollState.viewportScrollTop).toBeGreaterThan(0);
  expect(scrollState.stickyExists).toBe(true);
});
