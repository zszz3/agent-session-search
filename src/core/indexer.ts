import { loadDefaultSessions, loadDefaultSessionsIterator } from "./session-loader";
import type { SessionStore } from "./session-store";
import type { LoadedSession } from "./types";

export interface IndexStatus {
  running: boolean;
  indexed: number;
  total: number;
  lastIndexedAt: number | null;
  error: string | null;
}

export function syncDefaultSessions(store: SessionStore): IndexStatus {
  const loaded = loadDefaultSessions();
  let indexed = 0;
  for (const item of loaded) {
    store.upsertIndexedSession(item.session, item.messages, item.tokenEvents);
    indexed++;
  }
  return {
    running: false,
    indexed,
    total: loaded.length,
    lastIndexedAt: Date.now(),
    error: null,
  };
}

export interface BatchIndexOptions {
  batchSize?: number;
  onProgress?: (status: IndexStatus) => void;
  yieldToEventLoop?: () => Promise<void>;
}

export async function syncLoadedSessionsInBatches(
  store: SessionStore,
  loaded: Iterable<LoadedSession>,
  options: BatchIndexOptions = {},
): Promise<IndexStatus> {
  const batchSize = Math.max(1, options.batchSize ?? 3);
  const yieldToEventLoop = options.yieldToEventLoop ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  let indexed = 0;
  let total = 0;
  let pendingInBatch = 0;

  for (const item of loaded) {
    store.upsertIndexedSession(item.session, item.messages, item.tokenEvents);
    indexed++;
    total++;
    pendingInBatch++;

    if (pendingInBatch >= batchSize) {
      pendingInBatch = 0;
      options.onProgress?.({ running: true, indexed, total, lastIndexedAt: null, error: null });
      await yieldToEventLoop();
    }
  }

  if (pendingInBatch > 0 || indexed === 0) {
    options.onProgress?.({ running: true, indexed, total, lastIndexedAt: null, error: null });
    await yieldToEventLoop();
  }

  return {
    running: false,
    indexed,
    total,
    lastIndexedAt: Date.now(),
    error: null,
  };
}

export function syncDefaultSessionsInBatches(store: SessionStore, options: BatchIndexOptions = {}): Promise<IndexStatus> {
  return syncLoadedSessionsInBatches(store, loadDefaultSessionsIterator(), options);
}
