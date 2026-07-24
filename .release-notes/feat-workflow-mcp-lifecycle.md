# Workflow MCP 生命周期控制

## 新增功能

- 可信的本地 Agent 现在可以通过 MCP 确认、启动、查询、停止 Workflow，并处理运行中的人工介入和结构化输入；外部客户端默认保持只读。
- Workflow 节点会话现在会在主时间线中显示工具调用和结果，并明确标记结构化节点结果的提交。
- Codex、Claude Code、OpenCode、Hermes 和 OpenClaw 现在遵循一致的 Workflow MCP 权限范围；规划会话中的工具失败会直接显示调用名称、状态和原因，不再被误报为工具不存在。
- Workflow 运行结果查询现在提供安全的文件类型、大小和受限文本预览，并自动隐藏授权信息与常见密钥内容。

## Bug 修复

- 修复 Workflow Agent 偶发无法加载工作流工具、且 Codex 失败时只显示笼统错误的问题。
