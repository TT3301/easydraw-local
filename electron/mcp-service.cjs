const fs = require("node:fs/promises");
const path = require("node:path");
const { McpBridgeServer, DESCRIPTOR_VERSION } = require("./mcp-bridge-server.cjs");

// Owns authorization and persistence; agent configuration is never read or written.
class McpService {
  constructor({ settingsPath, descriptorPath, appVersion, onRequest, onStatusChange = () => {} }) {
    Object.assign(this, { settingsPath, descriptorPath, appVersion, onRequest, onStatusChange });
    this.enabled = false;
    this.rendererReady = false;
    this.bridge = null;
    this.queue = Promise.resolve();
    this.closed = false;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      ...(this.bridge?.getStatus() ?? {
        listening: false, port: null, clientCount: 0, clients: [],
        rendererReady: this.rendererReady, descriptorVersion: DESCRIPTOR_VERSION,
      }),
    };
  }

  emitStatus() { this.onStatusChange(this.getStatus()); }

  setRendererReady(ready) {
    this.rendererReady = ready;
    if (this.bridge) this.bridge.setRendererReady(ready);
    else this.emitStatus();
  }

  enqueue(work) {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }

  initialize() {
    return this.enqueue(async () => {
      let enabled = false;
      try {
        const settings = JSON.parse(await fs.readFile(this.settingsPath, "utf8"));
        enabled = settings.version === 1 && settings.enabled === true;
      } catch { /* Missing, invalid or unreadable settings fail closed. */ }
      if (enabled && !this.closed) await this.startBridge();
      else {
        // A descriptor left by a crashed process must not advertise a disabled service.
        await fs.rm(this.descriptorPath, { force: true });
        this.emitStatus();
      }
      return this.getStatus();
    });
  }

  async saveEnabled(enabled) {
    const temporaryPath = `${this.settingsPath}.tmp-${process.pid}`;
    try {
      await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
      await fs.writeFile(temporaryPath, `${JSON.stringify({ version: 1, enabled })}\n`, { encoding: "utf8", mode: 0o600 });
      await fs.rename(temporaryPath, this.settingsPath);
    } catch {
      throw new Error("MCP 开关状态无法保存，请检查应用数据目录权限。");
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
    }
  }

  async startBridge() {
    if (this.closed) throw new Error("MCP 服务已关闭。");
    this.enabled = true;
    const bridge = new McpBridgeServer({
      descriptorPath: this.descriptorPath,
      appVersion: this.appVersion,
      onRequest: request => {
        if (!this.enabled || this.bridge !== bridge || this.closed) throw new Error("MCP_DISABLED: MCP 服务已关闭。");
        return this.onRequest(request);
      },
      onStatusChange: () => this.emitStatus(),
    });
    this.bridge = bridge;
    bridge.setRendererReady(this.rendererReady);
    try {
      await bridge.start();
      if (this.closed) throw new Error("MCP 服务已关闭。");
    } catch {
      await this.stopBridge();
      throw new Error("无法开启 MCP 服务，请稍后重试。");
    }
  }

  async stopBridge() {
    const bridge = this.bridge;
    this.enabled = false;
    this.bridge = null;
    // Publish revocation before awaiting I/O, so renderer work is invalidated too.
    this.emitStatus();
    await bridge?.stop();
  }

  setEnabled(enabled) {
    if (typeof enabled !== "boolean") return Promise.reject(new Error("MCP 开关参数无效。"));
    return this.enqueue(async () => {
      if (this.closed) throw new Error("MCP 服务已关闭。");
      if (!enabled) {
        await this.stopBridge();
        await this.saveEnabled(false);
      } else {
        if (!this.bridge?.getStatus().listening) await this.startBridge();
        try { await this.saveEnabled(true); }
        catch (error) { await this.stopBridge(); throw error; }
      }
      return this.getStatus();
    });
  }

  handleRendererResponse(response) { return this.bridge?.handleRendererResponse(response) ?? false; }

  stop() {
    this.closed = true;
    // Normal shutdown keeps the saved preference for the next launch.
    return this.enqueue(() => this.stopBridge());
  }
}

module.exports = { McpService };
