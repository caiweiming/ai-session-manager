import { describe, expect, it } from "vitest";
import {
  compareReleaseVersions,
  isGithubReleaseUpdateAvailable,
  normalizeReleaseVersion,
  parseGithubLatestRelease,
} from "./updateChecker";

describe("updateChecker", () => {
  it("normalizes release versions with optional v prefix", () => {
    expect(normalizeReleaseVersion("v0.1.0")).toBe("0.1.0");
    expect(normalizeReleaseVersion("0.1.0")).toBe("0.1.0");
  });

  it("compares semantic numeric versions correctly", () => {
    expect(compareReleaseVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareReleaseVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareReleaseVersions("0.1.0", "0.1.0")).toBe(0);
  });

  it("rejects invalid semantic versions when comparing releases", () => {
    expect(() => compareReleaseVersions("v1", "0.1.0")).toThrow("invalid release version");
    expect(() => compareReleaseVersions("1.0.0-beta", "0.1.0")).toThrow("invalid release version");
  });

  it("parses GitHub latest release payload", () => {
    const parsed = parseGithubLatestRelease({
      tag_name: "v0.2.0",
      html_url: "https://github.com/Ming/ai-session/releases/tag/v0.2.0",
      published_at: "2026-05-29T12:00:00Z",
      body: "更新说明",
    });

    expect(parsed).toEqual({
      version: "0.2.0",
      tagName: "v0.2.0",
      url: "https://github.com/Ming/ai-session/releases/tag/v0.2.0",
      publishedAt: "2026-05-29T12:00:00Z",
      notes: "更新说明",
    });
  });

  it("detects when a GitHub release is newer than the current app version", () => {
    expect(
      isGithubReleaseUpdateAvailable({
        currentVersion: "0.1.0",
        latestVersion: "0.2.0",
      }),
    ).toBe(true);
  });
});
