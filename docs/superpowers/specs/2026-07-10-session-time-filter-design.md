# Session Time Filter Design

## Goal

Bring the existing session date-range filter into the latest `main`, remove the user-selectable session sort control, and document the resulting behavior in both READMEs.

## User Experience

- The toolbar offers four session ranges: all time, last 7 days, last 30 days, and last 90 days.
- A selected range filters sessions by their latest activity timestamp.
- The sort dropdown for “Recent conversation” and “Created” is removed.
- Sessions and sidebar projects remain ordered by latest activity, newest first.
- Session rows and project rows continue to display their latest activity time.

## Implementation Boundaries

- Adapt commit `ec23bb7` from `feat/time-range-filter` onto the latest `main` rather than merging the old branch history.
- Remove the renderer's sort state, sort menu, sort labels, and sort-option UI helpers.
- Send `sortBy: "activity"` in search requests to preserve compatibility with existing core and MCP callers.
- Keep the core `SearchOptions.sortBy` and storage-layer sort support; removing that public behavior is outside this change.
- Update Chinese and English README feature descriptions without reorganizing unrelated sections.

## Verification

- Unit-test all four time-range options and their calculated boundaries.
- Verify storage filtering uses the latest session activity timestamp.
- Add a renderer contract test proving the date filter exists and the sort control is absent.
- Run the full test suite, inspect the final diff, and scan new changes for company-specific or sensitive information before push.
