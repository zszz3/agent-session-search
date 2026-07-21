# Runtime, MCP, and Workflow Native Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AgentRecall natively configure and execute Multi Agent Chat's Runtime, MCP, and Workflow V2 capabilities without modifying or depending on the Multi Agent Chat checkout at runtime.

**Architecture:** Import the tested upstream automation dependency closure as a read-only snapshot under `src/automation/engine/`, then place AgentRecall-owned lifecycle, IPC, preload, and renderer adapters around it. The imported engine keeps its internal relative module structure, while all product naming, storage paths, bridge discovery, navigation, and UI composition are owned by AgentRecall. Runtime/Workflow state uses a separate `automation.db` and `runtime-channels.json`; existing session indexing remains independent.

**Tech Stack:** Electron 42, TypeScript, React 19, Vitest, Node 22 SQLite, MCP SDK, Claude Agent SDK, Agent Client Protocol SDK, XYFlow.

---

## File map

- `src/automation/engine/`: read-only source snapshot of the upstream Runtime/Workflow dependency closure and selected upstream contract tests.
- `src/automation/upstream-manifest.json`: exact upstream commit and imported file list; proves that Multi Agent Chat is an input, not a runtime dependency.
- `src/main/services/automation-service.ts`: owns engine initialization, state paths, bundled workflows, bridge lifecycle, snapshot events, and shutdown.
- `src/main/ipc/automation.ts`: AgentRecall-prefixed Runtime, MCP, Workflow, file-preview, and approval IPC handlers.
- `src/shared/ipc/automation.ts`: stable channel constants, serializable public types, and Zod argument validation.
- `src/preload/automation.ts`: renderer-facing automation API.
- `src/renderer/src/features/automation/automation-provider.tsx`: lazy snapshot subscription and shared feature context.
- `src/renderer/src/features/runtime/`: Runtime Channel and Agent profile page adapted to AgentRecall.
- `src/renderer/src/features/mcp/`: MCP registry and bindings page adapted to AgentRecall.
- `src/renderer/src/features/workflow/`: Workflow history, controller, canvas, node interactions, outputs, and approvals.
- `src/renderer/src/styles/runtime.css`, `mcp.css`, `workflow.css`: scoped AgentRecall presentation for the migrated pages.
- `src/renderer/src/features/workbench/workbench-page.tsx`: real Workflow summary in the existing home slot.
- `scripts/build-mcp-bundle.mjs`: also build the AgentRecall Workflow MCP stdio entry.
- `package.json`, `package-lock.json`: required Runtime and canvas dependencies plus packaged MCP executable.
- `.release-notes/main-2-0.md`: one user-facing branch note updated in place.

### Task 1: Freeze the upstream dependency snapshot

**Files:**
- Create: `src/automation/upstream-manifest.json`
- Create: every test path listed in `src/automation/upstream-manifest.json` with `kind: "test"`

- [ ] **Step 1: Generate the production and test dependency closure without changing Multi Agent Chat**

Use its current `main` commit as the source. Include the Runtime adapters, AgentHub workflow coordinator, Workflow V2 engine, MCP registry/client/server, Runtime/MCP/Workflow renderer components, bundled workflows, and tests that directly cover those modules. Exclude its Electron bootstrap, preload entry, Chat/Tasks/Schedules/Evaluation pages, and application-wide stylesheet.

The manifest starts with:

```json
{
  "source": "multi-agent-chat",
  "commit": "ef81808",
  "importedAt": "2026-07-21",
  "files": []
}
```

- [ ] **Step 2: Copy tests before production code**

Preserve each file's path relative to the upstream `src/` directory under `src/automation/engine/`. Rewrite only imports that would collide with AgentRecall's lowercase Markdown component or preload global.

- [ ] **Step 3: Run a representative target test and verify RED**

Run:

```bash
npm test -- src/automation/engine/main/hub/agent-hub-workflow-activation.test.ts
```

Expected: FAIL because the imported engine implementation does not exist yet.

- [ ] **Step 4: Import production files mechanically and record every file in the manifest**

Do not edit the source repository. The target snapshot must contain no symlink and no path outside AgentRecall.

- [ ] **Step 5: Add required dependencies**

Add the exact compatible dependency families already used by the source implementation:

```json
{
  "@agentclientprotocol/sdk": "^1.2.1",
  "@anthropic-ai/claude-agent-sdk": "^0.3.202",
  "@anthropic-ai/claude-code": "^2.1.201",
  "@xyflow/react": "^12.11.0"
}
```

- [ ] **Step 6: Run imported contract tests and verify GREEN**

Run the imported Runtime, MCP, Workflow validation, scheduler, persistence, and AgentHub workflow suites with a temporary `HOME`.

### Task 2: Brand and isolate the imported engine

**Files:**
- Modify: `src/automation/engine/mcp/server.ts`
- Modify: `src/automation/engine/main/bridges/mcp-bridge.ts`
- Modify: `src/automation/engine/shared/mcp-config.ts`
- Modify: `src/automation/engine/main/mcp/agent-management-service.ts`
- Create: `src/automation/engine/agent-recall-branding.test.ts`

- [ ] **Step 1: Write failing branding/isolation tests**

Assert that:

```ts
expect(resolveBridgeDiscoveryPath({ homeDir, platform: "darwin" })).toContain("agent-recall");
expect(buildManagedMcpBlock(input)).toContain("BEGIN AGENT_RECALL MCP");
expect(buildManagedMcpBlock(input)).not.toContain("MULTI_AGENT_CHAT");
```

Also assert that removal ignores `MULTI_AGENT_CHAT` blocks.

- [ ] **Step 2: Verify RED**

Run the branding test and confirm it still produces Multi Agent Chat names.

- [ ] **Step 3: Implement AgentRecall names**

Use:

```ts
export const AUTOMATION_MCP_ENV = "AGENT_RECALL_WORKFLOW_MCP_BRIDGE";
export const AUTOMATION_MCP_BLOCK_PREFIX = "AGENT_RECALL";
export const AUTOMATION_MCP_SERVER_PREFIX = "agent_recall";
```

User-visible descriptions say AgentRecall. Managed block parsing only owns the AgentRecall prefix.

- [ ] **Step 4: Verify GREEN and scan the imported runtime for stale product markers**

Product markers may remain only in the upstream manifest metadata, never in generated config, discovery paths, errors, or UI copy.

### Task 3: Add the AgentRecall automation lifecycle service

**Files:**
- Create: `src/main/services/automation-service.test.ts`
- Create: `src/main/services/automation-service.ts`
- Create: `src/main/services/automation-paths.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Use dependency injection and temporary directories. Test that initialization loads:

```ts
{
  databasePath: join(userData, "automation.db"),
  channelsPath: join(userData, "runtime-channels.json"),
  discoveryPath: join(userData, "automation-mcp-bridge.json")
}
```

Test that initialize is idempotent, snapshot subscriptions receive revisions, and shutdown flushes before stopping bridge/transports.

- [ ] **Step 2: Verify RED**

Run `automation-service.test.ts`; expect module-not-found or missing-method failures.

- [ ] **Step 3: Implement the service**

The public interface is:

```ts
export interface AutomationService {
  initialize(): Promise<void>;
  snapshot(): AppSnapshot;
  subscribe(listener: (snapshot: AppSnapshot) => void): () => void;
  hub(): AgentHub;
  mcpRegistry(): McpRegistryStore;
  mcpAgents(): McpAgentManagementService;
  shutdown(): Promise<void>;
}
```

Initialization order is channels → persisted state → bundled workflows → MCP bridge → Runtime detection. It must not delay creation of the AgentRecall window; initialization failure is retained as an automation-only status.

- [ ] **Step 4: Register lifecycle from the existing Electron entry**

Construct with `app.getPath("userData")`, `app.getPath("home")`, the current main window supplier, and a separate automation database. On quit, await automation shutdown without altering existing index shutdown behavior.

- [ ] **Step 5: Verify GREEN**

Run lifecycle tests and the existing main-process tests.

### Task 4: Expose strict Runtime, MCP, and Workflow IPC

**Files:**
- Create: `src/shared/ipc/automation.ts`
- Create: `src/main/automation-ipc.test.ts`
- Create: `src/main/ipc/automation.ts`
- Create: `src/preload/automation.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/global.d.ts`

- [ ] **Step 1: Write failing IPC and preload tests**

Cover snapshot, event subscription, Runtime save/test/import/models/balance, Agent profile save/test, MCP list/save/test/delete/bind/install, work directory selection, output preview, every Workflow draft/run/intervention operation, and approval resolution.

Invalid IDs, paths, transports, URLs, duplicate targets, oversized prompts, and malformed Workflow definitions must fail at the IPC boundary.

- [ ] **Step 2: Verify RED**

Run the IPC tests and confirm missing channels/API failures.

- [ ] **Step 3: Implement AgentRecall-prefixed channels**

Examples:

```ts
export const AUTOMATION_CHANNELS = {
  snapshot: "automation:snapshot",
  runtimeSave: "automation:runtime:save",
  mcpList: "automation:mcp:list",
  workflowCreate: "automation:workflow:create",
  workflowRun: "automation:workflow:run"
} as const;
```

Handlers delegate to the automation service and do not register the upstream generic `snapshot:get` names.

- [ ] **Step 4: Expose a grouped preload API**

```ts
automation: {
  getSnapshot,
  onSnapshot,
  runtimes: { saveChannels, saveAgents, testChannel, testAgent, importLocal, refreshModels },
  mcp: { list, save, test, remove, listBindings, saveBindings, install, uninstall },
  workflows: { create, patch, select, rename, remove, confirm, run, stop, pauseNode, startNode, revise, resolveIntervention },
  chooseWorkDir,
  readOutput,
  resolveApproval
}
```

Do not expose secrets in snapshots.

- [ ] **Step 5: Verify GREEN**

Run IPC, preload, and sensitive-field tests.

### Task 5: Build and package the AgentRecall Workflow MCP server

**Files:**
- Create: `src/mcp/workflow-entry.ts`
- Create: `bin/agent-recall-workflow-mcp.mjs`
- Modify: `scripts/build-mcp-bundle.mjs`
- Modify: `package.json`
- Create: `scripts/workflow-mcp-package.test.mjs`

- [ ] **Step 1: Write failing bundle/package tests**

Assert that the packaged executable imports `out/mcp/workflow-entry.js`, resolves only AgentRecall discovery paths, advertises Workflow tools, and never contains the source checkout path.

- [ ] **Step 2: Verify RED**

Run the script test and expect the missing entry/bundle failure.

- [ ] **Step 3: Add the stdio entry and second esbuild entry point**

Build both `migration-entry.ts` and `workflow-entry.ts`. Add `agent-recall-workflow-mcp` to `bin` and package files.

- [ ] **Step 4: Verify GREEN using a temporary npm prefix**

Build, pack, install the tarball into a temporary prefix, invoke the CLI handshake, and remove the prefix/tarball/process.

### Task 6: Adapt Runtime and Agent profile UI

**Files:**
- Create: `src/renderer/src/features/automation/automation-provider.test.tsx`
- Create: `src/renderer/src/features/automation/automation-provider.tsx`
- Create: `src/renderer/src/features/runtime/runtime-page.test.tsx`
- Create: `src/renderer/src/features/runtime/runtime-page.tsx`
- Create: `src/renderer/src/features/runtime/runtime-channels-tab.tsx`
- Create: `src/renderer/src/features/runtime/runtime-agents-tab.tsx`
- Create: `src/renderer/src/styles/runtime.css`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Write failing provider and Runtime page tests**

Test lazy load, reconnect after renderer reload, six Runtime filters, Channel editing, explicit local import, hidden credentials, Agent profile binding, model refresh, connection test, balance and local error states.

- [ ] **Step 2: Verify RED**

Run Runtime UI tests and confirm missing component failures.

- [ ] **Step 3: Implement AutomationProvider**

It loads only when Workbench, Runtime, MCP, or Workflow needs automation state, subscribes once, preserves the last snapshot during refresh, and exposes operation-specific busy/error state.

- [ ] **Step 4: Adapt Runtime UI to AgentRecall**

Reuse upstream Runtime field logic but use AgentRecall page header, density, buttons, language helper, focus styles and responsive breakpoints. Add `Channels` and `Agents` tabs.

- [ ] **Step 5: Verify GREEN**

Run Runtime page tests at desktop and minimum-width structures.

### Task 7: Adapt MCP registry and bindings UI

**Files:**
- Create: `src/renderer/src/features/mcp/mcp-page.test.tsx`
- Create: `src/renderer/src/features/mcp/mcp-page.tsx`
- Create: `src/renderer/src/features/mcp/mcp-server-editor.tsx`
- Create: `src/renderer/src/features/mcp/mcp-agent-bindings.tsx`
- Create: `src/renderer/src/styles/mcp.css`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Write failing MCP UI tests**

Cover empty state, stdio/HTTP editor, save, test, discovered tools, error details, delete confirmation, binding allowlist, explicit external-agent install, token/path requirements, and hidden env values.

- [ ] **Step 2: Verify RED**

Run MCP UI tests and confirm missing component failures.

- [ ] **Step 3: Implement the page and controller**

Use a compact Server list plus detail surface. Keep bindings in a detail Tab rather than a second top-level page. Disable save/test only for the affected operation.

- [ ] **Step 4: Verify GREEN**

Run MCP renderer, registry, transport, and config-isolation tests.

### Task 8: Adapt Workflow UI and controller

**Files:**
- Create: `src/renderer/src/features/workflow/workflow-page.test.tsx`
- Create: `src/renderer/src/features/workflow/workflow-page.tsx`
- Create: `src/renderer/src/features/workflow/workflow-controller.ts`
- Create: `src/renderer/src/features/workflow/workflow-history.tsx`
- Create: `src/renderer/src/features/workflow/components/workflow-canvas.tsx`
- Create: `src/renderer/src/features/workflow/components/workflow-draft-editor.tsx`
- Create: `src/renderer/src/features/workflow/components/workflow-node-surface.tsx`
- Create: `src/renderer/src/features/workflow/components/workflow-node-agent-window.tsx`
- Create: `src/renderer/src/features/workflow/components/workflow-script-panel.tsx`
- Create: `src/renderer/src/features/workflow/components/workflow-review-drawer.tsx`
- Create: `src/renderer/src/features/workflow/components/workflow-output-preview.tsx`
- Create: `src/renderer/src/features/workflow/components/workflow-outputs.tsx`
- Create: `src/renderer/src/styles/workflow.css`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Write failing Workflow UI tests**

Cover new/select/rename/delete, planning conversation, definition validation, review, confirmation, run/stop, node pause/start, interactive reply, script input, approval, revision, output preview, official templates, reload restoration, and inaccessible Runtime errors.

- [ ] **Step 2: Verify RED**

Run Workflow UI tests and confirm missing component/controller failures.

- [ ] **Step 3: Adapt the upstream Workflow controller**

Point its service at `window.sessionSearch.automation.workflows`, use AgentRecall language and Markdown components, and isolate snapshot subscriptions in AutomationProvider.

- [ ] **Step 4: Adapt the Workflow page**

Keep the upstream behavior but compose it as an AgentRecall page: narrow history rail, primary workspace, on-demand node/approval/output surfaces, and responsive canvas. Do not import the upstream app shell or global stylesheet.

- [ ] **Step 5: Verify GREEN**

Run Workflow renderer tests plus the imported validation/scheduler/execution/recovery suites.

### Task 9: Wire navigation and the Workbench summary

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/features/workbench/workbench-page.tsx`
- Create: `src/renderer/src/features/workbench/workflow-summary.test.tsx`
- Create: `src/renderer/src/features/workbench/workflow-summary.tsx`
- Modify: `src/renderer/src/styles/app-shell.css`
- Modify: `src/renderer/src/styles/workbench.css`
- Modify: `src/renderer/src/workbench-ui.test.ts`

- [ ] **Step 1: Write failing navigation and summary tests**

Assert Runtime, MCP and Workflow navigation entries, direct page rendering, current-page persistence during snapshots, and the Workbench priority order: waiting for user → running → most recently updated, maximum five.

- [ ] **Step 2: Verify RED**

Run workbench/navigation tests and confirm missing entries/summary failures.

- [ ] **Step 3: Wire pages without adding domain state to `App.tsx`**

Extend:

```ts
type AppPage = "workbench" | "sessions" | "workflows" | "runtimes" | "mcp" | "skills" | "memories" | "providers";
```

Render feature pages through AutomationProvider. Keep settings fixed at the bottom.

- [ ] **Step 4: Replace the Workflow placeholder**

Rows show status, title, node progress and relative update time. Clicking opens Workflow with the matching ID; the empty action creates a draft and opens the page.

- [ ] **Step 5: Verify GREEN**

Run navigation, workbench, and full renderer tests.

### Task 10: Release note, security audit, and full verification

**Files:**
- Modify: `.release-notes/main-2-0.md`

- [ ] **Step 1: Update the existing single branch release note**

Add one user-facing bullet describing native Runtime configuration, MCP management, and visual Workflow creation/execution. Do not add a second release-note file.

- [ ] **Step 2: Run targeted verification**

Run imported engine tests, AgentRecall automation service/IPC tests, and the three new renderer feature suites.

- [ ] **Step 3: Run full verification**

```bash
npm test
npm run build
npm run release-note:check
git diff --check
```

- [ ] **Step 4: Run safety checks**

Scan changed files for company identifiers, absolute developer paths, API keys, tokens, Multi Agent Chat product paths in generated behavior, and symlinks. Verify the Multi Agent Chat status and commit are unchanged from the pre-migration record.

- [ ] **Step 5: Run package smoke testing safely**

Use a temporary HOME, userData, npm prefix, database, output directory and synthetic CLI fixtures. Test macOS and Windows path branches. Stop all child Agent, MCP and Electron processes and remove generated tarballs when complete.

- [ ] **Step 6: Start AgentRecall for visual inspection**

Launch the development app only after the build is green. Confirm the renderer connects and reports no Runtime/MCP/Workflow initialization errors. Leave it running only because the user requested an inspectable result.
