import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  NormalizedSessionRow,
  SessionSortMode,
  SessionTableRow,
  SessionTableViewMode,
  VirtualSessionListRow,
} from "./sessionTableTypes";
import {
  SessionTableDataRow,
  SessionTableDeletePopover,
  SessionTableGroupRow,
  SessionTableHeader,
  SessionTableStickyGroupRow,
} from "./SessionTableParts";
import { useSessionTableState } from "./useSessionTableState";
import {
  normalizeSessionTableRows,
  sortSessionGroups,
} from "./sessionTableUtils";
import {
  buildVirtualSessionRows,
  getVirtualWindow,
} from "./sessionTableVirtualization";

export type { SessionSortMode, SessionTableRow, SessionTableViewMode } from "./sessionTableTypes";

const OVERSCAN_ROWS = 4;
const STICKY_TRIGGER_OFFSET = 6;

export function SessionTable({
  rows,
  groupPathHints = [],
  onSelectionChange,
  activeSessionId: controlledActiveSessionId,
  onActiveSessionChange,
  onDeleteSession,
  onOpenWorkspacePath,
  onResumeSession,
  onRestoreSession,
  supportsResumeInTerminal = true,
  highlightKeyword,
  sortMode = "default",
  viewMode = "overview",
  onGroupExpandStateChange,
  expandAllTrigger,
  collapseAllTrigger,
}: {
  rows: SessionTableRow[];
  groupPathHints?: string[];
  onSelectionChange?: (ids: string[]) => void;
  activeSessionId?: string | null;
  onActiveSessionChange?: (id: string) => void;
  onDeleteSession?: (
    sourceTool: string,
    sourceId: string,
    options?: { hardDelete?: boolean; cascadeSubagents?: boolean },
  ) => Promise<boolean> | boolean | void;
  onOpenWorkspacePath?: (path: string) => Promise<void> | void;
  onResumeSession?: (payload: { sourceTool: string; sourceId: string; workspacePath: string }) => Promise<void> | void;
  onRestoreSession?: (sourceTool: string, sourceId: string) => Promise<boolean> | boolean | void;
  supportsResumeInTerminal?: boolean;
  highlightKeyword?: string;
  sortMode?: SessionSortMode;
  viewMode?: SessionTableViewMode;
  onGroupExpandStateChange?: (state: { hasGroups: boolean; allExpanded: boolean; allCollapsed: boolean }) => void;
  expandAllTrigger?: number;
  collapseAllTrigger?: number;
}) {
  const [internalActiveSessionId, setInternalActiveSessionId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(360);
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  const normalizedRows = useMemo<NormalizedSessionRow[]>(
    () => normalizeSessionTableRows(rows),
    [rows],
  );

  const groups = useMemo(() => {
    return sortSessionGroups(normalizedRows, groupPathHints, sortMode);
  }, [groupPathHints, normalizedRows, sortMode]);
  const hasRows = groups.length > 0;
  const groupPaths = useMemo(() => groups.map((group) => group.groupKey), [groups]);
  const normalizedHighlightKeyword = useMemo(() => {
    const trimmed = (highlightKeyword ?? "").trim();
    return trimmed.length > 0 ? trimmed : "";
  }, [highlightKeyword]);
  const activeSessionId = controlledActiveSessionId ?? internalActiveSessionId;
  const rowIds = useMemo(() => normalizedRows.map((row) => row.id), [normalizedRows]);
  const rowById = useMemo(() => {
    const map = new Map<string, NormalizedSessionRow>();
    for (const row of normalizedRows) {
      map.set(row.id, row);
    }
    return map;
  }, [normalizedRows]);
  const {
    selected,
    expandedGroups,
    deletePopover,
    deletingId,
    resumeStates,
    wrapperRef,
    popoverRef,
    allSelected,
    toggleRow,
    toggleAll,
    toggleGroupRows,
    toggleGroupExpanded,
    openDeletePopover,
    closeDeletePopover,
    confirmDeletePopover,
    runWithResumeFeedback,
  } = useSessionTableState({
    rowIds,
    groupPaths,
    onSelectionChange,
    onGroupExpandStateChange,
    expandAllTrigger,
    collapseAllTrigger,
  });

  useLayoutEffect(() => {
    if (!hasRows) {
      return;
    }
    const element = scrollViewportRef.current;
    if (!element) return;

    const syncHeight = () => {
      setViewportHeight(element.clientHeight || 360);
    };

    syncHeight();
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          syncHeight();
        });
    resizeObserver?.observe(element);
    window.addEventListener("resize", syncHeight);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncHeight);
    };
  }, [hasRows]);

  const virtualRows = useMemo(
    () => buildVirtualSessionRows(groups, expandedGroups),
    [expandedGroups, groups],
  );

  const windowState = useMemo(
    () =>
      getVirtualWindow(virtualRows, {
        viewportHeight,
        scrollTop,
        overscan: OVERSCAN_ROWS,
      }),
    [scrollTop, viewportHeight, virtualRows],
  );

  const rowOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let currentOffset = 0;
    for (const row of virtualRows) {
      offsets.set(row.key, currentOffset);
      currentOffset += row.height;
    }
    return offsets;
  }, [virtualRows]);

  const stickyGroup = useMemo(() => {
    let currentGroup: VirtualSessionListRow | null = null;

    for (const row of virtualRows) {
      const rowOffset = rowOffsets.get(row.key);
      if (rowOffset === undefined || rowOffset > scrollTop) {
        break;
      }
      if (row.type === "group") {
        currentGroup = row;
      }
    }

    if (!currentGroup || currentGroup.type !== "group" || !currentGroup.expanded) {
      return null;
    }

    const groupOffset = rowOffsets.get(currentGroup.key);
    if (groupOffset === undefined || scrollTop <= groupOffset + STICKY_TRIGGER_OFFSET) {
      return null;
    }

    return currentGroup.group;
  }, [rowOffsets, scrollTop, virtualRows]);

  const activateSession = (id: string) => {
    if (onActiveSessionChange) {
      onActiveSessionChange(id);
      return;
    }
    setInternalActiveSessionId(id);
  };

  const resumeConversation = async (row: NormalizedSessionRow) => {
    if (!onResumeSession) return;
    await runWithResumeFeedback(row.id, async () => {
      await onResumeSession({
        sourceTool: row.sourceTool,
        sourceId: row.sourceId,
        workspacePath: row.path,
      });
    });
  };

  const restoreFromTrash = async (row: NormalizedSessionRow) => {
    if (!onRestoreSession) return;
    await runWithResumeFeedback(
      row.id,
      () => onRestoreSession(row.sourceTool, row.sourceId),
      { falseAsError: true },
    );
  };

  const openGroupPath = (path: string) => {
    void onOpenWorkspacePath?.(path);
  };

  const handleDeletePopoverConfirm = async () => {
    if (!deletePopover) return;
    const target = rowById.get(deletePopover.id);
    if (!target) {
      closeDeletePopover();
      return;
    }
    await confirmDeletePopover(async () => {
      await onDeleteSession?.(target.sourceTool, target.sourceId);
    });
  };

  const renderVirtualRow = (row: VirtualSessionListRow) => {
    if (row.type === "group") {
      const groupRowIds = row.group.rows.map((groupRow) => groupRow.id);
      const groupSelected =
        groupRowIds.length > 0 &&
        groupRowIds.every((id) => selected.includes(id));

      return (
        <SessionTableGroupRow
          key={row.key}
          group={row.group}
          expanded={row.expanded}
          hiddenForSticky={stickyGroup?.groupKey === row.group.groupKey}
          groupSelected={groupSelected}
          highlightKeyword={normalizedHighlightKeyword}
          onToggleRows={(checked) => toggleGroupRows(groupRowIds, checked)}
          onToggleExpanded={() => toggleGroupExpanded(row.group.groupKey)}
          onOpenGroupPath={() => openGroupPath(row.group.displayPath)}
        />
      );
    }

    return (
      <SessionTableDataRow
        key={row.key}
        row={row.row}
        active={activeSessionId === row.row.id}
        checked={selected.includes(row.row.id)}
        isLastChild={row.isLastChild}
        highlightKeyword={normalizedHighlightKeyword}
        viewMode={viewMode}
        resumeState={resumeStates[row.row.id] ?? "idle"}
        supportsResumeInTerminal={supportsResumeInTerminal}
        onToggle={() => toggleRow(row.row.id)}
        onActivate={() => activateSession(row.row.id)}
        onResume={() => {
          void resumeConversation(row.row);
        }}
        onRestore={() => {
          void restoreFromTrash(row.row);
        }}
        onOpenDeletePopover={(event) => openDeletePopover(row.row.id, event)}
      />
    );
  };

  return (
    <div className="session-table-wrap" ref={wrapperRef}>
      {groups.length === 0 ? (
        <div className="session-table-empty-state">
          <span>暂无会话数据</span>
        </div>
      ) : (
        <div className="session-table" role="table" aria-label="session-table">
          <SessionTableHeader
            allSelected={allSelected}
            onToggleAll={toggleAll}
          />
          <div
            className="session-table-viewport"
            data-testid="session-table-viewport"
            ref={scrollViewportRef}
            onScroll={(event) => {
              setScrollTop(event.currentTarget.scrollTop);
            }}
          >
            {stickyGroup ? (
              <SessionTableStickyGroupRow
                group={stickyGroup}
                onToggleExpanded={() => toggleGroupExpanded(stickyGroup.groupKey)}
                onOpenGroupPath={() => openGroupPath(stickyGroup.displayPath)}
              />
            ) : null}
            <div
              className="session-table-spacer"
              style={{
                height: `${windowState.totalHeight}px`,
                paddingTop: stickyGroup ? "50px" : undefined,
              }}
            >
              <div
                className="session-table-visible-rows"
                role="rowgroup"
                style={{ transform: `translateY(${windowState.paddingTop}px)` }}
              >
                {windowState.items.map(renderVirtualRow)}
              </div>
            </div>
          </div>
        </div>
      )}
      {deletePopover && (
        <SessionTableDeletePopover
          deletePopover={deletePopover}
          deletingId={deletingId}
          popoverRef={popoverRef}
          onCancel={closeDeletePopover}
          onConfirm={() => {
            void handleDeletePopoverConfirm();
          }}
        />
      )}
    </div>
  );
}
