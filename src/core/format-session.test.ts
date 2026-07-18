import { describe, expect, it } from "vitest";
import { formatSessionMarkdown, formatSessionPlainText } from "./format-session";
import type { IndexedSession, SessionMessage, SessionTraceEvent } from "./types";

const session: IndexedSession = {
  sessionKey: "codex:abc",
  rawId: "abc",
  source: "codex-cli",
  projectPath: "/repo",
  filePath: "/tmp/rollout.jsonl",
  originalTitle: "Test Session",
  firstQuestion: "Test Session",
  timestamp: new Date("2026-06-01T10:00:00Z").getTime(),
  fileMtimeMs: 10,
  fileSize: 100,
  prUrl: null,
  prNumber: null,
};

const messages: SessionMessage[] = [
  { role: "user", content: "run tests", timestamp: "2026-06-01T10:00:00Z", index: 0 },
  { role: "assistant", content: "I will run them.", timestamp: "2026-06-01T10:01:00Z", index: 1 },
];

const traceEvents: SessionTraceEvent[] = [
  {
    index: 0,
    kind: "tool_call",
    source: "codex",
    title: "shell_command · npm test",
    detail: '{\n  "command": "npm test"\n}',
    timestamp: "2026-06-01T10:02:00Z",
    callId: "call-1",
  },
  {
    index: 1,
    kind: "event",
    source: "codex",
    eventType: "exec_command_end",
    title: "shell · npm test",
    detail: "stdout:\npass",
    timestamp: "2026-06-01T10:03:00Z",
    callId: "call-1",
    status: "success",
  },
];

describe("formatSessionMarkdown", () => {
  it("omits trace events by default", () => {
    expect(formatSessionMarkdown(session, messages)).not.toContain("Tool Trace");
  });

  it("includes trace events when provided", () => {
    const markdown = formatSessionMarkdown(session, messages, traceEvents);

    expect(markdown).toContain("## Tool Trace");
    expect(markdown).toContain("shell_command · npm test");
    expect(markdown).toContain("shell · npm test");
    expect(markdown).toContain("stdout:");
  });

  it("uses the shared source label for Qoder exports", () => {
    expect(formatSessionMarkdown({ ...session, source: "qoder" }, messages)).toContain("Qoder · `/repo`");
  });
});

describe("formatSessionPlainText", () => {
  it("includes trace events when provided", () => {
    const text = formatSessionPlainText(session, messages, traceEvents);

    expect(text).toContain("Tool Trace");
    expect(text).toContain("shell_command · npm test");
    expect(text).toContain("stdout:");
  });
});
