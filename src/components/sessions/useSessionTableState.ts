import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SessionResumeState } from "./sessionTableTypes";

type GroupExpandState = {
  hasGroups: boolean;
  allExpanded: boolean;
  allCollapsed: boolean;
};

type DeletePopoverState = {
  id: string;
  left: number;
  top: number;
} | null;

type RunWithResumeFeedbackOptions = {
  falseAsError?: boolean;
};

const RESUME_SUCCESS_FEEDBACK_MS = 2000;
const RESUME_ERROR_FEEDBACK_MS = 1800;
const expandedGroupsStorageKey = "ai-session:session-table-expanded-groups:v1";

const readStoredExpandedGroups = (): Record<string, boolean> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(expandedGroupsStorageKey);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    const next: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === "string" && typeof value === "boolean") {
        next[key] = value;
      }
    }
    return next;
  } catch {
    return {};
  }
};

export function useSessionTableState({
  rowIds,
  groupPaths,
  onSelectionChange,
  onGroupExpandStateChange,
  expandAllTrigger,
  collapseAllTrigger,
}: {
  rowIds: string[];
  groupPaths: string[];
  onSelectionChange?: (ids: string[]) => void;
  onGroupExpandStateChange?: (state: GroupExpandState) => void;
  expandAllTrigger?: number;
  collapseAllTrigger?: number;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () => readStoredExpandedGroups(),
  );
  const [deletePopover, setDeletePopover] = useState<DeletePopoverState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resumeStates, setResumeStates] = useState<Record<string, SessionResumeState>>(
    {},
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const lastExpandTriggerRef = useRef<number | undefined>(expandAllTrigger);
  const lastCollapseTriggerRef = useRef<number | undefined>(collapseAllTrigger);
  const resumeResetTimersRef = useRef<Record<string, number>>({});
  const previousGroupPathsRef = useRef<string[]>(groupPaths);

  const allGroupsExpanded =
    groupPaths.length > 0 &&
    groupPaths.every((path) => expandedGroups[path] === true);
  const allGroupsCollapsed =
    groupPaths.length === 0 ||
    groupPaths.every((path) => expandedGroups[path] !== true);
  const allSelected =
    rowIds.length > 0 && rowIds.every((id) => selected.includes(id));

  const toggleRow = (id: string) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((value) => value !== id)
        : [...prev, id],
    );
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? rowIds : []);
  };

  const toggleGroupRows = (groupRowIds: string[], checked: boolean) => {
    if (checked) {
      setSelected((prev) => Array.from(new Set([...prev, ...groupRowIds])));
      return;
    }
    setSelected((prev) => prev.filter((id) => !groupRowIds.includes(id)));
  };

  const toggleGroupExpanded = (path: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [path]: !(prev[path] ?? false),
    }));
  };

  const expandAllGroups = () => {
    setExpandedGroups(() => {
      const next: Record<string, boolean> = {};
      for (const path of groupPaths) {
        next[path] = true;
      }
      return next;
    });
  };

  const collapseAllGroups = () => {
    setExpandedGroups(() => {
      const next: Record<string, boolean> = {};
      for (const path of groupPaths) {
        next[path] = false;
      }
      return next;
    });
  };

  const openDeletePopover = (
    id: string,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (!wrapperRef.current) {
      setDeletePopover({ id, left: 16, top: 16 });
      return;
    }
    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const left = Math.max(8, buttonRect.left - wrapperRect.left - 120);
    const top = Math.max(8, buttonRect.top - wrapperRect.top - 45);
    setDeletePopover({ id, left, top });
  };

  const closeDeletePopover = () => {
    setDeletePopover(null);
  };

  const confirmDeletePopover = async (
    onConfirm?: () => Promise<void> | void,
  ) => {
    if (!deletePopover) return;
    try {
      setDeletingId(deletePopover.id);
      await onConfirm?.();
    } finally {
      setDeletingId(null);
      setDeletePopover(null);
    }
  };

  const clearResumeTimer = (id: string) => {
    const timerId = resumeResetTimersRef.current[id];
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      delete resumeResetTimersRef.current[id];
    }
  };

  const setResumeState = (id: string, state: SessionResumeState) => {
    setResumeStates((prev) => ({ ...prev, [id]: state }));
  };

  const scheduleResumeStateReset = (id: string, delayMs: number) => {
    clearResumeTimer(id);
    resumeResetTimersRef.current[id] = window.setTimeout(() => {
      setResumeStates((prev) => {
        if (prev[id] === undefined || prev[id] === "idle") return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete resumeResetTimersRef.current[id];
    }, delayMs);
  };

  const runWithResumeFeedback = async (
    id: string,
    action: () => Promise<boolean | void> | boolean | void,
    options?: RunWithResumeFeedbackOptions,
  ) => {
    if (resumeStates[id] === "pending") return;
    setResumeState(id, "pending");
    try {
      const result = await action();
      if (options?.falseAsError && result === false) {
        setResumeState(id, "error");
        scheduleResumeStateReset(id, RESUME_ERROR_FEEDBACK_MS);
        return;
      }
      setResumeState(id, "success");
      scheduleResumeStateReset(id, RESUME_SUCCESS_FEEDBACK_MS);
    } catch {
      setResumeState(id, "error");
      scheduleResumeStateReset(id, RESUME_ERROR_FEEDBACK_MS);
    }
  };

  useEffect(() => {
    onSelectionChange?.(selected);
  }, [onSelectionChange, selected]);

  useEffect(() => {
    onGroupExpandStateChange?.({
      hasGroups: groupPaths.length > 0,
      allExpanded: allGroupsExpanded,
      allCollapsed: allGroupsCollapsed,
    });
  }, [
    allGroupsCollapsed,
    allGroupsExpanded,
    groupPaths.length,
    onGroupExpandStateChange,
  ]);

  useEffect(() => {
    if (expandAllTrigger === undefined) return;
    if (lastExpandTriggerRef.current === undefined) {
      lastExpandTriggerRef.current = expandAllTrigger;
      return;
    }
    if (expandAllTrigger !== lastExpandTriggerRef.current) {
      lastExpandTriggerRef.current = expandAllTrigger;
      expandAllGroups();
    }
  }, [expandAllTrigger, groupPaths]);

  useEffect(() => {
    if (collapseAllTrigger === undefined) return;
    if (lastCollapseTriggerRef.current === undefined) {
      lastCollapseTriggerRef.current = collapseAllTrigger;
      return;
    }
    if (collapseAllTrigger !== lastCollapseTriggerRef.current) {
      lastCollapseTriggerRef.current = collapseAllTrigger;
      collapseAllGroups();
    }
  }, [collapseAllTrigger, groupPaths]);

  useEffect(() => {
    setSelected((prev) => prev.filter((id) => rowIds.includes(id)));
  }, [rowIds]);

  useEffect(() => {
    if (!deletePopover) return;
    if (!rowIds.includes(deletePopover.id)) {
      setDeletePopover(null);
    }
  }, [deletePopover, rowIds]);

  useEffect(() => {
    const previousGroupPaths = previousGroupPathsRef.current;
    setExpandedGroups((prev) => {
      const previousGroupsWereAllExpanded =
        previousGroupPaths.length > 0 &&
        previousGroupPaths.every((path) => prev[path] === true);
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const path of groupPaths) {
        next[path] = prev[path] ?? previousGroupsWereAllExpanded;
        if (prev[path] === undefined) {
          changed = true;
        }
      }
      if (!changed && Object.keys(prev).length === groupPaths.length) {
        return prev;
      }
      return next;
    });
  }, [groupPaths]);

  useEffect(() => {
    previousGroupPathsRef.current = groupPaths;
  }, [groupPaths]);

  useEffect(() => {
    if (!deletePopover) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(event.target as Node)) {
        setDeletePopover(null);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [deletePopover]);

  useEffect(() => {
    return () => {
      const timers = Object.values(resumeResetTimersRef.current);
      for (const timerId of timers) {
        window.clearTimeout(timerId);
      }
      resumeResetTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        expandedGroupsStorageKey,
        JSON.stringify(expandedGroups),
      );
    } catch {
      // 忽略本地存储异常，保持核心列表交互可用。
    }
  }, [expandedGroups]);

  return {
    selected,
    expandedGroups,
    deletePopover,
    deletingId,
    resumeStates,
    wrapperRef,
    popoverRef,
    allSelected,
    allGroupsExpanded,
    allGroupsCollapsed,
    toggleRow,
    toggleAll,
    toggleGroupRows,
    toggleGroupExpanded,
    expandAllGroups,
    collapseAllGroups,
    openDeletePopover,
    closeDeletePopover,
    confirmDeletePopover,
    clearResumeTimer,
    setResumeState,
    scheduleResumeStateReset,
    runWithResumeFeedback,
  };
}
