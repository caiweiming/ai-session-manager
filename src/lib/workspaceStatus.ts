import type { WorkspacePathStatusReason } from "./tauriClient";

export type DirectoryStatus =
  | "checking"
  | "available"
  | "missing"
  | "unavailable"
  | "unknown"
  | "unchecked";

export type DirectoryStatusFilter =
  | "all"
  | "attention"
  | "missing"
  | "unavailable"
  | "unknown"
  | "available";

export type DirectoryStatusInfo = {
  status: DirectoryStatus;
  reason?: WorkspacePathStatusReason | "missing_workspace_path";
};

export type WorkspaceStatusMap = Record<string, DirectoryStatusInfo>;

export const UNKNOWN_WORKSPACE_KEY = "workspace:none";
export const UNKNOWN_WORKSPACE_DISPLAY = "未知目录";
const WORKSPACE_PATH_KEY_PREFIX = "workspace:path:";

export function getLegacyWorkspacePathKey(key: string): string | null {
  if (!key.startsWith(WORKSPACE_PATH_KEY_PREFIX)) return null;
  const legacyKey = key.slice(WORKSPACE_PATH_KEY_PREFIX.length);
  return legacyKey === "unknown-path" ? null : legacyKey;
}

export function normalizeWorkspacePath(path: string): { key: string; display: string } {
  const trimmed = path.trim();
  if (!trimmed) {
    return { key: UNKNOWN_WORKSPACE_KEY, display: UNKNOWN_WORKSPACE_DISPLAY };
  }

  const isWindowsLike =
    /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.includes("\\") || trimmed.startsWith("\\\\");
  if (isWindowsLike) {
    let display = trimmed.replace(/\//g, "\\");
    if (/^[A-Za-z]:\\/.test(display)) {
      display = `${display.charAt(0).toUpperCase()}${display.slice(1)}`;
    }
    while (display.length > 1 && display.endsWith("\\") && !/^[A-Za-z]:\\$/.test(display)) {
      display = display.slice(0, -1);
    }
    return { key: `${WORKSPACE_PATH_KEY_PREFIX}${display.toLowerCase()}`, display };
  }

  const display = trimmed.replace(/\/+$/, "") || "/";
  return { key: `${WORKSPACE_PATH_KEY_PREFIX}${display}`, display };
}

export function matchesDirectoryStatus(status: DirectoryStatus, filter: DirectoryStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") {
    return status === "missing" || status === "unavailable" || status === "unknown";
  }
  return status === filter;
}

export function getDirectoryStatusLabel(info: DirectoryStatusInfo): string {
  if (info.status === "checking") return "正在检查目录状态";
  if (info.status === "available") return "目录可用";
  if (info.status === "missing") return "目录不存在";
  if (info.status === "unknown") {
    return info.reason === "missing_workspace_path"
      ? "目录状态未知：会话未记录工作目录"
      : "目录状态未知";
  }
  if (info.status === "unchecked") return "目录状态未检查";

  switch (info.reason) {
    case "permission_denied":
      return "没有访问权限";
    case "not_directory":
      return "路径存在但不是目录";
    case "timeout":
      return "检查超时";
    case "storage_unavailable":
      return "存储位置暂时不可用";
    default:
      return "目录暂时不可用";
  }
}
