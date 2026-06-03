#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const settingsPath = path.join(homeDir(), ".claude", "settings.json");
const command = process.platform === "win32" ? "agent-session-search-claude-statusline.cmd" : "agent-session-search-claude-statusline";

try {
  const settings = readSettings(settingsPath);
  settings.statusLine = {
    type: "command",
    command,
  };

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeJsonAtomic(settingsPath, settings);
  process.stdout.write(`Claude Code statusLine configured in ${settingsPath}\n`);
  process.stdout.write("Restart Claude Code, then run one Claude Code request to generate the quota snapshot.\n");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Could not configure Claude Code statusLine: ${message}\n`);
  process.exit(1);
}

function readSettings(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function homeDir() {
  return process.env.AGENT_SESSION_SEARCH_TEST_HOME || os.homedir();
}

function writeJsonAtomic(filePath, value) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
}
