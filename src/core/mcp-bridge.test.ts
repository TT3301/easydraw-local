import { describe, expect, it } from "vitest";
import { connectionStateFromRuntime, type McpRuntimeStatus } from "./mcp-bridge";
const status: McpRuntimeStatus = { enabled: false, listening: false, rendererReady: true, clientCount: 0, clients: [], port: null, descriptorVersion: 1 };
describe("MCP service connection states", () => {
  it("distinguishes authorization, startup, idle, and connected states", () => {
    expect(connectionStateFromRuntime(status)).toBe("disabled");
    expect(connectionStateFromRuntime({ ...status, listening: true, clientCount: 2 })).toBe("disabled");
    expect(connectionStateFromRuntime({ ...status, enabled: true })).toBe("connecting");
    expect(connectionStateFromRuntime({ ...status, enabled: true, listening: true, rendererReady: false })).toBe("connecting");
    expect(connectionStateFromRuntime({ ...status, enabled: true, listening: true })).toBe("disconnected");
    expect(connectionStateFromRuntime({ ...status, enabled: true, listening: true, clientCount: 2 })).toBe("connected");
  });
});
