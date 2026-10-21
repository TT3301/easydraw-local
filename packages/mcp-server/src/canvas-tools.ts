import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CANVAS_TOOL_SCHEMAS, type CanvasMethod } from "@easydraw/editor-contracts";
import type { EasyDrawBridge } from "./bridge-client";
import { textResult, toolError } from "./tool-results";

const descriptions: Record<CanvasMethod, string> = {
  get_project_tree: "读取整个项目的平铺画布列表、当前画布和项目 revision。",
  switch_canvas: "显式切换当前画布；未完成手势时拒绝，切换后重新读取状态。",
  manage_project_tree: "以项目 revision 和幂等 requestId 新建、重命名、排序、复制或删除画布（parentId 必须为 null）。",
  get_capabilities: "读取通用画布协议、字体、素材来源、格式与限制；includeSchemas=true 时返回元素/操作 Schema。",
  get_status: "读取当前文档 ID、revision、就绪与保存状态、活动任务。",
  get_view_state: "读取视口、缩放、聚焦对象及当前选择。",
  set_view_state: "设置视口与选择；不修改文档 revision。",
  get_outline: "读取显式范围的元素与分组摘要，支持分页；后续分页携带首次返回的 revision。",
  query_elements: "按显式范围、ID、原生类型、分组、文字、锁定与 metadata 查询；支持字段裁剪和 revision 校验。",
  get_changes: "读取某 revision 之后的变更摘要；历史过期返回 CHANGE_HISTORY_EXPIRED。",
  apply_operations: "真实编辑必须先 begin_task，并携带覆盖目标的活动 taskId；dryRun 可省略。保持任务到截图验证和修正完成再 finish_task。图标可用简短英文 iconDescription 自动选取第一名，颜色同时设置 strokeColor，无需先搜索。以一个原子事务提交通用编辑、素材引用和布局。本批涉及的 Frame 在成员超出底部时自动增高，宽度与成员位置不变，返回 frameHeightChanges；成员需显式 frameId，分组与局部坐标不代表归属。支持同批 ref、明确坐标系、dryRun、revision 与幂等 requestId。angle 使用弧度，opacity 使用 0–100。",
  measure_text: "通过画布实际字体测量文字，支持宽度约束与自动换行。",
  get_bounds: "获取指定范围的旋转后边界，按需包含描边。",
  search_assets: "仅搜索显式指定的 document 或 builtin 素材来源；不搜索互联网和用户硬盘。返回可直接用于 apply_operations 的 assetRef。",
  get_assets: "读取素材元数据，content=true 时包含内容供预览；内置素材不会因此进入文档。",
  import_assets: "导入 base64 图片或 SVG，校验并去重，返回会话素材句柄；引用素材时才加入文档事务。",
  begin_task: "编辑前声明任务及范围，apply_operations 携带此 taskId。现有页面用 container，多页用 elements，新页面用预定 bounds。任务贯穿编辑及验证，成功编辑自动续期，相同调用可续期。到期自动清理；不创建容器、不调整尺寸、不锁定编辑。",
  finish_task: "验证完成后结束任务；completed 等关联元素显示完再淡出，presentationPending 表示收尾中。failed/cancelled 立即结束。不修改文档与历史。",
  capture: "按显式范围输出 PNG 供视觉检查，返回截图边界和 revision。",
  inspect_geometry: "按显式 checks 返回几何与引用事实；重叠不自动判为设计错误。",
  export: "按显式范围导出 PNG 或 SVG 内容；不弹出保存对话框。",
  history: "分页列出历史，或撤销/重做预期的最近 AI 事务；写入时必须提供 baseRevision 和 transactionId。",
};
const readOnly = new Set<CanvasMethod>(["get_project_tree", "get_capabilities", "get_status", "get_view_state", "get_outline", "query_elements", "get_changes", "measure_text", "get_bounds", "search_assets", "get_assets", "capture", "inspect_geometry", "export"]);
export function registerCanvasTools(mcp: McpServer, bridge: EasyDrawBridge) {
  for (const name of Object.keys(CANVAS_TOOL_SCHEMAS) as CanvasMethod[]) {
    mcp.registerTool(name, {
      title: name, description: descriptions[name], inputSchema: CANVAS_TOOL_SCHEMAS[name].shape,
      annotations: { readOnlyHint: readOnly.has(name), destructiveHint: name === "apply_operations" || name === "history", openWorldHint: false },
    }, async (input: unknown) => {
      try {
        const result = await bridge.request(name, CANVAS_TOOL_SCHEMAS[name].parse(input));
        if (name === "capture") {
          const { data, mimeType, ...metadata } = result as { data: string; mimeType: string };
          return { ...textResult(metadata), content: [...textResult(metadata).content, { type: "image" as const, data, mimeType }] };
        }
        if (name === "get_assets") {
          const { items, ...envelope } = result as { items: Array<Record<string, unknown>> };
          const metadata = { ...envelope, items: items.map(({ data: _data, ...item }) => item) };
          const images = items.flatMap(item => typeof item.data === "string" && typeof item.mimeType === "string"
            ? [{ type: "image" as const, data: item.data, mimeType: item.mimeType }] : []);
          return { ...textResult(metadata), content: [...textResult(metadata).content, ...images] };
        }
        return textResult(result);
      } catch (error) { return toolError(error); }
    });
  }
}
