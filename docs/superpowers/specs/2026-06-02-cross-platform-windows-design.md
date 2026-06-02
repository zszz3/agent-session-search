# 多端兼容(macOS + Windows)设计文档

日期:2026-06-02
状态:已确认(待 spec 复核)
分支:`feat/cross-platform-windows`

## 目标

让 Agent-Session-Search 在 macOS 和 Windows 上都完整可用,包括一键「在终端中恢复」。搜索 / 索引 / UI 引擎本就是跨平台的;本次工作补齐 Windows 上缺失的 OS 集成实现,并把所有平台相关逻辑收敛到单一边界,使未来新增功能很少需要按平台分别改动。

范围之外(YAGNI):

- Windows 安装包 / `electron-builder` 打包。
- Windows 上的实时终端聚焦(`session-activity.ts` 保持存根)。
- Linux 完整适配(Linux 只需不崩,走兜底)。
- Windows 的 `%APPDATA%\Claude` 桌面端会话源(可选源;目前因文件不存在而优雅缺省)。

## 指导原则:单一平台边界

所有 OS 集成都只走**一个模块**(`src/core/platform.ts`)。模块内部,每个涉及 OS 的操作都是一个函数,函数体内按 `darwin / win32 / linux` 分支。业务代码(`main/index.ts`、`App.tsx`、`indexer.ts`)只调用平台无关的函数名,**不得**为这些操作写 `process.platform` 判断。

对未来新功能的影响:

- 不碰 OS 的功能 → **零** Windows 工作。
- 碰到下面五类 OS 集成点之一的功能 → 改动只发生在 `platform.ts` 里**那一个函数**(加 / 改一个分支);macOS 与业务代码不动,且因为入口唯一,不会遗漏。

五类 OS 集成点:

1. 启动外部进程(终端、原生 App)。
2. OS 特定路径(如 macOS 的 `Library/Application Support`)。
3. 全局快捷键默认值。
4. 托盘 / 菜单 / 窗口外壳。
5. 在 OS 文件管理器中定位文件。

这是「收敛」而非「新增抽象层」:把现有散落的 `process.platform` 判断(目前在 `main/index.ts` 约 4 处、`App.tsx` 等)向这个边界归拢——仅限上述五类。与 `BrowserWindow` 构造强绑定的窗口外壳判断可以留在 `main/index.ts`,但作为唯一被允许的例外加以说明。

## 组件改动

### 1. 终端恢复 —— `src/core/platform.ts`(主)

平台化的**命令构造**,把引号 / 拼接规则抽到一处:

- macOS / Linux:不变 —— POSIX 形式 `cd '<path>' && <bin> --resume <id>`(沿用现有 `shellQuote`)。
- Windows:用 Windows 引号(双引号);工作目录通过终端自身的「起始目录」参数传入,而不是把 `cd` 拼进命令,以避免跨 shell 的 `cd` 拼接差异。

给 `openResumeInTerminal` 增加 `process.platform === "win32"` 分支,用所选 Windows 终端启动恢复命令:

- **Windows Terminal**:`wt.exe -d "<projectPath>" <shell> -NoExit -Command "<resume>"`(用 `-d` 指定起始目录)。
- **PowerShell**:优先 `pwsh.exe`,回退 `powershell.exe`;`<pwsh> -NoExit -Command "<resume>"`,以项目目录作为 `cwd` 启动。
- **cmd**:`cmd.exe /K "<resume>"`,以项目目录作为 `cwd` 启动。

所选终端不可用时的探测顺序:`wt → pwsh → powershell → cmd`,全部失败则抛出可见错误。

恢复命令本身(二进制 + `--resume <id>` + 跳过权限的标志)各平台一致;仅外层 shell 调用方式和目录处理不同。

### 2. 平台感知的终端设置 —— `src/core/platform.ts` + `src/renderer/src/App.tsx`

- `AppSettings["defaultTerminal"]` 联合类型新增 `"WindowsTerminal" | "PowerShell" | "Cmd"`。
- `App.tsx` 里的 `DEFAULT_TERMINAL_OPTIONS` 按渲染端平台过滤:macOS 用户看到五个 macOS 终端;Windows 用户看到三个 Windows 终端。
- 新增 `normalizeTerminal(setting, platform)`:若存储值不属于当前平台(例如配置在机器间拷贝),回退到该平台默认值(macOS 为 `Terminal`,Windows 为 `WindowsTerminal`)。渲染端需要知道平台:通过现有 preload 桥接暴露(如 `window.sessionSearch.platform` 或一个小的 `getPlatform` IPC),而非嗅探 user agent。

### 3. 按平台的全局快捷键 —— `src/core/shortcuts.ts`

- `DEFAULT_GLOBAL_SHORTCUT` 改为按平台推导:macOS 为 `Alt+Space`(即 Option+Space);Windows 为 `Ctrl+Alt+Space`,因为 `Alt+Space` 被 Windows 系统菜单占用,注册会失败。
- 选项 label 按平台显示:macOS 显示「Option」,Windows 显示「Alt」。
- 保留现有的注册失败提示逻辑。

### 4. 收尾 / 低优先级

- **托盘图标**(`main/index.ts`):`setTemplateImage(true)` 只对 macOS 有效;Windows 保留现有内联 SVG(显示可接受)。暂不引入 `.ico`。
- **Claude 桌面端会话**:暂不加入 Windows 的 `%APPDATA%\Claude`;CLI 的 `~/.claude` 和 `~/.codex` 在 Windows 上已可通过 `os.homedir()` 解析。

## 数据流

不变。会话从 home 点目录读取(跨平台),索引进 `app.getPath("userData")` 下的 SQLite 存储(跨平台),再搜索。只有**恢复**动作和**设置默认值**按 OS 不同,二者都在 `platform.ts` 之后。

## 错误处理

- 终端启动失败抛出清晰的、面向用户的错误信息(与现有 `runProcess` 把 stderr/stdout 透出的拒绝逻辑一致)。Windows 上所选终端不可用时,先走探测 + 回退链,再报错。
- 全局快捷键注册失败复用现有通知路径。

## 测试

- `src/core/platform.test.ts`:增加 `win32` 用例。给定 `process.platform = "win32"`(或注入 platform 参数)与各终端选择,断言生成的命令字符串 / argv 正确。这些是纯函数断言,不真正起进程,与现有测试风格一致。
- 为 `normalizeTerminal` 增加单测(跨平台回退)。
- 为 `shortcuts` 增加按平台默认值的测试。
- `npm test` 和 `npm run typecheck` 必须通过。

## 涉及文件

- `src/core/platform.ts` —— 主(Windows 恢复、命令构造、`normalizeTerminal`、终端选项元数据)。
- `src/core/shortcuts.ts` —— 按平台默认值 + label。
- `src/renderer/src/App.tsx` —— 按平台过滤终端选项。
- `src/preload/index.ts` + `src/renderer/src/global.d.ts` —— 向渲染端暴露平台(若尚不可用)。
- `src/main/index.ts` —— 小改:消费按平台的快捷键默认值;把 OS 集成的 `process.platform` 判断向边界做少量归拢。
- 测试:`platform.test.ts`、`shortcuts` 测试。
