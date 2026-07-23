import type { WorkflowRunState, WorkflowRunTimelineSegment, WorkflowRunTriggerSource, WorkflowStatus } from "../../../../shared/workflow/run";

export interface WorkflowRunFilters {
  statuses?: WorkflowStatus[];
  triggerSources?: WorkflowRunTriggerSource[];
  graphVersions?: number[];
  startedAfter?: number;
  startedBefore?: number;
}

export interface WorkflowRunTimelineBounds {
  startedAt: number;
  endedAt: number;
  duration: number;
}

export function getWorkflowErrorCode(error: string | undefined): string | undefined {
  if (!error) return undefined;
  const normalized = error.toLowerCase();
  if (normalized.includes("provider") || normalized.includes("runtime") || normalized.includes("channel")) return "PROVIDER_UNAVAILABLE";
  if (normalized.includes("missing required") || normalized.includes("input")) return "INPUT_REQUIRED";
  if (normalized.includes("approval") || normalized.includes("permission")) return "APPROVAL_REQUIRED";
  if (normalized.includes("stopped")) return "RUN_STOPPED";
  return "WORKFLOW_NODE_FAILED";
}

export function dedupeWorkflowEvents<T extends { type: string; nodeId: string; at: number; sequence?: number }>(events: readonly T[]): T[] {
  const seenSequences = new Set<number>();
  return events.filter((event) => {
    if (event.sequence === undefined) return true;
    if (seenSequences.has(event.sequence)) return false;
    seenSequences.add(event.sequence);
    return true;
  });
}

export function filterWorkflowRuns(runs: readonly WorkflowRunState[], filters: WorkflowRunFilters): WorkflowRunState[] {
  const statuses = new Set(filters.statuses ?? []);
  const triggerSources = new Set(filters.triggerSources ?? []);
  const graphVersions = new Set(filters.graphVersions ?? []);
  return [...runs]
    .filter((run) => statuses.size === 0 || statuses.has(run.status))
    .filter((run) => triggerSources.size === 0 || triggerSources.has(run.triggerSource ?? "manual"))
    .filter((run) => graphVersions.size === 0 || graphVersions.has(run.workflowV2Plan.graphVersion))
    .filter((run) => filters.startedAfter === undefined || run.startedAt >= filters.startedAfter)
    .filter((run) => filters.startedBefore === undefined || run.startedAt <= filters.startedBefore)
    .sort((left, right) => right.startedAt - left.startedAt || right.runId.localeCompare(left.runId));
}

export function getWorkflowRunDuration(run: Pick<WorkflowRunState, "startedAt" | "finishedAt">, now = Date.now()): number {
  return Math.max(0, (run.finishedAt ?? now) - run.startedAt);
}

export function getWorkflowRunTimelineBounds(run: Pick<WorkflowRunState, "startedAt" | "finishedAt" | "events">, now = Date.now()): WorkflowRunTimelineBounds {
  const eventTimes = run.events.map((event) => event.at);
  const startedAt = Math.min(run.startedAt, ...eventTimes);
  const endedAt = Math.max(run.finishedAt ?? now, ...eventTimes, startedAt);
  return { startedAt, endedAt, duration: Math.max(0, endedAt - startedAt) };
}

export function getWorkflowRunTimelineSegmentStyle(segment: Pick<WorkflowRunTimelineSegment, "startedAt" | "finishedAt">, bounds: WorkflowRunTimelineBounds): { left: string; width: string } {
  if (bounds.duration <= 0) return { left: "0%", width: "100%" };
  const left = Math.max(0, Math.min(100, ((segment.startedAt - bounds.startedAt) / bounds.duration) * 100));
  const end = Math.max(segment.startedAt, segment.finishedAt ?? bounds.endedAt);
  const right = Math.max(left, Math.min(100, ((end - bounds.startedAt) / bounds.duration) * 100));
  return { left: `${left}%`, width: `${Math.max(0, right - left)}%` };
}

export function getWorkflowRunTimeline(run: Pick<WorkflowRunState, "events">): Map<string, WorkflowRunTimelineSegment[]> {
  const timeline = new Map<string, WorkflowRunTimelineSegment[]>();
  const active = new Map<string, WorkflowRunTimelineSegment>();
  const lastAttempt = new Map<string, number>();
  const close = (nodeId: string, finishedAt: number) => {
    const segment = active.get(nodeId);
    if (!segment || finishedAt <= segment.startedAt) return;
    timeline.set(nodeId, [...(timeline.get(nodeId) ?? []), { ...segment, finishedAt }]);
    active.delete(nodeId);
  };
  const open = (nodeId: string, segment: WorkflowRunTimelineSegment) => active.set(nodeId, segment);

  for (const event of dedupeWorkflowEvents([...run.events]).sort((left, right) => left.at - right.at || (left.sequence ?? 0) - (right.sequence ?? 0))) {
    if (event.type === "node_ready") {
      close(event.nodeId, event.at);
      open(event.nodeId, { kind: "queued", startedAt: event.at });
    } else if (event.type === "node_started") {
      close(event.nodeId, event.at);
      if (event.attempt !== undefined) lastAttempt.set(event.nodeId, event.attempt);
      open(event.nodeId, { kind: "executing", startedAt: event.at, ...(lastAttempt.has(event.nodeId) ? { attempt: lastAttempt.get(event.nodeId) } : {}) });
    } else if (event.type === "gate_opened") {
      close(event.nodeId, event.at);
      open(event.nodeId, { kind: event.intervention ? "waiting_for_approval" : "waiting_for_user", startedAt: event.at });
    } else if (event.type === "gate_answered") {
      close(event.nodeId, event.at);
      if (event.attempt !== undefined) lastAttempt.set(event.nodeId, event.attempt);
      open(event.nodeId, { kind: "executing", startedAt: event.at, ...(lastAttempt.has(event.nodeId) ? { attempt: lastAttempt.get(event.nodeId) } : {}) });
    } else if (event.type === "node_paused") {
      close(event.nodeId, event.at);
      open(event.nodeId, { kind: "paused", startedAt: event.at });
    } else if (event.type === "node_completed" || event.type === "node_failed") {
      close(event.nodeId, event.at);
    }
  }
  return timeline;
}
