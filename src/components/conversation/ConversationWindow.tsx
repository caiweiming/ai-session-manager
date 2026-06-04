import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { InspectorView } from "../inspector/InspectorView";
import { api, type SessionDetail } from "../../lib/tauriClient";
import { writeConversationWindowBounds } from "../../lib/conversationWindowState";

const normalizeRole = (role: string): "user" | "assistant" | "ai" | "tool" | "dev" => {
  if (role === "user" || role === "assistant" || role === "ai" || role === "tool" || role === "dev") {
    return role;
  }
  return "dev";
};

const readQuery = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    sourceTool: params.get("sourceTool") ?? "",
    sourceId: params.get("sourceId") ?? "",
  };
};

export function ConversationWindow() {
  const [{ sourceTool, sourceId }] = useState(readQuery);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!sourceTool || !sourceId) {
      setLoading(false);
      setErrorText("缺少会话参数，无法加载对话记录。");
      return () => {
        cancelled = true;
      };
    }

    const loadDetail = async () => {
      setLoading(true);
      setErrorText("");
      try {
        const result = await api.getSessionDetail({
          sourceTool,
          sourceId,
        });
        if (!cancelled) {
          if (!result.detail) {
            setErrorText("未找到会话详情。");
          }
          setDetail(result.detail);
        }
      } catch {
        if (!cancelled) {
          setErrorText("加载会话详情失败，请稍后重试。");
          setDetail(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [sourceId, sourceTool]);

  useEffect(() => {
    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;
    let cancelled = false;

    const attachWindowPersistence = async () => {
      try {
        const appWindow = getCurrentWindow();

        const persistSize = async (width: number, height: number) => {
          try {
            const scale = await appWindow.scaleFactor();
            writeConversationWindowBounds({
              width: Math.round(width / scale),
              height: Math.round(height / scale),
            });
          } catch {
            // ignore persistence failures
          }
        };

        const persistPosition = async (x: number, y: number) => {
          try {
            const scale = await appWindow.scaleFactor();
            writeConversationWindowBounds({
              x: Math.round(x / scale),
              y: Math.round(y / scale),
            });
          } catch {
            // ignore persistence failures
          }
        };

        unlistenResized = await appWindow.onResized(({ payload }) => {
          void persistSize(payload.width, payload.height);
        });
        unlistenMoved = await appWindow.onMoved(({ payload }) => {
          void persistPosition(payload.x, payload.y);
        });

        const [initialSize, initialPosition, scale] = await Promise.all([
          appWindow.innerSize(),
          appWindow.outerPosition(),
          appWindow.scaleFactor(),
        ]);
        if (!cancelled) {
          writeConversationWindowBounds({
            width: Math.round(initialSize.width / scale),
            height: Math.round(initialSize.height / scale),
            x: Math.round(initialPosition.x / scale),
            y: Math.round(initialPosition.y / scale),
          });
        }
      } catch {
        // keep feature optional in non-tauri/runtime-fallback environments
      }
    };

    void attachWindowPersistence();

    return () => {
      cancelled = true;
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, []);

  const messages = useMemo(
    () =>
      (detail?.messages || []).map((message) => ({
        role: normalizeRole(message.role),
        content: message.content,
        createdAt: message.createdAt,
      })),
    [detail?.messages],
  );

  const title = detail?.title || `${sourceTool} ${sourceId}`.trim() || "对话记录";

  return (
    <main className="conversation-window">
      <header className="conversation-window-header">
        <div className="conversation-window-title" title={title}>
          {title}
        </div>
        <div className="conversation-window-actions">
          <button className="btn-secondary conversation-window-close" onClick={() => window.close()}>
            关闭窗口
          </button>
        </div>
      </header>
      <section className="conversation-window-body">
        {loading ? (
          <div className="conversation-window-empty">正在加载对话记录...</div>
        ) : errorText ? (
          <div className="conversation-window-empty">{errorText}</div>
        ) : (
          <InspectorView open={true} onClose={() => {}} messages={messages} />
        )}
      </section>
    </main>
  );
}
