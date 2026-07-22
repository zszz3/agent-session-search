import type { ReactElement } from "react";
import { Activity, AlertTriangle, Check, Circle, LoaderCircle, X } from "lucide-react";
import type {
  SessionAgentState,
  SessionAgentStatus,
  SessionAgentTodo,
  SessionAgentTodoStatus,
} from "../../../../core/session-agent-status";
import { localize, type LanguageMode } from "../../language";

export interface AgentStatusCardProps {
  status: SessionAgentStatus;
  language: LanguageMode;
}

const TODO_ORDER: Record<SessionAgentTodoStatus, number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
  cancelled: 3,
};

function stateLabel(state: SessionAgentState, language: LanguageMode): string {
  const labels: Record<SessionAgentState, [string, string]> = {
    running: ["Running", "进行中"],
    waiting_agent: ["Waiting for Agent", "等待 Agent"],
    waiting_user: ["Waiting for user", "等待用户"],
    failed: ["Failed", "发生错误"],
    interrupted: ["Interrupted", "已中断"],
    unknown: ["Unknown", "状态未知"],
  };
  const [en, zh] = labels[state];
  return localize(language, en, zh);
}

function todoStatusLabel(status: SessionAgentTodoStatus, language: LanguageMode): string {
  const labels: Record<SessionAgentTodoStatus, [string, string]> = {
    in_progress: ["In progress", "进行中"],
    pending: ["Pending", "待处理"],
    completed: ["Completed", "已完成"],
    cancelled: ["Cancelled", "已取消"],
  };
  const [en, zh] = labels[status];
  return localize(language, en, zh);
}

function TodoIcon({ status }: { status: SessionAgentTodoStatus }): ReactElement {
  if (status === "completed") return <Check size={12} />;
  if (status === "cancelled") return <X size={12} />;
  if (status === "in_progress") return <LoaderCircle size={12} />;
  return <Circle size={12} />;
}

function visibleTodos(todos: SessionAgentTodo[]): SessionAgentTodo[] {
  return [...todos]
    .sort((left, right) => TODO_ORDER[left.status] - TODO_ORDER[right.status])
    .slice(0, 5);
}

function formatAnalyzedAt(timestamp: string, language: LanguageMode): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return localize(language, "just now", "刚刚");
  return date.toLocaleString(language === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AgentStatusCard({ status, language }: AgentStatusCardProps): ReactElement {
  const l = (en: string, zh: string) => localize(language, en, zh);
  const hasEvidence = status.messageCount > 0
    || status.traceEventCount > 0
    || Boolean(status.latestUserRequest)
    || status.todos.length > 0
    || status.toolCallCount > 0;
  const shownTodos = visibleTodos(status.todos);

  return (
    <section className="agent-status-card" aria-live="polite">
      <header className="agent-status-header">
        <div className="agent-status-heading">
          <Activity size={15} />
          <strong>{l("Agent status", "Agent 状态")}</strong>
          <span className={`agent-status-state ${status.state}`}>{stateLabel(status.state, language)}</span>
        </div>
        <div className="agent-status-meta">
          <span>{l(
            `${status.messageCount} messages · ${status.traceEventCount} traces`,
            `${status.messageCount} 条消息 · ${status.traceEventCount} 条轨迹`,
          )}</span>
          <span>{l("Analyzed", "分析于")} {formatAnalyzedAt(status.analyzedAt, language)}</span>
        </div>
      </header>

      {!hasEvidence ? (
        <p className="agent-status-empty">
          {l("There are not enough messages or traces to determine the current state.", "没有足够的消息或轨迹来判断当前状态。")}
        </p>
      ) : (
        <>
          {status.latestUserRequest ? (
            <div className="agent-status-focus">
              <span>{l("Latest request", "最近诉求")}</span>
              <p>{status.latestUserRequest}</p>
            </div>
          ) : null}

          <div className="agent-status-grid">
            <div>
              <span>{l("Tool calls", "工具调用")}</span>
              <strong>{status.toolCallCount}</strong>
            </div>
            <div className={status.failureCount > 0 ? "has-failure" : ""}>
              <span>{l("Failures", "失败")}</span>
              <strong>{status.failureCount}</strong>
            </div>
            <div>
              <span>{l("Compactions", "上下文压缩")}</span>
              <strong>{status.compactionCount}</strong>
            </div>
            <div>
              <span>{l("Interruptions", "中断")}</span>
              <strong>{status.abortedCount}</strong>
            </div>
          </div>

          {status.tools.length > 0 ? (
            <div className="agent-status-section agent-status-tools">
              <span className="agent-status-section-label">{l("Most used tools", "常用工具")}</span>
              <div className="agent-status-chips">
                {status.tools.slice(0, 5).map((tool) => (
                  <span key={tool.name} className={`agent-status-tool ${tool.failureCount > 0 ? "has-failure" : ""}`}>
                    <code>{tool.name}</code>
                    <b>{l(`${tool.count} calls`, `${tool.count} 次`)}</b>
                    {tool.failureCount > 0 ? <em>{l(`${tool.failureCount} failed`, `${tool.failureCount} 次失败`)}</em> : null}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {shownTodos.length > 0 ? (
            <div className="agent-status-section agent-status-todos">
              <span className="agent-status-section-label">
                {l("Explicit plan", "显式计划")} · {status.todos.length}
              </span>
              <div className="agent-status-todo-list">
                {shownTodos.map((todo) => (
                  <div key={todo.id} className={`agent-status-todo ${todo.status}`}>
                    <TodoIcon status={todo.status} />
                    <span>{todo.content}</span>
                    <small>{todoStatusLabel(todo.status, language)}</small>
                  </div>
                ))}
                {status.todos.length > shownTodos.length ? (
                  <span className="agent-status-more">
                    {l(`${status.todos.length - shownTodos.length} more`, `另有 ${status.todos.length - shownTodos.length} 项`)}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {status.latestFailure ? (
            <div className="agent-status-failure">
              <AlertTriangle size={13} />
              <span>
                <strong>{status.latestFailure.title}</strong>
                {status.latestFailure.detail ? ` · ${status.latestFailure.detail}` : ""}
              </span>
            </div>
          ) : null}

          {status.projectPath ? (
            <div className="agent-status-project" title={status.projectPath}>
              <span>{l("Directory", "目录")}</span>
              <code>{status.projectPath}</code>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
