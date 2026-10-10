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
          workspacePath: "D:\\Works\\workspace-missing",
          sourcePath: "D:\\Works\\workspace-missing\\.claude\\projects\\session-beta.jsonl",
          createdAt: "2026-04-20T08:00:00Z",
          updatedAt: "2026-04-20T09:00:00Z",
          sizeBytes: 1024,
        },
        {
          sourceTool: "gemini",
          sourceId: "session-gamma",
          title: "修复受限目录",
          workspacePath: "D:\\Works\\workspace-unavailable",
          sourcePath: "D:\\Works\\workspace-unavailable\\.gemini\\history\\session-gamma.jsonl",
          createdAt: "2026-04-19T08:00:00Z",
          updatedAt: "2026-04-19T09:00:00Z",
          sizeBytes: 512,
        },
        {
          sourceTool: "codex",
          sourceId: "session-delta",
          title: "整理未知目录会话",
          workspacePath: "",
          sourcePath: "D:\\Archive\\session-delta.jsonl",
          createdAt: "2026-04-18T08:00:00Z",
          updatedAt: "2026-04-18T09:00:00Z",
          sizeBytes: 256,
        },
      ],
      trashSessions: [
        {
          sourceTool: "claude",
          sourceId: "trash-missing",
          title: "回收站缺失目录会话",
          workspacePath: "D:\\Works\\workspace-missing",
          sourcePath: "D:\\Works\\workspace-missing\\.claude\\projects\\trash-missing.jsonl",
          createdAt: "2026-04-17T08:00:00Z",
          updatedAt: "2026-04-17T09:00:00Z",
          sizeBytes: 128,
        },
      ] as Array<{
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
          workspacePath: "D:\\Works\\workspace-missing",
          sourcePath: "D:\\Works\\workspace-missing\\.claude\\projects\\session-beta.jsonl",
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
      if (command === "check_workspace_paths") {
        const paths = (args?.payload?.paths ?? []) as string[];
        return {
          results: paths.map((path) => {
            if (path === "D:\\Works\\workspace-missing") {
              return { path, status: "missing" };
            }
            if (path === "D:\\Works\\workspace-unavailable") {
              return { path, status: "unavailable", reason: "permission_denied" };
            }
            return { path, status: "available" };
          }),
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
  const expandAllButton = page.getByLabel("group-expand-toggle");
  await expect(expandAllButton).toBeVisible();
  if (await expandAllButton.isDisabled()) {
    return;
  }
  await expandAllButton.click();
};

const expectToolbarControlsNotToOverlap = async (page: Page) => {
  const layout = await page.locator(".toolbar").evaluate((toolbar) => {
    const toolbarRect = toolbar.getBoundingClientRect();
    const elements = Array.from(toolbar.querySelectorAll("input, button"));
    const boxes = elements
      .filter((element) => {
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });

    return {
      boxes,
      toolbar: {
        left: toolbarRect.left,
        right: toolbarRect.right,
        top: toolbarRect.top,
        bottom: toolbarRect.bottom,
      },
      browserViewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  });

  const { boxes, toolbar, browserViewport } = layout;
  const tolerance = 0.5;

  for (const box of boxes) {
    expect(box.left, `${box.label} 左侧应位于 toolbar 内`).toBeGreaterThanOrEqual(toolbar.left - tolerance);
    expect(box.right, `${box.label} 右侧应位于 toolbar 内`).toBeLessThanOrEqual(toolbar.right + tolerance);
    expect(box.top, `${box.label} 顶部应位于 toolbar 内`).toBeGreaterThanOrEqual(toolbar.top - tolerance);
    expect(box.bottom, `${box.label} 底部应位于 toolbar 内`).toBeLessThanOrEqual(toolbar.bottom + tolerance);
    expect(box.left, `${box.label} 左侧应位于浏览器视口内`).toBeGreaterThanOrEqual(-tolerance);
    expect(box.right, `${box.label} 右侧应位于浏览器视口内`).toBeLessThanOrEqual(browserViewport.width + tolerance);
    expect(box.top, `${box.label} 顶部应位于浏览器视口内`).toBeGreaterThanOrEqual(-tolerance);
    expect(box.bottom, `${box.label} 底部应位于浏览器视口内`).toBeLessThanOrEqual(browserViewport.height + tolerance);
  }

  for (let firstIndex = 0; firstIndex < boxes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < boxes.length; secondIndex += 1) {
      const first = boxes[firstIndex];
      const second = boxes[secondIndex];
      const overlaps = first.left < second.right
        && first.right > second.left
        && first.top < second.bottom
        && first.bottom > second.top;
      expect(overlaps, `${first.label} 与 ${second.label} 不应重叠`).toBe(false);
    }
  }
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

test("directory status indicators, attention filter, and trash visibility follow the current contract", async ({ page }) => {
  await installInvokeContractMock(page);
  await page.goto("http://localhost:1420");

  const mainArea = page.getByTestId("main-area");
  await expect(mainArea).toHaveAttribute("data-sessions-state", "ready");

  const statusFilter = page.getByLabel("session-directory-status-filter");
  await expect(statusFilter).toBeEnabled();
  await expect(page.getByRole("img", { name: "目录不存在" })).toBeVisible();
  await expect(page.getByRole("img", { name: "没有访问权限" })).toBeVisible();

  const unknownIndicator = page.getByRole("img", { name: "目录状态未知：会话未记录工作目录" });
  await expect(unknownIndicator).toBeVisible();
  await expect(mainArea.getByText("未知目录", { exact: true })).toBeVisible();

  await unknownIndicator.focus();
  const unknownTooltip = unknownIndicator.locator(".directory-status-tooltip");
  await expect(unknownTooltip).toBeVisible();
  await expect(unknownTooltip).toHaveText("目录状态未知：会话未记录工作目录");

  await statusFilter.click();
  await page.getByRole("option", { name: "需要关注" }).getByRole("button").click();
  await expect(page.getByTestId("session-list-summary")).toContainText("目录状态：需要关注");

  await expandAllGroups(page);
  await expect(page.getByRole("button", { name: "迁移日志索引" })).toBeVisible();
  await expect(page.getByRole("button", { name: "修复受限目录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "整理未知目录会话" })).toBeVisible();
  await expect(page.getByRole("button", { name: "排查支付超时" })).toHaveCount(0);

  await expect(page.getByLabel("rescan-local-data")).toBeEnabled();
  await page.getByLabel("switch-trash").click();

  const sessionTable = page.getByRole("table", { name: "session-table" });
  const trashGroupToggle = sessionTable.getByLabel("toggle-group-D:\\Works\\workspace-missing");
  const trashSession = sessionTable.getByRole("button", { name: "回收站缺失目录会话" });
  await expect(page.getByTestId("session-list-summary")).toHaveText("当前 1 个会话");
  await expect(trashGroupToggle).toBeVisible();
  if (!await trashSession.isVisible()) {
    await trashGroupToggle.click();
  }
  await expect(trashSession).toHaveCount(1);
  await expect(trashSession).toBeVisible();

  const trashGroup = trashGroupToggle.locator("xpath=ancestor::*[@role='row'][1]");
  await expect(trashGroup.getByRole("img", { name: "目录不存在" })).toBeVisible();
  await expect(page.getByLabel("session-directory-status-filter")).toHaveCount(0);
  await expect(page.getByTestId("session-list-summary")).not.toContainText("目录状态：需要关注");
  await expect(page.getByTestId("session-list-summary")).not.toContainText("目录状态：");
});

test("toolbar controls remain separate at desktop and narrow supported widths", async ({ page }) => {
  await installInvokeContractMock(page);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1000, height: 760 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("http://localhost:1420");
    await expect(page.getByLabel("session-directory-status-filter")).toBeEnabled();
    await expectToolbarControlsNotToOverlap(page);
  }
});

test("overview sticky directory shows an in-viewport status tooltip while scrolling main sessions", async ({ page }) => {
  await page.addInitScript(() => {
    const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

    const sessions = [
      ...Array.from({ length: 18 }, (_, index) => ({
        sourceTool: "codex",
        sourceId: `sticky-${index + 1}`,
        title: `吸顶目录会话 ${index + 1}`,
        workspacePath: "D:\\Works\\sticky-demo",
        sourcePath: `D:\\Works\\sticky-demo\\.codex\\history\\sticky-${index + 1}.jsonl`,
        createdAt: "2026-04-21T09:00:00Z",
        updatedAt: "2026-04-21T12:00:00Z",
        sizeBytes: 1024,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        sourceTool: "claude",
        sourceId: `follow-${index + 1}`,
        title: `后续目录会话 ${index + 1}`,
        workspacePath: "D:\\Works\\follow-demo",
        sourcePath: `D:\\Works\\follow-demo\\.claude\\projects\\follow-${index + 1}.jsonl`,
        createdAt: "2026-04-20T09:00:00Z",
        updatedAt: "2026-04-20T12:00:00Z",
        sizeBytes: 512,
      })),
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
      if (command === "check_workspace_paths") {
        const paths = (args?.payload?.paths ?? []) as string[];
        return {
          results: paths.map((path) => path === "D:\\Works\\sticky-demo"
            ? { path, status: "unavailable", reason: "timeout" }
            : { path, status: "available" }),
        };
      }
      if (command === "list_trash_sessions") {
        return { rows: [] };
      }
      if (command === "get_session_detail") {
        return { detail: null };
      }
      if (command === "list_subagent_sessions") return { rows: [] };
      return null;
    };

    Object.assign(window as Record<string, unknown>, {
      __AI_SESSION_MANAGER_INVOKE_MOCK__: invokeMock,
    });
  });

  await page.goto("http://localhost:1420");
  await expect(page.locator("[data-testid='main-area']")).toHaveAttribute("data-sessions-state", "ready");

  await expandAllGroups(page);
  await expect(page.getByLabel(/^toggle-subagents-/)).toHaveCount(0);

  const tableContainer = page.locator(".table-container");
  const viewport = page.locator("[data-testid='session-table-viewport']");
  await expect(viewport).toBeVisible();

  await viewport.evaluate((element) => {
    element.scrollTop = 130;
    element.dispatchEvent(new Event("scroll"));
  });

  const stickyGroup = viewport.getByTestId("session-table-sticky-group");
  await expect(stickyGroup).toBeVisible();
  await expect(stickyGroup).toContainText("D:\\Works\\sticky-demo");
  await expect(stickyGroup).toContainText("18 个会话");

  const stickyStatus = stickyGroup.getByRole("img", { name: "检查超时" });
  await stickyGroup.getByLabel("toggle-sticky-group-D:\\Works\\sticky-demo").focus();
  await page.keyboard.press("Tab");
  await expect(stickyStatus).toBeFocused();
  const stickyTooltip = stickyStatus.locator(".directory-status-tooltip");
  await expect(stickyTooltip).toHaveClass(/directory-status-tooltip-below/);
  await expect(stickyTooltip).toBeVisible();

  const tooltipBounds = await stickyTooltip.boundingBox();
  const tableViewportBounds = await viewport.boundingBox();
  expect(tooltipBounds).not.toBeNull();
  expect(tableViewportBounds).not.toBeNull();
  expect(tooltipBounds!.x).toBeGreaterThanOrEqual(tableViewportBounds!.x);
  expect(tooltipBounds!.y).toBeGreaterThanOrEqual(tableViewportBounds!.y);
  expect(tooltipBounds!.x + tooltipBounds!.width)
    .toBeLessThanOrEqual(tableViewportBounds!.x + tableViewportBounds!.width);
  expect(tooltipBounds!.y + tooltipBounds!.height)
    .toBeLessThanOrEqual(tableViewportBounds!.y + tableViewportBounds!.height);

  const scrollState = await page.evaluate(() => {
    const tableContainer = document.querySelector(".table-container") as HTMLElement | null;
    const viewport = document.querySelector("[data-testid='session-table-viewport']") as HTMLElement | null;
    const sticky = document.querySelector("[data-testid='session-table-sticky-group']") as HTMLElement | null;
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
