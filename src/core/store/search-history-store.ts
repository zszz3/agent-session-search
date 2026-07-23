import type { SearchOptions } from "../types";
import type { PostgresDatabase, PostgresQueryable } from "../postgres/database";

export interface SearchHistoryEntry {
  id: number;
  query: string;
  resultCount: number;
  searchedAt: number;
  options: SearchOptions | null;
}

interface SearchHistoryRow extends Record<string, unknown> {
  id: number;
  query: string;
  result_count: number;
  searched_at: Date | string;
  options: SearchOptions | string | null;
}

const MAX_HISTORY_ENTRIES = 100;

export class SearchHistoryStore {
  constructor(private readonly database: PostgresDatabase) {}

  async recordSearch(query: string, resultCount: number, options?: SearchOptions): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) return;
    await this.database.transaction(async (client) => {
      await client.query("delete from agent_recall.search_history where query = $1", [trimmed]);
      await client.query(
        `insert into agent_recall.search_history (query, result_count, searched_at, options)
         values ($1, $2, now(), $3::jsonb)`,
        [trimmed, resultCount, options ? JSON.stringify(options) : null],
      );
      await this.prune(client);
    });
  }

  async listRecentSearches(limit = 20): Promise<SearchHistoryEntry[]> {
    const result = await this.database.query<SearchHistoryRow>(
      `select id, query, result_count, searched_at, options
       from agent_recall.search_history
       order by searched_at desc, id desc
       limit $1`,
      [boundedLimit(limit)],
    );
    return result.rows.map((row) => this.hydrate(row));
  }

  async searchHistory(query: string, limit = 20): Promise<SearchHistoryEntry[]> {
    const pattern = `%${query.trim()}%`;
    const result = await this.database.query<SearchHistoryRow>(
      `select id, query, result_count, searched_at, options
       from agent_recall.search_history
       where query ilike $1
       order by searched_at desc, id desc
       limit $2`,
      [pattern, boundedLimit(limit)],
    );
    return result.rows.map((row) => this.hydrate(row));
  }

  async clearHistory(): Promise<void> {
    await this.database.query("delete from agent_recall.search_history");
  }

  async deleteEntry(id: number): Promise<boolean> {
    const result = await this.database.query(
      "delete from agent_recall.search_history where id = $1",
      [id],
    );
    return result.rowCount > 0;
  }

  private async prune(database: PostgresQueryable): Promise<void> {
    await database.query(
      `delete from agent_recall.search_history
       where id not in (
         select id
         from agent_recall.search_history
         order by searched_at desc, id desc
         limit $1
       )`,
      [MAX_HISTORY_ENTRIES],
    );
  }

  private hydrate(row: SearchHistoryRow): SearchHistoryEntry {
    let options: SearchOptions | null = null;
    if (row.options) {
      try {
        options = typeof row.options === "string"
          ? JSON.parse(row.options) as SearchOptions
          : row.options;
      } catch {
        options = null;
      }
    }
    return {
      id: row.id,
      query: row.query,
      resultCount: row.result_count,
      searchedAt: row.searched_at instanceof Date ? row.searched_at.getTime() : Date.parse(row.searched_at),
      options,
    };
  }
}

function boundedLimit(limit: number): number {
  return Math.max(1, Math.min(100, Math.floor(limit)));
}
