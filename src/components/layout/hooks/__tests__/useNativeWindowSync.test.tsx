import { render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useNativeWindowSync } from "../useNativeWindowSync";

const { setThemeMock, setIconMock, defaultWindowIconMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(async () => {}),
  setIconMock: vi.fn(async () => {}),
  defaultWindowIconMock: vi.fn(async () => "test-icon"),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTheme: setThemeMock,
    setIcon: setIconMock,
  }),
}));

vi.mock("@tauri-apps/api/app", () => ({
  defaultWindowIcon: defaultWindowIconMock,
}));

function HookHarness({ themeMode }: { themeMode: "light" | "dark" | "system" }) {
  useNativeWindowSync(themeMode);
  return null;
}

beforeEach(() => {
  setThemeMock.mockClear();
  setIconMock.mockClear();
  defaultWindowIconMock.mockClear();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

it("syncs document theme, native theme and native icon", async () => {
  render(<HookHarness themeMode="dark" />);

  await waitFor(() => {
    expect(document.documentElement.getAttribute("data-theme-mode")).toBe("dark");
    expect(setThemeMock).toHaveBeenCalledWith("dark");
    expect(defaultWindowIconMock).toHaveBeenCalledTimes(1);
    expect(setIconMock).toHaveBeenCalledWith("test-icon");
  });
});

it("registers and cleans up system theme listener with addEventListener", async () => {
  let changeListener: (() => void) | undefined;
  const addEventListenerMock = vi.fn((event: string, listener: () => void) => {
    if (event === "change") {
      changeListener = listener;
    }
  });
  const removeEventListenerMock = vi.fn();
  const mediaQuery = {
    matches: false,
    addEventListener: addEventListenerMock,
    removeEventListener: removeEventListenerMock,
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue(mediaQuery),
  });

  const { unmount } = render(<HookHarness themeMode="system" />);

  await waitFor(() => {
    expect(addEventListenerMock).toHaveBeenCalledWith("change", expect.any(Function));
    expect(document.documentElement.getAttribute("data-theme-mode")).toBe("light");
    expect(setThemeMock).toHaveBeenCalledWith(null);
  });

  mediaQuery.matches = true;
  changeListener?.();

  await waitFor(() => {
    expect(document.documentElement.getAttribute("data-theme-mode")).toBe("dark");
  });

  unmount();

  expect(removeEventListenerMock).toHaveBeenCalledWith("change", expect.any(Function));
});

it("registers and cleans up system theme listener with addListener fallback", async () => {
  let changeListener: (() => void) | undefined;
  const addListenerMock = vi.fn((listener: () => void) => {
    changeListener = listener;
  });
  const removeListenerMock = vi.fn();
  const mediaQuery = {
    matches: true,
    addListener: addListenerMock,
    removeListener: removeListenerMock,
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue(mediaQuery),
  });

  const { unmount } = render(<HookHarness themeMode="system" />);

  await waitFor(() => {
    expect(addListenerMock).toHaveBeenCalledWith(expect.any(Function));
    expect(document.documentElement.getAttribute("data-theme-mode")).toBe("dark");
    expect(setThemeMock).toHaveBeenCalledWith(null);
  });

  mediaQuery.matches = false;
  changeListener?.();

  await waitFor(() => {
    expect(document.documentElement.getAttribute("data-theme-mode")).toBe("light");
  });

  unmount();

  expect(removeListenerMock).toHaveBeenCalledWith(expect.any(Function));
});
