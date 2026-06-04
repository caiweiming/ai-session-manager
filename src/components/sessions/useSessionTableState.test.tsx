import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useSessionTableState } from "./useSessionTableState";
import { normalizeSessionTableRows } from "./sessionTableUtils";

beforeEach(() => {
  window.localStorage.clear();
});

it("tracks selection, group expansion, and prunes state when rows change", () => {
  const normalizedRows = normalizeSessionTableRows([
    {
      id: "codex:1",
      title: "A",
      tool: "codex",
      path: "D:\\Works\\demo",
    },
    {
      id: "codex:2",
      title: "B",
      tool: "codex",
      path: "D:\\Works\\demo",
    },
  ]);

  const onSelectionChange = vi.fn();
  const onGroupExpandStateChange = vi.fn();

  const { result, rerender } = renderHook(
    (props: {
      rowIds: string[];
      groupPaths: string[];
      onSelectionChange?: (ids: string[]) => void;
      onGroupExpandStateChange?: (state: { hasGroups: boolean; allExpanded: boolean; allCollapsed: boolean }) => void;
      expandAllTrigger?: number;
      collapseAllTrigger?: number;
    }) => useSessionTableState(props),
    {
      initialProps: {
        rowIds: normalizedRows.map((row) => row.id),
        groupPaths: ["d:\\works\\demo"],
        onSelectionChange,
        onGroupExpandStateChange,
      },
    },
  );

  act(() => {
    result.current.toggleRow("codex:1");
  });
  expect(onSelectionChange).toHaveBeenLastCalledWith(["codex:1"]);

  act(() => {
    result.current.toggleGroupExpanded("d:\\works\\demo");
  });
  expect(result.current.expandedGroups["d:\\works\\demo"]).toBe(true);

  rerender({
    rowIds: ["codex:2"],
    groupPaths: ["d:\\works\\demo"],
    onSelectionChange,
    onGroupExpandStateChange,
  });

  expect(result.current.selected).toEqual([]);
  expect(onGroupExpandStateChange).toHaveBeenLastCalledWith({
    hasGroups: true,
    allExpanded: true,
    allCollapsed: false,
  });
});

it("inherits expanded state for new groups after expand-all style refresh", () => {
  const onGroupExpandStateChange = vi.fn();

  const { result, rerender } = renderHook(
    (props: {
      rowIds: string[];
      groupPaths: string[];
      onSelectionChange?: (ids: string[]) => void;
      onGroupExpandStateChange?: (state: { hasGroups: boolean; allExpanded: boolean; allCollapsed: boolean }) => void;
      expandAllTrigger?: number;
      collapseAllTrigger?: number;
    }) => useSessionTableState(props),
    {
      initialProps: {
        rowIds: ["codex:1"],
        groupPaths: ["d:\\works\\alpha"],
        onGroupExpandStateChange,
      },
    },
  );

  act(() => {
    result.current.expandAllGroups();
  });

  rerender({
    rowIds: ["codex:2"],
    groupPaths: ["d:\\works\\beta"],
    onGroupExpandStateChange,
  });

  expect(result.current.expandedGroups["d:\\works\\beta"]).toBe(true);
  expect(onGroupExpandStateChange).toHaveBeenLastCalledWith({
    hasGroups: true,
    allExpanded: true,
    allCollapsed: false,
  });
});
