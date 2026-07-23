# Session Turn 折叠轨迹 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Session 详情从扁平消息流改成按 Turn 折叠展示，并允许用户同时展开任意多轮、按需查看该轮消息和工具轨迹。

**Architecture:** PostgreSQL 继续作为唯一事实来源。打开 Session 时只查询轻量 Turn 摘要；展开某轮时再通过独立 IPC 查询该 Turn 的 Message 与 Span，并在渲染层缓存结果。Turn 展开状态使用独立 reducer 管理，互不排斥；搜索命中的 Turn 自动展开并定位。

**Tech Stack:** TypeScript、React 19、Electron IPC、PostgreSQL、Vitest

---

### Task 1: Turn 读取模型与 Repository

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/postgres/session-repository.ts`
- Modify: `src/core/session-store.ts`
- Test: `src/core/postgres/session-repository.test.ts`

- [ ] **Step 1: 写失败测试**

在 Repository 测试中插入一个包含两轮消息、一个成功工具调用和 Token 事件的 Session，验证：

```ts
await expect(repository.listSessionTurns("codex:session-a")).resolves.toMatchObject([
  {
    turnIndex: 0,
    status: "failed",
    messageCount: 2,
    spanCount: 1,
    toolNames: ["shell"],
    totalTokens: 165,
  },
  {
    turnIndex: 1,
    messageCount: 1,
    spanCount: 0,
  },
]);

const detail = await repository.getSessionTurn("codex:session-a", turns[0].id);
expect(detail?.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
expect(detail?.spans[0]).toMatchObject({
  name: "shell",
  status: "failed",
  input: { text: "{\"command\":\"npm test\"}" },
  output: { text: "login test failed" },
});
```

同时验证用其他 `sessionKey` 读取该 Turn 返回 `null`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/core/postgres/session-repository.test.ts`

Expected: `listSessionTurns` / `getSessionTurn` 不存在。

- [ ] **Step 3: 定义读取类型并实现查询**

在 `src/core/types.ts` 增加：

```ts
export type SessionTurnStatus = "completed" | "failed" | "aborted";

export interface SessionTurnSummary {
  id: string;
  turnIndex: number;
  sourceMessageIndex: number | null;
  synthetic: boolean;
  status: SessionTurnStatus;
  startedAt: string | null;
  endedAt: string | null;
  userPreview: string;
  assistantPreview: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  errorCount: number;
  toolNames: string[];
  messageCount: number;
  spanCount: number;
}

export interface SessionTurnMessage {
  messageIndex: number;
  sourceMessageIndex: number | null;
  role: SessionMessage["role"];
  content: string;
  timestamp: string;
}

export interface SessionTraceSpan {
  id: string;
  parentSpanId: string | null;
  spanIndex: number;
  kind: "tool" | "event";
  name: string;
  status: "running" | "completed" | "failed" | "aborted" | "unknown";
  startedAt: string | null;
  endedAt: string | null;
  callId: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  attributes: Record<string, unknown>;
}

export interface SessionTurnDetail extends SessionTurnSummary {
  messages: SessionTurnMessage[];
  spans: SessionTraceSpan[];
}
```

`listSessionTurns(sessionKey)` 只读取摘要、计数和 `left(user_text, 320)` / `left(assistant_text, 180)`；`getSessionTurn(sessionKey, turnId)` 分别读取 Turn、Message、Span，并验证 Turn 属于指定 Session。

- [ ] **Step 4: 在 SessionStore 暴露异步方法**

```ts
async listSessionTurns(sessionKey: string): Promise<SessionTurnSummary[]> {
  await this.ready;
  return this.sessions.listSessionTurns(sessionKey);
}

async getSessionTurn(sessionKey: string, turnId: string): Promise<SessionTurnDetail | null> {
  await this.ready;
  return this.sessions.getSessionTurn(sessionKey, turnId);
}
```

- [ ] **Step 5: 运行 Repository 测试**

Run: `npx vitest run src/core/postgres/session-repository.test.ts`

Expected: PASS.

### Task 2: Electron IPC 与远程详情按需水合

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Test: `src/renderer/src/detail-panel-actions.test.ts`

- [ ] **Step 1: 写失败测试**

验证 preload 暴露 `listSessionTurns`、`getSessionTurn`，主进程注册 `session:turns`、`session:turn`，且两个 handler 都先调用 `ensureRemoteSessionDetailsLoaded(sessionKey)`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/renderer/src/detail-panel-actions.test.ts`

- [ ] **Step 3: 实现 IPC**

```ts
listSessionTurns: (sessionKey: string): Promise<SessionTurnSummary[]> =>
  ipcRenderer.invoke("session:turns", sessionKey),
getSessionTurn: (sessionKey: string, turnId: string): Promise<SessionTurnDetail | null> =>
  ipcRenderer.invoke("session:turn", sessionKey, turnId),
```

主进程先水合远程详情再查询 PostgreSQL；读取不到或 Turn 不属于 Session 时返回 `null`。

- [ ] **Step 4: 运行 IPC 测试**

Run: `npx vitest run src/renderer/src/detail-panel-actions.test.ts`

Expected: PASS.

### Task 3: 多开 Turn 状态与轨迹组件

**Files:**
- Create: `src/renderer/src/features/session-detail/turn-accordion.tsx`
- Create: `src/renderer/src/features/session-detail/turn-accordion.test.ts`
- Modify: `src/renderer/src/styles/session-detail.css`

- [ ] **Step 1: 写 reducer 和时间线失败测试**

覆盖默认无展开项、连续打开两个 Turn 后两者都保持展开、关闭一个不影响另一个、加载成功缓存详情、切换 Session 清空缓存，以及 Message/Span 按时间排序。

```ts
let state = createTurnAccordionState();
state = turnAccordionReducer(state, { type: "toggle", turnId: "turn-1" });
state = turnAccordionReducer(state, { type: "toggle", turnId: "turn-2" });
expect([...state.expandedTurnIds]).toEqual(["turn-1", "turn-2"]);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/renderer/src/features/session-detail/turn-accordion.test.ts`

- [ ] **Step 3: 实现组件**

组件职责：

- 摘要卡片按 `turnIndex` 升序排列，默认全部折叠。
- 摘要显示用户问题预览、时间、状态、工具数量、Token 与耗时。
- 每个 Turn 使用独立 `aria-expanded` 按钮，点击不修改其他 Turn。
- 首次展开调用 `onLoadTurn(turnId)`；随后复用 reducer 缓存。
- 展开内容按时间交错显示 Message 与 Span。
- Message 保留 Assistant Markdown 渲染；Span 的 input/output/error 使用二级 `<details>` 折叠。
- `matchedTurnId` 存在时只自动展开并定位该 Turn，不关闭用户随后打开的其他 Turn。
- 单轮加载失败只显示在该 Turn 内，并提供重试，不影响其他 Turn。

- [ ] **Step 4: 增加紧凑样式**

Turn 摘要保持单行/双行密度；状态和计数使用弱化 chip；展开区使用左侧时间线，不引入图编辑器。失败 Span 使用危险色，运行中使用状态色。

- [ ] **Step 5: 运行组件测试**

Run: `npx vitest run src/renderer/src/features/session-detail/turn-accordion.test.ts`

Expected: PASS.

### Task 4: 接入 Session 详情

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/features/session-detail/detail-panel.tsx`
- Modify: `src/renderer/src/detail-panel-actions.test.ts`

- [ ] **Step 1: 更新失败测试**

验证正常 Session 打开时加载 `listSessionTurns`，不再分页加载扁平消息；搜索命中优先使用 `matchHit.turnId`，否则使用 `session.bestTurn?.turnId`；DetailPanel 使用 `TurnAccordion`。远程同步弹窗中的只读快照继续使用兼容的扁平视图。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/renderer/src/detail-panel-actions.test.ts`

- [ ] **Step 3: 改造 App 状态**

用 `detailTurns` 和 `turnsLoading` 替换正常 Session 的 `messages`、`traceEvents`、分页 offset；`openDetail` 并行读取最新 Session 与 Turn 摘要。向 DetailPanel 传入：

```tsx
turns={detailTurns}
turnsLoading={turnsLoading}
matchedTurnId={matchHit?.turnId ?? fresh.bestTurn?.turnId ?? null}
onLoadTurn={(turnId) => window.sessionSearch.getSessionTurn(sessionKey, turnId)}
```

- [ ] **Step 4: 改造 DetailPanel**

正常 Session 渲染 `TurnAccordion`；`turns === null` 时保留远程同步快照的扁平兼容视图。详情头部轨迹数量改为 Turn 摘要的 `spanCount` 总和。

- [ ] **Step 5: 运行渲染层测试**

Run: `npx vitest run src/renderer/src/detail-panel-actions.test.ts src/renderer/src/features/session-detail/turn-accordion.test.ts`

Expected: PASS.

### Task 5: 用户说明与完整验证

**Files:**
- Modify: `.release-notes/feat-workflow-run-center-v1.md`

- [ ] **Step 1: 更新当前分支唯一发布说明**

在已有发布说明中增加用户可见结果：

```md
- Session 详情现在按每轮对话折叠展示，可同时展开多轮并按需查看消息、工具调用、结果和错误。
```

不新增第二个 release note。

- [ ] **Step 2: 运行针对性验证**

Run:

```bash
npx vitest run src/core/postgres/session-repository.test.ts src/renderer/src/features/session-detail/turn-accordion.test.ts src/renderer/src/detail-panel-actions.test.ts
npm run typecheck
```

- [ ] **Step 3: 运行完整验证**

Run:

```bash
npm test
npm run build
npm run release-note:check
```

- [ ] **Step 4: 隐私与残留检查**

检查 diff 不包含真实用户名、公司地址、凭据、真实 Session 内容或内部主机；确认没有遗留 Electron/PostgreSQL/Vitest 进程。
