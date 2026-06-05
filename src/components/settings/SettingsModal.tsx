import { useEffect, useRef, useState, type RefObject } from "react";
import { RELEASE_SOURCES } from "../../lib/releaseConfig";
import type { AppSettings, TerminalOption } from "../../lib/tauriClient";
import type { GithubLatestRelease } from "../../lib/updateChecker";
import { CustomSelect } from "../ui/CustomSelect";

type SettingsSectionKey = "scan" | "theme" | "terminal" | "security" | "about";
type AboutUpdateStatus = "idle" | "checking" | "up_to_date" | "update_available" | "error";
type AboutUpdate = {
  status: AboutUpdateStatus;
  latestRelease: GithubLatestRelease | null;
  errorMessage: string | null;
  defaultReleasePageUrl: string;
  onCheckNow: () => void;
  onOpenReleasePage: (url: string) => void;
};
const SECTION_SCROLL_TOP_GAP = 28;
const SETTINGS_SECTIONS: Array<{ key: SettingsSectionKey; label: string }> = [
  { key: "scan", label: "扫描规则" },
  { key: "theme", label: "外观主题" },
  { key: "terminal", label: "恢复终端" },
  { key: "security", label: "删除行为" },
  { key: "about", label: "关于" },
];
const SETTINGS_SECTION_LABELS = Object.fromEntries(
  SETTINGS_SECTIONS.map((section) => [section.key, section.label]),
) as Record<SettingsSectionKey, string>;

export function SettingsModal({
  open,
  onClose,
  settings,
  currentVersion,
  aboutUpdate,
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
  currentVersion?: string;
  aboutUpdate?: AboutUpdate;
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
  const updateStatusText =
    aboutUpdate?.status === "checking"
      ? "正在检查更新..."
      : aboutUpdate?.status === "update_available" && aboutUpdate.latestRelease
        ? `发现新版本 ${aboutUpdate.latestRelease.tagName}`
        : aboutUpdate?.status === "up_to_date"
          ? "当前已是最新版本。"
          : aboutUpdate?.status === "error"
            ? (aboutUpdate.errorMessage ?? "暂时无法检查更新")
            : "可手动检查是否有新版本。";
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("scan");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pendingProgrammaticSectionRef = useRef<SettingsSectionKey | null>(null);
  const scanSectionRef = useRef<HTMLDivElement | null>(null);
  const themeSectionRef = useRef<HTMLDivElement | null>(null);
  const terminalSectionRef = useRef<HTMLDivElement | null>(null);
  const securitySectionRef = useRef<HTMLDivElement | null>(null);
  const aboutSectionRef = useRef<HTMLDivElement | null>(null);

  const sectionRefMap: Record<SettingsSectionKey, RefObject<HTMLDivElement | null>> = {
    scan: scanSectionRef,
    theme: themeSectionRef,
    terminal: terminalSectionRef,
    security: securitySectionRef,
    about: aboutSectionRef,
  };

  const getSectionScrollTop = (container: HTMLDivElement, target: HTMLDivElement) => {
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return Math.max(0, container.scrollTop + targetRect.top - containerRect.top - SECTION_SCROLL_TOP_GAP);
  };

  const getSectionTopDistance = (container: HTMLDivElement, target: HTMLDivElement) => {
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return Math.abs(targetRect.top - containerRect.top - SECTION_SCROLL_TOP_GAP);
  };

  const resolveActiveSectionFromScroll = () => {
    const container = contentRef.current;
    if (!container) return;
    let nextSection: SettingsSectionKey = "scan";
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const section of SETTINGS_SECTIONS) {
      const target = sectionRefMap[section.key].current;
      if (!target) continue;
      const distance = getSectionTopDistance(container, target);
      if (distance < closestDistance) {
        closestDistance = distance;
        nextSection = section.key;
      }
    }

    const pendingSection = pendingProgrammaticSectionRef.current;
    if (pendingSection && pendingSection !== nextSection) {
      setActiveSection(pendingSection);
      return;
    }

    pendingProgrammaticSectionRef.current = null;
    setActiveSection(nextSection);
  };

  const scrollToSection = (section: SettingsSectionKey) => {
    pendingProgrammaticSectionRef.current = section;
    setActiveSection(section);
    const container = contentRef.current;
    const target = sectionRefMap[section].current;
    if (!container || !target) {
      pendingProgrammaticSectionRef.current = null;
      return;
    }
    const top = getSectionScrollTop(container, target);
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
    pendingProgrammaticSectionRef.current = null;
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
              {SETTINGS_SECTION_LABELS.scan}
            </button>
            <button
              type="button"
              className={`modal-nav-item${activeSection === "theme" ? " active" : ""}`}
              onClick={() => scrollToSection("theme")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              {SETTINGS_SECTION_LABELS.theme}
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
              {SETTINGS_SECTION_LABELS.terminal}
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
              {SETTINGS_SECTION_LABELS.security}
            </button>
            <button
              type="button"
              className={`modal-nav-item${activeSection === "about" ? " active" : ""}`}
              onClick={() => scrollToSection("about")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              {SETTINGS_SECTION_LABELS.about}
            </button>
          </div>
          <div className="modal-content-area" ref={contentRef} onScroll={resolveActiveSectionFromScroll}>
            <section className="settings-group settings-section" ref={scanSectionRef} data-section="scan">
              <h4 className="settings-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                {SETTINGS_SECTION_LABELS.scan}
              </h4>
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
              <h4 className="settings-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                {SETTINGS_SECTION_LABELS.theme}
              </h4>
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
              <h4 className="settings-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <path d="M4 17h16" />
                  <path d="M6 13h12" />
                  <path d="M8 9h8" />
                  <path d="M10 5h4" />
                </svg>
                {SETTINGS_SECTION_LABELS.terminal}
              </h4>
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
              <h4 className="settings-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                {SETTINGS_SECTION_LABELS.security}
              </h4>
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

            <section
              className="settings-group settings-group-divider settings-section"
              ref={aboutSectionRef}
              data-section="about"
            >
              <h4 className="settings-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                {SETTINGS_SECTION_LABELS.about}
              </h4>
              <div className="settings-about-panel">
                <div className="settings-about-primary">
                  <span className="settings-about-name">AI 会话管理</span>
                  <span className="settings-about-version">版本 {currentVersion ?? "0.1.1"}</span>
                </div>
                <p className="settings-about-desc">用于本地汇总、检索和恢复 AI 工具会话记录。</p>
                <div className="settings-about-update">
                  <span className={`settings-about-update-status${aboutUpdate?.status === "error" ? " error" : ""}`}>
                    {updateStatusText}
                  </span>
                </div>
                <div className="settings-about-actions" aria-label="关于操作">
                  {aboutUpdate ? (
                    <>
                      <button
                        type="button"
                        className="settings-about-link"
                        onClick={aboutUpdate.onCheckNow}
                        disabled={aboutUpdate.status === "checking"}
                      >
                        {aboutUpdate.status === "checking" ? "检查中..." : "检查更新"}
                      </button>
                      {aboutUpdate.status === "update_available" && aboutUpdate.latestRelease ? (
                        <button
                          type="button"
                          className="settings-about-link"
                          onClick={() => aboutUpdate.onOpenReleasePage(aboutUpdate.latestRelease?.url ?? aboutUpdate.defaultReleasePageUrl)}
                        >
                          打开最新版本
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {RELEASE_SOURCES.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => aboutUpdate?.onOpenReleasePage(source.releasesPageUrl)}
                      className="settings-about-link"
                    >
                      {source.id === "github" ? "GitHub 发布页" : "Gitee 发布页"}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
