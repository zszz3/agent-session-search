#!/usr/bin/env node
"use strict";

// Launches the built Electron app from a global npm install. Running through
// Node (rather than a double-clicked .app bundle) means macOS Gatekeeper does
// not require code signing or notarization.
const { spawn } = require("node:child_process");
const path = require("node:path");

// The `electron` dependency resolves to the path of the Electron executable.
const electronPath = require("electron");
const appEntry = path.join(__dirname, "..", "out", "main", "index.js");

const child = spawn(electronPath, [appEntry], { detached: true, stdio: "ignore" });
child.on("error", (error) => {
  console.error("Failed to launch Agent-Session-Search:", error.message);
  process.exit(1);
});
child.unref();
