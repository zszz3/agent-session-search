import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { LiveSession, LiveSessionFamily, LiveSessionSnapshot } from "./types";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => import("node:sqlite").DatabaseSync };

type ProcessListRunner = (command: string, args: string[]) => Promise<string>;

interface ProcessEntry {
  pid: number;
  command: string;
}

export interface LoadLiveSessionOptions {
  platform?: NodeJS.Platform;
  runner?: ProcessListRunner;
  now?: Date;
  includeTrae?: boolean;
  homeDir?: string;
}

export function detectLiveSessionsFromProcessLines(
  lines: string[],
  codexSessionFilesByPid: Map<number, string> = new Map(),
  claudeSessionFilesByPid: Map<number, string> = new Map(),
  traeSessionIdsByPid: Map<number, string> = new Map(),
): LiveSession[] {
  const sessions: LiveSession[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const entry = parseProcessLine(line);
    if (!entry) continue;

    const tokens = splitCommandLine(entry.command);
    const command =
      detectResumeCommand(tokens) ??
      detectPlainCodexCommand(tokens, codexSessionFilesByPid.get(entry.pid)) ??
      detectPlainClaudeCommand(tokens, claudeSessionFilesByPid.get(entry.pid)) ??
      detectTraeAppSession(entry.command, traeSessionIdsByPid.get(entry.pid));
    if (!command) continue;

    const key = `${command.family}:${command.rawId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sessions.push({ ...command, pid: entry.pid });
  }

  return sessions;
}

export async function loadLiveSessionSnapshot(options: LoadLiveSessionOptions = {}): Promise<LiveSessionSnapshot> {
  const generatedAt = (options.now ?? new Date()).toISOString();
  const platform = options.platform ?? process.platform;
  const runner = options.runner ?? execText;
  const homeDir = options.homeDir ?? os.homedir();

  try {
    const output =
      platform === "win32"
        ? await runner("powershell.exe", [
            "-NoProfile",
            "-Command",
            'Get-CimInstance Win32_Process | ForEach-Object { if ($_.CommandLine) { "{0} {1}" -f $_.ProcessId, $_.CommandLine } }',
          ])
        : await runner("/bin/ps", ["-axo", "pid=,command="]);
    const lines = output.split(/\r?\n/);
    const [codexSessionFilesByPid, claudeSessionFilesByPid] =
      platform === "win32"
        ? [new Map<number, string>(), new Map<number, string>()]
        : await Promise.all([loadPlainCodexSessionFiles(lines, runner, homeDir), loadPlainClaudeSessionFiles(lines, runner, homeDir)]);
    const traeSessionIdsByPid =
      platform === "win32" || options.includeTrae === false ? new Map<number, string>() : await loadTraeSessionIds(lines, runner);

    return {
      generatedAt,
      sessions: detectLiveSessionsFromProcessLines(lines, codexSessionFilesByPid, claudeSessionFilesByPid, traeSessionIdsByPid),
    };
  } catch (error) {
    return {
      generatedAt,
      sessions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function loadPlainCodexSessionFiles(lines: string[], runner: ProcessListRunner, homeDir: string): Promise<Map<number, string>> {
  const sessionFiles = new Map<number, string>();
  const claimedRawIds = claimedRawIdsForFamily(lines, "codex");
  const entries = lines.map(parseProcessLine).filter((entry): entry is ProcessEntry => Boolean(entry));
  const pids = entries
    .filter((entry) => isPlainCodexCommand(splitCommandLine(entry.command)))
    .map((entry) => entry.pid);

  const outputs = await Promise.all(
    pids.map(async (pid) => {
      try {
        return { pid, output: await runner("lsof", ["-p", String(pid)]) };
      } catch {
        // A process can exit between ps and lsof; ignore it and keep the rest.
        return { pid, output: "" };
      }
    }),
  );

  for (const { pid, output } of outputs) {
    const cwd = extractCwdFromLsof(output);
    const sessionFile = extractCodexSessionFile(output) ?? latestCodexSessionFileForCwd(cwd, homeDir, claimedRawIds);
    const rawId = sessionFile ? extractCodexSessionId(sessionFile) : null;
    if (!sessionFile || !rawId) continue;
    sessionFiles.set(pid, sessionFile);
    claimedRawIds.add(rawId);
  }

  return sessionFiles;
}

async function loadPlainClaudeSessionFiles(lines: string[], runner: ProcessListRunner, homeDir: string): Promise<Map<number, string>> {
  const sessionFiles = new Map<number, string>();
  const claimedRawIds = claimedRawIdsForFamily(lines, "claude");
  const entries = lines.map(parseProcessLine).filter((entry): entry is ProcessEntry => Boolean(entry));
  const pids = entries
    .filter((entry) => isPlainClaudeCommand(splitCommandLine(entry.command)))
    .map((entry) => entry.pid);

  const outputs = await Promise.all(
    pids.map(async (pid) => {
      try {
        return { pid, output: await runner("lsof", ["-p", String(pid)]) };
      } catch {
        // A process can exit between ps and lsof; ignore it and keep the rest.
        return { pid, output: "" };
      }
    }),
  );

  for (const { pid, output } of outputs) {
    const cwd = extractCwdFromLsof(output);
    const sessionFile = extractClaudeSessionFile(output) ?? latestClaudeSessionFileForCwd(cwd, homeDir, claimedRawIds);
    const rawId = sessionFile ? extractClaudeSessionId(sessionFile) : null;
    if (!sessionFile || !rawId) continue;
    sessionFiles.set(pid, sessionFile);
    claimedRawIds.add(rawId);
  }

  return sessionFiles;
}

async function loadTraeSessionIds(lines: string[], runner: ProcessListRunner): Promise<Map<number, string>> {
  const sessionIds = new Map<number, string>();
  const entries = lines.map(parseProcessLine).filter((entry): entry is ProcessEntry => Boolean(entry));
  const pids = entries.filter((entry) => isTraeAppCommand(entry.command)).map((entry) => entry.pid);

  await Promise.all(
    pids.map(async (pid) => {
      try {
        const output = await runner("lsof", ["-p", String(pid)]);
        const stateDbPath = extractTraeStateDbPath(output);
        if (!stateDbPath) return;
        const rawId = readTraeCurrentSessionRawId(stateDbPath);
        if (rawId) sessionIds.set(pid, rawId);
      } catch {
        // Trae can rotate workspaces or exit between ps and lsof; keep the rest.
      }
    }),
  );

  return sessionIds;
}

function parseProcessLine(line: string): ProcessEntry | null {
  const match = line.trim().match(/^(\d+)\s+(.+)$/);
  if (!match) return null;

  const pid = Number(match[1]);
  const command = match[2]?.trim();
  if (!Number.isFinite(pid) || !command) return null;

  return { pid, command };
}

function detectResumeCommand(tokens: string[]): { family: LiveSessionFamily; rawId: string } | null {
  const commandStartIndexes = isNodeExecutable(tokens[0]) ? [1] : [0];

  for (const index of commandStartIndexes) {
    const family = executableFamily(tokens[index]);
    if (!family) continue;

    const args = tokens.slice(index + 1);
    const rawId = family === "codex" || family === "tcodex" ? codexResumeId(args) : flagResumeId(args);
    if (rawId) return { family, rawId };
  }

  return null;
}

function claimedRawIdsForFamily(lines: string[], family: LiveSessionFamily): Set<string> {
  const claimed = new Set<string>();
  for (const line of lines) {
    const entry = parseProcessLine(line);
    if (!entry) continue;
    const command = detectResumeCommand(splitCommandLine(entry.command));
    if (command?.family === family) claimed.add(command.rawId);
  }
  return claimed;
}

function detectPlainCodexCommand(tokens: string[], sessionFile: string | undefined): { family: LiveSessionFamily; rawId: string } | null {
  if (!sessionFile || !isPlainCodexCommand(tokens)) return null;
  const rawId = extractCodexSessionId(sessionFile);
  return rawId ? { family: "codex", rawId } : null;
}

function detectPlainClaudeCommand(tokens: string[], sessionFile: string | undefined): { family: LiveSessionFamily; rawId: string } | null {
  if (!sessionFile || !isPlainClaudeCommand(tokens)) return null;
  const rawId = extractClaudeSessionId(sessionFile);
  return rawId ? { family: "claude", rawId } : null;
}

function detectTraeAppSession(command: string, rawId: string | undefined): { family: LiveSessionFamily; rawId: string } | null {
  if (!rawId || !isTraeAppCommand(command)) return null;
  return { family: "trae", rawId };
}

function isPlainCodexCommand(tokens: string[]): boolean {
  if (isNodeExecutable(tokens[0])) return false;
  const commandStartIndexes = [0];

  for (const index of commandStartIndexes) {
    const family = executableFamily(tokens[index]);
    if (family !== "codex") continue;
    if (isCodexDesktopProcess(tokens[index])) return false;
    const args = tokens.slice(index + 1);
    if (args.includes("resume")) return false;
    if (args[0] === "app-server") return false;
    return true;
  }

  return false;
}

function isPlainClaudeCommand(tokens: string[]): boolean {
  const commandStartIndexes = isNodeExecutable(tokens[0]) ? [1] : [0];

  for (const index of commandStartIndexes) {
    const family = executableFamily(tokens[index]);
    if (family !== "claude") continue;
    const args = tokens.slice(index + 1);
    if (flagResumeId(args)) return false;
    return true;
  }

  return false;
}

function isCodexDesktopProcess(token: string | undefined): boolean {
  if (!token) return false;
  const lower = token.toLowerCase();
  if (lower.includes("/.codex/computer-use/")) return true;
  return lower.includes(".app/contents/") && !lower.includes("/contents/resources/codex");
}

function codexResumeId(args: string[]): string | null {
  const resumeIndex = args.findIndex((arg) => arg === "resume");
  if (resumeIndex < 0) return null;
  const rawId = args[resumeIndex + 1]?.trim();
  return rawId && !rawId.startsWith("-") ? rawId : null;
}

function flagResumeId(args: string[]): string | null {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--resume" || arg === "-r") {
      const rawId = args[index + 1]?.trim();
      if (rawId && !rawId.startsWith("-")) return rawId;
    }
    if (arg.startsWith("--resume=")) {
      const rawId = arg.slice("--resume=".length).trim();
      if (rawId) return rawId;
    }
  }

  return null;
}

function executableFamily(token: string | undefined): LiveSessionFamily | null {
  if (!token) return null;
  const normalized = normalizedExecutableName(token);
  if (normalized === "codex") return "codex";
  if (normalized === "tcodex") return "tcodex";
  if (normalized === "claude" || normalized === "claude-code") return "claude";
  if (normalized === "tclaude") return "tclaude";
  if (normalized === "codebuddy" || normalized === "cbc") return "codebuddy";

  const lower = token.toLowerCase();
  if (lower.includes("@openai/codex")) return "codex";
  if (lower.includes("@anthropic-ai/claude") || lower.includes("claude-code")) return "claude";
  if (lower.includes("codebuddy")) return "codebuddy";
  return null;
}

function isTraeAppCommand(command: string): boolean {
  const lower = command.toLowerCase();
  return (
    lower.includes("trae") &&
    (lower.includes(".app") || lower.includes("--user-data-dir") || lower.includes("trae cn") || lower.includes("trae.exe"))
  );
}

function isNodeExecutable(token: string | undefined): boolean {
  const normalized = normalizedExecutableName(token);
  return normalized === "node" || normalized === "nodejs";
}

function normalizedExecutableName(token: string | undefined): string {
  if (!token) return "";
  const name = token.replace(/^['"]|['"]$/g, "").split(/[\\/]/).pop()?.toLowerCase() || "";
  return name.replace(/\.(?:js|cjs|mjs|cmd|exe)$/i, "");
}

function extractCodexSessionFile(lsofOutput: string): string | null {
  for (const line of lsofOutput.split(/\r?\n/)) {
    const match = line.match(/(\S*\.codex\/sessions\/\S+?\.jsonl)\b/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractCodexSessionId(sessionFile: string): string | null {
  return sessionFile.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/)?.[1] ?? null;
}

function extractClaudeSessionFile(lsofOutput: string): string | null {
  for (const line of lsofOutput.split(/\r?\n/)) {
    const match = line.match(/(\S*\.claude\/projects\/\S+?\.jsonl)\b/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractClaudeSessionId(sessionFile: string): string | null {
  const rawId = path.basename(sessionFile, ".jsonl").trim();
  return rawId || null;
}

function extractCwdFromLsof(lsofOutput: string): string | null {
  for (const line of lsofOutput.split(/\r?\n/)) {
    if (!/\bcwd\b/.test(line)) continue;
    const start = line.indexOf("/");
    if (start >= 0) return line.slice(start).trim();
  }
  return null;
}

function latestClaudeSessionFileForCwd(cwd: string | null, homeDir: string, claimedRawIds: Set<string>): string | null {
  if (!cwd) return null;
  return newestJsonlFile(path.join(homeDir, ".claude", "projects", encodeClaudeProjectDir(cwd)), (filePath) => {
    const rawId = extractClaudeSessionId(filePath);
    return Boolean(rawId && !claimedRawIds.has(rawId));
  });
}

function latestCodexSessionFileForCwd(cwd: string | null, homeDir: string, claimedRawIds: Set<string>): string | null {
  if (!cwd) return null;
  return newestJsonlFile(path.join(homeDir, ".codex", "sessions"), (filePath) => {
    const rawId = extractCodexSessionId(filePath);
    return Boolean(rawId && !claimedRawIds.has(rawId) && codexSessionCwd(filePath) === cwd);
  });
}

function encodeClaudeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9-]/g, "-");
}

function newestJsonlFile(root: string, matches: (filePath: string) => boolean = () => true): string | null {
  if (!fs.existsSync(root)) return null;
  const candidates: Array<{ filePath: string; mtimeMs: number }> = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(filePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      try {
        candidates.push({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs });
      } catch {
        // Ignore files that disappear while scanning.
      }
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates.find((candidate) => matches(candidate.filePath))?.filePath ?? null;
}

function codexSessionCwd(filePath: string): string | null {
  try {
    const firstLine = fs.readFileSync(filePath, "utf-8").split(/\r?\n/, 1)[0];
    if (!firstLine) return null;
    const parsed = JSON.parse(firstLine) as {
      type?: unknown;
      payload?: { cwd?: unknown };
      git?: { cwd?: unknown };
    };
    if (parsed.type === "session_meta" && typeof parsed.payload?.cwd === "string") return parsed.payload.cwd;
    if (!parsed.type && typeof parsed.git?.cwd === "string") return parsed.git.cwd;
  } catch {
    return null;
  }
  return null;
}

function extractTraeStateDbPath(lsofOutput: string): string | null {
  const candidates: string[] = [];
  for (const line of lsofOutput.split(/\r?\n/)) {
    const end = line.indexOf("state.vscdb");
    if (end < 0) continue;
    const start = line.indexOf("/");
    if (start < 0) continue;
    candidates.push(line.slice(start, end + "state.vscdb".length));
  }
  return candidates.find((candidate) => candidate.includes("workspaceStorage")) ?? candidates[0] ?? null;
}

function readTraeCurrentSessionRawId(stateDbPath: string): string | null {
  try {
    const db = new DatabaseSync(stateDbPath, { readOnly: true });
    try {
      const row = db
        .prepare("SELECT value FROM ItemTable WHERE key = ? LIMIT 1")
        .get("memento/icube-ai-agent-storage") as { value?: unknown } | undefined;
      const sessionId = typeof row?.value === "string" ? extractTraeCurrentSessionId(JSON.parse(row.value)) : null;
      return sessionId ? normalizeTraeSessionRawId(sessionId) : null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

function extractTraeCurrentSessionId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if ("currentSessionId" in value && typeof value.currentSessionId === "string") return value.currentSessionId;
  for (const child of Object.values(value)) {
    const sessionId = extractTraeCurrentSessionId(child);
    if (sessionId) return sessionId;
  }
  return null;
}

function normalizeTraeSessionRawId(sessionId: string): string {
  return sessionId.startsWith("session_memory_") ? sessionId : `session_memory_${sessionId}`;
}

function splitCommandLine(command: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of command) {
    if (escaping) {
      token += char;
      escaping = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }

    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
      continue;
    }

    token += char;
  }

  if (token) tokens.push(token);
  return tokens;
}

function execText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 4 * 1024 * 1024, timeout: command === "lsof" ? 1500 : undefined }, (error, stdout, stderr) => {
      if (!error) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr?.trim() || stdout?.trim() || error.message));
    });
  });
}
