import { useCallback } from "react";
import { api, type SessionMutationResult } from "../../../lib/tauriClient";
import type { SidebarViewMode } from "../Sidebar";

type DeleteSessionOptions = {
  hardDelete?: boolean;
  cascadeSubagents?: boolean;
};

type SessionTarget = {
  sourceTool: string;
  sourceId: string;
};

type ResumeSessionPayload = {
  sourceTool: string;
  sourceId: string;
  workspacePath: string;
};

type ExportSessionPayload = {
  sourceTool: string;
  sourceId: string;
  includeSubagent?: boolean;
};

type UseSessionMutationControllerProps = {
  viewMode: SidebarViewMode;
  terminalPreference: string;
  supportsResumeInTerminal: boolean;
  onAfterMutation: () => void;
  onClearTrashStart?: () => void;
  onClearTrashFinish?: () => void;
};

const isOpenableWorkspacePath = (path: string) => {
  const trimmed = path.trim();
  return trimmed.length > 0 && trimmed !== "未知路径";
};

const shouldRefreshAfterMutation = (result: SessionMutationResult) => {
  return result.deletedSessions > 0 || (result.warnings?.length ?? 0) > 0;
};

const isMutationSuccessful = (result: SessionMutationResult) => {
  return (result.warnings?.length ?? 0) === 0;
};

const buildDeletePayload = (
  viewMode: SidebarViewMode,
  target: SessionTarget,
  options?: DeleteSessionOptions,
) => ({
  sourceTool: target.sourceTool,
  sourceId: target.sourceId,
  cascadeSubagents: options?.cascadeSubagents ?? true,
  ...(viewMode === "trash"
    ? { hardDelete: true }
    : options?.hardDelete !== undefined
      ? { hardDelete: options.hardDelete }
      : {}),
});

export function useSessionMutationController({
  viewMode,
  terminalPreference,
  supportsResumeInTerminal,
  onAfterMutation,
  onClearTrashStart,
  onClearTrashFinish,
}: UseSessionMutationControllerProps) {
  const handleDeleteSession = useCallback(
    async (sourceTool: string, sourceId: string, options?: DeleteSessionOptions) => {
      try {
        const result = await api.deleteSession(buildDeletePayload(viewMode, { sourceTool, sourceId }, options));
        if (shouldRefreshAfterMutation(result)) {
          onAfterMutation();
        }
        return isMutationSuccessful(result);
      } catch {
        return false;
      }
    },
    [onAfterMutation, viewMode],
  );

  const handleBatchDeleteSessions = useCallback(
    async (targets: SessionTarget[], options?: { hardDelete?: boolean }) => {
      if (targets.length === 0) return false;

      if (viewMode === "trash") {
        try {
          onClearTrashStart?.();
          const result = await api.deleteSessions({
            targets,
            hardDelete: true,
            cascadeSubagents: true,
          });
          if (shouldRefreshAfterMutation(result)) {
            onAfterMutation();
          }
          return isMutationSuccessful(result);
        } catch {
          return false;
        } finally {
          onClearTrashFinish?.();
        }
      }

      let shouldRefresh = false;
      let allSuccess = true;

      for (const target of targets) {
        try {
          const result = await api.deleteSession(buildDeletePayload(viewMode, target, options));
          if (shouldRefreshAfterMutation(result)) {
            shouldRefresh = true;
          }
          if (!isMutationSuccessful(result)) {
            allSuccess = false;
          }
        } catch {
          allSuccess = false;
        }
      }

      if (shouldRefresh) {
        onAfterMutation();
      }
      return allSuccess;
    },
    [onAfterMutation, viewMode],
  );

  const handleBatchRestoreSessions = useCallback(
    async (targets: SessionTarget[]) => {
      if (targets.length === 0) return false;

      let hasSuccess = false;
      let allSuccess = true;

      for (const target of targets) {
        try {
          await api.restoreSession({
            sourceTool: target.sourceTool,
            sourceId: target.sourceId,
            cascadeSubagents: true,
          });
          hasSuccess = true;
        } catch {
          allSuccess = false;
        }
      }

      if (hasSuccess) {
        onAfterMutation();
      }
      return allSuccess;
    },
    [onAfterMutation],
  );

  const handleRestoreSession = useCallback(
    async (sourceTool: string, sourceId: string) => {
      try {
        await api.restoreSession({
          sourceTool,
          sourceId,
          cascadeSubagents: true,
        });
        onAfterMutation();
        return true;
      } catch {
        return false;
      }
    },
    [onAfterMutation],
  );

  const handleClearTrash = useCallback(async () => {
    try {
      onClearTrashStart?.();
      const result = await api.clearTrash();
      if (shouldRefreshAfterMutation(result)) {
        onAfterMutation();
      }
      return isMutationSuccessful(result);
    } catch {
      return false;
    } finally {
      onClearTrashFinish?.();
    }
  }, [onAfterMutation, onClearTrashFinish, onClearTrashStart]);

  const handleOpenWorkspacePath = useCallback(async (path: string) => {
    if (!isOpenableWorkspacePath(path)) {
      return;
    }
    try {
      await api.openInExplorer({ path, reveal: false });
    } catch {
      // 目录打开失败不阻断主流程。
    }
  }, []);

  const handleResumeSession = useCallback(
    async (payload: ResumeSessionPayload) => {
      if (!supportsResumeInTerminal) {
        return;
      }
      await api.openResumeInTerminal({
        ...payload,
        terminalPreference,
      });
    },
    [supportsResumeInTerminal, terminalPreference],
  );

  const handleExportSession = useCallback(async (payload: ExportSessionPayload) => {
    return api.exportSessionMarkdown(payload);
  }, []);

  return {
    handleDeleteSession,
    handleBatchDeleteSessions,
    handleBatchRestoreSessions,
    handleRestoreSession,
    handleClearTrash,
    handleOpenWorkspacePath,
    handleResumeSession,
    handleExportSession,
    supportsResumeInTerminal,
  };
}
