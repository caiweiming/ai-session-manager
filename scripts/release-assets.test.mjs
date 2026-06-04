import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { collectReleaseAssets } from "./release-assets.mjs";

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
    const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle", "dmg");
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
