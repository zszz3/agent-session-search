export interface WorkflowV2ExecutionLeasePolicy {
  inactivityTimeoutMs: number;
  softTimeoutMs: number;
  hardTimeoutMs: number;
  progressProbeTimeoutMs: number;
  maxExtensions: number;
  maxExtensionMs: number;
}

export interface WorkflowV2ExecutionLeaseState {
  nodeId: string;
  attempt: number;
  startedAt: number;
  lastActivityAt: number;
  softDeadlineAt: number;
  hardDeadlineAt: number;
  extensionCount: number;
}

export type WorkflowV2ProgressRequestedAction = "continue" | "need_input" | "escalate";

export interface WorkflowV2ProgressReport {
  nodeId: string;
  attempt: number;
  phase: string;
  completedItems: string[];
  remainingItems: string[];
  blockers: string[];
  evidence: string[];
  checkpoint?: string;
  estimatedRemainingMs?: number;
  safeToInterrupt: boolean;
  requestedAction: WorkflowV2ProgressRequestedAction;
  reportedAt: number;
}

export type WorkflowV2SupervisorDecision =
  | { action: "continue"; extensionMs: number; reason: string }
  | { action: "retry"; fromCheckpoint?: string; reason: string }
  | { action: "escalate"; modelProfile: "expert"; reason: string }
  | { action: "pause"; question: string; reason: string }
  | { action: "cancel"; reason: string };

export type WorkflowV2LeaseInspection = "active" | "probe_required" | "hard_timeout";

export type WorkflowV2SupervisorResolution =
  | { action: "continue"; lease: WorkflowV2ExecutionLeaseState; reason: string }
  | { action: "retry"; fromCheckpoint?: string; reason: string }
  | { action: "escalate"; modelProfile: "expert"; reason: string }
  | { action: "pause"; question: string; reason: string }
  | { action: "cancel"; reason: string };
