import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { parseIpcRequest, type IpcRequestContract } from "../../shared/ipc/contract";

export type IpcMainRegistrar = Pick<IpcMain, "handle" | "removeHandler">;

export function registerIpcHandler<Args extends unknown[], Result>(
  ipc: IpcMainRegistrar,
  contract: IpcRequestContract<Args>,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => Result | Promise<Result>,
): () => void {
  ipc.handle(contract.channel, (event, ...input) => {
    const args = parseIpcRequest(contract, input);
    return handler(event, ...args);
  });
  return () => ipc.removeHandler(contract.channel);
}

export function combineIpcDisposers(disposers: Array<() => void>): () => void {
  return () => {
    for (const dispose of [...disposers].reverse()) dispose();
  };
}
