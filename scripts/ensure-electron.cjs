const { existsSync } = require("node:fs");

// Modern Electron can install its runtime lazily when npm defers lifecycle scripts.
// Resolve it before telling electron-builder to reuse the installed distribution.
const binary = require("electron");
if (typeof binary !== "string" || !existsSync(binary)) {
  throw new Error("Electron runtime is missing. Reinstall dependencies before packaging.");
}
