# Stable Node Auto-update Implementation Plan

> **For Codex:** Execute task-by-task with `superpowers:executing-plans`; keep the existing installer and change only its runtime boundary.

**Goal:** Ensure App-triggered updates run under the stable Node executable supplied by the npm launcher, never the Electron executable being replaced.

**Architecture:** The npm launcher already exports `AGENT_RECALL_NODE_PATH`. The main-process update launcher will require that path, remove Electron-only runtime state from the child environment, and retain the existing detached update script, validation, rollback, and relaunch flow.

**Tech Stack:** TypeScript, Electron main process, Node child processes, Vitest.

---

### Task 1: Lock the runtime behavior with tests

**Files:**
- Modify: `src/main/services/app-update-service.test.ts`

- [ ] Replace the Electron-runtime expectation with `AGENT_RECALL_NODE_PATH` and verify `ELECTRON_RUN_AS_NODE` is absent.
- [ ] Add a regression case proving a missing stable Node path fails before spawning the installer.
- [ ] Run `npm test -- src/main/services/app-update-service.test.ts` and confirm the new assertions fail.

### Task 2: Use the stable Node executable

**Files:**
- Modify: `src/main/services/app-update-service.ts`

- [ ] Resolve the installer executable from the explicit test option or `AGENT_RECALL_NODE_PATH`.
- [ ] Throw a clear error when neither exists; do not fall back to `process.execPath`.
- [ ] Delete `ELECTRON_RUN_AS_NODE` from the detached child environment before spawning.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Document and verify the user-visible fix

**Files:**
- Create: `.release-notes/fix-update-and-codex-app-open.md`

- [ ] Describe the fixed npm App update behavior in user-facing language.
- [ ] Run `npm run release-note:check` and the relevant update/package tests using temporary installation state where required.
