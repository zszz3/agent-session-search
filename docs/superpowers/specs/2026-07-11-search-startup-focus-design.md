# Search Startup Focus Design

## Goal

Do not focus the main session search input when the application first opens. This prevents the recent-search dropdown from appearing before the user has expressed search intent.

## Behavior

- Remove `autoFocus` from the main session search input.
- Keep mouse or keyboard focus behavior unchanged after the user interacts with the input.
- Keep `Cmd+K` / `Ctrl+K` and the existing application focus-search event working; these explicit actions focus and select the search input and may show recent searches.
- Do not change search execution, history storage, dropdown contents, or other dialog inputs that intentionally use `autoFocus`.

## Testing

Add a renderer source-contract regression test that verifies the main `SearchBox` does not contain `autoFocus` while the application-level explicit focus handlers remain present. Run the focused renderer test, then the full test suite, typecheck, and production build.
