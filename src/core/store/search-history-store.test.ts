import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../postgres/database";
import { POSTGRES_MIGRATIONS } from "../postgres/schema";
import { PGliteTestPool } from "../postgres/test-pglite";
import { SearchHistoryStore } from "./search-history-store";

describe("SearchHistoryStore", () => {
  let database: PostgresDatabase;
  let store: SearchHistoryStore;

  beforeEach(async () => {
    database = new PostgresDatabase(new PGliteTestPool(), {
      migrationLock: false,
      migrations: POSTGRES_MIGRATIONS,
    });
    await database.initialize();
    store = new SearchHistoryStore(database);
  });

  afterEach(async () => {
    await database.close();
  });

  it("records and lists recent searches", async () => {
    await store.recordSearch("login bug", 3);
    await store.recordSearch("token refresh", 5);
    const recent = await store.listRecentSearches();
    expect(recent).toHaveLength(2);
    expect(recent[0]).toMatchObject({ query: "token refresh", resultCount: 5 });
  });

  it("ignores empty queries and deduplicates identical queries", async () => {
    await store.recordSearch("   ", 0);
    await store.recordSearch("same query", 1);
    await store.recordSearch("same query", 9);
    await expect(store.listRecentSearches()).resolves.toEqual([
      expect.objectContaining({ query: "same query", resultCount: 9 }),
    ]);
  });

  it("filters history and stores search options", async () => {
    await store.recordSearch("fix login", 2);
    await store.recordSearch("refactor auth", 4);
    await store.recordSearch("login page css", 1, {
      source: "qoder",
      tag: "urgent",
    });
    const matches = await store.searchHistory("login");
    expect(matches).toHaveLength(2);
    expect(matches.every((entry) => entry.query.includes("login"))).toBe(true);
    expect(matches[0].options).toMatchObject({ source: "qoder", tag: "urgent" });
  });

  it("deletes individual entries and clears all history", async () => {
    await store.recordSearch("keep", 1);
    await store.recordSearch("remove", 2);
    const entry = (await store.listRecentSearches())
      .find((item) => item.query === "remove");
    await expect(store.deleteEntry(entry!.id)).resolves.toBe(true);
    await expect(store.listRecentSearches()).resolves.toEqual([
      expect.objectContaining({ query: "keep" }),
    ]);
    await store.clearHistory();
    await expect(store.listRecentSearches()).resolves.toHaveLength(0);
  });
});
