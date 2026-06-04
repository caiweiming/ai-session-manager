import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AppSettings, type PlatformCapabilities } from "../../../lib/tauriClient";

const DEFAULT_APP_SETTINGS: AppSettings = {
  themeMode: "system",
  hardDelete: false,
  terminalPreference: "auto",
  scanSources: {
    codex: true,
    claude: true,
    gemini: true,
  },
};

const DEFAULT_PLATFORM_CAPABILITIES: PlatformCapabilities = {
  os: "unknown",
  terminalOptions: [{ id: "auto", label: "自动（推荐）" }],
  supportsRevealPath: true,
  supportsResumeInTerminal: false,
  revealPathDegradesToOpenParent: false,
};

const normalizeScanSources = (settings: AppSettings) => ({
  codex: settings.scanSources?.codex ?? true,
  claude: settings.scanSources?.claude ?? true,
  gemini: settings.scanSources?.gemini ?? true,
});

const isPlatformCapabilities = (value: unknown): value is PlatformCapabilities => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlatformCapabilities>;
  return (
    typeof candidate.os === "string" &&
    Array.isArray(candidate.terminalOptions) &&
    typeof candidate.supportsRevealPath === "boolean" &&
    typeof candidate.supportsResumeInTerminal === "boolean" &&
    typeof candidate.revealPathDegradesToOpenParent === "boolean"
  );
};

const getFallbackTerminalPreference = (terminalOptions: PlatformCapabilities["terminalOptions"]) => {
  return terminalOptions.find((option) => option.id === "auto")?.id ?? terminalOptions[0]?.id ?? "auto";
};

const normalizeTerminalPreference = (
  terminalPreference: string,
  terminalOptions: PlatformCapabilities["terminalOptions"],
) => {
  return terminalOptions.some((option) => option.id === terminalPreference)
    ? terminalPreference
    : getFallbackTerminalPreference(terminalOptions);
};

const normalizeAppSettings = (
  settings: AppSettings,
  capabilities: PlatformCapabilities,
) => {
  const normalizedSettings = {
    ...settings,
    scanSources: normalizeScanSources(settings),
  };

  if (capabilities.os === "unknown") {
    return normalizedSettings;
  }

  return {
    ...normalizedSettings,
    terminalPreference: normalizeTerminalPreference(
      settings.terminalPreference,
      capabilities.terminalOptions,
    ),
  };
};

export function useAppSettingsController() {
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [platformCapabilities, setPlatformCapabilities] = useState<PlatformCapabilities>(DEFAULT_PLATFORM_CAPABILITIES);
  const [settingsReady, setSettingsReady] = useState(false);
  const requestSeqRef = useRef(0);
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      requestSeqRef.current += 1;
    };
  }, []);

  const loadSettings = useCallback(async () => {
    requestSeqRef.current += 1;
    const requestSeq = requestSeqRef.current;

    try {
      const [settingsResult, capabilitiesResult] = await Promise.allSettled([
        api.getAppSettings(),
        api.getPlatformCapabilities(),
      ]);
      if (!disposedRef.current && requestSeq === requestSeqRef.current) {
        const nextCapabilities =
          capabilitiesResult.status === "fulfilled" && isPlatformCapabilities(capabilitiesResult.value)
            ? capabilitiesResult.value
            : null;

        if (nextCapabilities) {
          setPlatformCapabilities(nextCapabilities);
        }

        if (settingsResult.status === "fulfilled") {
          setAppSettings(
            normalizeAppSettings(
              settingsResult.value,
              nextCapabilities ?? DEFAULT_PLATFORM_CAPABILITIES,
            ),
          );
        } else if (nextCapabilities) {
          setAppSettings((current) => normalizeAppSettings(current, nextCapabilities));
        }
      }
    } catch {
      // 保持默认设置，避免阻断主流程。
    } finally {
      if (!disposedRef.current && requestSeq === requestSeqRef.current) {
        setSettingsReady(true);
      }
    }
  }, []);

  const patchAppSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const shouldNormalizePreference = platformCapabilities.os !== "unknown";
    const normalizedPatch = patch.terminalPreference === undefined
      || !shouldNormalizePreference
      ? patch
      : {
          ...patch,
          terminalPreference: normalizeTerminalPreference(
            patch.terminalPreference,
            platformCapabilities.terminalOptions,
          ),
        };

    setAppSettings((current) => normalizeAppSettings({ ...current, ...normalizedPatch }, platformCapabilities));
    try {
      const persisted = await api.updateAppSettings({
        themeMode: normalizedPatch.themeMode,
        hardDelete: normalizedPatch.hardDelete,
        terminalPreference: normalizedPatch.terminalPreference,
        scanSources: normalizedPatch.scanSources,
      });
      setAppSettings(normalizeAppSettings(persisted, platformCapabilities));
    } catch {
      // 本地先行更新；写入失败时维持当前界面状态，避免频繁抖动。
    }
  }, [platformCapabilities]);

  return {
    appSettings,
    platformCapabilities,
    settingsReady,
    loadSettings,
    patchAppSettings,
  };
}
