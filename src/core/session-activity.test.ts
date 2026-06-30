import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { detectLiveSessionsFromProcessLines, loadLiveSessionSnapshot } from "./session-activity";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => import("node:sqlite").DatabaseSync };

describe("live session detection", () => {
  it("detects Codex, Claude, and CodeBuddy resume commands without matching unrelated commands", () => {
    expect(
      detectLiveSessionsFromProcessLines([
        "123 /opt/homebrew/bin/codex resume codex-1",
        '124 /opt/homebrew/bin/codex resume "codex two"',
        "125 /opt/homebrew/bin/claude --resume claude-1",
        "126 /opt/homebrew/bin/claude --resume=claude-2",
        "127 /tmp/session-search-fixtures/.codebuddy/bin/codebuddy --resume codebuddy-1",
        "128 rg codex resume ignored",
      ]),
    ).toEqual([
      { family: "codex", rawId: "codex-1", pid: 123 },
      { family: "codex", rawId: "codex two", pid: 124 },
      { family: "claude", rawId: "claude-1", pid: 125 },
      { family: "claude", rawId: "claude-2", pid: 126 },
      { family: "codebuddy", rawId: "codebuddy-1", pid: 127 },
    ]);
  });

  it("detects tclaude and tcodex resume commands with their own families and resume syntaxes", () => {
    expect(
      detectLiveSessionsFromProcessLines([
        "201 /Users/dev/.nvm/versions/node/v22/bin/tclaude --resume tclaude-1",
        "202 /Users/dev/.nvm/versions/node/v22/bin/tcodex resume tcodex-1",
      ]),
    ).toEqual([
      { family: "tclaude", rawId: "tclaude-1", pid: 201 },
      { family: "tcodex", rawId: "tcodex-1", pid: 202 },
    ]);
  });

  it("maps a plain running Codex process through its open session file", () => {
    expect(
      detectLiveSessionsFromProcessLines(
        [
          "223 node /opt/homebrew/bin/codex",
          "224 /opt/homebrew/lib/node_modules/@openai/codex/vendor/bin/codex",
          "225 /Applications/Codex.app/Contents/Resources/codex app-server --listen stdio://",
        ],
        new Map([
          [
            224,
            "/tmp/session-search-fixtures/.codex/sessions/2026/06/01/rollout-2026-06-01T19-11-30-019e82e1-b60d-7b12-95c3-d33e1d05f0a9.jsonl",
          ],
        ]),
      ),
    ).toEqual([{ family: "codex", rawId: "019e82e1-b60d-7b12-95c3-d33e1d05f0a9", pid: 224 }]);
  });

  it("maps a plain running Claude process through its open session file", () => {
    expect(
      detectLiveSessionsFromProcessLines(
        [
          "323 node /opt/homebrew/bin/claude",
          "324 /opt/homebrew/bin/claude",
          "325 /opt/homebrew/bin/claude --resume claude-resumed",
        ],
        new Map(),
        new Map([[324, "/tmp/session-search-fixtures/.claude/projects/-work-app/claude-live-1.jsonl"]]),
      ),
    ).toEqual([
      { family: "claude", rawId: "claude-live-1", pid: 324 },
      { family: "claude", rawId: "claude-resumed", pid: 325 },
    ]);
  });

  it("falls back to the newest Claude project session for a plain process cwd", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-search-claude-live-cwd-"));
    const projectDir = path.join(homeDir, ".claude", "projects", "-work-app");
    const sessionFile = path.join(projectDir, "claude-cwd-live.jsonl");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(sessionFile, JSON.stringify({ type: "user", message: { content: "hello" } }) + "\n");

    const snapshot = await loadLiveSessionSnapshot({
      platform: "darwin",
      homeDir,
      runner: async (command, args) => {
        if (command === "/bin/ps") return "401 /opt/homebrew/bin/claude";
        if (command === "lsof" && args.join(" ") === "-p 401") {
          return "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nclaude 401 user cwd DIR 1,4 0 1 /work/app\n";
        }
        return "";
      },
    });

    expect(snapshot.sessions).toEqual([{ family: "claude", rawId: "claude-cwd-live", pid: 401 }]);

    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("does not reuse an already detected Claude resume session for cwd fallback", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-search-claude-live-claimed-"));
    const projectDir = path.join(homeDir, ".claude", "projects", "-work-app");
    fs.mkdirSync(projectDir, { recursive: true });
    const resumedFile = path.join(projectDir, "resumed-session.jsonl");
    const plainFile = path.join(projectDir, "plain-session.jsonl");
    fs.writeFileSync(plainFile, JSON.stringify({ type: "user", message: { content: "plain" } }) + "\n");
    fs.writeFileSync(resumedFile, JSON.stringify({ type: "user", message: { content: "resumed" } }) + "\n");
    const newer = new Date("2026-06-24T12:01:00Z");
    const older = new Date("2026-06-24T12:00:00Z");
    fs.utimesSync(resumedFile, newer, newer);
    fs.utimesSync(plainFile, older, older);

    const snapshot = await loadLiveSessionSnapshot({
      platform: "darwin",
      homeDir,
      runner: async (command, args) => {
        if (command === "/bin/ps") return "501 /opt/homebrew/bin/claude --resume resumed-session\n502 /opt/homebrew/bin/claude";
        if (command === "lsof" && args.join(" ") === "-p 502") {
          return "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nclaude 502 user cwd DIR 1,4 0 1 /work/app\n";
        }
        return "";
      },
    });

    expect(snapshot.sessions).toEqual([
      { family: "claude", rawId: "resumed-session", pid: 501 },
      { family: "claude", rawId: "plain-session", pid: 502 },
    ]);

    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("falls back to the newest Codex session with the process cwd", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-search-codex-live-cwd-"));
    const sessionsDir = path.join(homeDir, ".codex", "sessions", "2026", "06", "24");
    const sessionFile = path.join(sessionsDir, "rollout-2026-06-24T12-00-00-019ef947-9168-7690-91e2-df63063e00bc.jsonl");
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      sessionFile,
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-06-24T12:00:00.000Z",
        payload: { id: "019ef947-9168-7690-91e2-df63063e00bc", cwd: "/work/app" },
      }) + "\n",
    );

    const snapshot = await loadLiveSessionSnapshot({
      platform: "darwin",
      homeDir,
      runner: async (command, args) => {
        if (command === "/bin/ps") return "402 /opt/homebrew/bin/codex";
        if (command === "lsof" && args.join(" ") === "-p 402") {
          return "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\ncodex 402 user cwd DIR 1,4 0 1 /work/app\n";
        }
        return "";
      },
    });

    expect(snapshot.sessions).toEqual([{ family: "codex", rawId: "019ef947-9168-7690-91e2-df63063e00bc", pid: 402 }]);

    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("does not inspect Codex Desktop app helper processes as CLI sessions", async () => {
    let lsofCalls = 0;
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-search-codex-desktop-ignore-"));
    const snapshot = await loadLiveSessionSnapshot({
      platform: "darwin",
      homeDir,
      runner: async (command, args) => {
        if (command === "/bin/ps") {
          return [
            "601 /Applications/Codex.app/Contents/MacOS/Codex",
            "602 /Applications/Codex.app/Contents/Frameworks/Codex Framework.framework/Helpers/Codex (Renderer).app/Contents/MacOS/Codex (Renderer) --type=renderer",
            "603 /Applications/Codex.app/Contents/Resources/codex app-server --analytics-default-enabled",
            "604 /opt/homebrew/bin/codex",
            "605 node /opt/homebrew/bin/codex",
            "606 /Users/test/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService",
          ].join("\n");
        }
        if (command === "lsof") {
          lsofCalls++;
          expect(args).toEqual(["-p", "604"]);
          return "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\ncodex 604 user cwd DIR 1,4 0 1 /work/app\n";
        }
        return "";
      },
    });

    expect(snapshot.sessions).toEqual([]);
    expect(lsofCalls).toBe(1);

    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("maps a running Trae app process through its workspace state database", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-search-trae-live-"));
    const dbPath = path.join(root, "User", "workspaceStorage", "abc", "state.vscdb");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
      "memento/icube-ai-agent-storage",
      JSON.stringify({ currentSessionId: "trae-session-1" }),
    );
    db.close();

    const snapshot = await loadLiveSessionSnapshot({
      platform: "darwin",
      runner: async (command, args) => {
        if (command === "/bin/ps") {
          return "3456 /Applications/Trae CN.app/Contents/MacOS/Electron --user-data-dir=/tmp/Trae CN";
        }
        if (command === "lsof" && args.join(" ") === "-p 3456") {
          return `Electron 3456 user  txt REG 1,4 0 1 ${dbPath}\n`;
        }
        return "";
      },
    });

    expect(snapshot.sessions).toEqual([{ family: "trae", rawId: "session_memory_trae-session-1", pid: 3456 }]);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("skips Trae workspace inspection when Trae monitoring is disabled", async () => {
    let lsofCalls = 0;
    const snapshot = await loadLiveSessionSnapshot({
      platform: "darwin",
      includeTrae: false,
      runner: async (command) => {
        if (command === "/bin/ps") return "3456 /Applications/Trae CN.app/Contents/MacOS/Electron --user-data-dir=/tmp/Trae CN";
        if (command === "lsof") lsofCalls++;
        throw new Error("Trae lsof should not run");
      },
    });

    expect(snapshot).toMatchObject({ sessions: [] });
    expect(snapshot.error).toBeUndefined();
    expect(lsofCalls).toBe(0);
  });
});
