import type { WorkflowV2ScriptRiskLevel } from "./definition";

export type WorkflowV2GenerationReviewStatus = "not_reviewed" | "reviewing" | "approved" | "changes_requested" | "failed";
export type WorkflowV2GenerationReviewVerdict = "approve" | "revise";

export interface WorkflowV2GenerationReviewFinding {
  severity: "blocking" | "warning";
  nodeId?: string;
  summary: string;
  failurePath: string;
}

export interface WorkflowV2GenerationReviewResult {
  verdict: WorkflowV2GenerationReviewVerdict;
  reviewedRevision: number;
  summary: string;
  findings: WorkflowV2GenerationReviewFinding[];
  scriptRisks: Record<string, { level: WorkflowV2ScriptRiskLevel; rationale: string }>;
  suggestions: string[];
}

export interface WorkflowV2GenerationReviewState {
  status: WorkflowV2GenerationReviewStatus;
  reviewerConfiguredAgentId: string;
  reviewerModelId: string;
  reviewedRevision?: number;
  result?: WorkflowV2GenerationReviewResult;
  error?: string;
  updatedAt: number;
}
