import { fireEvent, render, screen } from "@testing-library/react";
import {
  DirectoryStatusIndicator,
  SessionTableDataRow,
  SessionTableGroupRow,
  SessionTableStickyGroupRow,
} from "./SessionTableParts";
import { normalizeWorkspacePath } from "../../lib/workspaceStatus";
import { normalizeSessionTableRows, sortSessionGroups } from "./sessionTableUtils";

it.each([
  [{ status: "missing" as const }, "目录不存在"],
  [{ status: "unavailable" as const, reason: "permission_denied" as const }, "没有访问权限"],
  [{ status: "unknown" as const, reason: "missing_workspace_path" as const }, "目录状态未知：会话未记录工作目录"],
  [{ status: "checking" as const }, "正在检查目录状态"],
  [{ status: "unchecked" as const }, "目录状态未检查"],
])("renders a focusable non-button directory status indicator for %s", (info, label) => {
  render(<DirectoryStatusIndicator info={info} />);

  const indicator = screen.getByRole("img", { name: label });
  expect(indicator).toHaveAttribute("title", label);
  expect(indicator).toHaveAttribute("tabindex", "0");
  expect(indicator).toHaveClass("directory-status-indicator", `directory-status-${info.status}`);
  expect(indicator.tagName).toBe("SPAN");
  expect(indicator.querySelector(".directory-status-tooltip")).toHaveClass("directory-status-tooltip-above");
  expect(indicator.querySelector(".directory-status-tooltip")).toHaveTextContent(label);
  expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
});

it("places the sticky group tooltip below the pinned row", () => {
  const path = "D:\\Works\\sticky-tooltip";
  const workspaceKey = normalizeWorkspacePath(path).key;
  const rows = normalizeSessionTableRows([
    { id: "sticky-tooltip", title: "吸顶提示", tool: "codex", path, workspaceKey },
  ]);
  const group = sortSessionGroups(rows, [], "default", {
    [workspaceKey]: { status: "missing" },
  })[0];

  render(
    <SessionTableStickyGroupRow
      group={group}
      onToggleExpanded={vi.fn()}
      onOpenGroupPath={vi.fn()}
    />,
  );

  expect(screen.getByLabelText("目录不存在").querySelector(".directory-status-tooltip"))
    .toHaveClass("directory-status-tooltip-below");
});

it("does not render a directory status indicator for an available directory", () => {
  const { container } = render(<DirectoryStatusIndicator info={{ status: "available" }} />);

  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("places the directory status indicator after the group path text", () => {
  const rows = normalizeSessionTableRows([
    {
      id: "status-order",
      title: "状态顺序",
      tool: "codex",
      path: "D:\\Works\\status-order",
      workspaceKey: "d:\\works\\status-order",
    },
  ]);
  const group = sortSessionGroups(rows, [], "default", {
    "d:\\works\\status-order": { status: "missing" },
  })[0];

  render(
    <div role="table">
      <SessionTableGroupRow
        group={group}
        expanded={false}
        groupSelected={false}
        highlightKeyword=""
        onToggleRows={() => undefined}
        onToggleExpanded={() => undefined}
        onOpenGroupPath={() => undefined}
      />
    </div>,
  );

  const groupPathMain = document.querySelector(".group-path-main");
  expect(groupPathMain?.children[0]).toHaveClass("group-path-text");
  expect(groupPathMain?.children[1]).toHaveClass("directory-status-indicator");
});

it("keeps a real directory named like the legacy unknown label actionable", () => {
  const path = "未知路径";
  const rows = normalizeSessionTableRows([
    {
      id: "real-legacy-label",
      title: "真实目录",
      tool: "codex",
      path,
      workspaceKey: normalizeWorkspacePath(path).key,
    },
  ]);
  const group = sortSessionGroups(rows, [], "default", {
    [normalizeWorkspacePath(path).key]: { status: "available" },
  })[0];

  render(
    <SessionTableGroupRow
      group={group}
      expanded={false}
      groupSelected={false}
      highlightKeyword=""
      onToggleRows={vi.fn()}
      onToggleExpanded={vi.fn()}
      onOpenGroupPath={vi.fn()}
    />,
  );

  expect(screen.getByLabelText(`open-group-path-${path}`)).toBeEnabled();
});

it("renders group and session rows with action handlers in the virtual row layout", () => {
  const normalizedRows = normalizeSessionTableRows([
    {
      id: "codex:1",
      title: "主会话",
      tool: "codex",
      sourceTool: "codex",
      sourceId: "session-1",
      path: "D:\\Works\\demo",
      createdAt: "2026-08-20 09:15:00",
      updatedAt: "2026-08-20 10:30:00",
    },
    {
      id: "codex:2",
      title: "子会话",
      tool: "codex",
      sourceTool: "codex",
      sourceId: "session-2",
      path: "D:\\Works\\demo",
      isSubagent: true,
    },
  ]);
  const group = sortSessionGroups(normalizedRows, [], "default")[0];

  const onToggleGroupRows = vi.fn();
  const onToggleGroupExpanded = vi.fn();
  const onOpenGroupPath = vi.fn();
  const onToggleRow = vi.fn();
  const onActivateSession = vi.fn();
  const onResumeSession = vi.fn();
  const onRestoreSession = vi.fn();
  const onOpenDeletePopover = vi.fn();

  render(
    <div role="table">
      <SessionTableGroupRow
        group={group}
        expanded={true}
        groupSelected={true}
        highlightKeyword="会话"
        onToggleRows={onToggleGroupRows}
        onToggleExpanded={onToggleGroupExpanded}
        onOpenGroupPath={onOpenGroupPath}
      />
      <SessionTableDataRow
        row={normalizedRows[0]}
        active={true}
        checked={true}
        isLastChild={false}
        highlightKeyword="会话"
        viewMode="overview"
        resumeState="idle"
        supportsResumeInTerminal={true}
        onToggle={() => onToggleRow("codex:1")}
        onActivate={() => onActivateSession("codex:1")}
        onResume={() => onResumeSession(normalizedRows[0])}
        onRestore={() => onRestoreSession(normalizedRows[0])}
        onOpenDeletePopover={(event) => onOpenDeletePopover("codex:1", event)}
      />
    </div>,
  );

  fireEvent.click(screen.getByLabelText(`select-group-${group.displayPath}`));
  expect(onToggleGroupRows).toHaveBeenCalledWith(false);
  expect(screen.getByLabelText(`select-group-${group.displayPath}`).closest('[role="row"]')).toHaveClass("checked");

  fireEvent.click(screen.getByLabelText(`toggle-group-${group.displayPath}`));
  expect(onToggleGroupExpanded).toHaveBeenCalled();

  fireEvent.click(screen.getByLabelText(`open-group-path-${group.displayPath}`));
  expect(onOpenGroupPath).toHaveBeenCalled();

  fireEvent.click(screen.getByLabelText("select-row-codex:1"));
  expect(onToggleRow).toHaveBeenCalledWith("codex:1");

  fireEvent.click(screen.getByRole("button", { name: "主会话" }));
  expect(onActivateSession).toHaveBeenCalledWith("codex:1");

  fireEvent.click(screen.getByLabelText("restore-row-codex:1"));
  expect(onResumeSession).toHaveBeenCalledWith(normalizedRows[0]);

  fireEvent.click(screen.getByLabelText("delete-row-codex:1"));
  expect(onOpenDeletePopover).toHaveBeenCalled();

  expect(document.querySelector(".session-meta-text")).toHaveTextContent("主会话 · --");
  expect(document.querySelectorAll(".search-highlight").length).toBeGreaterThan(0);
  expect(screen.getAllByText("2026-08-20 10:30").length).toBeGreaterThan(0);
  expect(screen.getAllByTitle("2026-08-20 10:30:00")[0]).toHaveTextContent("2026-08-20 10:30");
  expect(screen.queryByTitle("2026-08-20 09:15:00")).not.toBeInTheDocument();
});
