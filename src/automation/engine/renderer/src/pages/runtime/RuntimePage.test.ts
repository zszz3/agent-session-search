import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgentChannel } from "../../../../shared/types";
import { RuntimePage } from "./RuntimePage";

const channels: AgentChannel[] = [
  {
    id: "codex-openai",
    agentId: "codex",
    label: "Codex OpenAI",
    providerName: "OpenAI",
    models: [],
  },
  {
    id: "claude-code",
    agentId: "claude",
    label: "Claude Code",
    providerName: "claude-code",
    models: [],
  },
];

describe("RuntimePage", () => {
  it("shows concise configs for only the selected Runtime in the editor header", () => {
    const markup = renderToStaticMarkup(createElement(RuntimePage, {
      embedded: true,
      language: "zh",
      channels,
      selectedChannelId: "codex-openai",
      selectedRuntimeId: "codex",
      providerKeys: {},
      codexPluginCatalog: [],
      pluginCatalogStatus: "",
      agentTestResults: {},
      testingAgentId: undefined,
      agentTestTick: 0,
      onUpdateChannel: vi.fn(),
      onAddModel: vi.fn(),
      onUpdateModel: vi.fn(),
      onRemoveModel: vi.fn(),
      onSave: vi.fn(),
      onLoadCodexPluginCatalog: vi.fn(),
      onSelectChannel: vi.fn(),
      onSelectRuntime: vi.fn(),
      onAddConfig: vi.fn(),
      onDeleteConfig: vi.fn(),
      onTestChannel: vi.fn(),
      onUpdateProviderKey: vi.fn(),
    }));

    const configSelect = markup.match(/<select aria-label="选择配置".*?<\/select>/)?.[0] ?? "";
    expect(markup).not.toContain('class="runtime-config-toolbar"');
    expect(markup).toContain('class="runtime-editor-config"');
    expect(configSelect.match(/<option/g)).toHaveLength(1);
    expect(configSelect).toContain(">Codex OpenAI</option>");
    expect(configSelect).not.toContain("Claude Code");
    expect(configSelect).not.toContain("Codex · Codex OpenAI · OpenAI");
    expect(markup).not.toContain("runtime-channel-row");
  });
});
