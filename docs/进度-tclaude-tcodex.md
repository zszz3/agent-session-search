# 进度：支持 tclaude / tcodex CLI（CodeBuddy IDE 本次不做）

时间戳：2026-06-30
分支：feat/tclaude-tcodex
状态：**已完成 tclaude/tcodex，typecheck + 570 测试全绿，真实数据验证通过。CodeBuddy IDE 本次按决定不做。**

## 背景调研结论

- `~/.tclaude` 与 `~/.claude` 布局**字节级一致**（`projects/<encoded-cwd>/<uuid>.jsonl`、可选 `sessions/*.json`）。`tclaude` 是 Claude Code 的 fork。
- `~/.tcodex` 与 `~/.codex` 布局一致（`sessions/YYYY/MM/DD/rollout-*.jsonl`，session_meta 行）。`tcodex` 是 Codex 的 fork。
- 因此 tclaude/tcodex 复用现有 claude/codex 的 loader、adapter、resume 逻辑，仅换路径根 + 二进制 + 独立 session key 前缀（`tclaude:` / `tcodex:`）。
- CodeBuddy IDE 会话格式与 CLI 完全不同（`CodeBuddyExtension/Data/<userId>/CodeBuddyIDE/<userId>/history/<hash>/<convId>/{index.json, messages/*.json}`，message 文件含嵌套 stringified payload），需要全新 loader，只读、无 resume。**本次用户决定不做**，相关代码已全部回退。

## 默认行为（已实现）

- tclaude / tcodex 均为**可选源，默认关闭**（与 CodeBuddy CLI / Trae 一致），在 Settings -> Optional sources 开启。
- tclaude/tcodex 支持 Resume + 一键启动（分别调用 `tclaude` / `tcodex`，命令风格沿用 claude/codex）+ live 进程聚焦（resume 启动的会话）。

## 已完成改动（layer）

- [x] types.ts：SessionSource 增 `tclaude-cli`/`tcodex-cli`；LiveSessionFamily 增 `tclaude`/`tcodex`。
- [x] session-loader.ts：claude/codex 行构建器按 source 派生 keyPrefix；aggregator 接 `includeTclaude`/`includeTcodex`（读 `~/.tclaude`、`~/.tcodex`）；SessionLoadOptions 增对应 flag + 目录常量。
- [x] format-adapters.ts：getFormatForSource 把 `tclaude-cli` 归到 claude（`tcodex-cli` 走 codex 默认分支）。
- [x] platform.ts：AppSettings 增 `includeTclaude`/`includeTcodex` + `tclaudeBinary`/`tcodexBinary`（默认 "tclaude"/"tcodex"）；sourceFamily/displayName/resume 分支。
- [x] session-store.ts：LIVE_SESSION_KEY_SQL 增 tclaude/tcodex 源映射。
- [x] session-activity.ts：executableFamily 识别 tclaude/tcodex；detectResumeCommand 让 tcodex 走 codex resume 语法。
- [x] format-session.ts / remote-health.ts：补来源标签 / cli 名映射。
- [x] main/index.ts：OPTIONAL_SOURCE_SETTINGS + LIVE_FAMILY_LABEL + 传参。
- [x] renderer App.tsx + session-ui.ts：开关、pending source、筛选 chip、设置面板两个 toggle。
- [x] README + docs/README.en.md。
- [x] 测试：session-loader.test（tclaude/tcodex 命名空间 + 默认关闭）、platform.test（resume 命令）、session-activity.test（live 探测）。

## 已知后续可补（非阻塞）

- tclaude/tcodex 的"全新未 resume"进程（plain 命令，没带 --resume）的 live 探测：需要新增 lsof 映射 + `.tclaude`/`.tcodex` 路径正则，目前只覆盖了 resume 启动的会话（本 app 启动方式）。
- tclaude/tcodex 的额度统计、跨 Agent 迁移目标、远程 SSH 同步未接（与其它可选源一致，后续按需补）。
- CodeBuddy IDE 只读支持（loader 调研已完成，格式见上）。
