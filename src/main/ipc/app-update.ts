import type { AppUpdateInstallResult, AppUpdateStatus } from "../../core/app-update-types";
import { APP_UPDATE_IPC } from "../../shared/ipc/app-update";
import { combineIpcDisposers, registerIpcHandler, type IpcMainRegistrar } from "./register-ipc-handler";

export interface AppUpdateIpcService {
  getStatus(force: boolean): Promise<AppUpdateStatus>;
  install(): Promise<AppUpdateInstallResult>;
  skip(untilNextVersion: boolean): Promise<AppUpdateStatus>;
}

export function registerAppUpdateIpc(
  ipc: IpcMainRegistrar,
  service: AppUpdateIpcService,
): () => void {
  return combineIpcDisposers([
    registerIpcHandler(ipc, APP_UPDATE_IPC.getStatus, (_event, force) => service.getStatus(force)),
    registerIpcHandler(ipc, APP_UPDATE_IPC.install, () => service.install()),
    registerIpcHandler(ipc, APP_UPDATE_IPC.skip, (_event, untilNextVersion) => service.skip(untilNextVersion)),
  ]);
}
