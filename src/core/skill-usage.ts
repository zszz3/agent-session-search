import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Reads the append-only usage log written by the Claude Code PostToolUse hook
// (bin/skill-usage-record.cjs) and aggregates per-skill invocation counts. The
// session JSONL transcripts do not record skill calls, so this log is the only
// source of usage data; it only contains events from after the hook was
// installed.

export interface SkillUsageStat {
  skill: string;
  count: number;
  lastUsedAt: number;
}

export interface SkillUsageSnapshot {
  path: string;
  exists: boolean;
  totalEvents: number;
  stats: SkillUsageStat[];
  byName: Record<string, SkillUsageStat>;
}

export interface SkillUsageOptions {
  homeDir?: string;
  usagePath?: string;
}

export function loadSkillUsage(options: SkillUsageOptions = {}): SkillUsageSnapshot {
  const usagePath = resolveUsagePath(options);
  const empty: SkillUsageSnapshot = { path: usagePath, exists: false, totalEvents: 0, stats: [], byName: {} };

  let raw: string;
  try {
    raw = fs.readFileSync(usagePath, "utf8");
  } catch {
    return empty;
  }

  const byKey = new Map<string, SkillUsageStat>();
  let totalEvents = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const event = parseUsageLine(trimmed);
    if (!event) continue;
    totalEvents += 1;
    const key = event.skill.toLowerCase();
    const current = byKey.get(key);
    if (current) {
      current.count += 1;
      if (event.timestamp > current.lastUsedAt) current.lastUsedAt = event.timestamp;
    } else {
      byKey.set(key, { skill: event.skill, count: 1, lastUsedAt: event.timestamp });
    }
  }

  const byName: Record<string, SkillUsageStat> = {};
  for (const [key, stat] of byKey) byName[key] = stat;
  const stats = [...byKey.values()].sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt || a.skill.localeCompare(b.skill));

  return { path: usagePath, exists: true, totalEvents, stats, byName };
}

// Looks up a usage stat by skill name, case-insensitively, matching how the
// hook records names regardless of capitalization differences across sources.
export function usageForSkill(snapshot: SkillUsageSnapshot, skillName: string): SkillUsageStat | null {
  return snapshot.byName[skillName.trim().toLowerCase()] ?? null;
}

function parseUsageLine(line: string): { skill: string; timestamp: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const skill = (parsed as { skill?: unknown }).skill;
  if (typeof skill !== "string" || !skill.trim()) return null;
  const ts = (parsed as { ts?: unknown }).ts;
  const timestamp = typeof ts === "string" ? Date.parse(ts) : NaN;
  return { skill: skill.trim(), timestamp: Number.isFinite(timestamp) ? timestamp : 0 };
}

function resolveUsagePath(options: SkillUsageOptions): string {
  if (options.usagePath) return options.usagePath;
  const homeDir = options.homeDir ?? os.homedir();
  return path.join(homeDir, ".claude", "skill-usage.jsonl");
}
