import { defaultWindowIcon } from "@tauri-apps/api/app";
import { getCurrentWindow, type Theme as TauriWindowTheme } from "@tauri-apps/api/window";
import { useEffect } from "react";

const SYSTEM_DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

const resolveThemeMode = (mode: "light" | "dark" | "system"): "light" | "dark" => {
  if (mode === "light" || mode === "dark") {
    return mode;
  }
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia(SYSTEM_DARK_MEDIA_QUERY).matches ? "dark" : "light";
  }
  return "dark";
};

const applyNativeWindowTheme = async (mode: "light" | "dark" | "system") => {
  const theme: TauriWindowTheme | null = mode === "system" ? null : mode;
  try {
    await getCurrentWindow().setTheme(theme);
  } catch {
    // 非 Tauri 运行时（例如浏览器预览/单测）忽略原生窗口主题同步失败。
  }
};

const applyNativeWindowIcon = async () => {
  try {
    const icon = await defaultWindowIcon();
    if (!icon) {
      return;
    }
    await getCurrentWindow().setIcon(icon);
  } catch {
    // 非 Tauri 运行时（例如浏览器预览/单测）忽略原生窗口图标同步失败。
  }
};

export function useNativeWindowSync(themeMode: "light" | "dark" | "system") {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const apply = () => {
      root.setAttribute("data-theme-mode", resolveThemeMode(themeMode));
      void applyNativeWindowTheme(themeMode);
    };

    apply();

    if (themeMode !== "system" || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(SYSTEM_DARK_MEDIA_QUERY);
    const onChange = () => apply();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, [themeMode]);

  useEffect(() => {
    void applyNativeWindowIcon();
  }, []);
}
