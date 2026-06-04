import type { MouseEvent as ReactMouseEvent } from "react";
import { getToolLogoSrc } from "../../lib/toolDisplay";
import type {
  NormalizedSessionRow,
  SessionGroup,
  SessionResumeState,
  SessionTableViewMode,
} from "./sessionTableTypes";
import {
  formatSizeForDisplay,
  formatTimestampForDisplay,
  renderHighlightedText,
} from "./sessionTableUtils";

const SessionTableCheckbox = ({
  ariaLabel,
  checked,
  disabled = false,
  onChange,
}: {
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className={`session-table-checkbox-wrap${checked ? " checked" : ""}${disabled ? " disabled" : ""}`}>
    <input
      type="checkbox"
      className="session-table-checkbox"
      aria-label={ariaLabel}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className={`session-table-checkbox-indicator${checked ? " checked" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 14 14" className="session-table-checkbox-icon" aria-hidden="true">
        <polyline points="3 7.4 5.8 10.2 11 4.6" />
      </svg>
    </span>
  </label>
);

const MultiSourceLogo = () => (
  <svg className="tool-logo multi-source-logo" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="4.2" cy="8" r="2.3" fill="currentColor" fillOpacity="0.86" />
    <circle cx="11.8" cy="5.1" r="2.3" fill="currentColor" fillOpacity="0.72" />
    <circle cx="11.8" cy="10.9" r="2.3" fill="currentColor" fillOpacity="0.58" />
    <path d="M6.2 7.2 9.6 5.8M6.2 8.8 9.6 10.2" stroke="currentColor" strokeOpacity="0.66" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
);

const SessionActionButton = ({
  state,
  onClick,
  label,
  ariaLabel,
  pendingLabel,
  successLabel,
  errorLabel,
  className,
  icon,
  disabled = false,
}: {
  state: SessionResumeState;
  onClick: () => void;
  label: string;
  ariaLabel: string;
  pendingLabel: string;
  successLabel: string;
  errorLabel: string;
  className: string;
  icon: "play" | "restore";
  disabled?: boolean;
}) => {
  const isPending = state === "pending";
  const isSuccess = state === "success";
  const isError = state === "error";
  const title = isPending
    ? pendingLabel
    : isSuccess
      ? successLabel
      : isError
        ? errorLabel
        : label;

  return (
    <button
      className={`${className}${isSuccess ? " resume-success" : isError ? " resume-error" : ""}`}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled || isPending}
      onClick={onClick}
    >
      {isPending ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
          <path d="M20 12a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" className="resume-spinner-arc" />
        </svg>
      ) : isSuccess ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : isError ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden>
          <line x1="7" y1="7" x2="17" y2="17" />
          <line x1="17" y1="7" x2="7" y2="17" />
        </svg>
      ) : icon === "restore" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M3 12a9 9 0 1 0 2.64-6.36" />
          <polyline points="3 3 3 9 9 9" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      )}
    </button>
  );
};

export const SessionTableHeader = ({
  allSelected,
  onToggleAll,
}: {
  allSelected: boolean;
  onToggleAll: (checked: boolean) => void;
}) => (
    <div className="session-table-header session-table-grid" role="row">
      <div className="session-table-cell col-checkbox" role="columnheader">
        <SessionTableCheckbox
          ariaLabel="select-all-sessions"
          checked={allSelected}
          onChange={onToggleAll}
        />
    </div>
    <div className="session-table-cell col-tool" role="columnheader">工具</div>
    <div className="session-table-cell" role="columnheader">目录路径 / 会话记录</div>
    <div className="session-table-cell col-time" role="columnheader">创建时间</div>
    <div className="session-table-cell col-time" role="columnheader">更新时间</div>
    <div className="session-table-cell col-action" role="columnheader">操作</div>
  </div>
);

export const SessionTableStickyGroupRow = ({
  group,
  onToggleExpanded,
  onOpenGroupPath,
}: {
  group: SessionGroup;
  onToggleExpanded: () => void;
  onOpenGroupPath: () => void;
}) => {
  const isMultiSourceGroup = group.toolLabel === "多来源";
  const groupLogoSrc = isMultiSourceGroup
    ? null
    : getToolLogoSrc(group.rows[0]?.tool ?? "");

  return (
    <div
      className="session-table-sticky-group session-table-grid"
      role="row"
      data-testid="session-table-sticky-group"
    >
      <div className="session-table-cell col-checkbox" role="cell" />
      <div className="session-table-cell col-tool" role="cell">
        <span className={`tag ${group.toolClass}`} title={group.toolLabel}>
          {isMultiSourceGroup ? <MultiSourceLogo /> : null}
          {!isMultiSourceGroup && groupLogoSrc ? (
            <img
              className={`tool-logo${group.toolClass === "codex" ? " codex-logo" : ""}`}
              src={groupLogoSrc}
              alt=""
            />
          ) : null}
          {group.toolShortLabel}
        </span>
      </div>
      <div className="session-table-cell" role="cell">
        <div className="path-cell">
          <button
            type="button"
            className="chevron open"
            aria-label={`toggle-sticky-group-${group.displayPath}`}
            onClick={onToggleExpanded}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
          <div className="group-path-main">
            <span className="group-path-text" title={group.displayPath}>
              {group.displayPath}
            </span>
            <button
              type="button"
              className="group-path-open-btn sticky-group-open-btn"
              aria-label={`open-sticky-group-path-${group.displayPath}`}
              onClick={onOpenGroupPath}
              title="打开目录"
              disabled={group.displayPath === "未知路径"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 3h7v7" />
                <path d="M10 14 21 3" />
                <path d="M21 14v7H3V3h7" />
              </svg>
            </button>
          </div>
          <span className="session-count">
            {group.rows.length} 个会话 · {formatSizeForDisplay(group.totalSizeBytes)}
          </span>
        </div>
      </div>
      <div className="session-table-cell time-cell sticky-group-time" role="cell">
        {formatTimestampForDisplay(group.createdAt)}
      </div>
      <div className="session-table-cell time-cell sticky-group-time" role="cell">
        {formatTimestampForDisplay(group.updatedAt)}
      </div>
      <div className="session-table-cell" role="cell">
        <span className="session-kind-chip main sticky-group-chip">目录</span>
      </div>
    </div>
  );
};

export const SessionTableGroupRow = ({
  group,
  expanded,
  hiddenForSticky = false,
  groupSelected,
  highlightKeyword,
  onToggleRows,
  onToggleExpanded,
  onOpenGroupPath,
}: {
  group: SessionGroup;
  expanded: boolean;
  hiddenForSticky?: boolean;
  groupSelected: boolean;
  highlightKeyword: string;
  onToggleRows: (checked: boolean) => void;
  onToggleExpanded: () => void;
  onOpenGroupPath: () => void;
}) => {
  const isMultiSourceGroup = group.toolLabel === "多来源";
  const groupLogoSrc = isMultiSourceGroup
    ? null
    : getToolLogoSrc(group.rows[0]?.tool ?? "");

  return (
    <div
      className={`group-header session-table-row session-table-grid session-virtual-row${hiddenForSticky ? " sticky-source-hidden" : ""}`}
      role="row"
    >
      <div className="session-table-cell col-checkbox" role="cell">
        <SessionTableCheckbox
          ariaLabel={`select-group-${group.displayPath}`}
          checked={groupSelected}
          disabled={group.rows.length === 0}
          onChange={onToggleRows}
        />
      </div>
      <div className="session-table-cell" role="cell">
        <span className={`tag ${group.toolClass}`} title={group.toolLabel}>
          {isMultiSourceGroup ? <MultiSourceLogo /> : null}
          {!isMultiSourceGroup && groupLogoSrc ? (
            <img
              className={`tool-logo${group.toolClass === "codex" ? " codex-logo" : ""}`}
              src={groupLogoSrc}
              alt=""
            />
          ) : null}
          {group.toolShortLabel}
        </span>
      </div>
      <div className="session-table-cell" role="cell">
        <div className="path-cell">
          <button
            className={`chevron${expanded ? " open" : ""}`}
            aria-label={`toggle-group-${group.displayPath}`}
            disabled={group.rows.length === 0}
            onClick={onToggleExpanded}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
          <div className="group-path-main">
            <span className="group-path-text" title={group.displayPath}>
              {renderHighlightedText(group.displayPath, highlightKeyword)}
            </span>
            <button
              className="group-path-open-btn"
              aria-label={`open-group-path-${group.displayPath}`}
              onClick={onOpenGroupPath}
              title="打开目录"
              disabled={group.displayPath === "未知路径"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 3h7v7" />
                <path d="M10 14 21 3" />
                <path d="M21 14v7H3V3h7" />
              </svg>
            </button>
          </div>
          <span className="session-count">
            {group.rows.length} 个会话 · {formatSizeForDisplay(group.totalSizeBytes)}
          </span>
        </div>
      </div>
      <div className="session-table-cell time-cell" role="cell">{formatTimestampForDisplay(group.createdAt)}</div>
      <div className="session-table-cell time-cell" role="cell">{formatTimestampForDisplay(group.updatedAt)}</div>
      <div className="session-table-cell" role="cell" />
    </div>
  );
};

export const SessionTableDataRow = ({
  row,
  active,
  checked,
  isLastChild,
  highlightKeyword,
  viewMode,
  resumeState,
  supportsResumeInTerminal,
  onToggle,
  onActivate,
  onResume,
  onRestore,
  onOpenDeletePopover,
}: {
  row: NormalizedSessionRow;
  active: boolean;
  checked: boolean;
  isLastChild: boolean;
  highlightKeyword: string;
  viewMode: SessionTableViewMode;
  resumeState: SessionResumeState;
  supportsResumeInTerminal: boolean;
  onToggle: () => void;
  onActivate: () => void;
  onResume: () => void;
  onRestore: () => void;
  onOpenDeletePopover: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) => {
  const rowLogoSrc = getToolLogoSrc(row.tool);

  return (
    <div
      className={`session-row session-table-row session-table-grid session-virtual-row ${checked ? "checked" : ""} ${
        active ? "selected" : ""
      } ${row.isSubagent ? "subagent-row" : "main-row"} ${isLastChild ? "last-child" : ""}`}
      role="row"
    >
      <div className="session-table-cell col-checkbox" role="cell">
        <SessionTableCheckbox
          ariaLabel={`select-row-${row.id}`}
          checked={checked}
          onChange={onToggle}
        />
      </div>
      <div className="session-table-cell" role="cell">
        <span className={`tag ${row.toolClass}`} title={row.toolLabel}>
          {rowLogoSrc ? (
            <img
              className={`tool-logo${row.toolClass === "codex" ? " codex-logo" : ""}`}
              src={rowLogoSrc}
              alt=""
            />
          ) : null}
          {row.toolShortLabel}
        </span>
      </div>
      <div className="session-table-cell" role="cell">
        <div className="session-name-cell">
          <button
            type="button"
            className="session-title-btn"
            onClick={onActivate}
          >
            {renderHighlightedText(row.title, highlightKeyword)}
          </button>
          <span className={`session-kind-chip ${row.isSubagent ? "subagent" : "main"}`}>
            {row.isSubagent ? "子代理" : "主会话"}
          </span>
          <span className="session-size-value">{formatSizeForDisplay(row.sizeBytes)}</span>
        </div>
      </div>
      <div className="session-table-cell time-cell" role="cell">{formatTimestampForDisplay(row.createdAt)}</div>
      <div className="session-table-cell time-cell" role="cell">{formatTimestampForDisplay(row.updatedAt)}</div>
      <div className="session-table-cell" role="cell">
        <div className={`row-actions${resumeState !== "idle" ? " has-feedback" : ""}`}>
          {viewMode === "trash" ? (
            <SessionActionButton
              state={resumeState}
              label="恢复"
              ariaLabel={`restore-trash-row-${row.id}`}
              pendingLabel="恢复中..."
              successLabel="已恢复"
              errorLabel="恢复失败"
              className="btn-icon-action btn-resume-action btn-trash-restore-action"
              icon="restore"
              onClick={onRestore}
            />
          ) : (
            <SessionActionButton
              state={resumeState}
              label="恢复对话"
              ariaLabel={`restore-row-${row.id}`}
              pendingLabel="正在启动恢复..."
              successLabel="已启动恢复"
              errorLabel="启动失败"
              className="btn-icon-action btn-resume-action"
              icon="play"
              disabled={!supportsResumeInTerminal}
              onClick={() => {
                onResume();
              }}
            />
          )}
          {viewMode !== "trash" ? (
            <button
              className="btn-icon-action danger-hover"
              aria-label={`delete-row-${row.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenDeletePopover(event);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const SessionTableDeletePopover = ({
  deletePopover,
  deletingId,
  popoverRef,
  onCancel,
  onConfirm,
}: {
  deletePopover: { id: string; left: number; top: number };
  deletingId: string | null;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <div
    className="confirm-popover active"
    data-testid="delete-popover"
    ref={popoverRef}
    style={{ left: deletePopover.left, top: deletePopover.top }}
  >
    <span className="confirm-popover-text">移入回收站？</span>
    <div className="confirm-popover-actions">
      <button
        className="btn-confirm-mini cancel"
        aria-label="cancel-delete-popover"
        disabled={deletingId !== null}
        onClick={onCancel}
      >
        取消
      </button>
      <button
        className="btn-confirm-mini danger"
        aria-label="confirm-delete-popover"
        disabled={deletingId !== null}
        onClick={onConfirm}
      >
        确定
      </button>
    </div>
  </div>
);
