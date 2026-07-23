import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./database";

class PGliteClient implements PostgresClient {
  private released = false;

  constructor(
    private readonly database: PGlite,
    private readonly releaseLock: () => void,
  ) {}

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

  release(): void {
    if (this.released) return;
    this.released = true;
    this.releaseLock();
  }
}

export class PGliteTestPool implements PostgresPool {
  private lockTail = Promise.resolve();

  constructor(private readonly database = new PGlite({ extensions: { pg_trgm } })) {}

  async query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PostgresQueryResult<Row>> {
    const release = await this.acquireLock();
    try {
      return await new PGliteClient(this.database, release).query<Row>(text, values);
    } finally {
      release();
    }
  }

  async connect(): Promise<PostgresClient> {
    return new PGliteClient(this.database, await this.acquireLock());
  }

  async end(): Promise<void> {
    const release = await this.acquireLock();
    try {
      await this.database.close();
    } finally {
      release();
    }
  }

  private async acquireLock(): Promise<() => void> {
    let release!: () => void;
    const previous = this.lockTail;
    this.lockTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }
}
