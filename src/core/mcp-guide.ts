import type { McpConnectionInfo } from "./mcp-bridge";

type Translate = (key: string) => string;
interface GuideSection {
  title: string;
  paragraphs: string[];
  steps?: string[];
  code?: string;
  language?: string;
}

export function buildMcpGuide(info: McpConnectionInfo | null, t: Translate) {
  const title = t("EasyDraw MCP 接入指南");
  const introduction = t("复制下方指南交给你的Agent执行");
  const sections: GuideSection[] = [
    {
      title: t("1. Agent 执行步骤"), paragraphs: [
        t("请将 EasyDraw 接入你当前使用的 MCP 客户端，并完成只读连接验证。"),
      ], steps: [
        t("先检查客户端是否支持 stdio MCP，确认其配置位置、格式和已有 easydraw 条目。不要假设所有客户端使用相同路径或 mcpServers JSON 格式。"),
        t("使用下方 command、args、env 的原值，转换为当前客户端支持的格式；保留参数顺序、路径和环境变量。只添加或更新 easydraw，保留其他服务及设置，不要覆盖整个配置文件。"),
        t("若没有配置修改权限，提供具体的人工操作步骤；已有配置无法解析时不要覆盖。不要声称已完成尚未执行的修改或验证。"),
        t("按客户端支持的方式重新加载 MCP 或提示用户新建会话，确认 easydraw 工具已出现，再调用 get_status。"),
        t("验证成功后报告 documentId、canvasId 和 revision。接入验证只读取状态，不创建画布、不修改项目；实际编辑需另有用户任务。"),
      ],
    },
    {
      title: t("2. 当前启动配置"), paragraphs: [
        t("使用下方当前安装的启动配置，无需另装 Node.js。若路径失效，请让用户从当前应用重新复制指南；不要读取或复制桥接描述文件中的令牌。"),
        ...(!info ? [t("当前启动配置尚未就绪，请让用户在 EasyDraw 桌面端重新复制指南。")]: []),
      ], code: info ? JSON.stringify(info.config, null, 2) : undefined, language: "json",
    },
    {
      title: t("3. 验证与排障"), paragraphs: [], steps: [
        t("调用 get_status，检查返回的 documentId、canvasId 和 revision；仅看到“已开启”或客户端名称不代表工具调用成功。"),
        t("找不到工具：检查 easydraw 是否启用、启动配置是否保存，并重新加载 MCP 或新建会话。"),
        t("无法连接或应用未就绪：确认 EasyDraw 已启动、项目已打开、MCP 访问已开启，并检查启动路径是否仍有效。"),
      ],
    },
    {
      title: t("4. 可选：产品草图 Skill"), paragraphs: [
        t("MCP 连接不依赖 Skill。需要产品草图工作方法时，读取下方目录中的 SKILL.md 及引用文件；需要安装时，将整个目录复制到你支持的 Skill 目录。"),
        t("实际编辑前先调用 get_capabilities 了解能力和限制，再调用 begin_task；按最新 revision 提交修改，完成验证后调用 finish_task。"),
      ], code: info?.skillPath,
    },
  ];
  const text = [`# ${title}`, introduction, ...sections.flatMap(section => [
    `## ${section.title}`, ...section.paragraphs,
    ...(section.steps ? [section.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")] : []),
    ...(section.code ? [`\`\`\`${section.language ?? "text"}\n${section.code}\n\`\`\``] : []),
  ])].join("\n\n");
  return { title, introduction, sections, text };
}
