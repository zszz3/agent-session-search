# Extended CLI Session Migration Design

## 目标

在现有 Claude Code、Codex、CodeBuddy 三目标会话迁移基础上，增加以下本地 CLI 环境：

- TClaude
- TCodex
- Claude Code Internal
- Codex Internal

四种环境既可作为迁移源，也可作为迁移目标。桌面 UI 与 MCP `migrate_session` 共用同一套目标解析、Settings 门控、写入、校验、索引和启动逻辑。远程会话恢复保持现有 Claude、Codex、CodeBuddy 三目标，不扩展本机专用环境。

## 已验证的本机环境

设计基于 2026-07-10 的本机只读检查：

| 环境 | CLI / 版本 | 会话根目录 | Resume 能力 |
| --- | --- | --- | --- |
| TClaude | `@tencent/tclaude 0.0.9`，上游 Claude Code `2.1.154` | `~/.tclaude/projects` | wrapper 将 `--resume` 转发给 Claude Code |
| TCodex | `@tencent/tcodex 0.0.13`，上游 Codex `0.142.4` | `~/.tcodex/sessions` | wrapper 将 `resume` 转发给 Codex |
| Claude Code Internal | `claude-internal 1.1.9`，上游 Claude Code `2.1.154` | `~/.claude-internal/projects` | `claude-internal --resume <id>` |
| Codex Internal | 普通 Codex `0.144.1` 配合独立 `CODEX_HOME` | `~/.codex-internal/sessions` | `CODEX_HOME=~/.codex-internal codex resume <id>` |

这些目录中已有可被当前 Loader 读取的真实 JSONL：TClaude 与 Claude Code Internal 使用 Claude 格式，TCodex 与 Codex Internal 使用 Codex 格式。

## 范围

### 包含

- 四种新环境作为迁移源与迁移目标。
- Settings 开关控制可选迁移目标是否出现。
- UI、IPC、主进程和 MCP 支持七种迁移目标。
- 目标专属 CLI 预检、写入目录、回读来源、增量索引和 Resume 命令。
- `Claude Extra` / `Codex Extra` 统一改名为 `Claude Code Internal` / `Codex Internal`。
- 本地迁移记录保存具体目标环境。
- macOS、Windows PowerShell 与 cmd 的目标启动命令。

### 不包含

- SSH 远程环境直接迁移。
- 远程会话恢复到 TClaude、TCodex 或 Internal 环境。
- 自动安装、升级或登录目标 CLI。
- 实际启动交互会话或调用模型的自动化 smoke test。
- 为可选 CLI 新增单独的设置页面或账号管理。

## 核心建模

当前 `MigrationAgent` 同时承担“原生文件格式族”和“运行目标”两个职责。新增环境后必须拆开这两个维度。

保留三种可移植格式族：

```ts
export type MigrationAgent = "claude" | "codex" | "codebuddy";
```

新增实际运行目标：

```ts
export type MigrationTarget =
  | "claude"
  | "codex"
  | "codebuddy"
  | "tclaude"
  | "tcodex"
  | "claude-internal"
  | "codex-internal";
```

`PortableSession.sourceAgent`、远程 portable JSON 的 `sourceAgent` 继续使用 `MigrationAgent`，保持现有远程数据兼容。下列本地流程字段改用 `MigrationTarget`：

- `SessionMigrationProgress.target`
- `SessionMigrationResult.target`
- `SessionMigrationRecord.targetAgent`
- `migrateSession(...).target`
- IPC / preload 的迁移目标参数
- MCP `migrate_session.target`

SQLite `session_migrations.target_agent` 已是无约束 `TEXT`，无需数据库迁移；读取类型扩展为 `MigrationTarget`。

## 目标注册表

建立单一、纯数据的目标注册表，避免 UI、writer、platform 和 MCP 各自维护分支列表。注册表至少描述：

```ts
type OptionalMigrationTargetSetting =
  | "includeTclaude"
  | "includeTcodex"
  | "includeClaudeInternal"
  | "includeCodexInternal";

interface MigrationTargetDescriptor {
  id: MigrationTarget;
  label: string;
  family: MigrationAgent;
  source: SessionSource;
  enabledSetting: null | OptionalMigrationTargetSetting;
}
```

目标矩阵：

| Target | Label | Family | Indexed source | Settings gate |
| --- | --- | --- | --- | --- |
| `claude` | Claude Code | `claude` | `claude-cli` | 始终可用 |
| `codex` | Codex | `codex` | `codex-cli` | 始终可用 |
| `codebuddy` | CodeBuddy | `codebuddy` | `codebuddy-cli` | 保持现状，始终作为迁移目标 |
| `tclaude` | TClaude | `claude` | `tclaude-cli` | `includeTclaude` |
| `tcodex` | TCodex | `codex` | `tcodex-cli` | `includeTcodex` |
| `claude-internal` | Claude Code Internal | `claude` | `claude-internal` | `includeClaudeInternal` |
| `codex-internal` | Codex Internal | `codex` | `codex-internal` | `includeCodexInternal` |

注册表及其 Settings key union 放在 renderer 可安全导入的核心模块中，不导入 `AppSettings` 或 `node:*`。目标的二进制、目录和环境变量由 platform/writer 根据 descriptor 的 `id` / `family` 解析。

## 来源支持与 Settings 门控

`migrationAgentForSource` 增加：

```text
tclaude-cli -> claude
tcodex-cli  -> codex
```

`claude-internal`、`codex-internal` 继续映射到已有 family。由此以下本地来源都可迁移：

- `claude-cli`、`claude-app`、`claude-internal`、`tclaude-cli`
- `codex-cli`、`codex-app`、`codex-internal`、`tcodex-cli`
- `codebuddy-cli`

`enabledMigrationTargets(settings)` 返回三个基础目标加已开启的可选目标。UI 只渲染该列表，不渲染灰色占位按钮。主进程和 MCP 在写文件前重新调用同一门控函数，防止 Settings 在弹窗打开后变化或调用方绕过 UI。

关闭可选来源开关后：

- 对应来源停止索引，保持当前行为。
- 对应迁移目标按钮立即消失。
- IPC / MCP 直接指定该目标时返回 `<Target> migration target is disabled in Settings.`。

Settings 的四个开关副标题改为同时说明“索引来源并启用迁移目标”。不增加新的开关。TClaude/TCodex 继续使用现有 `tclaudeBinary` / `tcodexBinary` 设置值；新增 `claudeInternalBinary`，默认 `claude-internal`。Codex Internal 复用 `codexBinary` 并注入独立 `CODEX_HOME`。

## 写入、校验与增量索引

serializer 只由 `family` 决定：

- `claude` family 使用现有 Claude JSONL serializer。
- `codex` family 使用现有 Codex JSONL serializer。
- `codebuddy` family 使用现有 CodeBuddy JSONL serializer。

最终路径由具体 target 决定：

| Target | 输出路径 |
| --- | --- |
| `claude` | `~/.claude/projects/<encoded-project>/<id>.jsonl` |
| `tclaude` | `~/.tclaude/projects/<encoded-project>/<id>.jsonl` |
| `claude-internal` | `~/.claude-internal/projects/<encoded-project>/<id>.jsonl` |
| `codex` | `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl` |
| `tcodex` | `~/.tcodex/sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl` |
| `codex-internal` | `~/.codex-internal/sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl` |
| `codebuddy` | `~/.codebuddy/projects/<encoded-project>/<id>.jsonl` |

临时文件仍在最终目录同级创建，使用 `wx`、`0600`、fsync、结构校验、Loader 回读和原子 rename。Loader 回读及增量索引必须使用 descriptor 中的具体 `source`，避免把 TClaude 新文件错误索引为普通 Claude。

`indexMigratedSessionFile(target, filePath)` 根据 target registry 选择：

- Claude family：`loadClaudeCliSessionFile`，传入具体 `SessionSource`。
- Codex family：`loadCodexSessionFile`，传入具体 `SessionSource`。
- CodeBuddy：现有 Loader。

## CLI 预检

现有逻辑只解析 `--version` 输出中的第一个版本号。wrapper 输出包含 wrapper 和上游两个版本，因此改为目标专属解析：

| Target | 必须识别的版本行 | 支持基线 |
| --- | --- | --- |
| `claude` | Claude Code | 保持 `2.1.186` |
| `codex` | Codex | 保持 `0.141.0` |
| `codebuddy` | CodeBuddy | 保持 `2.109.1` |
| `tclaude` | `@tencent/tclaude` + `@anthropic-ai/claude-code` | wrapper `0.0.9`，upstream `2.1.154` |
| `tcodex` | `@tencent/tcodex` + `@openai/codex` | wrapper `0.0.13`，upstream `0.142.4` |
| `claude-internal` | `claude-internal` + `claude` | wrapper `1.1.9`，upstream `2.1.154` |
| `codex-internal` | Codex，且设置独立 `CODEX_HOME` | Codex `0.141.0` |

基线是本机只读验证通过的已知组合。错误信息明确指出 target、binary、实际版本和要求版本。预检 runner 支持可选环境变量，以验证 Codex Internal 时只对该子进程设置 `CODEX_HOME`。

## Resume 命令与打开方式

| Target | Process spec |
| --- | --- |
| `claude` | `claude --resume <id>` |
| `tclaude` | `tclaude --resume <id>` |
| `claude-internal` | `claude-internal --resume <id>` |
| `codex` | `codex resume <id>` |
| `tcodex` | `tcodex resume <id>` |
| `codex-internal` | `CODEX_HOME=<absolute ~/.codex-internal> codex resume <id>` |
| `codebuddy` | `codebuddy --resume <id>` |

Codex Internal 的环境变量只附着在目标命令上：

- POSIX：`cd <project> && CODEX_HOME=<path> codex resume <id>`
- PowerShell：在 `try/finally` 中临时设置 `$env:CODEX_HOME`，Codex 退出后恢复原值或删除该环境变量。
- cmd：使用 `setlocal` 临时设置 `CODEX_HOME`，Codex 退出后执行 `endlocal`。

终端启动继续复用 Terminal、iTerm、Ghostty、WezTerm、Warp 和 Windows 终端分支。display/fallback command 必须由同一 process spec 生成，不能在主进程另写三元表达式退化为基础目标；Codex Internal 命令结束后不得改变该终端后续命令使用的 `CODEX_HOME`。

## UI

`SessionMigrationDialog` 接收当前 `AppSettings` 或预计算后的 `MigrationTarget[]`。按钮由 registry 顺序渲染：

```text
Claude Code, Codex, CodeBuddy,
TClaude?, TCodex?, Claude Code Internal?, Codex Internal?
```

问号目标只在对应开关开启时出现。现有同目标迁移行为保留，例如 TClaude 会话仍可迁移为新的 TClaude 会话。

所有用户可见文本统一使用 registry label：

- 来源筛选
- Settings 标题和副标题
- 迁移按钮
- 迁移进度
- 成功通知
- 自动启动失败弹窗
- MCP 错误

原 `Claude Extra` / `Codex Extra` 全部替换为 `Claude Code Internal` / `Codex Internal`。

## IPC 与 MCP

IPC/preload 的目标参数与进度/结果改用 `MigrationTarget`。主进程在执行迁移前按当前 Settings 校验 target。

MCP `migrate_session` schema 接受：

```text
claude | codex | codebuddy | tclaude | tcodex |
claude-internal | codex-internal
```

示例：

```json
{
  "sessionKey": "tclaude:517015a8-eb5c-41e6-b1f7-e8c54efbef53",
  "target": "codex-internal"
}
```

MCP 通过 `readMcpAppSettings()` 获取与桌面应用一致的开关和 binary 设置。它调用与 UI 相同的 `migrateSession`、writer、indexer 和 platform helpers。MCP bundle 在实现后重新生成并通过现有 bundle-loading 测试。

远程恢复的 `RESTORE_TARGETS` 继续使用 `MigrationAgent[]`，不接受 `MigrationTarget` 扩展值。

## 数据兼容性

- 远程 portable JSON 不变。
- Supabase schema 与远程来源过滤不变。
- 旧迁移记录的 `target_agent` 值仍是新 union 的合法子集。
- 新记录可以保存具体 target；SQLite 无需 ALTER TABLE。
- 现有 Claude/Codex/CodeBuddy 文件路径、序列化结果和启动命令保持不变。

## 失败语义

1. 非本地来源、无项目路径、不支持来源、未知 target 或 disabled target：任何写入前拒绝。
2. CLI 缺失、版本输出为空/不可解析、wrapper/upstream 版本低于基线：任何写入前拒绝。
3. 临时写入、原生结构校验或目标 Loader 回读失败：删除临时文件，不记录、不索引、不启动。
4. 最终文件写入后，迁移记录失败：保留文件，追加 warning，继续索引和启动。
5. 增量索引失败：保留文件，`indexed=false`，追加 warning，继续启动。
6. CLI 启动失败：保留文件，`launched=false`，返回目标专属可复制命令。
7. Settings 在弹窗打开后被关闭：主进程重新校验并拒绝，不依赖 UI 快照。

## 测试策略

### 领域与 Settings

- target registry 的 7 个 id、label、family、source 与 gate 完整且唯一。
- 所有 Claude/Codex/TClaude/TCodex/Internal/CodeBuddy 来源映射到正确 family。
- 四个开关的所有组合只产生预期目标。
- UI 与主进程对 disabled target 使用同一判断。

### Writer 与 Loader

- 7 个目标逐一验证最终目录。
- 三个 Claude family 目标序列化结果等价并由具体 Claude source 回读。
- 三个 Codex family 目标序列化结果等价并由具体 Codex source 回读。
- CodeBuddy 保持原测试。
- 每个新目标覆盖 Unicode 标题、时间戳、父链、权限、原子 rename 和失败清理。

### 编排矩阵

- 所有受支持来源均可迁移到 7 个目标。
- 每个目标验证 `inspect -> prepare -> write -> record -> index -> launch` 顺序。
- disabled、unknown、remote、无路径、CLI 缺失、write/index/launch 失败语义。
- 长会话压缩策略与 target 无关，复用已有 complete / ai-compressed / locally-truncated 测试。

### Platform

- 多行 wrapper/upstream 版本解析及每项目标基线。
- 7 个目标的 binary、args、environment。
- POSIX、PowerShell、cmd 的 cwd、引号与 `CODEX_HOME` 隔离。
- Terminal、iTerm、Ghostty、WezTerm、Warp 启动路径不回归。

### UI / IPC / MCP

- Settings 开关打开后按钮出现，关闭后消失。
- Internal 命名在筛选、设置和迁移 UI 中一致。
- preload / IPC 传递具体 target。
- MCP schema 接受 7 个目标，拒绝未知或 disabled target。
- MCP 实际迁移 TClaude source 到 Codex Internal 的参数化测试。

### 最终验证

- 本机四种环境执行只读 `--version` / `--help` 预检。
- 在临时 home 中完成四个新目标的写入和 Loader 回读 smoke test。
- 不启动真实交互会话，不调用模型，不消耗额度。
- 运行迁移相关定向测试、完整 `npm test -- --run`、`npm run typecheck` 和 `npm run build`。

## 验收标准

1. 四个可选开关分别控制同名迁移目标按钮与后端授权。
2. 现有及四种新增来源都可迁移到当前启用的七目标子集。
3. 每个目标写入自己的真实会话目录，并能被同来源 Loader 立即索引。
4. 每个目标使用正确 binary、resume syntax 和必要环境变量。
5. UI 和 MCP 支持相同目标与错误语义。
6. 远程恢复及现有三目标行为不回归。
7. 本机只读预检和临时目录 smoke test 通过，完整测试与构建通过。
