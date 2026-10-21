import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EasyDrawBridge } from "./bridge-client";
import { registerCanvasTools } from "./canvas-tools";
const bridge = new EasyDrawBridge();
bridge.start();
const mcp = new McpServer(
  { name: "easydraw", version: "0.3.0" },
  { instructions: "EasyDraw 提供通用画布能力。使用 get_capabilities 发现支持的原生元素、操作与限制，get_status 获取当前 documentId、canvasId 和 revision。真实编辑前调用 begin_task，apply_operations 携带活动 taskId，验证和修正完成后 finish_task。新页面可用预定 bounds 开始任务。内容请求携带 documentId 和 canvasId，先用 switch_canvas 切换目标画布再编辑。内容读取与输出必须显式指定 scope。文档写入统一使用 apply_operations，携带 documentId、最新 baseRevision 和唯一 requestId；成功后沿用返回的 revision。同一 requestId 重试必须使用完全相同的参数。坐标以画布单位计，angle 是弧度，opacity 是 0–100。图标默认在 apply_operations 的 create/update 操作中提供简短英文 iconDescription（rectangle 宿主），本地向量检索直接选择第一名，无需搜索预览确认。截图复刻时描述图标外观和用途。颜色在 element/patch.strokeColor 同时指定；已知精确素材可改用 assetRef，二者互斥。图片占位默认同批创建背景 rectangle/ellipse、居中小图标（固定 assetRef=builtin:placeholder:image-logo，最大32）并分组；背景与图标颜色分别设置，不通过向量选图。真实图片按需查找或导入。每个完成的区块立即提交，逐步绘制。布局策略、素材选择和验收规则由调用者决定。" },
);
registerCanvasTools(mcp, bridge);
mcp.server.oninitialized = () => bridge.setClientInfo(mcp.server.getClientVersion());
const transport = new StdioServerTransport();
process.once("SIGINT", () => {
  bridge.close();
  process.exit(0);
});
process.once("SIGTERM", () => {
  bridge.close();
  process.exit(0);
});
process.stdin.once("end", () => {
  bridge.close();
  process.exit(0);
});

void mcp.connect(transport).catch((error) => {
  process.stderr.write(
    `[easydraw-mcp] failed to start: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  bridge.close();
  process.exit(1);
});
