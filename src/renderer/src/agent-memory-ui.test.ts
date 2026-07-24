import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentMemoryPage } from "./features/agent-memory/agent-memory-page";
import { AgentMemoryEffectiveView } from "./features/agent-memory/agent-memory-effective-view";
import { AgentMemorySyncDialog } from "./features/agent-memory/agent-memory-sync-dialog";

describe("directory Agent memory page", () => {
  it("starts with an explicit directory chooser instead of scanning every indexed project", () => {
    const html = renderToStaticMarkup(createElement(AgentMemoryPage, { language: "zh" }));

    expect(html).toContain("选择目录");
    expect(html).toContain("不会扫描整个项目");
    expect(html).not.toContain("<textarea");
  });

  it("renders the effective context with target selection and source attribution", () => {
    const html = renderToStaticMarkup(createElement(AgentMemoryEffectiveView, {
      language: "zh",
      target: "cursor",
      context: {
        target: "cursor",
        sources: [{
          relativePath: "AGENTS.md",
          scopeDirectory: "",
          name: "AGENTS.md",
          kind: "agents",
          size: 8,
          modifiedAt: 1,
          content: "# Shared",
        }],
        content: "<!-- Source: AGENTS.md -->\n# Shared",
      },
      loading: false,
      onTargetChange: () => undefined,
    }));

    expect(html).toContain("最终生效内容");
    expect(html).toContain("AGENTS.md");
    expect(html).toContain("# Shared");
  });

  it("renders a reviewable sync diff before applying changes", () => {
    const html = renderToStaticMarkup(createElement(AgentMemorySyncDialog, {
      language: "zh",
      sourcePath: "AGENTS.md",
      targets: ["claude"],
      preview: {
        id: "preview-1",
        sourceRelativePath: "AGENTS.md",
        items: [{
          target: "claude",
          relativePath: "apps/web/CLAUDE.md",
          action: "update",
          diff: [
            { kind: "remove", text: "old rule", oldLine: 1, newLine: null },
            { kind: "add", text: "new rule", oldLine: null, newLine: 1 },
          ],
        }],
      },
      busy: null,
      error: null,
      onToggleTarget: () => undefined,
      onPreview: () => undefined,
      onApply: () => undefined,
      onClose: () => undefined,
    }));

    expect(html).toContain("确认同步差异");
    expect(html).toContain("apps/web/CLAUDE.md");
    expect(html).toContain("old rule");
    expect(html).toContain("new rule");
  });
});
