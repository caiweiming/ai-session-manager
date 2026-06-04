import { fireEvent, render, screen } from "@testing-library/react";
import {
  SessionTableDataRow,
  SessionTableGroupRow,
} from "./SessionTableParts";
import { normalizeSessionTableRows, sortSessionGroups } from "./sessionTableUtils";

it("renders group and session rows with action handlers in the virtual row layout", () => {
  const normalizedRows = normalizeSessionTableRows([
    {
      id: "codex:1",
      title: "主会话",
      tool: "codex",
      sourceTool: "codex",
      sourceId: "session-1",
      path: "D:\\Works\\demo",
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
        groupSelected={false}
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
  expect(onToggleGroupRows).toHaveBeenCalledWith(true);

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

  expect(screen.getByText("主会话")).toBeInTheDocument();
  expect(document.querySelectorAll(".search-highlight").length).toBeGreaterThan(0);
});
