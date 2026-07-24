// Entry point for the standalone MCP migration bundle. esbuild compiles this
// (plus its src/core dependencies) into a single ESM file that the MCP bin
// imports at runtime, so the bin never needs --experimental-strip-types and the
// migration logic stays in typed src/core modules shared with the desktop app.
import { PostgresDatabase } from "../core/postgres/database";
import { POSTGRES_MIGRATIONS } from "../core/postgres/schema";
import { SessionStore } from "../core/session-store";

export { SessionStore };

export async function openMcpSessionStore(connectionUrl: string): Promise<SessionStore> {
  const database = PostgresDatabase.connect(connectionUrl, {
    migrations: POSTGRES_MIGRATIONS,
  });
  await database.initialize();
  return new SessionStore(database);
}
export {
  createMcpTemporarySessionCleaner,
  loadMcpAppSettings,
  loadMcpSourceSession,
  migrateSessionForMcp,
  type McpMigrationDeps,
  type McpMigrationResult,
  type McpMigrateSessionInput,
} from "../core/mcp-migration";
export {
  MIGRATION_TARGET_IDS,
  MIGRATION_TARGETS,
  assertMigrationTargetEnabled,
  isMigrationTarget,
  migrationTargetDescriptor,
} from "../core/migration-targets";
export {
  getMigrationResumeProcessSpec,
  getSafeMigrationResumeCommand,
  inspectMigrationCli,
  type AppSettings,
} from "../core/platform";
export type { MigrationTarget } from "../core/types";
