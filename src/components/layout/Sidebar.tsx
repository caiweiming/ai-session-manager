import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SettingsModal } from "../settings/SettingsModal";
import type { AppSettings, OverviewSummary, TerminalOption } from "../../lib/tauriClient";
import type { GithubLatestRelease } from "../../lib/updateChecker";
import { formatToolName, getToolLogoSrc } from "../../lib/toolDisplay";

export type SidebarViewMode = "overview" | "trash";

const normalizeToolClass = (value: string) => {
  const safe = value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return safe || "unknown";
};

const formatBytes = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;

  const units = ["KB", "MB", "GB", "TB"] as const;
  let size = value;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  const text = size.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  return `${text} ${units[unitIndex]}`;
};

const formatBeijingDateTime = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "--";
  try {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(value));
    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        map[part.type] = part.value;
      }
    }
    if (!map.year || !map.month || !map.day || !map.hour || !map.minute || !map.second) {
      return "--";
    }
    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
  } catch {
    return "--";
  }
};

const formatUpdateErrorHint = (message: string | null) => {
  if (message === "暂无公开发布版本") {
    return message;
  }
  return "暂时无法检查更新";
};

export function Sidebar({
  layout,
  navigation,
  summary,
  settings,
  update,
  selectedTool,
  onToolChange,
  bootstrap,
  scanErrorMessage,
}: {
  layout: {
    leftWidth: number;
    setLeftWidth: (width: number) => void;
  };
  navigation: {
    viewMode: SidebarViewMode;
    onViewModeChange: (mode: SidebarViewMode) => void;
  };
  summary: OverviewSummary | null;
  settings: {
    state: AppSettings;
    terminalOptions: TerminalOption[];
    supportsResumeInTerminal: boolean;
    onThemeChange: (theme: "light" | "dark" | "system") => void;
    onScanSourceToggle: (source: "codex" | "claude" | "gemini", enabled: boolean) => void;
    onHardDeleteChange: (enabled: boolean) => void;
    onTerminalPreferenceChange: (preference: string) => void;
  };
  update: {
    currentVersion: string;
    status: "idle" | "checking" | "up_to_date" | "update_available" | "error";
    latestRelease: GithubLatestRelease | null;
    errorMessage: string | null;
    defaultReleasePageUrl: string;
    onCheckNow: () => void;
    onOpenReleasePage: (url: string) => void;
  };
  selectedTool: string | null;
  onToolChange: (tool: string | null) => void;
  bootstrap: {
    onRescan: () => void;
    lastScanAtMs?: number | null;
    scanFailedFiles?: number;
    failedFileDetails?: Array<{
      sourceTool: string;
      sourcePath: string;
      message: string;
    }>;
    ignoredFailedFileCount?: number;
    disabled?: boolean;
    scanInFlight?: boolean;
    onOpenScanFailures?: () => void;
  };
  scanErrorMessage?: string | null;
}) {
  const { leftWidth, setLeftWidth } = layout;
  const { viewMode, onViewModeChange } = navigation;
  const {
    state: settingsState,
    terminalOptions,
    supportsResumeInTerminal,
    onThemeChange,
    onScanSourceToggle,
    onHardDeleteChange,
    onTerminalPreferenceChange,
  } = settings;
  const {
    onRescan,
    lastScanAtMs,
    scanFailedFiles,
    failedFileDetails = [],
    ignoredFailedFileCount = 0,
    disabled = false,
    scanInFlight = false,
    onOpenScanFailures,
  } = bootstrap;
  const [open, setOpen] = useState(false);
  const [updatePopoverOpen, setUpdatePopoverOpen] = useState(false);
  const [updatePopoverPosition, setUpdatePopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const updateEntryRef = useRef<HTMLButtonElement | null>(null);
  const updatePopoverRef = useRef<HTMLDivElement | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const onMouseMove = useCallback(
    (event: MouseEvent) => {
      const delta = event.clientX - dragStartXRef.current;
      const nextWidth = Math.min(420, Math.max(248, dragStartWidthRef.current + delta));
      setLeftWidth(nextWidth);
    },
    [setLeftWidth],
  );

  const stopResizing = useCallback(() => {
    setResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", stopResizing);
  }, [onMouseMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [onMouseMove, stopResizing]);

  const syncUpdatePopoverPosition = useCallback(() => {
    if (!updateEntryRef.current) {
      return;
    }
    const rect = updateEntryRef.current.getBoundingClientRect();
    setUpdatePopoverPosition({
      top: rect.bottom + 10,
      left: rect.left,
    });
  }, []);

  useEffect(() => {
    if (!updatePopoverOpen) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (updateEntryRef.current?.contains(target) || updatePopoverRef.current?.contains(target)) {
        return;
      }
      setUpdatePopoverOpen(false);
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUpdatePopoverOpen(false);
      }
    };

    const handleViewportChange = () => {
      syncUpdatePopoverPosition();
    };

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleDocumentKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange);
    };
  }, [syncUpdatePopoverPosition, updatePopoverOpen]);

  const startResizing = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragStartXRef.current = event.clientX;
    dragStartWidthRef.current = leftWidth;
    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopResizing);
  };

  const toolStats = summary?.toolStats ?? [];
  const totalSizeBytes = summary?.totalSizeBytes ?? 0;
  const trashSessionsCount = summary?.trashSessions ?? 0;
  const totalWorkspaces = summary?.totalWorkspaces ?? 0;
  const activeSessions7d = summary?.activeSessions7d ?? 0;
  const normalizedScanFailedFiles =
    typeof scanFailedFiles === "number" && Number.isFinite(scanFailedFiles) && scanFailedFiles >= 0
      ? Math.trunc(scanFailedFiles)
      : 0;
  const hasScanFailures =
    (normalizedScanFailedFiles > 0 && failedFileDetails.length > 0) || ignoredFailedFileCount > 0;
  const hasScanError = typeof scanErrorMessage === "string" && scanErrorMessage.length > 0;
  const lastScanTimeText = formatBeijingDateTime(lastScanAtMs);
  const totalSessionsCount =
    typeof summary?.totalSessions === "number"
      ? summary.totalSessions
      : toolStats.reduce((sum, tool) => sum + (tool.sessionCount ?? 0), 0);
  const updateEntryText =
    update.status === "update_available"
      ? "有新版本"
      : update.status === "checking"
        ? "检查中"
        : `v${update.currentVersion}`;
  const updateHintText =
    update.status === "checking"
      ? "正在检查更新..."
      : update.status === "up_to_date"
        ? "当前已是最新版本"
        : update.status === "error"
          ? formatUpdateErrorHint(update.errorMessage)
          : null;

  return (
    <aside className={`sidebar${resizing ? " resizing" : ""}`} data-testid="sidebar" style={{ width: leftWidth }}>
      <div className="brand">
        <div className="brand-left">
          <div className="brand-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
              <path
                d="M5.2 6.1h13.6c1.16 0 2.1.94 2.1 2.1v7.2c0 1.16-.94 2.1-2.1 2.1H12l-4.2 3.8v-3.8H5.2c-1.16 0-2.1-.94-2.1-2.1V8.2c0-1.16.94-2.1 2.1-2.1z"
                fill="currentColor"
              />
              <circle cx="8.9" cy="11.9" r="1.02" fill="#6366f1" />
              <circle cx="12.1" cy="11.9" r="1.02" fill="#6366f1" />
              <rect x="14.7" y="10.9" width="2.2" height="2.2" rx="0.58" fill="#6366f1" />
              <path d="M17.2 3.7l.58 1.38 1.39.58-1.39.58-.58 1.39-.58-1.39-1.38-.58 1.38-.58.58-1.38z" fill="currentColor" />
            </svg>
          </div>
          <span>AI 会话管理</span>
          <div className="brand-version-wrap">
            <button
              ref={updateEntryRef}
              type="button"
              className={`brand-version brand-version-button${update.status === "update_available" ? " has-update" : ""}`}
              title={`当前版本 v${update.currentVersion}`}
              aria-label="app-update-entry"
              onClick={() => {
                syncUpdatePopoverPosition();
                setUpdatePopoverOpen((value) => !value);
              }}
            >
              <span>{updateEntryText}</span>
              {update.status === "update_available" ? <span className="brand-version-dot" aria-hidden /> : null}
            </button>
          </div>
        </div>
        <button className="btn-settings-icon" onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h.1a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" />
          </svg>
        </button>
      </div>

      <div className="sidebar-scroll-area">
        <div className="nav-section">
          <div
            className={`nav-item${viewMode === "overview" ? " active" : ""}`}
            onClick={() => {
              if (disabled) return;
              onViewModeChange("overview");
            }}
            aria-label="switch-overview"
            aria-disabled={disabled}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            会话总览
            <button
              className="btn-refresh-icon"
              title="重新扫描本地数据"
              aria-label="rescan-local-data"
              aria-busy={scanInFlight}
              onClick={() => {
                if (disabled) {
                  return;
                }
                onRescan();
              }}
              disabled={disabled}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                data-testid="rescan-local-data-icon"
                className={scanInFlight ? "spinning" : ""}
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>
          <div
            className={`nav-item nav-item-danger${viewMode === "trash" ? " active" : ""}`}
            onClick={() => {
              if (disabled) return;
              onViewModeChange("trash");
            }}
            aria-label="switch-trash"
            aria-disabled={disabled}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            回收站
            <span className="nav-badge nav-badge-danger">{trashSessionsCount}</span>
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-title">工具筛选</div>
          <div className="filter-list">
            <button className={`filter-item${selectedTool === null ? " active" : ""}`} onClick={() => onToolChange(null)} type="button">
              <span className="tool-logo-wrap all-tools-logo" aria-hidden>
                <svg viewBox="0 0 16 16" fill="none">
                  <path
                    d="M9.9 2.2a3.2 3.2 0 0 0-2.2 5.5L3 12.4a1 1 0 0 0 0 1.4l.2.2a1 1 0 0 0 1.4 0l4.7-4.7a3.2 3.2 0 0 0 4-4l-2 2-1.6-.4-.4-1.6 2-2a3.2 3.2 0 0 0-1.4-.3z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              全部工具
              <span className="nav-badge">{totalSessionsCount}</span>
            </button>
            {toolStats.map((tool) => {
              const toolClass = normalizeToolClass(tool.sourceTool);
              const label = formatToolName(tool.sourceTool);
              const logoSrc = getToolLogoSrc(tool.sourceTool);
              return (
                <button
                  key={tool.sourceTool}
                  className={`filter-item${selectedTool === tool.sourceTool ? " active" : ""}`}
                  onClick={() => onToolChange(tool.sourceTool)}
                  type="button"
                >
                  {logoSrc ? (
                    <span className="tool-logo-wrap" aria-hidden>
                      <img className={`tool-logo${toolClass === "codex" ? " codex-logo" : ""}`} src={logoSrc} alt="" />
                    </span>
                  ) : (
                    <span className={`filter-dot ${toolClass}`} />
                  )}
                  {label}
                  <span className="nav-badge">{tool.sessionCount}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-title">数据概览</div>
          <div className="sidebar-metrics" role="group" aria-label="overview-metrics">
            <div className="sidebar-metric-row">
              <span className="sidebar-metric-icon primary" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="sidebar-metric-info">
                <span className="sidebar-metric-label">总工作区目录</span>
                <span className="sidebar-metric-value">{totalWorkspaces}</span>
              </span>
            </div>
            <div className="sidebar-metric-row">
              <span className="sidebar-metric-icon warning" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </span>
              <span className="sidebar-metric-info">
                <span className="sidebar-metric-label">活跃会话 (7天内)</span>
                <span className="sidebar-metric-value">{activeSessions7d}</span>
              </span>
            </div>
            <button
              type="button"
              className={`sidebar-metric-row sidebar-metric-row-button${hasScanFailures ? " active" : ""}`}
              aria-label="open-scan-failures-drawer"
              onClick={() => {
                if (!hasScanFailures) {
                  return;
                }
                onOpenScanFailures?.();
              }}
              disabled={!hasScanFailures}
            >
              <span className="sidebar-metric-icon danger" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3l-8.47-14.14a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </span>
              <span className="sidebar-metric-info">
                <span className="sidebar-metric-label">扫描异常文件数</span>
                <span className="sidebar-metric-value">{normalizedScanFailedFiles}</span>
              </span>
            </button>
            {hasScanError ? (
              <div className="sidebar-metric-row sidebar-metric-row-error" data-testid="scan-error-metric">
                <span className="sidebar-metric-icon danger" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </span>
                <span className="sidebar-metric-info">
                  <span className="sidebar-metric-label">扫描状态</span>
                  <span className="sidebar-metric-value sidebar-metric-value-error" title={scanErrorMessage}>
                    扫描失败
                  </span>
                </span>
              </div>
            ) : null}
            <div className="sidebar-metric-row">
              <span className="sidebar-metric-icon success" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="8" />
                  <polyline points="12 8 12 12 15 14" />
                </svg>
              </span>
              <span className="sidebar-metric-info">
                <span className="sidebar-metric-label">最近扫描</span>
                <span className="sidebar-metric-value metric-time" title={lastScanTimeText}>
                  {lastScanTimeText}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="storage-widget">
        <div className="storage-header">
          <span>本地存储占用</span>
          <span className="storage-header-value">{formatBytes(totalSizeBytes)}</span>
        </div>
        <div className="storage-bar-bg">
          {toolStats.length === 0 ? (
            <div className="storage-segment unknown" style={{ width: "100%" }} />
          ) : (
            toolStats.map((tool) => {
              const ratio = totalSizeBytes > 0 ? (tool.totalSizeBytes / totalSizeBytes) * 100 : 0;
              const width = Math.max(0, Math.min(100, ratio));
              const toolLabel = formatToolName(tool.sourceTool);
              return (
                <div
                  key={tool.sourceTool}
                  className={`storage-segment ${normalizeToolClass(tool.sourceTool)}`}
                  style={{ width: `${width}%` }}
                  title={`${toolLabel}: ${formatBytes(tool.totalSizeBytes)}`}
                />
              );
            })
          )}
        </div>
        <div className="storage-legend">
          {toolStats.map((tool) => {
            const toolLabel = formatToolName(tool.sourceTool);
            return (
              <div className="legend-item" key={tool.sourceTool}>
                <span className={`dot ${normalizeToolClass(tool.sourceTool)}`} />
                {toolLabel}
              </div>
            );
          })}
        </div>
      </div>

      <SettingsModal
        open={open}
        onClose={() => setOpen(false)}
        settings={settingsState}
        terminalOptions={terminalOptions}
        supportsResumeInTerminal={supportsResumeInTerminal}
        onThemeChange={onThemeChange}
        onScanSourceToggle={onScanSourceToggle}
        onHardDeleteChange={onHardDeleteChange}
        onTerminalPreferenceChange={onTerminalPreferenceChange}
      />
      {updatePopoverOpen && updatePopoverPosition
        ? createPortal(
            <div
              ref={updatePopoverRef}
              className="update-popover"
              data-testid="update-popover"
              style={{
                top: `${updatePopoverPosition.top}px`,
                left: `${updatePopoverPosition.left}px`,
              }}
            >
              <div className="update-popover-title">版本与更新</div>
              <div className="update-popover-current">{`当前版本 v${update.currentVersion}`}</div>
              {update.status === "update_available" && update.latestRelease ? (
                <div className="update-popover-latest">
                  <span>发现新版本</span>
                  <strong>{update.latestRelease.tagName}</strong>
                </div>
              ) : null}
              {updateHintText ? (
                <div
                  className={`update-popover-hint${update.status === "error" ? " error" : ""}`}
                  title={update.status === "error" ? (update.errorMessage ?? "暂时无法检查更新") : undefined}
                >
                  {updateHintText}
                </div>
              ) : null}
              <div className="update-popover-actions">
                <button
                  type="button"
                  className="btn-secondary update-popover-button"
                  onClick={() => {
                    update.onCheckNow();
                  }}
                  disabled={update.status === "checking"}
                >
                  {update.status === "checking" ? "检查中..." : "检查更新"}
                </button>
                <button
                  type="button"
                  className="btn-secondary update-popover-button"
                  onClick={() => {
                    update.onOpenReleasePage(update.latestRelease?.url ?? update.defaultReleasePageUrl);
                  }}
                >
                  打开发布页
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
      <div className="resizer-x" aria-hidden onMouseDown={startResizing} />
    </aside>
  );
}
