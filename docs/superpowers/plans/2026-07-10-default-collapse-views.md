# Default-Collapsed Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sidebar Views section collapsed by default while preserving explicit saved preferences.

**Architecture:** Change the single default-state constant used by missing and invalid persisted state. Update existing unit expectations first so the behavior is verified through the same public parsing function used by the app.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Change the Views default

**Files:**
- Modify: `src/renderer/src/sidebar-sections.test.ts`
- Modify: `src/renderer/src/sidebar-sections.ts`

- [ ] Update the no-state, missing-field, and invalid-JSON test expectations from `views: true` to `views: false`; add an assertion that explicit `{ views: true }` remains true.
- [ ] Run `npx vitest run src/renderer/src/sidebar-sections.test.ts` and confirm it fails because the current default is still true.
- [ ] Change only `DEFAULT_SIDEBAR_SECTIONS.views` from `true` to `false`.
- [ ] Re-run the focused test and confirm all sidebar-section tests pass.
- [ ] Run `npm test && npm run build && git diff --check`, then scan the diff for sensitive or unrelated content.
- [ ] Commit with `feat: collapse views section by default`.
