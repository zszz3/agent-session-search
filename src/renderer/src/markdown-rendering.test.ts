import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

const markdownSource = readFileSync(new URL("./markdown.tsx", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../../preload/index.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../../main/index.ts", import.meta.url), "utf8");

function renderMarkdown(text: string): string {
  return renderToStaticMarkup(createElement(Markdown, { language: "en", text }));
}

describe("Markdown rendering", () => {
  it("renders GitHub-flavored tables, task lists, and strikethrough", () => {
    const html = renderMarkdown("| Item | Done |\n| --- | --- |\n| Links | yes |\n\n- [x] GFM enabled\n\n~~legacy~~");

    expect(html).toContain('class="md-table"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain("<del>legacy</del>");
  });

  it("renders a copy control and preserves the declared code language", () => {
    const html = renderMarkdown("```typescript\nconst value = 1;\n```");

    expect(html).toContain('class="md-code-block"');
    expect(html).toContain('class="md-code-language">typescript</span>');
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain('class="language-typescript"');
  });

  it("routes supported links over preload IPC and blocks renderer navigation fallbacks", () => {
    const html = renderMarkdown("[Docs](https://example.com/docs)");

    expect(html).toContain('href="https://example.com/docs"');
    expect(markdownSource).toContain("window.sessionSearch.openExternalLink(safeUrl)");
    expect(markdownSource).toContain("event.preventDefault()");
    expect(preloadSource).toContain('ipcRenderer.invoke("markdown:open-external", url)');
    expect(mainSource).toContain('ipcMain.handle("markdown:open-external"');
    expect(mainSource).toContain("normalizeExternalLink(value)");
    expect(mainSource).toContain("shell.openExternal(url)");
    expect(mainSource).toContain('setWindowOpenHandler(() => ({ action: "deny" }))');
    expect(mainSource).toContain('webContents.on("will-navigate", (event) => event.preventDefault())');
  });

  it("does not make unsafe or relative Markdown links navigable", () => {
    const unsafe = renderMarkdown("[Run](javascript:alert(1))");
    const relative = renderMarkdown("[Local](./README.md)");

    expect(unsafe).not.toContain("<a");
    expect(relative).not.toContain("<a");
    expect(unsafe).toContain('class="md-link-disabled"');
    expect(relative).toContain('class="md-link-disabled"');
  });

  it("does not load Markdown image URLs inside the renderer", () => {
    const html = renderMarkdown("![diagram](https://example.com/diagram.png)");

    expect(html).not.toContain("<img");
    expect(html).toContain("[diagram]");
  });
});
