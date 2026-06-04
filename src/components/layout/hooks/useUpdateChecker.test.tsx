import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { useUpdateChecker } from "./useUpdateChecker";

it("checks GitHub latest release on startup and reports update_available when a newer version exists", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      tag_name: "v0.2.0",
      html_url: "https://github.com/Ming/ai-session/releases/tag/v0.2.0",
      published_at: "2026-05-29T12:00:00Z",
      body: "更新说明",
    }),
  }));

  const { result } = renderHook(() =>
    useUpdateChecker({
      currentVersion: "0.1.0",
      releasesLatestUrl: "https://api.github.com/repos/Ming/ai-session/releases/latest",
      fetchImpl: fetchMock as typeof fetch,
    }),
  );

  await waitFor(() => {
    expect(result.current.status).toBe("update_available");
  });

  expect(result.current.latestRelease?.version).toBe("0.2.0");
});

it("prefers URL scenario over env scenario in development mode", async () => {
  const fetchMock = vi.fn();

  const { result } = renderHook(() =>
    useUpdateChecker({
      currentVersion: "0.1.0",
      releasesLatestUrl: "https://api.github.com/repos/Ming/ai-session/releases/latest",
      fetchImpl: fetchMock as typeof fetch,
      devMode: true,
      locationSearch: "?updateScenario=error",
      envScenario: "update",
    }),
  );

  await waitFor(() => {
    expect(result.current.status).toBe("error");
  });

  expect(fetchMock).not.toHaveBeenCalled();
});

it("returns up_to_date when the development scenario is uptodate", async () => {
  const { result } = renderHook(() =>
    useUpdateChecker({
      currentVersion: "0.1.0",
      releasesLatestUrl: "https://api.github.com/repos/Ming/ai-session/releases/latest",
      devMode: true,
      locationSearch: "?updateScenario=uptodate",
    }),
  );

  await waitFor(() => {
    expect(result.current.status).toBe("up_to_date");
  });

  expect(result.current.latestRelease?.tagName).toBe("v0.1.0");
});

it("ignores development scenarios outside development mode", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      tag_name: "v0.2.0",
      html_url: "https://github.com/Ming/ai-session/releases/tag/v0.2.0",
      published_at: "2026-05-29T12:00:00Z",
      body: "更新说明",
    }),
  }));

  const { result } = renderHook(() =>
    useUpdateChecker({
      currentVersion: "0.1.0",
      releasesLatestUrl: "https://api.github.com/repos/Ming/ai-session/releases/latest",
      fetchImpl: fetchMock as typeof fetch,
      devMode: false,
      locationSearch: "?updateScenario=error",
      envScenario: "error",
    }),
  );

  await waitFor(() => {
    expect(result.current.status).toBe("update_available");
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
});
