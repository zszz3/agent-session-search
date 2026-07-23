import { describe, expect, it } from "vitest";
import {
  PostgresDatabase,
  redactPostgresConnectionText,
} from "./database";
import { PGliteTestPool } from "./test-pglite";

describe("PostgresDatabase", () => {
  it("applies versioned migrations exactly once", async () => {
    const database = new PostgresDatabase(new PGliteTestPool(), {
      migrationLock: false,
      migrations: [{
        version: 1,
        name: "create test values",
        statements: [
          "create schema if not exists agent_recall",
          "create table agent_recall.test_values (value text primary key)",
        ],
      }],
    });

    await database.initialize();
    await database.initialize();

    const migrations = await database.query<{ version: number; name: string }>(
      "select version, name from agent_recall.schema_migrations order by version",
    );
    expect(migrations.rows).toEqual([{ version: 1, name: "create test values" }]);
    await database.close();
  });

  it("commits successful transactions and rolls back failed transactions", async () => {
    const database = new PostgresDatabase(new PGliteTestPool(), {
      migrationLock: false,
      migrations: [{
        version: 1,
        name: "create test values",
        statements: [
          "create schema if not exists agent_recall",
          "create table agent_recall.test_values (value text primary key)",
        ],
      }],
    });
    await database.initialize();

    await database.transaction(async (client) => {
      await client.query("insert into agent_recall.test_values (value) values ($1)", ["kept"]);
    });
    await expect(database.transaction(async (client) => {
      await client.query("insert into agent_recall.test_values (value) values ($1)", ["discarded"]);
      throw new Error("stop");
    })).rejects.toThrow("stop");

    const values = await database.query<{ value: string }>(
      "select value from agent_recall.test_values order by value",
    );
    expect(values.rows).toEqual([{ value: "kept" }]);
    await database.close();
  });

  it("removes PostgreSQL credentials from diagnostics", () => {
    const text = "connect ECONNREFUSED postgresql://agent:very-secret@private.example:5432/recall";
    expect(redactPostgresConnectionText(text)).toBe(
      "connect ECONNREFUSED postgresql://[redacted]@private.example:5432/recall",
    );
  });
});
