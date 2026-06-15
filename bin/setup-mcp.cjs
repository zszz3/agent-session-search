#!/usr/bin/env node
"use strict";

// Registers (or removes) the agent-session-search MCP server in Claude Code and
// Codex configs so they can search past sessions. Run with `uninstall` to remove.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SERVER_NAME = "agent-session-search";
const CODEX_SECTION = "mcp_servers.agent_session_search";

function homeDir() {
  return process.env.AGENT_SESSION_SEARCH_TEST_HOME || os.homedir();
}

function serverScriptPath() {
  return path.join(__dirname, "agent-session-search-mcp.mjs");
}

// --- Claude (~/.claude.json, JSON) -----------------------------------------

function applyClaudeConfig(config, scriptPath, remove) {
  const next = config && typeof config === "object" && !Array.isArray(config) ? { ...config } : {};
  const servers = next.mcpServers && typeof next.mcpServers === "object" ? { ...next.mcpServers } : {};
  if (remove) {
    delete servers[SERVER_NAME];
  } else {
    servers[SERVER_NAME] = { command: "node", args: [scriptPath] };
  }
  if (Object.keys(servers).length > 0) next.mcpServers = servers;
  else delete next.mcpServers;
  return next;
}

// --- Codex (~/.codex/config.toml, TOML) ------------------------------------

function applyCodexConfig(toml, scriptPath, remove) {
  const block = `[${CODEX_SECTION}]\ncommand = "node"\nargs = ["${scriptPath}"]\n`;
  const stripped = removeCodexBlock(toml);
  if (remove) return stripped;
  const base = stripped.trim();
  return base ? `${base}\n\n${block}` : block;
}

function removeCodexBlock(toml) {
  const lines = (toml || "").split("\n");
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (line.trim() === `[${CODEX_SECTION}]`) {
      skipping = true;
      continue;
    }
    if (skipping) {
      // Stop skipping at the next table header.
      if (/^\s*\[/.test(line)) skipping = false;
      else continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function writeFileAtomic(filePath, contents) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, contents, "utf8");
  fs.renameSync(tmp, filePath);
}

function run(remove) {
  const home = homeDir();
  const scriptPath = serverScriptPath();
  const messages = [];

  const claudePath = path.join(home, ".claude.json");
  const claudeConfig = applyClaudeConfig(readJson(claudePath), scriptPath, remove);
  writeFileAtomic(claudePath, `${JSON.stringify(claudeConfig, null, 2)}\n`);
  messages.push(`${remove ? "Removed" : "Configured"} MCP server in ${claudePath}`);

  const codexDir = path.join(home, ".codex");
  if (fs.existsSync(codexDir)) {
    const codexPath = path.join(codexDir, "config.toml");
    const current = fs.existsSync(codexPath) ? fs.readFileSync(codexPath, "utf8") : "";
    const nextToml = applyCodexConfig(current, scriptPath, remove);
    writeFileAtomic(codexPath, nextToml.endsWith("\n") ? nextToml : `${nextToml}\n`);
    messages.push(`${remove ? "Removed" : "Configured"} MCP server in ${codexPath}`);
  } else {
    messages.push("Skipped Codex (~/.codex not found).");
  }

  return messages;
}

function status(home = homeDir()) {
  try {
    const claude = readJson(path.join(home, ".claude.json"));
    return Boolean(claude && claude.mcpServers && claude.mcpServers[SERVER_NAME]);
  } catch {
    return false;
  }
}

module.exports = { applyClaudeConfig, applyCodexConfig, removeCodexBlock, run, status };

if (require.main === module) {
  const remove = process.argv.includes("uninstall") || process.argv.includes("--remove");
  try {
    for (const message of run(remove)) process.stdout.write(`${message}\n`);
    if (!remove) process.stdout.write("Restart Claude Code / Codex to pick up the new MCP server.\n");
  } catch (error) {
    process.stderr.write(`Could not update MCP config: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
