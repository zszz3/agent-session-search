import { describe, expect, it, vi } from "vitest";
import type { SummaryEndpoint } from "./session-summarizer";
import { parseSkillAiSearchPlan, runSkillAiSearch } from "./skill-ai-search";
import type { SkillsShEntry, SkillsShPage } from "./skills-sh";

const endpoint: SummaryEndpoint = {
  baseUrl: "https://provider.example/v1",
  model: "test-model",
  apiKey: "test-key",
  apiFormat: "openai_chat",
};

function entry(id: string, installs = 0): SkillsShEntry {
  const [owner, repo, skillId] = id.split("/");
  return {
    id,
    source: `${owner}/${repo}`,
    owner: owner!,
    repo: repo!,
    skillId: skillId!,
    name: skillId!,
    installs,
    url: `https://skills.sh/${id}`,
  };
}

function page(skills: SkillsShEntry[], stale = false): SkillsShPage {
  return { skills, total: skills.length, hasMore: false, page: 0, stale };
}

describe("AI Skill search", () => {
  it("parses fenced plans, removes duplicate queries, and keeps the model explanation", () => {
    expect(parseSkillAiSearchPlan([
      "```json",
      JSON.stringify({
        queries: ["frontend design", " react ui ", "frontend design", "ignored fourth"],
        interpretation: "寻找能改善 React 界面设计质量的 Skill。",
      }),
      "```",
    ].join("\n"))).toEqual({
      queries: ["frontend design", "react ui", "ignored fourth"],
      interpretation: "寻找能改善 React 界面设计质量的 Skill。",
    });
  });

  it("uses one model call, searches the planned queries, and ranks repeated candidates first", async () => {
    const complete = vi.fn(async (_endpoint, messages) => {
      expect(messages[0]?.content).toContain("Do not ask a follow-up question");
      expect(messages[1]?.content).toContain("我想找一个检查 React 页面无障碍问题的 skill");
      return JSON.stringify({
        queries: ["react accessibility", "frontend a11y"],
        interpretation: "寻找检查 React 无障碍问题的 Skill。",
      });
    });
    const search = vi.fn(async (query: string) => query === "react accessibility"
      ? page([entry("one/repo/a", 20), entry("one/repo/shared", 5)])
      : page([entry("one/repo/shared", 5), entry("two/repo/c", 200)], true));

    const result = await runSkillAiSearch({
      query: "我想找一个检查 React 页面无障碍问题的 skill",
      language: "zh",
    }, endpoint, search, complete);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(search.mock.calls.map(([query]) => query)).toEqual(["react accessibility", "frontend a11y"]);
    expect(result).toMatchObject({
      originalQuery: "我想找一个检查 React 页面无障碍问题的 skill",
      queries: ["react accessibility", "frontend a11y"],
      interpretation: "寻找检查 React 无障碍问题的 Skill。",
      stale: true,
      total: 3,
    });
    expect(result.skills.map((skill) => skill.id)).toEqual([
      "one/repo/shared",
      "one/repo/a",
      "two/repo/c",
    ]);
  });

  it("keeps successful query results when another planned search fails", async () => {
    const complete = vi.fn(async () => JSON.stringify({
      queries: ["working query", "broken query"],
      interpretation: "Find a useful Skill.",
    }));
    const search = vi.fn(async (query: string) => {
      if (query === "broken query") throw new Error("offline");
      return page([entry("one/repo/result", 10)]);
    });

    await expect(runSkillAiSearch({ query: "help me test APIs", language: "en" }, endpoint, search, complete))
      .resolves.toMatchObject({ total: 1, partial: true });
  });

  it("rejects an unusable model plan before searching the registry", async () => {
    const search = vi.fn();
    await expect(runSkillAiSearch(
      { query: "find something", language: "en" },
      endpoint,
      search,
      async () => "I need more information",
    )).rejects.toThrow("valid search queries");
    expect(search).not.toHaveBeenCalled();
  });
});
