import { useCallback, useEffect, useMemo, useState } from "react";
import { type OverviewSummary, api, type SessionRow as ApiSessionRow } from "../../../lib/tauriClient";
import { normalizeWindowsDriveLetter } from "../../../lib/pathDisplay";
import { type SessionTableRow } from "../../sessions/SessionTable";

type BootstrapState = "loading" | "ready" | "error";
type SessionViewMode = "overview" | "trash";
type SessionsState = "loading" | "ready" | "error";
const SEARCH_DEBOUNCE_MS = 180;

type UseSessionListControllerProps = {
  workspaceReady: boolean;
  bootstrapState: BootstrapState;
  scanVersion: number;
  claudeProjectPaths: string[];
};

const mapApiRows = (rows: ApiSessionRow[]): SessionTableRow[] => {
  return rows.map((row, index) => ({
    id: `${row.sourceTool || "unknown"}:${row.sourceId || `session-${index + 1}`}`,
    title: row.title || `未命名会话 ${index + 1}`,
    tool: row.sourceTool || "unknown",
    path: normalizeWindowsDriveLetter(row.workspacePath || row.sourcePath || "未知路径"),
    sizeBytes: row.sizeBytes,
    isSubagent: row.isSubagent ?? false,
    parentSourceId: row.parentSourceId,
    createdAt: row.createdAt || row.updatedAt || "未知时间",
    updatedAt: row.updatedAt || "未知时间",
    sourceTool: row.sourceTool || "unknown",
    sourceId: row.sourceId || `session-${index + 1}`,
  }));
};

export function useSessionListController({
  workspaceReady,
  bootstrapState,
  scanVersion,
  claudeProjectPaths,
}: UseSessionListControllerProps) {
  const [rows, setRows] = useState<SessionTableRow[]>([]);
  const [overviewSummary, setOverviewSummary] = useState<OverviewSummary | null>(null);
  const [sessionsState, setSessionsState] = useState<SessionsState>("loading");
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
      setRows([]);
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
      setRows([]);
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
      if (rows.length === 0) {
        setSessionsState("loading");
      }
      try {
        const result = viewMode === "trash" ? await api.listTrashSessions(payload) : await api.listSessions(payload);
        if (!cancelled) {
          setRows(mapApiRows(result.rows));
          setSessionsState("ready");
        }
      } catch {
        if (!cancelled) {
          setRows([]);
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

  const resetBrowseState = useCallback(() => {
    setSelectedTool(null);
    setSearchKeyword("");
    setDebouncedSearchKeyword("");
    setUpdatedWithinDays(null);
    setViewMode("overview");
  }, []);

  const requestDataReload = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  return {
    rows,
    overviewSummary,
    sessionsState,
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
