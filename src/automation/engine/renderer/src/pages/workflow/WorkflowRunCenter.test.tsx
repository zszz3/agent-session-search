import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { RegisteredArtifact, WorkflowRunState } from "../../../../shared/types";
import { WorkflowRunCenter } from "./WorkflowRunCenter";

function run(input: { runId: string; status: WorkflowRunState["status"]; startedAt: number; finishedAt?: number; lastError?: string }): WorkflowRunState {
  const plan = {
    workflowId: "workflow",
    objective: "Prepare a report",
    graphVersion: input.runId === "latest" ? 4 : 3,
    definition: { workflowId: "workflow", graphVersion: 1, objective: "Prepare a report", nodes: [], edges: [] },
    approvedBy: "desktop-user",
    frozenAt: input.startedAt,
    acceptanceCriteria: [],
    roleDefaults: {},
    nodes: [{ nodeId: "research", title: "Research", role: "executor", execModel: "llm", executionMode: "one-shot", modelProfile: "fast", modelId: "gpt-test" }],
    budget: { context: { maxContextTokens: 4000 } },
  } as unknown as WorkflowRunState["workflowV2Plan"];
  return {
    runId: input.runId,
    workflowId: "workflow",
    status: input.status,
    workflowV2Plan: plan,
    progress: [{
      nodeId: "research",
      title: "Research",
      status: input.status === "failed" ? "failed" : "completed",
      detail: input.status === "failed" ? "Provider disconnected" : "Report ready",
      outputs: { result: "ready" },
      inputSummary: { topic: "workflow history", secret: "[REDACTED]" },
      messages: [{ id: `${input.runId}:assistant`, role: "assistant", content: "Historical research answer", at: input.startedAt + 1_500 }],
    }],
    events: [
      { type: "node_started", nodeId: "research", at: input.startedAt + 1_000, attempt: 1 },
      input.status === "failed"
        ? { type: "node_failed", nodeId: "research", at: (input.finishedAt ?? input.startedAt) + 2_000, attempt: 1, error: "Provider disconnected" }
        : { type: "node_completed", nodeId: "research", at: input.finishedAt ?? input.startedAt + 2_000, attempt: 1 },
    ],
    contextDocument: "",
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    lastError: input.lastError,
    configurationSnapshot: { configuredAgentId: "agent-1", runtimeId: "codex", channelId: "channel-1", modelId: "gpt-test", agentRevision: 2 },
  };
}

describe("WorkflowRunCenter", () => {
  test("does not render while closed", () => {
    expect(renderToStaticMarkup(<WorkflowRunCenter runs={[]} open={false} onSelectRun={() => undefined} onClose={() => undefined} />)).toBe("");
  });

  test("renders loading and load failure states explicitly", () => {
    const loading = renderToStaticMarkup(<WorkflowRunCenter runs={[]} loading open onSelectRun={() => undefined} onClose={() => undefined} />);
    const failed = renderToStaticMarkup(<WorkflowRunCenter runs={[]} error="Could not load run history" open onSelectRun={() => undefined} onClose={() => undefined} />);

    expect(loading).toContain("Loading run history");
    expect(failed).toContain("Could not load run history");
  });

  test("limits large run lists and lets the user load more", () => {
    const runs = Array.from({ length: 55 }, (_, index) => run({ runId: `run-${index}`, status: "completed", startedAt: index + 1, finishedAt: index + 2 }));
    const html = renderToStaticMarkup(<WorkflowRunCenter runs={runs} open onSelectRun={() => undefined} onClose={() => undefined} />);

    expect(html).toContain("Load more runs");
    expect(html).toContain("50/55");
  });

  test("renders the selected historical run with frozen configuration, timeline, and errors", () => {
    const html = renderToStaticMarkup(<WorkflowRunCenter
      runs={[
        run({ runId: "latest", status: "completed", startedAt: 2_000, finishedAt: 62_000 }),
        run({ runId: "failed-run", status: "failed", startedAt: 1_000, finishedAt: 31_000, lastError: "Provider disconnected" }),
      ]}
      artifacts={[{
        id: "artifact-1",
        target: "failed-run",
        kind: "text",
        title: "Failure report",
        content: "A bounded historical artifact preview",
        registeredAt: 30_000,
      } satisfies RegisteredArtifact]}
      open
      selectedRunId="failed-run"
      onSelectRun={() => undefined}
      onClose={() => undefined}
    />);

    expect(html).toContain("Run history");
    expect(html).toContain("2 runs");
    expect(html).toContain("failed-run");
    expect(html).toContain("Frozen configuration");
    expect(html).toContain("Read-only snapshot");
    expect(html).toContain("desktop-user");
    expect(html).toContain("Agent revision");
    expect(html).toContain("agent-1");
    expect(html).toContain("Graph version");
    expect(html).toContain("v3");
    expect(html).toContain("Research");
    expect(html).toContain("Node status: failed");
    expect(html).toContain("llm · gpt-test");
    expect(html).toContain("node failed");
    expect(html).toContain("Provider disconnected");
    expect(html).toContain("Message history");
    expect(html).toContain("Historical research answer");
    expect(html).toContain("Outputs");
    expect(html).toContain("Input summary");
    expect(html).toContain("[REDACTED]");
    expect(html).toContain("Filter runs");
    expect(html).toContain("Trigger source");
    expect(html).toContain("Failure report");
    expect(html).toContain("A bounded historical artifact preview");
  });

  test("shows terminal metadata and result summary in the run list", () => {
    const html = renderToStaticMarkup(<WorkflowRunCenter
      runs={[run({ runId: "finished-run", status: "completed", startedAt: 2_000, finishedAt: 62_000 })]}
      open
      onSelectRun={() => undefined}
      onClose={() => undefined}
    />);

    expect(html).toContain("manual");
    expect(html).toContain("ready");
    expect(html).toContain("Finished");
  });

  test("renders node execution telemetry for runtime, channel, model, attempts, tokens, cost, and duration", () => {
    const observedRun = run({ runId: "observed-run", status: "completed", startedAt: 2_000, finishedAt: 62_000 });
    (observedRun.progress[0] as WorkflowRunState["progress"][number] & { telemetry: unknown }).telemetry = {
      provider: "anthropic",
      runtimeId: "codex",
      channelId: "codex-openai",
      modelId: "gpt-5.5",
      attempt: 2,
      startedAt: 10_000,
      finishedAt: 25_000,
      inputTokens: 1_200,
      outputTokens: 340,
      reasoningTokens: 120,
      cacheReadInputTokens: 80,
      cacheWrite5mInputTokens: 40,
      cacheWrite1hInputTokens: 20,
      totalTokens: 1_540,
      estimatedCost: 0.031,
    };

    const html = renderToStaticMarkup(<WorkflowRunCenter
      runs={[observedRun]}
      open
      selectedRunId="observed-run"
      onSelectRun={() => undefined}
      onClose={() => undefined}
    />);

    expect(html).toContain("Runtime");
    expect(html).toContain("codex");
    expect(html).toContain("Channel");
    expect(html).toContain("codex-openai");
    expect(html).toContain("Attempts");
    expect(html).toContain("2");
    expect(html).toContain("Token usage");
    expect(html).toContain("Input tokens");
    expect(html).toContain("1,200");
    expect(html).toContain("Reasoning tokens");
    expect(html).toContain("120");
    expect(html).toContain("Cache read");
    expect(html).toContain("80");
    expect(html).toContain("Cache write · 5 min");
    expect(html).toContain("40");
    expect(html).toContain("Cache write · 1 hour");
    expect(html).toContain("20");
    expect(html).toContain("1,540");
    expect(html).toContain("$0.031");
    expect(html).toContain("15s");
  });

  test("renders historical human input and reviewer decisions", () => {
    const observedRun = run({ runId: "decision-run", status: "failed", startedAt: 2_000, finishedAt: 62_000 });
    observedRun.progress[0]!.inputRequest = { kind: "script_parameters", parameters: [{ key: "topic", label: "Topic", location: "body", valueType: "string", source: "user", required: true }] };
    observedRun.events.push({
      type: "gate_opened",
      nodeId: "research",
      at: 12_000,
      detail: "Reviewer requested human decision",
      intervention: {
        nodeId: "research",
        source: "review_rejection",
        reason: "Evidence is incomplete",
        allowedActions: ["continue", "reject"],
        requestedAt: 12_000,
        reviewVerdict: { decision: "reject", reasons: ["Evidence is incomplete"], riskLevel: "medium", confidence: "high" },
      },
    });

    const html = renderToStaticMarkup(<WorkflowRunCenter runs={[observedRun]} open selectedRunId="decision-run" onSelectRun={() => undefined} onClose={() => undefined} />);

    expect(html).toContain("Input requested");
    expect(html).toContain("topic");
    expect(html).toContain("Reviewer requested human decision");
    expect(html).toContain("review_rejection");
    expect(html).toContain("reject");
  });

  test("uses OpenAI cached-input semantics separately from Anthropic cache fields", () => {
    const observedRun = run({ runId: "openai-run", status: "completed", startedAt: 2_000, finishedAt: 62_000 });
    (observedRun.progress[0] as WorkflowRunState["progress"][number] & { telemetry: unknown }).telemetry = {
      provider: "openai",
      attempt: 1,
      startedAt: 10_000,
      finishedAt: 20_000,
      inputTokens: 1_000,
      cacheReadInputTokens: 400,
      outputTokens: 200,
      totalTokens: 1_200,
    };

    const html = renderToStaticMarkup(<WorkflowRunCenter
      runs={[observedRun]}
      open
      selectedRunId="openai-run"
      onSelectRun={() => undefined}
      onClose={() => undefined}
    />);

    expect(html).toContain("Cached input (OpenAI)");
    expect(html).toContain("400");
    expect(html).toContain("Cache read (Anthropic)</b>—");
    expect(html).toContain("Cache write · 5 min</b>—");
  });

  test("shows persisted interactive conversation messages for the selected run node", () => {
    const html = renderToStaticMarkup(<WorkflowRunCenter
      runs={[run({ runId: "interactive-run", status: "completed", startedAt: 2_000, finishedAt: 62_000 })]}
      conversations={[{
        conversationId: "conversation-1",
        workflowId: "workflow",
        runId: "interactive-run",
        nodeId: "research",
        configuredAgentId: "agent",
        modelId: "model",
        workDir: "C:/workspace",
        status: "closed",
        messages: [{ id: "message-1", role: "user", content: "Persist this follow-up", at: 3_000 }],
        createdAt: 2_000,
        updatedAt: 3_000,
        lastActivityAt: 3_000,
      }]}
      open
      selectedRunId="interactive-run"
      onSelectRun={() => undefined}
      onClose={() => undefined}
    />);

    expect(html).toContain("Persist this follow-up");
    expect(html).not.toContain("Historical research answer");
  });

  test("distinguishes archived tool calls from their results", () => {
    const archivedRun = run({ runId: "tool-run", status: "completed", startedAt: 2_000, finishedAt: 62_000 });
    archivedRun.progress[0].messages = [
      { id: "tool-call", role: "tool", eventType: "tool_call", name: "read_file", content: '{"path":"README.md"}', at: 3_000 },
      { id: "tool-result", role: "tool", eventType: "tool_result", name: "read_file", content: "README contents", at: 4_000 },
    ];
    const html = renderToStaticMarkup(<WorkflowRunCenter
      runs={[archivedRun]}
      open
      selectedRunId="tool-run"
      language="zh"
      onSelectRun={() => undefined}
      onClose={() => undefined}
    />);

    expect(html).toContain("工具调用 · read_file");
    expect(html).toContain("工具结果 · read_file");
    expect(html).toContain("{&quot;path&quot;:&quot;README.md&quot;}");
    expect(html).toContain("README contents");
  });

  test("opens as a history list before a run is selected", () => {
    const html = renderToStaticMarkup(<WorkflowRunCenter
      runs={[run({ runId: "latest", status: "completed", startedAt: 2_000, finishedAt: 62_000 })]}
      open
      onSelectRun={() => undefined}
      onClose={() => undefined}
    />);

    expect(html).toContain("workflow-run-center-backdrop");
    expect(html).toContain("Select a run to view its details");
    expect(html).not.toContain("Frozen configuration");
  });
});
