import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SessionDetail, type SubagentSessionRow } from "../../../lib/tauriClient";
import { type SessionTableRow } from "../../sessions/SessionTable";

type SessionViewMode = "overview" | "trash";

type UseSessionDetailControllerProps = {
  rows: SessionTableRow[];
  viewMode: SessionViewMode;
};

const DEFAULT_DETAIL_MESSAGE_LIMIT = 120;
const DETAIL_MESSAGE_LOAD_STEP = 200;

export function useSessionDetailController({ rows, viewMode }: UseSessionDetailControllerProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [subagentRows, setSubagentRows] = useState<SubagentSessionRow[]>([]);
  const [subagentsLoading, setSubagentsLoading] = useState(false);
  const [detailMessageLimit, setDetailMessageLimit] = useState<number>(DEFAULT_DETAIL_MESSAGE_LIMIT);
  const detailRequestSeqRef = useRef(0);

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

    setDetail(null);
    setDetailLoading(true);
    setSubagentRows([]);
    setSubagentsLoading(true);
    const sourceTool = activeRow.sourceTool;
    const sourceId = activeRow.sourceId;
    const includeSubagent = activeRow.isSubagent === true;

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
          setDetail(result.detail);
        }
      } catch {
        if (!cancelled && requestSeq === detailRequestSeqRef.current) {
          setDetail(null);
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
      setDetailMessageLimit(DEFAULT_DETAIL_MESSAGE_LIMIT);
      setActiveSessionId(id);
    },
    [activeSessionId, resetDetailState],
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
