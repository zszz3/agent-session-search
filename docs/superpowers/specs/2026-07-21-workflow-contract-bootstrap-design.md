# Workflow 合同迁移首批落地方案

## 目标

在 `AgentRecall` 中按 `multi-agent-chat` 的原目录边界落下第一批 Workflow shared 合同文件，为后续 store、runtime、planning、MCP 和 renderer 迁移提供稳定底板。

这一步不追求业务 workflow 立即跑通，优先保证：

- shared 合同路径、导出符号名、字段名与判别标签不偏离源实现
- `agent` 节点、`executionMode`、DAG 拓扑和主状态机的 shared 表达先进入仓库
- `workflowGate.ask / answer / resume` 在 shared 层对应的请求壳、运行事件和等待状态先有落点

## 源基线

- 源仓库：`C:\Users\29768\Desktop\multi-agent-chat`
- 观察点：`main @ ef81808a8e0258bb157cc98d3aadd8be837b3540`
- 第一批主基线：`5997b0e Codex/upgrade workflow module (#12)`
- 选择性吸收的 shared 合同增量：`ef81808 Fix/workflow feature closure audit (#25)`

原因：

- `5997b0e` 一次性引入了本轮需要的 `definition/state/topology/workflow commands/run` 主合同。
- `ef81808` 对这批 shared 文件只做了少量增量扩展，适合在底板之上按文件吸收，而不是把整个基线重新锚到一个混合了更多实现修补的提交上。

## 第一批文件范围

### 主合同文件

- `src/shared/workflow-v2/definition.ts`
- `src/shared/workflow-v2/state.ts`
- `src/shared/workflow-v2/topology.ts`
- `src/shared/workflow/commands.ts`
- `src/shared/workflow/run.ts`

### 为保持原模块边界而补齐的 shared 邻接类型

- `src/shared/workflow-v2/hooks.ts`
- `src/shared/workflow-v2/supervision.ts`
- `src/shared/workflow-v2/review.ts`
- `src/shared/workflow-v2/planning.ts`
- `src/shared/workflow-v2/generation-review.ts`
- `src/shared/workflow/draft.ts`
- `src/shared/runtime/conversation.ts`
- `src/shared/resource.ts`
- `src/shared/runtime-catalog.ts`

### 首批测试锚点

- `src/shared/workflow-v2/topology.test.ts`

## 本轮落地原则

- 保留源仓库的目录路径和模块拆分，不先合并文件。
- `definition/state/topology/commands/run` 尽量按源实现直接镜像。
- 邻接文件如果只是为了让主合同在本仓库可编译，则先镜像它们的 shared 导出面，不强行一并迁入 helper、validator 和 runtime 细节。
- 不在本轮引入 validation、templates、packets、runtime-utils、conversation manager 等第二圈模块。

## 本轮刻意不做的事

- 不接入当前 `AgentRecall` 的 IPC、store、main service 或 renderer。
- 不迁移 workflow 持久化 shape。
- 不实现真正的 gate 解析、answer/resume 执行恢复和 workflow scheduler。
- 不补 release note；等分支进入用户可见能力阶段再写产品文案。

## ef81808 增量吸收点

本轮在 shared 合同里一起吸收以下增量：

- `WorkflowV2ScriptAuthorization` 增加 `operationDigest`、`approvalRequestId`
- `WorkflowV2LLMNode` 与 `WorkflowV2TemplateNodeOverrides` 增加 `configuredAgentId`、`modelId`
- `ReviseWorkflowV2RunRequest`
- `WorkflowEventType` 增加 `graph_revised`

## 验证

本轮至少执行：

- `npm run typecheck`
- `npx vitest run src/shared/workflow-v2/topology.test.ts`

如果类型依赖范围继续扩大，优先补 shared 合同缺口，不提前把 runtime 行为搬进来。
