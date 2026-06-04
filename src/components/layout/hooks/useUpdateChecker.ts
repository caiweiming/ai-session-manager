import { useEffect, useState } from "react";
import {
  normalizeReleaseVersion,
  isGithubReleaseUpdateAvailable,
  parseGithubLatestRelease,
  type GithubLatestRelease,
} from "../../../lib/updateChecker";

export type UpdateCheckStatus =
  | "idle"
  | "checking"
  | "up_to_date"
  | "update_available"
  | "error";

type UpdateScenario = "update" | "uptodate" | "error";

const isValidUpdateScenario = (value: string | undefined | null): value is UpdateScenario => {
  return value === "update" || value === "uptodate" || value === "error";
};

const resolveDevScenario = ({
  devMode,
  locationSearch,
  envScenario,
}: {
  devMode: boolean;
  locationSearch: string;
  envScenario?: string;
}) => {
  if (!devMode) {
    return null;
  }

  const urlScenario = new URLSearchParams(locationSearch).get("updateScenario");
  if (isValidUpdateScenario(urlScenario)) {
    return urlScenario;
  }

  return isValidUpdateScenario(envScenario) ? envScenario : null;
};

const createHigherPatchVersion = (currentVersion: string) => {
  const [major, minor, patch] = normalizeReleaseVersion(currentVersion).split(".").map(Number);
  return `${major}.${minor}.${(patch ?? 0) + 1}`;
};

const createScenarioRelease = (scenario: Exclude<UpdateScenario, "error">, currentVersion: string): GithubLatestRelease => {
  const version =
    scenario === "uptodate"
      ? normalizeReleaseVersion(currentVersion)
      : createHigherPatchVersion(currentVersion);

  return {
    version,
    tagName: `v${version}`,
    url: `https://github.com/Ming/ai-session/releases/tag/v${version}`,
    publishedAt: "2026-06-01T00:00:00Z",
    notes: "开发环境更新测试场景",
  };
};

export function useUpdateChecker({
  currentVersion,
  releasesLatestUrl,
  fetchImpl = fetch,
  devMode = import.meta.env.DEV,
  locationSearch = window.location.search,
  envScenario = import.meta.env.VITE_UPDATE_TEST_SCENARIO,
}: {
  currentVersion: string;
  releasesLatestUrl: string;
  fetchImpl?: typeof fetch;
  devMode?: boolean;
  locationSearch?: string;
  envScenario?: string;
}) {
  const [status, setStatus] = useState<UpdateCheckStatus>("idle");
  const [latestRelease, setLatestRelease] = useState<GithubLatestRelease | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runCheck = async () => {
    setStatus("checking");
    setErrorMessage(null);

    try {
      const scenario = resolveDevScenario({
        devMode,
        locationSearch,
        envScenario,
      });

      let release: GithubLatestRelease;

      if (scenario === "error") {
        throw new Error("dev update scenario: error");
      }

      if (scenario) {
        release = createScenarioRelease(scenario, currentVersion);
      } else {
        const response = await fetchImpl(releasesLatestUrl);
        if (!response.ok) {
          throw new Error(`update request failed: ${response.status}`);
        }

        release = parseGithubLatestRelease(await response.json());
      }

      setLatestRelease(release);
      setStatus(
        isGithubReleaseUpdateAvailable({
          currentVersion,
          latestVersion: release.version,
        })
          ? "update_available"
          : "up_to_date",
      );
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "检查更新失败");
    }
  };

  useEffect(() => {
    void runCheck();
  }, [currentVersion, devMode, envScenario, locationSearch, releasesLatestUrl]);

  return {
    status,
    latestRelease,
    errorMessage,
    runCheck,
  };
}
