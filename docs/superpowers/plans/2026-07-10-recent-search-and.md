# Recent Search and Explicit AND Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local recent-search history and make standalone case-insensitive `AND` equivalent to the existing implicit AND search.

**Architecture:** A focused renderer helper owns history normalization and resilient localStorage access. `SearchBox` owns the dropdown and two-step Enter state, while `SessionStore` normalizes explicit AND before its existing FTS and fallback matching paths.

**Tech Stack:** TypeScript, React, SQLite FTS5, localStorage, Vitest

---

### Task 1: Normalize explicit AND in core search

**Files:**
- Modify: `src/core/session-store.ts`
- Test: `src/core/session-store.test.ts`

- [ ] **Step 1: Add failing search behavior tests**

Insert sessions containing only `login`, only `expired`, both terms, and `android`. Assert:

```ts
expect(store.searchSessions({ query: "login AND expired" }).map((item) => item.sessionKey)).toEqual(["codex:both"]);
expect(store.searchSessions({ query: "login and expired" }).map((item) => item.sessionKey)).toEqual(["codex:both"]);
expect(store.searchSessions({ query: "login expired" }).map((item) => item.sessionKey)).toEqual(["codex:both"]);
expect(store.searchSessions({ query: "android" }).map((item) => item.sessionKey)).toEqual(["codex:android"]);
expect(store.searchSessionPage({ query: "AND" }).totalCount).toBe(4);
```

- [ ] **Step 2: Run the focused store test and verify failure**

Run: `npm test -- src/core/session-store.test.ts`

Expected: explicit AND cases fail because `AND` is currently treated as a search token.

- [ ] **Step 3: Implement standalone AND normalization**

Add:

```ts
function normalizeExplicitAnd(query: string): string {
  return query
    .split(/\s+/u)
    .filter((token) => token.toLocaleLowerCase() !== "and")
    .join(" ")
    .trim();
}
```

Use it once at the start of `searchSessionPage`:

```ts
const query = normalizeExplicitAnd(options.query?.trim() || "");
```

Pass the normalized query through FTS, candidate matching, snippets, and scoring. The original `SearchOptions` remains unchanged.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- src/core/session-store.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit core search behavior**

```bash
git add src/core/session-store.ts src/core/session-store.test.ts
git commit -m "feat: support explicit AND searches"
```

### Task 2: Add resilient local recent-search storage

**Files:**
- Create: `src/renderer/src/search-history.ts`
- Create: `src/renderer/src/search-history.test.ts`

- [ ] **Step 1: Write failing pure helper tests**

Cover malformed JSON, non-array values, non-string entries, whitespace-only input, deduplication/move-to-front, the 10-entry cap, deletion, clearing, and a storage implementation whose `setItem` throws.

Use the interface:

```ts
export interface SearchHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
```

- [ ] **Step 2: Run the helper test and verify failure**

Run: `npm test -- src/renderer/src/search-history.test.ts`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement history helpers**

Export:

```ts
export const SEARCH_HISTORY_STORAGE_KEY = "agent-session-search-recent-searches";
export const SEARCH_HISTORY_LIMIT = 10;
export function readSearchHistory(storage: SearchHistoryStorage): string[];
export function recordSearch(storage: SearchHistoryStorage, current: string[], query: string): string[];
export function deleteSearch(storage: SearchHistoryStorage, current: string[], query: string): string[];
export function clearSearchHistory(storage: SearchHistoryStorage): string[];
```

Every write helper returns the in-memory next state even if persistence throws. `readSearchHistory` catches read/parse errors and returns `[]`.

- [ ] **Step 4: Run helper tests**

Run: `npm test -- src/renderer/src/search-history.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the storage module**

```bash
git add src/renderer/src/search-history.ts src/renderer/src/search-history.test.ts
git commit -m "feat: store recent searches locally"
```

### Task 3: Add the history dropdown and two-step Enter behavior

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`
- Test: `src/renderer/src/app-loading.test.ts`
- Test: `src/renderer/src/style-contract.test.ts`

- [ ] **Step 1: Add failing renderer contract tests**

Assert `SearchBox` imports and uses `readSearchHistory`, `recordSearch`, `deleteSearch`, and `clearSearchHistory`; renders `recent-search-dropdown`, `recent-search-item`, and clear/delete actions; cancels the debounce and calls `onQueryChange(value)` on first Enter; calls `onSubmit()` only for the same submitted value or an empty input; and immediately commits a clicked history item.

- [ ] **Step 2: Run renderer tests and verify failure**

Run: `npm test -- src/renderer/src/app-loading.test.ts src/renderer/src/style-contract.test.ts`

Expected: FAIL because the history UI is absent.

- [ ] **Step 3: Implement SearchBox history state**

Add local state:

```ts
const [history, setHistory] = useState(() => readSearchHistory(window.localStorage));
const [focused, setFocused] = useState(false);
const [lastSubmitted, setLastSubmitted] = useState("");
```

On typing, reset `lastSubmitted` when the trimmed value changes. On Enter:

```ts
const trimmed = value.trim();
if (!trimmed || trimmed === lastSubmitted) {
  onSubmit();
  return;
}
cancelPendingCommit();
onQueryChange(value);
setHistory((current) => recordSearch(window.localStorage, current, value));
setLastSubmitted(trimmed);
setFocused(false);
```

History selection sets the displayed value, commits immediately, records/moves it to the front, marks it submitted, and closes the dropdown. Use `onMouseDown={(event) => event.preventDefault()}` on the dropdown so its controls run before input blur.

- [ ] **Step 4: Add compact dropdown styles**

Anchor the dropdown below `.searchbox`, use the existing surface/border variables, constrain its height with scrolling, truncate long queries, and keep delete/clear actions keyboard accessible. Add a dark/light compatible hover state using existing CSS variables.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- src/renderer/src/app-loading.test.ts src/renderer/src/style-contract.test.ts src/renderer/src/search-history.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit renderer behavior**

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css src/renderer/src/app-loading.test.ts src/renderer/src/style-contract.test.ts
git commit -m "feat: add recent search dropdown"
```

### Task 4: Final verification

**Files:**
- Verify all changed files

- [ ] **Step 1: Run full verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: all tests pass and production build succeeds.

- [ ] **Step 2: Inspect scope and sensitive information**

Run:

```bash
git diff --check
git status --short
git diff --stat main...HEAD
git diff --unified=0 main...HEAD | rg -i '^\+.*(bytedance|byte\.com|code\.byted\.org)' || true
```

Expected: no whitespace errors, only scoped changes, and no newly introduced company information.
