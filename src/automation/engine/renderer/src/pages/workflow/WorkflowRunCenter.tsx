import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, ChevronRight, CircleAlert, CircleStop, Clock3, GitBranch, History, LockKeyhole, MessageSquareText, X } from "lucide-react";
import type { RegisteredArtifact, WorkflowRunState, WorkflowStatus } from "../../../../shared/types";
import type { WorkflowRunFilters, } from "./workflow-run-center-model";
import { filterWorkflowRuns, getWorkflowErrorCode, getWorkflowRunDuration, getWorkflowRunTimeline, getWorkflowRunTimelineBounds, getWorkflowRunTimelineSegmentStyle } from "./workflow-run-center-model";
import type { WorkflowRunTimelineSegment, WorkflowRunTriggerSource } from "../../../../shared/workflow/run";
import type { WorkflowRunNodeTelemetry } from "../../../../shared/workflow/run";
import type { WorkflowNodeConversation } from "../../../../shared/workflow-v2/conversation";
import type { WorkflowNodeMessage } from "../../../../shared/workflow/run";

interface WorkflowRunCenterProps {
  runs: WorkflowRunState[];
  conversations?: WorkflowNodeConversation[];
  artifacts?: RegisteredArtifact[];
  loading?: boolean;
  error?: string;
  open: boolean;
  selectedRunId?: string;
  language?: "en" | "zh";
  onSelectRun: (runId: string | undefined) => void;
  onClose: () => void;
}

const STATUS_LABELS: Record<WorkflowStatus, { en: string; zh: string }> = {
  draft: { en: "draft", zh: "草稿" },
  running: { en: "running", zh: "运行中" },
  waiting_for_user: { en: "waiting for you", zh: "等待你处理" },
  completed: { en: "completed", zh: "已完成" },
  failed: { en: "failed", zh: "失败" },
  stopped: { en: "stopped", zh: "已停止" },
};

function formatDate(value: number, language: "en" | "zh"): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(run: WorkflowRunState): string {
  const seconds = Math.round(getWorkflowRunDuration(run) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function formatNodeDuration(telemetry: WorkflowRunNodeTelemetry | undefined): string {
  if (!telemetry) return "—";
  const end = telemetry.finishedAt ?? Date.now();
  const seconds = Math.max(0, Math.round((end - telemetry.startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatMetric(value: number | undefined): string {
  return value === undefined ? "—" : value.toLocaleString();
}

function runResultSummary(run: WorkflowRunState): string {
  if (run.finalReport?.trim()) return run.finalReport.trim().slice(0, 120);
  const output = run.progress.find((item) => item.outputs)?.outputs;
  if (output && typeof output.result === "string" && output.result.trim()) return output.result.trim().slice(0, 120);
  return run.progress.find((item) => item.detail?.trim())?.detail?.trim().slice(0, 120) ?? "—";
}

function formatCost(telemetry: WorkflowRunNodeTelemetry | undefined, language: "en" | "zh"): string {
  return telemetry?.estimatedCost === undefined ? (language === "zh" ? "未提供" : "Not provided") : `$${telemetry.estimatedCost.toFixed(3)}`;
}

function statusLabel(status: WorkflowStatus, language: "en" | "zh"): string {
  return STATUS_LABELS[status][language];
}

function eventLabel(type: string, language: "en" | "zh"): string {
  if (language === "zh") {
    const labels: Record<string, string> = {
      node_ready: "节点就绪",
      node_started: "节点开始",
      node_paused: "节点暂停",
      node_output: "节点输出",
      node_judged: "节点评估",
      node_failed: "节点失败",
      node_completed: "节点完成",
      gate_opened: "等待处理",
      gate_answered: "已处理",
      graph_revised: "图已修订",
    };
    return labels[type] ?? type;
  }
  return type.replaceAll("_", " ");
}

function runIcon(status: WorkflowStatus) {
  if (status === "completed") return CheckCircle2;
  if (status === "failed" || status === "waiting_for_user") return CircleAlert;
  if (status === "stopped") return CircleStop;
  return Clock3;
}

function nodeStatusIcon(status: WorkflowRunState["progress"][number]["status"]) {
  if (status === "completed") return CheckCircle2;
  if (status === "failed" || status === "awaiting_input") return CircleAlert;
  if (status === "paused") return CircleStop;
  return Clock3;
}

function messageLabel(message: WorkflowNodeMessage, language: "en" | "zh"): string {
  const toolLabel = message.eventType === "tool_call"
    ? (language === "zh" ? "工具调用" : "Tool call")
    : message.eventType === "tool_result"
      ? (language === "zh" ? "工具结果" : "Tool result")
      : undefined;
  if (toolLabel) return message.name ? `${toolLabel} · ${message.name}` : toolLabel;
  return message.name || message.role;
}

const TRIGGER_SOURCES: WorkflowRunTriggerSource[] = ["manual", "scheduled", "mcp", "recovery", "rerun"];

function triggerSourceLabel(source: WorkflowRunTriggerSource | undefined, language: "en" | "zh"): string {
  const labels: Record<WorkflowRunTriggerSource, { en: string; zh: string }> = {
    manual: { en: "manual", zh: "手动" },
    scheduled: { en: "scheduled", zh: "定时" },
    mcp: { en: "MCP", zh: "MCP" },
    recovery: { en: "recovery", zh: "恢复" },
    rerun: { en: "rerun", zh: "重跑" },
  };
  return labels[source ?? "manual"][language];
}

function artifactFileName(path: string | undefined): string {
  return path?.split(/[\\/]/).pop() || "—";
}

function artifactUrlPreview(url: string | undefined): string {
  if (!url) return "—";
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split(/[?#]/, 1)[0] || "—";
  }
}

function dateBoundary(value: string, endOfDay: boolean): number | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

export function WorkflowRunCenter({ runs, conversations = [], artifacts = [], loading = false, error, open, selectedRunId, language = "en", onSelectRun, onClose }: WorkflowRunCenterProps) {
  const [activeRunId, setActiveRunId] = useState<string | undefined>(selectedRunId);
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<WorkflowRunTriggerSource | "all">("all");
  const [graphVersionFilter, setGraphVersionFilter] = useState("all");
  const [runListLimit, setRunListLimit] = useState(50);
  const [startedAfter, setStartedAfter] = useState("");
  const [startedBefore, setStartedBefore] = useState("");
  const selectedRun = activeRunId ? runs.find((run) => run.runId === activeRunId) : undefined;
  const graphVersions = useMemo(() => [...new Set(runs.map((run) => run.workflowV2Plan.graphVersion))].sort((left, right) => right - left), [runs]);
  const filters: WorkflowRunFilters = {
    ...(statusFilter !== "all" ? { statuses: [statusFilter] } : {}),
    ...(sourceFilter !== "all" ? { triggerSources: [sourceFilter] } : {}),
    ...(graphVersionFilter !== "all" ? { graphVersions: [Number(graphVersionFilter)] } : {}),
    startedAfter: dateBoundary(startedAfter, false),
    startedBefore: dateBoundary(startedBefore, true),
  };
  const visibleRuns = useMemo(() => filterWorkflowRuns(runs, filters), [runs, statusFilter, sourceFilter, graphVersionFilter, startedAfter, startedBefore]);
  const displayedRuns = visibleRuns.slice(0, runListLimit);

  useEffect(() => {
    if (selectedRunId && runs.some((run) => run.runId === selectedRunId)) setActiveRunId(selectedRunId);
    else if (activeRunId && !runs.some((run) => run.runId === activeRunId)) setActiveRunId(undefined);
  }, [activeRunId, runs, selectedRunId]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const selectedNodeIds = useMemo(() => new Set(selectedRun?.progress.map((item) => item.nodeId) ?? []), [selectedRun]);
  const selectedTimeline = useMemo<Map<string, WorkflowRunTimelineSegment[]>>(() => selectedRun ? getWorkflowRunTimeline(selectedRun) : new Map<string, WorkflowRunTimelineSegment[]>(), [selectedRun]);
  const selectedTimelineBounds = useMemo(() => selectedRun ? getWorkflowRunTimelineBounds(selectedRun) : undefined, [selectedRun]);
  if (!open) return null;

  const labels = language === "zh"
    ? { title: "运行历史", close: "关闭运行历史", empty: "还没有运行记录", loading: "正在加载运行历史", loadMore: "加载更多运行记录", noMatches: "没有符合筛选条件的 Run", choose: "选择一条运行记录查看详情", back: "返回运行列表", detail: "运行详情", readOnly: "只读快照", timeline: "节点时间线", messages: "消息历史", outputs: "输出摘要", artifacts: "历史产物", inputSummary: "输入摘要", inputRequested: "请求输入", result: "结果", config: "冻结配置", agent: "Agent", agentRevision: "Agent 版本", graph: "图版本", started: "开始", finished: "结束", duration: "耗时", trigger: "触发来源", approvedBy: "确认人", nodes: "节点", noEvents: "暂无事件记录", notStarted: "未开始", runtime: "Runtime", channel: "Channel", model: "模型", attempts: "尝试次数", executionDetails: "执行明细", tokenUsage: "Token 用量", provider: "计量风格", inputTokens: "输入 tokens", outputTokens: "输出 tokens", reasoningTokens: "推理 tokens", cachedInput: "缓存输入（OpenAI）", cacheRead: "缓存读取（Anthropic）", cacheWrite: "缓存写入（Anthropic）", cacheWrite5m: "缓存写入 · 5 分钟", cacheWrite1h: "缓存写入 · 1 小时", totalTokens: "总 tokens", cost: "成本", filters: "筛选运行" }
    : { title: "Run history", close: "Close run history", empty: "No runs yet", loading: "Loading run history", loadMore: "Load more runs", noMatches: "No runs match the filters", choose: "Select a run to view its details", back: "Back to run list", detail: "Run details", readOnly: "Read-only snapshot", timeline: "Node timeline", messages: "Message history", outputs: "Outputs", artifacts: "Artifacts", inputSummary: "Input summary", inputRequested: "Input requested", result: "Result", config: "Frozen configuration", agent: "Agent", agentRevision: "Agent revision", graph: "Graph version", started: "Started", finished: "Finished", duration: "Duration", trigger: "Trigger source", approvedBy: "Approved by", nodes: "Nodes", noEvents: "No events recorded", notStarted: "Not started", runtime: "Runtime", channel: "Channel", model: "Model", attempts: "Attempts", executionDetails: "Execution details", tokenUsage: "Token usage", provider: "Accounting style", inputTokens: "Input tokens", outputTokens: "Output tokens", reasoningTokens: "Reasoning tokens", cachedInput: "Cached input (OpenAI)", cacheRead: "Cache read (Anthropic)", cacheWrite: "Cache write (Anthropic)", cacheWrite5m: "Cache write · 5 min", cacheWrite1h: "Cache write · 1 hour", totalTokens: "Total tokens", cost: "Cost", filters: "Filter runs" };

  return (
    <div className="workflow-run-center-backdrop" role="presentation" onClick={onClose}>
      <section className={`workflow-run-center ${selectedRun ? "is-detail" : ""}`} role="dialog" aria-modal="true" aria-label={labels.title} onClick={(event) => event.stopPropagation()}>
        <header className="workflow-run-center-header">
          <div className="workflow-run-center-title">
            <History size={17} />
            <div><strong>{labels.title}</strong><span>{Math.min(displayedRuns.length, visibleRuns.length)}/{runs.length} {language === "zh" ? "次运行" : "runs"}</span></div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={labels.close}><X size={15} /></button>
        </header>
        {loading ? <div className="workflow-run-center-empty is-loading" aria-live="polite"><Clock3 size={22} /><strong>{labels.loading}</strong></div> : error ? <div className="workflow-run-center-empty is-error" role="alert"><CircleAlert size={22} /><strong>{error}</strong></div> : runs.length === 0 ? <div className="workflow-run-center-empty"><History size={22} /><strong>{labels.empty}</strong></div> : (
          <div className={`workflow-run-center-body ${selectedRun ? "is-detail" : ""}`}>
            <nav className="workflow-run-center-list" aria-label={labels.title}>
              <form className="workflow-run-center-filters" onSubmit={(event) => event.preventDefault()}>
                <strong>{labels.filters}</strong>
                <label><span>{language === "zh" ? "状态" : "Status"}</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value as WorkflowStatus | "all")}><option value="all">{language === "zh" ? "全部" : "All"}</option>{["running", "waiting_for_user", "completed", "failed", "stopped"].map((status) => <option key={status} value={status}>{statusLabel(status as WorkflowStatus, language)}</option>)}</select></label>
                <label><span>{labels.trigger}</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.currentTarget.value as WorkflowRunTriggerSource | "all")}><option value="all">{language === "zh" ? "全部" : "All"}</option>{TRIGGER_SOURCES.map((source) => <option key={source} value={source}>{triggerSourceLabel(source, language)}</option>)}</select></label>
                <label><span>{labels.graph}</span><select value={graphVersionFilter} onChange={(event) => setGraphVersionFilter(event.currentTarget.value)}><option value="all">{language === "zh" ? "全部" : "All"}</option>{graphVersions.map((version) => <option key={version} value={version}>v{version}</option>)}</select></label>
                <div className="workflow-run-center-filter-dates"><label><span>{language === "zh" ? "起始日期" : "From"}</span><input type="date" value={startedAfter} onChange={(event) => setStartedAfter(event.currentTarget.value)} /></label><label><span>{language === "zh" ? "结束日期" : "To"}</span><input type="date" value={startedBefore} onChange={(event) => setStartedBefore(event.currentTarget.value)} /></label></div>
              </form>
              {displayedRuns.map((run) => {
                const Icon = runIcon(run.status);
                return (
                  <button key={run.runId} type="button" className={`workflow-run-center-item ${run.runId === selectedRun?.runId ? "is-active" : ""}`} onClick={() => { setActiveRunId(run.runId); onSelectRun(run.runId); }}>
                    <Icon size={14} />
                    <span><strong>{statusLabel(run.status, language)}</strong><small>{labels.started} {formatDate(run.startedAt, language)}</small><small>{labels.finished} {run.finishedAt ? formatDate(run.finishedAt, language) : "—"}</small><small>{labels.trigger}: {triggerSourceLabel(run.triggerSource, language)}</small><small>{labels.result}: {runResultSummary(run)}</small></span>
                    <em>{formatDuration(run)}</em>
                    <ChevronRight size={13} aria-hidden="true" />
                  </button>
                );
              })}
              {displayedRuns.length < visibleRuns.length ? <button type="button" className="workflow-run-center-load-more" onClick={() => setRunListLimit((limit) => limit + 50)}>{labels.loadMore}</button> : null}
              {visibleRuns.length === 0 ? <div className="workflow-run-center-filter-empty">{labels.noMatches}</div> : null}
            </nav>
            {selectedRun ? (
              <main className="workflow-run-center-detail">
                <header className="workflow-run-center-detail-head">
                  <div><button type="button" className="workflow-run-center-back" onClick={() => { setActiveRunId(undefined); onSelectRun(undefined); }} aria-label={labels.back}><ArrowLeft size={14} /><span>{labels.back}</span></button><span className={`workflow-run-center-status is-${selectedRun.status}`}>{statusLabel(selectedRun.status, language)}</span><span className="workflow-run-center-readonly"><LockKeyhole size={11} />{labels.readOnly}</span><h3>{labels.detail}</h3><small>{selectedRun.runId}</small></div>
                  <div className="workflow-run-center-metrics"><span><b>{labels.started}</b>{formatDate(selectedRun.startedAt, language)}</span><span><b>{labels.finished}</b>{selectedRun.finishedAt ? formatDate(selectedRun.finishedAt, language) : "—"}</span><span><b>{labels.duration}</b>{formatDuration(selectedRun)}</span><span><b>{labels.trigger}</b>{triggerSourceLabel(selectedRun.triggerSource, language)}</span><span><b>{labels.graph}</b>v{selectedRun.workflowV2Plan.graphVersion}</span></div>
                </header>
                {selectedRun.lastError ? <div className="workflow-run-center-error"><CircleAlert size={15} /><span>{selectedRun.lastError}</span></div> : null}
                {artifacts.filter((artifact) => artifact.target === selectedRun.runId).length > 0 ? <section className="workflow-run-center-section workflow-run-center-artifacts"><header><GitBranch size={14} /><strong>{labels.artifacts}</strong></header><div className="workflow-run-center-artifact-list">{artifacts.filter((artifact) => artifact.target === selectedRun.runId).map((artifact) => <article key={artifact.id}><strong>{artifact.title}</strong><small>{artifact.kind === "file" ? artifactFileName(artifact.path) : artifact.kind === "url" ? artifactUrlPreview(artifact.url) : "text"}</small>{artifact.description ? <p>{artifact.description}</p> : null}{artifact.kind === "text" && artifact.content ? <pre>{artifact.content.slice(0, 4000)}</pre> : null}</article>)}</div></section> : null}
                <section className="workflow-run-center-section">
                  <header><GitBranch size={14} /><strong>{labels.config}</strong></header>
                  <div className="workflow-run-center-config-grid"><span><b>{labels.approvedBy}</b>{selectedRun.workflowV2Plan.approvedBy || "—"}</span><span><b>{labels.nodes}</b>{selectedRun.workflowV2Plan.nodes.length}</span><span><b>{language === "zh" ? "上下文预算" : "Context budget"}</b>{selectedRun.workflowV2Plan.budget.context.maxContextTokens ?? "—"}</span><span><b>{labels.agent}</b>{selectedRun.configurationSnapshot?.configuredAgentId ?? "—"}</span><span><b>{labels.agentRevision}</b>{selectedRun.configurationSnapshot?.agentRevision ?? "—"}</span><span><b>{labels.runtime}</b>{selectedRun.configurationSnapshot?.runtimeId ?? "—"}</span><span><b>{labels.channel}</b>{selectedRun.configurationSnapshot?.channelId ?? "—"}</span><span><b>{labels.model}</b>{selectedRun.configurationSnapshot?.modelId ?? "—"}</span></div>
                </section>
                <section className="workflow-run-center-section">
                  <header><CalendarClock size={14} /><strong>{labels.timeline}</strong></header>
                  <div className="workflow-run-center-timeline">
                    {selectedRun.workflowV2Plan.nodes.map((node) => {
                      const progress = selectedRun.progress.find((item) => item.nodeId === node.nodeId);
                      const events = selectedRun.events.filter((event) => event.nodeId === node.nodeId).sort((left, right) => left.at - right.at);
                      const eventError = [...events].reverse().find((event) => event.error)?.error;
                      const conversation = conversations.find((item) => item.runId === selectedRun.runId && item.nodeId === node.nodeId);
                      const messages = conversation?.messages.length ? conversation.messages : progress?.messages ?? [];
                      const telemetry = progress?.telemetry ?? conversation?.telemetry;
                      const timelineSegments = selectedTimeline.get(node.nodeId) ?? [];
                      return (
                        <article key={node.nodeId} className={`workflow-run-center-node ${progress ? `is-${progress.status}` : ""}`}>
                          <div className="workflow-run-center-node-head">
                            {(() => { const nodeStatus = progress?.status ?? "queued"; const StatusIcon = nodeStatusIcon(nodeStatus); return <span><StatusIcon size={11} aria-label={`Node status: ${nodeStatus}`} />{nodeStatus}</span>; })()}
                            <strong>{node.title}</strong>
                            <small>{node.execModel} · {node.modelId ?? node.modelProfile}</small>
                          </div>
                          <details className="workflow-run-center-node-telemetry">
                            <summary><span>{labels.executionDetails}</span><em>{telemetry?.attempt ?? "—"} · {formatNodeDuration(telemetry)}</em></summary>
                            <div className="workflow-run-center-node-telemetry-grid">
                              <span><b>{labels.runtime}</b>{telemetry?.runtimeId ?? "—"}</span>
                              <span><b>{labels.channel}</b>{telemetry?.channelId ?? "—"}</span>
                              <span><b>{labels.model}</b>{telemetry?.modelId ?? node.modelId ?? node.modelProfile ?? "—"}</span>
                              <span><b>{labels.attempts}</b>{telemetry?.attempt ?? "—"}</span>
                              <span><b>{labels.duration}</b>{formatNodeDuration(telemetry)}</span>
                              <span><b>{labels.cost}</b>{formatCost(telemetry, language)}</span>
                            </div>
                            <div className="workflow-run-center-node-token-usage">
                              <strong>{labels.tokenUsage}</strong>
                              <span className="workflow-run-center-node-token-provider">{labels.provider}: {telemetry?.provider ?? "—"}</span>
                              <div className="workflow-run-center-node-telemetry-grid">
                                <span><b>{labels.inputTokens}</b>{formatMetric(telemetry?.inputTokens)}</span>
                                <span><b>{labels.outputTokens}</b>{formatMetric(telemetry?.outputTokens)}</span>
                                <span><b>{labels.reasoningTokens}</b>{formatMetric(telemetry?.reasoningTokens)}</span>
                                <span><b>{labels.cachedInput}</b>{telemetry?.provider === "openai" ? formatMetric(telemetry.cacheReadInputTokens) : "—"}</span>
                                <span><b>{labels.cacheRead}</b>{telemetry?.provider === "anthropic" ? formatMetric(telemetry.cacheReadInputTokens) : "—"}</span>
                                <span><b>{labels.cacheWrite}</b>{telemetry?.provider === "anthropic" ? formatMetric(telemetry.cacheWriteInputTokens) : "—"}</span>
                                <span><b>{labels.cacheWrite5m}</b>{telemetry?.provider === "anthropic" ? formatMetric(telemetry.cacheWrite5mInputTokens) : "—"}</span>
                                <span><b>{labels.cacheWrite1h}</b>{telemetry?.provider === "anthropic" ? formatMetric(telemetry.cacheWrite1hInputTokens) : "—"}</span>
                                <span><b>{labels.totalTokens}</b>{formatMetric(telemetry?.totalTokens)}</span>
                              </div>
                            </div>
                          </details>
                          {progress?.detail ? <p>{progress.detail}</p> : null}
                          {progress?.inputRequest ? <p>{labels.inputRequested}: {progress.inputRequest.kind === "script_parameters" ? progress.inputRequest.parameters.map((parameter) => parameter.key).join(", ") : progress.inputRequest.prompt}</p> : null}
                          {eventError ? <p className="is-error">{getWorkflowErrorCode(eventError)} · {eventError}</p> : null}
                          {progress?.inputSummary ? <details className="workflow-run-center-node-outputs"><summary>{labels.inputSummary}</summary><pre>{JSON.stringify(progress.inputSummary, null, 2)}</pre></details> : null}
                          {progress?.outputs ? <details className="workflow-run-center-node-outputs"><summary>{labels.outputs}</summary><pre>{JSON.stringify(progress.outputs, null, 2)}</pre></details> : null}
                          {timelineSegments.length > 0 ? <div className="workflow-run-center-node-timeline-visual" aria-label={labels.timeline}><div className="workflow-run-center-node-track">{timelineSegments.map((segment, index) => <span key={`${segment.kind}-${segment.startedAt}-${index}`} className={`workflow-run-center-node-track-segment is-${segment.kind}`} style={selectedTimelineBounds ? getWorkflowRunTimelineSegmentStyle(segment, selectedTimelineBounds) : undefined} title={`${segment.kind.replaceAll("_", " ")} · ${formatNodeDuration({ attempt: segment.attempt ?? 1, startedAt: segment.startedAt, finishedAt: segment.finishedAt })}`} />)}</div><div className="workflow-run-center-node-segments">{timelineSegments.map((segment, index) => <span key={`${segment.kind}-${segment.startedAt}-${index}`}><b>{segment.kind.replaceAll("_", " ")}</b> {formatNodeDuration({ attempt: segment.attempt ?? 1, startedAt: segment.startedAt, finishedAt: segment.finishedAt })}</span>)}</div></div> : null}
                          {events.length > 0 ? (
                            <div className="workflow-run-center-events">
                              {events.map((event, index) => <span key={`${event.type}-${event.at}-${index}`}>{eventLabel(event.type, language)} · {formatDate(event.at, language)}{event.attempt ? ` · #${event.attempt}` : ""}{event.detail ? ` · ${event.detail}` : ""}{event.question ? ` · ${event.question}` : ""}{event.answer ? ` · ${event.answer}` : ""}{event.intervention ? ` · ${event.intervention.source}${event.intervention.reviewVerdict ? ` · ${event.intervention.reviewVerdict.decision}` : ""}` : ""}</span>)}
                            </div>
                          ) : <small className="workflow-run-center-no-events">{selectedNodeIds.has(node.nodeId) ? labels.noEvents : labels.notStarted}</small>}
                          {messages.length > 0 ? <details className="workflow-run-center-messages">
                            <summary><MessageSquareText size={13} /><span>{labels.messages}</span><em>{messages.length}</em></summary>
                            <div className="workflow-run-center-message-list">
                              {messages.map((message) => <article key={message.id} className={`is-${message.role}${message.eventType ? ` is-${message.eventType}` : ""}`}>
                                <header><strong>{messageLabel(message, language)}</strong><time>{formatDate(message.at, language)}</time></header>
                                <p>{message.content}</p>
                              </article>)}
                            </div>
                          </details> : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              </main>
            ) : <div className="workflow-run-center-choose"><History size={22} /><strong>{labels.choose}</strong></div>}
          </div>
        )}
      </section>
    </div>
  );
}
