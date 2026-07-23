import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  databaseUrlPointerPath,
  resolveDatabaseUrl,
  writeDatabaseUrlPointer,
} from "./app-paths";

describe("app-paths db pointer", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), "app-paths-"));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("writes and reads back the pointer", () => {
    const connectionUrl = "postgresql://agent:secret@127.0.0.1:5432/agent_recall";
    writeDatabaseUrlPointer(connectionUrl, home);
    expect(readFileSync(databaseUrlPointerPath(home), "utf8").trim()).toBe(connectionUrl);
    expect(resolveDatabaseUrl({}, home)).toBe(connectionUrl);
  });

  it("prefers the env override over the pointer", () => {
    writeDatabaseUrlPointer("postgresql://pointer@127.0.0.1/agent_recall", home);
    expect(resolveDatabaseUrl({
      AGENT_RECALL_DATABASE_URL: "postgresql://override@127.0.0.1/agent_recall",
    }, home)).toBe("postgresql://override@127.0.0.1/agent_recall");
  });

  it("returns null when neither override nor pointer exists", () => {
    expect(resolveDatabaseUrl({}, home)).toBeNull();
  });
});
