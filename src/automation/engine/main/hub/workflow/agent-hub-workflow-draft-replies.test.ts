import { describe, expect, it } from "vitest";
import { dispatchWorkflowDraftReply, reduceWorkflowDraftReplyEvent } from "./agent-hub-workflow-draft-replies";
import type { WorkflowDraftState } from "../../../shared/types";
import { beginWorkflowDraftReply, createWorkflowDraftInteractiveRequest } from "./agent-hub-workflow-draft-reply-state";

const workflow: WorkflowDraftState = {
  workflowId: "wf-1", title: "Draft", status: "draft", revision: 1, configuredAgentId: "agent", modelId: "model", reviewerConfiguredAgentId: "agent", reviewerModelId: "model", objective: "",
  definition: { workflowId: "wf-1", graphVersion: 1, objective: "", nodes: [], edges: [] }, messages: [], reply: "", error: undefined,
  runProgress: [], runContextDocument: "", contextDocument: "", runIds: [], createdAt: 1, updatedAt: 1,
};

describe("dispatchWorkflowDraftReply", () => {
  it("persists the user message before starting the agent", async () => {
    const order: string[] = [];
    await dispatchWorkflowDraftReply({
      workflow, reply: "hello", activeRequest: undefined, thinkingMessage: "thinking", cloneDraft: structuredClone,
      activateWorkflow: () => undefined, storeWorkflow: () => undefined, storeActiveRequest: () => undefined,
      emit: () => order.push("emit"), persist: async () => { order.push("persist"); }, defaultWorkDir: ".",
      askWorkflowDraftAgent: async () => { order.push("ask"); return { content: "done" }; }, handleEvent: () => undefined,
      completeRequest: () => undefined, failRequest: () => undefined,
    });
    expect(order).toEqual(["emit", "persist", "ask"]);
  });

  it("sends the current definition when revising an existing generated workflow", () => {
    const generated: WorkflowDraftState = { ...workflow, revision: 4, objective: "Answer", definition: { workflowId: "wf-1", graphVersion: 2, objective: "Answer", nodes: [{ id: "answer", kind: "answer", title: "Answer", execModel: "llm", executionMode: "one-shot", prompt: "Answer.", outputFields: [{ key: "answer", required: true }] }], edges: [] }, messages: [{ id: "old", role: "assistant", content: "Created" }] };
    const started = beginWorkflowDraftReply({ workflow: generated, reply: "Make it concise", thinkingMessage: "thinking", cloneDraft: structuredClone, now: 2 });
    const request = createWorkflowDraftInteractiveRequest({ started, reply: "Make it concise", defaultWorkDir: "." });
    expect(request.starting).toBe(false);
    expect(request.prompt).toContain("workflow_create");
    expect(request.prompt).toContain('"graphVersion": 2');
    expect(request.prompt).toContain("Make it concise");
  });

  it("attaches failed MCP tool results to the active assistant message", () => {
    const started = beginWorkflowDraftReply({ workflow, reply: "Update it", thinkingMessage: "thinking", cloneDraft: structuredClone, now: 2 });
    const reduced = reduceWorkflowDraftReplyEvent({
      workflow: started.next,
      activeRequest: started.request,
      event: {
        requestId: started.request.requestId,
        type: "tool_result",
        name: "workflow_update",
        content: "Permission rejected by runtime host.",
        metadata: { status: "failed", serverName: "agent_recall" },
      },
      thinkingMessage: "thinking",
      cloneDraft: structuredClone,
      replaceMessage: (messages) => messages,
      now: 3,
    });

    expect(reduced.type).toBe("event");
    if (reduced.type !== "event") throw new Error("Expected event reduction");
    expect(reduced.workflow.messages.at(-1)?.events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        name: "workflow_update",
        content: "Permission rejected by runtime host.",
        metadata: { status: "failed", serverName: "agent_recall" },
      }),
    ]);
  });
});
