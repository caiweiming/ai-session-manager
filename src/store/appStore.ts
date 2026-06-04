export type ThemeMode = "light" | "dark" | "system";

export type AppStore = {
  themeMode: ThemeMode;
};

export const initialAppStore: AppStore = {
  themeMode: "system",
};
