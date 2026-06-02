import { execFile } from "node:child_process";
import { DEFAULT_GLOBAL_SHORTCUT, type GlobalShortcut } from "./shortcuts";
import type { SessionSearchResult, SessionSource } from "./types";

type ProcessRunner = (command: string, args: string[]) => Promise<void>;

export interface ResumeProcessSpec {
  command: string;
  args: string[];
  cwd?: string;
  displayCommand: string;
}

export interface ResumePtySize {
  cols: number;
  rows: number;
}

export const DEFAULT_RESUME_PTY_SIZE: ResumePtySize = { cols: 100, rows: 30 };

export function normalizeResumePtySize(size?: Partial<ResumePtySize> | null): ResumePtySize {
  return {
    cols: Math.max(40, Math.min(240, Math.floor(size?.cols ?? DEFAULT_RESUME_PTY_SIZE.cols))),
    rows: Math.max(12, Math.min(80, Math.floor(size?.rows ?? DEFAULT_RESUME_PTY_SIZE.rows))),
  };
}

export function buildExpectResumePtyScript(size: Partial<ResumePtySize> = DEFAULT_RESUME_PTY_SIZE): string {
  const normalized = normalizeResumePtySize(size);
  return `log_user 0
set stty_init "rows ${normalized.rows} columns ${normalized.cols}"
spawn -noecho {*}$argv
log_user 1
interact
set status [wait]
if {[llength $status] >= 4} {
  exit [lindex $status 3]
}
exit 0
`;
}

export interface AppSettings {
  defaultTerminal: "Terminal" | "iTerm" | "Ghostty" | "WezTerm" | "Warp";
  globalShortcut: GlobalShortcut;
  claudeBinary: string;
  codexBinary: string;
  codeBuddyBinary: string;
  includeClaudeInternal: boolean;
  includeCodexInternal: boolean;
  includeCodeBuddyCli: boolean;
}

export const defaultSettings: AppSettings = {
  defaultTerminal: "Terminal",
  globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
  claudeBinary: "claude",
  codexBinary: "codex",
  codeBuddyBinary: "codebuddy",
  includeClaudeInternal: false,
  includeCodexInternal: false,
  includeCodeBuddyCli: false,
};

const ITERM_APPLICATION_NAMES = ["iTerm", "iTerm2"];

export function sourceFamily(source: SessionSource): "claude" | "codex" | "codebuddy" {
  if (source === "codebuddy-cli") return "codebuddy";
  return source === "claude-cli" || source === "claude-app" || source === "claude-internal" ? "claude" : "codex";
}

export function getResumeCommand(
  session: SessionSearchResult,
  settings: AppSettings = defaultSettings,
  opts: { withCwd?: boolean; skipPermissions?: boolean } = {},
): string {
  const { withCwd = true, skipPermissions = false } = opts;
  let cmd: string;
  const family = sourceFamily(session.source);
  if (family === "claude") {
    cmd = `${settings.claudeBinary} --resume ${session.rawId}`;
    if (skipPermissions) cmd += " --dangerously-skip-permissions";
  } else if (family === "codebuddy") {
    cmd = `${settings.codeBuddyBinary} --resume ${session.rawId}`;
  } else {
    cmd = `${settings.codexBinary} resume ${session.rawId}`;
    if (skipPermissions) cmd += " --dangerously-bypass-approvals-and-sandbox";
  }
  if (withCwd && session.projectPath) cmd = `cd ${shellQuote(session.projectPath)} && ${cmd}`;
  return cmd;
}

export function getResumeProcessSpec(
  session: SessionSearchResult,
  settings: AppSettings = defaultSettings,
  opts: { skipPermissions?: boolean } = {},
): ResumeProcessSpec {
  const { skipPermissions = false } = opts;
  const family = sourceFamily(session.source);
  let command: string;
  let args: string[];

  if (family === "claude") {
    command = settings.claudeBinary;
    args = ["--resume", session.rawId];
    if (skipPermissions) args.push("--dangerously-skip-permissions");
  } else if (family === "codebuddy") {
    command = settings.codeBuddyBinary;
    args = ["--resume", session.rawId];
  } else {
    command = settings.codexBinary;
    args = ["resume", session.rawId];
    if (skipPermissions) args.push("--dangerously-bypass-approvals-and-sandbox");
  }

  return {
    command,
    args,
    cwd: session.projectPath || undefined,
    displayCommand: getResumeCommand(session, settings, { withCwd: true, skipPermissions }),
  };
}

export function getExpectResumeProcessSpec(spec: ResumeProcessSpec, scriptPath: string): ResumeProcessSpec {
  return {
    command: "expect",
    args: [scriptPath, spec.command, ...spec.args],
    cwd: spec.cwd,
    displayCommand: spec.displayCommand,
  };
}

export async function openResumeInTerminal(session: SessionSearchResult, settings: AppSettings): Promise<void> {
  const command = getResumeCommand(session, settings, { withCwd: true });
  if (process.platform !== "darwin") {
    await runProcess(settings.defaultTerminal === "WezTerm" ? "wezterm" : "sh", ["-lc", command]);
    return;
  }

  if (settings.defaultTerminal === "iTerm") {
    const appName = await resolveMacApplicationName(ITERM_APPLICATION_NAMES);
    if (!appName) {
      throw new Error("iTerm is not installed or is not registered with macOS. Install iTerm2 or use Resume in Terminal.");
    }

    await runAppleScript(`set wasRunning to application "${escapeAppleScript(appName)}" is running
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
  end tell
end tell`);
    return;
  }

  if (settings.defaultTerminal === "Ghostty") {
    await runProcess("/usr/bin/open", ["-na", "Ghostty.app", "--args", `--initial-command=${command}`]);
    return;
  }

  if (settings.defaultTerminal === "WezTerm") {
    const args = ["-na", "WezTerm.app", "--args", "start"];
    if (session.projectPath) args.push("--cwd", session.projectPath);
    args.push("--", process.env.SHELL || "/bin/zsh", "-ic", getResumeCommand(session, settings, { withCwd: false }));
    await runProcess("/usr/bin/open", args);
    return;
  }

  if (settings.defaultTerminal === "Warp") {
    await runProcess("/usr/bin/open", session.projectPath ? ["-a", "Warp", session.projectPath] : ["-a", "Warp"]);
    return;
  }

  await runAppleScript(`tell application "Terminal"
  activate
  do script "${escapeAppleScript(command)}"
end tell`);
}

export async function openResumeInSpecificTerminal(
  session: SessionSearchResult,
  settings: AppSettings,
  terminal: AppSettings["defaultTerminal"],
): Promise<void> {
  await openResumeInTerminal(session, { ...settings, defaultTerminal: terminal });
}

export async function resolveMacApplicationName(names: string[], runner: ProcessRunner = runProcess): Promise<string | null> {
  for (const name of names) {
    try {
      await runner("/usr/bin/osascript", ["-e", `id of application "${escapeAppleScript(name)}"`]);
      return name;
    } catch {
      // Try the next commonly registered app name.
    }
  }
  return null;
}

export async function openNativeApp(source: SessionSource): Promise<void> {
  const family = sourceFamily(source);
  const appName = family === "claude" ? "Claude" : family === "codebuddy" ? "CodeBuddy CN" : "Codex";
  if (process.platform === "darwin") {
    await runProcess("/usr/bin/open", ["-a", appName]);
  }
}

export async function revealInFileManager(targetPath: string): Promise<void> {
  if (!targetPath) return;
  if (process.platform === "darwin") await runProcess("/usr/bin/open", ["-R", targetPath]);
  else if (process.platform === "win32") await runProcess("explorer.exe", [targetPath]);
  else await runProcess("xdg-open", [targetPath]);
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_\-./]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function runAppleScript(script: string): Promise<void> {
  return runProcess("/usr/bin/osascript", ["-e", script]);
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (!error) return resolve();
      reject(new Error(stderr?.trim() || stdout?.trim() || error.message));
    });
  });
}
