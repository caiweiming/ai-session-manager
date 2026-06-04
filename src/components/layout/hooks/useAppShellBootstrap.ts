import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type RefreshSummary } from "../../../lib/tauriClient";
import { normalizeWindowsDriveLetter } from "../../../lib/pathDisplay";

type BootstrapState = "loading" | "ready" | "error";

type UseAppShellBootstrapProps = {
  settingsReady: boolean;
  loadSettings: () => Promise<void>;
};

const MIN_SCAN_FEEDBACK_MS = 600;
const IGNORED_SCAN_FAILURE_SIGNATURES_KEY = "ai-session.ignored-scan-failure-signatures";

const normalizeClaudeProjectPaths = (paths: string[]) => {
  return Array.from(
    new Set(
      paths
        .map((item) => normalizeWindowsDriveLetter(item))
        .filter((item) => item.length > 0),
    ),
  );
};

const normalizeFailedFileDetails = (summary: RefreshSummary | null) => {
  return (summary?.failedFileDetails ?? []).map((detail) => ({
    sourceTool: detail.sourceTool ?? "",
    sourcePath: normalizeWindowsDriveLetter(detail.sourcePath ?? ""),
    message: detail.message ?? "",
  }));
};

const buildFailedDetailSignature = (detail: {
  sourceTool: string;
  sourcePath: string;
  message: string;
}) => {
  return `${detail.sourceTool}::${detail.sourcePath}::${detail.message}`;
};

const readIgnoredFailureSignatures = () => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(IGNORED_SCAN_FAILURE_SIGNATURES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return [];
  }
};

const writeIgnoredFailureSignatures = (value: string[]) => {
  if (typeof window === "undefined") {
    return;
  }
  if (value.length === 0) {
    window.localStorage.removeItem(IGNORED_SCAN_FAILURE_SIGNATURES_KEY);
    return;
  }
  window.localStorage.setItem(IGNORED_SCAN_FAILURE_SIGNATURES_KEY, JSON.stringify(value));
};

export function useAppShellBootstrap({ settingsReady, loadSettings }: UseAppShellBootstrapProps) {
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>("loading");
  const [scanInFlight, setScanInFlight] = useState(false);
  const [scanVersion, setScanVersion] = useState(-1);
  const [lastScanAtMs, setLastScanAtMs] = useState<number | null>(null);
  const [claudeProjectPaths, setClaudeProjectPaths] = useState<string[]>([]);
  const [scanErrorMessage, setScanErrorMessage] = useState<string | null>(null);
  const [lastScanSummary, setLastScanSummary] = useState<RefreshSummary | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const hasBootstrappedRef = useRef(false);
  const scanStartedAtRef = useRef<number | null>(null);
  const scanFeedbackTimerRef = useRef<number | null>(null);
  const [ignoredFailureSignatures, setIgnoredFailureSignatures] = useState<string[]>(() =>
    readIgnoredFailureSignatures(),
  );

  const isInitializing = bootstrapState === "loading";

  const normalizedFailedDetails = useMemo(
    () => normalizeFailedFileDetails(lastScanSummary),
    [lastScanSummary],
  );
  const visibleFailedFileDetails = useMemo(
    () =>
      normalizedFailedDetails.filter(
        (detail) => !ignoredFailureSignatures.includes(buildFailedDetailSignature(detail)),
      ),
    [ignoredFailureSignatures, normalizedFailedDetails],
  );
  const ignoredFailedFileDetails = useMemo(
    () =>
      normalizedFailedDetails.filter((detail) =>
        ignoredFailureSignatures.includes(buildFailedDetailSignature(detail)),
      ),
    [ignoredFailureSignatures, normalizedFailedDetails],
  );
  const rawFailedFiles =
    typeof lastScanSummary?.failedFiles === "number" &&
    Number.isFinite(lastScanSummary.failedFiles) &&
    lastScanSummary.failedFiles > 0
      ? Math.trunc(lastScanSummary.failedFiles)
      : 0;
  const scanFailedFiles =
    normalizedFailedDetails.length > 0 ? visibleFailedFileDetails.length : rawFailedFiles;
  const onRescan = useCallback(() => {
    if (scanInFlight) {
      return;
    }
    setReloadToken((token) => token + 1);
  }, [scanInFlight]);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspace = async () => {
      try {
        await api.getRuntimeWorkspace();
      } catch {
        // 忽略工作区探测失败，仍允许按默认数据源继续加载。
      } finally {
        if (!cancelled) {
          setWorkspaceReady(true);
        }
      }
    };

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    void loadSettings();
  }, [loadSettings, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady || !settingsReady) {
      return;
    }

    let cancelled = false;

    const refreshSessions = async () => {
      if (scanFeedbackTimerRef.current !== null) {
        window.clearTimeout(scanFeedbackTimerRef.current);
        scanFeedbackTimerRef.current = null;
      }
      if (!cancelled && !hasBootstrappedRef.current) {
        setBootstrapState("ready");
      }
      if (!cancelled) {
        scanStartedAtRef.current = Date.now();
        setScanInFlight(true);
      }
      try {
        const summary = await api.refreshSessions();
        if (!cancelled) {
          const normalizedDetails = normalizeFailedFileDetails(summary);
          const availableSignatures = new Set(
            normalizedDetails.map((detail) => buildFailedDetailSignature(detail)),
          );
          const nextIgnoredFailureSignatures = ignoredFailureSignatures.filter((signature) =>
            availableSignatures.has(signature),
          );
          if (nextIgnoredFailureSignatures.length !== ignoredFailureSignatures.length) {
            writeIgnoredFailureSignatures(nextIgnoredFailureSignatures);
            setIgnoredFailureSignatures(nextIgnoredFailureSignatures);
          }
          setLastScanAtMs(Date.now());
          setClaudeProjectPaths(normalizeClaudeProjectPaths(summary.claudeProjectPaths ?? []));
          setLastScanSummary({
            ...summary,
            failedFiles:
              typeof summary.failedFiles === "number" && Number.isFinite(summary.failedFiles)
                ? Math.max(0, Math.trunc(summary.failedFiles))
                : 0,
            failedFileDetails: normalizedDetails,
          });
          setScanErrorMessage(null);
          setBootstrapState("ready");
          hasBootstrappedRef.current = true;
          setScanVersion((current) => current + 1);
        }
      } catch (error) {
        if (!cancelled) {
          const nextMessage =
            error instanceof Error && error.message.trim().length > 0
              ? `扫描本地会话失败：${error.message}`
              : "扫描本地会话失败，请稍后重试。";
          setClaudeProjectPaths([]);
          setLastScanSummary(null);
          setScanErrorMessage(nextMessage);
          if (!hasBootstrappedRef.current) {
            setBootstrapState("error");
          }
        }
      } finally {
        if (!cancelled) {
          const startedAt = scanStartedAtRef.current;
          const elapsed = startedAt === null ? MIN_SCAN_FEEDBACK_MS : Date.now() - startedAt;
          const remaining = Math.max(0, MIN_SCAN_FEEDBACK_MS - elapsed);
          scanFeedbackTimerRef.current = window.setTimeout(() => {
            if (!cancelled) {
              setScanInFlight(false);
              scanFeedbackTimerRef.current = null;
            }
          }, remaining);
        }
      }
    };

    void refreshSessions();

    return () => {
      cancelled = true;
      if (scanFeedbackTimerRef.current !== null) {
        window.clearTimeout(scanFeedbackTimerRef.current);
        scanFeedbackTimerRef.current = null;
      }
    };
  }, [ignoredFailureSignatures, reloadToken, settingsReady, workspaceReady]);

  const ignoreFailedFile = useCallback((detail: { sourceTool: string; sourcePath: string; message: string }) => {
    const signature = buildFailedDetailSignature(detail);
    setIgnoredFailureSignatures((current) => {
      if (current.includes(signature)) {
        return current;
      }
      const next = [...current, signature];
      writeIgnoredFailureSignatures(next);
      return next;
    });
  }, []);

  const unignoreFailedFile = useCallback((detail: { sourceTool: string; sourcePath: string; message: string }) => {
    const signature = buildFailedDetailSignature(detail);
    setIgnoredFailureSignatures((current) => {
      if (!current.includes(signature)) {
        return current;
      }
      const next = current.filter((item) => item !== signature);
      writeIgnoredFailureSignatures(next);
      return next;
    });
  }, []);

  const clearIgnoredFailedFiles = useCallback(() => {
    writeIgnoredFailureSignatures([]);
    setIgnoredFailureSignatures([]);
  }, []);

  return {
    workspaceReady,
    bootstrapState,
    isInitializing,
    scanInFlight,
    scanVersion,
    lastScanAtMs,
    scanFailedFiles,
    claudeProjectPaths,
    scanErrorMessage,
    lastScanSummary,
    visibleFailedFileDetails,
    ignoredFailedFileDetails,
    onRescan,
    ignoreFailedFile,
    unignoreFailedFile,
    clearIgnoredFailedFiles,
  };
}
