# 多端兼容(macOS + Windows)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Agent-Session-Search 在 macOS 与 Windows 上都完整可用(含一键终端恢复),并把平台差异收敛到 `src/core/platform.ts` 与 `src/core/shortcuts.ts` 两个边界。

**Architecture:** 现有引擎(node:sqlite/索引/搜索/UI)已跨平台,不动。新增 Windows 的终端启动、命令构造、终端/快捷键默认值,全部以纯函数 + 单一平台分支实现;渲染端通过 preload 拿到平台名后过滤 UI 选项。

**Tech Stack:** Electron 42、TypeScript、React 19、Vitest、`node:child_process`(spawn/execFile)。

参考 spec:`docs/superpowers/specs/2026-06-02-cross-platform-windows-design.md`

---

## Task 1: 按平台的全局快捷键默认值

**Files:**
- Modify: `src/core/shortcuts.ts`
- Test: `src/core/shortcuts.test.ts`(新建)

- [ ] **Step 1: 写失败测试**

新建 `src/core/shortcuts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultGlobalShortcut, normalizeGlobalShortcut, globalShortcutOptions } from "./shortcuts";

describe("defaultGlobalShortcut", () => {
  it("uses Ctrl+Alt+Space on Windows (Alt+Space is reserved by the OS)", () => {
    expect(defaultGlobalShortcut("win32")).toBe("Ctrl+Alt+Space");
  });
  it("uses Alt+Space (Option+Space) on macOS", () => {
    expect(defaultGlobalShortcut("darwin")).toBe("Alt+Space");
  });
});

describe("normalizeGlobalShortcut", () => {
  it("falls back to the platform default for invalid values", () => {
    expect(normalizeGlobalShortcut("nonsense", "win32")).toBe("Ctrl+Alt+Space");
    expect(normalizeGlobalShortcut("nonsense", "darwin")).toBe("Alt+Space");
  });
  it("keeps a valid value", () => {
    expect(normalizeGlobalShortcut("Ctrl+Alt+Space", "darwin")).toBe("Ctrl+Alt+Space");
  });
});

describe("globalShortcutOptions", () => {
  it("labels modifiers as Alt/Ctrl on Windows", () => {
    const labels = globalShortcutOptions("win32").map((o) => o.label);
    expect(labels).toContain("Alt + Space");
    expect(labels.join(" ")).not.toContain("Option");
  });
  it("labels modifiers as Option/Command on macOS", () => {
    const labels = globalShortcutOptions("darwin").map((o) => o.label);
    expect(labels).toContain("Option + Space");
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run src/core/shortcuts.test.ts`
Expected: FAIL（`defaultGlobalShortcut`/`globalShortcutOptions` is not a function；`normalizeGlobalShortcut` 不接受第二参数）

- [ ] **Step 3: 实现**

把 `src/core/shortcuts.ts` 改为:

```ts
export const GLOBAL_SHORTCUT_OPTIONS = [
  { label: "Option + Space", value: "Alt+Space" },
  { label: "Control + Option + Space", value: "Ctrl+Alt+Space" },
  { label: "Command + Option + Space", value: "CommandOrControl+Alt+Space" },
  { label: "Disabled", value: "" },
] as const;

export type GlobalShortcut = (typeof GLOBAL_SHORTCUT_OPTIONS)[number]["value"];

const GLOBAL_SHORTCUT_VALUES = new Set<string>(GLOBAL_SHORTCUT_OPTIONS.map((option) => option.value));

export function defaultGlobalShortcut(platform: NodeJS.Platform = process.platform): GlobalShortcut {
  return platform === "win32" ? "Ctrl+Alt+Space" : "Alt+Space";
}

export const DEFAULT_GLOBAL_SHORTCUT: GlobalShortcut = defaultGlobalShortcut();

export function normalizeGlobalShortcut(value: unknown, platform: NodeJS.Platform = process.platform): GlobalShortcut {
  return typeof value === "string" && GLOBAL_SHORTCUT_VALUES.has(value)
    ? (value as GlobalShortcut)
    : defaultGlobalShortcut(platform);
}

// On Windows, Electron accelerators use Alt/Control; macOS shows Option/Command.
function relabelForPlatform(label: string, platform: NodeJS.Platform): string {
  if (platform !== "win32") return label;
  return label.replace(/Option/g, "Alt").replace(/Command/g, "Ctrl").replace(/Control/g, "Ctrl");
}

export function globalShortcutOptions(
  platform: NodeJS.Platform = process.platform,
): Array<{ label: string; value: GlobalShortcut }> {
  return GLOBAL_SHORTCUT_OPTIONS.map((option) => ({
    label: relabelForPlatform(option.label, platform),
    value: option.value,
  }));
}

export function globalShortcutLabel(value: string, platform: NodeJS.Platform = process.platform): string {
  const found = globalShortcutOptions(platform).find((option) => option.value === value);
  return found?.label ?? relabelForPlatform("Option + Space", platform);
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run src/core/shortcuts.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/shortcuts.ts src/core/shortcuts.test.ts
git commit -m "feat: per-platform global shortcut default and labels"
```

---

## Task 2: 平台感知的终端选项与归一化

**Files:**
- Modify: `src/core/platform.ts:6-26`（`AppSettings` 与 `defaultSettings`）
- Test: `src/core/platform.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/core/platform.test.ts` 末尾追加:

```ts
import { defaultTerminalFor, terminalOptionsFor, normalizeTerminal } from "./platform";

describe("terminal options per platform", () => {
  it("returns Windows terminals on win32", () => {
    expect(terminalOptionsFor("win32")).toEqual(["WindowsTerminal", "PowerShell", "Cmd"]);
  });
  it("returns macOS terminals elsewhere", () => {
    expect(terminalOptionsFor("darwin")).toEqual(["Terminal", "iTerm", "Ghostty", "WezTerm", "Warp"]);
  });
  it("defaults to WindowsTerminal on win32 and Terminal on macOS", () => {
    expect(defaultTerminalFor("win32")).toBe("WindowsTerminal");
    expect(defaultTerminalFor("darwin")).toBe("Terminal");
  });
  it("normalizes a cross-platform value to the platform default", () => {
    expect(normalizeTerminal("Terminal", "win32")).toBe("WindowsTerminal");
    expect(normalizeTerminal("Cmd", "darwin")).toBe("Terminal");
    expect(normalizeTerminal("PowerShell", "win32")).toBe("PowerShell");
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run src/core/platform.test.ts`
Expected: FAIL（导入的三个函数未定义）

- [ ] **Step 3: 实现**

在 `src/core/platform.ts` 顶部 `AppSettings` 接口里把 `defaultTerminal` 改成:

```ts
  defaultTerminal: "Terminal" | "iTerm" | "Ghostty" | "WezTerm" | "Warp" | "WindowsTerminal" | "PowerShell" | "Cmd";
```

在 `ITERM_APPLICATION_NAMES` 常量附近新增:

```ts
export type TerminalChoice = AppSettings["defaultTerminal"];

const MAC_TERMINALS: TerminalChoice[] = ["Terminal", "iTerm", "Ghostty", "WezTerm", "Warp"];
const WINDOWS_TERMINALS: TerminalChoice[] = ["WindowsTerminal", "PowerShell", "Cmd"];

export function terminalOptionsFor(platform: NodeJS.Platform = process.platform): TerminalChoice[] {
  return platform === "win32" ? [...WINDOWS_TERMINALS] : [...MAC_TERMINALS];
}

export function defaultTerminalFor(platform: NodeJS.Platform = process.platform): TerminalChoice {
  return platform === "win32" ? "WindowsTerminal" : "Terminal";
}

export function normalizeTerminal(value: unknown, platform: NodeJS.Platform = process.platform): TerminalChoice {
  const options = terminalOptionsFor(platform);
  return options.includes(value as TerminalChoice) ? (value as TerminalChoice) : defaultTerminalFor(platform);
}
```

把 `defaultSettings.defaultTerminal` 改为使用默认函数:

```ts
  defaultTerminal: defaultTerminalFor(),
```

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run src/core/platform.test.ts`
Expected: PASS（含原有用例）

- [ ] **Step 5: 提交**

```bash
git add src/core/platform.ts src/core/platform.test.ts
git commit -m "feat: platform-aware terminal options and normalization"
```

---

## Task 3: 平台感知的恢复命令构造

**Files:**
- Modify: `src/core/platform.ts`（`getResumeCommand` 与新增引号/拼接辅助）
- Test: `src/core/platform.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/core/platform.test.ts` 的 `describe("resume commands", ...)` 内追加:

```ts
  it("builds a cmd-compatible cd prefix on Windows", () => {
    const session = {
      source: "claude-cli",
      rawId: "abc",
      projectPath: "C:\\my repo",
    } as SessionSearchResult;

    expect(getResumeCommand(session, defaultSettings, { platform: "win32" })).toBe(
      'cd /d "C:\\my repo" && claude --resume abc',
    );
  });

  it("omits the cd prefix when withCwd is false", () => {
    const session = {
      source: "claude-cli",
      rawId: "abc",
      projectPath: "C:\\my repo",
    } as SessionSearchResult;

    expect(getResumeCommand(session, defaultSettings, { platform: "win32", withCwd: false })).toBe(
      "claude --resume abc",
    );
  });
```

并在该测试文件顶部的 import 中加入 `defaultSettings`:

```ts
import { getResumeCommand, resolveMacApplicationName, defaultSettings } from "./platform";
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run src/core/platform.test.ts`
Expected: FAIL（`getResumeCommand` 不识别 `platform` 选项,Windows 路径仍走 POSIX 引号）

- [ ] **Step 3: 实现**

把 `getResumeCommand` 的签名与 cd 拼接改为平台感知。将现有函数替换为:

```ts
export function getResumeCommand(
  session: SessionSearchResult,
  settings: AppSettings = defaultSettings,
  opts: { withCwd?: boolean; skipPermissions?: boolean; platform?: NodeJS.Platform } = {},
): string {
  const { withCwd = true, skipPermissions = false, platform = process.platform } = opts;
  let cmd: string;
  const family = sourceFamily(session.source);
  if (family === "claude") {
    cmd = `${settings.claudeBinary} --resume ${session.rawId}`;
    if (skipPermissions) cmd += " --dangerously-skip-permissions";
  } else if (family === "codebuddy") {
    cmd = `${settings.codeBuddyBinary} --resume ${session.rawId}`;
  } else {
    cmd = `${settings.codexBinary} resume ${session.rawId}`;
    if (skipPermissions) cmd += " --dangerously-bypass-approvals-and-sandbox";
  }
  if (withCwd && session.projectPath) {
    cmd =
      platform === "win32"
        ? `cd /d ${winQuote(session.projectPath)} && ${cmd}`
        : `cd ${shellQuote(session.projectPath)} && ${cmd}`;
  }
  return cmd;
}
```

在文件底部辅助函数区(`shellQuote` 旁)新增:

```ts
function winQuote(s: string): string {
  // cmd.exe quoting: wrap in double quotes, double any embedded quotes.
  return `"${s.replace(/"/g, '""')}"`;
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run src/core/platform.test.ts`
Expected: PASS（原有 macOS/CodeBuddy 用例不受影响,因为默认 platform 为运行环境 darwin）

- [ ] **Step 5: 提交**

```bash
git add src/core/platform.ts src/core/platform.test.ts
git commit -m "feat: Windows-aware resume command construction"
```

---

## Task 4: Windows 终端启动(探测+回退,纯函数可测)

**Files:**
- Modify: `src/core/platform.ts`（新增 `buildWindowsLaunchPlan`、`openResumeInWindowsTerminal`,改 `openResumeInTerminal` 与 `runProcess`）
- Test: `src/core/platform.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/core/platform.test.ts` 末尾追加:

```ts
import { buildWindowsLaunchPlan } from "./platform";

describe("buildWindowsLaunchPlan", () => {
  const cmd = "claude --resume abc";
  const cwd = "C:\\my repo";

  it("Windows Terminal first, then powershell shells, then cmd", () => {
    const plan = buildWindowsLaunchPlan("WindowsTerminal", cmd, cwd);
    expect(plan.map((p) => p.file)).toEqual(["wt.exe", "pwsh.exe", "powershell.exe", "cmd.exe"]);
    expect(plan[0].args).toEqual(["-d", cwd, "pwsh.exe", "-NoExit", "-Command", cmd]);
  });

  it("PowerShell prefers pwsh then powershell then cmd", () => {
    const plan = buildWindowsLaunchPlan("PowerShell", cmd, cwd);
    expect(plan.map((p) => p.file)).toEqual(["pwsh.exe", "powershell.exe", "cmd.exe"]);
    expect(plan[0].args).toEqual(["-NoExit", "-Command", cmd]);
    expect(plan[0].cwd).toBe(cwd);
  });

  it("Cmd uses cmd.exe /K", () => {
    const plan = buildWindowsLaunchPlan("Cmd", cmd, cwd);
    expect(plan.map((p) => p.file)).toEqual(["cmd.exe"]);
    expect(plan[0].args).toEqual(["/K", cmd]);
    expect(plan[0].cwd).toBe(cwd);
  });

  it("omits wt start-dir flag when cwd is empty", () => {
    const plan = buildWindowsLaunchPlan("WindowsTerminal", cmd, "");
    expect(plan[0].args).toEqual(["pwsh.exe", "-NoExit", "-Command", cmd]);
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run src/core/platform.test.ts`
Expected: FAIL（`buildWindowsLaunchPlan` 未定义）

- [ ] **Step 3: 实现**

在 `src/core/platform.ts` 顶部 import 增加 `spawn`:

```ts
import { execFile, spawn } from "node:child_process";
```

新增类型与纯函数(放在 `openResumeInTerminal` 之前):

```ts
interface WindowsLaunch {
  file: string;
  args: string[];
  cwd?: string;
}

// Ordered candidate launches. The caller tries each until one spawns (ENOENT → next).
export function buildWindowsLaunchPlan(terminal: TerminalChoice, command: string, cwd: string): WindowsLaunch[] {
  const wt = (): WindowsLaunch => {
    const inner = ["pwsh.exe", "-NoExit", "-Command", command];
    return { file: "wt.exe", args: cwd ? ["-d", cwd, ...inner] : inner };
  };
  const pwsh = (): WindowsLaunch => ({ file: "pwsh.exe", args: ["-NoExit", "-Command", command], cwd: cwd || undefined });
  const powershell = (): WindowsLaunch => ({ file: "powershell.exe", args: ["-NoExit", "-Command", command], cwd: cwd || undefined });
  const cmd = (): WindowsLaunch => ({ file: "cmd.exe", args: ["/K", command], cwd: cwd || undefined });

  if (terminal === "Cmd") return [cmd()];
  if (terminal === "PowerShell") return [pwsh(), powershell(), cmd()];
  // WindowsTerminal (default): wt first, then fall back through shells.
  return [wt(), pwsh(), powershell(), cmd()];
}
```

新增启动函数:

```ts
async function openResumeInWindowsTerminal(session: SessionSearchResult, settings: AppSettings): Promise<void> {
  const command = getResumeCommand(session, settings, { withCwd: false, platform: "win32" });
  const terminal = normalizeTerminal(settings.defaultTerminal, "win32");
  const plan = buildWindowsLaunchPlan(terminal, command, session.projectPath ?? "");

  let lastError: Error | null = null;
  for (const launch of plan) {
    try {
      await spawnDetached(launch.file, launch.args, launch.cwd);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      lastError = error instanceof Error ? error : new Error(String(error));
      if (code === "ENOENT") continue; // terminal not installed; try the next candidate
      throw lastError;
    }
  }
  throw new Error(`No Windows terminal could be launched. ${lastError?.message ?? ""}`.trim());
}

function spawnDetached(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
```

把 `openResumeInTerminal` 开头的非 darwin 分支替换为显式平台分支:

找到:

```ts
  if (process.platform !== "darwin") {
    await runProcess(settings.defaultTerminal === "WezTerm" ? "wezterm" : "sh", ["-lc", command]);
    return;
  }
```

替换为:

```ts
  if (process.platform === "win32") {
    await openResumeInWindowsTerminal(session, settings);
    return;
  }
  if (process.platform !== "darwin") {
    // Linux / other: best-effort POSIX shell.
    await runProcess("sh", ["-lc", command]);
    return;
  }
```

(注意:`command` 变量在函数开头已由 `getResumeCommand(session, settings, { withCwd: true })` 计算,Linux 分支沿用它;Windows 分支不使用它,改用 withCwd:false 的命令。)

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run src/core/platform.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/platform.ts src/core/platform.test.ts
git commit -m "feat: launch Windows terminal for resume with fallback chain"
```

---

## Task 5: 向渲染端暴露平台名

**Files:**
- Modify: `src/preload/index.ts`（api 增加 `platform`）

- [ ] **Step 1: 实现**

在 `src/preload/index.ts` 的 `const api = {` 第一个字段前加入:

```ts
  platform: process.platform as NodeJS.Platform,
```

(preload 运行在带 Node 的上下文,可直接读 `process.platform`;它会随 `SessionSearchApi` 类型自动暴露到 `window.sessionSearch.platform`,无需改 `global.d.ts`。)

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: 通过(无报错)

- [ ] **Step 3: 提交**

```bash
git add src/preload/index.ts
git commit -m "feat: expose process.platform to the renderer"
```

---

## Task 6: 设置 UI 按平台过滤终端与快捷键标签

**Files:**
- Modify: `src/renderer/src/App.tsx`（`DEFAULT_TERMINAL_OPTIONS`、设置面板 select、shortcut 选项与默认值）

- [ ] **Step 1: 实现 —— 终端选项按平台**

在 `App.tsx` 顶部 import 区加入(与其它 core 导入并列):

```ts
import { terminalOptionsFor } from "../../core/platform";
import { globalShortcutOptions } from "../../core/shortcuts";
```

删除写死的 `DEFAULT_TERMINAL_OPTIONS` 数组(`App.tsx:109-115`),改为按平台计算。在组件可访问处定义:

```ts
const RUNTIME_PLATFORM: NodeJS.Platform = window.sessionSearch.platform;

const TERMINAL_LABELS: Record<AppSettings["defaultTerminal"], string> = {
  Terminal: "Terminal",
  iTerm: "iTerm",
  Ghostty: "Ghostty",
  WezTerm: "WezTerm",
  Warp: "Warp",
  WindowsTerminal: "Windows Terminal",
  PowerShell: "PowerShell",
  Cmd: "Command Prompt",
};

const DEFAULT_TERMINAL_OPTIONS: Array<{ label: string; value: AppSettings["defaultTerminal"] }> =
  terminalOptionsFor(RUNTIME_PLATFORM).map((value) => ({ label: TERMINAL_LABELS[value], value }));
```

- [ ] **Step 2: 实现 —— 快捷键选项与默认值按平台**

找到设置面板里 `const globalShortcut = settings?.globalShortcut ?? "Alt+Space";`(`App.tsx:1523` 附近),改为:

```ts
  const globalShortcut = settings?.globalShortcut ?? (RUNTIME_PLATFORM === "win32" ? "Ctrl+Alt+Space" : "Alt+Space");
```

找到 `const defaultTerminal = settings?.defaultTerminal ?? "Terminal";`(`App.tsx:1522` 附近),改为:

```ts
  const defaultTerminal = settings?.defaultTerminal ?? (RUNTIME_PLATFORM === "win32" ? "WindowsTerminal" : "Terminal");
```

把渲染快捷键下拉的 `GLOBAL_SHORTCUT_OPTIONS.map(...)` 改为 `globalShortcutOptions(RUNTIME_PLATFORM).map(...)`;若文件顶部仍 import 了 `GLOBAL_SHORTCUT_OPTIONS` 且不再使用,移除该 import 以免 lint 报未使用。

- [ ] **Step 3: 类型检查 + 构建**

Run: `npm run typecheck && npm run build`
Expected: 均通过

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: filter terminal options and shortcut labels by platform"
```

---

## Task 7: 主进程接入按平台默认值与归一化

**Files:**
- Modify: `src/main/index.ts:53-55`（`getSettings` 归一化 terminal）

- [ ] **Step 1: 实现**

在 `src/main/index.ts` 顶部从 `../core/platform` 的现有 import 中追加 `normalizeTerminal`:

```ts
import {
  defaultSettings,
  // ...existing named imports...
  normalizeTerminal,
  openResumeInSpecificTerminal,
  openResumeInTerminal,
} from "../core/platform";
```

把 `getSettings` 改为同时归一化终端(快捷键已归一化):

```ts
function getSettings(): AppSettings {
  const settings = { ...defaultSettings, ...settingsStore.store };
  return {
    ...settings,
    globalShortcut: normalizeGlobalShortcut(settings.globalShortcut),
    defaultTerminal: normalizeTerminal(settings.defaultTerminal),
  };
}
```

(`normalizeGlobalShortcut` 与 `normalizeTerminal` 默认读 `process.platform`,主进程即真实 OS;`defaultSettings.defaultTerminal` 现在也已是 `defaultTerminalFor()`,二者一致。)

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: 通过

- [ ] **Step 3: 提交**

```bash
git add src/main/index.ts
git commit -m "feat: normalize terminal setting in main per platform"
```

---

## Task 8: 全量校验

**Files:** 无(仅校验)

- [ ] **Step 1: 跑全量测试**

Run: `npm test`
Expected: 全部 PASS(原有 + 新增 shortcuts/platform 用例)

- [ ] **Step 2: 类型检查 + 构建**

Run: `npm run typecheck && npm run build`
Expected: 均通过

- [ ] **Step 3: macOS 手动冒烟(可选,在 mac 上)**

Run: `npm run dev`,打开 Settings → 终端列表应仍为 5 个 macOS 终端;Resume 行为与改动前一致。
（Windows 端的真机验证需在 Windows 机器上 `npm run dev` 后实测 Resume 打开 wt/PowerShell/cmd;无 Windows 环境时记录为待办,不阻塞合并核心实现。）

- [ ] **Step 4: 标记完成**

无需额外提交;若前序任务均已提交,分支即为可评审状态。

---

## 自查与覆盖

- spec「终端恢复」→ Task 3(命令)+ Task 4(启动)。
- spec「平台感知终端设置」→ Task 2(core)+ Task 6(UI)+ Task 7(main 归一化)。
- spec「按平台全局快捷键」→ Task 1 + Task 6(UI 默认值/标签)。
- spec「单一平台边界」→ 所有 OS 逻辑集中在 `platform.ts`/`shortcuts.ts`;UI/main 仅消费纯函数,Task 6/7 不含新的 `process.platform` 业务判断(仅用 `RUNTIME_PLATFORM` 取值)。
- spec「测试」→ Task 1/2/3/4 均为 TDD;Task 8 全量校验。
- 类型一致:`TerminalChoice`、`buildWindowsLaunchPlan`、`normalizeTerminal`、`defaultTerminalFor`、`terminalOptionsFor`、`defaultGlobalShortcut`、`globalShortcutOptions` 在定义任务与消费任务中名称一致。
- 范围之外项(安装包、Windows 实时聚焦、Linux 完整适配、`%APPDATA%\Claude`)未排任务,符合 spec。
