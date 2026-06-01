import { describe, expect, it } from "vitest";
import { readSidebarSections, serializeSidebarSections, toggleSidebarSection } from "./sidebar-sections";

describe("sidebar sections", () => {
  it("defaults all collapsible sections to expanded", () => {
    expect(readSidebarSections(null)).toEqual({
      projects: true,
      sources: true,
      tags: true,
    });
  });

  it("reads persisted section state and fills missing values with defaults", () => {
    expect(readSidebarSections(JSON.stringify({ projects: false }))).toEqual({
      projects: false,
      sources: true,
      tags: true,
    });
  });

  it("falls back to defaults for invalid persisted state", () => {
    expect(readSidebarSections("{not-json")).toEqual({
      projects: true,
      sources: true,
      tags: true,
    });
  });

  it("toggles one section without mutating the other sections", () => {
    const next = toggleSidebarSection({ projects: true, sources: true, tags: false }, "tags");

    expect(next).toEqual({ projects: true, sources: true, tags: true });
    expect(JSON.parse(serializeSidebarSections(next))).toEqual(next);
  });
});
