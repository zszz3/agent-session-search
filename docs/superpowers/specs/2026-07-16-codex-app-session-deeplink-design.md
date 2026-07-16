# Codex App 会话直达设计

## 目标与范围

- 本地 `codex-app` 会话从 AgentRecall 的 Resume 入口直接打开 Codex App 中对应的会话。
- `codex-cli` 及其他 CLI 来源继续使用现有终端 Resume 行为。
- 本次不为 `claude-app` 或其他原生 App 来源增加会话级深链。
- 远程 SSH 会话不打开本机 Codex App。

## 方案比较

- 采用：对 `codex-app` 的 UUID 会话 ID 生成 `codex://threads/<id>` 深链，通过系统 URL handler 打开。它能定位到准确会话，且前后台 Codex App 都能接收。
- 备选：只运行 `codex app <workspace>`。这是官方公开的稳定 CLI 入口，但只能打开工作区，不能定位到具体会话。
- 不采用：直接操作 Codex App 的本地数据库或内部 IPC。该方案耦合私有存储格式，升级风险和数据安全风险更高。

## 路由与交互

1. Resume 路由优先识别本地 `codex-app` 来源，返回 App 路由；不会把它误判为终端中的活跃 Codex 会话。
2. 主进程验证 `rawId` 是 UUID，再构造 `codex://threads/<encoded-id>` 并交给 Electron 的外部 URL 打开能力。
3. 详情页 Resume、右键 Resume、现有 Open App 动作和键盘 Resume 统一走同一条路由。
4. `codex-app` 的操作文案显示“在 Codex 中打开”；成功提示显示已打开 Codex 会话。
5. `codex-cli` 的按钮、快捷键、终端聚焦和 Resume 命令保持不变。

## 错误处理与兼容性

- 非 UUID 的 `codex-app` 会话拒绝生成深链并显示可读错误，不把未校验文本拼入 URL。
- 系统未注册 `codex://` 或 Codex App 启动失败时，错误返回现有操作状态区域；不静默改走 CLI Resume。
- macOS 和 Windows 均通过 Electron URL handler 打开深链；Linux 保持不支持原生 App 直达。
- 通用“打开原生应用”逻辑继续服务 Claude、Codex CLI 和 CodeBuddy，不改变其现状。

## 验证

- 路由测试覆盖本地 `codex-app`、远程 `codex-app`、`codex-cli` 活跃会话和普通 CLI Resume。
- 深链测试覆盖合法 UUID、非法 ID、URL 打开失败以及不受支持的平台。
- Renderer 测试覆盖详情页、右键菜单和快捷键的 App 路由文案与调用。
