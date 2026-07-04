import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_SLUG = "ai-session-manager";
const DEFAULT_PLATFORM = "windows";
const DEFAULT_ARCH_BY_PLATFORM = {
  linux: "x64",
  macos: "universal",
  windows: "x64",
};
const MACOS_TARGET_BY_ARCH = {
  arm64: "aarch64-apple-darwin",
  universal: "universal-apple-darwin",
  x64: "x86_64-apple-darwin",
};

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function firstMatchingFile(directory, predicate) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  return files.find(predicate) ?? null;
}

async function readPackageVersion(rootDir) {
  const packageJsonPath = path.join(rootDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (typeof packageJson.version !== "string" || packageJson.version.trim() === "") {
    throw new Error("package.json missing version");
  }
  return packageJson.version.trim();
}

async function copyArtifact({ source, destination, label }) {
  if (!(await fileExists(source))) {
    throw new Error(`Missing ${label} artifact: ${source}`);
  }
  await copyFile(source, destination);
  return { label, source, destination };
}

function resolveReleaseDir({ rootDir, platform, arch }) {
  if (platform === "macos") {
    const target = MACOS_TARGET_BY_ARCH[arch];
    if (target === undefined) {
      throw new Error(`Unsupported macOS release arch: ${arch}`);
    }
    return path.join(rootDir, "src-tauri", "target", target, "release");
  }

  return path.join(rootDir, "src-tauri", "target", "release");
}

export async function collectReleaseAssets({
  rootDir = process.cwd(),
  outputDir = path.join(rootDir, "release-assets"),
  platform = DEFAULT_PLATFORM,
  arch = DEFAULT_ARCH_BY_PLATFORM[platform],
} = {}) {
  if (arch === undefined) {
    throw new Error(`Unsupported release platform: ${platform}`);
  }

  const version = await readPackageVersion(rootDir);
  const releaseDir = resolveReleaseDir({ rootDir, platform, arch });
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });

  if (platform === "macos") {
    return collectMacosReleaseAssets({ releaseDir, outputDir, version, arch });
  }
  if (platform === "linux") {
    return collectLinuxReleaseAssets({ releaseDir, outputDir, version, arch });
  }
  if (platform === "windows") {
    return collectWindowsReleaseAssets({ releaseDir, outputDir, version, arch });
  }

  throw new Error(`Unsupported release platform: ${platform}`);
}

async function collectWindowsReleaseAssets({ releaseDir, outputDir, version, arch }) {
  const nsisDir = path.join(releaseDir, "bundle", "nsis");
  const msiDir = path.join(releaseDir, "bundle", "msi");
  const prefix = `${APP_SLUG}-v${version}-windows-${arch}`;

  const portableSource = path.join(releaseDir, "ai-session-manager-app.exe");
  const setupFile = await firstMatchingFile(
    nsisDir,
    (name) => name.toLowerCase().endsWith(".exe") && name.toLowerCase().includes("setup"),
  );
  const msiFile = await firstMatchingFile(msiDir, (name) => name.toLowerCase().endsWith(".msi"));

  if (setupFile === null) {
    throw new Error(`Missing NSIS setup artifact in ${nsisDir}`);
  }
  if (msiFile === null) {
    throw new Error(`Missing MSI artifact in ${msiDir}`);
  }

  return Promise.all([
    copyArtifact({
      label: "portable",
      source: portableSource,
      destination: path.join(outputDir, `${prefix}-portable.exe`),
    }),
    copyArtifact({
      label: "setup",
      source: path.join(nsisDir, setupFile),
      destination: path.join(outputDir, `${prefix}-setup.exe`),
    }),
    copyArtifact({
      label: "msi",
      source: path.join(msiDir, msiFile),
      destination: path.join(outputDir, `${prefix}.msi`),
    }),
  ]);
}

async function collectLinuxReleaseAssets({ releaseDir, outputDir, version, arch }) {
  const appImageDir = path.join(releaseDir, "bundle", "appimage");
  const debDir = path.join(releaseDir, "bundle", "deb");
  const prefix = `${APP_SLUG}-v${version}-linux-${arch}`;

  const appImageFile = await firstMatchingFile(appImageDir, (name) => name.toLowerCase().endsWith(".appimage"));
  const debFile = await firstMatchingFile(debDir, (name) => name.toLowerCase().endsWith(".deb"));

  if (appImageFile === null) {
    throw new Error(`Missing Linux AppImage artifact in ${appImageDir}`);
  }
  if (debFile === null) {
    throw new Error(`Missing Linux deb artifact in ${debDir}`);
  }

  return Promise.all([
    copyArtifact({
      label: "appimage",
      source: path.join(appImageDir, appImageFile),
      destination: path.join(outputDir, `${prefix}.AppImage`),
    }),
    copyArtifact({
      label: "deb",
      source: path.join(debDir, debFile),
      destination: path.join(outputDir, `${prefix}.deb`),
    }),
  ]);
}

async function collectMacosReleaseAssets({ releaseDir, outputDir, version, arch }) {
  const dmgDir = path.join(releaseDir, "bundle", "dmg");
  const dmgFile = await firstMatchingFile(dmgDir, (name) => name.toLowerCase().endsWith(".dmg"));
  if (dmgFile === null) {
    throw new Error(`Missing macOS DMG artifact in ${dmgDir}`);
  }

  const prefix = `${APP_SLUG}-v${version}-macos-${arch}`;
  return [
    await copyArtifact({
      label: "dmg",
      source: path.join(dmgDir, dmgFile),
      destination: path.join(outputDir, `${prefix}.dmg`),
    }),
  ];
}

function parseArgs(argv) {
  let platform = DEFAULT_PLATFORM;
  let arch;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--platform") {
      platform = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length);
    } else if (arg === "--arch") {
      arch = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--arch=")) {
      arch = arg.slice("--arch=".length);
    }
  }

  return { platform, arch };
}

async function main() {
  const copied = await collectReleaseAssets(parseArgs(process.argv.slice(2)));
  for (const item of copied) {
    console.log(`${item.label}: ${item.destination}`);
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
