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

  it("reserves a stable scrollbar gutter on scrollers whose overflow is frozen by the overlay", () => {
    // Opening the detail overlay toggles `.sidebar`/`.results` to overflow:hidden.
    // Without a reserved gutter the scrollbar's width is released and the
    // right-aligned content jumps sideways, so both must keep a stable gutter.
    const blocks = [...stylesheet.matchAll(/(?:\.sidebar|\.results)\s*\{[^}]*\}/g)].map((m) => m[0]);
    const scrollers = blocks.filter((block) => /overflow-y:\s*auto/.test(block));
    expect(scrollers).toHaveLength(2);
    for (const scroller of scrollers) {
      expect(scroller).toMatch(/scrollbar-gutter:\s*stable/);
    }
  });
});
