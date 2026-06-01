# Project Filter Design

## Goal

Add a project-level filter so users can quickly narrow sessions to one repository or working directory without manually creating tags.

## Scope

- Derive projects from indexed session `projectPath` values.
- Show a `Projects` section in the sidebar.
- Clicking a project filters the session list to that exact `projectPath`.
- The text search box keeps its current behavior and does not treat projects like tags.
- No project rename, merge, delete, or custom metadata in this version.

## Data Model

No new persistent tables are required. The store exposes a `listProjects()` read API that groups indexed sessions by non-empty `projectPath`.

Each project item contains:

- `path`: exact project path used for filtering.
- `label`: display name, usually the path basename.
- `sessionCount`: number of indexed sessions with that path.

If multiple projects share the same basename, labels include the parent folder, such as `team-a/app` and `team-b/app`.

## Search Behavior

`SearchOptions` gains an optional `projectPath` field. When provided, search results must match that exact path in addition to existing query, tag, source, visibility, and sort filters.

Project filtering is independent from tag filtering. A user can combine project + tag + source + query.

## UI

The sidebar adds `Projects` below `Sources` and above `Tags`.

The project list includes:

- `All Projects` clear button.
- A compact project row with a folder icon, label, and count.
- Active state matching existing tag/source sidebar styling.

The toolbar shows an active project chip next to the existing tag chip so users can clear the filter quickly.

## Testing

Core tests cover:

- `listProjects()` groups paths, counts sessions, ignores empty paths, and disambiguates duplicate basenames.
- `searchSessions({ projectPath })` returns only sessions from that exact path and composes with tag/source filters.

Renderer behavior is covered by TypeScript/build verification for this version.
