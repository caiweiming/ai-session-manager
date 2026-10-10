import { describe, expect, it } from "vitest";
import {
  getDirectoryStatusLabel,
  matchesDirectoryStatus,
  normalizeWorkspacePath,
  UNKNOWN_WORKSPACE_KEY,
} from "./workspaceStatus";

describe("normalizeWorkspacePath", () => {
  it("normalizes Windows separators, drive letter, trailing separators, and case-insensitive key", () => {
    expect(normalizeWorkspacePath("  d:/Works/Project///  ")).toEqual({
      key: "workspace:path:d:\\works\\project",
      display: "D:\\Works\\Project",
    });
    expect(normalizeWorkspacePath("D:\\WORKS\\PROJECT\\").key).toBe("workspace:path:d:\\works\\project");
  });

  it("preserves Windows drive roots and trims trailing separators on POSIX paths", () => {
    expect(normalizeWorkspacePath("d:/")).toEqual({ key: "workspace:path:d:\\", display: "D:\\" });
    expect(normalizeWorkspacePath("/srv/project///")).toEqual({
      key: "workspace:path:/srv/project",
      display: "/srv/project",
    });
  });

  it("keeps the unknown identity disjoint from every real relative path", () => {
    expect(normalizeWorkspacePath("unknown-path").key).toBe("workspace:path:unknown-path");
    expect(normalizeWorkspacePath("unknown-path").key).not.toBe(UNKNOWN_WORKSPACE_KEY);
    expect(normalizeWorkspacePath("   ").key).toBe(UNKNOWN_WORKSPACE_KEY);
  });

  it("maps blank paths to the shared unknown workspace key", () => {
    expect(normalizeWorkspacePath("   ")).toEqual({
      key: UNKNOWN_WORKSPACE_KEY,
      display: "未知目录",
    });
  });
});

describe("matchesDirectoryStatus", () => {
  it("matches attention only for missing, unavailable, and unknown", () => {
    expect(
      ["checking", "available", "missing", "unavailable", "unknown", "unchecked"].filter((status) =>
        matchesDirectoryStatus(status as Parameters<typeof matchesDirectoryStatus>[0], "attention"),
      ),
    ).toEqual(["missing", "unavailable", "unknown"]);
  });

  it("matches all statuses for all and exact stable statuses for specific filters", () => {
    expect(matchesDirectoryStatus("checking", "all")).toBe(true);
    expect(matchesDirectoryStatus("missing", "missing")).toBe(true);
    expect(matchesDirectoryStatus("unavailable", "missing")).toBe(false);
    expect(matchesDirectoryStatus("available", "available")).toBe(true);
  });
});

describe("getDirectoryStatusLabel", () => {
  it.each([
    [{ status: "checking" as const }, "正在检查目录状态"],
    [{ status: "available" as const }, "目录可用"],
    [{ status: "missing" as const }, "目录不存在"],
    [{ status: "unavailable" as const, reason: "permission_denied" as const }, "没有访问权限"],
    [{ status: "unavailable" as const, reason: "not_directory" as const }, "路径存在但不是目录"],
    [{ status: "unavailable" as const, reason: "timeout" as const }, "检查超时"],
    [{ status: "unavailable" as const, reason: "storage_unavailable" as const }, "存储位置暂时不可用"],
    [{ status: "unavailable" as const, reason: "io_error" as const }, "目录暂时不可用"],
    [{ status: "unknown" as const, reason: "missing_workspace_path" as const }, "目录状态未知：会话未记录工作目录"],
    [{ status: "unchecked" as const }, "目录状态未检查"],
  ])("returns a stable Chinese label for %o", (info, expected) => {
    expect(getDirectoryStatusLabel(info)).toBe(expected);
  });
});
