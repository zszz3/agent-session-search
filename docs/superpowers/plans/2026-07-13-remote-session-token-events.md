# Remote Session Token Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include SSH remote-session token events in every session-token statistics period while retaining cross-source deduplication and old-wire compatibility.

**Architecture:** Extend lightweight remote summaries with validated `TokenUsageEvent` records. Persist those records through the existing `token_events` table in the same transaction as the session summary, then reuse the existing timestamp filtering and global deduplication queries unchanged. Update the embedded Python collector to mirror the local Codex and Claude token-event extraction rules.

**Tech Stack:** TypeScript, Node SQLite, embedded Python 3 collector, Vitest.

---

### Task 1: Persist remote summary token events

**Files:**
- Modify: `src/core/remote-sync.test.ts`
- Modify: `src/core/remote-sync.ts`
- Modify: `src/core/session-store.ts`

- [x] **Step 1: Write failing remote-statistics and compatibility tests**

Add tests that send a lightweight summary containing two timestamped `tokenEvents`, assert Today and All-time totals, insert a local mirror with the same dedupe key to assert global deduplication, and resync an old summary without `tokenEvents` to assert existing events are preserved. Add a separate invalid-payload test with a string timestamp and assert the sync rejects with a `tokenEvents` error.

```ts
const tokenEvents = [
  {
    timestamp: new Date("2026-06-04T10:01:00Z").getTime(),
    dedupeKey: "codex-total:gpt-5:one",
    inputTokens: 80,
    outputTokens: 20,
    cachedInputTokens: 10,
    reasoningOutputTokens: 5,
    totalTokens: 115,
  },
  {
    timestamp: new Date("2026-05-01T10:01:00Z").getTime(),
    dedupeKey: "codex-total:gpt-5:old",
    inputTokens: 30,
    outputTokens: 10,
    cachedInputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 40,
  },
];

expect(store.getStats({ period: "today" }, now).total.totalTokens).toBe(115);
expect(store.getStats({ period: "allTime" }, now).total.totalTokens).toBe(155);
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/core/remote-sync.test.ts`

Expected: FAIL because `parseRemoteSummaryRecord` discards `tokenEvents`, so the remote totals are absent from period statistics and malformed events are not rejected.

- [x] **Step 3: Extend the wire type and validate events**

Import `TokenUsageEvent`, add `tokenEvents?: TokenUsageEvent[]` to `RemoteSessionSummaryPayload`, and parse the optional array strictly. Each item must be an object with a finite non-negative timestamp, non-empty dedupe key, finite non-negative token buckets, and a total equal to the sum of the buckets.

```ts
function tokenEventsField(value: Record<string, unknown>, key: string, lineNumber: number): TokenUsageEvent[] | undefined {
  const raw = value[key];
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error(`Invalid remote payload at line ${lineNumber}: invalid tokenEvents`);
  return raw.map((item, index) => parseTokenEvent(item, lineNumber, index));
}
```

Pass the parsed field through `parseRemoteSummaryRecord` and `syncRemoteEnvironment`.

- [x] **Step 4: Store summary events transactionally**

Change the method signature to:

```ts
upsertIndexedSessionSummary(session: IndexedSession, messageCount: number, tokenEvents?: TokenUsageEvent[]): void
```

When the argument is defined, normalize it, derive the session aggregate from those events, delete the session's previous `token_events`, and insert the replacements inside the existing summary transaction. When it is undefined, retain existing events and use `session.tokenUsage`, preserving compatibility with older summaries.

- [x] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- src/core/remote-sync.test.ts`

Expected: PASS.

### Task 2: Emit local-parity events from the SSH collector

**Files:**
- Modify: `src/core/remote-sync.test.ts`
- Modify: `src/core/remote-sync.ts`

- [x] **Step 1: Write a failing collector integration test**

Capture and decode the Python collector command, execute it with a temporary HOME containing a Codex JSONL session with two cumulative token-count rows, and assert the emitted summary contains two events with the original timestamps, stable `codex-total` keys, delta totals, and an aggregate equal to the final cumulative total.

```ts
expect(summary.tokenEvents).toHaveLength(2);
expect(summary.tokenEvents.map((event) => event.totalTokens)).toEqual([130, 70]);
expect(summary.tokenUsage.totalTokens).toBe(200);
```

Use `fs.rmSync(tempHome, { recursive: true, force: true })` in `finally`.

- [x] **Step 2: Run the collector test and verify RED**

Run: `npm test -- src/core/remote-sync.test.ts -t "emits timestamped remote token events"`

Expected: FAIL because the collector currently emits only aggregate `tokenUsage`.

- [x] **Step 3: Add timestamped event construction to the Python collector**

Add a timestamp parser equivalent to the TypeScript loader, store full event records in `_tok_put`, and make Codex choose cumulative delta events when available or last-usage events otherwise. Match the local dedupe keys exactly:

```python
key = "codex-total:%s:%s:%s:%s:%s:%s" % (
  model, timestamp, current["inputTokens"], current["outputTokens"],
  current["cachedInputTokens"], current["reasoningOutputTokens"]
)
```

For Claude, attach the row timestamp to the existing `claude-code:<message-or-row-id>` event. Emit both `tokenUsage` and `tokenEvents` from `emit_codex_summary` and `emit_claude_summary`.

- [x] **Step 4: Run the focused collector test and verify GREEN**

Run: `npm test -- src/core/remote-sync.test.ts -t "emits timestamped remote token events"`

Expected: PASS.

### Task 3: Verify the complete change

**Files:**
- Modify: `docs/superpowers/plans/2026-07-13-remote-session-token-events.md`

- [x] **Step 1: Run all remote and store tests**

Run: `npm test -- src/core/remote-sync.test.ts src/core/session-store.test.ts src/core/remote-session-loader.test.ts`

Expected: all tests pass with no warnings.

- [x] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all tests pass.

- [x] **Step 3: Run type checking and production build**

Run: `npm run build`

Expected: TypeScript, MCP bundle, main/preload, and renderer builds succeed.

- [x] **Step 4: Check the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only the planned source, test, and plan files are modified.

- [x] **Step 5: Commit the implementation**

```bash
git add src/core/remote-sync.ts src/core/remote-sync.test.ts src/core/session-store.ts docs/superpowers/plans/2026-07-13-remote-session-token-events.md
git commit -m "fix: count remote session token usage"
```
