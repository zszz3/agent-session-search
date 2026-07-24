# PostgreSQL Turn 与轨迹平台设计

## 背景

AgentRecall 当前有三套内部持久化：

- `session-search.sqlite` 保存 Session、消息、轨迹事件、Token、标签、Skills、环境、同步绑定和 Provider Key。
- `automation.db` 保存 Runtime、MCP、Workflow 和 Eval。
- Team Chat 默认使用 PGlite，也可连接外部 PostgreSQL。

Session 搜索索引当前以整段会话为一条 FTS 文档。命中后虽然能够补充消息片段，但排序、分页和统计仍以整段文本为基础，长会话容易获得不合理权重，也缺少可直接用于轨迹评测的“一轮请求”实体。

本次重构把所有 AgentRecall 内部业务数据迁移到真正的 PostgreSQL，并把 Turn 提升为 Session 与执行轨迹之间的核心实体。Claude Code、Codex 等外部产品自身的 SQLite 文件仍是只读导入源，不属于迁移范围。

## 已选择方案

讨论过三种路线：

1. 保留 SQLite，只把 FTS 改为 Turn 粒度。改动最小，但后台索引、MCP、评测 Worker 和多模块并发继续受同步数据库接口限制。
2. SQLite 保存本地索引，PostgreSQL 保存共享数据。离线体验最好，但同一领域存在两套事实源，Turn、轨迹和评测需要跨库关联。
3. 全部内部业务数据迁移到 PostgreSQL。改动最大，但只有一套异步数据接口，搜索、同步、MCP、Workflow、Chat 和 Eval 可以共享事务、连接池和数据模型。

采用方案 3。桌面应用默认管理一个仅监听本机的 PostgreSQL 实例；设置环境变量时也允许连接用户管理的 PostgreSQL。PGlite 只允许用于隔离单元测试，不再作为正式数据源。

## 目标

- 内部业务数据只使用 PostgreSQL，删除正式运行路径中的 SQLite 和 PGlite 写入。
- 应用启动时自动准备本地 PostgreSQL、执行版本化迁移并连接；用户无需预装数据库。
- 新版本直接建立全新的 PostgreSQL 数据库，不读取旧内部数据库；Session 从原始 Agent 会话重新全量索引。
- Session 下建立稳定的 Turn；搜索命中 Turn，但结果仍以 Session 聚合展示。
- 一轮内保留有序 Message 与树状 Span，支持工具、LLM、Subagent、错误、重试和压缩轨迹。
- Eval 能分别关联 Session、Turn 或 Span，并继续支持现有数据集、Evaluator、Experiment 和 Run。
- Electron、后台索引、独立 MCP 和未来评测 Worker 通过 PostgreSQL 并发访问。
- 所有导入和迁移均可重试、幂等，不读取或修改真实用户目录来运行测试。

## 非目标

- 不改写 Claude Code、Codex、Trae、CodeBuddy 等外部产品的存储。
- 不迁移或兼容读取旧 `session-search.sqlite`、`automation.db` 与 Team Chat PGlite 数据。
- 不在本次引入 ClickHouse、对象存储或多租户权限。
- 不在首版加入向量检索；结构会预留 embedding 版本和扩展字段。
- 不把项目文件、Skill 正文、Agent Memory 文件或 Workflow 产物塞入数据库；数据库只保存索引、元数据和文件引用。

## 数据模型

### 核心层级

```text
sessions
└── session_turns
    ├── turn_messages
    └── trace_spans
        └── trace_spans
```

`sessions` 是完整会话和最终搜索结果单位。

`session_turns` 是一次顶层用户请求到下一次顶层用户请求之前的完整执行，也是全文检索、语义检索和常用评测单位。

`turn_messages` 保存面向用户阅读的标准化消息。每条消息保留来源中的稳定索引、角色、内容和时间。

`trace_spans` 保存执行树。Span 使用 `parent_span_id` 表达 LLM、工具、Subagent、压缩、错误和其他嵌套步骤；`sequence_no` 保证同级顺序。

`session_raw_events` 保存可重放的标准化原始事件和来源定位。Turn 与 Span 都是可版本化重建的派生结果。

### Turn 边界

- 顶层 User 消息开始新 Turn。
- 后续 Assistant、Tool、Reasoning、Subagent 和系统提醒归入当前 Turn。
- 下一条顶层 User 消息结束上一 Turn。
- Session 开头且早于第一条 User 消息的内容归入 Session preamble。
- 没有可识别 User 消息的执行记录按根任务或根 Trace 生成 synthetic Turn。
- Subagent 自身若已有独立 Session，仍保留独立 Session；父会话中的调用同时表现为一个 Subagent Span，并用父子会话字段关联。

每个 Turn 保存 `derivation_version`。分轮算法升级时从 `session_raw_events` 重建，用户标签、评测和搜索链接通过稳定 Turn identity 重绑。

### 搜索

每个 Turn 保存：

- `user_text`
- `assistant_text`
- `tool_text`
- `search_text`
- `search_vector`
- `started_at`、`ended_at`
- Token、工具、错误和执行状态聚合

查询流程：

1. 在 `session_turns.search_vector` 上检索并计算 Turn 相关度。
2. 结合 trigram 相似度支持中文、短片段和模糊匹配。
3. 按 `session_id` 聚合，最高相关 Turn 是 Session 主得分，其他命中只做有限加权。
4. 分页和总数统计 Session，不让同一个长会话占满结果。
5. 返回最佳命中 Turn、命中片段、命中总数和其他 Turn 定位。
6. 打开 Session 后直接滚动到最佳 Turn，并允许前后跳转。

无查询时继续按 Session 时间、收藏和打开状态排序，不经过全文检索。

### 评测

现有 Eval 数据集、Evaluator、Experiment、Run 和 Case Result 迁入 PostgreSQL。新增通用目标：

```text
evaluation_subjects
- id
- subject_type: session | turn | span
- session_id
- turn_id
- span_id

evaluation_results
- subject_id
- evaluator_id
- score
- label
- passed
- explanation
- evidence
- evaluator_version
- created_at
```

约束保证每个 Subject 只引用对应层级的一条记录。

- Span 级评测工具选择、参数、错误恢复和单步延迟。
- Turn 级评测最终回复、任务完成度、完整轨迹和资源消耗。
- Session 级评测多轮一致性、问题解决、重复澄清和记忆保持。

## PostgreSQL 结构

所有表位于 `agent_recall` schema。数据库迁移记录在 `schema_migrations`，每次迁移在 advisory lock 下串行执行。

主要领域：

- Session：sessions、session_turns、turn_messages、session_raw_events、trace_spans、token_events、tags。
- Search：Turn 的 generated `tsvector`、GIN 索引、`pg_trgm` 索引。
- Sync：session/skill binding、revision 和同步队列。
- Skills/Environment/Metadata：现有元数据表的 PostgreSQL 版本。
- Automation：app settings、configured agents、chat、workflow、run、event。
- MCP：server、tool 和 Agent binding。
- Eval：dataset、evaluator、experiment、run、case result、score、通用 subject/result。
- Team Chat：沿用现有 PostgreSQL 表并迁入统一连接。

时间统一使用 `timestamptz`；计数使用 `bigint`；可变 Provider 元数据、原始事件和评测证据使用 `jsonb`。对外 TypeScript API 继续使用现有毫秒时间和字符串 ID，映射只发生在数据层。

## 数据访问边界

建立共享异步接口：

```text
PostgresRuntime
  └── PostgresDatabase
      ├── SessionRepository
      ├── SkillRepository
      ├── AutomationRepository
      ├── McpRepository
      ├── EvaluationRepository
      └── TeamChatRepository
```

`PostgresDatabase` 负责连接池、事务、迁移和关闭。各 Repository 只拥有自己的 SQL，不允许页面或 IPC 直接查询。

现有同步 `SessionStore` 调用链整体改为 Promise。索引器按 Session 批量事务写入，避免逐消息网络往返。Electron IPC 在返回 Renderer 前等待对应查询；后台刷新继续按批次让出事件循环。

独立 MCP 不再读取数据库文件。它从权限受限的连接信息文件或环境变量读取 URL，使用只读 PostgreSQL 连接池查询。写操作仍经过明确的 MCP 工具和数据库权限约束。

## 本地 PostgreSQL 生命周期

正式安装包包含当前平台的 PostgreSQL 运行时。应用数据目录包含：

- PostgreSQL data directory
- 随机生成的本机数据库凭据
- 当前端口和连接信息
- 迁移与旧库导入状态

启动流程：

1. 若提供 `AGENT_RECALL_DATABASE_URL`，连接外部 PostgreSQL，不启动本地实例。
2. 否则初始化或复用持久本地集群，只监听 loopback。
3. 启动 PostgreSQL并等待 readiness。
4. 创建 AgentRecall 数据库，执行 schema migration。
5. 启动索引、Automation、MCP bridge 和 UI；Session 从原始 Agent 会话全量重建。

退出时关闭连接池并有序停止本地实例。崩溃后下次启动通过 `pg_ctl` 状态和数据目录锁恢复，不删除数据。

密码和连接 URL 不写日志，连接错误需要脱敏。本地凭据文件使用仅当前用户可读权限。外部数据库 URL 只存系统配置，不出现在 Renderer。

## 错误处理

- PostgreSQL 未就绪时显示明确的启动状态，不启动依赖数据的后台任务。
- schema migration 失败时停止启动并保留数据库，不尝试跳过版本。
- 单个 Session 索引失败时记录脱敏错误，其他数据继续索引；后续刷新可以重试。
- 搜索索引重建失败不删除旧 Turn；成功写入新 derivation 后再切换版本。
- 外部 PostgreSQL 断开时连接池负责短暂重连，持续失败则进入只读错误页，不回退到另一套隐藏数据库。

## 测试

- Repository 单测使用临时 PGlite，仅验证 PostgreSQL SQL 和领域行为，不访问真实用户数据。
- PostgreSQL 集成测试使用临时 HOME、临时数据目录和随机端口启动打包运行时，结束后停止进程并删除临时文件。
- 搜索测试覆盖中文、英文、AND、短语、多个 Turn 命中同一 Session、分页总数和最佳 Turn 定位。
- Turn 推导测试覆盖 Codex、Claude Code、Subagent、无 User 事件、压缩、错误和中断。
- Eval 测试覆盖 Session、Turn、Span 三层目标及删除级联。
- MCP 测试通过临时 PostgreSQL URL 运行，不读取真实连接信息。
- package smoke 先构建 tarball，安装到临时 npm prefix，启动临时数据库并验证 CLI，最后停止所有子进程。
- macOS 与 Windows 的路径、可执行文件名、权限和进程停止逻辑分别断言。

## 交付顺序

1. PostgreSQL runtime、连接池、迁移框架和测试基础设施。
2. Session/Turn/Message/Span schema、导入和搜索。
3. Skills、Environment、Metadata、Sync 与 MCP。
4. Automation、MCP Registry、Workflow 和 Eval。
5. Team Chat 统一连接与 PGlite 导入。
6. 首次启动、全量索引、数据库状态和故障恢复。
7. 删除正式 SQLite/PGlite 路径，运行完整测试、构建、发布说明和隐私扫描。

每一步都必须产生可运行、可测试的状态。旧内部数据库不会被新版本读取或删除。
