import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../postgres/database";
import { POSTGRES_MIGRATIONS } from "../postgres/schema";
import { PGliteTestPool } from "../postgres/test-pglite";
import { SavedSearchStore } from "./saved-searches";

describe("SavedSearchStore", () => {
  let database: PostgresDatabase;
  let store: SavedSearchStore;

  beforeEach(async () => {
    database = new PostgresDatabase(new PGliteTestPool(), {
      migrationLock: false,
      migrations: POSTGRES_MIGRATIONS,
    });
    await database.initialize();
    store = new SavedSearchStore(database);
  });

  afterEach(async () => {
    await database.close();
  });

  it("creates and lists saved searches", async () => {
    const created = await store.createSavedSearch("My bugs", {
      query: "bug",
      source: "codex-cli",
    });
    expect(created.name).toBe("My bugs");
    expect(created.options).toMatchObject({ query: "bug", source: "codex-cli" });
    expect(created.useCount).toBe(0);

    const list = await store.listSavedSearches();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("My bugs");
  });

  it("rejects empty and duplicate names", async () => {
    await expect(store.createSavedSearch("   ", {})).rejects.toThrow(/name is required/i);
    await store.createSavedSearch("dup", {});
    await expect(store.createSavedSearch("dup", {})).rejects.toThrow();
  });

  it("deletes a saved search", async () => {
    const created = await store.createSavedSearch("to delete", {});
    await expect(store.deleteSavedSearch(created.id)).resolves.toBe(true);
    await expect(store.listSavedSearches()).resolves.toHaveLength(0);
    await expect(store.deleteSavedSearch(created.id)).resolves.toBe(false);
  });

  it("increments use count and orders by usage", async () => {
    const rare = await store.createSavedSearch("rare", {});
    const often = await store.createSavedSearch("often", {});
    await store.touchSavedSearch(often.id);
    await store.touchSavedSearch(often.id);
    await store.touchSavedSearch(rare.id);

    await expect(store.getSavedSearch(often.id)).resolves.toMatchObject({
      useCount: 2,
      lastUsedAt: expect.any(Number),
    });
    const list = await store.listSavedSearches();
    expect(list.map((item) => item.name)).toEqual(["often", "rare"]);
  });
});
