import { requestSummaryCompletion, type ChatCompletionFn, type SummaryEndpoint } from "./session-summarizer";
import type { SkillsShEntry, SkillsShPage } from "./skills-sh";

export interface SkillAiSearchPlan {
  queries: string[];
  interpretation: string;
}

export interface SkillAiSearchResult extends SkillAiSearchPlan {
  originalQuery: string;
  skills: SkillsShEntry[];
  total: number;
  stale: boolean;
  partial: boolean;
}

const SKILL_AI_SEARCH_SYSTEM_PROMPT = [
  "You are the find-skill assistant inside AgentRecall.",
  "Turn the user's natural-language need into concise search queries for the public skills.sh registry.",
  "Do not ask a follow-up question. Make the best useful interpretation from the request you have.",
  "Return one JSON object and nothing else: {\"queries\": string[], \"interpretation\": string}.",
  "queries: 1-3 short English keyword queries, ordered best first. Preserve product, framework, language, and tool names.",
  "interpretation: one short sentence explaining what capability you understood; use the user's language.",
  "Do not recommend, install, or invent a Skill. The app will search the registry after you answer.",
].join("\n");

const MAX_QUERIES = 3;
const MAX_QUERY_LENGTH = 120;
const MAX_INTERPRETATION_LENGTH = 300;
const MAX_RESULTS = 50;

export function parseSkillAiSearchPlan(content: string): SkillAiSearchPlan {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) throw invalidPlanError();
  let payload: unknown;
  try {
    payload = JSON.parse(content.slice(start, end + 1));
  } catch {
    throw invalidPlanError();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw invalidPlanError();
  const record = payload as Record<string, unknown>;
  const rawQueries = Array.isArray(record.queries)
    ? record.queries
    : typeof record.query === "string"
      ? [record.query]
      : [];
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const value of rawQueries) {
    if (typeof value !== "string") continue;
    const query = value.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
    const identity = query.toLocaleLowerCase();
    if (!query || seen.has(identity)) continue;
    seen.add(identity);
    queries.push(query);
    if (queries.length >= MAX_QUERIES) break;
  }
  if (queries.length === 0) throw invalidPlanError();
  const interpretation = typeof record.interpretation === "string"
    ? record.interpretation.replace(/\s+/g, " ").trim().slice(0, MAX_INTERPRETATION_LENGTH)
    : "";
  return { queries, interpretation };
}

export async function runSkillAiSearch(
  input: { query: string; language: "en" | "zh" },
  endpoint: SummaryEndpoint,
  search: (query: string) => Promise<SkillsShPage>,
  complete: ChatCompletionFn = requestSummaryCompletion,
): Promise<SkillAiSearchResult> {
  const originalQuery = input.query.replace(/\s+/g, " ").trim();
  if (!originalQuery) throw new Error("Describe the Skill you want to find.");
  const rawPlan = await complete(endpoint, [
    { role: "system", content: SKILL_AI_SEARCH_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        `User language: ${input.language === "zh" ? "Chinese" : "English"}`,
        "Capability request:",
        originalQuery,
      ].join("\n"),
    },
  ]);
  const plan = parseSkillAiSearchPlan(rawPlan);
  const settled = await Promise.allSettled(plan.queries.map((query) => search(query)));
  const successful = settled.flatMap((result, queryIndex) => result.status === "fulfilled"
    ? [{ queryIndex, page: result.value }]
    : []);
  if (successful.length === 0) {
    const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw new Error(failure ? errorMessage(failure.reason) : "Could not search skills.sh.");
  }

  const ranked = new Map<string, { skill: SkillsShEntry; score: number; firstSeen: number }>();
  let firstSeen = 0;
  for (const { queryIndex, page } of successful) {
    const queryWeight = Math.max(0.7, 1 - queryIndex * 0.12);
    page.skills.forEach((skill, resultIndex) => {
      const current = ranked.get(skill.id) ?? { skill, score: 0, firstSeen: firstSeen++ };
      current.score += (100 / (resultIndex + 1)) * queryWeight;
      current.score += Math.log10(skill.installs + 1) * 0.02;
      ranked.set(skill.id, current);
    });
  }
  const skills = [...ranked.values()]
    .sort((left, right) => right.score - left.score || left.firstSeen - right.firstSeen)
    .slice(0, MAX_RESULTS)
    .map(({ skill }) => skill);
  return {
    originalQuery,
    ...plan,
    skills,
    total: skills.length,
    stale: successful.some(({ page }) => page.stale),
    partial: successful.length !== settled.length,
  };
}

function invalidPlanError(): Error {
  return new Error("AI Skill search did not return valid search queries.");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
