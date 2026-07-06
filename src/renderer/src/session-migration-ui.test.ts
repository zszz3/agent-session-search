import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const detailPanelSource = readFileSync(new URL("./components/detail-panel.tsx", import.meta.url), "utf8");
const dialogSource = readFileSync(new URL("./components/session-migration-dialog.tsx", import.meta.url), "utf8");
const sessionUiSource = readFileSync(new URL("./session-ui.ts", import.meta.url), "utf8");

describe("session migration UI wiring", () => {
  it("wires migration controls through detail panel, context menu, dialog, and progress events", () => {
    const contextMenuSource = appSource.slice(appSource.indexOf("function ContextMenu"), appSource.indexOf("function SettingsDialog"));

    expect(detailPanelSource).toContain("onMigrate");
    expect(detailPanelSource).toMatch(/Migrate to/);
    expect(appSource).toContain("<SessionMigrationDialog");
    expect(appSource).toContain("window.sessionSearch.migrateSession");
    expect(appSource).toContain("window.sessionSearch.onMigrationProgress");
    expect(contextMenuSource).toMatch(/Migrate to/);
    expect(sessionUiSource).toContain("Remote session migration is not supported yet");
    expect(dialogSource).toContain("targetSessionId");
    expect(dialogSource).toContain("resumeCommand");
  });

  it("renders a compression progress bar inside the migration dialog", () => {
    expect(appSource).toContain("progress={migrationProgress}");
    expect(dialogSource).toContain("MigrationProgressPanel");
    expect(dialogSource).toContain("migration-progress-bar");
    expect(dialogSource).toContain("migration-progress-fill");
    expect(dialogSource).toContain('role="progressbar"');
  });
});
