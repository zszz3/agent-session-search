import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../core/platform";
import {
  AUTO_SKILL_USAGE_REFRESH_INTERVAL_MS,
  INITIAL_SKILL_USAGE_REFRESH_DELAY_MS,
} from "../core/refresh-policy";
import { SkillService, type SkillStorePort } from "./services/skill-service";

function createHarness(options: { throwOnSources?: boolean } = {}) {
  const store: SkillStorePort = {
    listProjects: vi.fn(() => []),
    getSkillUsageSnapshot: vi.fn(() => ({
      path: "/tmp/usage.jsonl",
      exists: false,
      totalEvents: 0,
      stats: [],
      byName: {},
      byAgentName: {},
    })),
    isSkillUsageSourceFresh: vi.fn(() => false),
    upsertSkillUsageSource: vi.fn(),
    pruneSkillUsageSources: vi.fn(),
    listSkillSyncBindings: vi.fn(() => []),
    getSkillSyncBindingForPortableIdentity: vi.fn(() => null),
    upsertSkillSyncBinding: vi.fn(),
    deleteSkillSyncBindingsForRemoteIds: vi.fn(),
  };
  const timeoutCallbacks = new Map<number, () => void>();
  const intervalCallbacks = new Map<number, () => void>();
  const clearTimeout = vi.fn();
  const clearInterval = vi.fn();
  const listSkillUsageSources = vi.fn(() => {
    if (options.throwOnSources) throw new Error("usage source failed");
    return [];
  });
  const logError = vi.fn();
  const service = new SkillService({
    getStore: () => store,
    getSettings: () => defaultSettings,
    getHookSetup: () => ({
      installSkillUsageHook: () => ({ status: "installed" }),
      uninstallSkillUsageHook: () => ({ status: "removed" }),
      skillUsageHookStatus: () => ({ installed: false }),
    }),
    copyText: vi.fn(),
    revealPath: vi.fn(async () => undefined),
    now: () => 123,
    logError,
    operations: { listSkillUsageSources },
    timers: {
      setTimeout: (callback) => {
        timeoutCallbacks.set(1, callback);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout,
      setInterval: (callback) => {
        intervalCallbacks.set(2, callback);
        return 2 as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval,
    },
  });
  return {
    service,
    store,
    timeoutCallbacks,
    intervalCallbacks,
    clearTimeout,
    clearInterval,
    listSkillUsageSources,
    logError,
  };
}

describe("skill usage refresh lifecycle", () => {
  it("starts exactly one initial refresh and one background interval", () => {
    const harness = createHarness();
    harness.service.startUsageRefresh();
    harness.service.startUsageRefresh();

    expect(harness.timeoutCallbacks.size).toBe(1);
    expect(harness.intervalCallbacks.size).toBe(1);
    harness.timeoutCallbacks.get(1)?.();
    harness.intervalCallbacks.get(2)?.();

    expect(harness.listSkillUsageSources).toHaveBeenCalledTimes(2);
    expect(harness.store.pruneSkillUsageSources).toHaveBeenCalledTimes(2);
  });

  it("uses the configured refresh delays", () => {
    const setTimeout = vi.fn(() => 1 as unknown as ReturnType<typeof globalThis.setTimeout>);
    const setInterval = vi.fn(() => 2 as unknown as ReturnType<typeof globalThis.setInterval>);
    const harness = createHarness();
    const service = new SkillService({
      getStore: () => harness.store,
      getSettings: () => defaultSettings,
      getHookSetup: () => ({
        installSkillUsageHook: () => ({ status: "installed" }),
        uninstallSkillUsageHook: () => ({ status: "removed" }),
        skillUsageHookStatus: () => ({ installed: false }),
      }),
      copyText: vi.fn(),
      revealPath: vi.fn(async () => undefined),
      now: () => 123,
      logError: vi.fn(),
      operations: { listSkillUsageSources: vi.fn(() => []) },
      timers: {
        setTimeout,
        clearTimeout: vi.fn(),
        setInterval,
        clearInterval: vi.fn(),
      },
    });

    service.startUsageRefresh();
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), INITIAL_SKILL_USAGE_REFRESH_DELAY_MS);
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), AUTO_SKILL_USAGE_REFRESH_INTERVAL_MS);
  });

  it("clears both timers during shutdown", () => {
    const harness = createHarness();
    harness.service.startUsageRefresh();
    harness.service.stopUsageRefresh();

    expect(harness.clearTimeout).toHaveBeenCalledWith(1);
    expect(harness.clearInterval).toHaveBeenCalledWith(2);
  });

  it("isolates background refresh failures and reports them", () => {
    const harness = createHarness({ throwOnSources: true });
    expect(() => harness.service.refreshUsageSafely()).not.toThrow();
    expect(harness.logError).toHaveBeenCalledWith("Failed to refresh skill usage: usage source failed");
  });
});
