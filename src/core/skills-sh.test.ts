import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillsShClient } from "./skills-sh";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function cachePath(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "agent-recall-skills-sh-"));
  temporaryRoots.push(root);
  return path.join(root, "cache", "skills-sh.json");
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("SkillsShClient", () => {
  it("loads and validates the all-time leaderboard", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      skills: [
        { source: "vercel-labs/skills", skillId: "find-skills", name: "Find Skills", installs: 42 },
        { source: "openai/skills", skillId: "docs", name: "Docs", installs: 12 },
      ],
      total: 2,
      hasMore: false,
      page: 0,
    }));
    const client = new SkillsShClient({ cachePath: cachePath(), fetchImpl });

    await expect(client.list({ page: 0, query: "" })).resolves.toMatchObject({
      page: 0,
      total: 2,
      hasMore: false,
      stale: false,
      skills: [
        { id: "vercel-labs/skills/find-skills", owner: "vercel-labs", repo: "skills", skillId: "find-skills", installs: 42 },
        { id: "openai/skills/docs", owner: "openai", repo: "skills", skillId: "docs", installs: 12 },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://skills.sh/api/skills/all-time/0",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("uses the search endpoint and normalizes its non-paginated response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      skills: [{ id: "acme/tools/review", source: "acme/tools", skillId: "review", name: "Review", installs: 9 }],
    }));
    const client = new SkillsShClient({ cachePath: cachePath(), fetchImpl });

    const page = await client.list({ page: 0, query: " code review " });
    expect(page).toMatchObject({ page: 0, total: 1, hasMore: false });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://skills.sh/api/search?q=code%20review&limit=50",
      expect.any(Object),
    );
  });

  it("downloads a complete Skill and rejects unsafe bundle paths before returning it", async () => {
    const validFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      hash: "abc123",
      files: [
        { path: "SKILL.md", contents: "---\nname: review\ndescription: Review changes\n---\n\n# Review\n" },
        { path: "references/checklist.md", contents: "Checklist\n" },
      ],
    }));
    const client = new SkillsShClient({ cachePath: cachePath(), fetchImpl: validFetch });
    const entry = {
      id: "acme/tools/review",
      source: "acme/tools",
      owner: "acme",
      repo: "tools",
      skillId: "review",
      name: "Review",
      installs: 9,
      url: "https://skills.sh/acme/tools/review",
    };

    await expect(client.getDetail(entry)).resolves.toMatchObject({
      entry,
      hash: "abc123",
      markdown: expect.stringContaining("# Review"),
      files: [
        { relativePath: "SKILL.md", contents: expect.any(String) },
        { relativePath: "references/checklist.md", contents: "Checklist\n" },
      ],
    });
    expect(validFetch).toHaveBeenCalledWith(
      "https://skills.sh/api/download/acme/tools/review",
      expect.any(Object),
    );

    const unsafeClient = new SkillsShClient({
      cachePath: cachePath(),
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
        files: [
          { path: "SKILL.md", contents: "# Review\n" },
          { path: "../outside.txt", contents: "unsafe" },
        ],
      })),
    });
    await expect(unsafeClient.getDetail(entry)).rejects.toThrow(/unsafe skill file path/i);
  });

  it("uses a fresh cache without a request and falls back to stale cache after a request fails", async () => {
    let now = 1_000;
    const file = cachePath();
    const online = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      skills: [{ source: "acme/tools", skillId: "review", name: "Review", installs: 9 }],
      total: 1,
      hasMore: false,
      page: 0,
    }));
    const client = new SkillsShClient({ cachePath: file, fetchImpl: online, now: () => now, cacheTtlMs: 100 });
    expect((await client.list({ page: 0, query: "" })).stale).toBe(false);
    expect(existsSync(file)).toBe(true);

    await client.list({ page: 0, query: "" });
    expect(online).toHaveBeenCalledTimes(1);

    now += 101;
    online.mockRejectedValueOnce(new Error("offline"));
    const fallback = await client.list({ page: 0, query: "" });
    expect(fallback.stale).toBe(true);
    expect(fallback.skills[0]?.name).toBe("Review");
  });
});
