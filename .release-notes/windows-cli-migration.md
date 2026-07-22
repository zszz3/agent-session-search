# Windows 会话迁移 CLI 检查修复

## Bug 修复

- 修复 Windows 下通过 npm 安装 Claude Code 或 Codex CLI 后，即使可以在 PowerShell 中正常执行，迁移会话时仍被误报为“CLI 未找到”并无法继续的问题。
- 迁移前现在可以正确检查 Claude Code 和 Codex CLI 的版本；只有 CLI 确实未安装时，才会提示对应的 CLI 未找到。
