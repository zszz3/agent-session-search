# Hide Subagent Sessions Design

## Goal

Add a persisted Settings toggle that excludes subagent sessions from every user-visible session collection while keeping those sessions indexed. Turning the toggle off must restore them immediately without a rescan.

## User Experience

- Add `Hide subagent sessions / 隐藏 Subagent 会话` to Settings.
- The setting defaults to `true`, so subagent sessions are hidden unless the user explicitly chooses to show them.
- When enabled, subagent sessions are excluded from:
  - the session list and text search results;
  - pagination totals;
  - project session counts and project ordering activity;
  - global and per-source session, message, and token statistics;
  - in-app AI session-finder queries that use the same store search path.
- The setting only controls visibility. Subagent sessions remain indexed and can become visible immediately when the setting is disabled.

## Session Relationship Model

Extend `IndexedSession` with:

```ts
isSubagent: boolean;
parentSessionId: string | null;
```

The SQLite `sessions` table stores matching columns:

```sql
is_subagent INTEGER NOT NULL DEFAULT 0,
parent_session_id TEXT
```

`parent_session_id` stores the source-native raw parent ID rather than a `session_key`. It is not a foreign key because the parent may belong to another environment, may not have been indexed yet, or may be unavailable. No dedicated boolean index is required initially; add one only if query profiling shows a benefit.

Existing database rows initially receive SQLite's safe `is_subagent = 0` default. When the relationship columns are first added, the migration marks existing Claude and Codex session file snapshots stale so the next startup index refresh reparses them and backfills the correct relationship metadata. This avoids leaving previously indexed Codex subagents visible under the default-on setting.

## Detection Rules

Detection uses structured metadata only. Titles, prompts, and other conversation text are never inspected to infer a relationship.

### Codex

Prefer the current structured source metadata:

```ts
payload.source.subagent.thread_spawn.parent_thread_id
```

When present, the session is a subagent and that value is its parent session ID. Support the older shape as a fallback:

```ts
payload.thread_source === "subagent" && payload.parent_thread_id
```

Do not classify using `originator`, `session_id`, or `forked_from_id` alone. Those fields can also occur on non-subagent sessions.

### Claude

A Claude JSONL under a `subagents` directory, or a conversation row with `isSidechain === true`, is a subagent. Its `sessionId` identifies the parent session. The loader may use the directory immediately above `subagents` as a fallback parent ID when the structured field is unavailable.

Claude subagent files should be discovered as separate indexed sessions so the setting has consistent meaning across supported sources. They use their own agent ID for `rawId` and inherit the parent session's project path when the row does not provide one.

### Other Sources

Other source formats remain root sessions until they expose an explicit, tested relationship marker. No title- or path-name heuristics should be added beyond Claude's documented `subagents` storage layout.

## Query Design

The store remains independent of application settings. Add an optional `excludeSubagents` query option to the relevant store entry points:

- `SearchOptions` / `searchSessionPage` and `searchSessions`;
- `SessionStatsOptions` / `getStats` and its aggregate helpers;
- `listProjects` through a small project-query options type.

When `excludeSubagents` is true, SQL applies:

```sql
sessions.is_subagent = 0
```

The predicate must be applied before counting, grouping, pagination, FTS candidate selection, message aggregation, and token aggregation. Renderer-side filtering is explicitly insufficient because it would produce incorrect totals and partially filled pages.

The main process reads `hideSubagentSessions` from `AppSettings` and injects `excludeSubagents` into IPC-backed searches, project queries, stats queries, and other in-app searches. Renderer callers do not duplicate the setting value in each request.

Direct session lookup by key remains unfiltered. Actions already holding a concrete session key must continue to work, and disabling the setting must not require rebuilding the index.

## Settings Flow

Add `hideSubagentSessions: boolean` to `AppSettings`, `AppSettingsUpdate`, and `defaultSettings` with a default of `true`. The existing settings store persists it. Existing saved settings that lack the field inherit `true` through the normal settings merge.

When the renderer saves a changed value, it reloads in parallel:

- the current session page;
- sidebar project metadata;
- statistics.

It does not trigger `refreshIndex`, because the indexed relationship metadata is independent of visibility.

## Database and Indexing Flow

1. A source loader derives `isSubagent` and `parentSessionId` from source metadata.
2. `upsertIndexedSession` writes both fields on insert and conflict update.
3. All session data, messages, traces, and token events continue to be indexed.
4. Query entry points receive `excludeSubagents` from the main process.
5. SQL excludes subagents before results and aggregates are calculated.

Remote session loading must preserve the two relationship fields when remote payloads contain them. Older remote payloads without the fields default to a root session, preserving backward compatibility.

## Error Handling and Compatibility

- Missing or malformed relationship metadata produces a root session rather than dropping the session.
- An absent parent session does not prevent indexing a subagent.
- Existing databases migrate with additive columns and a one-time relationship metadata reparse, not a destructive rebuild.
- Existing saved settings without `hideSubagentSessions` receive the default value of `true`.
- Older remote snapshots without relationship fields remain readable.

## Testing

### Loader tests

- Current and legacy Codex subagent metadata are detected.
- `forked_from_id`, `originator`, or `session_id` alone do not cause false positives.
- Claude `subagents` paths and `isSidechain` rows are detected and linked to their parent.
- Malformed metadata falls back to a root session.

### Store tests

- Schema migration adds both columns with safe defaults.
- Upsert persists and updates relationship metadata.
- Search results, total count, project counts, project activity, message totals, and token totals exclude subagents when requested.
- Direct lookup still returns a hidden-by-setting subagent.
- The same queries include subagents when the option is false or absent.

### Settings and integration tests

- The setting defaults to true and survives persistence/merge.
- The Settings toggle saves the value.
- Changing the toggle reloads sessions, projects, and stats without refreshing the index.
- Main-process IPC and in-app AI searches inject the stored setting consistently.

## Out of Scope

- Rendering a parent/subagent tree.
- Expanding subagent messages inside the parent detail view.
- Filtering subagents by role, depth, or status.
- Deleting subagent data when hidden.
- Inferring subagents from conversation text.
