import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
const { getMcpConnectionInfo } = createRequire(import.meta.url)("./mcp-connection-info.cjs");

describe("generic MCP connection information", () => {
  it("exports a bundled stdio launch without runtime tokens or agent-specific settings", () => {
    const resourcesPath = path.resolve("test-install/resources");
    const descriptorPath = path.resolve("test-user/mcp-bridge.json");
    const info = getMcpConnectionInfo({ app: { isPackaged: true }, resourcesPath, descriptorPath, execPath: "EasyDraw.exe" });
    expect(info).toEqual({ transport: "stdio", config: { mcpServers: { easydraw: {
      command: "EasyDraw.exe", args: [path.join(resourcesPath, "app.asar/dist-mcp/mcp-server.cjs")],
      env: { ELECTRON_RUN_AS_NODE: "1", EASYDRAW_BRIDGE_DESCRIPTOR: descriptorPath },
    } } }, skillPath: path.join(resourcesPath, "skills/easydraw-product-sketch") });
    expect(JSON.stringify(info)).not.toMatch(/token|exposure|codex|deepseek/i);
  });

  it("uses absolute source arguments and the Electron Node runtime in development, without npm on PATH", () => {
    const info = getMcpConnectionInfo({ app: { isPackaged: false }, execPath: "/test/Electron", descriptorPath: "/test/mcp-bridge.json" });
    const launch = info.config.mcpServers.easydraw;
    expect(launch.command).toBe("/test/Electron");
    expect(launch.args).toHaveLength(2);
    expect(launch.args.every(path.isAbsolute)).toBe(true);
    expect(launch.args[1]).toMatch(/packages[/\\]mcp-server[/\\]src[/\\]index.ts$/);
    expect(launch.env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(info.skillPath).toMatch(/easydraw-product-sketch$/);
  });
});
