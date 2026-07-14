# Remote Message Statistics and Source Grouping Design

## Goal

Count SSH remote-session messages in Today, 7-day, 30-day, and All-time usage statistics, display the full conversation message count in detail views, and avoid duplicate Codex or Claude rows in the usage breakdown.

## Message Events

Remote lightweight summaries will carry one compact message event per visible message. Each event contains only its filtered message index and timestamp; message roles and content are not transferred.

The collector will use the same visible-message filtering rules as the local format adapters. Its `messageCount` will be derived from the emitted events, keeping summary counts, paged detail messages, and statistics consistent.

## Persistence and Statistics

A `message_events` table will store timestamp metadata for both local and remote indexed messages. Full local or hydrated remote indexing derives events from the existing `SessionMessage` records. Lightweight remote summary indexing writes the collector's metadata events without storing message content.

Ranged usage statistics will count `message_events` by timestamp. All-time statistics will continue to use the stored session message total, with event-backed counting available for deduplication where appropriate. Existing local messages will be backfilled into `message_events` during database migration.

Remote summaries that omit the new field preserve existing message events for compatibility. A summary containing an empty event array explicitly clears them.

## UI

The detail header will show `session.messageCount`, not the currently loaded message window length.

The usage breakdown will group first-party display families before rendering. `codex-cli` and `codex-app` become one Codex row; `claude-cli` and `claude-app` become one Claude Code row. Internal, T-prefixed, and third-party sources remain separate.

## Validation and Tests

Wire message events will be validated for non-negative integer index and timestamp values. Tests will cover remote ranged statistics, collector filtering parity, old-wire compatibility, detail total display, and UI source-family grouping. The complete test suite and production build must pass.
