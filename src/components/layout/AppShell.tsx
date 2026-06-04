import { InspectorPanel } from "./InspectorPanel";
import { MainArea } from "./MainArea";
import { Sidebar } from "./Sidebar";
import { useAppShellBootstrap } from "./hooks/useAppShellBootstrap";
import { useAppSettingsController } from "./hooks/useAppSettingsController";
import { useNativeWindowSync } from "./hooks/useNativeWindowSync";
import { useUpdateChecker } from "./hooks/useUpdateChecker";
import { useSessionDetailController } from "./hooks/useSessionDetailController";
import { useSessionListController } from "./hooks/useSessionListController";
import { useSessionMutationController } from "./hooks/useSessionMutationController";
import { useResizablePanels } from "../../hooks/useResizablePanels";
import { copyPlainText, normalizeToolClass } from "./inspectorPanelUtils";
import { api } from "../../lib/tauriClient";
import { formatToolName, getToolLogoSrc } from "../../lib/toolDisplay";
import { normalizeWindowsDriveLetter } from "../../lib/pathDisplay";
import { DEFAULT_RELEASES_PAGE_URL, RELEASE_SOURCES } from "../../lib/releaseConfig";
import { useCallback, useEffect, useMemo, useState } from "react";
import packageJson from "../../../package.json";

type TrashClearProgressState = {
  deletedSessions: number;
  totalSessions: number;
};

export function AppShell() {
  const { leftWidth, rightWidth, setLeftWidth } = useResizablePanels();
  const [scanFailuresOpen, setScanFailuresOpen] = useState(false);
  const [ignoredFailuresExpanded, setIgnoredFailuresExpanded] = useState(false);
  const [copiedFailedPath, setCopiedFailedPath] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState(packageJson.version);
  const [trashClearInFlight, setTrashClearInFlight] = useState(false);
  const [trashClearProgress, setTrashClearProgress] = useState<TrashClearProgressState | null>(null);
  const { appSettings, platformCapabilities, settingsReady, loadSettings, patchAppSettings } = useAppSettingsController();
  const {
    workspaceReady,
    bootstrapState,
    scanInFlight,
    scanVersion,
    lastScanAtMs,
    scanFailedFiles,
    claudeProjectPaths,
    scanErrorMessage,
    visibleFailedFileDetails,
    ignoredFailedFileDetails,
    onRescan,
    ignoreFailedFile,
    unignoreFailedFile,
    clearIgnoredFailedFiles,
  } = useAppShellBootstrap({
    settingsReady,
    loadSettings,
  });
  const {
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
  } = useSessionListController({
    workspaceReady,
    bootstrapState,
    scanVersion,
    claudeProjectPaths,
  });
  const {
    activeSessionId,
    detail,
    detailLoading,
    subagentRows,
    subagentsLoading,
    inspectorOpen,
    handleCloseInspector,
    handleSessionSelection,
    handleLoadMoreMessages,
    resetDetailState,
  } = useSessionDetailController({
    rows,
    viewMode,
  });

  const update = useUpdateChecker({
    currentVersion,
    releaseSources: RELEASE_SOURCES,
  });

  useNativeWindowSync(appSettings.themeMode);

  useEffect(() => {
    let cancelled = false;

    void api.getAppVersion().then((version) => {
      if (!cancelled && typeof version === "string" && version.trim().length > 0) {
        setCurrentVersion(version);
      }
    }).catch(() => {
      // 保持静默降级到 package.json 版本，避免影响主界面加载。
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void api.onTrashClearProgress((progress) => {
      if (disposed) {
        return;
      }
      setTrashClearInFlight(true);
      setTrashClearProgress({
        deletedSessions: progress.deletedSessions,
        totalSessions: progress.totalSessions,
      });
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    }).catch(() => {
      // 非 Tauri 环境下静默退化，不影响主界面。
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const handleAfterMutation = useCallback(() => {
    resetDetailState();
    requestDataReload();
  }, [requestDataReload, resetDetailState]);

  const mutation = useSessionMutationController({
    viewMode,
    terminalPreference: appSettings.terminalPreference,
    supportsResumeInTerminal: platformCapabilities.supportsResumeInTerminal,
    onAfterMutation: handleAfterMutation,
    onClearTrashStart: () => {
      setTrashClearInFlight(true);
      setTrashClearProgress((current) => current ?? { deletedSessions: 0, totalSessions: 0 });
    },
    onClearTrashFinish: () => {
      setTrashClearInFlight(false);
      setTrashClearProgress(null);
    },
  });

  const settings = {
    state: appSettings,
    terminalOptions: platformCapabilities.terminalOptions,
    supportsResumeInTerminal: platformCapabilities.supportsResumeInTerminal,
    onThemeChange: (theme: "light" | "dark" | "system") => {
      void patchAppSettings({ themeMode: theme });
    },
    onScanSourceToggle: (source: "codex" | "claude" | "gemini", enabled: boolean) => {
      void patchAppSettings({
        scanSources: {
          ...appSettings.scanSources,
          [source]: enabled,
        },
      });
    },
    onHardDeleteChange: (enabled: boolean) => {
      void patchAppSettings({ hardDelete: enabled });
    },
    onTerminalPreferenceChange: (preference: string) => {
      void patchAppSettings({ terminalPreference: preference });
    },
  };

  const bootstrap = {
    onRescan,
    lastScanAtMs,
    scanFailedFiles,
    failedFileDetails: visibleFailedFileDetails,
    ignoredFailedFileCount: ignoredFailedFileDetails.length,
    disabled: scanInFlight,
    scanInFlight,
    onOpenScanFailures: () => {
      handleCloseInspector();
      setIgnoredFailuresExpanded(false);
      setScanFailuresOpen(true);
    },
  };
  const failedFileDetails = useMemo(() => visibleFailedFileDetails.map((detail) => ({
    sourceTool: detail.sourceTool,
    sourcePath: normalizeWindowsDriveLetter(detail.sourcePath),
    message: detail.message,
  })), [visibleFailedFileDetails]);
  const ignoredFileDetails = useMemo(() => ignoredFailedFileDetails.map((detail) => ({
    sourceTool: detail.sourceTool,
    sourcePath: normalizeWindowsDriveLetter(detail.sourcePath),
    message: detail.message,
  })), [ignoredFailedFileDetails]);

  const revealFailedFile = useCallback(async (sourcePath: string) => {
    if (!sourcePath || sourcePath === "--") {
      return;
    }
    try {
      await api.openInExplorer({ path: sourcePath, reveal: true });
    } catch {
      const slashIndex = Math.max(sourcePath.lastIndexOf("\\"), sourcePath.lastIndexOf("/"));
      const parentDirectory = slashIndex > 0 ? sourcePath.slice(0, slashIndex) : "";
      if (!parentDirectory) {
        return;
      }
      try {
        await api.openInExplorer({ path: parentDirectory, reveal: false });
      } catch {
        // 打开失败时保持静默，不打断当前排查流程。
      }
    }
  }, []);

  useEffect(() => {
    if (!copiedFailedPath) return;
    const timer = window.setTimeout(() => {
      setCopiedFailedPath((current) => (current === copiedFailedPath ? null : current));
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [copiedFailedPath]);

  useEffect(() => {
    if (!inspectorOpen) {
      return;
    }
    setScanFailuresOpen(false);
  }, [inspectorOpen]);

  const handleCopyFailedPath = useCallback(async (sourcePath: string) => {
    try {
      await copyPlainText(sourcePath);
      setCopiedFailedPath(sourcePath);
    } catch {
      setCopiedFailedPath((current) => (current === sourcePath ? null : current));
    }
  }, []);

  const list = {
    activeSessionId,
    onActiveSessionChange: handleSessionSelection,
    viewMode,
    selectedTool,
    onSelectedToolChange: setSelectedTool,
    onResetBrowseState: resetBrowseState,
    searchKeyword,
    onSearchKeywordChange: setSearchKeyword,
    updatedWithinDays,
    onUpdatedWithinDaysChange: setUpdatedWithinDays,
    rows,
    groupPathHints,
    sessionsState,
  };

  const detailPanel = {
    open: inspectorOpen,
    onClose: handleCloseInspector,
    detail,
    detailLoading,
    subagentRows,
    subagentsLoading,
    defaultHardDelete: appSettings.hardDelete,
    onLoadMoreMessages: handleLoadMoreMessages,
  };

  return (
    <div
      className="app-shell"
      style={{ gridTemplateColumns: `${leftWidth}px minmax(0, 1fr)` }}
    >
      {scanInFlight ? (
        <div className="main-scan-status" data-testid="main-scan-status" role="status" aria-live="polite">
          <div className="main-scan-status-card">
            <span className="main-scan-status-spinner" aria-hidden />
            <span>数据扫描中</span>
          </div>
        </div>
      ) : null}
      {!scanInFlight && trashClearInFlight ? (
        <div className="main-scan-status" data-testid="main-trash-clear-status" role="status" aria-live="polite">
          <div className="main-scan-status-card main-scan-status-card-wide">
            <span className="main-scan-status-spinner" aria-hidden />
            <div className="main-scan-status-copy">
              <span>正在删除回收站会话</span>
              <span className="main-scan-status-subtext">
                {trashClearProgress && trashClearProgress.totalSessions > 0
                  ? `已处理 ${trashClearProgress.deletedSessions} / ${trashClearProgress.totalSessions}`
                  : "正在准备删除批次..."}
              </span>
            </div>
          </div>
        </div>
      ) : null}
      <Sidebar
        layout={{ leftWidth, setLeftWidth }}
        navigation={{ viewMode, onViewModeChange: setViewMode }}
        summary={overviewSummary}
        settings={settings}
        update={{
          currentVersion,
          status: update.status,
          latestRelease: update.latestRelease,
          errorMessage: update.errorMessage,
          defaultReleasePageUrl: DEFAULT_RELEASES_PAGE_URL,
          onCheckNow: () => {
            void update.runCheck();
          },
          onOpenReleasePage: (url: string) => {
            void api.openExternalUrl({ url });
          },
        }}
        selectedTool={selectedTool}
        onToolChange={setSelectedTool}
        bootstrap={bootstrap}
        scanErrorMessage={scanErrorMessage}
      />
      <MainArea
        list={list}
        mutation={mutation}
        scanErrorMessage={scanErrorMessage}
        onRetryScan={onRescan}
        scanInFlight={scanInFlight}
        trashClearInFlight={trashClearInFlight}
      />
      <InspectorPanel
        panelWidth={rightWidth}
        detailPanel={detailPanel}
        mutation={mutation}
      />
      <section
        className={`inspector-panel scan-failures-panel${scanFailuresOpen ? "" : " collapsed"}`}
        style={{ width: rightWidth }}
        data-testid="scan-failures-panel"
        aria-hidden={!scanFailuresOpen}
      >
        <div className="inspector-scroll-area">
            <div className="inspector-header">
              <div className="inspector-sticky-header">
                <div className="inspector-top-bar">
                  <div className="scan-failures-summary">
                    当前待处理 {scanFailedFiles} 个，已忽略 {ignoredFileDetails.length} 个
                  </div>
                  <button
                    className="btn-close-panel"
                    aria-label="close-scan-failures-panel"
                    onClick={() => setScanFailuresOpen(false)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="13 17 18 12 13 7" />
                      <polyline points="6 17 11 12 6 7" />
                    </svg>
                  </button>
                </div>
                <div className="inspector-title">
                  <span className="inspector-title-text">扫描异常文件</span>
                </div>
              </div>
              <div className="inspector-header-body">
                {scanInFlight ? (
                  <div className="scan-failures-empty">数据扫描中...</div>
                ) : failedFileDetails.length === 0 ? (
                  <div className="scan-failures-empty">当前没有待处理的异常文件</div>
                ) : (
                  <div className="scan-failures-section">
                    <div className="scan-failures-section-title">待处理异常文件</div>
                    <div className="scan-failures-list">
                      {failedFileDetails.map((detail) => {
                        const toolClass = normalizeToolClass(detail.sourceTool);
                        const toolLogoSrc = getToolLogoSrc(detail.sourceTool);
                        const isCopied = copiedFailedPath === detail.sourcePath;
                        return (
                          <div
                            key={`${detail.sourceTool}:${detail.sourcePath}:${detail.message}`}
                            className="scan-failures-item"
                          >
                            <div className="scan-failures-item-head">
                              <div className="scan-failures-item-main">
                                <div className={`tag ${toolClass}`}>
                                  {toolLogoSrc ? <img className="tool-logo" src={toolLogoSrc} alt="" /> : null}
                                  {formatToolName(detail.sourceTool)}
                                </div>
                                <div className="scan-failures-file-name" title={detail.sourcePath}>
                                  {detail.sourcePath.split(/[/\\]/).pop() || detail.sourcePath}
                                </div>
                              </div>
                              <div className="scan-failures-item-actions">
                                <button
                                  type="button"
                                  className={`scan-failures-icon-button${isCopied ? " copied" : ""}`}
                                  aria-label={`copy-failed-file-path-${detail.sourcePath}`}
                                  title={isCopied ? "已复制" : "复制路径"}
                                  onClick={() => {
                                    void handleCopyFailedPath(detail.sourcePath);
                                  }}
                                >
                                  {isCopied ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                      <rect x="9" y="9" width="11" height="11" rx="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="scan-failures-icon-button"
                                  aria-label={`reveal-failed-file-${detail.sourcePath}`}
                                  title="打开所在目录"
                                  onClick={() => {
                                    void revealFailedFile(detail.sourcePath);
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  className="scan-failures-icon-button"
                                  aria-label={`ignore-failed-file-${detail.sourcePath}`}
                                  title="忽略此文件"
                                  onClick={() => {
                                    ignoreFailedFile(detail);
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.9-2.56 2.64-4.73 4.92-6.22" />
                                    <path d="M10.58 10.58a2 2 0 1 0 2.83 2.83" />
                                    <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.8 11.8 0 0 1-1.67 3.1" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                            <div className="scan-failures-item-meta">
                              <div className="scan-failures-path">{detail.sourcePath}</div>
                              <div className="scan-failures-message">{detail.message}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {ignoredFileDetails.length > 0 ? (
                  <div className="scan-failures-section scan-failures-section-muted">
                    <div className="scan-failures-section-heading">
                      <button
                        type="button"
                        className="scan-failures-section-toggle"
                        aria-expanded={ignoredFailuresExpanded}
                        onClick={() => setIgnoredFailuresExpanded((current) => !current)}
                      >
                        <span className={`scan-failures-section-chevron${ignoredFailuresExpanded ? " expanded" : ""}`} aria-hidden>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <polyline points="8 10 12 14 16 10" />
                          </svg>
                        </span>
                        <span className="scan-failures-section-title">已忽略 {ignoredFileDetails.length} 个文件</span>
                      </button>
                      <button
                        type="button"
                        className="scan-failures-section-action"
                        onClick={clearIgnoredFailedFiles}
                      >
                        全部取消忽略
                      </button>
                    </div>
                    {ignoredFailuresExpanded ? (
                      <div className="scan-failures-list">
                      {ignoredFileDetails.map((detail) => {
                        const toolClass = normalizeToolClass(detail.sourceTool);
                        const toolLogoSrc = getToolLogoSrc(detail.sourceTool);
                        const isCopied = copiedFailedPath === detail.sourcePath;
                        return (
                          <div
                            key={`${detail.sourceTool}:${detail.sourcePath}:${detail.message}`}
                            className="scan-failures-item scan-failures-item-muted"
                          >
                            <div className="scan-failures-item-head">
                              <div className="scan-failures-item-main">
                                <div className={`tag ${toolClass}`}>
                                  {toolLogoSrc ? <img className="tool-logo" src={toolLogoSrc} alt="" /> : null}
                                  {formatToolName(detail.sourceTool)}
                                </div>
                                <div className="scan-failures-file-name" title={detail.sourcePath}>
                                  {detail.sourcePath.split(/[/\\]/).pop() || detail.sourcePath}
                                </div>
                              </div>
                              <div className="scan-failures-item-actions">
                                <button
                                  type="button"
                                  className={`scan-failures-icon-button${isCopied ? " copied" : ""}`}
                                  aria-label={`copy-failed-file-path-${detail.sourcePath}`}
                                  title={isCopied ? "已复制" : "复制路径"}
                                  onClick={() => {
                                    void handleCopyFailedPath(detail.sourcePath);
                                  }}
                                >
                                  {isCopied ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                      <rect x="9" y="9" width="11" height="11" rx="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="scan-failures-icon-button"
                                  aria-label={`unignore-failed-file-${detail.sourcePath}`}
                                  title="取消忽略"
                                  onClick={() => {
                                    unignoreFailedFile(detail);
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                            <div className="scan-failures-item-meta">
                              <div className="scan-failures-path">{detail.sourcePath}</div>
                              <div className="scan-failures-message">{detail.message}</div>
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="scan-failures-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setScanFailuresOpen(false)}
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    className="btn-secondary toolbar-inline-btn"
                    onClick={onRescan}
                    disabled={scanInFlight}
                  >
                    重新扫描
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
    </div>
  );
}
