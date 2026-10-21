import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "../core/i18n";
import { McpGuideDialog } from "./McpGuideDialog";

afterEach(() => vi.unstubAllGlobals());
function render(available = true, locale: "en" | "zh-CN" = "zh-CN") {
  vi.stubGlobal("window", { easydrawDesktop: available ? {} : undefined });
  return renderToStaticMarkup(createElement(McpGuideDialog, {
    t: key => translate(locale, key), onClose: () => {},
    mcpConnectionInfo: available ? { transport: "stdio", config: { mcpServers: { easydraw: { command: "<test>", args: ["bundle"], env: {} } } }, skillPath: "/test/skill" } : null,
  }));
}

describe("MCP guide dialog", () => {
  it("shows a separate modal with complete instructions and footer copy action", () => {
    const html = render();
    expect(html).toContain('role="dialog" aria-modal="true" aria-labelledby="mcp-guide-title"');
    expect(html).not.toContain("人工接入");
    expect(html).toContain("<p>复制下方指南交给你的Agent执行</p>");
    expect(html).toContain("Agent 执行步骤");
    expect(html).toContain("验证与排障");
    expect(html).toContain("get_status");
    expect(html).toContain("/test/skill");
    expect(html).toContain("&lt;test&gt;");
    expect(html.indexOf("复制接入信息</button>")).toBeGreaterThan(html.indexOf('class="mcp-guide-footer"'));
    expect(html).toContain("返回 AI");
  });
  it("disables copying unavailable configuration and translates the whole dialog", () => {
    expect(render(false)).toMatch(/disabled=""[^>]*>复制接入信息/);
    expect(render(true, "en")).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
