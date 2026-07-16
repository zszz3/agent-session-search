# Terminal Title Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep supported external terminal window or tab titles synchronized with the renamed Agent-Session-Search session, both for already-running local sessions and for later Resume launches.

**Architecture:** Add a small pure terminal-title utility for normalization and command construction, extend the existing PID/TTY terminal-discovery boundary with a non-focusing title operation, and route rename IPC through a testable orchestration function. Resume launchers receive the saved `displayTitle` without changing copied resume commands, session IDs, working directories, SSH arguments, or terminal settings.

**Tech Stack:** TypeScript 5.7, Node.js 22.13+, Electron 42, Vitest 2.1, AppleScript, PowerShell/cmd launch arguments, POSIX OSC title sequences.

## Global Constraints

- Persisting the session name is authoritative; terminal synchronization failure must never roll back or reject the rename.
- Live synchronization is limited to local sessions discovered by the existing live-session snapshot.
- Never inject keystrokes or commands into an already-running shell or agent process.
- macOS Terminal and iTerm live sessions are targeted exactly by TTY; WezTerm is best effort only when `WEZTERM_PANE` can be read safely.
- Unsupported live terminals return a no-op result; their next supported Resume launch may still receive the saved title.
- `getResumeCommand()` and Copy Resume Cmd output remain unchanged.
- Preserve Unicode, remove terminal control characters, and cap only the external terminal title, not the stored title.
- Do not add dependencies or modify terminal profiles, shell startup files, or user settings.
- Add exactly one user-facing release note at `.release-notes/feat-sync-terminal-title.md` and pass `npm run release-note:check` before delivery.
- Remove `docs/superpowers/` design and plan artifacts from the final branch before delivery.

---

### Task 1: Safe terminal-title primitives

**Files:**
- Create: `src/core/terminal-title.ts`
- Create: `src/core/terminal-title.test.ts`

**Interfaces:**
- Consumes: a stored `displayTitle` and an existing shell command string.
- Produces: `normalizeTerminalTitle(value: string): string`, `withPosixTerminalTitle(command: string, title: string): string`, `withPowerShellTerminalTitle(command: string, title: string): string`, `withCmdTerminalTitle(command: string, title: string): string`, and `windowsTerminalTitleArgs(title: string): string[]`.

- [ ] **Step 1: Write failing normalization and command-safety tests**

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeTerminalTitle,
  windowsTerminalTitleArgs,
  withCmdTerminalTitle,
  withPosixTerminalTitle,
  withPowerShellTerminalTitle,
} from "./terminal-title";

describe("terminal titles", () => {
  it("normalizes control characters while preserving Unicode", () => {
    expect(normalizeTerminalTitle("  修复登录\n流程\t\u001b[31m  ")).toBe("修复登录 流程 [31m");
  });

  it("caps by Unicode code points", () => {
    expect(Array.from(normalizeTerminalTitle("会".repeat(200)))).toHaveLength(160);
  });

  it("quotes POSIX and PowerShell titles without altering the command", () => {
    expect(withPosixTerminalTitle("codex resume abc", "Bob's fix")).toBe(
      "printf '\\033]0;%s\\007' 'Bob'\\''s fix' && codex resume abc",
    );
    expect(withPowerShellTerminalTitle("codex resume abc", "Bob's fix")).toBe(
      "$Host.UI.RawUI.WindowTitle = 'Bob''s fix'; codex resume abc",
    );
  });

  it("removes cmd metacharacters from the display-only title", () => {
    const command = withCmdTerminalTitle("codex resume abc", "Fix & launch %PATH%!");
    expect(command).toBe("title Fix launch PATH & codex resume abc");
  });

  it("builds argv-safe Windows Terminal title options", () => {
    expect(windowsTerminalTitleArgs("修复登录")).toEqual([
      "--title",
      "修复登录",
      "--suppressApplicationTitle",
    ]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/core/terminal-title.test.ts`

Expected: FAIL because `./terminal-title` does not exist.

- [ ] **Step 3: Implement the minimal pure helpers**

```ts
const MAX_TERMINAL_TITLE_CODE_POINTS = 160;

export function normalizeTerminalTitle(value: string): string {
  const normalized = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "Untitled Session";
  return Array.from(normalized).slice(0, MAX_TERMINAL_TITLE_CODE_POINTS).join("");
}

function posixQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function powershellQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function withPosixTerminalTitle(command: string, title: string): string {
  return `printf '\\033]0;%s\\007' ${posixQuote(normalizeTerminalTitle(title))} && ${command}`;
}

export function withPowerShellTerminalTitle(command: string, title: string): string {
  return `$Host.UI.RawUI.WindowTitle = ${powershellQuote(normalizeTerminalTitle(title))}; ${command}`;
}

export function withCmdTerminalTitle(command: string, title: string): string {
  const safeTitle = normalizeTerminalTitle(title)
    .replace(/[%!^&|<>\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return safeTitle ? `title ${safeTitle} & ${command}` : command;
}

export function windowsTerminalTitleArgs(title: string): string[] {
  return ["--title", normalizeTerminalTitle(title), "--suppressApplicationTitle"];
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run src/core/terminal-title.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit the primitive layer**

```bash
git add src/core/terminal-title.ts src/core/terminal-title.test.ts
git commit -m "feat: add safe terminal title helpers"
```

---

### Task 2: Update titles for already-running supported terminals

**Files:**
- Modify: `src/core/session-focus.ts`
- Modify: `src/core/session-focus.test.ts`

**Interfaces:**
- Consumes: `normalizeTerminalTitle` from Task 1, a live agent PID, and the existing `CommandRunner` process/TTY discovery path.
- Produces: `setLiveSessionTerminalTitle(pid: number, title: string, options?: FocusLiveSessionOptions): Promise<boolean>`; `true` means a terminal adapter reported success, `false` means unsupported or not found, and process/script errors are allowed to reject for the caller to downgrade.

- [ ] **Step 1: Add failing Terminal, iTerm, WezTerm, and unsupported-terminal tests**

```ts
import {
  focusLiveSessionTerminal,
  liveSessionPidForSession,
  setLiveSessionTerminalTitle,
} from "./session-focus";

it("sets a Terminal tab custom title by TTY without sending shell input", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner = async (command: string, args: string[]): Promise<string> => {
    calls.push({ command, args });
    if (args.join(" ") === "-o tty= -p 303") return "ttys003\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 303") return "303 202 codex resume abc\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 202") return "202 101 -zsh\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 101") {
      return "101 1 /System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal\n";
    }
    return "true\n";
  };

  await expect(setLiveSessionTerminalTitle(303, "修复登录", { platform: "darwin", runner })).resolves.toBe(true);
  const script = calls.at(-1)?.args.at(-1) ?? "";
  expect(script).toContain('set custom title of terminalTab to "修复登录"');
  expect(script).toContain("set title displays custom title of terminalTab to true");
  expect(script).not.toContain("write text");
});

it("sets an iTerm session name by TTY", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner = async (command: string, args: string[]): Promise<string> => {
    calls.push({ command, args });
    if (args.join(" ") === "-o tty= -p 303") return "ttys003\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 303") return "303 202 codex resume abc\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 202") return "202 101 -zsh\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 101") {
      return "101 1 /Applications/iTerm.app/Contents/MacOS/iTerm2\n";
    }
    return "true\n";
  };

  await expect(setLiveSessionTerminalTitle(303, "New name", { platform: "darwin", runner })).resolves.toBe(true);
  const script = calls.at(-1)?.args.at(-1) ?? "";
  expect(script).toContain('set name of terminalSession to "New name"');
  expect(script).not.toContain("write text");
});

it("uses WEZTERM_PANE for an exact WezTerm tab title update", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner = async (command: string, args: string[]): Promise<string> => {
    calls.push({ command, args });
    if (args.join(" ") === "-o tty= -p 303") return "ttys003\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 303") return "303 202 codex resume abc\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 202") return "202 101 -zsh\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 101") {
      return "101 1 /Applications/WezTerm.app/Contents/MacOS/wezterm-gui\n";
    }
    if (args.join(" ") === "eww -p 303 -o command=") return "codex resume abc WEZTERM_PANE=42 PATH=/usr/bin\n";
    return "";
  };

  await expect(setLiveSessionTerminalTitle(303, "New name", { platform: "darwin", runner })).resolves.toBe(true);
  expect(calls.at(-1)).toEqual({
    command: "wezterm",
    args: ["cli", "set-tab-title", "--pane-id", "42", "New name"],
  });
});

it("does not inject commands for Warp, Ghostty, or Windows live sessions", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner = async (command: string, args: string[]): Promise<string> => {
    calls.push({ command, args });
    if (args.join(" ") === "-o tty= -p 303") return "ttys003\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 303") return "303 202 codex resume abc\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 202") return "202 101 -zsh\n";
    if (args.join(" ") === "-o pid=,ppid=,command= -p 101") {
      return "101 1 /Applications/Warp.app/Contents/MacOS/Warp\n";
    }
    return "";
  };

  await expect(setLiveSessionTerminalTitle(303, "New name", { platform: "darwin", runner })).resolves.toBe(false);
  expect(calls.every((call) => call.command !== "/usr/bin/osascript" && call.command !== "wezterm")).toBe(true);

  let windowsCalls = 0;
  await expect(setLiveSessionTerminalTitle(303, "New name", {
    platform: "win32",
    runner: async () => {
      windowsCalls += 1;
      return "";
    },
  })).resolves.toBe(false);
  expect(windowsCalls).toBe(0);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/core/session-focus.test.ts`

Expected: FAIL because `setLiveSessionTerminalTitle` is not exported.

- [ ] **Step 3: Add the non-focusing live-title operation**

Implement these concrete branches in `session-focus.ts`:

```ts
export async function setLiveSessionTerminalTitle(
  pid: number,
  title: string,
  options: FocusLiveSessionOptions = {},
): Promise<boolean> {
  const platform = options.platform ?? process.platform;
  const runner = options.runner ?? runProcess;
  if (platform !== "darwin") return false;

  const tty = await ttyForPid(pid, runner);
  const target = await findTerminalTarget(pid, runner);
  if (!tty || !target) return false;

  if (target.appName === "Terminal" || target.appName === "iTerm") {
    const output = await runner("/usr/bin/osascript", [
      "-e",
      buildTtyTitleScript(target.appName, tty, normalizeTerminalTitle(title)),
    ]);
    return output.trim() === "true";
  }

  if (target.appName === "WezTerm") {
    const paneId = await wezTermPaneIdForPid(pid, runner);
    if (!paneId) return false;
    await runner("wezterm", ["cli", "set-tab-title", "--pane-id", paneId, normalizeTerminalTitle(title)]);
    return true;
  }

  return false;
}
```

Add `buildTtyTitleScript` with the existing TTY loops. The Terminal branch sets `custom title` and `title displays custom title`; the iTerm branch sets `name of terminalSession`; both return `"true"` only on the matching TTY and never call `activate`, `select`, `do script`, or `write text`.

Add pane lookup without logging the environment output:

```ts
async function wezTermPaneIdForPid(pid: number, runner: CommandRunner): Promise<string | null> {
  try {
    const output = await runner("/bin/ps", ["eww", "-p", String(pid), "-o", "command="]);
    return output.match(/(?:^|\s)WEZTERM_PANE=(\d+)(?=\s|$)/)?.[1] ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run live-title and existing focus tests**

Run: `npx vitest run src/core/session-focus.test.ts`

Expected: PASS for all existing focus tests plus the new title tests.

- [ ] **Step 5: Commit the live adapter layer**

```bash
git add src/core/session-focus.ts src/core/session-focus.test.ts
git commit -m "feat: sync titles for live terminal sessions"
```

---

### Task 3: Apply titles when Resume opens a terminal

**Files:**
- Modify: `src/core/platform.ts`
- Modify: `src/core/platform.test.ts`

**Interfaces:**
- Consumes: Task 1 title helpers and `SessionSearchResult.displayTitle`.
- Produces: existing `buildWindowsResumeLaunchPlan`, `buildGhosttyOpenArgs`, `openResumeInTerminal`, and `openResumeInSpecificTerminal` behavior with launch-time title setup; `getResumeCommand` output remains byte-for-byte title-free.

- [ ] **Step 1: Add failing launch-plan tests**

Add these tests:

```ts
it("adds a stable title to the Windows Terminal resume plan", () => {
  const plan = buildWindowsResumeLaunchPlan(session({ displayTitle: "修复登录" }), defaultSettings);
  expect(plan[0]).toMatchObject({ file: "wt.exe" });
  expect(plan[0].args).toEqual(expect.arrayContaining([
    "--title",
    "修复登录",
    "--suppressApplicationTitle",
  ]));
  expect(plan.find((item) => item.file === "pwsh.exe")?.args.at(-1)).toContain(
    "$Host.UI.RawUI.WindowTitle = '修复登录'",
  );
});

it("adds a POSIX title prefix to Ghostty without changing the resume id", () => {
  const args = buildGhosttyOpenArgs(session({ rawId: "session-1", displayTitle: "登录修复" }), defaultSettings);
  expect(args.at(-1)).toContain("printf '\\033]0;%s\\007' '登录修复'");
  expect(args.at(-1)).toContain("codex resume session-1");
});

it("keeps copied resume commands title-free", () => {
  expect(getResumeCommand(session({ displayTitle: "登录修复" }), defaultSettings)).not.toContain("\\033]0;");
});
```

Export and test pure AppleScript builders:

```ts
expect(buildTerminalResumeScript("codex resume abc", "登录修复")).toContain(
  'set custom title of terminalTab to "登录修复"',
);
expect(buildItermResumeScript("iTerm", "codex resume abc", "登录修复")).toContain(
  'set name to "登录修复"',
);
```

- [ ] **Step 2: Run platform tests and verify RED**

Run: `npx vitest run src/core/platform.test.ts`

Expected: FAIL because resume launch plans and scripts do not yet include `displayTitle`.

- [ ] **Step 3: Thread the title through Windows launch plans**

Add an optional `title?: string` argument to `buildWindowsLaunchPlan` and `buildWindowsShellSpecificLaunchPlan`. When present:

```ts
const titleArgs = windowsTerminalTitleArgs(title);
const titledCmdCommand = withCmdTerminalTitle(cmdCommand, title);
const titledPowerShellCommand = withPowerShellTerminalTitle(powershellCommand ?? cmdCommand, title);
```

- prepend `titleArgs` to the `wt.exe` terminal arguments before `cmd.exe`;
- pass `titledPowerShellCommand` to pwsh/PowerShell candidates;
- pass `titledCmdCommand` to cmd and WezTerm's nested cmd candidate;
- preserve existing output exactly when `title` is omitted, so migration and generic command launchers remain unchanged.

Pass `session.displayTitle` from `buildWindowsResumeLaunchPlan` to both launch-plan variants.

- [ ] **Step 4: Add macOS/POSIX launch title builders and wiring**

Create pure exported builders in `platform.ts`:

```ts
export function buildTerminalResumeScript(command: string, title: string): string {
  return `tell application "Terminal"
  activate
  set terminalTab to do script "${escapeAppleScript(command)}"
  set custom title of terminalTab to "${escapeAppleScript(normalizeTerminalTitle(title))}"
  set title displays custom title of terminalTab to true
end tell`;
}

export function buildItermResumeScript(appName: string, command: string, title: string): string {
  return `set wasRunning to application "${escapeAppleScript(appName)}" is running
tell application "${escapeAppleScript(appName)}"
  activate
  if wasRunning then
    if (count of windows) = 0 then
      create window with default profile
    else
      tell current window
        create tab with default profile
      end tell
    end if
  else
    delay 0.3
  end if
  tell current session of current window
    write text "${escapeAppleScript(command)}"
    set name to "${escapeAppleScript(normalizeTerminalTitle(title))}"
  end tell
end tell`;
}
```

Use this builder in `openResumeInTerminal`:

- derive `title` from `session.displayTitle`;
- use app-level title builders for Terminal and iTerm;
- use `withPosixTerminalTitle` for non-darwin POSIX, Ghostty, WezTerm, and remote Warp command paths;
- leave local Warp's existing project-opening behavior unchanged because it does not execute the Resume command.

Update `buildGhosttyOpenArgs` to wrap only its launch command; do not modify `getResumeCommand`.

- [ ] **Step 5: Run platform tests and typecheck**

Run: `npx vitest run src/core/platform.test.ts`

Expected: PASS, including all pre-existing quoting and migration-launch tests.

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit Resume launch synchronization**

```bash
git add src/core/platform.ts src/core/platform.test.ts
git commit -m "feat: title resumed terminal sessions"
```

---

### Task 4: Persist rename first, then synchronize the live terminal

**Files:**
- Create: `src/core/session-title-sync.ts`
- Create: `src/core/session-title-sync.test.ts`
- Modify: `src/main/index.ts`
- Create: `src/main/session-title-sync-ipc.test.ts`

**Interfaces:**
- Consumes: `SessionStore.getSession`, `SessionStore.setCustomTitle`, `loadCachedLiveSessionSnapshot`, `liveSessionPidForSession`, and `setLiveSessionTerminalTitle`.
- Produces: `setSessionCustomTitleAndSyncTerminal(sessionKey: string, title: string | null, dependencies: SessionTitleSyncDependencies): Promise<void>` and an async `title:set` IPC handler that never rejects solely because terminal synchronization failed.

- [ ] **Step 1: Write failing orchestration tests**

Add these concrete cases in `session-title-sync.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { SessionSearchResult } from "./types";
import { setSessionCustomTitleAndSyncTerminal } from "./session-title-sync";

function session(overrides: Partial<SessionSearchResult> = {}): SessionSearchResult {
  return {
    sessionKey: "codex-cli:1",
    rawId: "1",
    source: "codex-cli",
    environmentId: "local",
    environmentKind: "local",
    environmentLabel: "Local",
    projectPath: "/repo",
    filePath: "/repo/session.jsonl",
    originalTitle: "Original",
    firstQuestion: "Original",
    timestamp: 0,
    fileMtimeMs: 0,
    fileSize: 0,
    prUrl: null,
    prNumber: null,
    tokenUsage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 },
    customTitle: null,
    displayTitle: "Original",
    favorited: false,
    pinned: false,
    hidden: false,
    tags: [],
    matchSnippet: null,
    lastOpenedAt: null,
    lastResumedAt: null,
    lastActivityAt: 0,
    messageCount: 0,
    aiSummary: null,
    aiSummaryStale: false,
    ...overrides,
  };
}

it("persists first and then syncs the updated display title", async () => {
  const calls: string[] = [];
  let current = session({ customTitle: null, displayTitle: "Original" });
  await setSessionCustomTitleAndSyncTerminal("codex-cli:1", "Renamed", {
    getSession: () => current,
    setCustomTitle: (_key, title) => {
      calls.push(`persist:${title}`);
      current = { ...current, customTitle: title, displayTitle: title || current.originalTitle };
    },
    loadLiveSessions: async () => ({
      generatedAt: new Date(0).toISOString(),
      sessions: [{ family: "codex", rawId: current.rawId, pid: 303 }],
    }),
    setLiveTerminalTitle: async (pid, title) => {
      calls.push(`sync:${pid}:${title}`);
      return true;
    },
  });
  expect(calls).toEqual(["persist:Renamed", "sync:303:Renamed"]);
});

it("keeps the rename successful when terminal synchronization throws", async () => {
  let persisted = false;
  const current = session();
  const onSyncError = vi.fn();
  await expect(setSessionCustomTitleAndSyncTerminal(current.sessionKey, "Renamed", {
    getSession: () => current,
    setCustomTitle: () => {
      persisted = true;
      current.customTitle = "Renamed";
      current.displayTitle = "Renamed";
    },
    loadLiveSessions: async () => ({
      generatedAt: new Date(0).toISOString(),
      sessions: [{ family: "codex", rawId: current.rawId, pid: 303 }],
    }),
    setLiveTerminalTitle: async () => {
      throw new Error("automation denied");
    },
    onSyncError,
  })).resolves.toBeUndefined();
  expect(persisted).toBe(true);
  expect(onSyncError).toHaveBeenCalledOnce();
});

it("uses the fallback display title when the custom title is cleared", async () => {
  let current = session({ customTitle: "Renamed", displayTitle: "Renamed" });
  const syncedTitles: string[] = [];
  await setSessionCustomTitleAndSyncTerminal(current.sessionKey, null, {
    getSession: () => current,
    setCustomTitle: () => {
      current = { ...current, customTitle: null, displayTitle: current.originalTitle };
    },
    loadLiveSessions: async () => ({
      generatedAt: new Date(0).toISOString(),
      sessions: [{ family: "codex", rawId: current.rawId, pid: 303 }],
    }),
    setLiveTerminalTitle: async (_pid, title) => {
      syncedTitles.push(title);
      return true;
    },
  });
  expect(syncedTitles).toEqual(["Original"]);
});

it("persists remote sessions without trying local terminal synchronization", async () => {
  const current = session({ environmentId: "remote-1", environmentKind: "ssh", environmentLabel: "Remote" });
  const loadLiveSessions = vi.fn();
  let persisted = false;
  await setSessionCustomTitleAndSyncTerminal(current.sessionKey, "Renamed", {
    getSession: () => current,
    setCustomTitle: () => {
      persisted = true;
    },
    loadLiveSessions,
    setLiveTerminalTitle: vi.fn(),
  });
  expect(persisted).toBe(true);
  expect(loadLiveSessions).not.toHaveBeenCalled();
});

it("skips terminal synchronization when no matching live PID exists", async () => {
  const current = session();
  const setLiveTerminalTitle = vi.fn();
  await setSessionCustomTitleAndSyncTerminal(current.sessionKey, "Renamed", {
    getSession: () => current,
    setCustomTitle: () => {
      current.customTitle = "Renamed";
      current.displayTitle = "Renamed";
    },
    loadLiveSessions: async () => ({ generatedAt: new Date(0).toISOString(), sessions: [] }),
    setLiveTerminalTitle,
  });
  expect(setLiveTerminalTitle).not.toHaveBeenCalled();
});

it("does nothing for a missing session", async () => {
  const setCustomTitle = vi.fn();
  await setSessionCustomTitleAndSyncTerminal("missing", "Renamed", {
    getSession: () => null,
    setCustomTitle,
    loadLiveSessions: vi.fn(),
    setLiveTerminalTitle: vi.fn(),
  });
  expect(setCustomTitle).not.toHaveBeenCalled();
});

it("downgrades a live-snapshot error after persisting", async () => {
  const current = session();
  const setLiveTerminalTitle = vi.fn();
  await setSessionCustomTitleAndSyncTerminal(current.sessionKey, "Renamed", {
    getSession: () => current,
    setCustomTitle: () => {
      current.customTitle = "Renamed";
      current.displayTitle = "Renamed";
    },
    loadLiveSessions: async () => ({ generatedAt: new Date(0).toISOString(), sessions: [], error: "ps failed" }),
    setLiveTerminalTitle,
  });
  expect(current.displayTitle).toBe("Renamed");
  expect(setLiveTerminalTitle).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the orchestration test and verify RED**

Run: `npx vitest run src/core/session-title-sync.test.ts`

Expected: FAIL because `session-title-sync.ts` does not exist.

- [ ] **Step 3: Implement the testable orchestration boundary**

```ts
export interface SessionTitleSyncDependencies {
  getSession(sessionKey: string): SessionSearchResult | null;
  setCustomTitle(sessionKey: string, title: string | null): void;
  loadLiveSessions(): Promise<LiveSessionSnapshot>;
  setLiveTerminalTitle(pid: number, title: string): Promise<boolean>;
  onSyncError?(error: unknown): void;
}

export async function setSessionCustomTitleAndSyncTerminal(
  sessionKey: string,
  title: string | null,
  dependencies: SessionTitleSyncDependencies,
): Promise<void> {
  if (!dependencies.getSession(sessionKey)) return;
  dependencies.setCustomTitle(sessionKey, title);
  const updated = dependencies.getSession(sessionKey);
  if (!updated || updated.environmentKind !== "local") return;

  try {
    const snapshot = await dependencies.loadLiveSessions();
    if (snapshot.error) return;
    const pid = liveSessionPidForSession(updated, snapshot.sessions);
    if (pid) await dependencies.setLiveTerminalTitle(pid, updated.displayTitle);
  } catch (error) {
    dependencies.onSyncError?.(error);
  }
}
```

Persistence errors remain outside the `try` block and continue to reject. Only live-session discovery and terminal updates are downgraded.

- [ ] **Step 4: Wire the async IPC handler and add a source contract test**

Replace the direct store call in `src/main/index.ts` with:

```ts
ipcMain.handle("title:set", (_event, sessionKey: string, title: string | null) =>
  setSessionCustomTitleAndSyncTerminal(sessionKey, title, {
    getSession: (key) => store.getSession(key),
    setCustomTitle: (key, customTitle) => store.setCustomTitle(key, customTitle),
    loadLiveSessions: () => loadCachedLiveSessionSnapshot({ includeTrae: getSettings().includeTrae }),
    setLiveTerminalTitle: (pid, displayTitle) => setLiveSessionTerminalTitle(pid, displayTitle),
    onSyncError: (error) => console.warn("[terminal-title] Could not synchronize live terminal title.", error),
  }),
);
```

`session-title-sync-ipc.test.ts` reads `src/main/index.ts` and asserts the `title:set` handler calls `setSessionCustomTitleAndSyncTerminal`, passes `loadCachedLiveSessionSnapshot`, and does not contain the previous one-line direct store handler.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx vitest run src/core/session-title-sync.test.ts src/main/session-title-sync-ipc.test.ts src/core/session-focus.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit rename orchestration**

```bash
git add src/core/session-title-sync.ts src/core/session-title-sync.test.ts src/main/index.ts src/main/session-title-sync-ipc.test.ts
git commit -m "feat: sync terminal title after session rename"
```

---

### Task 5: Release copy, full verification, and delivery cleanup

**Files:**
- Create: `.release-notes/feat-sync-terminal-title.md`
- Delete before final delivery: `docs/superpowers/specs/2026-07-16-terminal-title-sync-design.md`
- Delete before final delivery: `docs/superpowers/plans/2026-07-16-terminal-title-sync.md`

**Interfaces:**
- Consumes: all completed feature behavior.
- Produces: one valid user-facing release note and a final branch containing no temporary planning artifacts.

- [ ] **Step 1: Add the user-facing release note**

```markdown
# 会话名称与终端标题同步

## 新增功能

- ✨ 重命名会话后，受支持的终端窗口或标签会同步显示新名称；之后恢复会话时也会沿用该标题。
```

- [ ] **Step 2: Run the Chinese copy through `humanizer-zh`**

Preserve the product behavior and supported-terminal qualifier. Change only wording that reads mechanically; do not add implementation details.

- [ ] **Step 3: Run the release-note check**

Run: `npm run release-note:check`

Expected: PASS and report exactly one new release note.

- [ ] **Step 4: Run full verification on the host if loopback tests are sandbox-blocked**

Run: `npm test`

Expected: 85+ Vitest files and all script tests pass. If sandbox-only `listen EPERM 127.0.0.1` failures recur, rerun the same command with host permission and require a clean pass.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS and produce Electron main, preload, renderer, and MCP bundles.

- [ ] **Step 5: Commit the release note**

```bash
git add .release-notes/feat-sync-terminal-title.md
git commit -m "docs: add terminal title sync release note"
```

- [ ] **Step 6: Remove temporary Superpowers artifacts and commit cleanup**

Delete only the two files listed in this task, verify `git diff --check`, and commit:

```bash
git add docs/superpowers/specs/2026-07-16-terminal-title-sync-design.md docs/superpowers/plans/2026-07-16-terminal-title-sync.md
git commit -m "chore: remove temporary planning docs"
```

- [ ] **Step 7: Verify final branch scope**

Run: `git status --short --branch`

Expected: clean `feat/sync-terminal-title` worktree.

Run: `git diff --stat origin/main...HEAD`

Expected: only terminal-title implementation/tests and `.release-notes/feat-sync-terminal-title.md`; no `docs/superpowers/` files.

Run: `git log --oneline origin/main..HEAD`

Expected: focused commits for title helpers, live adapters, Resume launch integration, rename orchestration, release copy, and planning-artifact cleanup.
