import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import type { BridgeResponse } from "@easydraw/editor-contracts/bridge";
type BridgeDescriptor = {
  version: number;
  endpoint: string;
  token: string;
  pid: number;
  appVersion: string;
};

const descriptorCandidates = () => {
  // An explicit target is authoritative, including when its service is disabled.
  // Never fall back to a different instance when that descriptor disappears.
  if (process.env.EASYDRAW_BRIDGE_DESCRIPTOR) return [process.env.EASYDRAW_BRIDGE_DESCRIPTOR];
  const candidates: string[] = [];
  if (process.platform === "win32" && process.env.APPDATA) {
    candidates.push(
      path.join(process.env.APPDATA, "easydraw", "mcp-bridge.json"),
      path.join(process.env.APPDATA, "EasyDraw", "mcp-bridge.json"),
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "easydraw",
        "mcp-bridge.json",
      ),
      path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "EasyDraw",
        "mcp-bridge.json",
      ),
    );
  } else {
    const configRoot =
      process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
    candidates.push(
      path.join(configRoot, "easydraw", "mcp-bridge.json"),
      path.join(configRoot, "EasyDraw", "mcp-bridge.json"),
    );
  }
  return [...new Set(candidates.filter((value): value is string => Boolean(value)))];
};

const readBridgeDescriptor = async () => {
  const failures: string[] = [];
  for (const candidate of descriptorCandidates()) {
    try {
      const descriptor = JSON.parse(
        await fs.readFile(candidate, "utf8"),
      ) as BridgeDescriptor;
      if (
        descriptor.version !== 1 ||
        !descriptor.endpoint?.startsWith("ws://127.0.0.1:") ||
        !descriptor.token
      ) {
        failures.push(`${candidate}（内容无效）`);
        continue;
      }
      return descriptor;
    } catch {
      failures.push(candidate);
    }
  }
  throw new Error(
    `EasyDraw 桌面应用尚未启动或本地连接信息不存在。已检查：${failures.join("、")}`,
  );
};

export class BridgeCommandError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}

export class EasyDrawBridge {
  private socket: WebSocket | null = null;
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connecting = false;
  private connectionWaiters = new Set<{ resolve: () => void; reject: (error: Error) => void }>();
  private stopped = false;
  private clientInfo: { name: string; version: string } | null = null;

  constructor(private readonly options: { connectionTimeoutMs?: number } = {}) {}

  setClientInfo(client: { name: string; version: string } | undefined) {
    if (!client) return;
    this.clientInfo = { name: client.name, version: client.version };
    this.sendClientInfo();
  }

  private sendClientInfo() {
    if (this.clientInfo && this.isConnected()) this.socket!.send(JSON.stringify({ type: "client_info", client: this.clientInfo }));
  }

  start() {
    this.stopped = false;
    void this.connect();
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async request(method: string, params: unknown) {
    await this.waitForConnection();
    if (this.stopped) throw new Error("EasyDraw MCP Server 已关闭");
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("EasyDraw 桌面连接已断开");

    const id = randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`EasyDraw 命令 ${method} 执行超时`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timeout });
      socket.send(
        JSON.stringify({ type: "request", id, method, params }),
      );
    });
  }

  private waitForConnection() {
    if (this.stopped) return Promise.reject(new Error("EasyDraw MCP Server 已关闭"));
    if (this.isConnected()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve: () => { clearTimeout(timeout); this.connectionWaiters.delete(waiter); resolve(); },
        reject: (error: Error) => { clearTimeout(timeout); this.connectionWaiters.delete(waiter); reject(error); },
      };
      const timeout = setTimeout(() => waiter.reject(new Error(
        "EasyDraw 桌面画布未连接。请先启动 EasyDraw、开启 MCP 访问，并保持项目处于打开状态。",
      )), this.options.connectionTimeoutMs ?? 5_000);
      this.connectionWaiters.add(waiter);
      void this.connect();
    });
  }

  private async connect() {
    if (this.stopped || this.socket || this.connecting) return;
    this.connecting = true;
    try {
      const descriptor = await readBridgeDescriptor();
      if (this.stopped) return;
      const url = new URL(descriptor.endpoint);
      url.searchParams.set("token", descriptor.token);
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.on("open", () => {
        this.sendClientInfo();
        for (const waiter of this.connectionWaiters) waiter.resolve();
        process.stderr.write(
          `[easydraw-mcp] connected to EasyDraw ${descriptor.appVersion}\n`,
        );
      });
      socket.on("message", (data) => this.handleMessage(String(data)));
      socket.on("close", () => {
        if (this.socket === socket) this.socket = null;
        this.rejectPending("EasyDraw 桌面连接已断开");
        this.scheduleReconnect();
      });
      socket.on("error", () => socket.close());
    } catch {
      this.scheduleReconnect();
    } finally { this.connecting = false; }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, 1_500);
  }

  private handleMessage(raw: string) {
    let response: BridgeResponse;
    try {
      response = JSON.parse(raw) as BridgeResponse;
    } catch {
      return;
    }
    if (response.type !== "response") {
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(
        new BridgeCommandError(response.error?.code ?? "APP_COMMAND_FAILED", response.error?.message ?? "未知错误", response.error?.details),
      );
    }
  }

  private rejectPending(message: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  close() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    for (const waiter of this.connectionWaiters) waiter.reject(new Error("EasyDraw MCP Server 已关闭"));
    this.rejectPending("EasyDraw MCP Server 已关闭");
  }
}
