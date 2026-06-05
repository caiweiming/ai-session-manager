import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

it("opens and updates theme selection", () => {
  const onThemeChange = vi.fn();
  const onTerminalPreferenceChange = vi.fn();
  const onScanSourceToggle = vi.fn();

  const TestHarness = () => {
    const [settings, setSettings] = useState({
      themeMode: "system" as const,
      hardDelete: false,
      terminalPreference: "auto" as const,
      scanSources: {
        codex: true,
        claude: true,
        gemini: true,
      },
    });

    return (
      <SettingsModal
        open={true}
        onClose={() => {}}
        settings={settings}
        onThemeChange={(theme) => {
          onThemeChange(theme);
          setSettings((prev) => ({ ...prev, themeMode: theme }));
        }}
        onScanSourceToggle={(source, enabled) => {
          onScanSourceToggle(source, enabled);
          setSettings((prev) => ({
            ...prev,
            scanSources: {
              ...prev.scanSources,
              [source]: enabled,
            },
          }));
        }}
        onHardDeleteChange={() => {}}
        onTerminalPreferenceChange={(preference) => {
          onTerminalPreferenceChange(preference);
          setSettings((prev) => ({ ...prev, terminalPreference: preference }));
        }}
        terminalOptions={[
          { id: "auto", label: "自动（推荐）" },
          { id: "terminal", label: "Terminal.app" },
        ]}
        supportsResumeInTerminal={true}
      />
    );
  };

  render(
    <TestHarness />,
  );
  fireEvent.click(screen.getByText("深色模式"));
  expect(screen.getByText("深色模式").closest("button")).toHaveClass("active");
  expect(onThemeChange).toHaveBeenCalledWith("dark");
  fireEvent.click(screen.getByLabelText("terminal-preference-select"));
  fireEvent.click(screen.getByRole("button", { name: "Terminal.app" }));
  expect(onTerminalPreferenceChange).toHaveBeenCalledWith("terminal");
  fireEvent.click(screen.getByLabelText("scan-source-claude"));
  expect(onScanSourceToggle).toHaveBeenCalledWith("claude", false);
  expect(screen.queryByText("Windows Terminal")).not.toBeInTheDocument();
  expect(screen.queryByText("自定义项目目录")).not.toBeInTheDocument();
});

it("switches active nav item when clicking settings navigation", () => {
  render(
    <SettingsModal
      open={true}
      onClose={() => {}}
      settings={{
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
        scanSources: {
          codex: true,
          claude: true,
          gemini: true,
        },
      }}
      onThemeChange={() => {}}
      onScanSourceToggle={() => {}}
      onHardDeleteChange={() => {}}
      onTerminalPreferenceChange={() => {}}
      terminalOptions={[
        { id: "auto", label: "自动（推荐）" },
        { id: "terminal", label: "Terminal.app" },
      ]}
      supportsResumeInTerminal={true}
    />,
  );

  const themeNav = screen.getByRole("button", { name: "外观主题" });
  fireEvent.click(themeNav);
  expect(themeNav).toHaveClass("active");
});

it("uses matching labels for settings navigation and section headings", () => {
  render(
    <SettingsModal
      open={true}
      onClose={() => {}}
      settings={{
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
        scanSources: {
          codex: true,
          claude: true,
          gemini: true,
        },
      }}
      onThemeChange={() => {}}
      onScanSourceToggle={() => {}}
      onHardDeleteChange={() => {}}
      onTerminalPreferenceChange={() => {}}
      terminalOptions={[
        { id: "auto", label: "自动（推荐）" },
        { id: "terminal", label: "Terminal.app" },
      ]}
      supportsResumeInTerminal={true}
    />,
  );

  for (const label of ["扫描规则", "外观主题", "恢复终端", "删除行为", "关于"]) {
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
  }
});

it("scrolls settings content relative to the content viewport when clicking navigation", () => {
  render(
    <SettingsModal
      open={true}
      onClose={() => {}}
      settings={{
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
        scanSources: {
          codex: true,
          claude: true,
          gemini: true,
        },
      }}
      onThemeChange={() => {}}
      onScanSourceToggle={() => {}}
      onHardDeleteChange={() => {}}
      onTerminalPreferenceChange={() => {}}
      terminalOptions={[
        { id: "auto", label: "自动（推荐）" },
        { id: "terminal", label: "Terminal.app" },
      ]}
      supportsResumeInTerminal={true}
    />,
  );

  const content = document.querySelector(".modal-content-area") as HTMLDivElement;
  const terminalSection = document.querySelector('[data-section="terminal"]') as HTMLElement;
  const scrollTo = vi.fn();

  content.scrollTop = 60;
  content.scrollTo = scrollTo;
  content.getBoundingClientRect = vi.fn(() => ({
    top: 120,
    left: 0,
    bottom: 520,
    right: 500,
    width: 500,
    height: 400,
    x: 0,
    y: 120,
    toJSON: () => {},
  }));
  terminalSection.getBoundingClientRect = vi.fn(() => ({
    top: 420,
    left: 0,
    bottom: 620,
    right: 500,
    width: 500,
    height: 200,
    x: 0,
    y: 420,
    toJSON: () => {},
  }));

  fireEvent.click(screen.getByRole("button", { name: "恢复终端" }));

  expect(scrollTo).toHaveBeenCalledWith({
    top: 332,
    behavior: "smooth",
  });
});

it("updates active navigation item when settings content scrolls", () => {
  render(
    <SettingsModal
      open={true}
      onClose={() => {}}
      settings={{
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
        scanSources: {
          codex: true,
          claude: true,
          gemini: true,
        },
      }}
      onThemeChange={() => {}}
      onScanSourceToggle={() => {}}
      onHardDeleteChange={() => {}}
      onTerminalPreferenceChange={() => {}}
      terminalOptions={[
        { id: "auto", label: "自动（推荐）" },
        { id: "terminal", label: "Terminal.app" },
      ]}
      supportsResumeInTerminal={true}
    />,
  );

  const content = document.querySelector(".modal-content-area") as HTMLDivElement;
  const sections = {
    scan: document.querySelector('[data-section="scan"]') as HTMLElement,
    theme: document.querySelector('[data-section="theme"]') as HTMLElement,
    terminal: document.querySelector('[data-section="terminal"]') as HTMLElement,
    security: document.querySelector('[data-section="security"]') as HTMLElement,
    about: document.querySelector('[data-section="about"]') as HTMLElement,
  };

  content.getBoundingClientRect = vi.fn(() => ({
    top: 100,
    left: 0,
    bottom: 500,
    right: 500,
    width: 500,
    height: 400,
    x: 0,
    y: 100,
    toJSON: () => {},
  }));
  sections.scan.getBoundingClientRect = vi.fn(() => ({
    top: -340,
    left: 0,
    bottom: -140,
    right: 500,
    width: 500,
    height: 200,
    x: 0,
    y: -340,
    toJSON: () => {},
  }));
  sections.theme.getBoundingClientRect = vi.fn(() => ({
    top: -80,
    left: 0,
    bottom: 100,
    right: 500,
    width: 500,
    height: 180,
    x: 0,
    y: -80,
    toJSON: () => {},
  }));
  sections.terminal.getBoundingClientRect = vi.fn(() => ({
    top: 116,
    left: 0,
    bottom: 300,
    right: 500,
    width: 500,
    height: 184,
    x: 0,
    y: 116,
    toJSON: () => {},
  }));
  sections.security.getBoundingClientRect = vi.fn(() => ({
    top: 360,
    left: 0,
    bottom: 520,
    right: 500,
    width: 500,
    height: 160,
    x: 0,
    y: 360,
    toJSON: () => {},
  }));
  sections.about.getBoundingClientRect = vi.fn(() => ({
    top: 560,
    left: 0,
    bottom: 760,
    right: 500,
    width: 500,
    height: 200,
    x: 0,
    y: 560,
    toJSON: () => {},
  }));

  fireEvent.scroll(content);

  expect(screen.getByRole("button", { name: "恢复终端" })).toHaveClass("active");
  expect(screen.getByRole("button", { name: "扫描规则" })).not.toHaveClass("active");
});

it("keeps clicked navigation item active while smooth scrolling to about section starts", () => {
  render(
    <SettingsModal
      open={true}
      onClose={() => {}}
      settings={{
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
        scanSources: {
          codex: true,
          claude: true,
          gemini: true,
        },
      }}
      onThemeChange={() => {}}
      onScanSourceToggle={() => {}}
      onHardDeleteChange={() => {}}
      onTerminalPreferenceChange={() => {}}
      terminalOptions={[
        { id: "auto", label: "自动（推荐）" },
        { id: "terminal", label: "Terminal.app" },
      ]}
      supportsResumeInTerminal={true}
    />,
  );

  const content = document.querySelector(".modal-content-area") as HTMLDivElement;
  const sections = {
    scan: document.querySelector('[data-section="scan"]') as HTMLElement,
    theme: document.querySelector('[data-section="theme"]') as HTMLElement,
    terminal: document.querySelector('[data-section="terminal"]') as HTMLElement,
    security: document.querySelector('[data-section="security"]') as HTMLElement,
    about: document.querySelector('[data-section="about"]') as HTMLElement,
  };
  const scrollTo = vi.fn();

  content.scrollTo = scrollTo;
  content.getBoundingClientRect = vi.fn(() => ({
    top: 100,
    left: 0,
    bottom: 500,
    right: 500,
    width: 500,
    height: 400,
    x: 0,
    y: 100,
    toJSON: () => {},
  }));
  sections.scan.getBoundingClientRect = vi.fn(() => ({
    top: 128,
    left: 0,
    bottom: 328,
    right: 500,
    width: 500,
    height: 200,
    x: 0,
    y: 128,
    toJSON: () => {},
  }));
  sections.theme.getBoundingClientRect = vi.fn(() => ({
    top: 360,
    left: 0,
    bottom: 540,
    right: 500,
    width: 500,
    height: 180,
    x: 0,
    y: 360,
    toJSON: () => {},
  }));
  sections.terminal.getBoundingClientRect = vi.fn(() => ({
    top: 560,
    left: 0,
    bottom: 744,
    right: 500,
    width: 500,
    height: 184,
    x: 0,
    y: 560,
    toJSON: () => {},
  }));
  sections.security.getBoundingClientRect = vi.fn(() => ({
    top: 760,
    left: 0,
    bottom: 920,
    right: 500,
    width: 500,
    height: 160,
    x: 0,
    y: 760,
    toJSON: () => {},
  }));
  sections.about.getBoundingClientRect = vi.fn(() => ({
    top: 960,
    left: 0,
    bottom: 1160,
    right: 500,
    width: 500,
    height: 200,
    x: 0,
    y: 960,
    toJSON: () => {},
  }));

  const aboutNav = screen.getByRole("button", { name: "关于" });
  fireEvent.click(aboutNav);
  fireEvent.scroll(content);

  expect(aboutNav).toHaveClass("active");
});

it("shows a notice and disables terminal selection when resume in terminal is unsupported", () => {
  render(
    <SettingsModal
      open={true}
      onClose={() => {}}
      settings={{
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
        scanSources: {
          codex: true,
          claude: true,
          gemini: true,
        },
      }}
      onThemeChange={() => {}}
      onScanSourceToggle={() => {}}
      onHardDeleteChange={() => {}}
      onTerminalPreferenceChange={() => {}}
      terminalOptions={[{ id: "auto", label: "自动（推荐）" }]}
      supportsResumeInTerminal={false}
    />,
  );

  expect(screen.getByText("当前平台暂不支持在终端中直接恢复会话。")).toBeInTheDocument();
  expect(screen.getByLabelText("terminal-preference-select")).toBeDisabled();
});

it("shows about information with current version and release links", () => {
  const onCheckNow = vi.fn();
  const onOpenReleasePage = vi.fn();

  render(
    <SettingsModal
      open={true}
      onClose={() => {}}
      settings={{
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
        scanSources: {
          codex: true,
          claude: true,
          gemini: true,
        },
      }}
      currentVersion="0.1.1"
      onThemeChange={() => {}}
      onScanSourceToggle={() => {}}
      onHardDeleteChange={() => {}}
      onTerminalPreferenceChange={() => {}}
      terminalOptions={[
        { id: "auto", label: "自动（推荐）" },
        { id: "terminal", label: "Terminal.app" },
      ]}
      supportsResumeInTerminal={true}
      aboutUpdate={{
        status: "up_to_date",
        latestRelease: null,
        errorMessage: null,
        defaultReleasePageUrl: "https://github.com/caiweiming/ai-session-manager/releases",
        onCheckNow,
        onOpenReleasePage,
      }}
    />,
  );

  expect(screen.getByRole("button", { name: "关于" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "关于" })).toBeInTheDocument();
  expect(screen.getByText("版本 0.1.1")).toBeInTheDocument();
  expect(screen.getByText("用于本地汇总、检索和恢复 AI 工具会话记录。")).toBeInTheDocument();
  expect(screen.getByLabelText("关于操作").textContent).toBe("检查更新GitHub 发布页Gitee 发布页");
  fireEvent.click(screen.getByRole("button", { name: "GitHub 发布页" }));
  expect(onOpenReleasePage).toHaveBeenCalledWith("https://github.com/caiweiming/ai-session-manager/releases");
  fireEvent.click(screen.getByRole("button", { name: "Gitee 发布页" }));
  expect(onOpenReleasePage).toHaveBeenCalledWith("https://gitee.com/caiweiming/ai-session-manager/releases");
  expect(screen.getByText("当前已是最新版本。")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  expect(onCheckNow).toHaveBeenCalledTimes(1);
});

it("shows available update actions in about information", () => {
  const onCheckNow = vi.fn();
  const onOpenReleasePage = vi.fn();

  render(
    <SettingsModal
      open={true}
      onClose={() => {}}
      settings={{
        themeMode: "system",
        hardDelete: false,
        terminalPreference: "auto",
        scanSources: {
          codex: true,
          claude: true,
          gemini: true,
        },
      }}
      currentVersion="0.1.1"
      onThemeChange={() => {}}
      onScanSourceToggle={() => {}}
      onHardDeleteChange={() => {}}
      onTerminalPreferenceChange={() => {}}
      terminalOptions={[
        { id: "auto", label: "自动（推荐）" },
        { id: "terminal", label: "Terminal.app" },
      ]}
      supportsResumeInTerminal={true}
      aboutUpdate={{
        status: "update_available",
        latestRelease: {
          version: "0.1.2",
          tagName: "v0.1.2",
          url: "https://github.com/caiweiming/ai-session-manager/releases/tag/v0.1.2",
          publishedAt: "2026-06-05T00:00:00Z",
          notes: "test release",
        },
        errorMessage: null,
        defaultReleasePageUrl: "https://github.com/caiweiming/ai-session-manager/releases",
        onCheckNow,
        onOpenReleasePage,
      }}
    />,
  );

  expect(screen.getByText("发现新版本 v0.1.2")).toBeInTheDocument();
  expect(screen.getByLabelText("关于操作").textContent).toBe("检查更新打开最新版本GitHub 发布页Gitee 发布页");
  fireEvent.click(screen.getByRole("button", { name: "打开最新版本" }));
  expect(onOpenReleasePage).toHaveBeenCalledWith(
    "https://github.com/caiweiming/ai-session-manager/releases/tag/v0.1.2",
  );
});
