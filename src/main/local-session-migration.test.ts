import { describe, expect, it, vi } from "vitest";
import { defaultSettings, getSafeMigrationResumeCommand } from "../core/platform";
import { migrateSession, type SessionMigrationDependencies } from "../core/session-migration";
import type { SessionMessage, SessionSearchResult } from "../core/types";
import { runLocalSessionMigration, type LocalSessionMigrationRuntime } from "./local-session-migration";

const source = {
  sessionKey: "claude-cli:1",
  source: "claude-cli",
  environmentKind: "local",
  environmentId: "local",
  projectPath: "/repo",
  displayTitle: "Source",
  timestamp: Date.parse("2026-07-10T00:00:00Z"),
} as SessionSearchResult;
const messages: SessionMessage[] = [];

function runtime(): LocalSessionMigrationRuntime<object, object> {
  return {
    resolveSummaryEndpoint: vi.fn(() => ({ provider: "snapshot" })),
    createCompressor: vi.fn(() => ({ compressor: true })),
    migrate: vi.fn<LocalSessionMigrationRuntime<object, object>["migrate"]>(async () => ({
      target: "codex",
      targetSessionId: "id",
      targetFilePath: "/tmp/id",
      strategy: "complete",
      resumeCommand: "resume",
      indexed: true,
      launched: true,
    })),
    inspectCli: vi.fn(),
    prepare: vi.fn<LocalSessionMigrationRuntime<object, object>["prepare"]>(async (session) => ({ session, strategy: "complete" })),
    write: vi.fn(async () => ({ sessionId: "id", filePath: "/tmp/id" })),
    record: vi.fn(),
    refreshIndex: vi.fn(),
    launch: vi.fn(),
    resumeCommand: vi.fn(() => "primary"),
    fallbackResumeCommand: vi.fn(() => "fallback"),
    onProgress: vi.fn(),
    idFactory: vi.fn(() => "record"),
    now: vi.fn(() => 1),
    projectPathExists: vi.fn(() => true),
    projectPathIsDirectory: vi.fn(() => true),
  };
}

describe("runLocalSessionMigration", () => {
  it.each([
    ["invalid", "hermes", defaultSettings, "Migration target hermes is not supported."],
    ["disabled", "tcodex", defaultSettings, "TCodex migration target is disabled in Settings."],
  ] as const)("rejects %s targets before endpoint, compressor, or migration work", async (_label, target, settings, message) => {
    const deps = runtime();

    await expect(runLocalSessionMigration({ source, messages, target, settings }, deps)).rejects.toThrow(message);

    expect(deps.resolveSummaryEndpoint).not.toHaveBeenCalled();
    expect(deps.createCompressor).not.toHaveBeenCalled();
    expect(deps.migrate).not.toHaveBeenCalled();
    expect(deps.inspectCli).not.toHaveBeenCalled();
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
    expect(deps.refreshIndex).not.toHaveBeenCalled();
    expect(deps.launch).not.toHaveBeenCalled();
    expect(deps.resumeCommand).not.toHaveBeenCalled();
    expect(deps.fallbackResumeCommand).not.toHaveBeenCalled();
  });

  it("captures one immutable settings snapshot in every downstream callback", async () => {
    const snapshot = Object.freeze({
      ...defaultSettings,
      includeTcodex: true,
      codexBinary: "/snapshot/codex",
      compressionConcurrency: 3,
    });
    const laterSettings = { ...snapshot, codexBinary: "/later/codex", compressionConcurrency: 99 };
    const deps = runtime();
    const seenSettings: unknown[] = [];
    deps.resolveSummaryEndpoint = vi.fn((settings) => {
      seenSettings.push(settings);
      return { provider: "snapshot" };
    });
    deps.inspectCli = vi.fn((_target, settings) => {
      seenSettings.push(settings);
    });
    deps.launch = vi.fn(async (_target, _id, _path, settings) => {
      seenSettings.push(settings);
    });
    deps.resumeCommand = vi.fn((_target, _id, _path, settings) => {
      seenSettings.push(settings);
      return settings.codexBinary;
    });
    deps.fallbackResumeCommand = vi.fn((_target, _id, _path, settings) => {
      seenSettings.push(settings);
      return settings.codexBinary;
    });
    deps.migrate = vi.fn<LocalSessionMigrationRuntime<object, object>["migrate"]>(async (options) => {
      await options.deps.inspectCli("tcodex");
      options.deps.resumeCommand("tcodex", "id", "/repo");
      options.deps.fallbackResumeCommand("tcodex", "id", "/repo");
      await options.deps.launch("tcodex", "id", "/repo");
      expect(laterSettings.codexBinary).toBe("/later/codex");
      return {
        target: "tcodex", targetSessionId: "id", targetFilePath: "/tmp/id", strategy: "complete",
        resumeCommand: "resume", indexed: true, launched: true,
      };
    });

    await runLocalSessionMigration({ source, messages, target: "tcodex", settings: snapshot }, deps);

    expect(deps.createCompressor).toHaveBeenCalledWith({ provider: "snapshot" }, 3);
    expect(seenSettings).toHaveLength(5);
    expect(seenSettings.every((settings) => settings === snapshot)).toBe(true);
  });

  it("returns the independent safe command when the primary formatter throws", async () => {
    const settings = { ...defaultSettings, includeTcodex: true, tcodexBinary: "/safe/tcodex cli" };
    const deps = runtime();
    deps.migrate = migrateSession;
    deps.resumeCommand = vi.fn(() => {
      throw new Error("primary formatter failed");
    });
    deps.fallbackResumeCommand = vi.fn((target, sessionId, projectPath, snapshot) =>
      getSafeMigrationResumeCommand(target, sessionId, projectPath, snapshot, { platform: "linux" }));

    const result = await runLocalSessionMigration({ source, messages, target: "tcodex", settings }, deps);

    expect(result.resumeCommand).toBe("cd /repo && '/safe/tcodex cli' resume id");
    expect(result.warning).toContain("Failed to build resume command: primary formatter failed");
  });
});
