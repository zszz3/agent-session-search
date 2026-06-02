import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../../preload/index.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../../main/index.ts", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../../../package.json", import.meta.url), "utf8");

describe("embedded resume console contract", () => {
  it("exposes resume console IPC through preload and main", () => {
    expect(preloadSource).toContain("resumeConsoleStart");
    expect(preloadSource).toContain("resume-console:start");
    expect(preloadSource).toContain("onResumeConsoleEvent");
    expect(mainSource).toContain("resume-console:start");
    expect(mainSource).toContain("resume-console:write");
    expect(mainSource).toContain("resume-console:stop");
    expect(mainSource).toContain("getExpectResumeProcessSpec");
    expect(mainSource).toContain("writeResumePtyScript");
  });

  it("renders a Console tab in the detail panel", () => {
    const detailPanel = appSource.slice(appSource.indexOf("function DetailPanel"), appSource.indexOf("function MessageBlock"));

    expect(detailPanel).toContain("Resume in App");
    expect(detailPanel).toContain("Console");
    expect(detailPanel).toContain("resume-console-terminal");
  });

  it("uses a terminal emulator for ANSI/TUI output and interactive input", () => {
    expect(packageSource).toContain("@xterm/xterm");
    expect(packageSource).toContain("@xterm/addon-fit");
    expect(appSource).toContain('from "@xterm/xterm"');
    expect(appSource).toContain('from "@xterm/addon-fit"');
    expect(appSource).toContain('@xterm/xterm/css/xterm.css');
    expect(appSource).not.toContain("new ResizeObserver");
    expect(appSource).toContain('window.addEventListener("resize"');
    expect(appSource).toContain("fitAddon.fit");
    expect(appSource).toContain("terminal.onData");
    expect(appSource).toContain("resumeConsoleWrite");
    expect(preloadSource).toContain("ResumePtySize");
    expect(mainSource).toContain("terminalSize");
  });
});
