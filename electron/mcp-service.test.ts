import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

const { McpService } = createRequire(import.meta.url)("./mcp-service.cjs");
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function setup() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "easydraw-mcp-service-"));
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
  const settingsPath = path.join(directory, "mcp-settings.json");
  const descriptorPath = path.join(directory, "mcp-bridge.json");
  const onRequest = vi.fn(), onStatusChange = vi.fn();
  const create = () => {
    const service = new McpService({ settingsPath, descriptorPath, appVersion: "test", onRequest, onStatusChange });
    cleanups.push(() => service.stop());
    service.setRendererReady(true);
    return service;
  };
  return { directory, settingsPath, descriptorPath, onRequest, onStatusChange, create };
}
async function connect(descriptorPath: string) {
  const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8"));
  const socket = new WebSocket(`${descriptor.endpoint}?token=${descriptor.token}`);
  cleanups.push(async () => socket.terminate());
  await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  return { socket, descriptor };
}

describe("agent-independent MCP service", () => {
  it("defaults off, removes stale discovery, and does not touch agent or skill files", async () => {
    const { create, directory, descriptorPath, settingsPath } = await setup();
    const agentPath = path.join(directory, "agent-config.json"), skillPath = path.join(directory, "SKILL.md");
    await fs.writeFile(agentPath, '{"other":"keep"}');
    await fs.writeFile(skillPath, "custom skill");
    await fs.writeFile(descriptorPath, '{"token":"stale"}');
    expect(await create().initialize()).toMatchObject({ enabled: false, listening: false, clientCount: 0, rendererReady: true });
    await expect(fs.access(descriptorPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(settingsPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(agentPath, "utf8")).toBe('{"other":"keep"}');
    expect(await fs.readFile(skillPath, "utf8")).toBe("custom skill");
  });

  it.each(["not json", '{"version":1,"enabled":"true"}', '{"version":2,"enabled":true}'])("fails closed with invalid settings: %s", async content => {
    const { create, settingsPath } = await setup();
    await fs.writeFile(settingsPath, content);
    expect(await create().initialize()).toMatchObject({ enabled: false, listening: false });
  });

  it("persists enable/disable, disconnects existing clients and rotates tokens on re-enable", async () => {
    const { create, descriptorPath, settingsPath, onRequest } = await setup();
    const service = create(); await service.initialize();
    expect(await service.setEnabled(true)).toMatchObject({ enabled: true, listening: true });
    const { socket, descriptor: first } = await connect(descriptorPath);
    socket.send(JSON.stringify({ type: "request", id: "pending", method: "get_status", params: {} }));
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalledOnce());
    const bridgeId = onRequest.mock.calls[0][0].id;
    const closed = new Promise(resolve => socket.once("close", resolve));
    expect(await service.setEnabled(false)).toMatchObject({ enabled: false, listening: false, clientCount: 0 });
    await closed;
    expect(service.handleRendererResponse({ type: "response", id: bridgeId, ok: true, result: {} })).toBe(false);
    await expect(fs.access(descriptorPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await fs.readFile(settingsPath, "utf8"))).toEqual({ version: 1, enabled: false });
    const disabledRestart = create();
    expect(await disabledRestart.initialize()).toMatchObject({ enabled: false, listening: false });
    await disabledRestart.stop();
    await service.setEnabled(true);
    const second = JSON.parse(await fs.readFile(descriptorPath, "utf8"));
    expect(second.token).not.toBe(first.token);
    expect(service.handleRendererResponse({ type: "response", id: bridgeId, ok: true })).toBe(false);
    const stale = new WebSocket(`${second.endpoint}?token=${first.token}`);
    expect(await new Promise(resolve => stale.once("close", resolve))).toBe(1008);
    await service.stop();
    const restart = create();
    expect(await restart.initialize()).toMatchObject({ enabled: true, listening: true });
    expect(JSON.parse(await fs.readFile(settingsPath, "utf8"))).toEqual({ version: 1, enabled: true });
  });

  it("serializes rapid toggles and rejects non-boolean inputs", async () => {
    const { create, settingsPath, descriptorPath } = await setup();
    const service = create(); await service.initialize();
    await expect(service.setEnabled("false")).rejects.toThrow("参数无效");
    await Promise.all([service.setEnabled(true), service.setEnabled(false), service.setEnabled(true), service.setEnabled(false)]);
    expect(service.getStatus()).toMatchObject({ enabled: false, listening: false, clients: [] });
    expect(JSON.parse(await fs.readFile(settingsPath, "utf8")).enabled).toBe(false);
    await expect(fs.access(descriptorPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("revokes access even when saving the off preference fails", async () => {
    const { create, settingsPath, descriptorPath, onStatusChange } = await setup();
    const service = create(); await service.initialize(); await service.setEnabled(true);
    const { socket } = await connect(descriptorPath);
    const original = fs.writeFile;
    vi.spyOn(fs, "writeFile").mockImplementation((...args: Parameters<typeof fs.writeFile>) => {
      if (String(args[0]).startsWith(`${settingsPath}.tmp-`)) return Promise.reject(new Error("permission denied"));
      return original(...args);
    });
    const closed = new Promise(resolve => socket.once("close", resolve));
    await expect(service.setEnabled(false)).rejects.toThrow("无法保存");
    await closed;
    expect(service.getStatus()).toMatchObject({ enabled: false, listening: false });
    expect(onStatusChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, clientCount: 0 }));
  });

  it("fails closed and cleans temporary credentials if publishing discovery fails", async () => {
    const { create, directory, descriptorPath } = await setup();
    const service = create(); await service.initialize();
    await fs.mkdir(descriptorPath); // Cannot replace this directory with a JSON descriptor.
    await expect(service.setEnabled(true)).rejects.toThrow("无法开启 MCP 服务");
    expect(service.getStatus()).toMatchObject({ enabled: false, listening: false, clients: [] });
    expect((await fs.readdir(directory)).filter(file => file.includes(".tmp-"))).toEqual([]);
    await fs.rm(descriptorPath, { recursive: true });
    expect(await service.setEnabled(true)).toMatchObject({ enabled: true, listening: true });
  });

  it("rolls back runtime access when enabling cannot be persisted", async () => {
    const { create, settingsPath, descriptorPath } = await setup();
    const service = create(); await service.initialize();
    await fs.mkdir(settingsPath); // Atomic rename cannot replace a directory.
    await expect(service.setEnabled(true)).rejects.toThrow("无法保存");
    expect(service.getStatus()).toMatchObject({ enabled: false, listening: false });
    await expect(fs.access(descriptorPath)).rejects.toMatchObject({ code: "ENOENT" });
    await fs.rm(settingsPath, { recursive: true });
    expect(await service.setEnabled(true)).toMatchObject({ enabled: true, listening: true });
  });
});
