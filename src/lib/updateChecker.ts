export type GithubLatestRelease = {
  version: string;
  tagName: string;
  url: string;
  publishedAt: string;
  notes: string;
};

const VERSION_RE = /^v?\d+\.\d+\.\d+$/;

const parseReleaseVersion = (value: string) => {
  const trimmed = value.trim();
  if (!VERSION_RE.test(trimmed)) {
    throw new Error("invalid release version");
  }
  return normalizeReleaseVersion(trimmed).split(".").map(Number);
};

export const normalizeReleaseVersion = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
};

export const compareReleaseVersions = (left: string, right: string) => {
  const leftParts = parseReleaseVersion(left);
  const rightParts = parseReleaseVersion(right);

  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) return delta;
  }

  return 0;
};

export const isGithubReleaseUpdateAvailable = ({
  currentVersion,
  latestVersion,
}: {
  currentVersion: string;
  latestVersion: string;
}) => compareReleaseVersions(latestVersion, currentVersion) > 0;

export const parseGithubLatestRelease = (payload: unknown): GithubLatestRelease => {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid latest release payload");
  }

  const record = payload as Record<string, unknown>;
  const tagName = typeof record.tag_name === "string" ? record.tag_name.trim() : "";
  const url = typeof record.html_url === "string" ? record.html_url.trim() : "";
  const publishedAt = typeof record.published_at === "string" ? record.published_at.trim() : "";
  const notes = typeof record.body === "string" ? record.body : "";

  if (!VERSION_RE.test(tagName) || !url || !publishedAt) {
    throw new Error("invalid latest release payload");
  }

  return {
    version: normalizeReleaseVersion(tagName),
    tagName,
    url,
    publishedAt,
    notes,
  };
};
