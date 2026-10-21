import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpDialog } from "./McpDialog";
import { translate } from "../core/i18n";
import type { McpRuntimeStatus } from "../core/mcp-bridge";

afterEach(() => vi.unstubAllGlobals());
const status: McpRuntimeStatus = { enabled: false, listening: false, rendererReady: true, clientCount: 0, clients: [], port: null, descriptorVersion: 1 };
function render(runtime: McpRuntimeStatus | null = status, { desktop = true, loading = false, skillUpdateAvailable = false, locale = "zh-CN" as "en" | "zh-CN" } = {}) {
  vi.stubGlobal("window", { easydrawDesktop: desktop ? {} : undefined });
  return renderToStaticMarkup(createElement(McpDialog, {
    mcpDialogOpen: true, setMcpDialogOpen: () => {}, t: (key, values) => translate(locale, key, values),
    mcpRuntime: runtime, mcpLoading: loading, setMcpEnabled: async () => {},
    skillUpdateAvailable, acknowledgeSkillUpdate: () => {},
    mcpConnectionInfo: desktop ? { transport: "stdio", config: { mcpServers: { easydraw: { command: "EasyDraw", args: ["mcp-server.cjs"], env: { ELECTRON_RUN_AS_NODE: "1" } } } }, skillPath: "/bundled/easydraw-product-sketch" } : null,
  }));
}

describe("generic MCP service dialog", () => {
  it("shows one service switch and no preconfigured agent support rows", () => {
    const html = render();
    expect(html).toContain('role="switch" aria-checked="false"');
    expect(html).not.toContain("复制接入信息");
    expect(html).toContain("查看接入指南");
    expect(html).toContain('<h2 id="mcp-dialog-title">AI</h2>');
    expect(html).toContain('id="ai-tab-skills"');
    expect(html).not.toMatch(/管理 MCP 连接|mcp-service-status|客户端名称由对方报告|复制 Skills 目录/);
    expect(html).not.toMatch(/<details|mcp-command/);
    expect(html).not.toMatch(/添加到|重新检测|Codex|DeepSeek|data-mcp-client=/);
  });
  it("shows only an accessible dot on the Skills tab for updates", () => {
    expect(render()).not.toContain('class="skill-update-dot"');
    expect(render(status, { skillUpdateAvailable: true })).toContain('class="skill-update-dot" role="img" aria-label="Skills 有新版本"');
    expect(render(status, { skillUpdateAvailable: true })).not.toMatch(/skill-update-badge|mcp-skill-update|>新版本</);
  });
  it("deduplicates clients by name across versions while keeping unnamed clients and escaping names", () => {
    const html = render({ ...status, enabled: true, listening: true, clientCount: 5, clients: [
      { name: "Future Agent", version: "2.0" }, { name: "Future Agent", version: "2.1" },
      { name: null, version: null },
      { name: null, version: null }, { name: "<script>alert(1)</script>", version: "test" },
    ] });
    expect(html).toContain('aria-checked="true"');
    expect(html.match(/data-mcp-client="Future Agent"/g)).toHaveLength(1);
    expect(html).toContain("2.0");
    expect(html).not.toContain("2.1");
    expect(html.match(/未提供名称的客户端/g)).toHaveLength(2);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("shows three connections with the same name as one client without changing runtime status", () => {
    const runtime = { ...status, enabled: true, listening: true, clientCount: 3, clients: Array.from({ length: 3 }, () => ({ name: "codex-mcp-client", version: "0.162.0-alpha.17.2" })) };
    const html = render(runtime);
    expect(html.match(/data-mcp-client="codex-mcp-client"/g)).toHaveLength(1);
    expect(runtime.clientCount).toBe(3);
    expect(runtime.clients).toHaveLength(3);
  });
  it("shows the switch state and hides stale clients when off", () => {
    expect(render({ ...status, enabled: true, listening: true })).toContain('aria-checked="true"');
    expect(render({ ...status, clients: [{ name: "Stale Client", version: "test" }], clientCount: 1 })).not.toContain("Stale Client");
  });
  it("disables toggling while busy or unavailable and does not offer development commands in browser preview", () => {
    expect(render(status, { loading: true })).toMatch(/role="switch"[^>]+disabled/);
    expect(render(null)).toMatch(/role="switch"[^>]+disabled/);
    const html = render(status, { desktop: false });
    expect(html).toMatch(/role="switch"[^>]+disabled/);
    expect(html).not.toContain("npm run mcp");
  });
  it("translates the client list and guide entry", () => {
    const html = render({ ...status, enabled: true, listening: true, clientCount: 1, clients: [{ name: null, version: null }] }, { locale: "en" });
    expect(html).toContain("Unnamed client");
    expect(html).toContain("View setup guide");
    expect(html).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
