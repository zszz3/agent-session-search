import { describe, expect, it } from "vitest";
import { markdownPreview, truncateMarkdownAtBlockBoundary } from "./markdown-preview";

function hasClosedFences(markdown: string): boolean {
  const fences = markdown.match(/^[ \t]{0,3}(?:`{3,}|~{3,}).*$/gm) ?? [];
  return fences.length % 2 === 0;
}

describe("Markdown previews", () => {
  it("prefers a nearby block boundary over cutting the next paragraph", () => {
    const markdown = `# Result\n\n${"first block ".repeat(12)}\n\n${"second block ".repeat(30)}`;
    const secondBlockStart = markdown.indexOf("second block");
    const preview = truncateMarkdownAtBlockBoundary(markdown, secondBlockStart + 80);

    expect(preview).toContain("first block");
    expect(preview).not.toContain("second block");
  });

  it("cuts before a fenced code block when the limit lands inside it", () => {
    const markdown = `Explanation before code.\n\n\`\`\`ts\n${"const value = 1;\n".repeat(100)}\`\`\`\n\nTail`;
    const preview = markdownPreview(markdown, 180, "...（已截断）");

    expect(preview).toContain("Explanation before code.");
    expect(preview).not.toContain("```ts");
    expect(preview).toMatch(/Explanation before code\.\n\n\.\.\.（已截断）$/);
    expect(hasClosedFences(preview)).toBe(true);
  });

  it("closes a leading fenced block before appending the truncation notice", () => {
    const markdown = `\`\`\`bash\n${"echo a very long line\n".repeat(100)}\`\`\``;
    const preview = markdownPreview(markdown, 120, "...(truncated)");

    expect(preview).toContain("```bash");
    expect(preview).toMatch(/```\n\n\.\.\.\(truncated\)$/);
    expect(hasClosedFences(preview)).toBe(true);
  });

  it("keeps a useful preview for a long single-line paragraph", () => {
    const markdown = "word ".repeat(1000);
    const preview = truncateMarkdownAtBlockBoundary(markdown, 200);

    expect(preview.length).toBeGreaterThan(150);
    expect(preview.length).toBeLessThanOrEqual(200);
  });
});
