import { useEffect, useMemo, useState } from "react";
import { SessionTable, type SessionSortMode, type SessionTableRow } from "../sessions/SessionTable";
import { CustomSelect } from "../ui/CustomSelect";
import type { SidebarViewMode } from "./Sidebar";
import type { useSessionMutationController } from "./hooks/useSessionMutationController";

type MainAreaProps = {
  list: {
    activeSessionId: string | null;
    onActiveSessionChange: (id: string) => void;
    viewMode: SidebarViewMode;
    selectedTool: string | null;
    onSelectedToolChange: (tool: string | null) => void;
    onResetBrowseState: () => void;
    searchKeyword: string;
    onSearchKeywordChange: (keyword: string) => void;
    updatedWithinDays: number | null;
    onUpdatedWithinDaysChange: (days: number | null) => void;
    rows: SessionTableRow[];
    groupPathHints?: string[];
    sessionsState: "loading" | "ready" | "error";
  };
  mutation: ReturnType<typeof useSessionMutationController>;
  scanErrorMessage?: string | null;
  onRetryScan: () => void;
  scanInFlight: boolean;
  trashClearInFlight?: boolean;
};

export function MainArea({
  list,
  mutation,
  scanErrorMessage,
  onRetryScan,
  scanInFlight,
  trashClearInFlight = false,
}: MainAreaProps) {
  const {
    activeSessionId,
    onActiveSessionChange,
    viewMode,
    selectedTool,
    onResetBrowseState,
    searchKeyword,
    onSearchKeywordChange,
    updatedWithinDays,
    onUpdatedWithinDaysChange,
    rows,
    groupPathHints,
    sessionsState,
  } = list;
  const {
    handleDeleteSession,
    handleBatchDeleteSessions,
    handleBatchRestoreSessions,
    handleRestoreSession,
    handleClearTrash: handleClearTrashMutation,
    handleOpenWorkspacePath,
    handleResumeSession,
    supportsResumeInTerminal,
  } = mutation;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandAllTrigger, setExpandAllTrigger] = useState(0);
  const [collapseAllTrigger, setCollapseAllTrigger] = useState(0);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchRestoring, setBatchRestoring] = useState(false);
  const [clearingTrash, setClearingTrash] = useState(false);
  const [trashBatchDeleteConfirmOpen, setTrashBatchDeleteConfirmOpen] = useState(false);
  const [clearTrashConfirmOpen, setClearTrashConfirmOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SessionSortMode>("default");
  const [groupExpandState, setGroupExpandState] = useState({
    hasGroups: false,
    allExpanded: false,
    allCollapsed: true,
  });

  const rowById = useMemo(() => {
    const next = new Map<string, SessionTableRow>();
    for (const row of rows) {
      if (row.id) {
        next.set(row.id, row);
      }
    }
    return next;
  }, [rows]);

  const selectedTargets = useMemo(() => {
    return selectedIds
      .map((id) => rowById.get(id))
      .filter((row): row is SessionTableRow => Boolean(row?.sourceTool && row?.sourceId))
      .map((row) => ({ sourceTool: row.sourceTool as string, sourceId: row.sourceId as string }));
  }, [rowById, selectedIds]);

  useEffect(() => {
    if (!trashBatchDeleteConfirmOpen) return;
    if (viewMode !== "trash" || selectedTargets.length === 0) {
      setTrashBatchDeleteConfirmOpen(false);
    }
  }, [selectedTargets.length, trashBatchDeleteConfirmOpen, viewMode]);

  useEffect(() => {
    if (!clearTrashConfirmOpen) return;
    if (viewMode !== "trash") {
      setClearTrashConfirmOpen(false);
    }
  }, [clearTrashConfirmOpen, viewMode]);

  const runBatchDelete = async () => {
    if (selectedTargets.length === 0 || batchDeleting) return;
    setBatchDeleting(true);
    try {
      const ok = await handleBatchDeleteSessions(selectedTargets, { hardDelete: viewMode === "trash" });
      if (ok) {
        setSelectedIds([]);
      }
    } finally {
      setBatchDeleting(false);
    }
  };

  const handleBatchDeleteClick = () => {
    if (selectedTargets.length === 0 || batchDeleting) return;
    if (viewMode === "trash") {
      setTrashBatchDeleteConfirmOpen(true);
      return;
    }
    void runBatchDelete();
  };

  const confirmTrashBatchDelete = async () => {
    setTrashBatchDeleteConfirmOpen(false);
    await runBatchDelete();
  };

  const handleBatchRestore = async () => {
    if (selectedTargets.length === 0 || batchRestoring) return;
    setBatchRestoring(true);
    try {
      const ok = await handleBatchRestoreSessions(selectedTargets);
      if (ok) {
        setSelectedIds([]);
      }
    } finally {
      setBatchRestoring(false);
    }
  };

  const handleClearTrash = async () => {
    if (clearingTrash || trashClearInFlight) return;
    setClearingTrash(true);
    try {
      await handleClearTrashMutation();
      setSelectedIds([]);
    } finally {
      setClearingTrash(false);
    }
  };

  const handleClearTrashClick = () => {
    if (clearingTrash || trashClearInFlight) return;
    setClearTrashConfirmOpen(true);
  };

  const confirmClearTrash = async () => {
    setClearTrashConfirmOpen(false);
    await handleClearTrash();
  };

  const dateFilterOptions = [
    { value: "7", label: "最近 7 天" },
    { value: "30", label: "最近 30 天" },
    { value: "90", label: "最近 90 天" },
    { value: "all", label: "全部时间" },
  ];

  const sortModeOptions = [
    { value: "default", label: "默认排序" },
    { value: "path_asc", label: "路径升序" },
    { value: "path_desc", label: "路径降序" },
    { value: "size_desc", label: "大小从大到小" },
    { value: "size_asc", label: "大小从小到大" },
  ];

  const isResetEnabled =
    selectedTool !== null ||
    searchKeyword.trim().length > 0 ||
    updatedWithinDays !== null ||
    sortMode !== "default" ||
    viewMode !== "overview";

  const handleResetFilters = () => {
    onResetBrowseState();
    setSortMode("default");
  };

  const handleGroupToggle = () => {
    if (!groupExpandState.hasGroups) {
      return;
    }
    if (groupExpandState.allExpanded) {
      setCollapseAllTrigger((token) => token + 1);
      return;
    }
    setExpandAllTrigger((token) => token + 1);
  };

  return (
    <main className="main-area" data-testid="main-area" data-sessions-state={sessionsState}>
      <div className="toolbar">
        <div className="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            aria-label="session-search-input"
            placeholder="搜索会话 ID、路径或摘要..."
            value={searchKeyword}
            onChange={(event) => onSearchKeywordChange(event.target.value)}
          />
        </div>
        <div className="toolbar-actions">
          <CustomSelect
            ariaLabel="session-date-filter"
            value={updatedWithinDays === null ? "all" : String(updatedWithinDays)}
            disabled={viewMode !== "overview"}
            onChange={(value) => {
              onUpdatedWithinDaysChange(value === "all" ? null : Number(value));
            }}
            options={dateFilterOptions}
            leadingIcon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            }
            className="toolbar-custom-select"
          />
          <CustomSelect
            ariaLabel="session-sort-mode"
            value={sortMode}
            onChange={(value) => setSortMode(value as SessionSortMode)}
            options={sortModeOptions}
            leadingIcon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18" />
                <path d="M6 12h12" />
                <path d="M10 18h4" />
              </svg>
            }
            className="toolbar-custom-select"
          />
          <button
            className="btn-secondary toolbar-inline-btn"
            onClick={handleResetFilters}
            disabled={!isResetEnabled}
          >
            重置筛选
          </button>
          {viewMode === "trash" ? (
            <button
              className="btn-secondary toolbar-inline-btn"
              onClick={() => {
                void handleBatchRestore();
              }}
              disabled={selectedIds.length === 0 || batchRestoring || clearingTrash}
            >
              {batchRestoring ? "恢复中..." : `恢复所选${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
            </button>
          ) : null}
          {viewMode === "trash" ? (
            <button
              className="btn-secondary toolbar-inline-btn"
              onClick={handleClearTrashClick}
              disabled={clearingTrash || trashClearInFlight}
            >
              {clearingTrash ? "清空中..." : "清空回收站"}
            </button>
          ) : null}
          <button
            className="btn-secondary toolbar-inline-btn"
            aria-label="group-expand-toggle"
            onClick={handleGroupToggle}
            disabled={!groupExpandState.hasGroups}
          >
            {groupExpandState.allExpanded ? "全部折叠" : "全部展开"}
          </button>
          <button
            className={`btn btn-danger btn-danger-solid${selectedIds.length > 0 ? " active" : ""}`}
            disabled={selectedIds.length === 0 || batchDeleting}
            onClick={handleBatchDeleteClick}
            aria-label="batch-delete-sessions"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {batchDeleting
              ? "批量删除中..."
              : `${
                  viewMode === "trash"
                    ? "批量永久删除"
                    : "批量删除"
                }${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
          </button>
        </div>
      </div>

      {scanErrorMessage && !scanInFlight ? (
        <div className="main-area-error-banner" data-testid="main-area-scan-error" role="status" aria-live="polite">
          <div className="main-area-error-copy">
            <span className="main-area-error-title">本地扫描失败</span>
            <span className="main-area-error-message">{scanErrorMessage}</span>
          </div>
          <button
            type="button"
            className="btn-secondary toolbar-inline-btn"
            onClick={onRetryScan}
            disabled={scanInFlight}
          >
            {scanInFlight ? "重试中..." : "重新扫描"}
          </button>
        </div>
      ) : null}

      <div className="table-container">
        <SessionTable
          rows={rows}
          groupPathHints={groupPathHints}
          onSelectionChange={setSelectedIds}
          highlightKeyword={searchKeyword}
          onGroupExpandStateChange={setGroupExpandState}
          expandAllTrigger={expandAllTrigger}
          collapseAllTrigger={collapseAllTrigger}
          sortMode={sortMode}
          viewMode={viewMode}
          activeSessionId={activeSessionId}
          onActiveSessionChange={onActiveSessionChange}
          onDeleteSession={handleDeleteSession}
          onRestoreSession={handleRestoreSession}
          onOpenWorkspacePath={handleOpenWorkspacePath}
          onResumeSession={handleResumeSession}
          supportsResumeInTerminal={supportsResumeInTerminal}
        />
      </div>

      <div
        className={`modal-overlay${trashBatchDeleteConfirmOpen ? " active" : ""}`}
        onClick={() => setTrashBatchDeleteConfirmOpen(false)}
        aria-hidden={!trashBatchDeleteConfirmOpen}
        data-testid="trash-batch-delete-confirm-modal"
      >
        <div className="modal-card confirm-modal-card" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <h3>确认永久删除</h3>
            <button className="btn-close" onClick={() => setTrashBatchDeleteConfirmOpen(false)} aria-label="close-trash-batch-delete-confirm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="confirm-modal-body">
            将永久删除已选中的 {selectedTargets.length} 条会话记录，且不可恢复。
          </div>
          <div className="confirm-modal-actions">
            <button className="btn-secondary" onClick={() => setTrashBatchDeleteConfirmOpen(false)}>
              取消
            </button>
            <button className="btn btn-danger active btn-danger-solid" onClick={() => void confirmTrashBatchDelete()} disabled={batchDeleting}>
              {batchDeleting ? "删除中..." : "确认永久删除"}
            </button>
          </div>
        </div>
      </div>

      <div
        className={`modal-overlay${clearTrashConfirmOpen ? " active" : ""}`}
        onClick={() => setClearTrashConfirmOpen(false)}
        aria-hidden={!clearTrashConfirmOpen}
        data-testid="clear-trash-confirm-modal"
      >
        <div className="modal-card confirm-modal-card" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <h3>确认清空回收站</h3>
            <button className="btn-close" onClick={() => setClearTrashConfirmOpen(false)} aria-label="close-clear-trash-confirm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="confirm-modal-body">
            将永久删除回收站中的全部会话记录，且不可恢复。
          </div>
          <div className="confirm-modal-actions">
            <button className="btn-secondary" onClick={() => setClearTrashConfirmOpen(false)}>
              取消
            </button>
            <button className="btn btn-danger active btn-danger-solid" onClick={() => void confirmClearTrash()} disabled={clearingTrash}>
              {clearingTrash ? "清空中..." : "确认清空"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
