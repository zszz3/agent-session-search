export type WorkflowV2HookLifecycle = "beforeExecute" | "afterOutput" | "afterComplete";
export type WorkflowV2HookSource = "template" | "node" | "user";
export type WorkflowV2HookFailurePolicy = "fail_node" | "pause_run" | "skip_hook";
export type WorkflowV2HookActionKind =
  | "pause"
  | "skip"
  | "injectContext"
  | "setVariable"
  | "readMemory"
  | "writeMemory"
  | "writeFile"
  | "llmHook";

export interface WorkflowV2HookActionDef {
  kind: WorkflowV2HookActionKind;
  config?: Record<string, unknown>;
  source?: WorkflowV2HookSource;
  failurePolicy?: WorkflowV2HookFailurePolicy;
}

export interface WorkflowV2NodeHooks {
  beforeExecute?: WorkflowV2HookActionDef[];
  afterOutput?: WorkflowV2HookActionDef[];
  afterComplete?: WorkflowV2HookActionDef[];
}
