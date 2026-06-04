export const RELEASE_REPOSITORY_OWNER = "caiweiming";
export const RELEASE_REPOSITORY_NAME = "ai-session-manager";
export const RELEASE_REPOSITORY_URL = `https://github.com/${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}`;
export const RELEASES_PAGE_URL = `${RELEASE_REPOSITORY_URL}/releases`;
export const RELEASES_LATEST_API_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}/releases/latest`;

export const createReleaseTagUrl = (tagName: string) => {
  return `${RELEASES_PAGE_URL}/tag/${tagName}`;
};
