import type { CSSProperties, ReactElement } from "react";
import { ArrowRight, Clock3, GitBranch, RefreshCw, Workflow } from "lucide-react";
import { formatRelativeTime } from "../../../../core/format-session";
import type {
  SessionSearchResult,
  SessionStats,
  SessionStatsPeriod,
  UsageQuota,
  UsageQuotaCard,
  UsageQuotaSnapshot,
} from "../../../../core/types";
import type { QuotaFeedback, StatsFeedback } from "../../app-types";
import { formatCompactNumber, formatTokenCount } from "../../format-count";
import type { LanguageMode } from "../../language";
import { localize } from "../../language";
import { getLiveSessionState } from "../../live-filter";
import { SearchBox } from "../search/search-box";
import {
  SOURCE_LABEL,
  isRemoteSession,
  selectWorkbenchSessions,
  sourceUiFamily,
  statsPeriodLabel,
  supportsResumeSource,
  usageCacheRate,
  usageStatsDisplayRows,
  localizedLiveStateLabel,
  WORKBENCH_SESSION_LIMIT,
} from "../../session-ui";

const PERIODS: SessionStatsPeriod[] = ["today", "sevenDay", "thirtyDay", "allTime"];

export interface WorkbenchPageProps {
  stats: SessionStats;
  statsPeriod: SessionStatsPeriod;
  statsRefreshing: boolean;
  statsFeedback: StatsFeedback;
  quotas: UsageQuotaSnapshot;
  quotaLoading: boolean;
  quotaFeedback: QuotaFeedback;
  sessions: SessionSearchResult[];
  sessionQuery: string;
  liveSessionKeys: Set<string>;
  liveDetectionFailed: boolean;
  platform: NodeJS.Platform;
  language: LanguageMode;
  onStatsPeriodChange: (period: SessionStatsPeriod) => void;
  onRefreshStats: () => void;
  onRefreshQuotas: () => void;
  onOpenSettings: () => void;
  onSearchSessions: (query: string) => void;
  onOpenSession: (session: SessionSearchResult) => void;
  onResumeSession: (session: SessionSearchResult) => void;
  onShowSessions: (query: string) => void;
}

export function WorkbenchPage({
  stats,
  statsPeriod,
  statsRefreshing,
  statsFeedback,
  quotas,
  quotaLoading,
  quotaFeedback,
  sessions,
  sessionQuery,
  liveSessionKeys,
  liveDetectionFailed,
  platform,
  language,
  onStatsPeriodChange,
  onRefreshStats,
  onRefreshQuotas,
  onOpenSettings,
  onSearchSessions,
  onOpenSession,
  onResumeSession,
  onShowSessions,
}: WorkbenchPageProps): ReactElement {
  const l = (en: string, zh: string) => localize(language, en, zh);
  const cacheRate = usageCacheRate(stats.total);
  const sourceRows = usageStatsDisplayRows(stats.bySource);
  const sessionDetail = sourceRows.map((row) => `${row.label}: ${formatCompactNumber(row.sessionCount)} ${l("sessions", "个会话")}`).join("\n");
  const messageDetail = sourceRows.map((row) => `${row.label}: ${formatCompactNumber(row.messageCount)} ${l("messages", "条消息")}`).join("\n");
  const tokenParts = [
    { label: l("Input", "输入"), value: stats.total.inputTokens },
    { label: l("Cached input", "缓存输入"), value: stats.total.cachedInputTokens },
    { label: l("Output", "输出"), value: stats.total.outputTokens },
    { label: l("Reasoning", "推理"), value: stats.total.reasoningOutputTokens },
  ].filter((part) => part.value > 0);
  const tokenDetail = [
    ...tokenParts.map((part) => `${part.label}: ${formatTokenCount(part.value)}`),
    ...sourceRows.map((row) => `${row.label}: ${formatTokenCount(row.totalTokens)}`),
  ].join("\n");
  const cacheDetail = cacheRate == null
    ? l("No input token data is available.", "暂无输入 Token 数据。")
    : l(
        `Cached input accounts for ${cacheRate}% of all input tokens.`,
        `缓存输入占全部输入 Token 的 ${cacheRate}%。`,
      );
  const visibleSessions = sessionQuery.trim()
    ? sessions.slice(0, WORKBENCH_SESSION_LIMIT)
    : selectWorkbenchSessions(sessions, liveSessionKeys, liveDetectionFailed);
  return (
    <div className="workbench-page">
      <section className="workbench-overview" aria-label={l("Agent usage overview", "Agent 使用总览")}>
        <div className="workbench-usage">
          <div className="workbench-section-head">
            <div className="workbench-periods" role="group" aria-label={l("Usage period", "用量周期")}>
              {PERIODS.map((period) => (
                <button key={period} className={period === statsPeriod ? "active" : ""} onClick={() => onStatsPeriodChange(period)}>
                  {statsPeriodLabel(period, language)}
                </button>
              ))}
            </div>
            <button className="workbench-icon-button" onClick={onRefreshStats} disabled={statsRefreshing} aria-label={l("Refresh usage", "刷新用量")}>
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="workbench-metrics">
            <UsageMetric value={formatCompactNumber(stats.total.sessionCount)} label={l("Sessions", "会话")} detail={sessionDetail} />
            <UsageMetric value={formatCompactNumber(stats.total.messageCount)} label={l("Messages", "消息")} detail={messageDetail} />
            <UsageMetric value={formatTokenCount(stats.total.totalTokens)} label="Token" detail={tokenDetail} />
            <UsageMetric value={cacheRate == null ? "—" : `${cacheRate}%`} label={l("Cache rate", "缓存率")} detail={cacheDetail} />
          </div>
          {statsFeedback ? <p className={`workbench-feedback ${statsFeedback.kind}`}>{statsFeedback.message}</p> : null}
        </div>

        {(["codex", "claude-code"] as const).map((provider) => (
          <WorkbenchQuota
            key={provider}
            card={quotas.providers.find((item) => item.provider === provider) ?? null}
            provider={provider}
            loading={quotaLoading}
            language={language}
            onRefresh={onRefreshQuotas}
            onOpenSettings={onOpenSettings}
          />
        ))}
        {quotaFeedback ? <p className={`workbench-feedback quota ${quotaFeedback.kind}`}>{quotaFeedback.message}</p> : null}
      </section>

      <div className="workbench-primary-grid">
        <section className="workbench-panel workbench-sessions">
          <div className="workbench-panel-head">
            <h2>{l("Sessions", "会话")}</h2>
            <button onClick={() => onShowSessions(sessionQuery)}>{l("View all", "查看全部")} <ArrowRight size={13} /></button>
          </div>
          <div className="workbench-session-search">
            <SearchBox
              platform={platform}
              placeholder={l("Search sessions, then press Enter", "搜索会话，按 Enter 查询")}
              recentLabel={l("Recent searches", "最近搜索")}
              clearRecentLabel={l("Clear", "清空")}
              deleteRecentLabel={l("Delete recent search", "删除最近搜索")}
              submittedValue={sessionQuery}
              onSearch={onSearchSessions}
            />
          </div>
          <div className="workbench-session-list">
            {visibleSessions.length > 0 ? visibleSessions.map((session) => {
              const canResume = supportsResumeSource(session.source) && !isRemoteSession(session);
              const liveState = getLiveSessionState(session, liveSessionKeys, liveDetectionFailed);
              const live = liveState === "open";
              return (
                <article key={session.sessionKey} className={`workbench-session-row ${live ? "live" : ""}`} data-source={sourceUiFamily(session.source)} onClick={() => onOpenSession(session)}>
                  <i className="session-trajectory" aria-hidden="true" />
                  <div className="workbench-session-copy">
                    <strong title={session.displayTitle}>{session.displayTitle}</strong>
                    <span title={session.projectPath}>
                      <GitBranch size={12} />
                      <span className="workbench-session-meta-text">{projectName(session.projectPath)} · {SOURCE_LABEL[session.source]}</span>
                      <span className={`workbench-session-state ${liveState}`}><i aria-hidden="true" />{localizedLiveStateLabel(liveState, language)}</span>
                    </span>
                  </div>
                  <time><Clock3 size={12} />{formatRelativeTime(session.lastActivityAt)}</time>
                  {canResume ? <button className="workbench-resume" onClick={(event) => { event.stopPropagation(); onResumeSession(session); }}>Resume</button> : null}
                </article>
              );
            }) : <div className="workbench-section-empty">{sessionQuery ? l("No matching sessions.", "没有匹配的会话。") : l("No recent sessions.", "暂无最近会话。")}</div>}
          </div>
        </section>

        <section className="workbench-panel workbench-workflows">
          <div className="workbench-panel-head"><h2>Workflow</h2></div>
          <div className="workbench-empty-state">
            <Workflow size={22} />
            <strong>{l("Workflow is not migrated yet", "Workflow 暂未迁移")}</strong>
            <span>{l("This space is reserved for a future migration.", "这里先保留后续展示位置。")}</span>
          </div>
        </section>
      </div>

    </div>
  );
}

function UsageMetric({ value, label, detail }: { value: string; label: string; detail?: string }): ReactElement {
  return (
    <div
      className={detail ? "workbench-metric workbench-has-detail" : "workbench-metric"}
      tabIndex={detail ? 0 : undefined}
      aria-label={detail ? `${label}: ${value}. ${detail}` : `${label}: ${value}`}
    >
      <strong>{value}</strong><span>{label}</span>
      {detail ? <span className="workbench-detail-hint" role="tooltip">{detail}</span> : null}
    </div>
  );
}

function WorkbenchQuota({
  card,
  provider,
  loading,
  language,
  onRefresh,
  onOpenSettings,
}: {
  card: UsageQuotaCard | null;
  provider: UsageQuotaCard["provider"];
  loading: boolean;
  language: LanguageMode;
  onRefresh: () => void;
  onOpenSettings: () => void;
}): ReactElement {
  const l = (en: string, zh: string) => localize(language, en, zh);
  const displayName = provider === "codex" ? "Codex" : "Claude Code";
  const quotas = card?.quotas.filter((quota) => quota.key === "five_hour" || quota.key === "seven_day") ?? [];
  const available = card?.status === "supported" && quotas.length > 0;
  return (
    <div className={`workbench-quota ${provider}`}>
      <div className="workbench-section-head">
        <div className="quota-identity"><i>{provider === "codex" ? "CX" : "CC"}</i><strong>{displayName}</strong></div>
        <button className="workbench-icon-button" onClick={onRefresh} disabled={loading} aria-label={l(`Refresh ${displayName} quota`, `刷新 ${displayName} 额度`)}><RefreshCw size={14} /></button>
      </div>
      {available ? <div className="workbench-quota-windows">{quotas.map((quota) => <WorkbenchQuotaWindow key={quota.key} quota={quota} language={language} />)}</div> : (
        <div className="workbench-quota-empty">
          <span>{loading ? l("Checking quota...", "正在检查额度...") : card?.detail || l("Quota is unavailable.", "额度暂不可用。")}</span>
          {!loading ? <button onClick={onOpenSettings}>{l("Open settings", "打开设置")}</button> : null}
        </div>
      )}
    </div>
  );
}

function WorkbenchQuotaWindow({ quota, language }: { quota: UsageQuota; language: LanguageMode }): ReactElement {
  const label = quota.label === "5h" ? localize(language, "5 hours", "5 小时") : localize(language, "7 days", "7 天");
  const detail = quota.stale ? localize(language, "Data expired", "数据已过期") : formatQuotaReset(quota.resetsAt, language);
  return (
    <div className="workbench-quota-window workbench-has-detail" tabIndex={0} aria-label={`${label}: ${Math.round(quota.remainingPercent)}%. ${detail}`}>
      <div><span>{label}</span><strong>{Math.round(quota.remainingPercent)}%</strong></div>
      <div className="workbench-quota-track" aria-hidden="true"><i style={{ width: `${quota.remainingPercent}%` } as CSSProperties} /></div>
      {detail ? <span className="workbench-detail-hint" role="tooltip">{detail}</span> : null}
    </div>
  );
}

function projectName(projectPath: string): string {
  const normalized = projectPath.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).pop() || projectPath;
}

function formatQuotaReset(resetsAt: string | undefined, language: LanguageMode): string {
  if (!resetsAt) return "";
  const timestamp = Date.parse(resetsAt);
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.ceil((timestamp - Date.now()) / 60_000);
  if (minutes <= 0) return localize(language, "Reset due", "应重置");
  if (minutes < 60) return localize(language, `Resets in ${minutes}m`, `${minutes} 分钟后重置`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return localize(language, `Resets in ${hours}h`, `${hours} 小时后重置`);
  const days = Math.ceil(hours / 24);
  return localize(language, `Resets in ${days}d`, `${days} 天后重置`);
}
