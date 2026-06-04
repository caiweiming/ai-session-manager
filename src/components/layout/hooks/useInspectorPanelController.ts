import { useEffect, useRef, useState } from "react";
import { api, type SessionDetail, type SubagentSessionRow } from "../../../lib/tauriClient";
import {
  copyPlainText,
  extractParentDirectory,
} from "../inspectorPanelUtils";
import type { useSessionMutationController } from "./useSessionMutationController";

type InspectorToast =
  | { type: "success" | "info" | "error"; text: string }
  | null;

type InspectorActionBusy = "export" | "delete" | null;
type InspectorResumeState = "idle" | "pending" | "success" | "error";

const RESUME_SUCCESS_FEEDBACK_MS = 2000;
const RESUME_ERROR_FEEDBACK_MS = 1800;

export function useInspectorPanelController({
  detail,
  subagentRows,
  subagentsLoading,
  defaultHardDelete,
  handleDeleteSession,
  handleExportSession,
  handleResumeSession,
}: {
  detail: SessionDetail | null;
  subagentRows: SubagentSessionRow[];
  subagentsLoading: boolean;
  defaultHardDelete: boolean;
  handleDeleteSession: Pick<
    ReturnType<typeof useSessionMutationController>,
    "handleDeleteSession"
  >["handleDeleteSession"];
  handleExportSession: Pick<
    ReturnType<typeof useSessionMutationController>,
    "handleExportSession"
  >["handleExportSession"];
  handleResumeSession: Pick<
    ReturnType<typeof useSessionMutationController>,
    "handleResumeSession"
  >["handleResumeSession"];
}) {
  const [subagentModalOpen, setSubagentModalOpen] = useState(false);
  const [conversationModalOpen, setConversationModalOpen] = useState(false);
  const [conversationModalPreparing, setConversationModalPreparing] =
    useState(false);
  const [toast, setToast] = useState<InspectorToast>(null);
  const [resumeCopied, setResumeCopied] = useState(false);
  const [resumeState, setResumeState] = useState<InspectorResumeState>("idle");
  const [hardDelete, setHardDelete] = useState(false);
  const [hardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<InspectorActionBusy>(null);
  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(
    null,
  );
  const [selectedSubagentDetail, setSelectedSubagentDetail] =
    useState<SessionDetail | null>(null);
  const [selectedSubagentLoading, setSelectedSubagentLoading] = useState(false);
  const conversationModalRequestIdRef = useRef(0);

  useEffect(() => {
    setSubagentModalOpen(false);
    setConversationModalOpen(false);
    setConversationModalPreparing(false);
    setToast(null);
    setResumeCopied(false);
    setResumeState("idle");
    setHardDelete(defaultHardDelete);
    setHardDeleteConfirmOpen(false);
    setActionBusy(null);
    setSelectedSubagentId(null);
    setSelectedSubagentDetail(null);
    setSelectedSubagentLoading(false);
  }, [defaultHardDelete, detail?.sourceTool, detail?.sourceId]);

  useEffect(() => {
    if (!toast) return;
    const ttl =
      toast.type === "error" ? 2600 : toast.type === "success" ? 1800 : 2200;
    const timer = window.setTimeout(() => {
      setToast(null);
    }, ttl);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!resumeCopied) return;
    const timer = window.setTimeout(() => {
      setResumeCopied(false);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [resumeCopied]);

  useEffect(() => {
    if (resumeState !== "success" && resumeState !== "error") return;
    const timer = window.setTimeout(() => {
      setResumeState("idle");
    }, resumeState === "success" ? RESUME_SUCCESS_FEEDBACK_MS : RESUME_ERROR_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [resumeState]);

  useEffect(() => {
    if (!subagentModalOpen) return;
    if (subagentRows.length === 0) {
      setSelectedSubagentId(null);
      setSelectedSubagentDetail(null);
      return;
    }
    if (
      !selectedSubagentId ||
      !subagentRows.some((row) => row.sourceId === selectedSubagentId)
    ) {
      setSelectedSubagentId(subagentRows[0].sourceId);
    }
  }, [selectedSubagentId, subagentModalOpen, subagentRows]);

  useEffect(() => {
    let cancelled = false;
    const selectedSubagentRow =
      subagentRows.find((row) => row.sourceId === selectedSubagentId) ?? null;

    if (!subagentModalOpen || !selectedSubagentRow) {
      setSelectedSubagentDetail(null);
      setSelectedSubagentLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setSelectedSubagentLoading(true);
    const fetchSubagentDetail = async () => {
      try {
        const result = await api.getSessionDetail({
          sourceTool: selectedSubagentRow.sourceTool,
          sourceId: selectedSubagentRow.sourceId,
          includeSubagent: true,
        });
        if (!cancelled) {
          setSelectedSubagentDetail(result.detail);
        }
      } catch {
        if (!cancelled) {
          setSelectedSubagentDetail(null);
        }
      } finally {
        if (!cancelled) {
          setSelectedSubagentLoading(false);
        }
      }
    };

    void fetchSubagentDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedSubagentId, subagentModalOpen, subagentRows]);

  const openSubagentSummary = () => {
    if (!detail) return;
    if (subagentsLoading) {
      setToast({ type: "info", text: "子代理会话仍在加载，请稍后再试。" });
      return;
    }
    if (subagentRows.length === 0) {
      setToast({ type: "info", text: "当前主会话无子代理会话。" });
      return;
    }
    setToast(null);
    setSubagentModalOpen(true);
    setSelectedSubagentId(subagentRows[0].sourceId);
  };

  const closeSubagentSummary = () => {
    setSubagentModalOpen(false);
    setSelectedSubagentId(null);
    setSelectedSubagentDetail(null);
    setSelectedSubagentLoading(false);
  };

  const openConversationModal = () => {
    if (!detail) return;
    setToast(null);
    setConversationModalPreparing(false);
    setConversationModalOpen(true);
  };

  const closeConversationModal = () => {
    conversationModalRequestIdRef.current += 1;
    setConversationModalOpen(false);
    setConversationModalPreparing(false);
  };

  const openWorkspaceInExplorer = async (workspacePath: string) => {
    if (!detail || !workspacePath || workspacePath === "--") return;
    try {
      await api.openInExplorer({ path: workspacePath, reveal: false });
    } catch {
      setToast({ type: "error", text: "打开工作区失败，请确认路径存在。" });
    }
  };

  const revealSourceFile = async (sourcePath: string) => {
    if (!detail || !sourcePath || sourcePath === "--") return;
    try {
      await api.openInExplorer({ path: sourcePath, reveal: true });
    } catch {
      const parentDirectory = extractParentDirectory(sourcePath);
      if (!parentDirectory) {
        setToast({ type: "error", text: "定位文件失败，请确认文件路径有效。" });
        return;
      }
      try {
        await api.openInExplorer({ path: parentDirectory, reveal: false });
      } catch {
        setToast({ type: "error", text: "打开目录失败，请确认路径存在。" });
      }
    }
  };

  const copyResumeToClipboard = async (resumeCommand: string) => {
    if (!detail || !resumeCommand || resumeCommand === "--") return;
    setResumeCopied(true);
    try {
      await copyPlainText(resumeCommand);
    } catch {
      setResumeCopied(false);
      setToast({ type: "error", text: "复制失败，请重试。" });
    }
  };

  const resumeSessionFromInspector = async (workspacePath: string) => {
    if (!detail || !workspacePath || workspacePath === "--" || resumeState === "pending") {
      return;
    }

    setResumeState("pending");
    try {
      await handleResumeSession({
        sourceTool: detail.sourceTool,
        sourceId: detail.sourceId,
        workspacePath,
      });
      setResumeState("success");
    } catch {
      setResumeState("error");
      setToast({ type: "error", text: "启动恢复失败，请重试。" });
    }
  };

  const exportSessionAsMarkdown = async () => {
    if (!detail) return;
    setActionBusy("export");
    try {
      const result = await handleExportSession({
        sourceTool: detail.sourceTool,
        sourceId: detail.sourceId,
        includeSubagent: detail.isSubagent === true,
      });
      if (result.canceled) {
        setToast({ type: "info", text: "已取消导出。" });
        return;
      }
      if (!result.path) {
        throw new Error("empty export path");
      }
      setToast({ type: "success", text: `Markdown 已导出：${result.path}` });
    } catch {
      setToast({ type: "error", text: "导出 Markdown 失败，请重试。" });
    } finally {
      setActionBusy(null);
    }
  };

  const deleteCurrentSession = async () => {
    if (!detail) return;
    setActionBusy("delete");
    try {
      const result = await handleDeleteSession(detail.sourceTool, detail.sourceId, {
        hardDelete,
        cascadeSubagents: true,
      });
      if (result === false) {
        setToast({ type: "error", text: "删除失败，请重试。" });
      }
    } catch {
      setToast({ type: "error", text: "删除失败，请重试。" });
    } finally {
      setActionBusy(null);
    }
  };

  const handleDeleteAction = () => {
    if (!detail || actionBusy !== null) return;
    if (hardDelete) {
      setHardDeleteConfirmOpen(true);
      return;
    }
    void deleteCurrentSession();
  };

  const confirmHardDelete = () => {
    setHardDeleteConfirmOpen(false);
    void deleteCurrentSession();
  };

  return {
    subagentModalOpen,
    conversationModalOpen,
    conversationModalPreparing,
    toast,
    resumeCopied,
    resumeState,
    hardDelete,
    hardDeleteConfirmOpen,
    actionBusy,
    selectedSubagentId,
    selectedSubagentDetail,
    selectedSubagentLoading,
    setHardDelete,
    setSelectedSubagentId,
    openSubagentSummary,
    closeSubagentSummary,
    openConversationModal,
    closeConversationModal,
    openWorkspaceInExplorer,
    revealSourceFile,
    copyResumeToClipboard,
    resumeSessionFromInspector,
    exportSessionAsMarkdown,
    handleDeleteAction,
    closeHardDeleteConfirm: () => setHardDeleteConfirmOpen(false),
    confirmHardDelete,
  };
}
