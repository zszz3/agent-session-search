import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createProvidersApi } from "../preload/providers";
import { PROVIDERS_IPC } from "../shared/ipc/providers";
import { IpcInputError } from "../shared/ipc/contract";
import { registerProvidersIpc, type ProvidersIpcService } from "./ipc/providers";
import type { IpcMainRegistrar } from "./ipc/register-ipc-handler";

type RegisteredHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function createMainRegistrar() {
  const handlers = new Map<string, RegisteredHandler>();
  const removed: string[] = [];
  const ipc = {
    handle(channel: string, listener: RegisteredHandler) {
      if (handlers.has(channel)) throw new Error(`Duplicate handler: ${channel}`);
      handlers.set(channel, listener);
    },
    removeHandler(channel: string) {
      removed.push(channel);
      handlers.delete(channel);
    },
  } as unknown as IpcMainRegistrar;
  return { ipc, handlers, removed };
}

function createService(): ProvidersIpcService & Record<keyof ProvidersIpcService, ReturnType<typeof vi.fn>> {
  return {
    getCodexConfig: vi.fn(async () => ({
      codexHome: "/tmp/codex",
      configPath: "/tmp/codex/config.toml",
      exists: false,
      activeProviderId: "openai",
      activeModel: "",
      activeProvider: null,
      providers: [],
    })),
    probeCodexModels: vi.fn(async () => ({ models: ["model-a"], endpoint: "https://api.example/v1/models" })),
    applyCodexProfile: vi.fn(async () => ({
      profile: "codex",
      codexHome: "/tmp/codex",
      authSource: null,
      configSource: null,
      authTarget: "/tmp/codex/auth.json",
      configTarget: "/tmp/codex/config.toml",
      backupPaths: [],
    })),
    applyClaudeProfile: vi.fn(async () => ({
      profile: "claude-official",
      claudeHome: "/tmp/claude",
      settingsPath: "/tmp/claude/settings.json",
      backupPaths: [],
    })),
    getCodexChatProxyStatus: vi.fn(() => null),
    stopCodexChatProxy: vi.fn(async () => null),
    getProviderKey: vi.fn(() => "saved-key"),
  };
}

describe("Providers IPC", () => {
  it("registers the shared contracts and delegates parsed requests", async () => {
    const { ipc, handlers } = createMainRegistrar();
    const service = createService();
    registerProvidersIpc(ipc, service);
    const event = {} as IpcMainInvokeEvent;

    expect([...handlers.keys()].sort()).toEqual(Object.values(PROVIDERS_IPC).map((contract) => contract.channel).sort());
    await handlers.get(PROVIDERS_IPC.getCodexConfig.channel)?.(event);
    await handlers.get(PROVIDERS_IPC.probeCodexModels.channel)?.(event, {
      baseUrl: "https://api.example/v1",
      apiKey: "",
      providerId: " deepseek ",
    });
    await handlers.get(PROVIDERS_IPC.applyCodexProfile.channel)?.(event, { activeProvider: "official" });
    await handlers.get(PROVIDERS_IPC.applyClaudeProfile.channel)?.(event, { activeProvider: "official" });
    await handlers.get(PROVIDERS_IPC.getCodexChatProxyStatus.channel)?.(event);
    await handlers.get(PROVIDERS_IPC.stopCodexChatProxy.channel)?.(event);
    await handlers.get(PROVIDERS_IPC.getApiProviderKey.channel)?.(event, "summary", " custom ");

    expect(service.probeCodexModels).toHaveBeenCalledWith({
      baseUrl: "https://api.example/v1",
      apiKey: "",
      providerId: "deepseek",
    });
    expect(service.applyCodexProfile).toHaveBeenCalledWith({ activeProvider: "official" });
    expect(service.applyClaudeProfile).toHaveBeenCalledWith({ activeProvider: "official" });
    expect(service.getProviderKey).toHaveBeenCalledWith("summary", "custom");
  });

  it("rejects malformed or oversized provider input before calling the service", () => {
    const { ipc, handlers } = createMainRegistrar();
    const service = createService();
    registerProvidersIpc(ipc, service);
    const event = {} as IpcMainInvokeEvent;

    expect(() => handlers.get(PROVIDERS_IPC.applyCodexProfile.channel)?.(event, {
      activeProvider: "custom",
      unexpectedSecret: "must not pass through",
    })).toThrow(IpcInputError);
    expect(() => handlers.get(PROVIDERS_IPC.applyClaudeProfile.channel)?.(event, {
      customApiKeyField: "PASSWORD",
    })).toThrow(IpcInputError);
    expect(() => handlers.get(PROVIDERS_IPC.probeCodexModels.channel)?.(event, {
      baseUrl: "https://api.example/v1",
      apiKey: "x".repeat(65_537),
    })).toThrow(IpcInputError);
    expect(() => handlers.get(PROVIDERS_IPC.getApiProviderKey.channel)?.(event, "filesystem", "custom")).toThrow(IpcInputError);

    expect(service.applyCodexProfile).not.toHaveBeenCalled();
    expect(service.applyClaudeProfile).not.toHaveBeenCalled();
    expect(service.probeCodexModels).not.toHaveBeenCalled();
    expect(service.getProviderKey).not.toHaveBeenCalled();
  });

  it("removes every handler through its disposer", () => {
    const { ipc, handlers, removed } = createMainRegistrar();
    const dispose = registerProvidersIpc(ipc, createService());
    dispose();

    expect(handlers.size).toBe(0);
    expect(removed.sort()).toEqual(Object.values(PROVIDERS_IPC).map((contract) => contract.channel).sort());
  });

  it("builds the existing preload methods from the same contracts", async () => {
    const invoke = vi.fn(async () => undefined);
    const api = createProvidersApi({ invoke } as unknown as Parameters<typeof createProvidersApi>[0]);
    const codex = { activeProvider: "official" as const };
    const claude = { activeProvider: "official" as const };

    await api.getCodexConfig();
    await api.probeCodexModels({ baseUrl: "https://api.example/v1", apiKey: "key", providerId: "deepseek" });
    await api.applyCodexProfile(codex as Parameters<typeof api.applyCodexProfile>[0]);
    await api.applyClaudeProfile(claude as Parameters<typeof api.applyClaudeProfile>[0]);
    await api.getCodexChatProxyStatus();
    await api.stopCodexChatProxy();
    await api.getApiProviderKey("codex", "deepseek");

    expect(invoke.mock.calls).toEqual([
      [PROVIDERS_IPC.getCodexConfig.channel],
      [PROVIDERS_IPC.probeCodexModels.channel, { baseUrl: "https://api.example/v1", apiKey: "key", providerId: "deepseek" }],
      [PROVIDERS_IPC.applyCodexProfile.channel, codex],
      [PROVIDERS_IPC.applyClaudeProfile.channel, claude],
      [PROVIDERS_IPC.getCodexChatProxyStatus.channel],
      [PROVIDERS_IPC.stopCodexChatProxy.channel],
      [PROVIDERS_IPC.getApiProviderKey.channel, "codex", "deepseek"],
    ]);
  });
});
