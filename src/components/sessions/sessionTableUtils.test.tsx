import { describe, expect, it } from "vitest";
import {
  buildGroups,
  formatRelativeTimestampForDisplay,
  normalizeSessionTableRows,
  normalizeGroupPath,
} from "./sessionTableUtils";
import type { SessionTableRow } from "./sessionTableTypes";
import { UNKNOWN_WORKSPACE_KEY } from "../../lib/workspaceStatus";

describe("sessionTableUtils", () => {
  it("normalizes row identity and fallback fields", () => {
    const rows: SessionTableRow[] = [
      {
        title: "  会话 A  ",
        tool: "codex",
        sourceTool: "codex",
        sourceId: "session-a",
        path: "d:/Works/demo/",
        updatedAt: "2026-05-01T09:00:00Z",
      },
    ];

    const normalized = normalizeSessionTableRows(rows);
    expect(normalized[0]).toMatchObject({
      id: "session-1",
      title: "  会话 A  ",
      sourceTool: "codex",
      sourceId: "session-a",
      path: "d:/Works/demo/",
      updatedAt: "2026-05-01T09:00:00Z",
    });
  });

  it("groups windows path variants without rendering empty project hints", () => {
    const rows = normalizeSessionTableRows([
      {
        id: "1",
        title: "Codex 会话",
        tool: "codex",
        path: "d:/Works/pojie/",
        updatedAt: "2026-05-01T09:00:00Z",
      },
      {
        id: "2",
        title: "Gemini 会话",
        tool: "gemini",
        path: "D:\\works\\pojie",
        updatedAt: "2026-05-01T10:00:00Z",
      },
    ]);

    const groups = buildGroups(rows, ["D:\\Works\\missing-project"]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      displayPath: "D:\\Works\\pojie",
      toolLabel: "多来源",
    });
    expect(groups[0]?.rows).toHaveLength(2);
  });

  it("uses the shared workspace key to preserve a checking status across Windows path variants", () => {
    const rows = normalizeSessionTableRows([
      {
        id: "1",
        tool: "codex",
        path: "d:/Works/status-demo/",
        workspaceKey: "d:\\works\\status-demo",
      },
      {
        id: "2",
        tool: "gemini",
        path: "D:\\works\\status-demo",
        workspaceKey: "d:\\works\\status-demo",
      },
    ]);

    const groups = buildGroups(rows, [], {
      "d:\\works\\status-demo": { status: "checking" },
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      workspaceKey: "d:\\works\\status-demo",
      directoryStatus: { status: "checking" },
    });
    expect(groups[0]?.rows.map((row) => row.workspaceKey)).toEqual([
      "d:\\works\\status-demo",
      "d:\\works\\status-demo",
    ]);
  });

  it("forces the unknown directory group to use the missing workspace path reason", () => {
    const rows = normalizeSessionTableRows([
      {
        id: "unknown",
        tool: "codex",
        path: "",
        workspaceKey: UNKNOWN_WORKSPACE_KEY,
      },
    ]);

    const groups = buildGroups(rows, [], {
      [UNKNOWN_WORKSPACE_KEY]: { status: "available" },
    });

    expect(groups[0]).toMatchObject({
      groupKey: UNKNOWN_WORKSPACE_KEY,
      workspaceKey: UNKNOWN_WORKSPACE_KEY,
      displayPath: "未知目录",
      directoryStatus: {
        status: "unknown",
        reason: "missing_workspace_path",
      },
    });
  });

  it.each([""])(
    "maps an empty path %s without workspaceKey to the unknown directory status",
    (path) => {
      const rows = normalizeSessionTableRows([
        {
          id: `legacy-${path || "empty"}`,
          tool: "codex",
          path,
        },
      ]);

      const groups = buildGroups(rows);

      expect(rows[0]?.workspaceKey).toBe(UNKNOWN_WORKSPACE_KEY);
      expect(groups[0]).toMatchObject({
        workspaceKey: UNKNOWN_WORKSPACE_KEY,
        directoryStatus: {
          status: "unknown",
          reason: "missing_workspace_path",
        },
      });
    },
  );

  it.each(["未知路径", "未知目录"])(
    "keeps a real path named %s separate from the unknown directory identity",
    (path) => {
      const rows = normalizeSessionTableRows([{ id: path, tool: "codex", path }]);

      expect(rows[0]?.workspaceKey).not.toBe(UNKNOWN_WORKSPACE_KEY);
      expect(buildGroups(rows)[0]).toMatchObject({
        displayPath: path,
        directoryStatus: { status: "unchecked" },
      });
    },
  );

  it("normalizes empty paths to unknown group", () => {
    expect(normalizeGroupPath("   ")).toEqual({
      key: UNKNOWN_WORKSPACE_KEY,
      display: "未知目录",
    });
  });

  it("does not default a real group with a missing status result to available", () => {
    const rows = normalizeSessionTableRows([
      { id: "unchecked", tool: "codex", path: "D:\\Works\\unchecked" },
    ]);

    expect(buildGroups(rows)[0]?.directoryStatus).toEqual({ status: "unchecked" });
  });

  it("formats table update timestamps with date and minute precision", () => {
    const now = new Date(2026, 7, 25, 16, 30, 0);

    expect(formatRelativeTimestampForDisplay("2026-08-25 09:12:43", now)).toBe("2026-08-25 09:12");
    expect(formatRelativeTimestampForDisplay("2026-08-24 18:05:00", now)).toBe("2026-08-24 18:05");
    expect(formatRelativeTimestampForDisplay("2026-08-20 08:30:00", now)).toBe("2026-08-20 08:30");
    expect(formatRelativeTimestampForDisplay("未知时间", now)).toBe("未知时间");
  });
});
