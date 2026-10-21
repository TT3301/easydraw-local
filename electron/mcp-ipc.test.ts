import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { buildMcpGuide } from "../src/core/mcp-guide";
const { registerMcpHandlers } = createRequire(import.meta.url)("./mcp-ipc.cjs");

describe("generic MCP desktop IPC", () => {
  function setup() {
    const handlers = new Map<string, (...args: any[]) => any>();
    const sender = {}, event = { sender };
    const service = { getStatus: vi.fn(() => ({ enabled: false })), setEnabled: vi.fn(async enabled => ({ enabled })) };
    const info = { transport: "stdio", config: { mcpServers: { easydraw: { command: "EasyDraw", args: ["bundle"], env: { ELECTRON_RUN_AS_NODE: "1" } } } }, skillPath: "/bundled/skill" };
    const clipboard = { writeText: vi.fn() };
    const updateSkill = vi.fn(async () => true);
    registerMcpHandlers({ handle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler) }, {
      service: () => service, getConnectionInfo: () => info, clipboard, updateSkill, isTrusted: (event: any) => event.sender === sender,
    });
    return { handlers, event, service, info, clipboard, updateSkill };
  }
  it("exposes explicit service and skill actions and copies the full guide rather than only JSON", async () => {
    const { handlers, event, service, info, clipboard } = setup();
    expect([...handlers.keys()]).toEqual(["easydraw:mcp:runtime-status", "easydraw:mcp:set-enabled", "easydraw:mcp:connection-info", "easydraw:mcp:copy-connection-info", "easydraw:skills:copy-directory", "easydraw:skills:update"]);
    expect(handlers.get("easydraw:mcp:runtime-status")!(event)).toEqual({ enabled: false });
    expect(handlers.get("easydraw:mcp:connection-info")!(event)).toBe(info);
    expect(await handlers.get("easydraw:mcp:set-enabled")!(event, true)).toEqual({ enabled: true });
    expect(service.setEnabled).toHaveBeenCalledWith(true);
    const guide = buildMcpGuide(info as Parameters<typeof buildMcpGuide>[0], key => key);
    expect(handlers.get("easydraw:mcp:copy-connection-info")!(event, guide.text)).toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith(guide.text);
    expect(clipboard.writeText.mock.calls[0][0]).toContain("Agent 执行步骤");
    expect(clipboard.writeText.mock.calls[0][0]).toContain(info.skillPath);
  });
  it("copies the authoritative bundled skill directory, ignoring renderer-supplied paths", async () => {
    const { handlers, event, info, clipboard } = setup();
    expect(await handlers.get("easydraw:skills:copy-directory")!(event, "/untrusted/path")).toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith(info.skillPath);
  });
  it("only installs on request and ignores renderer-supplied destinations", async () => {
    const { handlers, event, updateSkill } = setup();
    expect(updateSkill).not.toHaveBeenCalled();
    expect(await handlers.get("easydraw:skills:update")!(event,"/untrusted/path")).toBe(true);
    expect(updateSkill).toHaveBeenCalledExactlyOnceWith();
    updateSkill.mockResolvedValueOnce(false);
    expect(await handlers.get("easydraw:skills:update")!(event)).toBe(false);
  });
  it("rejects invalid or oversized guide text before writing to the clipboard", () => {
    const { handlers, event, clipboard } = setup();
    for (const text of [undefined, null, {}, "", " \n ", "x".repeat(65_537)]) {
      expect(() => handlers.get("easydraw:mcp:copy-connection-info")!(event, text)).toThrow("内容无效");
    }
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });
  it("rejects untrusted renderers before controlling the service or clipboard", () => {
    const { handlers, service, clipboard, updateSkill } = setup();
    for (const handler of handlers.values()) expect(() => handler({ sender: {} }, true)).toThrow("来源无效");
    expect(service.setEnabled).not.toHaveBeenCalled();
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(updateSkill).not.toHaveBeenCalled();
  });
});
