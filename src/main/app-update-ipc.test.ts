import type { IpcMainInvokeEvent, IpcRendererEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import type { AppUpdateStatus } from "../core/app-update-types";
import { createAppUpdateApi } from "../preload/app-update";
import { APP_UPDATE_EVENTS, APP_UPDATE_IPC } from "../shared/ipc/app-update";
import { IpcInputError } from "../shared/ipc/contract";
import { registerAppUpdateIpc, type AppUpdateIpcService } from "./ipc/app-update";
import type { IpcMainRegistrar } from "./ipc/register-ipc-handler";

type RegisteredHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function updateStatus(overrides: Partial<AppUpdateStatus> = {}): AppUpdateStatus {
  return {
    currentVersion: "0.1.0",
    developmentBuild: false,
    checkedAt: 1,
    fromCache: false,
    updateAvailable: false,
    manifest: null,
    error: null,
    ...overrides,
  };
}

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

function createService(): AppUpdateIpcService & {
  getStatus: ReturnType<typeof vi.fn>;
  install: ReturnType<typeof vi.fn>;
  skip: ReturnType<typeof vi.fn>;
} {
  return {
    getStatus: vi.fn(async () => updateStatus()),
    install: vi.fn(async () => ({ started: true, version: "0.2.0" })),
    skip: vi.fn(async () => updateStatus()),
  };
}

describe("application update IPC", () => {
  it("registers each shared contract and delegates normalized inputs", async () => {
    const { ipc, handlers } = createMainRegistrar();
    const service = createService();
    registerAppUpdateIpc(ipc, service);

    expect([...handlers.keys()].sort()).toEqual([
      APP_UPDATE_IPC.getStatus.channel,
      APP_UPDATE_IPC.install.channel,
      APP_UPDATE_IPC.skip.channel,
    ].sort());

    const event = {} as IpcMainInvokeEvent;
    await handlers.get(APP_UPDATE_IPC.getStatus.channel)?.(event);
    await handlers.get(APP_UPDATE_IPC.getStatus.channel)?.(event, true);
    await handlers.get(APP_UPDATE_IPC.install.channel)?.(event);
    await handlers.get(APP_UPDATE_IPC.skip.channel)?.(event);
    await handlers.get(APP_UPDATE_IPC.skip.channel)?.(event, true);

    expect(service.getStatus).toHaveBeenNthCalledWith(1, false);
    expect(service.getStatus).toHaveBeenNthCalledWith(2, true);
    expect(service.install).toHaveBeenCalledOnce();
    expect(service.skip).toHaveBeenNthCalledWith(1, false);
    expect(service.skip).toHaveBeenNthCalledWith(2, true);
  });

  it("rejects malformed renderer input before reaching the service", () => {
    const { ipc, handlers } = createMainRegistrar();
    const service = createService();
    registerAppUpdateIpc(ipc, service);
    const event = {} as IpcMainInvokeEvent;

    expect(() => handlers.get(APP_UPDATE_IPC.getStatus.channel)?.(event, "force")).toThrow(IpcInputError);
    expect(() => handlers.get(APP_UPDATE_IPC.skip.channel)?.(event, 1)).toThrow(IpcInputError);
    expect(() => handlers.get(APP_UPDATE_IPC.install.channel)?.(event, true)).toThrow(IpcInputError);
    expect(service.getStatus).not.toHaveBeenCalled();
    expect(service.skip).not.toHaveBeenCalled();
    expect(service.install).not.toHaveBeenCalled();
  });

  it("returns a disposer that removes every registered handler", () => {
    const { ipc, handlers, removed } = createMainRegistrar();
    const dispose = registerAppUpdateIpc(ipc, createService());
    dispose();

    expect(handlers.size).toBe(0);
    expect(removed.sort()).toEqual([
      APP_UPDATE_IPC.getStatus.channel,
      APP_UPDATE_IPC.install.channel,
      APP_UPDATE_IPC.skip.channel,
    ].sort());
  });

  it("builds the existing preload API from the same channel contracts", async () => {
    const invoke = vi.fn(async () => undefined);
    const listeners = new Map<string, (event: IpcRendererEvent, status: AppUpdateStatus) => void>();
    const removeListener = vi.fn((channel: string) => listeners.delete(channel));
    const renderer = {
      invoke,
      on(channel: string, listener: (event: IpcRendererEvent, status: AppUpdateStatus) => void) {
        listeners.set(channel, listener);
        return renderer;
      },
      removeListener,
    } as unknown as Parameters<typeof createAppUpdateApi>[0];
    const api = createAppUpdateApi(renderer);

    await api.getAppUpdateStatus();
    await api.getAppUpdateStatus(true);
    await api.installAppUpdate();
    await api.skipAppUpdate();
    await api.skipAppUpdate(true);

    expect(invoke.mock.calls).toEqual([
      [APP_UPDATE_IPC.getStatus.channel, false],
      [APP_UPDATE_IPC.getStatus.channel, true],
      [APP_UPDATE_IPC.install.channel],
      [APP_UPDATE_IPC.skip.channel, false],
      [APP_UPDATE_IPC.skip.channel, true],
    ]);

    const callback = vi.fn();
    const unsubscribe = api.onAppUpdateStatus(callback);
    const status = updateStatus({ updateAvailable: true });
    listeners.get(APP_UPDATE_EVENTS.status)?.({} as IpcRendererEvent, status);
    expect(callback).toHaveBeenCalledWith(status);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(APP_UPDATE_EVENTS.status, expect.any(Function));
  });
});
