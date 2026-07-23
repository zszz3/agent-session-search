import { describe, expect, test } from "vitest";
import type { WorkflowRunState, WorkflowRunTriggerSource } from "../../../../shared/workflow/run";
import { dedupeWorkflowEvents, filterWorkflowRuns, getWorkflowErrorCode, getWorkflowRunDuration, getWorkflowRunTimeline, getWorkflowRunTimelineBounds, getWorkflowRunTimelineSegmentStyle } from "./workflow-run-center-model";

function run(input: Partial<WorkflowRunState> & Pick<WorkflowRunState, "runId" | "workflowId" | "status" | "startedAt"> & { triggerSource?: WorkflowRunTriggerSource }): WorkflowRunState {
  return {
    runId: input.runId,
    workflowId: input.workflowId,
    status: input.status,
    workflowV2Plan: {
      workflowId: input.workflowId,
      graphVersion: input.workflowV2Plan?.graphVersion ?? 1,
      objective: "Test",
      approvedBy: "user",
      frozenAt: input.startedAt,
      definition: { workflowId: input.workflowId, graphVersion: 1, objective: "Test", nodes: [], edges: [] },
      nodes: [],
      acceptanceCriteria: [],
      roleDefaults: {},
      budget: { context: { maxContextTokens: 1000 } },
    } as unknown as WorkflowRunState["workflowV2Plan"],
    progress: input.progress ?? [],
    events: input.events ?? [],
    contextDocument: "",
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    lastError: input.lastError,
    ...(input.triggerSource ? { triggerSource: input.triggerSource } : {}),
  };
}

describe("workflow run center model", () => {
  test("filters by status, trigger source, revision, and time range while preserving newest-first order", () => {
    const runs = [
      run({ runId: "older", workflowId: "wf", status: "failed", startedAt: 100, finishedAt: 200, triggerSource: "manual", workflowV2Plan: { graphVersion: 2 } as WorkflowRunState["workflowV2Plan"] }),
      run({ runId: "newer", workflowId: "wf", status: "completed", startedAt: 300, finishedAt: 500, triggerSource: "scheduled", workflowV2Plan: { graphVersion: 3 } as WorkflowRunState["workflowV2Plan"] }),
      run({ runId: "other", workflowId: "wf", status: "completed", startedAt: 400, finishedAt: 450, triggerSource: "scheduled", workflowV2Plan: { graphVersion: 3 } as WorkflowRunState["workflowV2Plan"] }),
    ];

    expect(filterWorkflowRuns(runs, {
      statuses: ["completed"],
      triggerSources: ["scheduled"],
      graphVersions: [3],
      startedAfter: 250,
      startedBefore: 350,
    }).map((item) => item.runId)).toEqual(["newer"]);
    expect(filterWorkflowRuns(runs, {}).map((item) => item.runId)).toEqual(["other", "newer", "older"]);
  });

  test("calculates a stable duration for finished and active runs", () => {
    expect(getWorkflowRunDuration(run({ runId: "finished", workflowId: "wf", status: "completed", startedAt: 100, finishedAt: 1_600 }))).toBe(1_500);
    expect(getWorkflowRunDuration(run({ runId: "active", workflowId: "wf", status: "running", startedAt: 100 }), 900)).toBe(800);
  });

  test("maps common node failures to stable user-facing error codes", () => {
    expect(getWorkflowErrorCode("Provider disconnected")).toBe("PROVIDER_UNAVAILABLE");
    expect(getWorkflowErrorCode("Missing required script inputs: topic.")).toBe("INPUT_REQUIRED");
    expect(getWorkflowErrorCode("unexpected failure")).toBe("WORKFLOW_NODE_FAILED");
  });

  test("builds node timeline segments from ordered events", () => {
    const segments = getWorkflowRunTimeline(run({
      runId: "timeline",
      workflowId: "wf",
      status: "completed",
      startedAt: 100,
      events: [
        { type: "node_ready", nodeId: "a", at: 100 },
        { type: "node_started", nodeId: "a", at: 120, attempt: 1 },
        { type: "gate_opened", nodeId: "a", at: 180 },
        { type: "gate_answered", nodeId: "a", at: 240 },
        { type: "node_completed", nodeId: "a", at: 300, attempt: 1 },
      ],
    })).get("a");

    expect(segments).toEqual([
      { kind: "queued", startedAt: 100, finishedAt: 120 },
      { kind: "executing", startedAt: 120, finishedAt: 180, attempt: 1 },
      { kind: "waiting_for_user", startedAt: 180, finishedAt: 240 },
      { kind: "executing", startedAt: 240, finishedAt: 300, attempt: 1 },
    ]);
    expect(segments?.map((segment) => (segment.finishedAt ?? 0) - segment.startedAt)).toEqual([20, 60, 60, 60]);
  });

  test("distinguishes an approval wait from ordinary user input", () => {
    const segments = getWorkflowRunTimeline(run({
      runId: "approval",
      workflowId: "wf",
      status: "waiting_for_user",
      startedAt: 100,
      events: [
        { type: "node_started", nodeId: "a", at: 120 },
        { type: "gate_opened", nodeId: "a", at: 180, intervention: { source: "script_permission" } as never },
        { type: "gate_answered", nodeId: "a", at: 240 },
      ],
    })).get("a");

    expect(segments?.[1]).toMatchObject({ kind: "waiting_for_approval", startedAt: 180, finishedAt: 240 });
  });

  test("deduplicates repeated sequenced events before building the timeline", () => {
    const segments = getWorkflowRunTimeline(run({
      runId: "duplicate-events",
      workflowId: "wf",
      status: "completed",
      startedAt: 100,
      events: [
        { type: "node_started", nodeId: "a", at: 120, sequence: 1 },
        { type: "node_started", nodeId: "a", at: 120, sequence: 1 },
        { type: "node_completed", nodeId: "a", at: 200, sequence: 2 },
        { type: "node_completed", nodeId: "a", at: 200, sequence: 2 },
      ],
    })).get("a");

    expect(segments).toEqual([{ kind: "executing", startedAt: 120, finishedAt: 200 }]);
    expect(dedupeWorkflowEvents([
      { type: "node_started", nodeId: "a", at: 120, sequence: 1 },
      { type: "node_started", nodeId: "a", at: 120, sequence: 1 },
    ])).toHaveLength(1);
  });

  test("maps overlapping node phases onto a shared time axis", () => {
    const observed = run({
      runId: "parallel",
      workflowId: "wf",
      status: "completed",
      startedAt: 100,
      finishedAt: 500,
      events: [
        { type: "node_started", nodeId: "a", at: 150 },
        { type: "node_completed", nodeId: "a", at: 450 },
        { type: "node_started", nodeId: "b", at: 250 },
        { type: "node_completed", nodeId: "b", at: 400 },
      ],
    });
    const bounds = getWorkflowRunTimelineBounds(observed);
    const segment = getWorkflowRunTimeline(observed).get("b")?.[0];

    expect(bounds).toEqual({ startedAt: 100, endedAt: 500, duration: 400 });
    expect(segment && getWorkflowRunTimelineSegmentStyle(segment, bounds)).toEqual({ left: "37.5%", width: "37.5%" });
  });
});
