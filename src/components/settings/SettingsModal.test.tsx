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

  const themeNav = screen.getByRole("button", { name: "外观与主题" });
  fireEvent.click(themeNav);
  expect(themeNav).toHaveClass("active");
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
