import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { collectReleaseAssets } from "./release-assets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("collectReleaseAssets copies release artifacts to stable english filenames", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-session-release-assets-"));
  try {
    const releaseDir = path.join(root, "src-tauri", "target", "release");
    const bundleDir = path.join(releaseDir, "bundle");
    const outputDir = path.join(root, "release-assets");
    await mkdir(path.join(bundleDir, "nsis"), { recursive: true });
    await mkdir(path.join(bundleDir, "msi"), { recursive: true });

    await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "0.1.1" }));
    await writeFile(path.join(releaseDir, "ai-session-manager-app.exe"), "portable");
    await writeFile(path.join(bundleDir, "nsis", "AI会话管理_0.1.1_x64-setup.exe"), "setup");
    await writeFile(path.join(bundleDir, "msi", "AI会话管理_0.1.1_x64_zh-CN.msi"), "msi");

    const copied = await collectReleaseAssets({ rootDir: root, outputDir });

    assert.deepEqual(
      copied.map((item) => path.basename(item.destination)).sort(),
      [
        "ai-session-manager-v0.1.1-windows-x64-portable.exe",
        "ai-session-manager-v0.1.1-windows-x64-setup.exe",
        "ai-session-manager-v0.1.1-windows-x64.msi",
      ],
    );
    assert.equal(
      await readFile(path.join(outputDir, "ai-session-manager-v0.1.1-windows-x64-portable.exe"), "utf8"),
      "portable",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("collectReleaseAssets copies macOS dmg to stable english filename", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-session-release-assets-"));
  try {
    const bundleDir = path.join(
      root,
      "src-tauri",
      "target",
      "universal-apple-darwin",
      "release",
      "bundle",
      "dmg",
    );
    const outputDir = path.join(root, "release-assets");
    await mkdir(bundleDir, { recursive: true });

    await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "0.1.1" }));
    await writeFile(path.join(bundleDir, "AI会话管理_0.1.1_universal.dmg"), "dmg");

    const copied = await collectReleaseAssets({ rootDir: root, outputDir, platform: "macos" });

    assert.deepEqual(
      copied.map((item) => path.basename(item.destination)),
      ["ai-session-manager-v0.1.1-macos-universal.dmg"],
    );
    assert.equal(
      await readFile(path.join(outputDir, "ai-session-manager-v0.1.1-macos-universal.dmg"), "utf8"),
      "dmg",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("collectReleaseAssets copies Linux AppImage and deb to stable english filenames", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-session-release-assets-"));
  try {
    const releaseDir = path.join(root, "src-tauri", "target", "release");
    const bundleDir = path.join(releaseDir, "bundle");
    const outputDir = path.join(root, "release-assets");
    await mkdir(path.join(bundleDir, "appimage"), { recursive: true });
    await mkdir(path.join(bundleDir, "deb"), { recursive: true });

    await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "0.1.1" }));
    await writeFile(path.join(bundleDir, "appimage", "AI会话管理_0.1.1_amd64.AppImage"), "appimage");
    await writeFile(path.join(bundleDir, "deb", "AI会话管理_0.1.1_amd64.deb"), "deb");

    const copied = await collectReleaseAssets({ rootDir: root, outputDir, platform: "linux" });

    assert.deepEqual(
      copied.map((item) => path.basename(item.destination)).sort(),
      ["ai-session-manager-v0.1.1-linux-x64.AppImage", "ai-session-manager-v0.1.1-linux-x64.deb"],
    );
    assert.equal(
      await readFile(path.join(outputDir, "ai-session-manager-v0.1.1-linux-x64.AppImage"), "utf8"),
      "appimage",
    );
    assert.equal(await readFile(path.join(outputDir, "ai-session-manager-v0.1.1-linux-x64.deb"), "utf8"), "deb");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("release:macos builds a real universal macOS target", async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

  assert.match(packageJson.scripts["release:macos"], /tauri build --target universal-apple-darwin/);
  assert.match(packageJson.scripts["release:macos"], /--platform macos --arch universal/);
});

test("release:linux builds AppImage and deb x64 assets", async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

  assert.match(packageJson.scripts["release:linux"], /tauri build --bundles appimage,deb/);
  assert.match(packageJson.scripts["release:linux"], /--platform linux --arch x64/);
});

test("release workflow installs both Rust targets required for universal macOS builds", async () => {
  const workflow = await readFile(path.join(repoRoot, ".github", "workflows", "release.yml"), "utf8");

  assert.match(workflow, /rustup target add aarch64-apple-darwin x86_64-apple-darwin/);
});

test("release workflow builds macOS artifacts without signing configuration", async () => {
  const workflow = await readFile(path.join(repoRoot, ".github", "workflows", "release.yml"), "utf8");

  assert.doesNotMatch(workflow, /APPLE_CERTIFICATE/);
  assert.doesNotMatch(workflow, /APPLE_SIGNING_IDENTITY/);
  assert.doesNotMatch(workflow, /security import/);
  assert.doesNotMatch(workflow, /spctl -a/);
});

test("README documents how to open unsigned macOS builds", async () => {
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");

  assert.match(readme, /未签名 macOS 版本打开方式/);
  assert.match(readme, /按住 `Control`/);
  assert.match(readme, /隐私与安全性/);
  assert.match(readme, /xattr -dr com\.apple\.quarantine/);
  assert.match(readme, /未签名版本只建议在确认下载来源可信时使用/);
});

test("release workflow builds Linux release assets on Ubuntu", async () => {
  const workflow = await readFile(path.join(repoRoot, ".github", "workflows", "release.yml"), "utf8");

  assert.match(workflow, /os: ubuntu-latest/);
  assert.match(workflow, /script: release:linux/);
  assert.match(workflow, /artifact-name: release-assets-linux/);
  assert.match(workflow, /libwebkit2gtk-4\.1-dev/);
});
