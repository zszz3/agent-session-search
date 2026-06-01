import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("stylesheet theme contract", () => {
  it("keeps theme differences in root tokens instead of component overrides", () => {
    expect(stylesheet).toMatch(/:root\s*\{/);
    expect(stylesheet).toMatch(/:root\[data-theme="dark"\]\s*\{/);
    expect(stylesheet).not.toMatch(/:root\[data-theme="(?:light|dark)"\]\s+[^,{]*\.[\w-]/);
    expect(stylesheet).not.toContain("LIGHT WORKBENCH");
    expect(stylesheet).not.toContain("DARK WORKBENCH");
  });
});
