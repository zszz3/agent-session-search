import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_BASE_URL = "https://skills.sh";
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_LIMIT = 50;

export interface SkillsShEntry {
  id: string;
  source: string;
  owner: string;
  repo: string;
  skillId: string;
  name: string;
  installs: number;
  url: string;
}

export interface SkillsShPage {
  skills: SkillsShEntry[];
  total: number;
  hasMore: boolean;
  page: number;
  stale: boolean;
}

export interface SkillsShFile {
  relativePath: string;
  contents: string;
}

export interface SkillsShDetail {
  entry: SkillsShEntry;
  hash: string;
  markdown: string;
  files: SkillsShFile[];
  stale: boolean;
}

export interface SkillsShClientOptions {
  cachePath: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  now?: () => number;
  cacheTtlMs?: number;
}

interface CacheEntry {
  savedAt: number;
  value: unknown;
}

interface CacheFile {
  schemaVersion: 1;
  entries: Record<string, CacheEntry>;
}

export class SkillsShClient {
  private readonly cachePath: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;

  constructor(options: SkillsShClientOptions) {
    this.cachePath = path.resolve(options.cachePath);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.now = options.now ?? Date.now;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async list(input: { page: number; query: string }): Promise<SkillsShPage> {
    const page = Number.isInteger(input.page) && input.page >= 0 ? input.page : 0;
    const query = input.query.trim();
    if (query && page > 0) return { skills: [], total: 0, hasMore: false, page, stale: false };
    const cacheKey = `list:${query ? `search:${query}` : `all-time:${page}`}`;
    const url = query
      ? `${this.baseUrl}/api/search?q=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`
      : `${this.baseUrl}/api/skills/all-time/${page}`;
    return this.cachedRequest(cacheKey, url, (payload) => parseSkillsPage(payload, page, Boolean(query)));
  }

  async getDetail(entry: SkillsShEntry): Promise<SkillsShDetail> {
    const owner = safeRegistrySegment(entry.owner);
    const repo = safeRegistrySegment(entry.repo);
    const skillId = safeRegistrySegment(entry.skillId);
    const normalizedEntry = normalizeEntry({
      source: `${owner}/${repo}`,
      skillId,
      name: entry.name,
      installs: entry.installs,
    });
    if (!normalizedEntry || normalizedEntry.id !== entry.id) throw new Error("Invalid skills.sh Skill identity.");
    const cacheKey = `detail:${normalizedEntry.id}`;
    const url = `${this.baseUrl}/api/download/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(skillId)}`;
    return this.cachedRequest(cacheKey, url, (payload) => parseSkillDetail(payload, normalizedEntry));
  }

  private async cachedRequest<T extends { stale: boolean }>(
    cacheKey: string,
    url: string,
    parse: (value: unknown) => T,
  ): Promise<T> {
    const cache = this.readCache();
    const cached = cache.entries[cacheKey];
    if (cached && this.now() - cached.savedAt <= this.cacheTtlMs) {
      return { ...parse(cached.value), stale: false };
    }
    try {
      const response = await this.fetchImpl(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`skills.sh request failed (${response.status}).`);
      const payload: unknown = await response.json();
      const parsed = parse(payload);
      cache.entries[cacheKey] = { savedAt: this.now(), value: payload };
      this.writeCache(cache);
      return { ...parsed, stale: false };
    } catch (error) {
      if (cached) return { ...parse(cached.value), stale: true };
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not load skills.sh. ${detail}`);
    }
  }

  private readCache(): CacheFile {
    try {
      const value = JSON.parse(fs.readFileSync(this.cachePath, "utf8")) as Partial<CacheFile>;
      if (value.schemaVersion === 1 && value.entries && typeof value.entries === "object") {
        return value as CacheFile;
      }
    } catch {
      // A missing or malformed cache is equivalent to an empty cache.
    }
    return { schemaVersion: 1, entries: {} };
  }

  private writeCache(cache: CacheFile): void {
    fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
    const temporaryPath = `${this.cachePath}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(cache)}\n`, "utf8");
    fs.renameSync(temporaryPath, this.cachePath);
  }
}

function parseSkillsPage(payload: unknown, requestedPage: number, search: boolean): SkillsShPage {
  const record = objectValue(payload);
  if (!Array.isArray(record.skills)) throw new Error("skills.sh returned an invalid Skill list.");
  const skills = record.skills.map(normalizeEntry).filter((entry): entry is SkillsShEntry => Boolean(entry));
  const total = nonNegativeInteger(record.total) ?? skills.length;
  const page = nonNegativeInteger(record.page) ?? requestedPage;
  const hasMore = search ? false : typeof record.hasMore === "boolean" ? record.hasMore : skills.length > 0 && skills.length < total;
  return { skills, total, page, hasMore, stale: false };
}

function normalizeEntry(value: unknown): SkillsShEntry | null {
  const record = objectValue(value);
  const source = stringValue(record.source);
  const skillId = stringValue(record.skillId);
  if (!source || !skillId) return null;
  const sourceParts = source.split("/");
  if (sourceParts.length !== 2) return null;
  let owner: string;
  let repo: string;
  let safeSkillId: string;
  try {
    owner = safeRegistrySegment(sourceParts[0]);
    repo = safeRegistrySegment(sourceParts[1]);
    safeSkillId = safeRegistrySegment(skillId);
  } catch {
    return null;
  }
  const normalizedSource = `${owner}/${repo}`;
  const id = `${normalizedSource}/${safeSkillId}`;
  return {
    id,
    source: normalizedSource,
    owner,
    repo,
    skillId: safeSkillId,
    name: stringValue(record.name) ?? safeSkillId,
    installs: nonNegativeInteger(record.installs) ?? 0,
    url: `${DEFAULT_BASE_URL}/${id.split("/").map(encodeURIComponent).join("/")}`,
  };
}

function parseSkillDetail(payload: unknown, entry: SkillsShEntry): SkillsShDetail {
  const record = objectValue(payload);
  if (!Array.isArray(record.files)) throw new Error("skills.sh returned an invalid Skill download.");
  const files = record.files.map((value): SkillsShFile => {
    const file = objectValue(value);
    const relativePath = safeRelativeSkillPath(stringValue(file.path) ?? "");
    if (typeof file.contents !== "string") throw new Error("skills.sh returned an invalid Skill file.");
    return { relativePath, contents: file.contents };
  });
  const markdown = files.find((file) => file.relativePath.toLowerCase() === "skill.md")?.contents;
  if (!markdown) throw new Error("Downloaded Skill does not include SKILL.md.");
  return {
    entry,
    hash: stringValue(record.hash) ?? "",
    markdown,
    files,
    stale: false,
  };
}

function safeRegistrySegment(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized === "." || normalized === ".." || /[\\/\0]/.test(normalized)) {
    throw new Error("Invalid skills.sh Skill identity.");
  }
  return normalized;
}

function safeRelativeSkillPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Unsafe Skill file path.");
  }
  return segments.join("/");
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}
