import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadClaudeQuotaCard, loadCodexQuotaCard, loadUsageQuotaSnapshot } from "./quota";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function makeHome(): string {
  return mkdtempSync(path.join(tmpdir(), "session-search-quota-"));
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value), "utf8");
}

describe("usage quota loader", () => {
  it("loads Codex subscription quota from OAuth auth and normalizes remaining percentages", async () => {
    const homeDir = makeHome();
    try {
      writeJson(path.join(homeDir, ".codex", "auth.json"), {
        tokens: {
          access_token: "codex-access",
          account_id: "account-1",
        },
      });

      const card = await loadCodexQuotaCard({
        now: NOW,
        homeDir,
        env: {},
        codexFetcher: async (accessToken, accountId) => {
          expect(accessToken).toBe("codex-access");
          expect(accountId).toBe("account-1");
          return {
            plan_type: "plus",
            rate_limit: {
              primary_window: { used_percent: 25, reset_at: 1_807_000_000 },
              secondary_window: { used_percent: 60, reset_at: 1_807_400_000 },
            },
          };
        },
      });

      expect(card).toMatchObject({
        provider: "codex",
        displayName: "Codex",
        status: "supported",
        source: "chatgpt.com",
        plan: "Plus",
      });
      expect(card.quotas).toEqual([
        expect.objectContaining({ key: "five_hour", label: "5h", usedPercent: 25, remainingPercent: 75 }),
        expect.objectContaining({ key: "seven_day", label: "7d", usedPercent: 60, remainingPercent: 40 }),
      ]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("does not fetch Codex subscription quota for API-key-only auth", async () => {
    const homeDir = makeHome();
    try {
      writeJson(path.join(homeDir, ".codex", "auth.json"), {
        OPENAI_API_KEY: "sk-test",
      });
      let fetched = false;

      const card = await loadCodexQuotaCard({
        now: NOW,
        homeDir,
        env: {},
        codexFetcher: async () => {
          fetched = true;
          return {};
        },
      });

      expect(fetched).toBe(false);
      expect(card.status).toBe("unsupported_api_key");
      expect(card.detail).toContain("API key");
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("loads Claude Code quota from a local statusline snapshot", () => {
    const homeDir = makeHome();
    try {
      writeJson(path.join(homeDir, ".claude", "statusline-snapshot.json"), {
        plan: "max",
        source: "onwatch",
        rate_limits: {
          five_hour: { used_percentage: 10, resets_at: 1_807_000_000 },
          seven_day: { remaining_percentage: 55, resets_at: 1_807_400_000 },
        },
      });

      const card = loadClaudeQuotaCard({ now: NOW, homeDir, env: {} });

      expect(card).toMatchObject({
        provider: "claude-code",
        displayName: "Claude Code",
        status: "supported",
        source: "onwatch",
        plan: "Max",
      });
      expect(card.quotas).toEqual([
        expect.objectContaining({ key: "five_hour", label: "5h", usedPercent: 10, remainingPercent: 90 }),
        expect.objectContaining({ key: "seven_day", label: "7d", usedPercent: 45, remainingPercent: 55 }),
      ]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("returns a snapshot for both providers", async () => {
    const homeDir = makeHome();
    try {
      const snapshot = await loadUsageQuotaSnapshot({
        now: NOW,
        homeDir,
        env: {},
        codexFetcher: async () => ({}),
      });

      expect(snapshot.generatedAt).toBe(NOW.toISOString());
      expect(snapshot.providers.map((provider) => provider.provider)).toEqual(["codex", "claude-code"]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("skips loading and omits the Codex card when hidden", async () => {
    const homeDir = makeHome();
    try {
      writeJson(path.join(homeDir, ".codex", "auth.json"), {
        tokens: { access_token: "codex-access", account_id: "account-1" },
      });
      let fetched = false;

      const snapshot = await loadUsageQuotaSnapshot({
        now: NOW,
        homeDir,
        env: {},
        hideCodexQuota: true,
        codexFetcher: async () => {
          fetched = true;
          return {};
        },
      });

      expect(fetched).toBe(false);
      expect(snapshot.providers.map((provider) => provider.provider)).toEqual(["claude-code"]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("omits the Claude Code card when hidden", async () => {
    const homeDir = makeHome();
    try {
      const snapshot = await loadUsageQuotaSnapshot({
        now: NOW,
        homeDir,
        env: {},
        hideClaudeQuota: true,
        codexFetcher: async () => ({}),
      });

      expect(snapshot.providers.map((provider) => provider.provider)).toEqual(["codex"]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("returns an empty provider list when both quotas are hidden", async () => {
    const homeDir = makeHome();
    try {
      const snapshot = await loadUsageQuotaSnapshot({
        now: NOW,
        homeDir,
        env: {},
        hideCodexQuota: true,
        hideClaudeQuota: true,
        codexFetcher: async () => ({}),
      });

      expect(snapshot.providers).toEqual([]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
