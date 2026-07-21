# Compact Runtime Config Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the duplicated global Runtime configuration row and let users select concise, Runtime-scoped configurations from the editor header.

**Architecture:** Keep the existing channel records and selection callbacks unchanged. `RuntimePage` will render `selectedRuntimeChannels` in a compact picker beside the active Runtime badge, so changing Runtime remains owned by the existing Runtime tabs and changing configuration remains scoped to that Runtime.

**Tech Stack:** React, TypeScript, CSS, Vitest, React server rendering

---

### Task 1: Move configuration selection into the Runtime editor header

**Files:**
- Modify: `src/automation/engine/renderer/src/pages/runtime/RuntimePage.test.ts`
- Modify: `src/automation/engine/renderer/src/pages/runtime/RuntimePage.tsx`
- Modify: `src/renderer/src/styles/automation.css`

- [ ] **Step 1: Write the failing component test**

Replace the existing selector test with assertions that the global toolbar is gone, the editor header contains one compact picker, only Codex configurations appear while Codex is active, and option copy contains only the configuration label.

```ts
const configSelect = markup.match(/<select aria-label="选择配置".*?<\/select>/)?.[0] ?? "";
expect(markup).not.toContain('class="runtime-config-toolbar"');
expect(markup).toContain('class="runtime-editor-config"');
expect(configSelect.match(/<option/g)).toHaveLength(1);
expect(configSelect).toContain(">Codex OpenAI</option>");
expect(configSelect).not.toContain("Claude Code");
expect(configSelect).not.toContain("Codex · Codex OpenAI · OpenAI");
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run: `npx vitest run src/automation/engine/renderer/src/pages/runtime/RuntimePage.test.ts`

Expected: FAIL because `runtime-config-toolbar` still exists and the selector still lists every Runtime with the three-part label.

- [ ] **Step 3: Implement the scoped picker**

Delete the top-level `runtime-config-toolbar`. In `runtime-editor-actions`, render a left-side `runtime-editor-config` group containing the existing Runtime badge, a select bound to `selectedRuntimeChannelId`, and the existing add/delete controls. Populate it from `selectedRuntimeChannels` and render `channel.label || channel.id` for each option. Keep import and test controls in the right-side `config-plugin-actions` group.

```tsx
<div className="runtime-editor-config">
  <span className={`agent-badge mini ${agentAccent(selectedRuntime)}`}>{agentLabel(selectedRuntime)}</span>
  <select aria-label={selectConfigText} value={selectedRuntimeChannelId} onChange={(event) => void onSelectChannel(event.target.value)}>
    {selectedRuntimeChannels.map((channel) => (
      <option key={channel.id} value={channel.id}>{channel.label || channel.id}</option>
    ))}
  </select>
  <button className="icon-btn" type="button" aria-label={addConfigText} title={addConfigText} onClick={onAddConfig}>
    <Plus size={13} />
  </button>
  <button className="icon-btn" type="button" aria-label={deleteConfigText} title={deleteConfigText} disabled={!selectedRuntimeChannelId || visibleRuntimeChannels.length <= 1} onClick={() => onDeleteConfig(selectedRuntimeChannelId)}>
    <Trash2 size={13} />
  </button>
</div>
```

Update AgentRecall's Runtime overrides so the header is a wrapping flex row, the picker can shrink without overflow, and its select keeps a compact desktop width.

```css
.automation-runtime-content .runtime-editor-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
}

.automation-runtime-content .runtime-editor-config {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.automation-runtime-content .runtime-editor-config select {
  width: clamp(140px, 24vw, 260px);
  min-width: 0;
}
```

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run src/automation/engine/renderer/src/pages/runtime/RuntimePage.test.ts`

Expected: PASS.

### Task 2: Document and verify the user-visible change

**Files:**
- Modify: `.release-notes/main-2-0.md`

- [ ] **Step 1: Update the existing branch release note**

Add this user-facing fix under `## Bug 修复`:

```md
- 精简 Runtime 配置选择：执行器与配置不再重复展示，配置下拉只显示当前 Runtime 的可用配置。
```

- [ ] **Step 2: Run complete verification**

Run:

```bash
npm run typecheck
npm test
npm run build
npm run release-note:check
git diff --check
```

Expected: every command exits with code 0; Vitest and script tests report zero failures.

- [ ] **Step 3: Commit the implementation when requested**

```bash
git add .release-notes/main-2-0.md src/automation/engine/renderer/src/pages/runtime/RuntimePage.test.ts src/automation/engine/renderer/src/pages/runtime/RuntimePage.tsx src/renderer/src/styles/automation.css
git commit -m "fix: simplify runtime configuration picker"
```
