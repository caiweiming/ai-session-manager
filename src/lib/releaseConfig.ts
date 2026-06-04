export type ReleaseSource = {
  id: "github" | "gitee";
  latestApiUrl: string;
  releasesPageUrl: string;
};

export const RELEASE_REPOSITORY_OWNER = "caiweiming";
export const RELEASE_REPOSITORY_NAME = "ai-session-manager";

export const GITHUB_RELEASE_REPOSITORY_URL = `https://github.com/${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}`;
export const GITHUB_RELEASES_PAGE_URL = `${GITHUB_RELEASE_REPOSITORY_URL}/releases`;
export const GITHUB_RELEASES_LATEST_API_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}/releases/latest`;

export const GITEE_RELEASE_REPOSITORY_URL = `https://gitee.com/${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}`;
export const GITEE_RELEASES_PAGE_URL = `${GITEE_RELEASE_REPOSITORY_URL}/releases`;
export const GITEE_RELEASES_LATEST_API_URL = `https://gitee.com/api/v5/repos/${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}/releases/latest`;

export const RELEASE_SOURCES: ReleaseSource[] = [
  {
    id: "github",
    latestApiUrl: GITHUB_RELEASES_LATEST_API_URL,
    releasesPageUrl: GITHUB_RELEASES_PAGE_URL,
  },
  {
    id: "gitee",
    latestApiUrl: GITEE_RELEASES_LATEST_API_URL,
    releasesPageUrl: GITEE_RELEASES_PAGE_URL,
  },
];

export const DEFAULT_RELEASES_PAGE_URL = GITHUB_RELEASES_PAGE_URL;
export const RELEASES_PAGE_URL = GITHUB_RELEASES_PAGE_URL;
export const RELEASES_LATEST_API_URL = GITHUB_RELEASES_LATEST_API_URL;

export const createReleaseTagUrl = (tagName: string, source: ReleaseSource = RELEASE_SOURCES[0]) => {
  return `${source.releasesPageUrl}/tag/${tagName}`;
};
