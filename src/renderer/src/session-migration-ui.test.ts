import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionSearchResult } from "../../core/types";
import { SessionMigrationDialog } from "./components/session-migration-dialog";

describe("SessionMigrationDialog", () => {
  it("shows an empty state and no target buttons when a remote dialog is opened programmatically", () => {
    const session = {
      source: "claude-cli",
      environmentId: "ssh-dev",
      environmentKind: "ssh",
      displayTitle: "Remote session",
    } as SessionSearchResult;
    const html = renderToStaticMarkup(SessionMigrationDialog({
      session,
      language: "en",
      busy: false,
      targets: ["claude", "codex-internal"],
      onSelect: () => undefined,
      onClose: () => undefined,
    }));

    expect(html).toContain("No migration targets are available for this session.");
    expect(html).not.toContain(">Claude Code</button>");
    expect(html).not.toContain(">Codex Internal</button>");
  });

  it("keeps local target buttons and omits the empty state", () => {
    const session = {
      source: "claude-cli",
      environmentId: "local",
      environmentKind: "local",
      displayTitle: "Local session",
    } as SessionSearchResult;
    const html = renderToStaticMarkup(SessionMigrationDialog({
      session,
      language: "zh",
      busy: false,
      targets: ["tcodex"],
      onSelect: () => undefined,
      onClose: () => undefined,
    }));

    expect(html).toContain(">TCodex</button>");
    expect(html).not.toContain("当前会话没有可用的迁移目标。");
  });
});
