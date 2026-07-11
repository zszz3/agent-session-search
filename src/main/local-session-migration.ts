import { assertMigrationTargetEnabled, isMigrationTarget } from "../core/migration-targets";
import type { AppSettings } from "../core/platform";
import type { MigrationCompressionListener, PreparedMigrationSession } from "../core/session-migration-compression";
import type { WrittenMigratedSession } from "../core/session-migration-writers";
import type {
  MigrateSessionOptions,
  SessionMigrationDependencies,
} from "../core/session-migration";
import type {
  MigrationTarget,
  PortableSession,
  SessionMessage,
  SessionMigrationProgress,
  SessionMigrationRecord,
  SessionMigrationResult,
  SessionSearchResult,
} from "../core/types";

export interface LocalSessionMigrationRuntime<TEndpoint, TCompressor> {
  resolveSummaryEndpoint: (settings: AppSettings) => Promise<TEndpoint | null> | TEndpoint | null;
  createCompressor: (endpoint: TEndpoint, concurrency: number) => TCompressor;
  migrate: (options: MigrateSessionOptions) => Promise<SessionMigrationResult>;
  inspectCli: (target: MigrationTarget, settings: AppSettings) => Promise<void> | void;
  prepare: (
    session: PortableSession,
    onProgress: MigrationCompressionListener | undefined,
    compressor: TCompressor | null,
  ) => Promise<PreparedMigrationSession>;
  write: (target: MigrationTarget, session: PortableSession) => Promise<WrittenMigratedSession>;
  record: (record: SessionMigrationRecord) => Promise<void> | void;
  refreshIndex: (target: MigrationTarget, targetFilePath: string) => Promise<void>;
  launch: (target: MigrationTarget, sessionId: string, projectPath: string, settings: AppSettings) => Promise<void>;
  resumeCommand: (target: MigrationTarget, sessionId: string, projectPath: string, settings: AppSettings) => string;
  fallbackResumeCommand: (target: MigrationTarget, sessionId: string, projectPath: string, settings: AppSettings) => string;
  onProgress?: (progress: SessionMigrationProgress) => void;
  idFactory: () => string;
  now: () => number;
  projectPathExists: SessionMigrationDependencies["projectPathExists"];
  projectPathIsDirectory: SessionMigrationDependencies["projectPathIsDirectory"];
}

export async function runLocalSessionMigration<TEndpoint, TCompressor>(
  input: {
    source: SessionSearchResult;
    messages: SessionMessage[];
    target: unknown;
    settings: AppSettings;
  },
  runtime: LocalSessionMigrationRuntime<TEndpoint, TCompressor>,
): Promise<SessionMigrationResult> {
  const { source, messages, target, settings } = input;
  if (!isMigrationTarget(target)) throw new Error(`Migration target ${String(target)} is not supported.`);
  assertMigrationTargetEnabled(target, settings);

  const endpoint = await runtime.resolveSummaryEndpoint(settings);
  const compressor = endpoint ? runtime.createCompressor(endpoint, settings.compressionConcurrency) : null;
  return runtime.migrate({
    source,
    messages,
    target,
    deps: {
      inspectCli: (migrationTarget) => runtime.inspectCli(migrationTarget, settings),
      prepare: (session, onProgress) => runtime.prepare(session, onProgress, compressor),
      write: runtime.write,
      record: runtime.record,
      refreshIndex: runtime.refreshIndex,
      launch: (migrationTarget, sessionId, projectPath) => runtime.launch(migrationTarget, sessionId, projectPath, settings),
      resumeCommand: (migrationTarget, sessionId, projectPath) => runtime.resumeCommand(migrationTarget, sessionId, projectPath, settings),
      fallbackResumeCommand: (migrationTarget, sessionId, projectPath) => runtime.fallbackResumeCommand(migrationTarget, sessionId, projectPath, settings),
      onProgress: runtime.onProgress,
      idFactory: runtime.idFactory,
      now: runtime.now,
      projectPathExists: runtime.projectPathExists,
      projectPathIsDirectory: runtime.projectPathIsDirectory,
    },
  });
}
