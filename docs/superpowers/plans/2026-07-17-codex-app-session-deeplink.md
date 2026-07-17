# Codex App Session Deep-link Implementation Plan

> **For Codex:** Execute task-by-task with `superpowers:executing-plans`; keep CLI resume behavior unchanged.

**Goal:** Open a local `codex-app` search result directly in its exact Codex task from every Resume entry point and the existing Open App action.

**Architecture:** Add an App result to the shared resume router. The main process validates the session UUID and opens `codex://threads/<id>` through Electron. Renderer entry points keep calling the same IPC command and adapt only their labels/status text for App sessions.

**Tech Stack:** TypeScript, Electron IPC/shell, React, Vitest.

---

### Task 1: Add the App resume route

**Files:**
- Modify: `src/core/resume-router.test.ts`
- Modify: `src/core/resume-router.ts`

- [ ] Add failing coverage for local macOS/Windows `codex-app`, remote `codex-app`, Linux, and unchanged `codex-cli` focus behavior.
- [ ] Return `{ route: "app" }` only for local supported-platform `codex-app` sessions.
- [ ] Run `npm test -- src/core/resume-router.test.ts`.

### Task 2: Open and validate the exact task deep link

**Files:**
- Modify: `src/core/platform.test.ts`
- Modify: `src/core/platform.ts`
- Modify: `src/main/index.ts`

- [ ] Add failing tests for a valid UUID deep link, invalid IDs, unsupported platforms, and URL-handler failures.
- [ ] Make `openNativeApp` accept the session, validate `rawId`, and open `codex://threads/<encoded-id>` for `codex-app`.
- [ ] Route local App resumes and the existing Open App handler through this function; keep remote sessions on terminal resume.
- [ ] Run the focused core/main tests.

### Task 3: Align visible Resume actions

**Files:**
- Modify: `src/renderer/src/session-ui.ts`
- Modify: `src/renderer/src/session-ui.test.ts`
- Modify: `src/renderer/src/features/session-detail/detail-panel.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] Add tests for the App-route success message and Codex-specific action label.
- [ ] Use Codex wording for keyboard, detail, and context-menu Resume actions.
- [ ] Hide the terminal-specific iTerm action for `codex-app` sessions.
- [ ] Run focused renderer tests.

### Task 4: Complete release verification

**Files:**
- Modify: `.release-notes/fix-update-and-codex-app-open.md`

- [ ] Add the exact-session opening fix to the single branch release note.
- [ ] Run type checking, focused tests, the full test suite, and `npm run release-note:check`.
