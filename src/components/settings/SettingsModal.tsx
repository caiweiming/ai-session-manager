import { useEffect, useRef, useState, type RefObject } from "react";
import type { AppSettings, TerminalOption } from "../../lib/tauriClient";
import { CustomSelect } from "../ui/CustomSelect";

type SettingsSectionKey = "scan" | "theme" | "terminal" | "security";
const SECTION_SCROLL_TOP_GAP = 28;

export function SettingsModal({
  open,
  onClose,
  settings,
  terminalOptions,
  supportsResumeInTerminal,
  onThemeChange,
  onScanSourceToggle,
  onHardDeleteChange,
  onTerminalPreferenceChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  terminalOptions: TerminalOption[];
  supportsResumeInTerminal: boolean;
  onThemeChange: (theme: "light" | "dark" | "system") => void;
  onScanSourceToggle: (source: "codex" | "claude" | "gemini", enabled: boolean) => void;
  onHardDeleteChange: (enabled: boolean) => void;
  onTerminalPreferenceChange: (preference: string) => void;
}) {
  const theme = settings.themeMode;
  const hardDelete = settings.hardDelete;
  const terminalPreference = settings.terminalPreference;
  const scanSources = settings.scanSources ?? {
    codex: true,
    claude: true,
    gemini: true,
  };
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("scan");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scanSectionRef = useRef<HTMLDivElement | null>(null);
  const themeSectionRef = useRef<HTMLDivElement | null>(null);
  const terminalSectionRef = useRef<HTMLDivElement | null>(null);
  const securitySectionRef = useRef<HTMLDivElement | null>(null);

  const sectionRefMap: Record<SettingsSectionKey, RefObject<HTMLDivElement | null>> = {
    scan: scanSectionRef,
    theme: themeSectionRef,
    terminal: terminalSectionRef,
    security: securitySectionRef,
  };

  const scrollToSection = (section: SettingsSectionKey) => {
    setActiveSection(section);
    const container = contentRef.current;
    const target = sectionRefMap[section].current;
    if (!container || !target) return;
    const top = Math.max(0, target.offsetTop - SECTION_SCROLL_TOP_GAP);
    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        top,
        behavior: "smooth",
      });
      return;
    }
    container.scrollTop = top;
  };

  useEffect(() => {
    if (!open) return;
    setActiveSection("scan");
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [open]);

  return (
    <div className={`modal-overlay${open ? " active" : ""}`} onClick={onClose} aria-hidden={!open}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>全局设置</h3>
          <button className="btn-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-nav">
            <button
              type="button"
              className={`modal-nav-item${activeSection === "scan" ? " active" : ""}`}
              onClick={() => scrollToSection("scan")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              扫描与路径
            </button>
            <button
              type="button"
              className={`modal-nav-item${activeSection === "theme" ? " active" : ""}`}
              onClick={() => scrollToSection("theme")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              外观与主题
            </button>
            <button
              type="button"
              className={`modal-nav-item${activeSection === "terminal" ? " active" : ""}`}
              onClick={() => scrollToSection("terminal")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 17h16" />
                <path d="M6 13h12" />
                <path d="M8 9h8" />
                <path d="M10 5h4" />
              </svg>
              恢复终端
            </button>
            <button
              type="button"
              className={`modal-nav-item${activeSection === "security" ? " active" : ""}`}
              onClick={() => scrollToSection("security")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              安全与清理
            </button>
          </div>
          <div className="modal-content-area" ref={contentRef}>
            <section className="settings-group settings-section" ref={scanSectionRef} data-section="scan">
              <div className="settings-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                扫描规则配置
              </div>
              <div className="settings-row">
                <div className="settings-label">
                  <span className="settings-name">默认扫描来源</span>
                  <span className="settings-desc">控制启动扫描和后台监听是否包含对应工具来源。</span>
                </div>
              </div>
              {[
                {
                  key: "codex" as const,
                  title: "Codex 会话",
                  desc: "扫描用户主目录下 `.codex` 中的会话记录。",
                },
                {
                  key: "claude" as const,
                  title: "Claude 会话",
                  desc: "扫描用户主目录下 `.claude/projects` 中的主会话与子代理会话。",
                },
                {
                  key: "gemini" as const,
                  title: "Gemini 会话",
                  desc: "扫描用户主目录下 `.gemini/tmp/*/chats` 中的会话记录。",
                },
              ].map((item) => (
                <div className="settings-row" key={item.key}>
                  <div className="settings-label">
                    <span className="settings-name">{item.title}</span>
                    <span className="settings-desc">{item.desc}</span>
                  </div>
                  <label className="switch modal-switch">
                    <input
                      aria-label={`scan-source-${item.key}`}
                      type="checkbox"
                      checked={scanSources[item.key]}
                      onChange={(event) => onScanSourceToggle(item.key, event.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>
              ))}
            </section>

            <section className="settings-group settings-group-divider settings-section" ref={themeSectionRef} data-section="theme">
              <div className="settings-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                界面颜色主题
              </div>
              <div className="settings-desc theme-description">选择您偏好的应用外观，或使其跟随操作系统自动切换。</div>
              <div className="theme-card-group">
                {["light", "dark", "system"].map((t) => (
                  <button
                    key={t}
                    className={`theme-card ${theme === t ? "active" : ""}`.trim()}
                    onClick={() => {
                      onThemeChange(t as "light" | "dark" | "system");
                    }}
                  >
                    <div className={`theme-color-preview ${t}`} />
                    <span className="theme-card-title">{t === "light" ? "浅色模式" : t === "dark" ? "深色模式" : "跟随系统"}</span>
                  </button>
                ))}
              </div>
            </section>

            <section
              className="settings-group settings-group-divider settings-section"
              ref={terminalSectionRef}
              data-section="terminal"
            >
              <div className="settings-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <path d="M4 17h16" />
                  <path d="M6 13h12" />
                  <path d="M8 9h8" />
                  <path d="M10 5h4" />
                </svg>
                恢复对话终端
              </div>
              <div className="settings-row">
                <div className="settings-label">
                  <span className="settings-name">恢复会话时使用的终端</span>
                  <span className="settings-desc">
                    {supportsResumeInTerminal
                      ? "默认“自动（推荐）”会优先保证可用性。"
                      : "当前平台暂不支持在终端中直接恢复会话。"}
                  </span>
                </div>
                <CustomSelect
                  ariaLabel="terminal-preference-select"
                  value={terminalPreference}
                  options={terminalOptions.map((option) => ({ value: option.id, label: option.label }))}
                  onChange={onTerminalPreferenceChange}
                  disabled={!supportsResumeInTerminal}
                  className="settings-custom-select"
                />
              </div>
            </section>

            <section
              className="settings-group settings-group-divider settings-section"
              ref={securitySectionRef}
              data-section="security"
            >
              <div className="settings-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                删除行为默认值
              </div>
              <div className="settings-row">
                <div className="settings-label">
                  <span className="settings-name">默认永久删除（不进回收站）</span>
                  <span className="settings-desc">打开后，详情面板删除开关默认选中。</span>
                </div>
                <label className="switch modal-switch">
                  <input type="checkbox" checked={hardDelete} onChange={(e) => onHardDeleteChange(e.target.checked)} />
                  <span className="slider" />
                </label>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
