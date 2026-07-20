import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizeSkillRoots } from "./features/skills/skills-page";
import type { SkillRootStatus } from "../../core/skill-manager";
import { rendererStyleSource } from "./style-test-source";

const pageSource = readFileSync(new URL("./features/skills/skills-page.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("./features/skills/skill-library-list.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("./features/skills/skill-library-detail.tsx", import.meta.url), "utf8");
const targetDialogUrl = new URL("./features/skills/skill-target-dialog.tsx", import.meta.url);
const syncSource = readFileSync(new URL("./features/skills/skill-sync-panel.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./features/settings/settings-dialog.tsx", import.meta.url), "utf8");
const stylesheet = rendererStyleSource;

describe("managed Skills page actions", () => {
  it("copies SKILL.md while revealing the complete Skill directory", () => {
    expect(detailSource).toContain("onCopyPath(skill.path)");
    expect(detailSource).toContain("onReveal(skill.directoryPath)");
    expect(detailSource).not.toContain("onReveal(skill.path)");
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

  it("keeps Supabase setup, upload, versions, download, deletion, and Diff in the secondary sync panel", () => {
    const supabaseSettings = settingsSource.slice(settingsSource.indexOf("Supabase skill sync"), settingsSource.indexOf("Appearance", settingsSource.indexOf("Supabase skill sync")));
    expect(settingsSource).toContain("skillSyncSupabaseUrl");
    expect(settingsSource).toContain("skillSyncSupabaseAnonKey");
    expect(supabaseSettings.match(/settings-field skills-sync-field/g)).toHaveLength(2);
    expect(pageSource).toContain("buildUnifiedSkillEntries");
    expect(syncSource).toContain("SupabaseSetupGuide");
    expect(syncSource).toContain('useState<"versions" | "diff">');
    expect(syncSource).toContain("getSyncedSkillDiff");
    expect(syncSource).toContain("onUpload");
    expect(syncSource).toContain("onInstallRemote");
    expect(syncSource).toContain("deleteSyncedSkills");
    expect(pageSource).toContain("onUploadSelected");
  });

  it("keeps name, origin, usage, and install state on compact library rows", () => {
    const row = stylesheet.match(/\.skill-library-row\s*\{[^}]*\}/)?.[0] ?? "";
    expect(listSource).toContain('className="skill-library-row-title"');
    expect(listSource).toContain("originLabel(skill, language)");
    expect(listSource).toContain("skill.usageCount");
    expect(listSource).toContain('className="skill-target-dots"');
    expect(row).toMatch(/display:\s*grid/);
    expect(row).toMatch(/padding:\s*8px/);
  });

  it("uses managed local Skills as the primary list and remote-only records only inside sync details", () => {
    expect(pageSource).toContain("snapshot.skills.filter(isManagedSkill)");
    expect(pageSource).toContain("!entry.local && entry.remote");
    expect(pageSource).toContain("remoteOnlyGroups={remoteOnlyGroups}");
    expect(listSource).not.toContain("RemoteSkillGroup");
  });

  it("shows all changed files in a scrollable Diff without replacing local documentation", () => {
    const detail = stylesheet.match(/\.skill-library-detail\s*\{[^}]*\}/)?.[0] ?? "";
    expect(syncSource).toContain('diff?.files.filter((file) => file.status !== "unchanged")');
    expect(syncSource).toContain("changedFiles.map");
    expect(detailSource).toContain("skill.markdown");
    expect(detail).toMatch(/overflow:\s*auto/);
  });

  it("uses independent list/detail scrolling", () => {
    const grid = stylesheet.match(/\.managed-skills-grid\s*\{[^}]*\}/)?.[0] ?? "";
    const listScroll = stylesheet.match(/\.skill-library-scroll\s*\{[^}]*\}/)?.[0] ?? "";
    const detail = stylesheet.match(/\.skill-library-detail\s*\{[^}]*\}/)?.[0] ?? "";
    expect(grid).toContain("grid-template-columns: minmax(260px, 340px) minmax(0, 1fr)");
    expect(listScroll).toMatch(/overflow:\s*auto/);
    expect(detail).toMatch(/overflow:\s*auto/);
  });

  it("moves install targets into a scalable multi-select dialog", () => {
    expect(detailSource).toContain("<SkillTargetDialog");
    expect(detailSource).not.toContain('className="managed-skill-targets"');
    expect(existsSync(targetDialogUrl)).toBe(true);
    if (!existsSync(targetDialogUrl)) return;
    const targetDialogSource = readFileSync(targetDialogUrl, "utf8");
    expect(targetDialogSource).toContain("skill.installations.map");
    expect(targetDialogSource).toContain("onSave([...selected])");
    expect(targetDialogSource).toContain('role="dialog"');
    expect(stylesheet).toMatch(/\.managed-skill-target-options\s*\{[^}]*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/s);
  });

  it("renders both local and cloud Skill documents as Markdown", () => {
    expect(detailSource).toContain('import { Markdown } from "../../markdown"');
    expect(detailSource).toContain("<Markdown text={markdownPreview(skill.markdown");
    expect(syncSource).toContain('import { Markdown } from "../../markdown"');
    expect(syncSource).toContain("versionMarkdown[selectedVersion.id]");
  });
});
