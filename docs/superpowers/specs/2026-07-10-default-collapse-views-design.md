# Default-Collapsed Views Design

## Goal

Make the sidebar `Views` section collapsed by default without overriding a user's saved sidebar preferences.

## Behavior

- `readSidebarSections(null)` returns `views: false`.
- Stored state with an explicit boolean `views` value continues to win.
- Stored state without a `views` field falls back to `false`.
- Invalid stored JSON falls back to the default state with `views: false`.
- Toggling and serialization behavior remain unchanged, so a user who expands `Views` keeps that choice on later launches.

## Scope and Verification

Only `src/renderer/src/sidebar-sections.ts` and its unit test need behavior changes. Run the focused sidebar test, the full suite, and the build; inspect the diff and sensitive-information scan before merging.
