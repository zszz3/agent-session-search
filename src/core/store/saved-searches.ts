import type { SearchOptions } from "../types";
import type { PostgresQueryable } from "../postgres/database";

export interface SavedSearch {
  id: number;
  name: string;
  options: SearchOptions;
  createdAt: number;
  lastUsedAt: number | null;
  useCount: number;
}

interface SavedSearchRow extends Record<string, unknown> {
  id: number;
  name: string;
  options: SearchOptions | string;
  created_at: Date | string;
  last_used_at: Date | string | null;
  use_count: number;
}

export class SavedSearchStore {
  constructor(private readonly database: PostgresQueryable) {}

  async listSavedSearches(): Promise<SavedSearch[]> {
    const result = await this.database.query<SavedSearchRow>(
      `select id, name, options, created_at, last_used_at, use_count
       from agent_recall.saved_searches
       order by use_count desc, last_used_at desc nulls last, created_at desc`,
    );
    return result.rows.map((row) => this.hydrate(row));
  }

  async getSavedSearch(id: number): Promise<SavedSearch | null> {
    const result = await this.database.query<SavedSearchRow>(
      `select id, name, options, created_at, last_used_at, use_count
       from agent_recall.saved_searches
       where id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? this.hydrate(row) : null;
  }

  async createSavedSearch(name: string, options: SearchOptions): Promise<SavedSearch> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Saved search name is required.");
    const result = await this.database.query<SavedSearchRow>(
      `insert into agent_recall.saved_searches (name, options, created_at, use_count)
       values ($1, $2::jsonb, now(), 0)
       returning id, name, options, created_at, last_used_at, use_count`,
      [trimmed, JSON.stringify(options)],
    );
    return this.hydrate(result.rows[0]);
  }

  async deleteSavedSearch(id: number): Promise<boolean> {
    const result = await this.database.query(
      "delete from agent_recall.saved_searches where id = $1",
      [id],
    );
    return result.rowCount > 0;
  }

  async touchSavedSearch(id: number): Promise<void> {
    await this.database.query(
      `update agent_recall.saved_searches
       set last_used_at = now(), use_count = use_count + 1
       where id = $1`,
      [id],
    );
  }

  private hydrate(row: SavedSearchRow): SavedSearch {
    let options: SearchOptions = {};
    try {
      options = typeof row.options === "string"
        ? JSON.parse(row.options) as SearchOptions
        : row.options;
    } catch {
      options = {};
    }
    return {
      id: row.id,
      name: row.name,
      options,
      createdAt: timestamp(row.created_at),
      lastUsedAt: row.last_used_at === null ? null : timestamp(row.last_used_at),
      useCount: row.use_count,
    };
  }
}

function timestamp(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}
