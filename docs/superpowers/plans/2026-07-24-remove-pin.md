# 移除会话置顶功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 AgentRecall 的界面、查询、应用接口和 MCP 中移除会话置顶功能，同时允许已有 SQLite 数据库继续使用原有表结构。

**Architecture:** `pinned` 列留在 SQLite schema 中，作为不参与产品行为的旧字段。renderer、IPC、MCP 和 `SessionSearchResult` 不再暴露置顶能力；查询层不再读取该字段进行筛选、排序或相关性加权。

**Tech Stack:** TypeScript、React 19、Electron、Node.js SQLite、Vitest、Node test runner。

## Global Constraints

- 基线必须是最新 `origin/main`，开发分支为 `feat/remove-pin`。
- 不重建 `sessions` 表，不删除 SQLite 的 `pinned` 列。
- 收藏、隐藏、标签和自定义标题行为保持不变。
- 每个行为改动必须先看到相关测试按预期失败，再写最小实现。
- 分支只添加 `.release-notes/remove-pin.md` 这一份用户向 release note。
- release note 必须使用 `## Bug 修复`，不得写实现细节。
- 不修改“固定到视口顶部”等与会话置顶无关的布局逻辑。

---

### Task 1: 移除界面入口和查询类型

**Files:**
- Modify: `src/renderer/src/features/search/query-builder-types.test.ts`
- Modify: `src/renderer/src/features/search/query-builder-types.ts`
- Modify: `src/renderer/src/features/search/query-builder.tsx`
- Modify: `src/renderer/src/features/search/session-row.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `src/renderer/src/session-ui.test.ts`

**Interfaces:**
- Consumes: `SearchOptions.visibility`
- Produces: `QueryBuilderVisibility = "default" | "favorites" | "hidden"`

- [ ] **Step 1: 写失败测试**

在 `query-builder-types.test.ts` 中把计数用例改为受支持的隐藏筛选，并加入类型契约：

```ts
expect(
  countActiveFilters({ source: "codex-cli", tag: "x", visibility: "hidden", dateRange: "90d" }),
).toBe(4);
```

在 `session-ui.test.ts` 的源码契约用例中断言：

```ts
const queryBuilderSource = readFileSync(new URL("./features/search/query-builder.tsx", import.meta.url), "utf8");

expect(appSource).not.toContain('setVisibility("pinned")');
expect(appSource).not.toContain("setPinned(");
expect(sessionRowSource).not.toContain("session.pinned");
expect(queryBuilderSource).not.toContain('value: "pinned"');
```

- [ ] **Step 2: 验证测试按预期失败**

Run:

```bash
npx vitest run src/renderer/src/features/search/query-builder-types.test.ts src/renderer/src/session-ui.test.ts
```

Expected: FAIL，指出 `App.tsx`、`session-row.tsx` 或查询构建器仍包含置顶入口。

- [ ] **Step 3: 写最小实现**

把可见性类型改为：

```ts
export type QueryBuilderVisibility = "default" | "favorites" | "hidden";
```

从 `VISIBILITY_OPTIONS` 删除：

```ts
{ value: "pinned", en: "Pinned", zh: "置顶" }
```

从 `App.tsx` 删除 `Pin`、`PinOff` import、置顶筛选按钮、右键菜单置顶动作和详情菜单 `onPin` 参数及按钮。从 `session-row.tsx` 删除 `Pin` import 和：

```tsx
{session.pinned ? <Pin size={14} /> : null}
```

- [ ] **Step 4: 验证测试通过**

Run:

```bash
npx vitest run src/renderer/src/features/search/query-builder-types.test.ts src/renderer/src/session-ui.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/App.tsx src/renderer/src/features/search/query-builder.tsx src/renderer/src/features/search/query-builder-types.ts src/renderer/src/features/search/query-builder-types.test.ts src/renderer/src/features/search/session-row.tsx src/renderer/src/session-ui.test.ts
git commit -m "feat(ui): remove session pin controls"
```

### Task 2: 让核心查询忽略旧置顶值

**Files:**
- Modify: `src/core/session-store.test.ts`
- Modify: `src/core/session-store-performance.test.ts`
- Modify: `src/core/store/sessions.test.ts`
- Modify: `src/core/store/sessions.ts`
- Modify: `src/core/types.ts`

**Interfaces:**
- Consumes: SQLite `sessions.pinned` compatibility column
- Produces: `SearchOptions.visibility = "default" | "favorites" | "hidden"`；`SessionSearchResult` 不含 `pinned`

- [ ] **Step 1: 写失败测试**

在 `session-store.test.ts` 增加旧字段兼容用例，直接写数据库字段，避免调用即将删除的 API：

```ts
it("ignores legacy pinned values when ordering sessions", () => {
  const db = new DatabaseSync(":memory:");
  const store = new SessionStore(db);
  try {
    store.upsertIndexedSession(sampleSession({
      sessionKey: "codex:older",
      rawId: "older",
      timestamp: 100,
      fileMtimeMs: 100,
    }), []);
    store.upsertIndexedSession(sampleSession({
      sessionKey: "codex:newer",
      rawId: "newer",
      timestamp: 200,
      fileMtimeMs: 200,
    }), []);
    db.prepare("UPDATE sessions SET pinned = 1 WHERE session_key = ?").run("codex:older");

    expect(store.searchSessions({ query: "" }).map((session) => session.sessionKey))
      .toEqual(["codex:newer", "codex:older"]);
  } finally {
    store.close();
  }
});
```

在 `session-store-performance.test.ts` 将旧断言改为：

```ts
expect(candidatesBlock).not.toContain("ORDER BY pinned DESC");
expect(candidatesBlock).not.toContain("result.pinned");
```

- [ ] **Step 2: 验证测试按预期失败**

Run:

```bash
npx vitest run src/core/session-store.test.ts src/core/session-store-performance.test.ts src/core/store/sessions.test.ts
```

Expected: FAIL，旧置顶记录仍被提前或源码仍包含置顶加权。

- [ ] **Step 3: 写最小实现**

将 `SearchOptions.visibility` 改为：

```ts
visibility?: "default" | "favorites" | "hidden";
```

从 `SessionSearchResult` 删除：

```ts
pinned: boolean;
```

在 `sessions.ts`：

- 删除公开的 `setPinned`。
- `migrateSessionKeyPreservingUserState` 不再读取或合并 `pinned`。
- 默认候选 SQL 删除 `ORDER BY pinned DESC`。
- 可见性 SQL 删除 `options.visibility === "pinned"` 分支。
- `mapSessionRow` 不再返回 `pinned`。
- `scoreEmptyQueryResult`、`scoreSearchResult` 和智能排序删除所有置顶加分与乘数。

保留 `SessionRow.pinned` 和 schema 中的 `pinned` 列，只供旧表结构兼容。

- [ ] **Step 4: 清理依赖 `SessionSearchResult.pinned` 的测试数据**

删除各测试 fixture 中的：

```ts
pinned: false
```

远程 key 迁移测试继续断言 `customTitle`、`favorited`、`hidden`、摘要、时间和标签，不再设置或断言 `pinned`。

- [ ] **Step 5: 验证核心测试通过**

Run:

```bash
npx vitest run src/core/session-store.test.ts src/core/session-store-performance.test.ts src/core/store/sessions.test.ts src/core/remote-sync.test.ts src/core/remote-session-sync.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/core src/main/services/remote-session-service.test.ts src/renderer/src/remote-session-card.test.ts
git commit -m "refactor(search): ignore legacy pin metadata"
```

### Task 3: 删除 IPC 和 MCP 写入能力

**Files:**
- Modify: `src/core/mcp-server.test.ts`
- Modify: `bin/agent-recall-mcp.mjs`
- Modify: `src/core/session-store.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `set_visibility(sessionKey, visibility)`
- Produces: MCP visibility enum `["default", "favorites", "hidden"]`

- [ ] **Step 1: 写失败测试**

将 MCP 可见性测试改为：

```ts
expect(setVisibility(db, { sessionKey: "codex:abc", visibility: "pinned" }).ok).toBe(false);
```

并保留以下行为断言：

```ts
setVisibility(db, { sessionKey: "codex:abc", visibility: "default" });
expect(flags(db, "codex:abc")).toMatchObject({ hidden: 0, favorited: 1 });
```

加入源码契约断言：

```ts
expect(mcpSource).not.toContain('"pinned"');
expect(preloadSource).not.toContain("setPinned");
expect(mainSource).not.toContain('"pin:set"');
```

- [ ] **Step 2: 验证测试按预期失败**

Run:

```bash
npx vitest run src/core/mcp-server.test.ts
```

Expected: FAIL，MCP 仍接受 `pinned`，preload/main 仍暴露 pin IPC。

- [ ] **Step 3: 写最小实现**

在 MCP 中：

- 删除 `case "pinned"`。
- `default` 只执行 `UPDATE sessions SET hidden = 0 ...`。
- 查询返回值删除 `pinned`。
- Zod enum 改为：

```js
z.enum(["default", "favorites", "hidden"])
```

- 更新工具说明，不再提及 pin 或 unpin。

在应用中删除：

```ts
setPinned(sessionKey: string, pinned: boolean)
ipcMain.handle("pin:set", ...)
```

- [ ] **Step 4: 重新生成 MCP bundle 并验证**

Run:

```bash
npm run build:mcp
npx vitest run src/core/mcp-server.test.ts
```

Expected: 两条命令均退出 0。

- [ ] **Step 5: 提交**

```bash
git add bin/agent-recall-mcp.mjs src/core/mcp-server.test.ts src/core/session-store.ts src/preload/index.ts src/main/index.ts out/mcp
git commit -m "feat(api): remove session pin operations"
```

### Task 4: 更新文档和发布说明

**Files:**
- Create: `.release-notes/remove-pin.md`
- Modify: `README.md`
- Modify: `docs/README.en.md`
- Modify: `Install.md`

**Interfaces:**
- Consumes: 已完成的产品行为
- Produces: 用户可见发布说明

- [ ] **Step 1: 写 release note**

```markdown
# 移除会话置顶功能

## Bug 修复

- 会话整理入口不再显示置顶相关选项，避免与收藏和隐藏功能重复。
```

- [ ] **Step 2: 更新产品文档**

从中英文功能列表和安装说明中删除“置顶”“pinned state”以及 MCP `pinned` 可见性值。收藏、隐藏、标签和自定义标题的描述保持原样。

- [ ] **Step 3: 运行文案与残留检查**

Run:

```bash
npm run release-note:check
rg -n -i '\bpin(ned|ning)?\b|置顶|取消置顶' README.md docs/README.en.md Install.md src bin
```

Expected: release note check 退出 0；`rg` 只命中 SQLite 兼容字段、schema/index 名称，以及与会话置顶无关的视口布局注释。

- [ ] **Step 4: 提交**

```bash
git add .release-notes/remove-pin.md README.md docs/README.en.md Install.md
git commit -m "docs: remove session pin references"
```

### Task 5: 完整验证与范围复核

**Files:**
- Verify: all changed files

**Interfaces:**
- Consumes: Tasks 1-4
- Produces: 可提交评审的 `feat/remove-pin`

- [ ] **Step 1: 运行类型与测试**

Run:

```bash
npm run typecheck
npm test
```

Expected: 两条命令均退出 0，没有失败测试。

- [ ] **Step 2: 构建应用**

Run:

```bash
npm run build
```

Expected: 退出 0，Electron renderer、main、preload 和 MCP 均构建成功。

- [ ] **Step 3: 运行发布与 diff 检查**

Run:

```bash
npm run release-note:check
git diff --check origin/main...HEAD
git status --short --branch
```

Expected: release note 与 diff 检查退出 0；状态中只有计划内文件，没有临时产物。

- [ ] **Step 4: 核对残留**

Run:

```bash
rg -n -i '\bpin(ned|ning)?\b|置顶|取消置顶' README.md docs/README.en.md Install.md src bin
```

Expected: 不存在用户可触达的会话置顶入口。允许保留 `src/core/store/schema.ts`、`SessionRow` 和迁移 SQL 中用于旧数据库兼容的列定义，也允许保留 AI 对话视口布局注释。
