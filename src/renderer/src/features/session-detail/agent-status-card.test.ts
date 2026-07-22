import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionAgentStatus } from "../../../../core/session-agent-status";
import { AgentStatusCard } from "./agent-status-card";

const populatedStatus: SessionAgentStatus = {
  state: "waiting_user",
  latestUserRequest: "修复登录回归并保留旧 API",
  todos: [
    { id: "1", content: "补回归测试", status: "in_progress" },
    { id: "2", content: "验证构建", status: "pending" },
    { id: "3", content: "复现问题", status: "completed" },
  ],
  toolCallCount: 7,
  tools: [
    { name: "shell_command", count: 4, failureCount: 1, unknownCount: 0 },
    { name: "apply_patch", count: 3, failureCount: 0, unknownCount: 0 },
  ],
  failureCount: 1,
  latestFailure: {
    title: "shell_command",
    detail: "npm test exited 1",
    timestamp: "2026-07-22T08:10:00Z",
  },
  compactionCount: 2,
  abortedCount: 0,
  projectPath: "/repo",
  firstActivityAt: "2026-07-22T08:00:00Z",
  lastActivityAt: "2026-07-22T08:12:00Z",
  messageCount: 300,
  traceEventCount: 42,
  analyzedAt: "2026-07-22T09:00:00.000Z",
};

describe("Agent status card", () => {
  it("renders a compact grounded status summary", () => {
    const html = renderToStaticMarkup(createElement(AgentStatusCard, { language: "zh", status: populatedStatus }));

    expect(html).toContain("Agent 状态");
    expect(html).toContain("等待用户");
    expect(html).toContain("修复登录回归并保留旧 API");
    expect(html).toContain("shell_command");
    expect(html).toContain("4 次");
    expect(html).toContain("补回归测试");
    expect(html).toContain("300 条消息 · 42 条轨迹");
    expect(html).toContain("npm test exited 1");
  });

  it("uses one compact empty-evidence message without empty sections", () => {
    const status: SessionAgentStatus = {
      ...populatedStatus,
      state: "unknown",
      latestUserRequest: null,
      todos: [],
      toolCallCount: 0,
      tools: [],
      failureCount: 0,
      latestFailure: null,
      compactionCount: 0,
      abortedCount: 0,
      messageCount: 0,
      traceEventCount: 0,
    };
    const html = renderToStaticMarkup(createElement(AgentStatusCard, { language: "zh", status }));

    expect(html).toContain("没有足够的消息或轨迹来判断当前状态");
    expect(html).not.toContain("agent-status-tools");
    expect(html).not.toContain("agent-status-todos");
  });
});
