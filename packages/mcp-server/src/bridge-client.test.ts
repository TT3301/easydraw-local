import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { EasyDrawBridge } from "./bridge-client";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup(connectionTimeoutMs = 500, handshakeDelayMs = 30) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "easydraw-bridge-client-"));
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0,
    verifyClient: (_info, done) => { setTimeout(() => done(true), handshakeDelayMs); },
  });
  cleanups.push(async () => {
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test bridge address");
  const descriptor = path.join(directory, "bridge.json");
  await fs.writeFile(descriptor, JSON.stringify({ version: 1, endpoint: `ws://127.0.0.1:${address.port}`, token: "test-only", appVersion: "test" }));
  vi.stubEnv("EASYDRAW_BRIDGE_DESCRIPTOR", descriptor);
  const bridge = new EasyDrawBridge({ connectionTimeoutMs });
  cleanups.push(async () => { bridge.close(); });
  return { bridge, server };
}

it("waits for the initial connection and dispatches concurrent cold requests once", async () => {
  const { bridge, server } = await setup();
  let connections = 0;
  const requests: unknown[] = [];
  server.on("connection", socket => {
    connections++;
    socket.on("message", raw => {
      const request = JSON.parse(String(raw));
      if (request.type !== "request") return;
      requests.push(request.params);
      socket.send(JSON.stringify({ type: "response", id: request.id, ok: true, result: request.params }));
    });
  });
  bridge.start();
  expect(bridge.isConnected()).toBe(false);
  const params = { operation: { op: "create", type: "canvas", parentId: null } };
  await expect(Promise.all([bridge.request("manage_project_tree", params), bridge.request("get_status", {})])).resolves.toEqual([params, {}]);
  expect(connections).toBe(1);
  expect(requests).toEqual([params, {}]);
});

it("bounds the connection wait and never sends a timed-out request", async () => {
  const { bridge, server } = await setup(20, 80);
  const received = vi.fn();
  server.on("connection", socket => socket.on("message", raw => {
    const request = JSON.parse(String(raw));
    if (request.type !== "request") return;
    received(request.method);
    socket.send(JSON.stringify({ type: "response", id: request.id, ok: true, result: {} }));
  }));
  bridge.start();
  await expect(bridge.request("manage_project_tree", {})).rejects.toThrow("桌面画布未连接");
  const connected = new Promise<void>(resolve => server.once("connection", () => resolve()));
  await connected;
  await bridge.request("get_status", {});
  expect(received.mock.calls).toEqual([["get_status"]]);
});

it("never falls back to a default instance when an explicit descriptor is missing", async () => {
  const { bridge, server } = await setup(80, 0);
  const validDescriptor = await fs.readFile(process.env.EASYDRAW_BRIDGE_DESCRIPTOR!, "utf8");
  const missing = path.join(os.tmpdir(), "easydraw-explicit-target-missing.json");
  vi.stubEnv("EASYDRAW_BRIDGE_DESCRIPTOR", missing);
  const reads: string[] = [];
  vi.spyOn(fs, "readFile").mockImplementation(async target => {
    reads.push(String(target));
    if (String(target) === missing) throw Object.assign(new Error("missing"), { code: "ENOENT" });
    return validDescriptor;
  });
  server.on("connection", socket => socket.on("message", raw => {
    const request = JSON.parse(String(raw));
    if (request.type === "request") socket.send(JSON.stringify({ type: "response", id: request.id, ok: true, result: {} }));
  }));
  bridge.start();
  await expect(bridge.request("get_status", {})).rejects.toThrow("开启 MCP 访问");
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.every(target => target === missing)).toBe(true);
});

it("cancels connection waiters when the MCP server closes", async () => {
  const { bridge } = await setup();
  bridge.start();
  const result = bridge.request("get_status", {});
  bridge.close();
  await expect(result).rejects.toThrow("MCP Server 已关闭");
  await expect(bridge.request("get_status", {})).rejects.toThrow("MCP Server 已关闭");
});

it("does not replay a dispatched write after the socket disconnects", async () => {
  const { bridge, server } = await setup();
  let writes = 0;
  server.on("connection", socket => socket.on("message", raw => {
    if (JSON.parse(String(raw)).type !== "request") return;
    writes++;
    socket.close();
  }));
  bridge.start();
  await expect(bridge.request("manage_project_tree", { requestId: "uncertain-write" })).rejects.toThrow("桌面连接已断开");
  expect(writes).toBe(1);
});

it("does not dispatch when closed immediately after an already-open request starts", async () => {
  const { bridge, server } = await setup();
  let writes = 0;
  server.on("connection", socket => socket.on("message", raw => {
    const request = JSON.parse(String(raw));
    if (request.type !== "request") return;
    writes++;
    socket.send(JSON.stringify({ type: "response", id: request.id, ok: true, result: {} }));
  }));
  bridge.start();
  await bridge.request("get_status", {});
  const result = bridge.request("manage_project_tree", {});
  bridge.close();
  await expect(result).rejects.toThrow("MCP Server 已关闭");
  expect(writes).toBe(1);
});
