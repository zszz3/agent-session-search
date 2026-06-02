import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve("bin", "setup-claude-statusline.cjs");

describe("Claude statusline setup", () => {
  it("merges statusLine into existing Claude settings", () => {
    const homeDir = path.join(tmpdir(), `claude-statusline-setup-${process.pid}-${Date.now()}`);
    const settingsPath = path.join(homeDir, ".claude", "settings.json");
    try {
      mkdirSync(path.dirname(settingsPath), { recursive: true });
      writeFileSync(settingsPath, `${JSON.stringify({ effortLevel: "medium", theme: "dark" }, null, 2)}\n`, "utf8");

      execFileSync(process.execPath, [SCRIPT_PATH], {
        env: {
          ...process.env,
          AGENT_SESSION_SEARCH_TEST_HOME: homeDir,
        },
        encoding: "utf8",
      });

      const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
      expect(settings).toMatchObject({
        effortLevel: "medium",
        theme: "dark",
        statusLine: {
          type: "command",
          command:
            process.platform === "win32"
              ? "agent-session-search-claude-statusline.cmd"
              : "agent-session-search-claude-statusline",
        },
      });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
