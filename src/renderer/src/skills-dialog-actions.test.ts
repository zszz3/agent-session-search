import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizeSkillRoots } from "./components/skills-dialog";
import type { SkillRootStatus } from "../../core/skill-manager";

const skillsDialogSource = readFileSync(new URL("./components/skills-dialog.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("skills dialog actions", () => {
  it("copies the SKILL.md path but reveals the skill directory", () => {
    expect(skillsDialogSource).toContain("onCopyPath(skillContextMenu.skill.path)");
    expect(skillsDialogSource).toContain("onReveal(skillContextMenu.skill.directoryPath)");
    expect(skillsDialogSource).not.toContain("onReveal(skillContextMenu.skill.path)");
  });

  it("summarizes noisy project skill roots", () => {
    const roots: SkillRootStatus[] = [
      { agent: "codex", source: "codex-user", path: "/home/.codex/skills", exists: true, skillCount: 10 },
      { agent: "codex", source: "codex-shared", path: "/home/.agents/skills", exists: true, skillCount: 3 },
      { agent: "codex", source: "codex-project", path: "/repo/.codex/skills", exists: true, skillCount: 2 },
      { agent: "codex", source: "codex-project", path: "/repo/app/.codex/skills", exists: false, skillCount: 0 },
      { agent: "claude", source: "claude-project", path: "/repo/.claude/skills", exists: false, skillCount: 0 },
    ];

    expect(summarizeSkillRoots(roots).map((root) => ({ source: root.source, exists: root.exists, skillCount: root.skillCount }))).toEqual([
      { source: "codex-user", exists: true, skillCount: 10 },
      { source: "codex-shared", exists: true, skillCount: 3 },
      { source: "codex-project", exists: true, skillCount: 2 },
    ]);
  });

  it("surfaces Supabase sync configuration and unified skill actions", () => {
    const supabaseSettings = appSource.slice(appSource.indexOf("Supabase skill sync"), appSource.indexOf("Appearance", appSource.indexOf("Supabase skill sync")));

    expect(appSource).toContain("skillSyncSupabaseUrl");
    expect(appSource).toContain("skillSyncSupabaseAnonKey");
    expect(appSource).toContain("supabase.com/dashboard");
    expect(appSource.match(/settings-field skills-sync-field/g)).toHaveLength(2);
    expect(supabaseSettings.match(/settings-field skills-sync-field/g)).toHaveLength(2);
    expect(skillsDialogSource).toContain("buildUnifiedSkillEntries");
    expect(skillsDialogSource).not.toContain("skills-view-tabs");
    expect(skillsDialogSource).toContain('detailView === "local"');
    expect(skillsDialogSource).toContain('detailView === "remote"');
    expect(skillsDialogSource).toContain('detailView === "diff"');
    expect(skillsDialogSource).toContain("getSyncedSkillDiff");
    expect(skillsDialogSource).toContain("onUpload");
    expect(skillsDialogSource).toContain("selectedEntryIds");
    expect(skillsDialogSource).toContain('type="checkbox"');
    expect(skillsDialogSource).toContain("Upload selected");
    expect(skillsDialogSource).toContain("onInstallRemote");
    expect(skillsDialogSource).toContain("onCopySetupSql");
    expect(skillsDialogSource).not.toContain("matched by name");
    expect(skillsDialogSource).not.toContain("按名称匹配");
    expect(skillsDialogSource).toContain("selectedSkill && selectedEntry.syncable");
  });

  it("keeps each skill name, source, and sync versions on one compact row", () => {
    const previewIndex = skillsDialogSource.indexOf('<div className="skill-preview">');
    const unifiedList = skillsDialogSource.slice(
      skillsDialogSource.lastIndexOf("filteredEntries.map", previewIndex),
      previewIndex,
    );
    const compactHead = stylesheet.match(/\.unified-skill-item-head\s*\{[^}]*\}/)?.[0] ?? "";

    expect(unifiedList).toContain('className="unified-skill-item-head"');
    expect(unifiedList).toContain("title={entry.name}");
    expect(unifiedList).toContain("<SkillSourceBadge");
    expect(unifiedList).toContain("skillSyncVersions(entry");
    expect(compactHead).toMatch(/display:\s*flex/);
    expect(compactHead).toMatch(/white-space:\s*nowrap/);
  });

  it("separates version status from the description and scrolls only changed files", () => {
    const diffFiles = stylesheet.match(/\.skill-diff-files\s*\{[^}]*\}/)?.[0] ?? "";

    expect(skillsDialogSource).toContain('className="skill-version-strip"');
    expect(skillsDialogSource).toContain('className="skill-version-copy"');
    expect(skillsDialogSource).toContain('snapshot.files.filter((file) => file.status !== "unchanged")');
    expect(skillsDialogSource).toContain("changedFiles.map");
    expect(diffFiles).toMatch(/overflow-y:\s*auto/);
  });
});
