export const INITIAL_INDEX_DELAY_MS = 750;
export const AUTO_INDEX_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
// The Claude statusline bridge rewrites ~/.claude/statusline-snapshot.json whenever Claude Code
// renders its statusline, so poll often enough that the quota panel tracks it while the window
// stays open instead of freezing on the value captured at mount.
export const QUOTA_REFRESH_INTERVAL_MS = 60 * 1000;
