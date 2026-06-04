import { useEffect, useState } from "react";
import {
  normalizeReleaseVersion,
  isGithubReleaseUpdateAvailable,
  parseGithubLatestRelease,
  type GithubLatestRelease,
} from "../../../lib/updateChecker";
import { createReleaseTagUrl, type ReleaseSource } from "../../../lib/releaseConfig";

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
    url: createReleaseTagUrl(`v${version}`),
    publishedAt: "2026-06-01T00:00:00Z",
    notes: "开发环境更新测试场景",
  };
};

const releaseSourcesFromLegacyUrl = (releasesLatestUrl: string | undefined): ReleaseSource[] => {
  if (!releasesLatestUrl) {
    return [];
  }
  return [
    {
      id: "github",
      latestApiUrl: releasesLatestUrl,
      releasesPageUrl: "https://github.com/caiweiming/ai-session-manager/releases",
    },
  ];
};

const checkLatestReleaseSource = async ({
  fetchImpl,
  source,
}: {
  fetchImpl: typeof fetch;
  source: ReleaseSource;
}) => {
  const response = await fetchImpl(source.latestApiUrl);
  if (!response.ok) {
    throw new Error(
      response.status === 404 ? "暂无公开发布版本" : `update request failed: ${response.status}`,
    );
  }

  return parseGithubLatestRelease(await response.json());
};

const checkLatestReleaseSources = async ({
  fetchImpl,
  sources,
}: {
  fetchImpl: typeof fetch;
  sources: ReleaseSource[];
}) => {
  let lastError: Error | null = null;

  for (const source of sources) {
    try {
      return await checkLatestReleaseSource({ fetchImpl, source });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("检查更新失败");
};

export function useUpdateChecker({
  currentVersion,
  releasesLatestUrl,
  releaseSources,
  fetchImpl = fetch,
  devMode = import.meta.env.DEV,
  locationSearch = window.location.search,
  envScenario = import.meta.env.VITE_UPDATE_TEST_SCENARIO,
}: {
  currentVersion: string;
  releasesLatestUrl?: string;
  releaseSources?: ReleaseSource[];
  fetchImpl?: typeof fetch;
  devMode?: boolean;
  locationSearch?: string;
  envScenario?: string;
}) {
  const [status, setStatus] = useState<UpdateCheckStatus>("idle");
  const [latestRelease, setLatestRelease] = useState<GithubLatestRelease | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const releaseSourcesKey = (releaseSources ?? releaseSourcesFromLegacyUrl(releasesLatestUrl))
    .map((source) => source.latestApiUrl)
    .join("|");

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
        release = await checkLatestReleaseSources({
          fetchImpl,
          sources: releaseSources ?? releaseSourcesFromLegacyUrl(releasesLatestUrl),
        });
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
  }, [currentVersion, devMode, envScenario, locationSearch, releaseSourcesKey]);

  return {
    status,
    latestRelease,
    errorMessage,
    runCheck,
  };
}
