import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { WorkflowRunState } from "../../../../shared/types";
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
    progress: [{ nodeId: "research", title: "Research", status: input.status === "failed" ? "failed" : "completed", detail: input.status === "failed" ? "Provider disconnected" : "Report ready" }],
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
  };
}

describe("WorkflowRunCenter", () => {
  test("does not render while closed", () => {
    expect(renderToStaticMarkup(<WorkflowRunCenter runs={[]} open={false} onSelectRun={() => undefined} onClose={() => undefined} />)).toBe("");
  });

  test("renders the selected historical run with frozen configuration, timeline, and errors", () => {
    const html = renderToStaticMarkup(<WorkflowRunCenter
      runs={[
        run({ runId: "latest", status: "completed", startedAt: 2_000, finishedAt: 62_000 }),
        run({ runId: "failed-run", status: "failed", startedAt: 1_000, finishedAt: 31_000, lastError: "Provider disconnected" }),
      ]}
      open
      selectedRunId="failed-run"
      onSelectRun={() => undefined}
      onClose={() => undefined}
    />);

    expect(html).toContain("Run history");
    expect(html).toContain("2 runs");
    expect(html).toContain("failed-run");
    expect(html).toContain("Frozen configuration");
    expect(html).toContain("desktop-user");
    expect(html).toContain("Graph version");
    expect(html).toContain("v3");
    expect(html).toContain("Research");
    expect(html).toContain("llm · gpt-test");
    expect(html).toContain("node failed");
    expect(html).toContain("Provider disconnected");
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
