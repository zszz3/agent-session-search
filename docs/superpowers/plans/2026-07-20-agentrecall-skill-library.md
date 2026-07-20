# AgentRecall Managed Skill Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current agent-directory-first Skills screen with a MAC-style AgentRecall-managed Skill library, safe target installation, explicit local import, and a `skills.sh` discovery leaderboard.

**Architecture:** A filesystem-backed managed library under Electron `userData` owns each Skill's complete directory. Existing agent roots become import sources and Codex, Claude Code, and Trae become link targets. `SkillService` remains the orchestration boundary for usage and Supabase version sync, while focused core modules own managed-library file safety and `skills.sh` parsing/caching. The renderer keeps a two-column installed-library page and opens local-import/discovery as task dialogs.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Electron IPC, React 19, Vitest, Zod, existing Supabase Skill sync, public `skills.sh` JSON APIs.

---

## File map

- Create `src/core/managed-skill-library.ts`: managed metadata, import, safe link installation, target inspection, deletion, and remote-file import.
- Create `src/core/managed-skill-library.test.ts`: temporary-HOME filesystem behavior for imports, conflicts, links, Junction selection, and deletion.
- Create `src/core/skills-sh.ts`: public API types, validation, URL construction, cached fetches, detail parsing, and safe downloaded files.
- Create `src/core/skills-sh.test.ts`: response parsing, pagination/search, cache fallback, and unsafe-path rejection.
- Modify `src/core/skill-manager.ts`: add the `agent-recall` source/scope and allow an explicit managed-only root scan.
- Modify `src/core/skill-sync.ts`: support the `agent-recall/<id>` portable identity and install remote versions into the managed root.
- Modify `src/main/services/skill-service.ts`: make the managed library the local source of truth and orchestrate imports, targets, discovery, usage, and sync.
- Modify `src/main/services/skill-service.test.ts`: observable service behavior for the new local source of truth.
- Modify `src/shared/ipc/skills.ts`, `src/main/ipc/skills.ts`, `src/preload/skills.ts`, and `src/main/skill-sync-ipc.test.ts`: validated IPC surface for import, target changes, and discovery.
- Modify `src/main/index.ts`: inject `userData` library/cache roots into `SkillService`.
- Modify `src/main/index.ts` and `src/renderer/src/workbench-ui.test.ts`: keep cold start and ordinary window activation on Workbench; focus Sessions only for explicit search shortcuts.
- Rewrite `src/renderer/src/features/skills/skills-page.tsx`: thin MAC-style page coordinator.
- Create `src/renderer/src/features/skills/skill-library-list.tsx`: installed Skill search/filter/list and batch selection.
- Create `src/renderer/src/features/skills/skill-library-detail.tsx`: documentation, target rail, local actions, and secondary sync controls.
- Create `src/renderer/src/features/skills/skill-import-dialog.tsx`: explicit local Skill candidate selection/import.
- Create `src/renderer/src/features/skills/skill-discovery-dialog.tsx`: `skills.sh` leaderboard/search/detail/import.
- Create `src/renderer/src/features/skills/skill-sync-panel.tsx`: retained upload, remote version, Diff, and remote-only download behavior.
- Modify `src/renderer/src/App.tsx`: load and mutate the new APIs without moving feature state back into the monolithic app shell.
- Rewrite `src/renderer/src/styles/skills-page.css` and trim obsolete rules in `src/renderer/src/styles/skills.css`.
- Update renderer behavior tests and `.release-notes/main-2-0.md`.

### Task 1: Managed library filesystem domain

**Files:**
- Create: `src/core/managed-skill-library.test.ts`
- Create: `src/core/managed-skill-library.ts`
- Modify: `src/core/skill-manager.ts`
- Test: `src/core/skill-manager.test.ts`

- [ ] **Step 1: Write failing tests for explicit import and conflict handling**

Use a temporary HOME and library root. Create synthetic `SKILL.md` directories and assert:

```ts
const imported = library.importLocalSkill(sourceSkill.path);
expect(imported.status).toBe("imported");
expect(readFileSync(join(libraryRoot, "review-code", "SKILL.md"), "utf8")).toContain("Review code");
expect(existsSync(sourceSkill.path)).toBe(true);

expect(library.importLocalSkill(sourceSkill.path)).toMatchObject({ status: "existing" });
writeFileSync(sourceSkill.path, "# changed\n");
expect(() => library.importLocalSkill(sourceSkill.path)).toThrow(/different content/i);
```

Also assert that only paths returned by the current local scan can be imported and that `../` file paths in a downloaded bundle are rejected.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run src/core/managed-skill-library.test.ts src/core/skill-manager.test.ts`

Expected: FAIL because `ManagedSkillLibrary` and the `agent-recall` source do not exist.

- [ ] **Step 3: Implement managed types and atomic imports**

Define the observable API:

```ts
export type SkillInstallTarget = "codex" | "claude" | "trae";
export type ManagedSkillOriginKind = "local" | "skills-sh" | "remote";
export type ManagedSkillTargetState = "installed" | "not-installed" | "conflict";

export interface ManagedSkill extends InstalledSkill {
  source: "agent-recall";
  managedId: string;
  origin: { kind: ManagedSkillOriginKind; label: string; source?: string; url?: string };
  installations: Array<{ target: SkillInstallTarget; path: string; state: ManagedSkillTargetState }>;
}

export class ManagedSkillLibrary {
  list(): ManagedSkillsSnapshot;
  listImportCandidates(projectDirs: string[]): InstalledSkillsSnapshot;
  importLocalSkill(skillPath: string, projectDirs?: string[]): ManagedSkillImportResult;
  importFiles(input: ManagedSkillFileImport): ManagedSkillImportResult;
  updateTargets(managedId: string, targets: SkillInstallTarget[]): ManagedSkill;
  delete(managedId: string): DeleteInstalledSkillResult;
}
```

Copy into a sibling staging directory, validate that `SKILL.md` exists, then rename into place. Store local-only origin metadata under `<libraryRoot>/.metadata/<id>.json` so absolute source paths are never included in synced Skill files.

- [ ] **Step 4: Implement managed-only scanning**

Extend `SkillSource` and `SkillPortableScope` with `agent-recall`. Extend `SkillManagerOptions` with `managedRoot` and `managedOnly`; when set, scan exactly that root as `{ agent: "codex", source: "agent-recall" }`. Map the portable identity to `agent-recall/<relative-directory>`.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npx vitest run src/core/managed-skill-library.test.ts src/core/skill-manager.test.ts`

Expected: PASS.

Commit:

```bash
git add src/core/managed-skill-library.ts src/core/managed-skill-library.test.ts src/core/skill-manager.ts src/core/skill-manager.test.ts
git commit -m "feat: add managed skill library"
```

### Task 2: Safe target links and managed usage identity

**Files:**
- Modify: `src/core/managed-skill-library.test.ts`
- Modify: `src/core/managed-skill-library.ts`
- Modify: `src/core/skill-usage.ts`
- Test: `src/core/skill-usage.test.ts`

- [ ] **Step 1: Write failing target-state tests**

Cover the three states and safe uninstall:

```ts
expect(library.list().skills[0].installations).toEqual([
  expect.objectContaining({ target: "codex", state: "not-installed" }),
  expect.objectContaining({ target: "claude", state: "not-installed" }),
  expect.objectContaining({ target: "trae", state: "not-installed" }),
]);

library.updateTargets("review-code", ["codex", "claude"]);
expect(realpathSync(codexTarget)).toBe(realpathSync(managedDir));
expect(realpathSync(claudeTarget)).toBe(realpathSync(managedDir));

mkdirSync(traeTarget, { recursive: true });
expect(() => library.updateTargets("review-code", ["trae"])).toThrow(/refusing to overwrite/i);
expect(existsSync(codexTarget)).toBe(true); // preflight prevents partial mutation
```

Inject `platform: "win32"` and spy on the filesystem adapter to assert link type `junction`; assert `dir` on macOS/Linux.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/core/managed-skill-library.test.ts src/core/skill-usage.test.ts`

Expected: FAIL on missing installation state and target mutation.

- [ ] **Step 3: Implement preflighted link updates and aggregate usage**

Resolve targets as:

```ts
codex  -> <CODEX_HOME>/skills/<managedId>
claude -> <HOME>/.claude/skills/<managedId>
trae   -> <HOME>/.trae/skills/<managedId>
```

Before any write, inspect every requested target. Refuse ordinary files/directories and links pointing elsewhere. Remove only links that still resolve to the selected managed directory. Merge Codex and Claude usage records by normalized Skill name for managed entries.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx vitest run src/core/managed-skill-library.test.ts src/core/skill-usage.test.ts`

Expected: PASS.

Commit:

```bash
git add src/core/managed-skill-library.ts src/core/managed-skill-library.test.ts src/core/skill-usage.ts src/core/skill-usage.test.ts
git commit -m "feat: install managed skills across agents"
```

### Task 3: Public skills.sh discovery client

**Files:**
- Create: `src/core/skills-sh.test.ts`
- Create: `src/core/skills-sh.ts`

- [ ] **Step 1: Write failing parser, cache, and safety tests**

Use injected `fetch` responses matching the public API:

```ts
const page = await client.list({ page: 0, query: "" });
expect(page).toMatchObject({ total: 2, hasMore: false, page: 0 });
expect(page.skills[0]).toMatchObject({ source: "owner/repo", skillId: "review", installs: 42 });

const detail = await client.getDetail(page.skills[0]);
expect(detail.markdown).toContain("# Review");
expect(detail.files).toContainEqual({ relativePath: "SKILL.md", contents: expect.any(String) });
```

Assert search uses `/api/search?q=...`, all-time uses `/api/skills/all-time/<page>`, detail uses `/api/download/<owner>/<repo>/<skillId>`, stale cache is returned after a network failure, and absolute/parent paths are rejected.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/core/skills-sh.test.ts`

Expected: FAIL because `SkillsShClient` does not exist.

- [ ] **Step 3: Implement the client**

Expose:

```ts
export interface SkillsShEntry {
  id: string;
  source: string;
  owner: string;
  repo: string;
  skillId: string;
  name: string;
  installs: number;
  url: string;
}

export class SkillsShClient {
  list(input: { page: number; query: string }): Promise<SkillsShPage>;
  getDetail(entry: SkillsShEntry): Promise<SkillsShDetail>;
}
```

Use a 15-minute JSON response cache at an injected cache path. Never send credentials. If a request fails and any cached value exists, return it with `stale: true`; otherwise surface a concise retryable error.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx vitest run src/core/skills-sh.test.ts`

Expected: PASS.

Commit:

```bash
git add src/core/skills-sh.ts src/core/skills-sh.test.ts
git commit -m "feat: add skills discovery client"
```

### Task 4: SkillService, sync, and IPC migration

**Files:**
- Modify: `src/main/services/skill-service.test.ts`
- Modify: `src/main/services/skill-service.ts`
- Modify: `src/core/skill-sync.test.ts`
- Modify: `src/core/skill-sync.ts`
- Modify: `src/shared/ipc/skills.ts`
- Modify: `src/main/ipc/skills.ts`
- Modify: `src/preload/skills.ts`
- Modify: `src/main/skill-sync-ipc.test.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Write failing orchestration tests**

Assert that `listSkills()` reads the managed library, `listImportCandidates()` reads legacy roots, imported usage aggregates across agents, a downloaded remote version enters the library without target installation, and discovery delegates to `SkillsShClient`.

Extend IPC expectations with:

```ts
await api.listSkillImportCandidates();
await api.importLocalSkills(["/tmp/review/SKILL.md"]);
await api.updateManagedSkillTargets("review", ["codex", "trae"]);
await api.listDiscoveredSkills({ page: 0, query: "review" });
await api.getDiscoveredSkill("owner/repo/review");
await api.importDiscoveredSkill("owner/repo/review");
```

Malformed arrays, IDs, targets, negative pages, NUL paths, and extra arguments must throw `IpcInputError` before reaching the service.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/main/services/skill-service.test.ts src/core/skill-sync.test.ts src/main/skill-sync-ipc.test.ts`

Expected: FAIL on the new methods/contracts.

- [ ] **Step 3: Migrate service and sync identity**

Inject these dependencies from `src/main/index.ts`:

```ts
libraryRoot: path.join(app.getPath("userData"), "skills"),
skillsShCachePath: path.join(app.getPath("userData"), "cache", "skills-sh.json"),
homeDir: os.homedir(),
codexHome: process.env.CODEX_HOME,
```

Build sync relations only from managed Skills. New uploads use `portable_scope = "agent-recall"` and `relative_path = managedId`. Remote downloads call `ManagedSkillLibrary.importFiles` and persist the binding against the managed `SKILL.md`; they do not create an Agent target link.

- [ ] **Step 4: Register and expose validated IPC methods**

Add contracts for candidate listing, batch import, target update, discovery page, discovery detail, and discovery import. Keep existing upload/version/Diff APIs so renderer migration does not remove current capabilities.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npx vitest run src/main/services/skill-service.test.ts src/core/skill-sync.test.ts src/main/skill-sync-ipc.test.ts`

Expected: PASS.

Commit:

```bash
git add src/main/services/skill-service.ts src/main/services/skill-service.test.ts src/core/skill-sync.ts src/core/skill-sync.test.ts src/shared/ipc/skills.ts src/main/ipc/skills.ts src/preload/skills.ts src/main/skill-sync-ipc.test.ts src/main/index.ts
git commit -m "feat: make skill library the sync source"
```

### Task 5: MAC-style installed Skill page

**Files:**
- Create: `src/renderer/src/features/skills/skill-library-list.tsx`
- Create: `src/renderer/src/features/skills/skill-library-detail.tsx`
- Create: `src/renderer/src/features/skills/skill-sync-panel.tsx`
- Rewrite: `src/renderer/src/features/skills/skills-page.tsx`
- Modify: `src/renderer/src/skill-manager.ts`
- Modify: `src/renderer/src/skill-manager.test.ts`
- Modify: `src/renderer/src/skills-dialog-actions.test.ts`

- [ ] **Step 1: Write failing renderer behavior tests**

Render the page with synthetic managed Skills and assert visible product behavior rather than implementation strings:

```ts
expect(html).toContain("Skill 库");
expect(html).toContain("发现 Skill");
expect(html).toContain("导入本机 Skill");
expect(html).toContain("Codex");
expect(html).toContain("Claude Code");
expect(html).toContain("Trae");
expect(html).toContain("使用 12 次");
```

Assert the primary list excludes remote-only records, source filters operate on managed origins, and sync/version/Diff remain available inside the selected Skill detail.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/renderer/src/skill-manager.test.ts src/renderer/src/skills-dialog-actions.test.ts`

Expected: FAIL because the current page is directory/source-first.

- [ ] **Step 3: Build focused components**

Keep `SkillsPage` responsible only for selection, search/filter state, and dialog visibility. Put list rendering, target controls, and sync state into their named components. Use the MAC hierarchy:

```text
┌ Search / origin filter ┐ ┌ Skill name · source · actions ┐
│ Skill rows             │ │ Codex  Claude Code  Trae      │
│ name · description     │ │ Description / Markdown        │
│ usage · install dots   │ │ ▸ Cloud sync & versions       │
└────────────────────────┘ └────────────────────────────────┘
```

When batch checkboxes are selected, show a compact contextual bar for upload; do not return cloud actions to the global toolbar.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx vitest run src/renderer/src/skill-manager.test.ts src/renderer/src/skills-dialog-actions.test.ts src/renderer/src/skill-sync-view-model.test.ts`

Expected: PASS.

Commit:

```bash
git add src/renderer/src/features/skills src/renderer/src/skill-manager.ts src/renderer/src/skill-manager.test.ts src/renderer/src/skills-dialog-actions.test.ts
git commit -m "feat: redesign installed skills page"
```

### Task 6: Local import and skills.sh discovery dialogs

**Files:**
- Create: `src/renderer/src/features/skills/skill-import-dialog.tsx`
- Create: `src/renderer/src/features/skills/skill-discovery-dialog.tsx`
- Create: `src/renderer/src/features/skills/skill-dialogs.test.tsx`
- Modify: `src/renderer/src/features/skills/skills-page.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Write failing dialog flow tests**

Test that local candidates support selection and batch import; the discovery dialog renders ranks and install counts, loads the next page, searches only after submission, previews downloaded Markdown, imports with “加入 Skill 库”, closes, and selects the imported Skill.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/renderer/src/features/skills/skill-dialogs.test.tsx`

Expected: FAIL because both dialogs are missing.

- [ ] **Step 3: Implement dialogs and App wiring**

Keep network and filesystem work behind `window.sessionSearch`. Dialog errors stay inside the dialog with a retry action. An import success calls one `onLibraryChanged(managedId)` callback so `App.tsx` refreshes once and `SkillsPage` restores selection.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx vitest run src/renderer/src/features/skills/skill-dialogs.test.tsx src/renderer/src/skills-load.test.ts`

Expected: PASS.

Commit:

```bash
git add src/renderer/src/features/skills/skill-import-dialog.tsx src/renderer/src/features/skills/skill-discovery-dialog.tsx src/renderer/src/features/skills/skill-dialogs.test.tsx src/renderer/src/features/skills/skills-page.tsx src/renderer/src/App.tsx
git commit -m "feat: add skill import and discovery"
```

### Task 7: Visual integration, release note, and full verification

**Files:**
- Rewrite: `src/renderer/src/styles/skills-page.css`
- Modify: `src/renderer/src/styles/skills.css`
- Modify: `.release-notes/main-2-0.md`
- Modify: affected renderer source-based style tests
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/workbench-ui.test.ts`

- [ ] **Step 1: Add failing layout assertions**

Assert a stable two-column grid, independently scrolling list/detail regions, a horizontal install-target rail, a large dialog workspace, visible focus styles, reduced-motion handling, and responsive collapse below the existing compact breakpoint.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/renderer/src/skills-dialog-actions.test.ts src/renderer/src/features/skills/skill-dialogs.test.tsx`

Expected: FAIL on the new class/layout requirements.

- [ ] **Step 3: Implement the visual system and remove obsolete CSS**

Continue the existing Geist/Geist Mono palette. Use list density and the installation target rail as the distinctive element; avoid dashboard KPI cards, decorative gradients, and permanent third columns. Ensure dialogs fit the Electron viewport and both panels scroll independently.

- [ ] **Step 4: Update the single branch release note**

Add user-facing bullets under `.release-notes/main-2-0.md` describing the managed Skill library, explicit local import, multi-Agent installation, and `skills.sh` discovery. Keep exactly one release-note file for this branch.

- [ ] **Step 5: Keep ordinary startup and activation on Workbench**

First extend `workbench-ui.test.ts` so it fails while the generic `showWindow()` path emits `focus-search`. Then change the main-process window API to make search focus explicit:

```ts
function showWindow(options: { focusSearch?: boolean } = {}): void {
  if (!mainWindow) createWindow();
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
  if (options.focusSearch) mainWindow.webContents.send("focus-search");
}
```

Call `showWindow({ focusSearch: true })` only from the registered global search shortcut. Keep `app.activate`, second-instance handling, Settings, and ordinary window restoration on plain `showWindow()`; the renderer already initializes `activePage` to `workbench`.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
npx vitest run src/core/managed-skill-library.test.ts src/core/skills-sh.test.ts src/main/services/skill-service.test.ts src/main/skill-sync-ipc.test.ts src/renderer/src/features/skills/skill-dialogs.test.tsx
npm test
npm run build
npm run release-note:check
git diff --check
```

Expected: every command exits 0 with no failed tests or TypeScript errors.

- [ ] **Step 7: Run a safe package smoke test**

Use the repository smoke test, which must build/install under temporary HOME and npm prefix:

```bash
npm run package:smoke
```

Expected: packaged CLI verification passes and temporary files/processes are cleaned.

- [ ] **Step 8: Inspect the running Electron UI**

Start or restart the development app only after confirming no unrelated user process would be terminated. Verify installed list, empty state, local import, discovery/search/detail, target conflict feedback, sync details, dark/light themes, and keyboard focus. Stop only test-owned processes.

- [ ] **Step 9: Commit the completed UI**

```bash
git add src/renderer/src/styles/skills-page.css src/renderer/src/styles/skills.css .release-notes/main-2-0.md
git commit -m "feat: complete managed skill library"
```
