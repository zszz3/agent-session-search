# Session Agent Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand, read-only Agent status analysis to Session detail that deterministically summarizes the complete indexed trajectory without invoking a model or saving the result.

**Architecture:** Put deterministic trajectory interpretation in a Node-free core module shared by main and renderer. Local and SSH Session details call a small IPC handler that analyzes the full indexed trace instead of the paginated UI window; read-only remote snapshots call the same pure analyzer in the renderer. Keep transient request state inside `DetailPanel` and extract the status card because it is a distinct visual and domain boundary.

**Tech Stack:** TypeScript, Electron IPC, React 19, Lucide React, Vitest, React server rendering tests, Electron/Vite CSS.

---

## File map

- Create `src/core/session-agent-status.ts`: status types, deterministic trace aggregation, structured plan extraction, state classification, and indexed-store adapter.
- Create `src/core/session-agent-status.test.ts`: observable analyzer coverage for de-duplication, failures, plans, state, time, and complete trace loading.
- Modify `src/main/index.ts`: expose the complete indexed analysis through `session:agent-status` after existing remote hydration.
- Modify `src/preload/index.ts`: expose the typed `analyzeSessionAgentStatus` renderer API.
- Create `src/renderer/src/features/session-detail/agent-status-card.tsx`: compact localized status rendering.
- Create `src/renderer/src/features/session-detail/agent-status-card.test.ts`: server-rendered card coverage.
- Modify `src/renderer/src/features/session-detail/detail-panel.tsx`: manual analysis button, transient loading/error/result state, and read-only remote support.
- Modify `src/renderer/src/App.tsx`: wire indexed IPC analysis and remote snapshot analysis into both detail variants.
- Modify `src/renderer/src/styles/session-detail.css`: compact status card, state badges, metrics, plans, and responsive behavior.
- Modify `src/renderer/src/detail-panel-actions.test.ts`: Session-detail and IPC wiring regression assertions.
- Modify `.release-notes/main-2-0.md`: describe the user-visible on-demand Session status analysis.

### Task 1: Deterministic trajectory analyzer

**Files:**
- Create: `src/core/session-agent-status.test.ts`
- Create: `src/core/session-agent-status.ts`

- [ ] **Step 1: Write failing analyzer tests for complete, grounded status**

Define synthetic messages and traces only; do not read real session data. Cover these observable cases:

```ts
const result = analyzeSessionAgentStatus({
  session: { projectPath: "/repo", messageCount: 3 },
  messages: [
    { index: 0, role: "user", content: "Fix   the login flow", timestamp: "2026-07-22T08:00:00Z" },
    { index: 1, role: "assistant", content: "Working on it", timestamp: "2026-07-22T08:01:00Z" },
    { index: 2, role: "user", content: "Also keep the old API", timestamp: "2026-07-22T08:02:00Z" },
  ],
  traceEvents: [
    {
      index: 0, kind: "tool_call", source: "codex", title: "shell_command · npm test",
      detail: "{\"command\":\"npm test\"}", timestamp: "2026-07-22T08:01:10Z", callId: "call-1", status: "unknown",
    },
    {
      index: 1, kind: "event", source: "codex", title: "shell · npm test",
      detail: "exit_code: 0", timestamp: "2026-07-22T08:01:20Z", callId: "call-1",
      eventType: "exec_command_end", status: "success",
    },
    {
      index: 2, kind: "event", source: "codex", title: "context_compacted",
      detail: "{}", timestamp: "2026-07-22T08:01:30Z", eventType: "context_compacted", status: "unknown",
    },
  ],
  live: false,
  analyzedAt: new Date("2026-07-22T09:00:00Z"),
});

expect(result.state).toBe("waiting_agent");
expect(result.latestUserRequest).toBe("Also keep the old API");
expect(result.toolCallCount).toBe(1);
expect(result.tools).toEqual([{ name: "shell_command", count: 1, failureCount: 0, unknownCount: 0 }]);
expect(result.compactionCount).toBe(1);
expect(result.messageCount).toBe(3);
expect(result.traceEventCount).toBe(3);
```

Add separate tests proving:

- a `tool_call` and successful ending `event` with the same `callId` count once;
- two call IDs plus one no-ID call count three times;
- failure wins over success/unknown for one call and produces one failure record;
- a latest `error` or `turn_aborted` after the last message selects `failed` or `interrupted`, while `live: true` selects `running`;
- the latest full `update_plan`/`TodoWrite` payload is parsed, and a later structured status update changes the matching item;
- plain-language checkboxes are not treated as structured plan data;
- invalid timestamps and malformed JSON are ignored without throwing;
- meta messages beginning with `<agent_status>` or `<system-reminder>` are skipped when selecting the latest user request.

- [ ] **Step 2: Run the analyzer test and verify RED**

```bash
npx vitest run src/core/session-agent-status.test.ts
```

Expected: FAIL because `session-agent-status.ts` and `analyzeSessionAgentStatus` do not exist.

- [ ] **Step 3: Define the status contract and deterministic analyzer**

Create these public contracts in `src/core/session-agent-status.ts`:

```ts
export type SessionAgentState =
  | "running"
  | "waiting_agent"
  | "waiting_user"
  | "failed"
  | "interrupted"
  | "unknown";

export type SessionAgentTodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface SessionAgentTodo {
  id: string;
  content: string;
  status: SessionAgentTodoStatus;
}

export interface SessionAgentToolUsage {
  name: string;
  count: number;
  failureCount: number;
  unknownCount: number;
}

export interface SessionAgentFailure {
  title: string;
  detail: string;
  timestamp: string;
}

export interface SessionAgentStatus {
  state: SessionAgentState;
  latestUserRequest: string | null;
  todos: SessionAgentTodo[];
  toolCallCount: number;
  tools: SessionAgentToolUsage[];
  failureCount: number;
  latestFailure: SessionAgentFailure | null;
  compactionCount: number;
  abortedCount: number;
  projectPath: string;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  messageCount: number;
  traceEventCount: number;
  analyzedAt: string;
}

export interface AnalyzeSessionAgentStatusInput {
  session: { projectPath: string; messageCount?: number };
  messages: SessionMessage[];
  traceEvents: SessionTraceEvent[];
  live: boolean;
  analyzedAt?: Date;
}
```

Implement `analyzeSessionAgentStatus(input)` with focused private functions:

- `compactText` collapses whitespace and caps previews at 240 characters.
- `toolName` takes the text before ` ·` and falls back to `tool`.
- `isStateEvent` recognizes `error`, `context_compacted`, and `turn_aborted` so those events never enter the tool ranking.
- `aggregateInvocations` ignores `tool_result`, groups by `callId`, gives `tool_call` names priority, and merges status with `failure > success > unknown`.
- `extractStructuredTodos` parses JSON details only from recognized planning tools and applies explicit item updates by ID.
- `classifyState` applies `running`, then latest terminal error/interruption, then final speaker, then `unknown`.
- timestamp aggregation only includes valid message or trace timestamps.

Sort tool usage by descending count and then stable name. Compute failure evidence once per grouped call or standalone error event, and select the newest valid failure for `latestFailure`.

- [ ] **Step 4: Add and test the indexed data-source adapter**

Add a meaningful data-boundary interface to the same module:

```ts
export interface SessionAgentStatusDataSource {
  getSession(sessionKey: string): SessionSearchResult | null;
  getMessageCount(sessionKey: string): number;
  getMessages(sessionKey: string, offset?: number, limit?: number): SessionMessage[];
  getTraceEvents(sessionKey: string): SessionTraceEvent[];
}

export const SESSION_AGENT_STATUS_MESSAGE_WINDOW = 200;

export function analyzeIndexedSessionAgentStatus(
  source: SessionAgentStatusDataSource,
  sessionKey: string,
  live: boolean,
  analyzedAt = new Date(),
): SessionAgentStatus | null;
```

The adapter must read only the final 200 messages for latest-speaker/request analysis, pass the full stored message count, and call `getTraceEvents(sessionKey)` without a time window so tool/event totals cover the complete indexed trajectory. Add a fake-source test that records the offset/limit and returns a trace outside the final message window; assert that the trace remains included.

- [ ] **Step 5: Run the analyzer tests and verify GREEN**

```bash
npx vitest run src/core/session-agent-status.test.ts
```

Expected: all analyzer tests pass.

- [ ] **Step 6: Commit the analyzer boundary**

```bash
git add src/core/session-agent-status.ts src/core/session-agent-status.test.ts
git commit -m "feat: analyze indexed session agent status"
```

### Task 2: Full-trajectory IPC and preload API

**Files:**
- Modify: `src/renderer/src/detail-panel-actions.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Write failing IPC contract assertions**

Extend `detail-panel-actions.test.ts` with a regression that extracts the handler source and checks the observable wiring:

```ts
it("analyzes status from the complete indexed trajectory on demand", () => {
  const handler = mainHandlerSource("session:agent-status");

  expect(preloadSource).toContain("analyzeSessionAgentStatus");
  expect(preloadSource).toContain("session:agent-status");
  expect(handler).toContain("await ensureRemoteSessionDetailsLoaded(sessionKey)");
  expect(handler).toContain("analyzeIndexedSessionAgentStatus(store, sessionKey, live)");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npx vitest run src/renderer/src/detail-panel-actions.test.ts
```

Expected: FAIL because neither preload nor main exposes `session:agent-status`.

- [ ] **Step 3: Add the preload method**

Import `SessionAgentStatus` from the core module and add:

```ts
analyzeSessionAgentStatus: (sessionKey: string, live: boolean): Promise<SessionAgentStatus> =>
  ipcRenderer.invoke("session:agent-status", sessionKey, live),
```

Because `SessionSearchApi` is derived from `typeof api`, no extra global declaration is required.

- [ ] **Step 4: Add the main handler after existing message/trace handlers**

Import `analyzeIndexedSessionAgentStatus` and register:

```ts
ipcMain.handle("session:agent-status", async (_event, sessionKey: string, live: boolean) => {
  if (typeof sessionKey !== "string" || !sessionKey.trim()) throw new Error("Session key is required.");
  await ensureRemoteSessionDetailsLoaded(sessionKey);
  const status = analyzeIndexedSessionAgentStatus(store, sessionKey, live === true);
  if (!status) throw new Error("Session is no longer available.");
  return status;
});
```

Do not fetch or analyze status during ordinary detail opening; this handler must only run after the user clicks the button.

- [ ] **Step 5: Run focused tests and type checking**

```bash
npx vitest run src/core/session-agent-status.test.ts src/renderer/src/detail-panel-actions.test.ts
npm run typecheck
```

Expected: both files pass and TypeScript exits successfully.

- [ ] **Step 6: Commit the complete-data bridge**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/detail-panel-actions.test.ts
git commit -m "feat: expose session status analysis"
```

### Task 3: Compact Agent status card

**Files:**
- Create: `src/renderer/src/features/session-detail/agent-status-card.test.ts`
- Create: `src/renderer/src/features/session-detail/agent-status-card.tsx`
- Modify: `src/renderer/src/styles/session-detail.css`

- [ ] **Step 1: Write failing server-rendered card tests**

Use `renderToStaticMarkup` with a complete synthetic `SessionAgentStatus`:

```tsx
const html = renderToStaticMarkup(
  <AgentStatusCard
    language="zh"
    status={{
      state: "waiting_user",
      latestUserRequest: "修复登录回归并保留旧 API",
      todos: [
        { id: "1", content: "补回归测试", status: "in_progress" },
        { id: "2", content: "验证构建", status: "pending" },
        { id: "3", content: "复现问题", status: "completed" },
      ],
      toolCallCount: 7,
      tools: [
        { name: "shell_command", count: 4, failureCount: 1, unknownCount: 0 },
        { name: "apply_patch", count: 3, failureCount: 0, unknownCount: 0 },
      ],
      failureCount: 1,
      latestFailure: { title: "shell_command", detail: "npm test exited 1", timestamp: "2026-07-22T08:10:00Z" },
      compactionCount: 2,
      abortedCount: 0,
      projectPath: "/repo",
      firstActivityAt: "2026-07-22T08:00:00Z",
      lastActivityAt: "2026-07-22T08:12:00Z",
      messageCount: 300,
      traceEventCount: 42,
      analyzedAt: "2026-07-22T09:00:00.000Z",
    }}
  />,
);

expect(html).toContain("Agent 状态");
expect(html).toContain("等待用户");
expect(html).toContain("修复登录回归并保留旧 API");
expect(html).toContain("shell_command");
expect(html).toContain("4 次");
expect(html).toContain("补回归测试");
expect(html).toContain("300 条消息 · 42 条轨迹");
```

Add a second test with no request, no plan, no tools, and `state: unknown`; assert a compact data-insufficient message and no empty tool/plan sections.

- [ ] **Step 2: Run the card test and verify RED**

```bash
npx vitest run src/renderer/src/features/session-detail/agent-status-card.test.ts
```

Expected: FAIL because `AgentStatusCard` does not exist.

- [ ] **Step 3: Implement the card as a focused presentation component**

Export:

```ts
export interface AgentStatusCardProps {
  status: SessionAgentStatus;
  language: LanguageMode;
}
```

Render:

- a header with `Activity`, “Agent status/Agent 状态”, localized state badge, coverage, and analyzed time;
- a wide current-request row when available;
- four compact metrics for tool calls, failures, compactions, and interruptions;
- at most five tool chips sorted by the analyzer, each with its count and a failure marker when nonzero;
- unfinished/in-progress plan items first, followed by enough completed items to show at most five;
- a latest-failure excerpt when present;
- a neutral evidence-empty message when all optional sections are absent.

Keep translation helpers in this component because every label has one caller. Do not add a generic card abstraction.

- [ ] **Step 4: Add compact, theme-native styles**

Add classes under the existing Session detail stylesheet:

```css
.agent-status-card {
  margin: 10px 18px 0;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--panel-subtle);
}
.agent-status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.agent-status-state {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--panel-hover);
  color: var(--text-muted);
  font-size: 11px;
}
.agent-status-state.running {
  background: var(--running-bg);
  color: var(--running-text);
}
.agent-status-state.failed,
.agent-status-state.interrupted {
  background: var(--danger-soft);
  color: var(--danger);
}
.agent-status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.agent-status-tools,
.agent-status-todos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
```

At narrow widths, stack header metadata and use two metric columns. Respect existing typography and do not introduce a new palette, shadow, or animation system.

- [ ] **Step 5: Run the card test and verify GREEN**

```bash
npx vitest run src/renderer/src/features/session-detail/agent-status-card.test.ts
```

Expected: both card scenarios pass.

- [ ] **Step 6: Commit the card**

```bash
git add src/renderer/src/features/session-detail/agent-status-card.tsx src/renderer/src/features/session-detail/agent-status-card.test.ts src/renderer/src/styles/session-detail.css
git commit -m "feat: add compact session agent status card"
```

### Task 4: Manual Session-detail analysis lifecycle

**Files:**
- Modify: `src/renderer/src/detail-panel-actions.test.ts`
- Modify: `src/renderer/src/features/session-detail/detail-panel.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Write failing Session-detail integration assertions**

Add assertions that the owning component exposes the user-visible behavior:

```ts
it("analyzes and re-analyzes Agent status only after a detail action", () => {
  expect(detailPanelSource).toContain("onAnalyzeAgentStatus");
  expect(detailPanelSource).toContain('l("Analyze status", "分析状态")');
  expect(detailPanelSource).toContain('l("Re-analyze", "重新分析")');
  expect(detailPanelSource).toContain("await onAnalyzeAgentStatus()");
  expect(detailPanelSource).toContain("setAgentStatus(nextStatus)");
  expect(detailPanelSource).toContain("<AgentStatusCard");
  expect(appSource).toContain("window.sessionSearch.analyzeSessionAgentStatus");
  expect(appSource).toContain("analyzeSessionAgentStatus({");
});
```

Also assert the action bar itself is no longer entirely gated by `!readOnly`, so a read-only remote snapshot can render only the analysis action without enabling write controls.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npx vitest run src/renderer/src/detail-panel-actions.test.ts
```

Expected: FAIL because the prop, action, state, card, and App wiring do not exist.

- [ ] **Step 3: Add the transient analysis lifecycle to `DetailPanel`**

Add the required prop:

```ts
onAnalyzeAgentStatus: () => Promise<SessionAgentStatus>;
```

Inside `DetailPanel`, keep:

```ts
const [agentStatus, setAgentStatus] = useState<SessionAgentStatus | null>(null);
const [agentStatusLoading, setAgentStatusLoading] = useState(false);
const [agentStatusError, setAgentStatusError] = useState<string | null>(null);
const agentStatusRequestRef = useRef(0);
```

Reset the three visible states and invalidate the request counter when `session.sessionKey` changes. The click handler increments the counter, clears the prior error, awaits the prop, and only applies the result/error when its request ID is still current. Preserve an existing successful card while re-analysis is running; replace it only after success.

Render the action bar for every detail. Keep all existing action groups behind `!readOnly`, but keep the group containing “分析状态” available in both writable and read-only details. Disable it during an active action or analysis. Render a localized inline error with a retry button, or `AgentStatusCard` when a result exists.

- [ ] **Step 4: Wire ordinary and remote details in `App.tsx`**

For ordinary details, pass:

```tsx
onAnalyzeAgentStatus={() =>
  window.sessionSearch.analyzeSessionAgentStatus(
    detail.sessionKey,
    getLiveSessionState(detail, liveSessionKeys, liveDetectionFailed) === "open",
  )
}
```

For `remoteDetail`, import the pure analyzer and pass:

```tsx
onAnalyzeAgentStatus={() => Promise.resolve(analyzeSessionAgentStatus({
  session: remoteDetail.snapshot.session,
  messages: remoteDetail.snapshot.messages,
  traceEvents: remoteDetail.snapshot.traceEvents,
  live: false,
}))}
```

Do not add automatic effects or background calls. Both paths run only from the detail button.

- [ ] **Step 5: Run focused tests and type checking**

```bash
npx vitest run src/core/session-agent-status.test.ts src/renderer/src/features/session-detail/agent-status-card.test.ts src/renderer/src/detail-panel-actions.test.ts
npm run typecheck
```

Expected: all focused tests pass and TypeScript exits successfully.

- [ ] **Step 6: Commit the Session interaction**

```bash
git add src/renderer/src/App.tsx src/renderer/src/features/session-detail/detail-panel.tsx src/renderer/src/detail-panel-actions.test.ts
git commit -m "feat: analyze agent status from session details"
```

### Task 5: Release copy and full verification

**Files:**
- Modify: `.release-notes/main-2-0.md`

- [ ] **Step 1: Update the branch's existing single release note**

Append one user-facing bullet under `## 新增功能`:

```md
- Session 详情新增按需 Agent 状态分析：可从完整会话轨迹中查看当前等待状态、最近诉求、显式计划、工具调用与失败、上下文压缩和中断记录；结果仅在当前详情中展示，不调用模型也不会改写原会话。
```

Do not add a second release-note file.

- [ ] **Step 2: Stop the running Electron development process before full verification**

Terminate the existing `npm run dev` process and its Electron children. Confirm no AgentRecall test UI process remains before running the full suite.

- [ ] **Step 3: Run focused verification**

```bash
npx vitest run src/core/session-agent-status.test.ts src/renderer/src/features/session-detail/agent-status-card.test.ts src/renderer/src/detail-panel-actions.test.ts
npm run typecheck
```

Expected: focused tests and type checking pass.

- [ ] **Step 4: Run repository verification**

```bash
npm test
npm run build
npm run release-note:check
git diff --check
```

Expected: all tests pass, the production build completes, exactly one branch release note validates, and no whitespace errors are reported.

- [ ] **Step 5: Review privacy and scope**

Inspect the diff and search only changed source/document files for private hostnames, organization identifiers, credentials, absolute developer paths, or copied real session content. Confirm all tests use synthetic `/repo` fixtures and that the feature performs no upload, persistence, Agent injection, automatic analysis, or Resume mutation.

- [ ] **Step 6: Start the development app for user inspection**

```bash
npm run dev
```

Expected: Electron opens on `main-2.0`. Open a Session detail, confirm no analysis occurs automatically, click “分析状态”, inspect the card, and click “重新分析”. Keep the process available only for the requested inspection.

- [ ] **Step 7: Commit release copy and any verification-only corrections**

```bash
git add .release-notes/main-2-0.md
git commit -m "docs: note session agent status analysis"
```

If verification required a user-visible correction, include its already-tested source and test files in the same final correction commit with a precise message.
