#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Agent-Session-Search — one-shot launcher for macOS
#
# Usage:  bash start.sh  (or: ./start.sh)
#
# Checks environment, installs missing pieces following the
# README.md flow, then launches the app.
# ─────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# Colours -------------------------------------------------------
if [ -t 1 ]; then
  C_BOLD="\033[1m"; C_GREEN="\033[32m"; C_YELLOW="\033[33m"
  C_RED="\033[31m"; C_CYAN="\033[36m"; C_RESET="\033[0m"
else
  C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""; C_RESET=""
fi

info()  { printf "${C_CYAN}▸ %s${C_RESET}\n" "$*"; }
ok()    { printf "${C_GREEN}✓ %s${C_RESET}\n" "$*"; }
warn()  { printf "${C_YELLOW}⚠ %s${C_RESET}\n" "$*"; }
fail()  { printf "${C_RED}✗ %s${C_RESET}\n" "$*" >&2; exit 1; }

echo -e "${C_BOLD}Agent-Session-Search launcher${C_RESET}"
echo ""

# ── 1. Node.js ≥ 22.13 ─────────────────────────────────────────
node_version_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local major minor
  major="$(node -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null)"
  minor="$(node -e 'process.stdout.write(process.versions.node.split(".")[1])' 2>/dev/null)"
  [ -n "$major" ] && [ -n "$minor" ] || return 1
  if [ "$major" -gt 22 ]; then return 0; fi
  if [ "$major" -eq 22 ] && [ "$minor" -ge 13 ]; then return 0; fi
  return 1
}

if node_version_ok; then
  ok "Node.js $(node --version) detected"
else
  warn "Node.js 22.13+ not found in PATH"

  # Try nvm (sourced — it's a shell function, not a binary)
  NVM_SH="$HOME/.nvm/nvm.sh"
  if [ -s "$NVM_SH" ]; then
    info "Loading nvm …"
    # shellcheck disable=SC1090
    . "$NVM_SH" >/dev/null 2>&1

    if command -v nvm >/dev/null 2>&1; then
      info "Installing Node 22 via nvm (first time may take a minute) …"
      nvm install 22 >/dev/null 2>&1 || fail "nvm install 22 failed"
      nvm use 22 >/dev/null 2>&1 || fail "nvm use 22 failed"
      ok "Node.js $(node --version) ready via nvm"
    else
      fail "nvm found but did not load. Run 'nvm install 22 && nvm use 22' manually, then re-run start.sh"
    fi
  else
    fail "Node.js 22.13+ is required but not installed, and nvm was not found.
       Install Node.js 22.13+ from https://nodejs.org or install nvm first:
         curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
       Then re-run start.sh"
  fi
fi

# ── 2. npm available ───────────────────────────────────────────
command -v npm >/dev/null 2>&1 || fail "npm not found after Node check."
ok "npm $(npm --version) detected"

# ── 3. dependencies (node_modules) ─────────────────────────────
if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
  ok "Dependencies installed (node_modules/ exists)"
else
  info "Installing dependencies (npm ci) — first run may take a few minutes …"
  npm ci || fail "npm ci failed"
  ok "Dependencies installed"
fi

# ── 4. build output (out/) ─────────────────────────────────────
info "Building the app (npm run build) …"
npm run build || fail "npm run build failed"
ok "Build complete"

# ── 5. global command ──────────────────────────────────────────
# The global binary is a symlink to this repo (npm install -g .).
# Check whether it's registered; if not, register it.
GLOBAL_BIN="$(npm prefix -g 2>/dev/null)/bin/agent-session-search"
if [ -x "$GLOBAL_BIN" ]; then
  ok "Global command 'agent-session-search' registered"
else
  info "Registering global command (npm install -g .) …"
  npm install -g . || fail "npm install -g . failed"
  ok "Global command registered"
fi

# ── 6. register MCP server ─────────────────────────────────────
# Register the agent-session-search MCP server in Claude Code and Codex so
# they can search/manage past sessions and run migrate_session from chat.
SETUP_MCP="$(npm prefix -g 2>/dev/null)/bin/agent-session-search-setup-mcp"
if [ -x "$SETUP_MCP" ]; then
  info "Registering MCP server in Claude Code / Codex …"
  "$SETUP_MCP" || warn "MCP registration failed (non-fatal — you can run 'agent-session-search-setup-mcp' manually later)"
  ok "MCP server registered"
else
  warn "setup-mcp command not found — MCP server not registered. Run 'node bin/setup-mcp.cjs' manually after install."
fi

# ── 7. launch ──────────────────────────────────────────────────
# If the app is already running, shut it down first so start.sh always
# launches a fresh instance. The Electron main process runs
# out/main/index.js; matching on that path avoids killing the standalone
# MCP server (agent-session-search-mcp).
if pgrep -f "out/main/index.js" >/dev/null 2>&1; then
  info "Existing instance found — closing it …"
  pkill -f "out/main/index.js" 2>/dev/null || true
  # Wait for the process tree to fully exit so the new instance isn't
  # blocked by the old one's single-instance lock.
  for _ in $(seq 1 20); do
    pgrep -f "out/main/index.js" >/dev/null 2>&1 || break
    sleep 0.25
  done
  ok "Previous instance closed"
fi

echo ""
info "Launching Agent-Session-Search …"
echo "    (The app runs in the menu bar — press Option+Space to show the window)"
echo ""
exec agent-session-search
