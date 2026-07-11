# Clear Search Auto Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the unfiltered session list immediately when the user clears a previously non-empty search input.

**Architecture:** Keep the existing split between the `SearchBox` local draft and the App-level submitted query. Add one narrow transition in `handleChange`: submit an empty query only when the previous local value was non-empty and the next value is empty.

**Tech Stack:** React 19, TypeScript, Vitest

## Global Constraints

- Non-empty typing must continue to avoid App-level searches until Enter is pressed.
- Automatic reset must not write to search history.
- An already-empty search box must not submit another empty query.
- Do not add dependencies or refactor unrelated search behavior.

---

### Task 1: Reset the submitted query when the input is cleared

**Files:**
- Modify: `src/renderer/src/App.tsx:365-369`
- Test: `src/renderer/src/app-loading.test.ts:14-26`

**Interfaces:**
- Consumes: `SearchBox` local `value: string` and `onSearch: (value: string) => void`.
- Produces: `handleChange(next: string): void`, which calls `onSearch("")` only for a non-empty-to-empty transition.

- [ ] **Step 1: Write the failing regression assertion**

Extend the existing Enter-search test with a focused `handleChange` source slice:

```ts
const handleChange = searchBox.slice(searchBox.indexOf("function handleChange"), searchBox.indexOf("function selectRecentSearch"));
expect(handleChange).toContain('if (value.length > 0 && next.length === 0) onSearch("")');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/renderer/src/app-loading.test.ts`

Expected: FAIL because `handleChange` does not contain the empty-transition `onSearch("")` call.

- [ ] **Step 3: Implement the minimal transition**

Change `handleChange` to:

```ts
function handleChange(next: string): void {
  if (value.length > 0 && next.length === 0) onSearch("");
  setValue(next);
  setFocused(true);
}
```

- [ ] **Step 4: Run focused and full verification**

Run these commands in order:

```bash
npm test -- --run src/renderer/src/app-loading.test.ts
npm test
npm run typecheck
npm run build
```

Expected: every command exits with code 0; the focused suite reports 4 passing tests.

- [ ] **Step 5: Commit the behavior change**

```bash
git add src/renderer/src/App.tsx src/renderer/src/app-loading.test.ts docs/superpowers/plans/2026-07-11-clear-search-auto-reset.md
git commit -m "feat: reset search when input is cleared"
```
