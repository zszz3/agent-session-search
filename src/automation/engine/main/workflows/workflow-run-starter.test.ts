import { describe, expect, test } from "vitest";
import { workflowRunConfigurationSnapshot } from "./workflow-run-starter";

describe("workflow run configuration snapshot", () => {
  test("keeps explainable routing fields and excludes sensitive configuration", () => {
    expect(workflowRunConfigurationSnapshot({
      id: "agent-1",
      runtimeAgentId: "codex",
      channelId: "channel-1",
      modelId: "gpt-test",
      reasoningEffort: "high",
      revision: 4,
    })).toEqual({
      configuredAgentId: "agent-1",
      runtimeId: "codex",
      channelId: "channel-1",
      modelId: "gpt-test",
      reasoningEffort: "high",
      agentRevision: 4,
    });
  });
});
