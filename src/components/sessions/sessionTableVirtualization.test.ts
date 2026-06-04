import { describe, expect, it } from "vitest";
import { normalizeSessionTableRows, sortSessionGroups } from "./sessionTableUtils";
import {
  buildVirtualSessionRows,
  getVirtualWindow,
  GROUP_ROW_HEIGHT,
  SESSION_ROW_HEIGHT,
} from "./sessionTableVirtualization";

describe("sessionTableVirtualization", () => {
  it("flattens expanded and collapsed groups into virtual rows", () => {
    const rows = normalizeSessionTableRows([
      { id: "codex:1", title: "A", tool: "codex", path: "D:\\Works\\demo" },
      { id: "claude:3", title: "C", tool: "claude", path: "D:\\Works\\other" },
    ]);
    const groups = sortSessionGroups(rows, [], "default");

    const flattened = buildVirtualSessionRows(
      groups,
      {
        "d:\\works\\demo": true,
        "d:\\works\\other": false,
      },
    );

    expect(flattened.map((row) => `${row.type}:${row.key}`)).toEqual([
      "group:group-d:\\works\\demo",
      "session:codex:1",
      "group:group-d:\\works\\other",
    ]);
    expect(flattened[1]).toMatchObject({
      type: "session",
      key: "codex:1",
      isLastChild: true,
      height: SESSION_ROW_HEIGHT,
    });
    expect(flattened[0]).toMatchObject({
      type: "group",
      key: "group-d:\\works\\demo",
      height: GROUP_ROW_HEIGHT,
    });
  });

  it("calculates a bounded virtual window with overscan", () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      key: `row-${index}`,
      type: "group" as const,
      height: GROUP_ROW_HEIGHT,
    }));

    const windowState = getVirtualWindow(rows, {
      viewportHeight: GROUP_ROW_HEIGHT * 3,
      scrollTop: GROUP_ROW_HEIGHT * 5,
      overscan: 1,
    });

    expect(windowState.startIndex).toBe(4);
    expect(windowState.endIndex).toBe(8);
    expect(windowState.visibleStartIndex).toBe(5);
    expect(windowState.visibleEndIndex).toBe(7);
    expect(windowState.items.map((item) => item.key)).toEqual([
      "row-4",
      "row-5",
      "row-6",
      "row-7",
      "row-8",
    ]);
    expect(windowState.paddingTop).toBe(GROUP_ROW_HEIGHT * 4);
    expect(windowState.paddingBottom).toBe(GROUP_ROW_HEIGHT * 11);
    expect(windowState.totalHeight).toBe(GROUP_ROW_HEIGHT * 20);
  });

  it("only renders main sessions in the session list rows", () => {
    const rows = normalizeSessionTableRows([
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
      {
        id: "codex:sub-1",
        title: "子会话 A-1",
        tool: "codex",
        path: "D:\\Works\\demo",
        sourceTool: "codex",
        sourceId: "sub-1",
        isSubagent: true,
        parentSourceId: "main-1",
      },
    ]);
    const groups = sortSessionGroups(rows, [], "default");

    const flattened = buildVirtualSessionRows(
      groups,
      {
        "d:\\works\\demo": true,
      },
    );

    expect(flattened.map((row) => `${row.type}:${row.key}`)).toEqual([
      "group:group-d:\\works\\demo",
      "session:codex:main-1",
      "session:codex:main-2",
    ]);
  });
});
