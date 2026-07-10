// Entry point for the standalone MCP migration bundle. esbuild compiles this
// (plus its src/core dependencies) into a single ESM file that the MCP bin
// imports at runtime, so the bin never needs --experimental-strip-types and the
// migration logic stays in typed src/core modules shared with the desktop app.
export { SessionStore } from "../core/session-store";
export {
  createMcpTemporarySessionCleaner,
  loadMcpAppSettings,
  loadMcpSourceSession,
  migrateSessionForMcp,
  type McpMigrationDeps,
  type McpMigrationResult,
  type McpMigrateSessionInput,
} from "../core/mcp-migration";
