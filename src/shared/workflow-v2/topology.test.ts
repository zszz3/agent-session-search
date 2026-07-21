import { describe, expect, test } from "vitest";

import type { WorkflowV2Definition } from "./definition";
import { listWorkflowV2TerminalNodeIds, normalizeWorkflowV2TerminalNode } from "./topology";

function parallelDefinition(): WorkflowV2Definition {
  return {
    workflowId: "wf-parallel",
    graphVersion: 1,
    objective: "Aggregate two branches",
    nodes: [
      {
        id: "left",
        kind: "task",
        title: "Left",
        execModel: "llm",
        executionMode: "one-shot",
        prompt: "left",
        outputFields: [{ key: "left_result", required: true }],
      },
      {
        id: "right",
        kind: "task",
        title: "Right",
        execModel: "llm",
        executionMode: "one-shot",
        prompt: "right",
        outputFields: [{ key: "right_result", required: true }],
      },
    ],
    edges: [],
  };
}

describe("workflow-v2 terminal normalization", () => {
  test("adds one summary node after every terminal branch", () => {
    const source = parallelDefinition();

    const normalized = normalizeWorkflowV2TerminalNode(source);

    expect(normalized.terminalNodeIds).toEqual(["left", "right"]);
    expect(normalized.addedSummaryNodeId).toBe("workflow-summary");
    expect(normalized.definition.nodes.map((node) => node.id)).toEqual(["left", "right", "workflow-summary"]);
    expect(normalized.definition.edges).toEqual([
      { fromNodeId: "left", toNodeId: "workflow-summary" },
      { fromNodeId: "right", toNodeId: "workflow-summary" },
    ]);

    const summaryNode = normalized.definition.nodes.at(-1);
    expect(summaryNode).toMatchObject({
      id: "workflow-summary",
      kind: "summary",
      title: "汇总结果",
      execModel: "llm",
      executionMode: "one-shot",
      role: "orchestrator",
      outputFields: [{ key: "answer_markdown", required: true }],
      contextBudget: { maxUpstreamNodes: 2 },
    });
    expect(source.edges).toEqual([]);
    expect(source.nodes).toHaveLength(2);
  });

  test("keeps a single-terminal graph unchanged", () => {
    const source = parallelDefinition();
    source.edges.push({ fromNodeId: "left", toNodeId: "right" });

    const normalized = normalizeWorkflowV2TerminalNode(source);

    expect(normalized.terminalNodeIds).toEqual(["right"]);
    expect(normalized.addedSummaryNodeId).toBeUndefined();
    expect(normalized.definition).toEqual(source);
  });

  test("uses a collision-safe summary node id", () => {
    const source = parallelDefinition();
    source.nodes.push({
      id: "workflow-summary",
      kind: "task",
      title: "Existing summary",
      execModel: "llm",
      executionMode: "one-shot",
      prompt: "existing",
      outputFields: [{ key: "answer_markdown", required: true }],
    });

    const normalized = normalizeWorkflowV2TerminalNode(source);

    expect(normalized.addedSummaryNodeId).toBe("workflow-summary-2");
    expect(listWorkflowV2TerminalNodeIds(normalized.definition)).toEqual(["workflow-summary-2"]);
  });
});
