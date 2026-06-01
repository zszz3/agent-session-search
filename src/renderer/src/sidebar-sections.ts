export type SidebarSectionId = "sources" | "projects" | "tags";

export type SidebarSectionsState = Record<SidebarSectionId, boolean>;

export const DEFAULT_SIDEBAR_SECTIONS: SidebarSectionsState = {
  projects: true,
  sources: true,
  tags: true,
};

export function readSidebarSections(value: string | null): SidebarSectionsState {
  if (!value) return { ...DEFAULT_SIDEBAR_SECTIONS };
  try {
    const parsed = JSON.parse(value) as Partial<Record<SidebarSectionId, unknown>>;
    return {
      projects: typeof parsed.projects === "boolean" ? parsed.projects : DEFAULT_SIDEBAR_SECTIONS.projects,
      sources: typeof parsed.sources === "boolean" ? parsed.sources : DEFAULT_SIDEBAR_SECTIONS.sources,
      tags: typeof parsed.tags === "boolean" ? parsed.tags : DEFAULT_SIDEBAR_SECTIONS.tags,
    };
  } catch {
    return { ...DEFAULT_SIDEBAR_SECTIONS };
  }
}

export function serializeSidebarSections(state: SidebarSectionsState): string {
  return JSON.stringify(state);
}

export function toggleSidebarSection(state: SidebarSectionsState, section: SidebarSectionId): SidebarSectionsState {
  return { ...state, [section]: !state[section] };
}
