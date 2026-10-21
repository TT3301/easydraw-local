import { z } from "zod";
import type {
  EasyDrawElement, EasyDrawTextElement, FileId, FractionalIndex,
} from "./elements";
import type { LocalPoint, Radians } from "./geometry";
import { SvgVectorDataSchema } from "./vector";

const finite = z.number().finite();
const id = z.string().min(1).max(256);
const point = z.tuple([finite, finite]).transform((value) => value as LocalPoint);
const binding = z.object({
  elementId: id, focus: finite, gap: finite,
  fixedPoint: z.tuple([finite, finite]).optional(),
}).passthrough();
const arrowhead = z.enum([
  "arrow", "bar", "dot", "circle", "circle_outline", "triangle", "triangle_outline",
  "diamond", "diamond_outline", "crowfoot_one", "crowfoot_many", "crowfoot_one_or_many",
]);

/** Validates native document elements without importing or running the renderer. */
export const ElementBaseSchema = z.object({
  id,
  x: finite.min(-1e6).max(1e6), y: finite.min(-1e6).max(1e6),
  width: finite.min(0).max(1e6), height: finite.min(0).max(1e6),
  angle: finite.transform((value) => value as Radians),
  strokeColor: z.string().max(512), backgroundColor: z.string().max(512),
  fillStyle: z.enum(["hachure", "cross-hatch", "solid", "zigzag"]),
  strokeWidth: finite.min(0).max(100000),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]),
  roundness: z.object({ type: z.union([z.literal(1), z.literal(2), z.literal(3)]), value: finite.min(0).optional() }).nullable(),
  roughness: finite.min(0).max(10), opacity: finite.min(0).max(100),
  seed: finite.int(), version: finite.int().min(1), versionNonce: finite.int(),
  index: z.string().transform((value) => value as FractionalIndex).nullable(),
  isDeleted: z.boolean(), groupIds: z.array(id), frameId: id.nullable(),
  boundElements: z.array(z.object({ id, type: z.enum(["arrow", "text"]) })).nullable(),
  updated: finite, link: z.string().nullable(), locked: z.boolean(),
  customData: z.record(z.string(), z.unknown()).optional(),
  vectorData: SvgVectorDataSchema.optional(), assetId: id.optional(),
  altText: z.string().max(500).optional(),
}).passthrough();

export const NativePageElementSchema = ElementBaseSchema.extend({
  type: z.literal("frame"), name: z.string().max(160).nullable(),
  order: finite.int().min(0), exportScale: finite.min(0.25).max(4),
});

const linearFields = {
  points: z.array(point).min(2), lastCommittedPoint: point.nullable(),
  startBinding: binding.nullable(), endBinding: binding.nullable(),
  startArrowhead: arrowhead.nullable(), endArrowhead: arrowhead.nullable(),
};

export const NativeElementSchema: z.ZodType<EasyDrawElement> = z.discriminatedUnion("type", [
  ElementBaseSchema.extend({ type: z.literal("rectangle") }),
  ElementBaseSchema.extend({ type: z.literal("diamond") }),
  ElementBaseSchema.extend({ type: z.literal("ellipse") }),
  ElementBaseSchema.extend({ type: z.literal("selection") }),
  ElementBaseSchema.extend({ type: z.literal("embeddable") }),
  ElementBaseSchema.extend({ type: z.literal("iframe") }),
  NativePageElementSchema,
  ElementBaseSchema.extend({ type: z.literal("magicframe"), name: z.string().nullable() }),
  ElementBaseSchema.extend({
    type: z.literal("text"), text: z.string().max(100000), originalText: z.string().max(100000),
    fontSize: finite.positive().max(10000), fontFamily: finite.int().positive(),
    textAlign: z.enum(["left", "center", "right"]), verticalAlign: z.enum(["top", "middle", "bottom"]),
    containerId: id.nullable(), autoResize: z.boolean(),
    lineHeight: finite.positive().transform((value) => value as EasyDrawTextElement["lineHeight"]),
  }),
  ElementBaseSchema.extend({
    type: z.literal("image"),
    fileId: id.transform((value) => value as FileId).nullable(),
    status: z.enum(["pending", "saved", "error"]), scale: z.tuple([finite, finite]),
    crop: z.object({ x: finite, y: finite, width: finite, height: finite,
      naturalWidth: finite, naturalHeight: finite }).nullable(),
  }),
  ElementBaseSchema.extend({ type: z.literal("line"), ...linearFields }),
  ElementBaseSchema.extend({
    type: z.literal("arrow"), ...linearFields, elbowed: z.boolean(),
    fixedSegments: z.array(z.object({ start: point, end: point, index: finite.int() })).nullable().optional(),
    startIsSpecial: z.boolean().nullable().optional(), endIsSpecial: z.boolean().nullable().optional(),
  }),
  ElementBaseSchema.extend({
    type: z.literal("freedraw"), points: z.array(point), pressures: z.array(finite),
    simulatePressure: z.boolean(), lastCommittedPoint: point.nullable(),
  }),
]).superRefine((element, context) => {
  if (element.vectorData && element.type !== "rectangle") {
    context.addIssue({ code: "custom", path: ["vectorData"], message: "Vector geometry requires a rectangular transform host" });
  }
  // These fields belong to the old document model and must never enter a new
  // runtime document. Old document versions are outside the current migration scope.
  for (const key of ["style", "rotation", "background", "rounded"]) {
    if (key in element) context.addIssue({ code: "custom", path: [key], message: `Legacy field ${key} is not supported` });
  }
});
