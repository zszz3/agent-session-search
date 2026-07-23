import type { PostgresQueryable } from "./postgres/database";

export interface RelatedSession {
  sessionKey: string;
  title: string;
  source: string;
  projectPath: string;
  timestamp: number;
  score: number;
  sharedTags: string[];
}

interface CandidateRow extends Record<string, unknown> {
  session_key: string;
  original_title: string;
  custom_title: string | null;
  first_question: string;
  source: string;
  project_path: string;
  timestamp: number | string;
  tags: string[];
}

const RELATED_LIMIT_DEFAULT = 8;
const TIME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Finds sessions related to the given one, scored by:
 *   same project +30, shared tag +20 each, same agent +10,
 *   temporal proximity (within 7 days) +15, title keyword overlap +5 each.
 */
export async function findRelatedSessions(
  database: PostgresQueryable,
  sessionKey: string,
  limit = RELATED_LIMIT_DEFAULT,
): Promise<RelatedSession[]> {
  const targetResult = await database.query<CandidateRow>(
    `${candidateSelect()}
     where sessions.session_key = $1
     group by sessions.session_key`,
    [sessionKey],
  );
  const target = targetResult.rows[0];
  if (!target) return [];

  const targetTags = target.tags;
  const targetKeywords = extractKeywords(displayTitle(target));

  const candidateResult = await database.query<CandidateRow>(
    `${candidateSelect()}
     where sessions.session_key <> $1 and sessions.hidden = false
     group by sessions.session_key
     order by sessions.started_at desc
     limit 500`,
    [sessionKey],
  );

  const scored: RelatedSession[] = [];
  for (const candidate of candidateResult.rows) {
    let score = 0;
    if (candidate.project_path && candidate.project_path === target.project_path) score += 30;
    if (candidate.source === target.source) score += 10;
    const candidateTimestamp = Number(candidate.timestamp);
    const targetTimestamp = Number(target.timestamp);
    if (Math.abs(candidateTimestamp - targetTimestamp) <= TIME_WINDOW_MS) score += 15;

    const sharedTags = targetTags.filter((tag) => candidate.tags.includes(tag));
    score += sharedTags.length * 20;

    const candidateKeywords = extractKeywords(displayTitle(candidate));
    const overlap = targetKeywords.filter((word) => candidateKeywords.includes(word)).length;
    score += overlap * 5;

    if (score <= 0) continue;
    scored.push({
      sessionKey: candidate.session_key,
      title: displayTitle(candidate),
      source: candidate.source,
      projectPath: candidate.project_path,
      timestamp: candidateTimestamp,
      score,
      sharedTags,
    });
  }

  scored.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);
  return scored.slice(0, limit);
}

function displayTitle(row: CandidateRow): string {
  return row.custom_title || row.original_title || row.first_question || "Untitled Session";
}

function candidateSelect(): string {
  return `
    select
      sessions.session_key,
      sessions.original_title,
      sessions.custom_title,
      sessions.first_question,
      sessions.source,
      sessions.project_path,
      extract(epoch from sessions.started_at) * 1000 as timestamp,
      coalesce(
        array_agg(lower(tags.name)) filter (where tags.name is not null),
        '{}'::text[]
      ) as tags
    from agent_recall.sessions sessions
    left join agent_recall.session_tags on session_tags.session_key = sessions.session_key
    left join agent_recall.tags on tags.id = session_tags.tag_id
  `;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "is", "are", "was", "were", "be", "been", "do", "does", "did", "will", "would", "can",
  "could", "should", "may", "might", "this", "that", "these", "those", "it", "its", "as",
  "from", "about", "into", "over", "under", "up", "down", "out", "off", "then", "than",
  "so", "such", "no", "not", "only", "own", "same", "too", "very", "just", "also", "how",
  "what", "when", "where", "which", "who", "why", "帮我", "请", "怎么", "如何", "什么", "一下",
]);

function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
}
