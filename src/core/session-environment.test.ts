import { describe, expect, it } from "vitest";
import { isLocalSessionEnvironment } from "./session-environment";

describe("session environment classification", () => {
  it.each([
    ["strict local", { environmentKind: "local", environmentId: "local" }, true],
    ["imported local", { environmentKind: "local", environmentId: "imported-local" }, false],
    ["ssh", { environmentKind: "ssh", environmentId: "ssh-dev" }, false],
    ["inconsistent ssh local id", { environmentKind: "ssh", environmentId: "local" }, false],
  ] as const)("classifies %s", (_label, session, expected) => {
    expect(isLocalSessionEnvironment(session)).toBe(expected);
  });
});
