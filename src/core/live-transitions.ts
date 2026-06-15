import type { LiveSession, LiveSessionFamily } from "./types";

// Tracks live agent sessions across polls so we can tell when one finishes.
// A session is keyed by family + rawId (pid is intentionally ignored: a resumed
// session keeps the same rawId across process restarts).

export interface TrackedLiveSession {
  firstSeen: number;
  family: LiveSessionFamily;
  rawId: string;
}

export interface CompletedLiveSession {
  key: string;
  family: LiveSessionFamily;
  rawId: string;
  durationMs: number;
}

export function liveSessionKey(session: { family: LiveSessionFamily; rawId: string }): string {
  return `${session.family}:${session.rawId}`;
}

// Folds the latest live snapshot into the previous tracker. Sessions present last
// time but gone now are reported as completed (with how long they were observed).
// On the first poll `previous` is empty, so already-running sessions are recorded
// without being reported as completed.
export function updateLiveTracker(
  previous: ReadonlyMap<string, TrackedLiveSession>,
  current: readonly LiveSession[],
  now: number,
): { tracker: Map<string, TrackedLiveSession>; completed: CompletedLiveSession[] } {
  const tracker = new Map<string, TrackedLiveSession>();
  const seen = new Set<string>();
  for (const session of current) {
    const key = liveSessionKey(session);
    seen.add(key);
    tracker.set(key, {
      firstSeen: previous.get(key)?.firstSeen ?? now,
      family: session.family,
      rawId: session.rawId,
    });
  }

  const completed: CompletedLiveSession[] = [];
  for (const [key, tracked] of previous) {
    if (seen.has(key)) continue;
    completed.push({
      key,
      family: tracked.family,
      rawId: tracked.rawId,
      durationMs: Math.max(0, now - tracked.firstSeen),
    });
  }

  return { tracker, completed };
}
