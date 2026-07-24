# Team Chat Agent 持续会话设计

## 背景

当前 Team Chat 会持久保存房间和最终消息，但每次调用 Agent 都创建新的 Runtime 会话。系统会把最近 40 条消息重新拼入 Prompt，因此聊天记录虽然存在，Agent 本身并没有连续身份；长会话还会重复发送已经读过的内容。

Codex 与 Claude Code 的 Runtime 执行链已经支持 `resume-preferred`，并能返回可持久化的 `RuntimeConversation`。本次将这项能力接入 Team Chat，不改变其他页面的执行语义。

## 目标

- 同一 Agent 在同一房间内连续被调用时，优先恢复自己的 Runtime 会话。
- 同一 Agent 加入不同房间时使用相互隔离的 Runtime 会话，避免上下文串房。
- 应用重启后继续使用已经保存的 Runtime 会话。
- 续接时只发送该 Agent 上次执行后新增的房间消息，不重复灌入完整近期记录。
- 用户可以从房间成员列表为某个 Agent 显式开始新会话。
- Agent 的 Runtime、Channel 或 Model 发生变化时自动丢弃不兼容的旧会话。
- 不支持 Workflow continuation 的 Runtime 保持现有 one-shot 行为。

## 不包含的范围

- 不在本阶段创建 Git worktree、复制项目目录或改变文件写入权限。
- 不增加任务看板、消息线程、提醒或多用户协作。
- 不把 Runtime 会话句柄暴露给 Renderer。
- 不自动删除 Codex、Claude Code 等 Runtime 在磁盘上的原生历史文件；“新会话”只解除 Team Chat 对旧会话的引用。
- 不把工具调用、思考过程或流式 Token 写入 Team Chat 数据库。

## 数据模型

新增房间成员会话记录，每个 `(room_id, agent_id)` 最多一条：

- `runtime_id`、`channel_id`、`model_id`：创建会话时的配置快照，用于兼容性检查。
- `runtime_conversation`：Runtime 提供的可持久化会话信封，仅供 Electron main 使用。
- `last_context_message_id`：上次成功执行时已经提供给该 Agent 的最新房间消息。
- `updated_at`：会话最近成功更新的时间。

Renderer 只能看到以下派生状态：

- `continuationAvailable`：该 Agent 的 Runtime 是否支持 Team Chat 持续会话。
- `hasActiveConversation`：当前房间是否保存了兼容的会话。
- `conversationUpdatedAt`：最近一次会话更新的时间。

房间成员被移除时删除对应会话。成员仍存在但 Runtime、Channel 或 Model 快照不一致时，Electron main 在下次读取或执行前清除旧记录。

## 执行流程

### 首次执行

1. Team Chat 读取房间最近消息，构造完整近期上下文。
2. Runtime 使用 `fresh` 执行。
3. Codex 或 Claude Code 返回 `RuntimeConversation` 后，保存会话信封和本次上下文的最后一条消息 ID。

### 后续执行

1. 读取该房间成员的会话记录并校验配置快照。
2. 查询 `last_context_message_id` 之后的消息，限制为最多 40 条和 48,000 字符。
3. 使用 `resume-preferred` 调用 Runtime。
4. 成功后原子更新会话信封和 `last_context_message_id`。

当前触发消息始终单独出现在 Prompt 末尾。若它已经包含在增量记录中，正文仍只出现一次。

### 失效与回退

如果 Runtime 明确报告原生会话不存在、已过期或无法恢复：

1. 清除房间成员的旧会话记录。
2. 若失败前没有产生任何文本增量，则在同一次调度中用 `fresh` 重试一次，并提供完整近期上下文。
3. 仅把 fresh 重试的输出展示给用户，避免出现两条回复。

已经产生文本增量的执行，以及普通执行错误、权限错误、网络错误和工具错误，都不触发 fresh 重试，防止一个可能已经产生文件副作用的请求被重复执行。

## Prompt

Fresh Prompt 包含：

- 房间、当前 Agent、成员列表和执行额度。
- 最近房间记录。
- 当前触发消息。

Resume Prompt 包含：

- 房间和当前 Agent 身份。
- “自上次执行后的房间更新”。
- 当前触发消息。

构造增量记录时排除当前触发消息，确保它只在 Prompt 末尾出现一次。若上次执行后新增消息超过限制，保留最新部分并明确标注有较早更新未展开。Agent 已经在原生 Runtime 会话中拥有旧 Prompt 和自己的历史输出，因此 Resume Prompt 不再重复发送旧记录。

## UI

房间成员列表继续显示 Agent 名称和 Runtime 信息，并增加简短上下文状态：

- `持续会话`：存在可恢复会话。
- `首次调用后持续`：Runtime 支持续接，但当前尚无会话。
- `每次新会话`：Runtime 不支持该执行面的续接。

存在会话时提供低强调度的“新会话”操作。点击后立即清除该房间、该 Agent 的会话引用；历史聊天消息不受影响，下一次调用会重新携带近期上下文。

## IPC 与安全

新增一个窄接口：

- `team-chat:agent-session:reset`，输入 `roomId` 与 `agentId`。

输入继续通过 Zod 校验。IPC 返回更新后的公开房间对象，不返回 `runtime_conversation`、原生 thread/session ID、配置凭据或数据库内容。

## 测试

- Configured Agent 执行服务：Codex/Claude 有会话时使用 `resume-preferred` 并返回新会话；其他 Runtime 保持 `fresh`。
- Prompt：fresh 包含近期记录，resume 只包含增量记录，触发消息不重复。
- Team Chat 服务：成功执行后保存会话；下一次执行携带会话；配置变化清除旧会话；显式重置后下一次 fresh。
- Store：PGlite 关闭并重新打开后仍能读取会话；移除成员会清理会话；测试仅使用临时目录。
- IPC/preload：重置接口校验输入且不泄露内部会话信封。
- UI：成员区显示上下文状态并能调用重置。
- 完整执行 typecheck、Vitest、脚本测试、构建、发布说明检查和 package smoke。
