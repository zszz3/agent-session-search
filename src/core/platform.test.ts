import { describe, expect, it } from "vitest";
import {
  buildExpectResumePtyScript,
  getExpectResumeProcessSpec,
  getResumeCommand,
  getResumeProcessSpec,
  resolveMacApplicationName,
} from "./platform";
import type { SessionSearchResult } from "./types";

describe("platform application resolution", () => {
  it("returns the first macOS application name that resolves", async () => {
    const calls: string[][] = [];
    const runner = async (_command: string, args: string[]) => {
      calls.push(args);
      if (args[1].includes('"iTerm"')) throw new Error("not found");
    };

    await expect(resolveMacApplicationName(["iTerm", "iTerm2"], runner)).resolves.toBe("iTerm2");
    expect(calls).toHaveLength(2);
  });

  it("returns null when none of the macOS application names resolve", async () => {
    const runner = async () => {
      throw new Error("not found");
    };

    await expect(resolveMacApplicationName(["iTerm", "iTerm2"], runner)).resolves.toBeNull();
  });
});

describe("resume commands", () => {
  it("uses CodeBuddy CLI resume syntax for CodeBuddy sessions", () => {
    const session = {
      source: "codebuddy-cli",
      rawId: "codebuddy-1",
      projectPath: "/repo",
    } as SessionSearchResult;

    expect(getResumeCommand(session)).toBe("cd /repo && codebuddy --resume codebuddy-1");
  });
});

describe("resume process specs", () => {
  it("builds Codex resume as binary args with cwd instead of shell text", () => {
    const session = {
      source: "codex-cli",
      rawId: "codex-1",
      projectPath: "/repo with spaces",
    } as SessionSearchResult;

    expect(getResumeProcessSpec(session)).toMatchObject({
      command: "codex",
      args: ["resume", "codex-1"],
      cwd: "/repo with spaces",
      displayCommand: "cd '/repo with spaces' && codex resume codex-1",
    });
  });

  it("builds Claude resume as binary args", () => {
    const session = {
      source: "claude-cli",
      rawId: "claude-1",
      projectPath: "/repo",
    } as SessionSearchResult;

    expect(getResumeProcessSpec(session)).toMatchObject({
      command: "claude",
      args: ["--resume", "claude-1"],
      cwd: "/repo",
    });
  });
});

describe("resume process PTY wrapper", () => {
  it("wraps a resume process with expect while preserving the original argv", () => {
    const session = {
      source: "codex-cli",
      rawId: "codex-1",
      projectPath: "/repo with spaces",
    } as SessionSearchResult;

    const wrapped = getExpectResumeProcessSpec(getResumeProcessSpec(session), "/tmp/agent-session-search-resume.exp");

    expect(wrapped).toMatchObject({
      command: "expect",
      args: ["/tmp/agent-session-search-resume.exp", "codex", "resume", "codex-1"],
      cwd: "/repo with spaces",
      displayCommand: "cd '/repo with spaces' && codex resume codex-1",
    });
    const script = buildExpectResumePtyScript();
    expect(script).toContain("spawn -noecho {*}$argv");
    expect(script).toContain("interact");
  });

  it("sets an initial PTY size for full-screen TUIs", () => {
    const script = buildExpectResumePtyScript({ cols: 132, rows: 34 });

    expect(script).toContain('set stty_init "rows 34 columns 132"');
    expect(script).toContain("spawn -noecho {*}$argv");
  });
});
