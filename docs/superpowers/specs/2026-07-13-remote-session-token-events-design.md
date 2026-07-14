# Remote Session Token Events Design

## Goal

Include SSH remote-session token usage in Today, 7-day, 30-day, and All-time session statistics without double-counting sessions mirrored across environments or sources.

## Data Flow

The SSH summary collector will emit the same logical token events as the local session loader. Each event contains a timestamp, a stable deduplication key, and the input, output, cached-input, reasoning-output, and total token counts.

`RemoteSessionSummaryPayload` will carry these events alongside the existing aggregate `tokenUsage`. During lightweight remote sync, `SessionStore.upsertIndexedSessionSummary` will update the session summary and replace that session's token events in one transaction. Existing statistics queries can then apply their current time-range filtering and cross-source deduplication unchanged.

## Compatibility

The `tokenEvents` field is optional on the wire. An older summary without the field preserves any already-indexed token events. A new summary with an empty array explicitly replaces the stored events with an empty set.

Wire records are validated before indexing. Invalid event shapes reject the remote sync using the existing invalid-payload error path.

## Accounting Rules

- Codex cumulative totals are converted into timestamped deltas, matching the local loader.
- Claude assistant usage records use message or row identifiers for stable deduplication, matching the local loader.
- When token events are present, the stored session aggregate is derived from the normalized events so detail and statistics remain consistent.
- The existing global `dedupe_key` ranking remains responsible for suppressing mirrored local and remote events.

## Testing

Regression tests will cover remote event parsing and storage, period filtering, All-time totals when local events also exist, mirrored-event deduplication, malformed wire events, and compatibility with summaries that omit `tokenEvents`.

No database migration or renderer change is required.
