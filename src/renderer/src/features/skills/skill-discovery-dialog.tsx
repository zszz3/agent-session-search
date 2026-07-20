import { useEffect, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { Download, ExternalLink, Search, Sparkles, Trophy, X } from "lucide-react";
import type { SkillAiSearchResult } from "../../../../core/skill-ai-search";
import type { SkillsShDetail, SkillsShEntry } from "../../../../core/skills-sh";
import { formatCompactNumber } from "../../format-count";
import { localize, type LanguageMode } from "../../language";
import { Markdown } from "../../markdown";

export function SkillDiscoveryDialog({
  open,
  language,
  onClose,
  onImported,
}: {
  open: boolean;
  language: LanguageMode;
  onClose: () => void;
  onImported: (managedId: string) => void;
}): ReactElement | null {
  const l = (en: string, zh: string) => localize(language, en, zh);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [skills, setSkills] = useState<SkillsShEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [stale, setStale] = useState(false);
  const [searchMode, setSearchMode] = useState<"leaderboard" | "keyword" | "ai">("leaderboard");
  const [aiResult, setAiResult] = useState<SkillAiSearchResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillsShDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadPage = async (nextPage: number, nextQuery: string, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.sessionSearch.listDiscoveredSkills({ page: nextPage, query: nextQuery });
      setSkills((current) => append ? dedupeEntries([...current, ...result.skills]) : result.skills);
      setPage(result.page);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setStale(result.stale);
      setSelectedId((current) => current && (append ? [...skills, ...result.skills] : result.skills).some((entry) => entry.id === current)
        ? current
        : result.skills[0]?.id ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setInput("");
    setQuery("");
    setSearchMode("leaderboard");
    setAiResult(null);
    setSkills([]);
    setSelectedId(null);
    setDetail(null);
    void loadPage(0, "", false);
  }, [open]);

  useEffect(() => {
    if (!open || !selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    window.sessionSearch.getDiscoveredSkill(selectedId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((reason) => {
        if (!cancelled) setDetailError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedId]);

  if (!open) return null;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    const next = input.trim();
    setQuery(next);
    setSearchMode(next ? "keyword" : "leaderboard");
    setAiResult(null);
    setSelectedId(null);
    setDetail(null);
    void loadPage(0, next, false);
  };

  const runAiSearch = async () => {
    const next = input.trim();
    if (!next || loading) return;
    setQuery(next);
    setSearchMode("ai");
    setAiResult(null);
    setSkills([]);
    setSelectedId(null);
    setDetail(null);
    setLoading(true);
    setAiSearching(true);
    setError(null);
    try {
      const result = await window.sessionSearch.aiSearchDiscoveredSkills({ query: next, language });
      setAiResult(result);
      setSkills(result.skills);
      setTotal(result.total);
      setHasMore(false);
      setStale(result.stale);
      setSelectedId(result.skills[0]?.id ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
      setAiSearching(false);
    }
  };

  const importSkill = async () => {
    if (!selectedId) return;
    setImporting(true);
    setDetailError(null);
    try {
      const result = await window.sessionSearch.importDiscoveredSkill(selectedId);
      onImported(result.managedId);
      onClose();
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="dialog-backdrop managed-skill-dialog-backdrop" onMouseDown={onClose}>
      <section className="command-dialog managed-skill-task-dialog discovery" onMouseDown={(event) => event.stopPropagation()}>
        <header className="managed-skill-dialog-head">
          <div><h3>{l("Discover Skills", "发现 Skill")}</h3><p>{l("Search the public skills.sh registry with keywords or one-shot AI. Adding a Skill only puts it in your library.", "用关键词或一次性 AI 搜索 skills.sh 公共仓库；加入后只进入 Skill 库，不会自动安装到 Agent。")}</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={l("Close", "关闭")}><X size={16} /></button>
        </header>
        <form className="managed-skill-dialog-search skill-discovery-search" onSubmit={submitSearch}>
          <span className="skill-discovery-search-field">
            <Search size={14} />
            <input value={input} onChange={(event) => setInput(event.currentTarget.value)} placeholder={l("Enter keywords, or describe the capability you need", "输入关键词，或描述你想解决的问题")} />
          </span>
          <button type="submit" className="skill-discovery-keyword-action" disabled={loading}>{l("Search", "搜索")}</button>
          <button type="button" className="skill-discovery-ai-action" onClick={() => void runAiSearch()} disabled={loading || !input.trim()}>
            <Sparkles size={13} />{aiSearching ? l("Thinking…", "分析中…") : l("AI search", "AI 搜索")}
          </button>
        </form>
        {aiResult ? (
          <div className="skill-discovery-ai-insight">
            <Sparkles size={14} />
            <div>
              <strong>{aiResult.interpretation || l("Matched Skills for your request", "已按你的需求匹配 Skill")}</strong>
              <span className="skill-discovery-ai-queries">
                {aiResult.queries.map((item) => <code key={item}>{item}</code>)}
              </span>
            </div>
            {aiResult.partial ? <small>{l("Partial results", "部分结果")}</small> : null}
          </div>
        ) : null}
        <div className="skill-discovery-meta">
          <span>{searchMode === "ai"
            ? l(`AI matches · ${total}`, `AI 匹配 · ${total}`)
            : query
              ? l(`Results for “${query}”`, `“${query}”的结果`)
              : l(`All-time leaderboard · ${total}`, `历史安装榜 · ${total}`)}</span>
          {stale ? <span className="stale">{l("Offline cache", "离线缓存")}</span> : null}
        </div>
        {error ? <div className="managed-skill-dialog-error">{error}<button type="button" onClick={() => searchMode === "ai" ? void runAiSearch() : void loadPage(0, query, false)}>{l("Retry", "重试")}</button></div> : null}

        <div className="skill-discovery-workspace">
          <div className="skill-discovery-list">
            {loading && skills.length === 0 ? <div className="managed-skill-dialog-empty">{aiSearching ? l("Understanding your request and searching…", "正在理解需求并搜索…") : l("Loading leaderboard…", "正在加载榜单…")}</div> : null}
            {!loading && skills.length === 0 ? <div className="managed-skill-dialog-empty">{l("No Skills found.", "没有找到 Skill。")}</div> : null}
            {skills.map((skill, index) => (
              <button key={skill.id} type="button" className={selectedId === skill.id ? "active" : ""} onClick={() => setSelectedId(skill.id)}>
                <span className="skill-discovery-rank">{searchMode === "ai" ? <Sparkles size={12} /> : query ? <Search size={12} /> : index < 3 ? <Trophy size={12} /> : index + 1}</span>
                <span><strong>{skill.name}</strong><small>{skill.source}</small></span>
                <span className="skill-discovery-installs">{formatCompactNumber(skill.installs)}</span>
              </button>
            ))}
            {hasMore && searchMode === "leaderboard" ? <button type="button" className="skill-discovery-more" onClick={() => void loadPage(page + 1, "", true)} disabled={loading}>{loading ? l("Loading…", "加载中…") : l("Load more", "加载更多")}</button> : null}
          </div>
          <div className="skill-discovery-detail">
            {detailLoading ? <div className="managed-skill-dialog-empty">{l("Loading Skill…", "正在加载 Skill…")}</div> : null}
            {detailError ? <div className="managed-skill-dialog-error">{detailError}</div> : null}
            {!detailLoading && detail ? (
              <>
                <header>
                  <div><h4>{detail.entry.name}</h4><p>{detail.entry.source} · {formatCompactNumber(detail.entry.installs)} {l("installs", "次安装")}</p></div>
                  <button type="button" className="icon-button" onClick={() => void window.sessionSearch.openExternalLink(detail.entry.url)} title={l("Open skills.sh", "打开 skills.sh")}><ExternalLink size={14} /></button>
                </header>
                <div className="skill-discovery-markdown"><Markdown text={detail.markdown} language={language} /></div>
                <footer>
                  <span>{l(`${detail.files.length} files`, `${detail.files.length} 个文件`)}</span>
                  <button type="button" className="primary" onClick={() => void importSkill()} disabled={importing}>
                    <Download size={13} />{importing ? l("Adding…", "正在加入…") : l("Add to Skill library", "加入 Skill 库")}
                  </button>
                </footer>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function dedupeEntries(entries: SkillsShEntry[]): SkillsShEntry[] {
  const byId = new Map<string, SkillsShEntry>();
  for (const entry of entries) byId.set(entry.id, entry);
  return [...byId.values()];
}
