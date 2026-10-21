import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

const require = createRequire(import.meta.url);
const { McpBridgeServer } = require("./mcp-bridge-server.cjs") as {
  McpBridgeServer: new (options: {
    descriptorPath: string;
    appVersion: string;
    onRequest: (request: {
      type: "request";
      id: string;
      method: string;
      params: unknown;
    }) => Promise<void> | void;
    requestTimeoutMs?: number;
  }) => {
    start(): Promise<{
      port: number;
      clientCount: number;
    }>;
    stop(): Promise<void>;
    setRendererReady(ready: boolean): void;
    getStatus(): { clientCount: number; clients: Array<{ name: string | null; version: string | null }> };
    handleRendererResponse(response: {
      type: "response";
      id: string;
      ok: boolean;
      result?: unknown;
    }): boolean;
  };
};

const temporaryDirectories: string[] = [];
const runningServers: Array<{ stop(): Promise<void> }> = [];

const waitForOpen = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => server.stop()));
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("MCP bridge server", () => {
  it("displays arbitrary standard client identities without an agent allowlist", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "easydraw-bridge-identities-"));
    temporaryDirectories.push(directory);
    const descriptorPath = path.join(directory, "mcp-bridge.json");
    const bridge = new McpBridgeServer({ descriptorPath, appVersion: "test", onRequest: () => {} });
    runningServers.push(bridge); await bridge.start();
    const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8"));
    const sockets = Array.from({ length: 4 }, () => new WebSocket(`${descriptor.endpoint}?token=${descriptor.token}`));
    await Promise.all(sockets.map(waitForOpen));
    const identities = [
      { name: "Future Agent", version: "2.0" },
      { name: "codex-mcp-client", version: "test" },
      { name: "dsh-mcp-client", version: "0.0.1" },
    ];
    identities.forEach((client, i) => sockets[i].send(JSON.stringify({ type: "client_info", client })));
    await expect.poll(() => bridge.getStatus().clients.filter(c => c.name !== null).length).toBe(3);
    expect(bridge.getStatus()).toMatchObject({ clientCount: 4, clients: expect.arrayContaining([...identities, { name: null, version: null }]) });
    // Invalid display identities do not grant permissions or replace a valid name.
    sockets[0].send(JSON.stringify({ type: "client_info", client: { name: "bad\nname", version: "test" } }));
    sockets[3].send(JSON.stringify({ type: "client_info", client: { name: " ", version: "test" } }));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(bridge.getStatus().clients).toContainEqual(identities[0]);
    expect(bridge.getStatus().clients).toContainEqual({ name: null, version: null });
    sockets[0].close();
    await expect.poll(() => bridge.getStatus().clientCount).toBe(3);
    expect(bridge.getStatus().clients.some(c => c.name === "Future Agent")).toBe(false);
    sockets.forEach(socket => socket.close());
  });
  it("publishes an authenticated descriptor and routes renderer responses", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "easydraw-bridge-"),
    );
    temporaryDirectories.push(directory);
    const descriptorPath = path.join(directory, "mcp-bridge.json");

    let bridge:
      | InstanceType<(typeof McpBridgeServer)>
      | undefined;
    bridge = new McpBridgeServer({
      descriptorPath,
      appVersion: "0.2.0-test",
      onRequest: (request) => {
        bridge?.handleRendererResponse({
          type: "response",
          id: request.id,
          ok: true,
          result: { method: request.method, params: request.params },
        });
      },
    });
    runningServers.push(bridge);
    bridge.setRendererReady(true);
    await bridge.start();

    const descriptor = JSON.parse(
      await fs.readFile(descriptorPath, "utf8"),
    ) as {
      version: number;
      endpoint: string;
      token: string;
      pid: number;
      appVersion: string;
    };
    expect(descriptor).toMatchObject({
      version: 1,
      pid: process.pid,
      appVersion: "0.2.0-test",
    });
    expect(descriptor.token.length).toBeGreaterThan(30);

    const socket = new WebSocket(
      `${descriptor.endpoint}?token=${encodeURIComponent(descriptor.token)}`,
    );
    await waitForOpen(socket);
    const response = new Promise<unknown>((resolve, reject) => {
      socket.once("message", (data) => {
        try {
          resolve(JSON.parse(String(data)));
        } catch (error) {
          reject(error);
        }
      });
    });
    socket.send(
      JSON.stringify({
        type: "request",
        id: "client-request",
        method: "get_status",
        params: { from: "test" },
      }),
    );

    await expect(response).resolves.toEqual({
      type: "response",
      id: "client-request",
      ok: true,
      result: {
        method: "get_status",
        params: { from: "test" },
      },
    });
    socket.close();
  });

  it("rejects clients without the descriptor token", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "easydraw-bridge-auth-"),
    );
    temporaryDirectories.push(directory);
    const descriptorPath = path.join(directory, "mcp-bridge.json");
    const bridge = new McpBridgeServer({
      descriptorPath,
      appVersion: "test",
      onRequest: () => {},
    });
    runningServers.push(bridge);
    const status = await bridge.start();

    const socket = new WebSocket(`ws://127.0.0.1:${status.port}`);
    const closed = new Promise<number>((resolve) => {
      socket.once("close", (code) => resolve(code));
    });
    expect(await closed).toBe(1008);
  });
});
