const path = require("node:path");

exports.currentMcpLaunchSpec = (app, { execPath = process.execPath, resourcesPath = process.resourcesPath } = {}) => ({
  command: execPath,
  args: app.isPackaged
    ? [path.join(resourcesPath, "app.asar", "dist-mcp", "mcp-server.cjs")]
    : [require.resolve("tsx/cli"), path.join(__dirname, "..", "packages", "mcp-server", "src", "index.ts")],
  env: { ELECTRON_RUN_AS_NODE: "1" },
});
