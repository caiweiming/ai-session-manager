import { describe, expect, it } from "vitest";
import {
  buildGroups,
  formatRelativeTimestampForDisplay,
  normalizeSessionTableRows,
  normalizeGroupPath,
} from "./sessionTableUtils";
import type { SessionTableRow } from "./sessionTableTypes";

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

  it("normalizes empty paths to unknown group", () => {
    expect(normalizeGroupPath("   ")).toEqual({
      key: "unknown-path",
      display: "未知路径",
    });
  });

  it("formats table update timestamps with date and minute precision", () => {
    const now = new Date(2026, 7, 25, 16, 30, 0);

    expect(formatRelativeTimestampForDisplay("2026-08-25 09:12:43", now)).toBe("2026-08-25 09:12");
    expect(formatRelativeTimestampForDisplay("2026-08-24 18:05:00", now)).toBe("2026-08-24 18:05");
    expect(formatRelativeTimestampForDisplay("2026-08-20 08:30:00", now)).toBe("2026-08-20 08:30");
    expect(formatRelativeTimestampForDisplay("未知时间", now)).toBe("未知时间");
  });
});
