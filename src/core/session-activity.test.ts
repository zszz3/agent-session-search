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
