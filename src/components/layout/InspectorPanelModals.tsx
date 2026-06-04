import { InspectorView } from "../inspector/InspectorView";
import { normalizeWindowsDriveLetter } from "../../lib/pathDisplay";
import type { SessionDetail, SubagentSessionRow } from "../../lib/tauriClient";

export function InspectorHardDeleteConfirmModal({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className={`modal-overlay${open ? " active" : ""}`}
      data-testid="inspector-hard-delete-confirm-modal"
      onClick={onClose}
      aria-hidden={!open}
    >
      <div className="modal-card confirm-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>确认永久删除</h3>
          <button className="btn-close" aria-label="close-inspector-hard-delete-confirm" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="confirm-modal-body">将永久删除此会话记录，且不可恢复。</div>
        <div className="confirm-modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-danger active btn-danger-solid" aria-label="confirm-inspector-hard-delete" disabled={busy} onClick={onConfirm}>
            {busy ? "删除中..." : "确认永久删除"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InspectorSubagentSummaryModal({
  open,
  subagentRows,
  selectedSubagentId,
  selectedSubagentRow,
  selectedSubagentDetail,
  selectedSubagentLoading,
  selectedSubagentMessages,
  onClose,
  onSelectSubagent,
}: {
  open: boolean;
  subagentRows: SubagentSessionRow[];
  selectedSubagentId: string | null;
  selectedSubagentRow: SubagentSessionRow | null;
  selectedSubagentDetail: SessionDetail | null;
  selectedSubagentLoading: boolean;
  selectedSubagentMessages: Array<{
    role: "user" | "assistant" | "ai" | "tool" | "dev";
    content: string;
    createdAt: string;
  }>;
  onClose: () => void;
  onSelectSubagent: (sourceId: string) => void;
}) {
  return (
    <div
      className={`modal-overlay${open ? " active" : ""}`}
      data-testid="subagent-summary-modal"
      onClick={onClose}
      aria-hidden={!open}
    >
      <div className="modal-card subagent-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>子代理会话梳理</h3>
          <button className="btn-close" aria-label="close-subagent-summary-modal" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="subagent-modal-body">
          <aside className="subagent-modal-list">
            {subagentRows.map((row) => (
              <button
                key={`${row.sourceTool}:${row.sourceId}`}
                className={`subagent-modal-item${selectedSubagentId === row.sourceId ? " active" : ""}`}
                aria-label={`open-subagent-${row.sourceId}`}
                onClick={() => onSelectSubagent(row.sourceId)}
              >
                <span className="subagent-modal-item-title">{row.title || row.sourceId}</span>
                <span className="subagent-modal-item-meta">{`最后更新：${row.updatedAt || "--"}`}</span>
              </button>
            ))}
          </aside>
          <section className="subagent-modal-detail">
            <div className="subagent-modal-detail-header">
              <span className="subagent-modal-detail-meta">
                {selectedSubagentDetail?.sourcePath || selectedSubagentRow?.sourcePath || "--"}
              </span>
              <span className="subagent-modal-detail-meta">
                {normalizeWindowsDriveLetter(
                  selectedSubagentDetail?.workspacePath || selectedSubagentRow?.workspacePath || "--",
                )}
              </span>
            </div>
            {selectedSubagentLoading ? (
              <div className="subagent-modal-empty">正在加载子代理会话回放...</div>
            ) : selectedSubagentDetail ? (
              <InspectorView open={true} onClose={() => {}} messages={selectedSubagentMessages} />
            ) : (
              <div className="subagent-modal-empty">未找到该子代理会话详情</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function InspectorConversationModal({
  open,
  detail,
  title,
  sourcePath,
  messages,
  onClose,
}: {
  open: boolean;
  detail: SessionDetail | null;
  title: string;
  sourcePath: string;
  messages: Array<{
    role: "user" | "assistant" | "ai" | "tool" | "dev";
    content: string;
    createdAt: string;
  }>;
  onClose: () => void;
}) {
  return open ? (
    <div className="modal-overlay active" data-testid="conversation-modal" onClick={onClose} aria-hidden={false}>
      <div className="modal-card conversation-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>对话记录</h3>
          <button className="btn-close" aria-label="close-conversation-modal" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="conversation-modal-body">
          <div className="conversation-modal-detail-header">
            <span className="conversation-modal-detail-title">{title}</span>
            <span className="conversation-modal-detail-meta">{sourcePath}</span>
          </div>
          <section className="conversation-modal-content">
            {detail ? (
              <InspectorView open={true} onClose={() => {}} messages={messages} />
            ) : (
              <div className="conversation-modal-empty">当前未选择会话</div>
            )}
          </section>
        </div>
      </div>
    </div>
  ) : null;
}

export function InspectorToastOverlay({
  toast,
}: {
  toast: { type: "success" | "info" | "error"; text: string } | null;
}) {
  return (
    <div className={`toast-overlay${toast ? " active" : ""}`} aria-live="polite">
      {toast ? (
        <div className={`toast-card ${toast.type}`}>
          <span className="toast-icon" aria-hidden>
            {toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}
          </span>
          <span>{toast.text}</span>
        </div>
      ) : null}
    </div>
  );
}
