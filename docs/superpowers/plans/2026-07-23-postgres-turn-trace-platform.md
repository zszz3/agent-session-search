# PostgreSQL Turn 与轨迹平台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AgentRecall 的内部 SQLite/PGlite 存储一次性替换为应用管理的 PostgreSQL，并建立 Session→Turn→Message/Span 模型、Turn 检索与分层评测基础。

**Architecture:** Electron 主进程启动一个仅监听本机的 PostgreSQL，统一的 `PostgresDatabase` 管理连接池、事务和 schema migration。Session、Automation、MCP、Eval 与 Team Chat 使用独立 Repository 共享连接；Session 索引保留不可变 Raw Event，并派生 Turn、Message 与 Span。查询先检索 Turn，再按 Session 聚合。

**Tech Stack:** TypeScript、Electron、node-postgres、embedded-postgres、PostgreSQL 18、PGlite（仅测试）、Vitest

---

### Task 1: PostgreSQL 数据库内核与本地生命周期

**Files:**
- Create: `src/core/postgres/types.ts`
- Create: `src/core/postgres/database.ts`
- Create: `src/core/postgres/schema.ts`
- Create: `src/main/postgres/managed-postgres.ts`
- Test: `src/core/postgres/database.test.ts`
- Test: `src/main/postgres/managed-postgres.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 写失败测试**

覆盖连接初始化、advisory migration lock、事务 commit/rollback、URL 脱敏、本地集群初始化/复用/停止、外部 URL 跳过本地运行时和 Windows 可执行文件名。

```ts
it("rolls back a failed transaction", async () => {
  await expect(database.transaction(async (tx) => {
    await tx.query("insert into agent_recall.test_values(value) values ($1)", ["discarded"]);
    throw new Error("stop");
  })).rejects.toThrow("stop");
  expect((await database.query("select value from agent_recall.test_values")).rows).toEqual([]);
});
```

- [ ] **Step 2: 验证测试因功能不存在而失败**

Run: `npx vitest run src/core/postgres/database.test.ts src/main/postgres/managed-postgres.test.ts`

- [ ] **Step 3: 实现数据库边界**

```ts
export interface PostgresQueryable {
  query<Row extends Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: Row[]; rowCount: number }>;
}

export class PostgresDatabase implements PostgresQueryable {
  initialize(): Promise<void>;
  transaction<T>(run: (client: PostgresQueryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

本地运行时默认写入 `<userData>/postgres`, 使用随机密码、loopback 地址和权限受限连接文件；`AGENT_RECALL_DATABASE_URL` 存在时只连接外部数据库。

- [ ] **Step 4: 运行测试并通过**

Run: `npx vitest run src/core/postgres/database.test.ts src/main/postgres/managed-postgres.test.ts`

### Task 2: 统一 PostgreSQL schema

**Files:**
- Modify: `src/core/postgres/schema.ts`
- Test: `src/core/postgres/schema.test.ts`

- [ ] **Step 1: 写 schema 失败测试**

验证 `agent_recall` schema、Session/Turn/Message/Raw Event/Span、Skills、Environment、Metadata、Automation、MCP、Eval 和 Team Chat 表，以及外键、唯一键、GIN/trigram 索引。

- [ ] **Step 2: 验证失败**

Run: `npx vitest run src/core/postgres/schema.test.ts`

- [ ] **Step 3: 写版本化 migration**

每个 migration 使用稳定版本号，在 `schema_migrations` 中记录；启用 `pg_trgm`，所有时间用 `timestamptz`，Token 用 `bigint`，Provider 原始字段使用 `jsonb`。

- [ ] **Step 4: 验证 schema 可重复执行**

Run: `npx vitest run src/core/postgres/schema.test.ts`

### Task 3: Turn 与 Span 推导

**Files:**
- Create: `src/core/turns/derive-turns.ts`
- Create: `src/core/turns/types.ts`
- Test: `src/core/turns/derive-turns.test.ts`
- Modify: `src/core/types.ts`

- [ ] **Step 1: 写边界失败测试**

覆盖顶层 User 分轮、Assistant/Tool 归属、首条 User 前 preamble、Subagent Span、synthetic Turn、错误、中断与稳定 ID。

```ts
expect(deriveTurns(session).turns.map((turn) => turn.messages.map((message) => message.role))).toEqual([
  ["user", "assistant", "tool", "assistant"],
  ["user", "assistant"],
]);
```

- [ ] **Step 2: 验证失败**

Run: `npx vitest run src/core/turns/derive-turns.test.ts`

- [ ] **Step 3: 实现纯函数推导**

Turn ID 使用 `sessionKey + topLevelUserSourceIndex` 的稳定 hash；Span 通过 call ID、parent call ID 和顺序建立树。缺少结构字段时使用可重复的顺序规则，不调用 LLM。

- [ ] **Step 4: 验证通过**

Run: `npx vitest run src/core/turns/derive-turns.test.ts`

### Task 4: PostgreSQL Session Repository 与 Turn 搜索

**Files:**
- Create: `src/core/postgres/session-repository.ts`
- Create: `src/core/postgres/skill-repository.ts`
- Create: `src/core/postgres/environment-repository.ts`
- Create: `src/core/postgres/metadata-repository.ts`
- Rewrite: `src/core/session-store.ts`
- Test: `src/core/postgres/session-repository.test.ts`
- Test: `src/core/postgres/session-search.test.ts`

- [ ] **Step 1: 写 Repository 失败测试**

覆盖 Session 原子 upsert、刷新保留收藏/标题、Turn 重建、消息分页、Trace 查询、统计、标签、Skills、环境、同步绑定和 Provider Key。

- [ ] **Step 2: 写搜索失败测试**

用两个 Session、多轮中英文消息验证：Turn 命中、Session 去重、最佳 Turn、其他命中数、AND、短语、时间筛选、子 Agent 过滤和 Session 总数分页。

- [ ] **Step 3: 验证失败**

Run: `npx vitest run src/core/postgres/session-repository.test.ts src/core/postgres/session-search.test.ts`

- [ ] **Step 4: 实现异步 SessionStore**

```ts
export class SessionStore {
  async upsertIndexedSession(...): Promise<void>;
  async searchSessionPage(options: SearchOptions): Promise<SessionSearchPage>;
  async getSession(sessionKey: string): Promise<SessionSearchResult | null>;
  async getMessages(sessionKey: string, offset?: number, limit?: number): Promise<SessionMessage[]>;
}
```

整 Session 在一个事务内 upsert raw events、推导 Turn/Span、更新聚合和搜索向量；用户状态列不被索引刷新覆盖。

- [ ] **Step 5: 验证通过**

Run: `npx vitest run src/core/postgres/session-repository.test.ts src/core/postgres/session-search.test.ts`

### Task 5: 异步索引、IPC 与 MCP

**Files:**
- Modify: `src/core/indexer.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/services/remote-session-service.ts`
- Rewrite: `bin/agent-recall-mcp.mjs`
- Modify: `src/mcp/migration-entry.ts`
- Test: `src/core/indexer.test.ts`
- Test: `src/core/mcp-server.test.ts`
- Test: `src/main/app-path-bootstrap.test.ts`

- [ ] **Step 1: 写异步行为失败测试**

验证增量批次等待数据库、启动时 PG 就绪后才索引、MCP 从临时连接文件访问 Session、错误信息不泄漏密码。

- [ ] **Step 2: 验证失败**

Run: `npx vitest run src/core/indexer.test.ts src/core/mcp-server.test.ts src/main/app-path-bootstrap.test.ts`

- [ ] **Step 3: 迁移调用链**

把 `SessionStore` 的所有消费者改为 `await`，批次索引使用单 Session 事务；MCP 使用 `pg.Pool`，不再打开 `session-search.sqlite`。

- [ ] **Step 4: 验证通过**

Run: `npx vitest run src/core/indexer.test.ts src/core/mcp-server.test.ts src/main/app-path-bootstrap.test.ts`

### Task 6: Automation、MCP Registry 与 Eval Repository

**Files:**
- Create: `src/automation/engine/main/hub/persisted/postgres-store.ts`
- Create: `src/automation/engine/main/hub/persisted/postgres-chat-repository.ts`
- Create: `src/automation/engine/main/hub/persisted/postgres-workflow-repository.ts`
- Rewrite: `src/automation/engine/main/evaluation-store.ts`
- Rewrite: `src/automation/engine/main/mcp-registry-store.ts`
- Modify: `src/automation/engine/main/hub/agent-hub.ts`
- Modify: `src/main/services/automation-service.ts`
- Test: corresponding `*.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖 Runtime/configured agents、Workflow/Run/Event、MCP/Tools 和现有 Eval CRUD 在 PostgreSQL 中持久化与恢复。

- [ ] **Step 2: 写分层评测失败测试**

验证 Score 可以关联 Session、Turn 或 Span，且删除父对象时按设计级联。

- [ ] **Step 3: 验证失败**

Run: `npx vitest run src/automation/engine/main/hub/persisted/postgres-store.test.ts src/automation/engine/main/evaluation-store.test.ts src/automation/engine/main/mcp-registry-store.test.ts`

- [ ] **Step 4: 实现并接线统一连接**

Automation stores 接收 `PostgresDatabase`，不接收文件路径；保存操作使用事务，JSON 字段直接读写 `jsonb`。

- [ ] **Step 5: 验证通过**

Run: same command as Step 3.

### Task 7: Team Chat 统一 PostgreSQL

**Files:**
- Modify: `src/main/team-chat/postgres-team-chat-store.ts`
- Modify: `src/main/team-chat/team-chat-service.ts`
- Modify: `src/main/services/automation-service.ts`
- Delete: `src/main/team-chat/pglite-team-chat-store.ts`
- Delete: `src/main/team-chat/pglite-team-chat-store.test.ts`
- Modify: Team Chat tests

- [ ] **Step 1: 写默认统一连接失败测试**

验证本地 Chat 与其他模块使用同一个 `PostgresDatabase`，外部 Chat 专用 URL 入口被移除。

- [ ] **Step 2: 验证失败**

Run: `npx vitest run src/main/team-chat`

- [ ] **Step 3: 改为共享连接并删除 PGlite 正式实现**

`PostgresTeamChatStore` 接受共享 Queryable/Pool，不拥有全局连接池生命周期。

- [ ] **Step 4: 验证通过**

Run: `npx vitest run src/main/team-chat`

### Task 8: 删除旧运行路径并完整验证

**Files:**
- Delete: `src/core/store/database.ts`
- Delete or archive unused SQLite store modules
- Delete: `src/automation/engine/main/hub/persisted/sqlite-*.ts`
- Modify: `bin/setup-mcp.cjs`
- Modify: `scripts/package-smoke.mjs`
- Modify: `package.json`
- Modify: `.release-notes/feat-workflow-run-center-v1.md`

- [ ] **Step 1: 搜索正式 SQLite/PGlite 引用**

Run: `rg -n 'node:sqlite|DatabaseSync|PGlite|session-search\\.sqlite|automation\\.db' src/main src/core src/automation bin`

只允许外部 Agent 数据源的只读 SQLite、合成测试 fixture 和明确的旧文件清理说明。

- [ ] **Step 2: 更新 package smoke**

临时 HOME、临时 npm prefix、临时 PG data dir；构建 tarball、安装、启动、验证 CLI/MCP、停止所有子进程并清理。

- [ ] **Step 3: 更新唯一发布说明**

在当前分支已有 `.release-notes/feat-workflow-run-center-v1.md` 中增加用户可见结果，不新增第二个 release note。

- [ ] **Step 4: 完整验证**

Run:

```bash
npm run typecheck
npm test
npm run build
npm run release-note:check
```

- [ ] **Step 5: 隐私与残留检查**

确认 diff 不包含公司主机、用户名、绝对用户路径、凭据或真实会话数据，并确认没有遗留 PostgreSQL/Electron 子进程。
