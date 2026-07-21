import type { WorkflowV2ConstraintDef, WorkflowV2ExhaustedPolicy, WorkflowV2ScriptCapability, WorkflowV2ScriptRiskLevel } from "./definition";
import type { WorkflowV2ResultPacket } from "./planning";
import type { WorkflowV2ProgressReport, WorkflowV2SupervisorDecision } from "./supervision";

export type WorkflowV2ReviewDecision = "accept" | "reject" | "escalate";
export type WorkflowV2ReviewRiskLevel = "low" | "medium" | "high";
export type WorkflowV2ReviewConfidence = "high" | "medium" | "low";

export interface WorkflowV2ReviewVerdict {
  decision: WorkflowV2ReviewDecision;
  reasons: string[];
  requiredFixes?: string[];
  riskLevel: WorkflowV2ReviewRiskLevel;
  evidence?: string[];
  confidence: WorkflowV2ReviewConfidence;
}

export interface WorkflowV2ReviewerInput {
  executorNodeId: string;
  objective: string;
  constraints: WorkflowV2ConstraintDef[];
  result: WorkflowV2ResultPacket;
}

export interface WorkflowV2ReviewerResponse {
  reviewerNodeId: string;
  verdict: WorkflowV2ReviewVerdict;
}

export type WorkflowV2ReviewAction = "accept" | "retry" | "fail" | "skip" | "pause" | "escalate";

export interface WorkflowV2ReviewResolution {
  action: WorkflowV2ReviewAction;
  verdict: WorkflowV2ReviewVerdict;
  reason: string;
}

export interface WorkflowV2ReviewRetryPolicy {
  attempt: number;
  maxRetry: number;
  onExhausted: WorkflowV2ExhaustedPolicy;
}

export type WorkflowV2InterventionAction = "continue" | "skip" | "escalate" | "replan" | "increase_review_strength" | "approve_once" | "reject";

export interface WorkflowV2ScriptApprovalRequest {
  requestId: string;
  risk: WorkflowV2ScriptRiskLevel;
  capabilities: WorkflowV2ScriptCapability[];
  capabilityDigest: string;
  operationDigest: string;
  executableSummary: string;
  workDir: string;
}

export interface WorkflowV2HumanIntervention {
  nodeId: string;
  source:
    | "validation"
    | "review_rejection"
    | "review_escalation"
    | "supervision_pause"
    | "supervision_escalation"
    | "hook_pause"
    | "script_permission";
  reason: string;
  allowedActions: WorkflowV2InterventionAction[];
  requestedAt: number;
  reviewVerdict?: WorkflowV2ReviewVerdict;
  progressReport?: WorkflowV2ProgressReport;
  supervisorDecision?: WorkflowV2SupervisorDecision;
  scriptApproval?: WorkflowV2ScriptApprovalRequest;
  resumeConversation?: {
    runtimeId: string;
    codecVersion: string;
    payload: unknown;
  };
}
