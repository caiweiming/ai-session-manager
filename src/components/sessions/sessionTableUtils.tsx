import type { ReactNode } from "react";
import { normalizeWindowsDriveLetter } from "../../lib/pathDisplay";
import { formatToolName, formatToolShortName } from "../../lib/toolDisplay";
import {
  normalizeWorkspacePath,
  UNKNOWN_WORKSPACE_DISPLAY,
  UNKNOWN_WORKSPACE_KEY,
  type WorkspaceStatusMap,
} from "../../lib/workspaceStatus";
import type {
  NormalizedSessionRow,
  SessionGroup,
  SessionSortMode,
  SessionTableRow,
} from "./sessionTableTypes";

const fallbackText = (value: string | undefined, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : fallback;
};

export const normalizeToolClass = (value: string) => {
  const safe = value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return safe || "unknown";
};

export const formatTimestampForDisplay = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "未知时间";
  return trimmed;
};

export const formatRelativeTimestampForDisplay = (value: string, now = new Date()) => {
  const displayValue = formatTimestampForDisplay(value);
  const parsed = new Date(value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return displayValue;
  void now;
  const time = `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")} ${time}`;
};

export const formatSizeForDisplay = (sizeBytes: number | null) => {
  if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes < 0) return "--";
  if (sizeBytes < 1024) return `${Math.round(sizeBytes)} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = sizeBytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1")} ${units[unitIndex]}`;
};

export const comparePath = (a: string, b: string) =>
  a.localeCompare(b, "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });

export const compareSize = (a: number | null, b: number | null, direction: "asc" | "desc") => {
  const left = a ?? -1;
  const right = b ?? -1;
  if (left === right) return 0;
  if (direction === "asc") return left < right ? -1 : 1;
  return left > right ? -1 : 1;
};

export const toWindowsLikePath = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  let normalized = trimmed.replace(/\//g, "\\");
  normalized = normalizeWindowsDriveLetter(normalized);

  const driveRootPattern = /^[A-Za-z]:\\$/;
  while (normalized.length > 1 && normalized.endsWith("\\") && !driveRootPattern.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
};

export const normalizeGroupPath = (raw: string) => {
  return normalizeWorkspacePath(raw);
};

export const normalizeSessionTableRows = (rows: SessionTableRow[]): NormalizedSessionRow[] => {
  return rows.map((row, index) => {
    const id = fallbackText(row.id, `session-${index + 1}`);
    const tool = fallbackText(row.tool, "unknown");
    const sourceTool = fallbackText(row.sourceTool, tool);
    const sourceId = fallbackText(row.sourceId, id);
    const rawPath = typeof row.path === "string" ? row.path.trim() : "";
    const explicitWorkspaceKey = typeof row.workspaceKey === "string" && row.workspaceKey.trim().length > 0;
    const workspaceKey = explicitWorkspaceKey
      ? row.workspaceKey as string
      : !rawPath
        ? UNKNOWN_WORKSPACE_KEY
        : normalizeGroupPath(rawPath).key;
    return {
      id,
      title: fallbackText(row.title, `未命名会话 ${index + 1}`),
      tool,
      toolLabel: formatToolName(tool),
      toolShortLabel: formatToolShortName(tool),
      toolClass: normalizeToolClass(tool),
      path: fallbackText(row.path, UNKNOWN_WORKSPACE_DISPLAY),
      workspaceKey,
      sizeBytes: typeof row.sizeBytes === "number" ? row.sizeBytes : null,
      isSubagent: row.isSubagent === true,
      parentSourceId: fallbackText(row.parentSourceId, "").trim() || undefined,
      createdAt: fallbackText(row.createdAt, fallbackText(row.updatedAt, "未知时间")),
      updatedAt: fallbackText(row.updatedAt, "未知时间"),
      sourceTool,
      sourceId,
    };
  });
};

export const buildGroups = (
  rows: NormalizedSessionRow[],
  groupPathHints: string[] = [],
  workspaceStatuses: WorkspaceStatusMap = {},
): SessionGroup[] => {
  const grouped = new Map<string, { displayPath: string; rows: NormalizedSessionRow[] }>();
  for (const row of rows) {
    const normalized = row.workspaceKey === UNKNOWN_WORKSPACE_KEY
      ? { key: UNKNOWN_WORKSPACE_KEY, display: UNKNOWN_WORKSPACE_DISPLAY }
      : { key: row.workspaceKey, display: normalizeGroupPath(row.path).display };
    const current = grouped.get(normalized.key);
    if (current) {
      current.rows.push(row);
      continue;
    }
    grouped.set(normalized.key, { displayPath: normalized.display, rows: [row] });
  }

  // Claude project hints describe discovered workspaces, not actionable sessions.
  // Empty hints stay out of the session table until an actual record is indexed.
  void groupPathHints;

  return Array.from(grouped.entries()).map(([groupKey, groupMeta]) => {
    const groupRows = groupMeta.rows;
    const toolClasses = new Set(groupRows.map((row) => row.toolClass));
    const mixedTools = toolClasses.size > 1;
    const toolLabel = mixedTools ? "多来源" : groupRows[0]?.toolLabel ?? "未知工具";
    const toolShortLabel = mixedTools ? "多来源" : groupRows[0]?.toolShortLabel ?? "未知";
    const toolClass = mixedTools ? "unknown" : groupRows[0]?.toolClass ?? "unknown";
    const createdAt = groupRows.reduce((earliest, row) => {
      const currentTs = row.createdAt;
      if (!currentTs || currentTs === "未知时间") return earliest;
      if (!earliest) return row.createdAt;
      if (currentTs < earliest) {
        return row.createdAt;
      }
      return earliest;
    }, "");
    const updatedAt = groupRows.reduce((latest, row) => {
      const currentTs = row.updatedAt;
      if (!currentTs || currentTs === "未知时间") return latest;
      if (!latest) return row.updatedAt;
      if (currentTs > latest) {
        return row.updatedAt;
      }
      return latest;
    }, "");
    return {
      groupKey,
      workspaceKey: groupRows[0]?.workspaceKey ?? UNKNOWN_WORKSPACE_KEY,
      directoryStatus: groupKey === UNKNOWN_WORKSPACE_KEY
        ? { status: "unknown", reason: "missing_workspace_path" }
        : workspaceStatuses[groupRows[0]?.workspaceKey ?? groupKey] ?? { status: "unchecked" },
      displayPath: groupMeta.displayPath,
      rows: groupRows,
      toolLabel,
      toolShortLabel,
      toolClass,
      totalSizeBytes: groupRows.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0),
      createdAt: createdAt || "--",
      updatedAt: updatedAt || "--",
    };
  });
};

export const sortSessionGroups = (
  rows: NormalizedSessionRow[],
  groupPathHints: string[],
  sortMode: SessionSortMode,
  workspaceStatuses: WorkspaceStatusMap = {},
) => {
  const base = buildGroups(rows, groupPathHints, workspaceStatuses).map((group) => ({
    ...group,
    rows: [...group.rows],
  }));

  if (sortMode === "default") {
    return base;
  }

  if (sortMode === "path_asc" || sortMode === "path_desc") {
    base.sort((a, b) => {
      const compared = comparePath(a.displayPath, b.displayPath);
      return sortMode === "path_asc" ? compared : -compared;
    });
    return base;
  }

  if (sortMode === "size_asc" || sortMode === "size_desc") {
    const direction = sortMode === "size_asc" ? "asc" : "desc";
    for (const group of base) {
      group.rows.sort((a, b) => {
        const compared = compareSize(a.sizeBytes, b.sizeBytes, direction);
        if (compared !== 0) return compared;
        return comparePath(a.title, b.title);
      });
    }
    base.sort((a, b) => {
      const compared = compareSize(a.totalSizeBytes, b.totalSizeBytes, direction);
      if (compared !== 0) return compared;
      return comparePath(a.displayPath, b.displayPath);
    });
    return base;
  }

  return base;
};

export const renderHighlightedText = (text: string, keyword: string): ReactNode => {
  if (!keyword) return text;

  const normalizedText = text.toLocaleLowerCase();
  const normalizedKeyword = keyword.toLocaleLowerCase();
  const chunks: ReactNode[] = [];
  let cursor = 0;
  let highlightIndex = 0;

  while (cursor < text.length) {
    const matchIndex = normalizedText.indexOf(normalizedKeyword, cursor);
    if (matchIndex === -1) {
      chunks.push(text.slice(cursor));
      break;
    }

    if (matchIndex > cursor) {
      chunks.push(text.slice(cursor, matchIndex));
    }

    const end = matchIndex + keyword.length;
    chunks.push(
      <mark className="search-highlight" key={`highlight-${highlightIndex}`}>
        {text.slice(matchIndex, end)}
      </mark>,
    );
    highlightIndex += 1;
    cursor = end;
  }

  return <>{chunks}</>;
};
