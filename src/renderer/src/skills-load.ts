import type { InstalledSkillsSnapshot } from "../../core/skill-manager";
import type { SkillSyncSnapshot } from "../../core/skill-sync";

export interface SkillsPanelLoaders {
  listSkills: () => Promise<InstalledSkillsSnapshot>;
  getSkillSyncSnapshot: () => Promise<SkillSyncSnapshot>;
  fallbackSyncSnapshot: SkillSyncSnapshot;
  onInstalledSkillsLoaded?: (snapshot: InstalledSkillsSnapshot) => void;
}

export interface SkillsPanelData {
  installedSkills: InstalledSkillsSnapshot;
  skillSyncSnapshot: SkillSyncSnapshot;
  syncError: Error | null;
}

export async function loadSkillsPanelData({
  listSkills,
  getSkillSyncSnapshot,
  fallbackSyncSnapshot,
  onInstalledSkillsLoaded,
}: SkillsPanelLoaders): Promise<SkillsPanelData> {
  const installedSkillsPromise = listSkills();
  const syncResultPromise: Promise<PromiseSettledResult<SkillSyncSnapshot>> = getSkillSyncSnapshot().then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ status: "rejected", reason }),
  );
  const installedSkills = await installedSkillsPromise;
  onInstalledSkillsLoaded?.(installedSkills);
  const syncResult = await syncResultPromise;

  if (syncResult.status === "fulfilled") {
    return {
      installedSkills,
      skillSyncSnapshot: syncResult.value,
      syncError: null,
    };
  }

  const syncError = normalizeError(syncResult.reason);
  return {
    installedSkills,
    skillSyncSnapshot: {
      status: {
        kind: "error",
        setupSql: fallbackSyncSnapshot.status.setupSql,
        remediation: "settings",
        message: syncError.message,
      },
      remoteSkillGroups: [],
      bindings: fallbackSyncSnapshot.bindings,
      scannedAt: Date.now(),
    },
    syncError,
  };
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
