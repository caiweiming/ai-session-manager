import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SessionTable } from "./SessionTable";

beforeEach(() => {
  window.localStorage.clear();
});

it("selects row and shows delete popover", async () => {
  render(<SessionTable rows={[{ id: "1", title: "A", tool: "codex" }]} />);
  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  fireEvent.click(screen.getByText("A"));
  expect(screen.getByText("A").closest(".session-row")).toHaveClass("selected");
  fireEvent.click(screen.getByLabelText("delete-row-1"));
  expect(screen.getByTestId("delete-popover")).toBeInTheDocument();
  expect(screen.getByText("移入回收站？")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("cancel-delete-popover"));
  expect(screen.queryByTestId("delete-popover")).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("delete-row-1"));
  fireEvent.click(screen.getByLabelText("confirm-delete-popover"));
  await waitFor(() => expect(screen.queryByTestId("delete-popover")).not.toBeInTheDocument());
});

it("toggles group rows with chevron", () => {
  render(<SessionTable rows={[{ id: "1", title: "A", tool: "codex" }]} />);
  expect(screen.queryByText("A")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  expect(screen.getByText("A")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  expect(screen.queryByText("A")).not.toBeInTheDocument();
});

it("does not render inline subagent toggle or expand subagent rows in the session list", async () => {
  render(
    <SessionTable
      rows={[
        {
          id: "codex:main-1",
          title: "主会话 A",
          tool: "codex",
          path: "D:\\Works\\demo",
          sourceTool: "codex",
          sourceId: "main-1",
        },
        {
          id: "codex:main-2",
          title: "主会话 B",
          tool: "codex",
          path: "D:\\Works\\demo",
          sourceTool: "codex",
          sourceId: "main-2",
        },
      ]}
    />,
  );

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  expect(screen.getByText("主会话 A")).toBeInTheDocument();
  expect(screen.queryByText("子会话 A-1")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("toggle-subagents-codex:main-1")).not.toBeInTheDocument();
  expect(screen.queryByText("0")).not.toBeInTheDocument();
});

it("checks row checkbox and emits selection", () => {
  const onSelectionChange = vi.fn();
  render(<SessionTable rows={[{ id: "1", title: "A", tool: "codex" }]} onSelectionChange={onSelectionChange} />);
  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  fireEvent.click(screen.getByLabelText("select-row-1"));
  expect(onSelectionChange).toHaveBeenLastCalledWith(["1"]);
  expect(screen.getByText("A").closest(".session-row")).toHaveClass("checked");
});

it("closes delete popover when row disappears after refresh", () => {
  const { rerender } = render(
    <SessionTable
      rows={[
        { id: "1", title: "A", tool: "codex" },
        { id: "2", title: "B", tool: "claude" },
      ]}
    />,
  );

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  fireEvent.click(screen.getByLabelText("delete-row-1"));
  expect(screen.getByTestId("delete-popover")).toBeInTheDocument();

  rerender(<SessionTable rows={[]} />);
  expect(screen.queryByTestId("delete-popover")).not.toBeInTheDocument();
});

it("confirm delete invokes callback with source identity", async () => {
  const onDeleteSession = vi.fn(async () => {});
  render(
    <SessionTable
      rows={[{ id: "1", title: "A", tool: "codex", sourceTool: "codex", sourceId: "session-1" }]}
      onDeleteSession={onDeleteSession}
    />,
  );

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  fireEvent.click(screen.getByLabelText("delete-row-1"));
  await act(async () => {
    fireEvent.click(screen.getByLabelText("confirm-delete-popover"));
  });

  await waitFor(() => {
    expect(onDeleteSession).toHaveBeenCalledWith("codex", "session-1");
    expect(screen.queryByTestId("delete-popover")).not.toBeInTheDocument();
  });
});

it("restores expanded group state from localStorage", () => {
  window.localStorage.setItem(
    "ai-session:session-table-expanded-groups:v1",
    JSON.stringify({ "d:\\works\\persist-demo": true }),
  );

  render(<SessionTable rows={[{ id: "1", title: "A", tool: "codex", path: "D:\\Works\\persist-demo" }]} />);

  expect(screen.getByText("A")).toBeInTheDocument();
});

it("highlights keyword in group path and session title", () => {
  render(
    <SessionTable
      rows={[
        {
          id: "1",
          title: "支付超时排查",
          tool: "codex",
          path: "D:\\Works\\支付项目",
        },
      ]}
      highlightKeyword="支付"
    />,
  );

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  const highlights = document.querySelectorAll(".search-highlight");
  expect(highlights.length).toBeGreaterThanOrEqual(2);
  expect(screen.getByRole("button", { name: "支付超时排查" })).toBeInTheDocument();
});

it("calls onResumeSession when clicking resume action", async () => {
  const onResumeSession = vi.fn();
  render(
    <SessionTable
      rows={[
        {
          id: "codex:1",
          title: "A",
          tool: "codex",
          sourceTool: "codex",
          sourceId: "session-1",
          path: "D:\\Works\\demo",
        },
      ]}
      onResumeSession={onResumeSession}
    />,
  );

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  await act(async () => {
    fireEvent.click(screen.getByLabelText("restore-row-codex:1"));
  });
  await waitFor(() => {
    expect(onResumeSession).toHaveBeenCalledWith({
      sourceTool: "codex",
      sourceId: "session-1",
      workspacePath: "D:\\Works\\demo",
    });
  });
});

it("disables resume action when terminal resume is unsupported", () => {
  const onResumeSession = vi.fn();
  render(
    <SessionTable
      rows={[
        {
          id: "codex:1",
          title: "A",
          tool: "codex",
          sourceTool: "codex",
          sourceId: "session-1",
          path: "D:\\Works\\demo",
        },
      ]}
      onResumeSession={onResumeSession}
      supportsResumeInTerminal={false}
    />,
  );

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  const restoreButton = screen.getByLabelText("restore-row-codex:1");
  expect(restoreButton).toBeDisabled();
  fireEvent.click(restoreButton);
  expect(onResumeSession).not.toHaveBeenCalled();
});

it("renders restore action only in trash mode", async () => {
  const onRestoreSession = vi.fn();
  render(
    <SessionTable
      rows={[
        {
          id: "codex:trash-1",
          title: "Trash A",
          tool: "codex",
          sourceTool: "codex",
          sourceId: "trash-1",
        },
      ]}
      viewMode="trash"
      onRestoreSession={onRestoreSession}
    />,
  );

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  expect(screen.getByLabelText("restore-trash-row-codex:trash-1")).toBeInTheDocument();
  expect(screen.queryByLabelText("restore-row-codex:trash-1")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("delete-row-codex:trash-1")).not.toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByLabelText("restore-trash-row-codex:trash-1"));
  });
  await waitFor(() => {
    expect(onRestoreSession).toHaveBeenCalledWith("codex", "trash-1");
  });
});

it("groups path variants as one multi-source workspace", () => {
  render(
    <SessionTable
      rows={[
        {
          id: "1",
          title: "Codex 会话",
          tool: "codex",
          path: "d:/Works/pojie/",
        },
        {
          id: "2",
          title: "Gemini 会话",
          tool: "gemini",
          path: "D:\\works\\pojie",
        },
      ]}
    />,
  );

  const toggles = screen.getAllByLabelText(/^toggle-group-/);
  expect(toggles).toHaveLength(1);
  expect(screen.getByText("多来源")).toBeInTheDocument();

  fireEvent.click(toggles[0]);
  expect(screen.getByText("Codex 会话")).toBeInTheDocument();
  expect(screen.getByText("Gemini 会话")).toBeInTheDocument();
});

it("renders dedicated checkbox classes for session table selection controls", () => {
  render(<SessionTable rows={[{ id: "1", title: "A", tool: "codex" }]} />);

  const selectAll = screen.getByLabelText("select-all-sessions");
  expect(selectAll).toHaveClass("session-table-checkbox");
  expect(selectAll.closest(".col-checkbox")).not.toBeNull();

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));

  expect(screen.getByLabelText(/^select-group-/)).toHaveClass("session-table-checkbox");
  expect(screen.getByLabelText("select-row-1")).toHaveClass("session-table-checkbox");
});

it("renders explicit checkbox indicator elements for session table controls", () => {
  render(<SessionTable rows={[{ id: "1", title: "A", tool: "codex" }]} />);

  const selectAll = screen.getByLabelText("select-all-sessions");
  expect(selectAll.nextElementSibling).toHaveClass("session-table-checkbox-indicator");

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));

  expect(screen.getByLabelText(/^select-group-/).nextElementSibling).toHaveClass("session-table-checkbox-indicator");
  expect(screen.getByLabelText("select-row-1").nextElementSibling).toHaveClass("session-table-checkbox-indicator");
});

it("adds a checked class to the row checkbox wrapper after selection", () => {
  render(<SessionTable rows={[{ id: "1", title: "A", tool: "codex" }]} />);

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));

  const rowCheckbox = screen.getByLabelText("select-row-1");
  fireEvent.click(rowCheckbox);

  expect(rowCheckbox.closest(".session-table-checkbox-wrap")).toHaveClass("checked");
});

it("adds a checked class to the group checkbox wrapper after selection", () => {
  render(<SessionTable rows={[{ id: "1", title: "A", tool: "codex" }]} />);

  const groupCheckbox = screen.getByLabelText(/^select-group-/);
  fireEvent.click(groupCheckbox);

  expect(groupCheckbox.closest(".session-table-checkbox-wrap")).toHaveClass("checked");
});

it("keeps explicit checked classes in light theme after selecting a group checkbox", () => {
  document.documentElement.setAttribute("data-theme-mode", "light");

  render(<SessionTable rows={[{ id: "1", title: "A", tool: "codex" }]} />);

  const groupCheckbox = screen.getByLabelText(/^select-group-/);
  fireEvent.click(groupCheckbox);

  expect(groupCheckbox.closest(".session-table-checkbox-wrap")).toHaveClass("checked");
  expect(groupCheckbox.nextElementSibling).toHaveClass("checked");
});

it("keeps checked classes after hovering a selected group checkbox", () => {
  document.documentElement.setAttribute("data-theme-mode", "light");

  render(<SessionTable rows={[{ id: "1", title: "A", tool: "codex" }]} />);

  const groupCheckbox = screen.getByLabelText(/^select-group-/);
  fireEvent.click(groupCheckbox);
  fireEvent.mouseEnter(groupCheckbox.closest(".session-table-checkbox-wrap") as HTMLElement);

  expect(groupCheckbox.closest(".session-table-checkbox-wrap")).toHaveClass("checked");
  expect(groupCheckbox.nextElementSibling).toHaveClass("checked");
});

it("renders a dedicated centered empty state container", () => {
  render(<SessionTable rows={[]} viewMode="trash" />);

  const emptyState = screen.getByText("暂无会话数据").closest(".session-table-empty-state");
  expect(emptyState).toBeInTheDocument();
});

it("renders only the visible window for expanded rows", () => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 220;
    },
  });

  const rows = Array.from({ length: 60 }, (_, index) => ({
    id: `codex:${index + 1}`,
    title: `会话 ${index + 1}`,
    tool: "codex",
    path: "D:\\Works\\virtual-demo",
    sourceTool: "codex",
    sourceId: `session-${index + 1}`,
  }));

  render(<SessionTable rows={rows} />);
  fireEvent.click(screen.getByLabelText(/^toggle-group-/));

  expect(screen.getByText("会话 1")).toBeInTheDocument();
  expect(screen.queryByText("会话 60")).not.toBeInTheDocument();
  expect(document.querySelectorAll(".session-virtual-row").length).toBeLessThan(25);
});

it("updates rendered rows when the virtual viewport scrolls", () => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 220;
    },
  });

  const rows = Array.from({ length: 60 }, (_, index) => ({
    id: `codex:${index + 1}`,
    title: `会话 ${index + 1}`,
    tool: "codex",
    path: "D:\\Works\\virtual-scroll",
  }));

  render(<SessionTable rows={rows} />);
  fireEvent.click(screen.getByLabelText(/^toggle-group-/));

  const viewport = screen.getByTestId("session-table-viewport");
  fireEvent.scroll(viewport, { target: { scrollTop: 700 } });

  expect(screen.queryByText("会话 1")).not.toBeInTheDocument();
  expect(screen.getByText("会话 15")).toBeInTheDocument();
});

it("keeps selection and delete popover behavior after virtualization", async () => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 220;
    },
  });

  const onDeleteSession = vi.fn(async () => {});

  render(
    <SessionTable
      rows={[{ id: "1", title: "A", tool: "codex", sourceTool: "codex", sourceId: "session-1" }]}
      onDeleteSession={onDeleteSession}
    />,
  );

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  fireEvent.click(screen.getByLabelText("select-row-1"));
  fireEvent.click(screen.getByLabelText("delete-row-1"));

  expect(screen.getByTestId("delete-popover")).toBeInTheDocument();
  expect(screen.getByLabelText("select-row-1")).toBeChecked();
});

it("expands the rendered window when viewport height becomes larger after mount", async () => {
  let currentHeight = 220;
  let resizeObserverCallback: ResizeObserverCallback | null = null;

  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.getAttribute("data-testid") === "session-table-viewport"
        ? currentHeight
        : 220;
    },
  });

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
    constructor(callback: ResizeObserverCallback) {
      resizeObserverCallback = callback;
    }
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);

  const rows = Array.from({ length: 60 }, (_, index) => ({
    id: `codex:${index + 1}`,
    title: `会话 ${index + 1}`,
    tool: "codex",
    path: "D:\\Works\\virtual-resize",
  }));

  render(<SessionTable rows={rows} />);
  fireEvent.click(screen.getByLabelText(/^toggle-group-/));

  expect(screen.queryByText("会话 18")).not.toBeInTheDocument();

  currentHeight = 900;
  act(() => {
    resizeObserverCallback?.([], {} as ResizeObserver);
  });

  await waitFor(() => {
    expect(screen.getByText("会话 18")).toBeInTheDocument();
  });

  vi.unstubAllGlobals();
});

it("measures viewport height after switching from empty state to loaded rows", async () => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.getAttribute("data-testid") === "session-table-viewport"
        ? 900
        : 220;
    },
  });

  const rows = Array.from({ length: 60 }, (_, index) => ({
    id: `codex:${index + 1}`,
    title: `会话 ${index + 1}`,
    tool: "codex",
    path: "D:\\Works\\virtual-empty-to-loaded",
  }));

  const { rerender } = render(<SessionTable rows={[]} />);
  rerender(<SessionTable rows={rows} />);
  fireEvent.click(screen.getByLabelText(/^toggle-group-/));

  await waitFor(() => {
    expect(screen.getByText("会话 18")).toBeInTheDocument();
  });
});

it("shows a sticky group row for the current expanded directory group", async () => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.getAttribute("data-testid") === "session-table-viewport"
        ? 220
        : 220;
    },
  });

  const rows = Array.from({ length: 18 }, (_, index) => ({
    id: `codex:main-${index + 1}`,
    title: `主会话 ${index + 1}`,
    tool: "codex",
    path: "D:\\Works\\sticky-demo",
    sourceTool: "codex",
    sourceId: `main-${index + 1}`,
  }));

  render(<SessionTable rows={rows} />);

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));
  expect(screen.queryByTestId("session-table-sticky-group")).not.toBeInTheDocument();

  const viewport = screen.getByTestId("session-table-viewport");
  fireEvent.scroll(viewport, { target: { scrollTop: 130 } });

  const stickyGroup = await within(viewport).findByTestId("session-table-sticky-group");
  expect(stickyGroup).toHaveTextContent("D:\\Works\\sticky-demo");
  expect(stickyGroup).toHaveTextContent("18 个会话");
});

it("hides the original directory row while the same sticky group is active", async () => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.getAttribute("data-testid") === "session-table-viewport"
        ? 220
        : 220;
    },
  });

  render(
    <SessionTable
      rows={Array.from({ length: 6 }, (_, index) => ({
        id: `codex:hide-${index + 1}`,
        title: `隐藏测试会话 ${index + 1}`,
        tool: "codex",
        path: "D:\\Works\\sticky-hide-source",
        sourceTool: "codex",
        sourceId: `hide-${index + 1}`,
      }))}
    />,
  );

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));

  const viewport = screen.getByTestId("session-table-viewport");
  fireEvent.scroll(viewport, { target: { scrollTop: 8 } });

  expect(await within(viewport).findByTestId("session-table-sticky-group")).toHaveTextContent("D:\\Works\\sticky-hide-source");
  expect(screen.getByLabelText(/^toggle-group-/).closest(".group-header")).toHaveClass("sticky-source-hidden");
});

it("switches sticky group after scrolling into the next directory group", async () => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.getAttribute("data-testid") === "session-table-viewport"
        ? 220
        : 220;
    },
  });

  render(
    <SessionTable
      rows={[
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `codex:first-${index + 1}`,
          title: `第一组会话 ${index + 1}`,
          tool: "codex",
          path: "D:\\Works\\sticky-switch-a",
          sourceTool: "codex",
          sourceId: `first-${index + 1}`,
        })),
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `codex:second-${index + 1}`,
          title: `第二组会话 ${index + 1}`,
          tool: "codex",
          path: "D:\\Works\\sticky-switch-b",
          sourceTool: "codex",
          sourceId: `second-${index + 1}`,
        })),
      ]}
    />,
  );

  fireEvent.click(screen.getAllByLabelText(/^toggle-group-/)[1]);
  fireEvent.click(screen.getAllByLabelText(/^toggle-group-/)[0]);

  const viewport = screen.getByTestId("session-table-viewport");
  fireEvent.scroll(viewport, { target: { scrollTop: 130 } });
  expect(await within(viewport).findByTestId("session-table-sticky-group")).toHaveTextContent("D:\\Works\\sticky-switch-a");

  fireEvent.scroll(viewport, { target: { scrollTop: 580 } });
  expect(await within(viewport).findByTestId("session-table-sticky-group")).toHaveTextContent("D:\\Works\\sticky-switch-b");

  fireEvent.scroll(viewport, { target: { scrollTop: 650 } });
  expect(await within(viewport).findByTestId("session-table-sticky-group")).toHaveTextContent("D:\\Works\\sticky-switch-b");
});

it("shows sticky group as soon as the expanded directory group starts leaving the top edge", async () => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.getAttribute("data-testid") === "session-table-viewport"
        ? 220
        : 220;
    },
  });

  render(
    <SessionTable
      rows={Array.from({ length: 6 }, (_, index) => ({
        id: `codex:edge-${index + 1}`,
        title: `Edge 会话 ${index + 1}`,
        tool: "codex",
        path: "D:\\Works\\sticky-edge",
        sourceTool: "codex",
        sourceId: `edge-${index + 1}`,
      }))}
    />,
  );

  fireEvent.click(screen.getByLabelText(/^toggle-group-/));

  const viewport = screen.getByTestId("session-table-viewport");
  expect(screen.queryByTestId("session-table-sticky-group")).not.toBeInTheDocument();
  fireEvent.scroll(viewport, { target: { scrollTop: 80 } });

  expect(await within(viewport).findByTestId("session-table-sticky-group")).toHaveTextContent("D:\\Works\\sticky-edge");
});
