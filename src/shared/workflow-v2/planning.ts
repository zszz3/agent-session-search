  import type {
  WorkflowV2ConstraintDef,
  WorkflowV2ContextBudget,
  WorkflowV2Definition,
  WorkflowV2ExecModel,
  WorkflowV2ExecutionMode,
  WorkflowV2ModelProfile,
  WorkflowV2NodeRole,
  WorkflowV2OutputFieldDef,
  WorkflowV2ScriptCapability,
  WorkflowV2ScriptParameterLocation,
  WorkflowV2ScriptParameterValueType,
  WorkflowV2ScriptRiskLevel,
} from "./definition";

export interface WorkflowV2CostBudget {
  maxModelCalls?: number;
  maxPromptTokens?: number;
  maxCompletionTokens?: number;
  maxWallClockMs?: number;
}

export interface WorkflowV2AcceptanceCriterion {
  key: string;
  description: string;
  required?: boolean;
}

export interface WorkflowV2RoleRoute {
  role: WorkflowV2NodeRole;
  modelProfile: WorkflowV2ModelProfile;
}

export interface WorkflowV2BudgetEnvelope {
  context: WorkflowV2ContextBudget;
  cost?: WorkflowV2CostBudget;
}

export interface WorkflowV2UpstreamDigest {
  nodeId: string;
  title: string;
  summary: string;
  outputKeys?: string[];
  riskSummary?: string;
}

export interface WorkflowV2DownstreamRequirement {
  downstreamNodeId: string;
  downstreamNodeTitle: string;
  parameterKey: string;
  parameterLabel: string;
  upstreamOutputKey: string;
  location: WorkflowV2ScriptParameterLocation;
  valueType: WorkflowV2ScriptParameterValueType;
  required: boolean;
  description?: string;
}

export interface WorkflowV2TaskPacket {
  nodeId: string;
  title: string;
  role: WorkflowV2NodeRole;
  execModel: WorkflowV2ExecModel;
  executionMode: WorkflowV2ExecutionMode;
  executionModeRationale: string;
  executionModeConfidence: number;
  modelProfile: WorkflowV2ModelProfile;
  configuredAgentId?: string;
  modelId?: string;
  objective: string;
  acceptanceCriteria: WorkflowV2AcceptanceCriterion[];
  constraints: WorkflowV2ConstraintDef[];
  upstreamDigest: WorkflowV2UpstreamDigest[];
  outputFields: WorkflowV2OutputFieldDef[];
  downstreamRequirements?: WorkflowV2DownstreamRequirement[];
  budget: WorkflowV2BudgetEnvelope;
}

export interface WorkflowV2ResultPacket {
  nodeId: string;
  summary: string;
  outputs: Record<string, unknown>;
  evidence?: string[];
  risks?: string[];
  nextStepSuggestions?: string[];
}

export interface WorkflowV2PlanNode {
  nodeId: string;
  title: string;
  role: WorkflowV2NodeRole;
  execModel: WorkflowV2ExecModel;
  executionMode: WorkflowV2ExecutionMode;
  executionModeRationale: string;
  executionModeConfidence: number;
  modelProfile: WorkflowV2ModelProfile;
  configuredAgentId?: string;
  modelId?: string;
  acceptanceCriteria: WorkflowV2AcceptanceCriterion[];
  budget: WorkflowV2BudgetEnvelope;
  taskPacket: WorkflowV2TaskPacket;
  scriptGovernance?: {
    managerRisk: WorkflowV2ScriptRiskLevel;
    reviewerRisk: WorkflowV2ScriptRiskLevel;
    staticRisk: WorkflowV2ScriptRiskLevel;
    effectiveRisk: WorkflowV2ScriptRiskLevel;
    capabilities: WorkflowV2ScriptCapability[];
    capabilityDigest: string;
    reviewedRevision: number;
  };
}

export interface WorkflowV2Plan {
  workflowId: string;
  objective: string;
  graphVersion: number;
  definition: WorkflowV2Definition;
  approvedBy: string;
  frozenAt: number;
  acceptanceCriteria: WorkflowV2AcceptanceCriterion[];
  roleDefaults: Record<WorkflowV2NodeRole, WorkflowV2RoleRoute>;
  nodes: WorkflowV2PlanNode[];
  budget: WorkflowV2BudgetEnvelope;
}

export interface WorkflowV2GraphRevision {
  revisionId: string;
  basedOnGraphVersion: number;
  nextGraphVersion?: number;
  reason: string;
  changesSummary: string;
  approvedBy: string;
  createdAt: number;
}
