/** Commands from UI/MCP. These are inputs, never stored scene elements. */
import { z } from "zod";
import { SvgVectorDataSchema } from "@easydraw/document-model";

export const DrawableElementTypeSchema = z.enum([
  "rectangle",
  "ellipse",
  "line",
  "arrow",
  "text",
  "image",
  "icon",
]);

export const ElementTypeSchema = z.enum([
  "page",
  "rectangle",
  "ellipse",
  "line",
  "arrow",
  "text",
  "image",
  "icon",
  "group",
]);

export type ElementType = z.infer<typeof ElementTypeSchema>;

export const ElementStyleSchema = z.object({
  fill: z.string().default("transparent"),
  stroke: z.string().default("#1f2937"),
  strokeWidth: z.number().min(0).max(20).default(1),
  radius: z.number().min(0).max(64).default(0),
  opacity: z.number().min(0).max(1).default(1),
  fontSize: z.number().min(8).max(160).default(20),
  fontFamily: z.number().int().min(1).max(1000).optional(),
  textAlign: z.enum(["left", "center", "right"]).default("left"),
});

export type ElementStyle = z.infer<typeof ElementStyleSchema>;

export const LinearPointSchema = z
  .array(z.number().finite())
  .length(2)
  .transform((point): [number, number] => [point[0]!, point[1]!]);

export type LinearPoint = z.infer<typeof LinearPointSchema>;

const SharedElementFields = {
  id: z.string().min(1).max(128),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(10000),
  height: z.number().positive().max(10000),
  rotation: z.number().finite().default(0),
  locked: z.boolean().default(false),
  groupIds: z.array(z.string()).default([]),
};

export const DrawableCreateInputSchema = z
  .object({
    ...SharedElementFields,
    type: DrawableElementTypeSchema,
    containerId: z.string().min(1).nullable().default(null),
    points: z.array(LinearPointSchema).min(2).max(256).optional(),
    text: z.string().max(10000).optional(),
    assetId: z.string().min(1).max(256).optional(),
    altText: z.string().max(500).optional(),
    vectorData: SvgVectorDataSchema.optional(),
    style: ElementStyleSchema,
  })
  .superRefine((element, context) => {
    const isLinear = element.type === "line" || element.type === "arrow";
    if (isLinear && !element.points) {
      context.addIssue({
        code: "custom",
        message: "直线和箭头必须包含路径点",
        path: ["points"],
      });
    }
    if (!isLinear && element.points) {
      context.addIssue({
        code: "custom",
        message: "只有直线和箭头可以包含路径点",
        path: ["points"],
      });
    }
    if (element.type !== "icon" && element.vectorData) {
      context.addIssue({
        code: "custom",
        message: "只有图标元素可以包含 SVG 贝塞尔路径数据",
        path: ["vectorData"],
      });
    }
    if (element.type === "icon" && !element.vectorData) {
      context.addIssue({
        code: "custom",
        message: "图标元素必须包含 SVG 贝塞尔路径数据",
        path: ["vectorData"],
      });
    }
    if (
      element.type === "icon" &&
      (element.style.fill !== "transparent" ||
        element.style.stroke === "transparent" ||
        element.style.strokeWidth !== 0 ||
        element.style.radius !== 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "图标宿主必须透明、无描边且无圆角",
        path: ["style"],
      });
    }
  });

export type DrawableCreateInput = z.infer<
  typeof DrawableCreateInputSchema
>;

export const PageCreateInputSchema = z.object({
  ...SharedElementFields,
  type: z.literal("page"),
  name: z.string().min(1).max(160),
  background: z.string().default("#ffffff"),
  rounded: z.boolean().default(true),
  order: z.number().int().nonnegative().default(0),
  exportScale: z.number().min(0.25).max(4).default(2),
});

export type PageCreateInput = z.infer<typeof PageCreateInputSchema>;

export const ElementCreateInputSchema = z.union([
  PageCreateInputSchema,
  DrawableCreateInputSchema,
]);

export type ElementCreateInput = z.infer<typeof ElementCreateInputSchema>;

