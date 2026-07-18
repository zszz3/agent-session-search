import { describe, expect, it } from "vitest";
import { normalizeExternalLink } from "./external-link";

describe("normalizeExternalLink", () => {
  it.each([
    ["https://example.com/docs?q=markdown#links", "https://example.com/docs?q=markdown#links"],
    ["http://localhost:3000/readme", "http://localhost:3000/readme"],
    ["mailto:hello@example.com", "mailto:hello@example.com"],
  ])("accepts supported external URL %s", (value, expected) => {
    expect(normalizeExternalLink(value)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "file:///Users/example/.ssh/config",
    "data:text/html,unsafe",
    "./relative-doc.md",
    "#local-section",
    "not a URL",
    "",
  ])("rejects URL that must not reach shell.openExternal: %s", (value) => {
    expect(normalizeExternalLink(value)).toBeNull();
  });

  it("rejects non-string IPC values", () => {
    expect(normalizeExternalLink(null)).toBeNull();
    expect(normalizeExternalLink({ href: "https://example.com" })).toBeNull();
  });
});
