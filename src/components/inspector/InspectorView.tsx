import { useEffect, useState } from "react";

const copyPlainText = async (text: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("clipboard unavailable");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("clipboard unavailable");
  }
};

export function InspectorView({
  open,
  onClose: _onClose,
  messages,
}: {
  open: boolean;
  onClose: () => void;
  messages: Array<{ role: "user" | "assistant" | "ai" | "tool" | "dev"; content: string; createdAt: string }>;
}) {
  type DisplayRole = "user" | "ai" | "tool" | "dev";
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const toDisplayRole = (role: "user" | "assistant" | "ai" | "tool" | "dev"): DisplayRole => {
    if (role === "assistant") return "ai";
    return role;
  };

  const roleLabel: Record<"user" | "ai" | "tool" | "dev", string> = {
    user: "用户",
    ai: "AI",
    tool: "工具",
    dev: "开发者",
  };
  function renderRoleIcon(role: "user" | "ai" | "tool" | "dev") {
    if (role === "user") {
      return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    }
    if (role === "tool") {
      return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    }
    if (role === "ai") {
      return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v4" />
          <line x1="8" y1="16" x2="8" y2="16" />
          <line x1="16" y1="16" x2="16" y2="16" />
        </svg>
      );
    }
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }

  function renderAvatar(role: "user" | "ai" | "tool" | "dev") {
    if (role === "user") return null;
    if (role === "ai") return "C";
    if (role === "tool") {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    }
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    );
  }

  useEffect(() => {
    if (copiedIndex === null) return;
    const timer = window.setTimeout(() => setCopiedIndex(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedIndex]);

  const handleCopyMessage = async (content: string, index: number) => {
    setCopiedIndex(index);
    try {
      await copyPlainText(content);
    } catch {
      setCopiedIndex(null);
    }
  };

  if (!open) return null;
  return (
    <section className="inspector-view preview-box">
      {messages.map((m, i) => {
        const displayRole = toDisplayRole(m.role);

        return (
          <div className={`chat-bubble-wrapper ${displayRole}`} key={i}>
            {displayRole !== "user" && displayRole !== "ai" ? (
              <div className={`chat-avatar ${displayRole}`}>{renderAvatar(displayRole)}</div>
            ) : null}
            <div className="chat-bubble">
              <button
                className={`bubble-copy-btn${copiedIndex === i ? " copied" : ""}`}
                aria-label={`copy-message-${i}`}
                onClick={() => {
                  void handleCopyMessage(m.content, i);
                }}
              >
                {copiedIndex === i ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
              <div className="chat-content">{m.content}</div>
              <div className="chat-meta">
                <span className={`role-badge ${displayRole}`}>
                  {renderRoleIcon(displayRole)}
                  {roleLabel[displayRole]}
                </span>
                <span className="chat-time">{m.createdAt}</span>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
