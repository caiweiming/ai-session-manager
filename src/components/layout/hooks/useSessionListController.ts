import { useCallback, useEffect, useMemo, useState } from "react";
import { type OverviewSummary, api, type SessionRow as ApiSessionRow } from "../../../lib/tauriClient";
import {
  matchesDirectoryStatus,
  normalizeWorkspacePath,
  UNKNOWN_WORKSPACE_KEY,
  type DirectoryStatusFilter,
  type WorkspaceStatusMap,
} from "../../../lib/workspaceStatus";
import { type SessionTableRow } from "../../sessions/SessionTable";

type BootstrapState = "loading" | "ready" | "error";
type SessionViewMode = "overview" | "trash";
type SessionsState = "loading" | "ready" | "error";
type DirectoryStatusPhase = "idle" | "checking" | "ready" | "unchecked";
type SessionListRow = SessionTableRow & { workspaceKey: string };
const SEARCH_DEBOUNCE_MS = 180;

type UseSessionListControllerProps = {
  workspaceReady: boolean;
  bootstrapState: BootstrapState;
  scanVersion: number;
  claudeProjectPaths: string[];
};

const mapApiRows = (rows: ApiSessionRow[]): SessionListRow[] => {
  return rows.map((row, index) => {
    const workspace = normalizeWorkspacePath(row.workspacePath ?? "");
    return {
      id: `${row.sourceTool || "unknown"}:${row.sourceId || `session-${index + 1}`}`,
      title: row.title || `未命名会话 ${index + 1}`,
      tool: row.sourceTool || "unknown",
      path: workspace.display,
      workspaceKey: workspace.key,
      sizeBytes: row.sizeBytes,
      isSubagent: row.isSubagent ?? false,
      parentSourceId: row.parentSourceId,
      createdAt: row.createdAt || row.updatedAt || "未知时间",
      updatedAt: row.updatedAt || "未知时间",
      sourceTool: row.sourceTool || "unknown",
      sourceId: row.sourceId || `session-${index + 1}`,
    };
  });
};

export function useSessionListController({
  workspaceReady,
  bootstrapState,
  scanVersion,
  claudeProjectPaths,
}: UseSessionListControllerProps) {
  const [rawRows, setRawRows] = useState<SessionListRow[]>([]);
  const [overviewSummary, setOverviewSummary] = useState<OverviewSummary | null>(null);
  const [sessionsState, setSessionsState] = useState<SessionsState>("loading");
  const [directoryStatusPhase, setDirectoryStatusPhase] = useState<DirectoryStatusPhase>("idle");
  const [directoryStatusError, setDirectoryStatusError] = useState<string | null>(null);
  const [workspaceStatuses, setWorkspaceStatuses] = useState<WorkspaceStatusMap>({});
  const [directoryStatusFilter, setDirectoryStatusFilter] = useState<DirectoryStatusFilter>("all");
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<SessionViewMode>("overview");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [debouncedSearchKeyword, setDebouncedSearchKeyword] = useState("");
  const [updatedWithinDays, setUpdatedWithinDays] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const canLoadSessionData = workspaceReady && bootstrapState === "ready" && scanVersion >= 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchKeyword(searchKeyword);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchKeyword]);

  useEffect(() => {
    if (bootstrapState === "error") {
      setRawRows([]);
      setSessionsState("error");
      return;
    }
    if (!canLoadSessionData) {
      return;
    }

    let cancelled = false;

    const loadOverviewSummary = async () => {
      try {
        const summary = await api.getOverviewSummary();
        if (!cancelled) {
          setOverviewSummary(summary);
        }
      } catch {
        if (!cancelled) {
          setOverviewSummary(null);
        }
      }
    };

    void loadOverviewSummary();

    return () => {
      cancelled = true;
    };
  }, [bootstrapState, canLoadSessionData, reloadToken, scanVersion]);

  useEffect(() => {
    if (!overviewSummary) return;
    if (selectedTool && !overviewSummary.toolStats.some((tool) => tool.sourceTool === selectedTool)) {
      if (overviewSummary.toolStats.some((tool) => tool.sourceTool === "codex")) {
        setSelectedTool("codex");
      } else {
        setSelectedTool(null);
      }
    }
  }, [overviewSummary, selectedTool]);

  useEffect(() => {
    if (bootstrapState === "error") {
      setRawRows([]);
      setSessionsState("error");
      return;
    }
    if (!canLoadSessionData) {
      return;
    }

    let cancelled = false;
    const trimmedKeyword = debouncedSearchKeyword.trim();
    const payload = {
      ...(selectedTool ? { tool: selectedTool } : {}),
      ...(updatedWithinDays !== null ? { updatedWithinDays } : {}),
      ...(trimmedKeyword.length > 0 ? { keyword: trimmedKeyword } : {}),
      page: 1,
      pageSize: 1000,
    };

    const loadSessions = async () => {
      if (rawRows.length === 0) {
        setSessionsState("loading");
      }
      try {
        const result = viewMode === "trash" ? await api.listTrashSessions(payload) : await api.listSessions(payload);
        if (!cancelled) {
          setRawRows(mapApiRows(result.rows));
          setSessionsState("ready");

          const uniquePaths = new Map<string, string>();
          let hasUnknownWorkspace = false;
          for (const row of result.rows) {
            const workspacePath = row.workspacePath?.trim();
            if (!workspacePath) {
              hasUnknownWorkspace = true;
              continue;
            }
            const key = normalizeWorkspacePath(workspacePath).key;
            if (!uniquePaths.has(key)) uniquePaths.set(key, row.workspacePath!);
          }

          const checkingStatuses: WorkspaceStatusMap = hasUnknownWorkspace
            ? {
                [UNKNOWN_WORKSPACE_KEY]: {
                  status: "unknown",
                  reason: "missing_workspace_path",
                },
              }
            : {};
          for (const key of uniquePaths.keys()) {
            checkingStatuses[key] = { status: "checking" };
          }
          setWorkspaceStatuses(checkingStatuses);
          setDirectoryStatusError(null);

          if (uniquePaths.size === 0) {
            setDirectoryStatusPhase("ready");
            return;
          }

          setDirectoryStatusPhase("checking");

          void api
            .checkWorkspacePaths({ paths: Array.from(uniquePaths.values()) })
            .then((response) => {
              if (cancelled) return;
              const resolvedStatuses: WorkspaceStatusMap = hasUnknownWorkspace
                ? {
                    [UNKNOWN_WORKSPACE_KEY]: {
                      status: "unknown",
                      reason: "missing_workspace_path",
                    },
                  }
                : {};
              const unresolvedKeys = new Set(uniquePaths.keys());
              for (const key of unresolvedKeys) {
                resolvedStatuses[key] = { status: "unchecked" };
              }
              for (const item of response.results) {
                const key = normalizeWorkspacePath(item.path).key;
                if (!unresolvedKeys.has(key)) continue;
                resolvedStatuses[key] = {
                  status: item.status,
                  ...(item.reason ? { reason: item.reason } : {}),
                };
                unresolvedKeys.delete(key);
              }
              setWorkspaceStatuses(resolvedStatuses);
              if (unresolvedKeys.size > 0) {
                setDirectoryStatusPhase("unchecked");
                setDirectoryStatusError("目录状态检查失败，请稍后重试");
                setDirectoryStatusFilter("all");
              } else {
                setDirectoryStatusPhase("ready");
                setDirectoryStatusError(null);
              }
            })
            .catch(() => {
              if (cancelled) return;
              const uncheckedStatuses: WorkspaceStatusMap = hasUnknownWorkspace
                ? {
                    [UNKNOWN_WORKSPACE_KEY]: {
                      status: "unknown",
                      reason: "missing_workspace_path",
                    },
                  }
                : {};
              for (const key of uniquePaths.keys()) {
                uncheckedStatuses[key] = { status: "unchecked" };
              }
              setWorkspaceStatuses(uncheckedStatuses);
              setDirectoryStatusPhase("unchecked");
              setDirectoryStatusError("目录状态检查失败，请稍后重试");
              setDirectoryStatusFilter("all");
            });
        }
      } catch {
        if (!cancelled) {
          setRawRows([]);
          setSessionsState("error");
        }
      }
    };

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapState,
    reloadToken,
    scanVersion,
    debouncedSearchKeyword,
    selectedTool,
    updatedWithinDays,
    viewMode,
    canLoadSessionData,
  ]);

  const groupPathHints = useMemo(() => {
    const shouldShowClaudeProjectHints =
      viewMode === "overview" &&
      searchKeyword.trim().length === 0 &&
      selectedTool === "claude";
    return shouldShowClaudeProjectHints ? claudeProjectPaths : [];
  }, [claudeProjectPaths, searchKeyword, selectedTool, viewMode]);

  const rows = useMemo(() => {
    if (viewMode !== "overview" || directoryStatusPhase !== "ready" || directoryStatusFilter === "all") {
      return rawRows;
    }
    return rawRows.filter((row) => {
      const status = workspaceStatuses[row.workspaceKey]?.status ?? "unchecked";
      return matchesDirectoryStatus(status, directoryStatusFilter);
    });
  }, [directoryStatusFilter, directoryStatusPhase, rawRows, viewMode, workspaceStatuses]);

  const resetBrowseState = useCallback(() => {
    setSelectedTool(null);
    setSearchKeyword("");
    setDebouncedSearchKeyword("");
    setUpdatedWithinDays(null);
    setViewMode("overview");
    setDirectoryStatusFilter("all");
  }, []);

  const requestDataReload = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  return {
    rows,
    overviewSummary,
    sessionsState,
    directoryStatusPhase,
    directoryStatusError,
    workspaceStatuses,
    directoryStatusFilter,
    setDirectoryStatusFilter,
    selectedTool,
    setSelectedTool,
    viewMode,
    setViewMode,
    searchKeyword,
    setSearchKeyword,
    updatedWithinDays,
    setUpdatedWithinDays,
    groupPathHints,
    resetBrowseState,
    requestDataReload,
  };
}
