import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./database";

class PGliteClient implements PostgresClient {
  constructor(private readonly database: PGlite) {}

  async query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PostgresQueryResult<Row>> {
    if (!values && /;\s*\S/su.test(text.trim().replace(/;\s*$/u, ""))) {
      const results = await this.database.exec(text);
      const result = results.at(-1);
      return {
        rows: (result?.rows ?? []) as Row[],
        rowCount: result?.affectedRows ?? result?.rows.length ?? 0,
      };
    }
    const result = await this.database.query<Row>(text, values ? [...values] : undefined);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  }

  release(): void {}
}

export class PGliteTestPool implements PostgresPool {
  private readonly client: PGliteClient;

  constructor(private readonly database = new PGlite({ extensions: { pg_trgm } })) {
    this.client = new PGliteClient(database);
  }

  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PostgresQueryResult<Row>> {
    return this.client.query<Row>(text, values);
  }

  async connect(): Promise<PostgresClient> {
    return this.client;
  }

  async end(): Promise<void> {
    await this.database.close();
  }
}
