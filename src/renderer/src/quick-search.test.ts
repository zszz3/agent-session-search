import { describe, expect, it } from "vitest";
import { quickSearchOptions } from "./quick-search";

describe("macOS quick search", () => {
  it("uses the smart session search and limits the compact result list", () => {
    expect(quickSearchOptions("cursor remote")).toEqual({
      query: "cursor remote",
      limit: 8,
      sortBy: "smart",
    });
  });
});
