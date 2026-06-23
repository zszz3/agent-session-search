import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  loadClaudeCliSessionRows,
  loadCodeBuddyCliSessionFile,
  loadCodexSessionFile,
  parseJsonlText,
} from "./session-loader";
import { writeMigratedSession } from "./session-migration-writers";
import type { MigrationAgent, PortableSession } from "./types";

const SESSION_ID = "10000000-0000-4000-8000-000000000001";
const MESSAGE_IDS = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
];
const NOW = new Date("2026-06-23T06:07:08.901Z");

function portable(): PortableSession {
  return {
    sourceSessionKey: "codex:source",
    sourceAgent: "codex",
    title: "迁移标题 🚀",
    projectPath: "/Users/测试/My Project",
    startedAt: "2026-06-20T01:02:03.004Z",
    messages: [
      { role: "user", content: "你好，世界 🌏", timestamp: "2026-06-20T01:02:04.005Z", index: 0 },
      { role: "assistant", content: "已收到\n第二行", timestamp: "2026-06-20T01:02:05.006Z", index: 1 },
      { role: "user", content: "继续", timestamp: "2026-06-20T01:02:06.007Z", index: 2 },
    ],
  };
}

function idFactory(ids: string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index++];
    if (!id) throw new Error("Unexpected idFactory call");
    return id;
  };
}

function readRows(filePath: string): Array<Record<string, any>> {
  const text = fs.readFileSync(filePath, "utf8");
  expect(text.endsWith("\n")).toBe(true);
  for (const line of text.trimEnd().split("\n")) expect(() => JSON.parse(line)).not.toThrow();
  return parseJsonlText(text) as Array<Record<string, any>>;
}

function expectRoundTrip(
  target: MigrationAgent,
  sessionId: string,
  filePath: string,
  rows: Array<Record<string, any>>,
): void {
  const loaded =
    target === "codex"
      ? loadCodexSessionFile(filePath)
      : target === "claude"
        ? loadClaudeCliSessionRows(filePath, rows)
        : loadCodeBuddyCliSessionFile(filePath);

  expect(loaded?.session).toMatchObject({
    rawId: sessionId,
    projectPath: portable().projectPath,
    originalTitle: portable().title,
    source: target === "codex" ? "codex-cli" : target === "claude" ? "claude-cli" : "codebuddy-cli",
  });
  expect(loaded?.messages.map(({ role, content, timestamp }) => ({ role, content, timestamp }))).toEqual(
    portable().messages.map(({ role, content, timestamp }) => ({ role, content, timestamp })),
  );
}

describe("writeMigratedSession", () => {
  it("writes a native Codex rollout and round-trips it through the existing loader", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-writer-codex-"));

    const pending = writeMigratedSession({
      target: "codex",
      session: portable(),
      homeDir,
      now: NOW,
      idFactory: idFactory([SESSION_ID]),
    });
    expect(pending).toBeInstanceOf(Promise);
    const result = await pending;

    expect(result).toEqual({
      sessionId: SESSION_ID,
      filePath: path.join(
        homeDir,
        ".codex",
        "sessions",
        "2026",
        "06",
        "23",
        `rollout-2026-06-23T06-07-08-901Z-${SESSION_ID}.jsonl`,
      ),
    });
    expect(fs.existsSync(path.join(homeDir, ".codex", "session_index.jsonl"))).toBe(false);

    const rows = readRows(result.filePath);
    expect(rows[0]).toEqual({
      type: "session_meta",
      timestamp: portable().startedAt,
      payload: {
        id: SESSION_ID,
        timestamp: portable().startedAt,
        cwd: portable().projectPath,
        title: portable().title,
        originator: "agent-session-search",
        cli_version: "migration",
      },
    });
    expect(rows.slice(1).map((row) => row.payload.content[0].type)).toEqual([
      "input_text",
      "output_text",
      "input_text",
    ]);
    expectRoundTrip("codex", result.sessionId, result.filePath, rows);

    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("writes native Claude rows with a unique UUID parent chain and embedded title", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-writer-claude-"));

    const result = await writeMigratedSession({
      target: "claude",
      session: portable(),
      homeDir,
      now: NOW,
      idFactory: idFactory([SESSION_ID, ...MESSAGE_IDS]),
    });

    expect(result.filePath).toBe(
      path.join(homeDir, ".claude", "projects", "-Users----My-Project", `${SESSION_ID}.jsonl`),
    );
    expect(fs.existsSync(path.join(homeDir, ".claude", "sessions"))).toBe(false);

    const rows = readRows(result.filePath);
    expect(rows[0]).toMatchObject({ type: "ai-title", aiTitle: portable().title, sessionId: SESSION_ID });
    const messages = rows.slice(1);
    expect(messages.map((row) => row.uuid)).toEqual(MESSAGE_IDS);
    expect(messages.map((row) => row.parentUuid)).toEqual([null, MESSAGE_IDS[0], MESSAGE_IDS[1]]);
    expect(messages.map((row) => [row.type, row.message.role])).toEqual([
      ["user", "user"],
      ["assistant", "assistant"],
      ["user", "user"],
    ]);
    for (const [index, row] of messages.entries()) {
      expect(row).toMatchObject({
        cwd: portable().projectPath,
        sessionId: SESSION_ID,
        timestamp: portable().messages[index].timestamp,
        entrypoint: "cli",
        version: "migration",
      });
    }
    expectRoundTrip("claude", result.sessionId, result.filePath, rows);

    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("writes native CodeBuddy title and message rows with millisecond timestamps and a parent chain", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-writer-codebuddy-"));

    const result = await writeMigratedSession({
      target: "codebuddy",
      session: portable(),
      homeDir,
      now: NOW,
      idFactory: idFactory([SESSION_ID, ...MESSAGE_IDS]),
    });

    expect(result.filePath).toBe(
      path.join(homeDir, ".codebuddy", "projects", "Users----My-Project", `${SESSION_ID}.jsonl`),
    );

    const rows = readRows(result.filePath);
    expect(rows[0]).toEqual({
      timestamp: new Date(portable().startedAt).getTime(),
      type: "ai-title",
      aiTitle: portable().title,
      sessionId: SESSION_ID,
      cwd: portable().projectPath,
    });
    const messages = rows.slice(1);
    expect(messages.map((row) => row.id)).toEqual(MESSAGE_IDS);
    expect(messages.map((row) => row.parentId)).toEqual([undefined, MESSAGE_IDS[0], MESSAGE_IDS[1]]);
    expect(messages.map((row) => row.timestamp)).toEqual(
      portable().messages.map((message) => new Date(message.timestamp).getTime()),
    );
    expect(messages.map((row) => row.content[0].type)).toEqual(["input_text", "output_text", "input_text"]);
    expectRoundTrip("codebuddy", result.sessionId, result.filePath, rows);

    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("uses crypto UUIDs by default and keeps all output under the injected home", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-writer-default-id-"));

    const result = await writeMigratedSession({ target: "codex", session: portable(), homeDir, now: NOW });

    expect(result.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(path.relative(homeDir, result.filePath)).not.toMatch(/^\.\./);
    expect(result.filePath.startsWith(os.homedir())).toBe(false);

    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("deletes the temporary file and leaves no final file when validation fails", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-writer-validation-"));
    let temporaryFile = "";

    await expect(
      writeMigratedSession({
        target: "codex",
        session: portable(),
        homeDir,
        now: NOW,
        idFactory: idFactory([SESSION_ID]),
        validate: (filePath) => {
          temporaryFile = filePath;
          return null;
        },
      }),
    ).rejects.toThrow(/validation/i);

    expect(temporaryFile).not.toBe("");
    expect(fs.existsSync(temporaryFile)).toBe(false);
    expect(filesUnder(homeDir)).toEqual([]);
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("deletes the temporary file and leaves no final file when atomic rename fails", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-writer-rename-"));
    let temporaryFile = "";
    let finalFile = "";

    await expect(
      writeMigratedSession({
        target: "codex",
        session: portable(),
        homeDir,
        now: NOW,
        idFactory: idFactory([SESSION_ID]),
        rename: (oldPath, newPath) => {
          temporaryFile = oldPath;
          finalFile = newPath;
          throw new Error("rename exploded");
        },
      }),
    ).rejects.toThrow("rename exploded");

    expect(temporaryFile).not.toBe("");
    expect(fs.existsSync(temporaryFile)).toBe(false);
    expect(fs.existsSync(finalFile)).toBe(false);
    expect(filesUnder(homeDir)).toEqual([]);
    fs.rmSync(homeDir, { recursive: true, force: true });
  });
});

function filesUnder(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(entryPath));
    else files.push(entryPath);
  }
  return files;
}
