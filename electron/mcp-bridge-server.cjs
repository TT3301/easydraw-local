const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { WebSocketServer } = require("ws");

const DESCRIPTOR_VERSION = 1;

const writeJsonAtomic = async (targetPath, value) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(value, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }
};

class McpBridgeServer {
  constructor({
    descriptorPath,
    appVersion,
    onRequest,
    onStatusChange = () => {},
    requestTimeoutMs = 20_000,
  }) {
    this.descriptorPath = descriptorPath;
    this.appVersion = appVersion;
    this.onRequest = onRequest;
    this.onStatusChange = onStatusChange;
    this.requestTimeoutMs = requestTimeoutMs;
    this.server = null;
    this.port = null;
    this.token = crypto.randomBytes(32).toString("base64url");
    this.clients = new Set();
    this.clientIdentities = new Map();
    this.pending = new Map();
    this.rendererReady = false;
  }

  getStatus() {
    return {
      listening: Boolean(this.server && this.port),
      port: this.port,
      clientCount: this.clients.size,
      clients: [...this.clients].map(socket => this.clientIdentities.get(socket) ?? { name: null, version: null }),
      rendererReady: this.rendererReady,
      descriptorVersion: DESCRIPTOR_VERSION,
    };
  }

  setRendererReady(ready) {
    this.rendererReady = ready;
    this.emitStatus();
  }

  async start() {
    if (this.server) return this.getStatus();

    this.token = crypto.randomBytes(32).toString("base64url");
    const server = new WebSocketServer({
      host: "127.0.0.1",
      port: 0,
    });
    this.server = server;

    server.on("connection", (socket, request) => {
      if (this.server !== server) { socket.terminate(); return; }
      let suppliedToken = "";
      try {
        const url = new URL(request.url ?? "/", "ws://127.0.0.1");
        suppliedToken = url.searchParams.get("token") ?? "";
      } catch {
        suppliedToken = "";
      }
      const expected = Buffer.from(this.token);
      const supplied = Buffer.from(suppliedToken);
      if (
        expected.length !== supplied.length ||
        !crypto.timingSafeEqual(expected, supplied)
      ) {
        socket.close(1008, "Unauthorized EasyDraw bridge client");
        return;
      }

      this.clients.add(socket);
      this.emitStatus();
      socket.on("message", (data) => {
        void this.handleClientMessage(socket, String(data));
      });
      socket.on("close", () => {
        this.clients.delete(socket);
        this.clientIdentities.delete(socket);
        for (const [bridgeId, pending] of this.pending) {
          if (pending.socket !== socket) continue;
          clearTimeout(pending.timeout);
          this.pending.delete(bridgeId);
        }
        this.emitStatus();
      });
      socket.on("error", () => {
        // The close event performs cleanup and publishes the new status.
      });
    });

    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("EasyDraw MCP bridge did not receive a TCP port");
    }
    this.port = address.port;
    await writeJsonAtomic(this.descriptorPath, {
      version: DESCRIPTOR_VERSION,
      endpoint: `ws://127.0.0.1:${this.port}`,
      token: this.token,
      pid: process.pid,
      appVersion: this.appVersion,
      createdAt: new Date().toISOString(),
    });
    this.emitStatus();
    return this.getStatus();
  }

  async handleClientMessage(socket, raw) {
    if (!this.server || !this.clients.has(socket) || socket.readyState !== socket.OPEN) return;
    let request;
    try {
      request = JSON.parse(raw);
    } catch {
      this.sendError(socket, null, "INVALID_REQUEST", "请求不是有效 JSON");
      return;
    }
    if (request?.type === "client_info") {
      const name = request.client?.name;
      const version = request.client?.version;
      const unsafeText = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
      if (typeof name === "string" && typeof version === "string" && name.trim().length > 0 && name.length <= 128 && version.length <= 64 && !unsafeText.test(name) && !unsafeText.test(version)) {
        // Standard clientInfo is self-reported display data, not a permission or allowlist.
        this.clientIdentities.set(socket, { name: name.trim(), version });
        this.emitStatus();
      }
      return;
    }
    if (
      !request ||
      request.type !== "request" ||
      typeof request.id !== "string" ||
      typeof request.method !== "string"
    ) {
      this.sendError(
        socket,
        typeof request?.id === "string" ? request.id : null,
        "INVALID_REQUEST",
        "EasyDraw MCP 请求结构无效",
      );
      return;
    }
    if (!this.rendererReady) {
      this.sendError(
        socket,
        request.id,
        "APP_NOT_READY",
        "EasyDraw 画布仍在启动，请稍后重试",
      );
      return;
    }

    const bridgeId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      this.pending.delete(bridgeId);
      this.sendError(
        socket,
        request.id,
        "APP_COMMAND_TIMEOUT",
        `EasyDraw 命令 ${request.method} 执行超时`,
      );
    }, this.requestTimeoutMs);
    this.pending.set(bridgeId, {
      socket,
      originalId: request.id,
      timeout,
    });

    try {
      await this.onRequest({
        type: "request",
        id: bridgeId,
        method: request.method,
        params: request.params,
      });
    } catch (error) {
      clearTimeout(timeout);
      this.pending.delete(bridgeId);
      this.sendError(
        socket,
        request.id,
        "APP_NOT_READY",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  handleRendererResponse(response) {
    if (
      !response ||
      response.type !== "response" ||
      typeof response.id !== "string"
    ) {
      return false;
    }
    const pending = this.pending.get(response.id);
    if (!pending) return false;
    clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    if (pending.socket.readyState !== pending.socket.OPEN) return false;
    pending.socket.send(
      JSON.stringify({
        ...response,
        id: pending.originalId,
      }),
    );
    return true;
  }

  sendError(socket, id, code, message) {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: "response",
        id,
        ok: false,
        error: { code, message },
      }),
    );
  }

  emitStatus() {
    this.onStatusChange(this.getStatus());
  }

  async stop() {
    const server = this.server;
    this.server = null;
    this.port = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
    }
    this.pending.clear();
    // Terminate immediately: a peer need not cooperate with a close handshake.
    // Include rejected/closing sockets too, so shutdown cannot hang on them.
    for (const socket of server?.clients ?? []) socket.terminate();
    this.clients.clear();
    this.clientIdentities.clear();
    this.emitStatus();

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      const descriptor = JSON.parse(
        await fs.readFile(this.descriptorPath, "utf8"),
      );
      if (descriptor.pid === process.pid && descriptor.token === this.token) {
        await fs.rm(this.descriptorPath, { force: true });
      }
    } catch {
      // A missing or replaced descriptor belongs to no cleanup action here.
    }
    this.emitStatus();
  }
}

module.exports = {
  DESCRIPTOR_VERSION,
  McpBridgeServer,
};
