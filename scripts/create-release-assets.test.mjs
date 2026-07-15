import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import * as releaseAssetModule from "./create-release-assets.mjs";

const { createReleaseAssets, LATEST_PACKAGE_NAME } = releaseAssetModule;

test("creates a structured update manifest, checksum, and release notes from one source", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-session-release-"));
  const notePath = path.join(root, "note.md");
  const packagePath = path.join(root, "agent-session-search-0.2.0.tgz");
  const outputDirectory = path.join(root, "release");
  await writeFile(notePath, "# 自动更新\n\n## 新增功能\n\n- 终端显示更新。\n", "utf8");
  await writeFile(packagePath, "package bytes", "utf8");

  const manifest = await createReleaseAssets({
    notePath,
    version: "0.2.0",
    packagePath,
    repository: "zszz3/agent-session-search",
    outputDirectory,
    publishedAt: "2026-07-14T00:00:00.000Z",
  });

  assert.equal(manifest.version, "0.2.0");
  assert.deepEqual(manifest.notes.features, ["终端显示更新。"]);
  assert.match(manifest.package.url, /releases\/download\/v0\.2\.0\/agent-session-search-0\.2\.0\.tgz$/);
  assert.equal(JSON.parse(await readFile(path.join(outputDirectory, "update.json"), "utf8")).package.sha256, manifest.package.sha256);
  assert.match(await readFile(path.join(outputDirectory, `${manifest.package.name}.sha256`), "utf8"), new RegExp(`^${manifest.package.sha256}`));
  assert.equal(await readFile(path.join(outputDirectory, LATEST_PACKAGE_NAME), "utf8"), "package bytes");
  assert.match(await readFile(path.join(outputDirectory, `${LATEST_PACKAGE_NAME}.sha256`), "utf8"), new RegExp(`^${manifest.package.sha256}`));
  assert.match(await readFile(path.join(outputDirectory, "release-notes.md"), "utf8"), /# 自动更新/);
});

test("keeps update manifest URLs compatible after the repository rename", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-session-release-rename-"));
  const notePath = path.join(root, "note.md");
  const packagePath = path.join(root, "agent-session-search-0.5.0.tgz");
  const outputDirectory = path.join(root, "release");
  await writeFile(notePath, "# 自动更新\n\n## Bug 修复\n\n- 修复更新下载地址兼容性。\n", "utf8");
  await writeFile(packagePath, "package bytes", "utf8");

  const manifest = await createReleaseAssets({
    notePath,
    version: "0.5.0",
    packagePath,
    repository: "zszz3/AgentRecall",
    outputDirectory,
    publishedAt: "2026-07-15T00:00:00.000Z",
  });

  assert.equal(manifest.releaseUrl, "https://github.com/zszz3/agent-session-search/releases/tag/v0.5.0");
  assert.equal(manifest.package.url, "https://github.com/zszz3/agent-session-search/releases/download/v0.5.0/agent-session-search-0.5.0.tgz");
});

test("rejects a package filename that does not match the release version", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-session-release-version-"));
  const notePath = path.join(root, "note.md");
  const packagePath = path.join(root, "agent-session-search-0.1.0.tgz");
  const outputDirectory = path.join(root, "release");
  await writeFile(notePath, "# 自动更新\n\n## Bug 修复\n\n- 修复发布包版本错配。\n", "utf8");
  await writeFile(packagePath, "package bytes", "utf8");

  await assert.rejects(
    releaseAssetModule.createReleaseAssets({
      notePath,
      version: "0.5.4",
      packagePath,
      repository: "zszz3/agent-session-search",
      outputDirectory,
    }),
    /Release package filename .* does not match release version 0\.5\.4/,
  );
});

test("validates the complete release asset set before publication", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-session-release-validation-"));
  const notePath = path.join(root, "note.md");
  const outputDirectory = path.join(root, "release");
  const packagePath = path.join(outputDirectory, "agent-session-search-0.2.0.tgz");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(notePath, "# 自动更新\n\n## 新增功能\n\n- 发布包可验证。\n", "utf8");
  await writeFile(packagePath, "package bytes", "utf8");

  await createReleaseAssets({
    notePath,
    version: "0.2.0",
    packagePath,
    repository: "zszz3/agent-session-search",
    outputDirectory,
  });
  assert.equal(typeof releaseAssetModule.validateReleaseAssets, "function");
  await releaseAssetModule.validateReleaseAssets({ outputDirectory, version: "0.2.0" });

  await unlink(path.join(outputDirectory, "agent-session-search-0.2.0.tgz"));
  await assert.rejects(
    releaseAssetModule.validateReleaseAssets({ outputDirectory, version: "0.2.0" }),
    /Missing release asset: agent-session-search-0\.2\.0\.tgz/,
  );
});
