import { NativeProjectDocumentSchema } from "@easydraw/document-model";
import type { AppLocale } from "./i18n";
import type { ElementStyle, ProjectDocument, OperationBatch } from "./protocol";
import type { ElementCreateInput, DrawableCreateInput } from "./element-input";
import { createElementFromInput } from "./element-commands";

const defaultTextStyle = (
  stroke: string,
  fontSize: number,
): ElementStyle => ({
  fill: "transparent",
  stroke,
  strokeWidth: 0,
  radius: 0,
  opacity: 1,
  fontSize,
  textAlign: "left",
});

export const createInitialDocument = (
  name?: string,
  locale: AppLocale = "zh-CN",
): ProjectDocument => NativeProjectDocumentSchema.parse({
  schemaVersion: 3,
  projectId: `project_${crypto.randomUUID()}`,
  name: name ?? (locale === "en" ? "Untitled prototype" : "未命名原型"),
  revision: 0,
  focusedPageElementId: "page-home",
  updatedAt: new Date().toISOString(),
  assets: [],
  scene: {
    elements: ([
      {
        id: "page-home",
        type: "page",
        name: locale === "en" ? "Home" : "首页",
        x: 0,
        y: 0,
        width: 390,
        height: 844,
        rotation: 0,
        background: "#ffffff",
        rounded: true,
        order: 0,
        exportScale: 2,
        locked: false,
        groupIds: [],
      },
      {
        id: "welcome-title",
        type: "text",
        containerId: "page-home",
        x: 28,
        y: 36,
        width: 220,
        height: 36,
        rotation: 0,
        text: locale === "en" ? "Start designing your page" : "开始设计你的页面",
        style: defaultTextStyle("#1f2937", 24),
        locked: false,
        groupIds: [],
      },
      {
        id: "welcome-note",
        type: "text",
        containerId: "page-home",
        x: 28,
        y: 84,
        width: 310,
        height: 48,
        rotation: 0,
        text:
          locale === "en"
            ? "Apply the demo transaction to test AI batch edits, revision conflicts, and transaction undo."
            : "应用演示事务，验证 AI 批量修改、修订冲突与整轮撤销。",
        style: defaultTextStyle("#667085", 15),
        locked: false,
        groupIds: [],
      },
    ] satisfies ElementCreateInput[]).map((input) => createElementFromInput(input)),
  },
});

const createDrawable = (
  element: Omit<DrawableCreateInput, "containerId">,
): DrawableCreateInput => ({
  ...element,
  containerId: "page-home",
});

export const createDemoBatch = (revision: number): OperationBatch => ({
  scopeElementId: "page-home",
  baseRevision: revision,
  transactionLabel: "生成外卖首页基础结构",
  operations: [
    {
      op: "create",
      element: createDrawable({
        id: "search-box",
        type: "rectangle",
        x: 24,
        y: 156,
        width: 342,
        height: 48,
        rotation: 0,
        style: {
          fill: "#f4f5f7",
          stroke: "#d8dce3",
          strokeWidth: 1,
          radius: 12,
          opacity: 1,
          fontSize: 16,
          textAlign: "left",
        },
        locked: false,
        groupIds: [],
      }),
    },
    {
      op: "create",
      element: createDrawable({
        id: "search-label",
        type: "text",
        x: 44,
        y: 170,
        width: 220,
        height: 24,
        rotation: 0,
        text: "搜索餐厅或菜品",
        style: defaultTextStyle("#69707d", 15),
        locked: false,
        groupIds: [],
      }),
    },
    ...[0, 1, 2].flatMap((index) => {
      const y = 240 + index * 122;
      return [
        {
          op: "create" as const,
          element: createDrawable({
            id: `restaurant-card-${index + 1}`,
            type: "rectangle",
            x: 24,
            y,
            width: 342,
            height: 98,
            rotation: 0,
            style: {
              fill: "#ffffff",
              stroke: "#d8dce3",
              strokeWidth: 1,
              radius: 12,
              opacity: 1,
              fontSize: 16,
              textAlign: "left",
            },
            locked: false,
            groupIds: [],
          }),
        },
        {
          op: "create" as const,
          element: createDrawable({
            id: `restaurant-name-${index + 1}`,
            type: "text",
            x: 44,
            y: y + 22,
            width: 210,
            height: 28,
            rotation: 0,
            text: ["山野小馆", "今日便当", "南城面家"][index],
            style: defaultTextStyle("#1f2937", 18),
            locked: false,
            groupIds: [],
          }),
        },
        {
          op: "create" as const,
          element: createDrawable({
            id: `restaurant-meta-${index + 1}`,
            type: "text",
            x: 44,
            y: y + 58,
            width: 250,
            height: 22,
            rotation: 0,
            text: `评分 4.${9 - index} · 约 ${24 + index * 5} 分钟`,
            style: defaultTextStyle("#69707d", 13),
            locked: false,
            groupIds: [],
          }),
        },
      ];
    }),
  ],
});

