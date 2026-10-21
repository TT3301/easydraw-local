const path = require("node:path");
const { currentMcpLaunchSpec } = require("./mcp-client-config.cjs");

exports.getMcpConnectionInfo = ({ app, descriptorPath, execPath = process.execPath, resourcesPath = process.resourcesPath }) => {
  const launch = currentMcpLaunchSpec(app, { execPath, resourcesPath });
  return {
    transport: "stdio",
    // Explicit targeting prevents a sidecar from falling back to another running instance.
    // This is a descriptor path, never its contents or its ephemeral token.
    config: { mcpServers: { easydraw: {
      ...launch, env: { ...launch.env, EASYDRAW_BRIDGE_DESCRIPTOR: descriptorPath },
    } } },
    skillPath: app.isPackaged
      ? path.join(resourcesPath, "skills", "easydraw-product-sketch")
      : path.join(__dirname, "..", "skills", "easydraw-product-sketch"),
  };
};
