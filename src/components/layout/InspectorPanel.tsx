import { useMemo } from "react";
import { InspectorView } from "../inspector/InspectorView";
import type { SessionDetail, SubagentSessionRow } from "../../lib/tauriClient";
import { formatToolName, getToolLogoSrc } from "../../lib/toolDisplay";
import { normalizeWindowsDriveLetter } from "../../lib/pathDisplay";
import {
  InspectorConversationModal,
  InspectorSubagentSummaryModal,
  InspectorToastOverlay,
} from "./InspectorPanelModals";
import {
  buildResumeCommand,
  extractWorkspacePath,
  formatBytes,
  formatExactTokenCount,
  formatTokenCount,
  normalizeRole,
  normalizeToolClass,
} from "./inspectorPanelUtils";
import { useInspectorPanelController } from "./hooks/useInspectorPanelController";
import type { useSessionMutationController } from "./hooks/useSessionMutationController";

const InspectorResumeActionIcon = ({ state }: { state: "idle" | "pending" | "success" | "error" }) => {
  if (state === "pending") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
        <path d="M20 12a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" className="resume-spinner-arc" />
      </svg>
    );
  }
  if (state === "success") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (state === "error") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden>
        <line x1="7" y1="7" x2="17" y2="17" />
        <line x1="17" y1="7" x2="7" y2="17" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
};

type ActiveSessionPreview = {
  sourceTool: string;
  sourceId: string;
  title: string;
  isSubagent?: boolean;
};

function InspectorDetailSkeleton({ onClose, activeSession }: { onClose: () => void; activeSession: ActiveSessionPreview | null }) {
  const toolClass = normalizeToolClass(activeSession?.sourceTool);
  const toolLogoSrc = getToolLogoSrc(activeSession?.sourceTool);
  const toolLabel = activeSession?.sourceTool ? `${formatToolName(activeSession.sourceTool)} 会话记录` : "正在加载会话";
  const sessionKindLabel = activeSession?.isSubagent ? "子代理" : "主会话";

  return (
    <div className="inspector-detail-skeleton" data-testid="inspector-detail-skeleton" role="status" aria-live="polite">
      <div className="inspector-sticky-header">
        <div className="inspector-top-bar">
          <div className="inspector-context">
            <div className={`tag ${toolClass}`}>
              {toolLogoSrc ? <img className="tool-logo" src={toolLogoSrc} alt="" /> : null}
              {toolLabel}
            </div>
            <span className={`session-kind-chip inspector ${activeSession?.isSubagent ? "subagent" : "main"}`}>
              {sessionKindLabel}
            </span>
          </div>
          <div className="inspector-top-actions">
            <button className="btn-close-panel" aria-label="close-inspector-pane" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="13 17 18 12 13 7" />
                <polyline points="6 17 11 12 6 7" />
              </svg>
            </button>
          </div>
        </div>
        <div className="inspector-title" data-testid="inspector-title-skeleton">
          <span className="inspector-title-text">{activeSession?.title || "正在加载会话详情"}</span>
        </div>
      </div>
      <div className="inspector-skeleton-metadata" data-testid="inspector-metadata-skeleton" aria-hidden>
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} className={`inspector-skeleton-line inspector-skeleton-meta meta-${index + 1}`} />
        ))}
      </div>
      <div className="inspector-skeleton-conversation" data-testid="inspector-conversation-skeleton" aria-hidden>
        <div className="section-title">对话记录</div>
        <div className="conversation-skeleton-message conversation-skeleton-message-user">
          <span className="inspector-skeleton-line conversation-skeleton-role" />
          <span className="inspector-skeleton-line conversation-skeleton-content wide" />
          <span className="inspector-skeleton-line conversation-skeleton-content medium" />
        </div>
        <div className="conversation-skeleton-message">
          <span className="inspector-skeleton-line conversation-skeleton-role" />
          <span className="inspector-skeleton-line conversation-skeleton-content wide" />
          <span className="inspector-skeleton-line conversation-skeleton-content short" />
        </div>
      </div>
      <span className="sr-only">正在加载会话详情</span>
    </div>
  );
}

export function InspectorPanel({
  panelWidth,
  detailPanel,
  mutation,
}: {
  panelWidth: number;
  detailPanel: {
    open: boolean;
    onClose: () => void;
    detail: SessionDetail | null;
    detailLoading: boolean;
    activeSession?: ActiveSessionPreview | null;
    subagentRows: SubagentSessionRow[];
    subagentsLoading: boolean;
    onLoadMoreMessages: () => void;
  };
  mutation: Pick<
    ReturnType<typeof useSessionMutationController>,
    "handleDeleteSession" | "handleExportSession" | "handleResumeSession" | "supportsResumeInTerminal"
  >;
}) {
  const { open, onClose, detail, detailLoading, activeSession = null, subagentRows, subagentsLoading, onLoadMoreMessages } =
    detailPanel;
  const { handleDeleteSession, handleExportSession, handleResumeSession, supportsResumeInTerminal } = mutation;
  const detailMatchesActiveSession =
    !activeSession ||
    (detail?.sourceTool === activeSession.sourceTool && detail.sourceId === activeSession.sourceId);
  const showDetailSkeleton = Boolean(activeSession && !detailMatchesActiveSession) || (detailLoading && !detail);
  const title = detail?.title || "未选择会话";
  const sessionId = detail?.sourceId || "--";
  const sourcePath = normalizeWindowsDriveLetter(detail?.sourcePath || "--");
  const createdAt = detail?.createdAt || "--";
  const updatedAt = detail?.updatedAt || "--";
  const sizeText = formatBytes(detail?.sizeBytes);
  const inputTokenText = formatTokenCount(detail?.inputTokens);
  const outputTokenText = formatTokenCount(detail?.outputTokens);
  const inputTokenExactText = formatExactTokenCount(detail?.inputTokens);
  const outputTokenExactText = formatExactTokenCount(detail?.outputTokens);
  const hasMissingTokenData = detail?.inputTokens === 0 && detail?.outputTokens === 0;
  const workspacePath = normalizeWindowsDriveLetter(detail?.workspacePath || extractWorkspacePath(detail?.sourcePath));
  const loadedMessageCount = detail?.messageLoaded ?? detail?.messages.length ?? 0;
  const totalMessageCount = detail?.messageTotal ?? detail?.messages.length ?? 0;
  const hasMoreMessages = detail ? loadedMessageCount < totalMessageCount : false;
  const messageCountText = detail ? `${loadedMessageCount} / ${totalMessageCount} 条` : "--";
  const subagentCountText = subagentsLoading ? "加载中..." : `${subagentRows.length} 个`;
  const toolClass = normalizeToolClass(detail?.sourceTool);
  const toolLabel = detail?.sourceTool ? `${formatToolName(detail.sourceTool)} 会话记录` : "未选择会话";
  const toolLogoSrc = getToolLogoSrc(detail?.sourceTool);
  const sessionKindLabel = detail ? (detail.isSubagent ? "子代理" : "主会话") : "--";
  const resumeCommand = buildResumeCommand(detail?.sourceTool, detail?.sourceId);
  const messages = (detail?.messages || []).map((message) => ({
    role: normalizeRole(message.role),
    content: message.content,
    createdAt: message.createdAt,
  }));
  const {
    subagentModalOpen,
    conversationModalOpen,
    toast,
    resumeCopied,
    resumeState,
    actionBusy,
    selectedSubagentId,
    selectedSubagentDetail,
    selectedSubagentLoading,
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
  } = useInspectorPanelController({
    detail,
    subagentRows,
    subagentsLoading,
    handleDeleteSession,
    handleExportSession,
    handleResumeSession,
  });
  const selectedSubagentRow = useMemo(
    () => subagentRows.find((row) => row.sourceId === selectedSubagentId) ?? null,
    [selectedSubagentId, subagentRows],
  );
  const selectedSubagentMessages = (selectedSubagentDetail?.messages || []).map((message) => ({
    role: normalizeRole(message.role),
    content: message.content,
    createdAt: message.createdAt,
  }));
  const showInspectorResumeAction = Boolean(detail && !detail.isSubagent);
  const inspectorResumeDisabled =
    !detail ||
    detail.isSubagent === true ||
    !supportsResumeInTerminal ||
    workspacePath === "--" ||
    resumeState === "pending";
  const inspectorResumeTitle =
    resumeState === "pending"
      ? "正在启动恢复..."
      : resumeState === "success"
        ? "已启动恢复"
        : resumeState === "error"
          ? "启动失败"
          : "恢复对话";

  return (
    <>
      <section
        className={`inspector-panel${open ? "" : " collapsed"}`}
        style={{ width: panelWidth }}
        data-testid="inspector"
        aria-hidden={!open}
      >
        {showDetailSkeleton ? <InspectorDetailSkeleton onClose={onClose} activeSession={activeSession} /> : <>
        <div className="inspector-scroll-area">
          <div className="inspector-header">
            <div className="inspector-sticky-header" data-testid="inspector-sticky-header">
              <div className="inspector-top-bar">
                <div className="inspector-context">
                  <div className={`tag ${toolClass}`}>
                    {toolLogoSrc ? <img className="tool-logo" src={toolLogoSrc} alt="" /> : null}
                    {toolLabel}
                  </div>
                  <span className={`session-kind-chip inspector ${detail?.isSubagent ? "subagent" : "main"}`}>
                    {sessionKindLabel}
                  </span>
                </div>
                <div className="inspector-top-actions">
                  {detailLoading && detail ? (
                    <span className="inspector-refresh-status" role="status" aria-live="polite">
                      <span className="inspector-refresh-spinner" aria-hidden />
                      同步中
                    </span>
                  ) : null}
                  <button className="btn-close-panel" aria-label="close-inspector-pane" onClick={onClose}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="13 17 18 12 13 7" />
                      <polyline points="6 17 11 12 6 7" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="inspector-title">
                <span className="inspector-title-text">{title}</span>
              </div>
            </div>
            <div className="inspector-header-body" data-testid="inspector-header-body">
              <div className="info-grid">
                <div className="info-group">
                  <div className="info-label">会话 ID</div>
                  <div className="info-value highlight-codex">{sessionId}</div>
                  <div className="info-label">工作区</div>
                  <div className="info-value">
                    <button
                      className="workspace-path-btn"
                      aria-label="open-workspace-path"
                      disabled={!detail || workspacePath === "--"}
                      onClick={() => {
                        void openWorkspaceInExplorer(workspacePath);
                      }}
                      title={workspacePath}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      </svg>
                      <span className="workspace-path-text">{workspacePath}</span>
                    </button>
                  </div>
                  <div className="info-label align-center">文件路径</div>
                  <div className="info-value">
                    <div className="command-wrapper">
                      <button
                        className="command-path-btn"
                        aria-label="open-file-path"
                        disabled={!detail || sourcePath === "--"}
                        onClick={() => {
                          void revealSourceFile(sourcePath);
                        }}
                        title={sourcePath}
                      >
                        <code className="command-code command-path">{sourcePath}</code>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="info-group">
                  <div className="info-label">创建时间</div>
                  <div className="info-value">{createdAt}</div>
                  <div className="info-label">更新时间</div>
                  <div className="info-value">{updatedAt}</div>
                  <div className="info-label">数据大小</div>
                  <div className="info-value">{sizeText}</div>
                  <div className="info-label">输入 Token</div>
                  <div className="info-value" title={inputTokenExactText}>{inputTokenText}</div>
                  <div className="info-label">输出 Token</div>
                  <div className="info-value" title={outputTokenExactText}>{outputTokenText}</div>
                  {hasMissingTokenData ? (
                    <>
                      <div className="info-label" />
                      <div className="info-value info-value-muted">该会话无 token 数据</div>
                    </>
                  ) : null}
                </div>
                <div className="inspector-resume-command" data-testid="inspector-resume-command">
                  <div className="inspector-resume-command-label">恢复命令</div>
                  <div className="inspector-resume-command-controls">
                    <div className="command-wrapper">
                    <code className="command-code" title={resumeCommand}>
                      {resumeCommand}
                    </code>
                    <button
                      className={`btn-copy-command inspector-command-action inspector-resume-copy-action${resumeCopied ? " success" : ""}`}
                      aria-label="copy-resume-command"
                      disabled={!detail || resumeCommand === "--" || resumeCopied}
                      onClick={() => {
                        void copyResumeToClipboard(resumeCommand);
                      }}
                    >
                      {resumeCopied ? (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                    </div>
                    {showInspectorResumeAction ? (
                      <button
                        className={`btn-secondary inspector-resume-command-button${
                          resumeState === "success" ? " resume-success" : resumeState === "error" ? " resume-error" : ""
                        }`}
                        aria-label="resume-session-from-inspector"
                        title={inspectorResumeTitle}
                        disabled={inspectorResumeDisabled}
                        onClick={() => {
                          void resumeSessionFromInspector(workspacePath);
                        }}
                      >
                        <InspectorResumeActionIcon state={resumeState} />
                        <span>恢复会话</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="inspector-section no-border conversation-section">
            <div className="section-title with-badge">
              <div className="section-title-label">
                <span>对话记录</span>
                <button
                  className="btn-open-conversation-modal-icon"
                  aria-label="open-conversation-modal"
                  title="弹窗查看"
                  disabled={!detail}
                  onClick={openConversationModal}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 3h7v7" />
                    <path d="M10 14L21 3" />
                    <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
                  </svg>
                </button>
              </div>
              <div className="section-title-actions">
                {!detail?.isSubagent && (subagentsLoading || subagentRows.length > 0) ? (
                  <button
                    className="btn-secondary btn-inline-more"
                    aria-label="open-subagent-summary"
                    disabled={!detail}
                    onClick={openSubagentSummary}
                  >
                    子代理 {detail ? subagentCountText : "--"}
                  </button>
                ) : null}
                {hasMoreMessages ? (
                  <button
                    className="btn-secondary btn-inline-more"
                    aria-label="load-more-messages"
                    disabled={detailLoading || !detail}
                    onClick={onLoadMoreMessages}
                  >
                    加载更多
                  </button>
                ) : null}
                <span className="message-progress-text">{messageCountText}</span>
              </div>
            </div>
            <InspectorView open={true} onClose={() => {}} messages={messages} />
          </div>
        </div>

        <div className="inspector-actions">
          <div className="inspector-action-row">
            <button
              className="btn-secondary"
              aria-label="导出为 Markdown"
              disabled={!detail || actionBusy !== null}
              onClick={() => {
                void exportSessionAsMarkdown();
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              导出
            </button>
            <button
              className="btn btn-danger active btn-danger-solid"
              aria-label="删除此记录"
              disabled={!detail || actionBusy !== null}
              onClick={handleDeleteAction}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              删除
            </button>
          </div>
        </div>
        </>}
      </section>
      <InspectorSubagentSummaryModal
        open={subagentModalOpen}
        subagentRows={subagentRows}
        selectedSubagentId={selectedSubagentId}
        selectedSubagentRow={selectedSubagentRow}
        selectedSubagentDetail={selectedSubagentDetail}
        selectedSubagentLoading={selectedSubagentLoading}
        selectedSubagentMessages={selectedSubagentMessages}
        onClose={closeSubagentSummary}
        onSelectSubagent={setSelectedSubagentId}
      />
      <InspectorConversationModal
        open={conversationModalOpen}
        detail={detail}
        title={title}
        sourcePath={sourcePath}
        messages={messages}
        detailLoading={detailLoading}
        onLoadMoreMessages={onLoadMoreMessages}
        onClose={closeConversationModal}
      />
      <InspectorToastOverlay toast={toast} />
    </>
  );
}
