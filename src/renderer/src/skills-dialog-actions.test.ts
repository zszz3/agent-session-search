import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const skillsDialogSource = readFileSync(new URL("./components/skills-dialog.tsx", import.meta.url), "utf8");

describe("skills dialog actions", () => {
  it("copies the SKILL.md path but reveals the skill directory", () => {
    expect(skillsDialogSource).toContain("onCopyPath(skillContextMenu.skill.path)");
    expect(skillsDialogSource).toContain("onReveal(skillContextMenu.skill.directoryPath)");
    expect(skillsDialogSource).not.toContain("onReveal(skillContextMenu.skill.path)");
  });
});
