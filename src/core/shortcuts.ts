export const GLOBAL_SHORTCUT_OPTIONS = [
  { label: "Option + Space", value: "Alt+Space" },
  { label: "Control + Option + Space", value: "Ctrl+Alt+Space" },
  { label: "Command + Option + Space", value: "CommandOrControl+Alt+Space" },
  { label: "Disabled", value: "" },
] as const;

export type GlobalShortcut = (typeof GLOBAL_SHORTCUT_OPTIONS)[number]["value"];

const GLOBAL_SHORTCUT_VALUES = new Set<string>(GLOBAL_SHORTCUT_OPTIONS.map((option) => option.value));

function currentPlatform(): NodeJS.Platform {
  const platform = (globalThis as { process?: { platform?: NodeJS.Platform } }).process?.platform;
  return platform ?? "darwin";
}

export function defaultGlobalShortcut(platform: NodeJS.Platform = currentPlatform()): GlobalShortcut {
  return platform === "win32" ? "Ctrl+Alt+Space" : "Alt+Space";
}

export const DEFAULT_GLOBAL_SHORTCUT: GlobalShortcut = defaultGlobalShortcut();

export function normalizeGlobalShortcut(value: unknown, platform: NodeJS.Platform = currentPlatform()): GlobalShortcut {
  if (typeof value !== "string" || !GLOBAL_SHORTCUT_VALUES.has(value)) return defaultGlobalShortcut(platform);
  if (platform === "win32") {
    if (value === "") return "";
    if (value === "Ctrl+Alt+Space" || value === "CommandOrControl+Alt+Space") return "Ctrl+Alt+Space";
    return defaultGlobalShortcut(platform);
  }
  return value as GlobalShortcut;
}

// On Windows, Electron accelerators use Alt/Control; macOS shows Option/Command.
function relabelForPlatform(label: string, platform: NodeJS.Platform): string {
  if (platform !== "win32") return label;
  return label.replace(/Option/g, "Alt").replace(/Command/g, "Ctrl").replace(/Control/g, "Ctrl");
}

export function globalShortcutOptions(
  platform: NodeJS.Platform = currentPlatform(),
): Array<{ label: string; value: GlobalShortcut }> {
  if (platform === "win32") {
    return [
      { label: "Ctrl + Alt + Space", value: "Ctrl+Alt+Space" },
      { label: "Disabled", value: "" },
    ];
  }

  return GLOBAL_SHORTCUT_OPTIONS.map((option) => ({
    label: relabelForPlatform(option.label, platform),
    value: option.value,
  }));
}

export function globalShortcutLabel(value: string, platform: NodeJS.Platform = currentPlatform()): string {
  const found = globalShortcutOptions(platform).find((option) => option.value === value);
  return found?.label ?? relabelForPlatform("Option + Space", platform);
}
