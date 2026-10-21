import { describe, expect, it } from "vitest";
import { translate } from "./i18n";
import { buildMcpGuide } from "./mcp-guide";

const info = {
  transport: "stdio" as const,
  config: { mcpServers: { easydraw: { command: "/test install/EasyDraw", args: ["/test install/mcp-server.cjs"], env: { ELECTRON_RUN_AS_NODE: "1", EASYDRAW_BRIDGE_DESCRIPTOR: "/test/mcp-bridge.json" } } } },
  skillPath: "/test install/skills/easydraw-product-sketch",
};

describe("complete MCP setup guide", () => {
  it("copies every displayed section and exact launch values in Markdown, without runtime data", () => {
    const guide = buildMcpGuide({ ...info, token: "runtime-secret", project: "private-project" } as typeof info, key => key);
    expect(guide.sections).toHaveLength(4);
    expect(guide.introduction).toBe("复制下方指南交给你的Agent执行");
    expect(guide.text).not.toMatch(/人工接入|点击“复制接入信息”|可手动配置/);
    expect(guide.text).toContain(guide.title);
    expect(guide.text).toContain(guide.introduction);
    for (const section of guide.sections) {
      expect(guide.text).toContain(`## ${section.title}`);
      for (const text of [...section.paragraphs, ...section.steps ?? []]) expect(guide.text).toContain(text);
      if (section.code) expect(guide.text).toContain(section.code);
    }
    expect(JSON.parse(guide.text.match(/```json\n([\s\S]*?)\n```/)![1])).toEqual(info.config);
    expect(guide.text).toContain(info.skillPath);
    expect(guide.text).toContain("保留其他服务及设置");
    expect(guide.text).toContain("接入验证只读取状态");
    expect(guide.text).toContain("documentId、canvasId 和 revision");
    expect(guide.text).not.toMatch(/runtime-secret|private-project/);
  });
  it("translates the full guide into English", () => {
    const guide = buildMcpGuide(info, key => translate("en", key));
    expect(guide.text).toContain("Instructions for agents");
    expect(guide.text).toContain("do not replace the entire configuration file");
    expect(guide.text).not.toMatch(/[\u4e00-\u9fff]/);
  });
  it("explains unavailable launch information without inventing a configuration", () => {
    const guide = buildMcpGuide(null, key => translate("en", key));
    expect(guide.text).toContain("The launch configuration is not ready");
    expect(guide.text).not.toContain("```json");
    expect(guide.text).not.toMatch(/undefined|null|[\u4e00-\u9fff]/);
  });
});
