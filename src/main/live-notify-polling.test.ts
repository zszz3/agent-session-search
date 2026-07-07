import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("live session notification lifecycle", () => {
  it("does not run a background live-session completion poller", () => {
    expect(mainSource).not.toContain("startLiveNotifyPolling");
    expect(mainSource).not.toContain("pollLiveSessionsForNotifications");
    expect(mainSource).not.toContain("liveNotifyTimer");
    expect(mainSource).not.toContain("liveTracker");
  });
});
