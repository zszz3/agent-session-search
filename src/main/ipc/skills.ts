import type { DeleteInstalledSkillResult, InstalledSkillsSnapshot } from "../../core/skill-manager";
import type { SkillDiffSnapshot } from "../../core/skill-diff";
import type { RemoteSkill, SkillSyncBatchResult, SkillSyncInstallResult, SkillSyncSnapshot, SkillSyncUploadOutcome } from "../../core/skill-sync";
import type { SkillUsageRefreshStatus } from "../../core/skill-usage";
import { SKILLS_IPC } from "../../shared/ipc/skills";
import { combineIpcDisposers, registerIpcHandler, type IpcMainRegistrar } from "./register-ipc-handler";

export interface SkillsIpcService {
  listSkills(): InstalledSkillsSnapshot;
  refreshUsage(): SkillUsageRefreshStatus;
  getSyncSnapshot(): Promise<SkillSyncSnapshot>;
  upload(skillPath: string, force: boolean): Promise<SkillSyncUploadOutcome>;
  install(remoteSkillId: string): Promise<SkillSyncInstallResult>;
  downloadMany(fingerprints: string[]): Promise<SkillSyncBatchResult>;
  deleteMany(fingerprints: string[]): Promise<SkillSyncBatchResult>;
  getVersion(remoteSkillId: string): Promise<RemoteSkill>;
  getDiff(localSkillPath: string | null, remoteSkillId: string | null): Promise<SkillDiffSnapshot>;
  copySetupSql(): void;
  copyPath(skillPath: string): void;
  reveal(skillPath: string): Promise<void>;
  delete(skillPath: string): DeleteInstalledSkillResult;
  getUsageHookStatus(): boolean;
  installUsageHook(): string;
  uninstallUsageHook(): string;
}

export function registerSkillsIpc(ipc: IpcMainRegistrar, service: SkillsIpcService): () => void {
  return combineIpcDisposers([
    registerIpcHandler(ipc, SKILLS_IPC.list, () => service.listSkills()),
    registerIpcHandler(ipc, SKILLS_IPC.refreshUsage, () => service.refreshUsage()),
    registerIpcHandler(ipc, SKILLS_IPC.getSyncSnapshot, () => service.getSyncSnapshot()),
    registerIpcHandler(ipc, SKILLS_IPC.upload, (_event, path, force) => service.upload(path, force)),
    registerIpcHandler(ipc, SKILLS_IPC.install, (_event, id) => service.install(id)),
    registerIpcHandler(ipc, SKILLS_IPC.downloadMany, (_event, fingerprints) => service.downloadMany(fingerprints)),
    registerIpcHandler(ipc, SKILLS_IPC.deleteMany, (_event, fingerprints) => service.deleteMany(fingerprints)),
    registerIpcHandler(ipc, SKILLS_IPC.getVersion, (_event, id) => service.getVersion(id)),
    registerIpcHandler(ipc, SKILLS_IPC.getDiff, (_event, path, id) => service.getDiff(path, id)),
    registerIpcHandler(ipc, SKILLS_IPC.copySetupSql, () => service.copySetupSql()),
    registerIpcHandler(ipc, SKILLS_IPC.copyPath, (_event, path) => service.copyPath(path)),
    registerIpcHandler(ipc, SKILLS_IPC.reveal, (_event, path) => service.reveal(path)),
    registerIpcHandler(ipc, SKILLS_IPC.delete, (_event, path) => service.delete(path)),
    registerIpcHandler(ipc, SKILLS_IPC.getUsageHookStatus, () => service.getUsageHookStatus()),
    registerIpcHandler(ipc, SKILLS_IPC.installUsageHook, () => service.installUsageHook()),
    registerIpcHandler(ipc, SKILLS_IPC.uninstallUsageHook, () => service.uninstallUsageHook()),
  ]);
}
