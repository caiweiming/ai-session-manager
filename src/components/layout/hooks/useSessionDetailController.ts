import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SessionDetail, type SubagentSessionRow } from "../../../lib/tauriClient";
import { type SessionTableRow } from "../../sessions/SessionTable";

type SessionViewMode = "overview" | "trash";

type UseSessionDetailControllerProps = {
  rows: SessionTableRow[];
  viewMode: SessionViewMode;
};

const DEFAULT_DETAIL_MESSAGE_LIMIT = 120;
const DETAIL_MESSAGE_LOAD_STEP = 80;
const DETAIL_CACHE_MAX_ENTRIES = 12;

const buildDetailCacheKey = (viewMode: SessionViewMode, sourceTool: string, sourceId: string, messageLimit: number) =>
  `${viewMode}:${sourceTool}:${sourceId}:${messageLimit}`;

export function useSessionDetailController({ rows, viewMode }: UseSessionDetailControllerProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [subagentRows, setSubagentRows] = useState<SubagentSessionRow[]>([]);
  const [subagentsLoading, setSubagentsLoading] = useState(false);
  const [detailMessageLimit, setDetailMessageLimit] = useState<number>(DEFAULT_DETAIL_MESSAGE_LIMIT);
  const detailRequestSeqRef = useRef(0);
  const detailCacheRef = useRef(new Map<string, SessionDetail>());

  const resetDetailState = useCallback(() => {
    setActiveSessionId(null);
    setDetail(null);
    setDetailLoading(false);
    setSubagentRows([]);
    setSubagentsLoading(false);
    setDetailMessageLimit(DEFAULT_DETAIL_MESSAGE_LIMIT);
  }, []);

  useEffect(() => {
    resetDetailState();
  }, [resetDetailState, viewMode]);

  useEffect(() => {
    if (!activeSessionId) return;
    if (!rows.some((row) => row.id === activeSessionId)) {
      resetDetailState();
    }
  }, [activeSessionId, resetDetailState, rows]);

  useEffect(() => {
    detailRequestSeqRef.current += 1;
    const requestSeq = detailRequestSeqRef.current;
    let cancelled = false;

    if (!activeSessionId) {
      setDetail(null);
      setDetailLoading(false);
      setSubagentRows([]);
      setSubagentsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const activeRow = rows.find((row) => row.id === activeSessionId);
    if (!activeRow?.sourceTool || !activeRow.sourceId) {
      setDetail(null);
      setDetailLoading(false);
      setSubagentRows([]);
      setSubagentsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const sourceTool = activeRow.sourceTool;
    const sourceId = activeRow.sourceId;
    const includeSubagent = activeRow.isSubagent === true;
    const detailCacheKey = buildDetailCacheKey(viewMode, sourceTool, sourceId, detailMessageLimit);
    const cachedDetail = detailCacheRef.current.get(detailCacheKey)
      ?? Array.from(detailCacheRef.current.entries())
        .find(([key]) => key.startsWith(`${viewMode}:${sourceTool}:${sourceId}:`))?.[1]
      ?? null;

    setDetail(cachedDetail);
    setDetailLoading(true);
    setSubagentRows([]);
    setSubagentsLoading(true);

    const fetchSessionDetail = async () => {
      try {
        const result = await api.getSessionDetail({
          sourceTool,
          sourceId,
          includeSubagent,
          inTrash: viewMode === "trash",
          messageLimit: detailMessageLimit,
        });
        if (!cancelled && requestSeq === detailRequestSeqRef.current) {
          if (result.detail) {
            detailCacheRef.current.delete(detailCacheKey);
            detailCacheRef.current.set(detailCacheKey, result.detail);
            while (detailCacheRef.current.size > DETAIL_CACHE_MAX_ENTRIES) {
              const oldestKey = detailCacheRef.current.keys().next().value;
              if (!oldestKey) break;
              detailCacheRef.current.delete(oldestKey);
            }
          }
          setDetail(result.detail);
        }
      } catch {
        if (!cancelled && requestSeq === detailRequestSeqRef.current) {
          setDetail(cachedDetail);
        }
      } finally {
        if (!cancelled && requestSeq === detailRequestSeqRef.current) {
          setDetailLoading(false);
        }
      }
    };

    const fetchSubagents = async () => {
      if (includeSubagent) {
        if (!cancelled && requestSeq === detailRequestSeqRef.current) {
          setSubagentRows([]);
          setSubagentsLoading(false);
        }
        return;
      }
      try {
        const result = await api.listSubagentSessions({
          sourceTool,
          parentSourceId: sourceId,
          inTrash: viewMode === "trash",
        });
        if (!cancelled && requestSeq === detailRequestSeqRef.current) {
          setSubagentRows(result.rows);
        }
      } catch {
        if (!cancelled && requestSeq === detailRequestSeqRef.current) {
          setSubagentRows([]);
        }
      } finally {
        if (!cancelled && requestSeq === detailRequestSeqRef.current) {
          setSubagentsLoading(false);
        }
      }
    };

    void fetchSessionDetail();
    void fetchSubagents();

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, detailMessageLimit, rows, viewMode]);

  const handleCloseInspector = useCallback(() => {
    resetDetailState();
  }, [resetDetailState]);

  const handleSessionSelection = useCallback(
    (id: string) => {
      if (id === activeSessionId) {
        resetDetailState();
        return;
      }
      const nextRow = rows.find((row) => row.id === id);
      const cachedDetail = nextRow?.sourceTool && nextRow.sourceId
        ? detailCacheRef.current.get(
          buildDetailCacheKey(viewMode, nextRow.sourceTool, nextRow.sourceId, DEFAULT_DETAIL_MESSAGE_LIMIT),
        ) ?? null
        : null;

      setDetail(cachedDetail);
      setDetailLoading(Boolean(nextRow));
      setSubagentRows([]);
      setSubagentsLoading(Boolean(nextRow && !nextRow.isSubagent));
      setDetailMessageLimit(DEFAULT_DETAIL_MESSAGE_LIMIT);
      setActiveSessionId(id);
    },
    [activeSessionId, resetDetailState, rows, viewMode],
  );

  const handleLoadMoreMessages = useCallback(() => {
    setDetailMessageLimit((current) => current + DETAIL_MESSAGE_LOAD_STEP);
  }, []);

  return {
    activeSessionId,
    detail,
    detailLoading,
    subagentRows,
    subagentsLoading,
    detailMessageLimit,
    inspectorOpen: activeSessionId !== null,
    handleCloseInspector,
    handleSessionSelection,
    handleLoadMoreMessages,
    resetDetailState,
  };
}
