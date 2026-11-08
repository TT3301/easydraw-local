import { z } from "zod";
import { SvgVectorDataSchema, FONT_FAMILY } from "@easydraw/document-model";

const id = z.string().min(1).max(256);
const finite = z.number().finite();
const ids = z.array(id).min(1).max(500);
export const BoundsSchema = z.object({ x: finite, y: finite, width: finite.positive(), height: finite.positive() }).strict();
// Object-only unions also declare their outer type for model/client argument decoders.
// Preserve oneOf branch validation; JSON-encoded strings are still invalid inputs.
export const CanvasScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("document") }).strict(),
  z.object({ kind: z.literal("container"), id }).strict(),
  z.object({ kind: z.literal("elements"), ids }).strict(),
  z.object({ kind: z.literal("bounds"), bounds: BoundsSchema }).strict(),
]).meta({ type: "object" });
export type CanvasScope = z.infer<typeof CanvasScopeSchema>;
const projectInput = { documentId: id };
const documentInput = { ...projectInput, canvasId: id };
const readInput = { ...documentInput, revision: finite.int().nonnegative().optional() };
export const CanvasElementTypeSchema = z.enum(["frame", "rectangle", "diamond", "ellipse", "line", "arrow", "text", "image", "freedraw"]);
// MCP clients may reject draft-7 tuple schemas (`items: [schema, schema]`).
// Keep the runtime tuple type while publishing a homogeneous, fixed-size array.
const point = z.array(finite).length(2).transform(([x, y]): [number, number] => [x, y]);
const binding = z.object({ elementId: id, focus: finite.min(-1).max(1).default(0), gap: finite.nonnegative().default(5), fixedPoint: point.optional() }).strict();
const connectorBindingHelp = "Connector target: rectangle, diamond, ellipse, image, free text or frame (page-to-page flows). Writes never bind automatically by proximity; set the binding explicitly so the endpoint follows its target.";
const nativeFields = {
  x: finite, y: finite, width: finite.nonnegative().max(100000), height: finite.nonnegative().max(100000),
  angle: finite, frameId: id.nullable(), groupIds: z.array(id).max(32), locked: z.boolean(),
  strokeColor: z.string().max(512), backgroundColor: z.string().max(512),
  fillStyle: z.enum(["solid", "hachure", "cross-hatch", "zigzag"]),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]), strokeWidth: finite.nonnegative().max(1000),
  roughness: finite.min(0).max(10), opacity: finite.min(0).max(100),
  roundness: z.object({ type: z.union([z.literal(1), z.literal(2), z.literal(3)]), value: finite.nonnegative().optional() }).strict().nullable(),
  text: z.string().max(10000), fontSize: finite.positive().max(1000),
  fontFamily: z.number().int().refine(value => Object.values(FONT_FAMILY).includes(value), "Unsupported font family"),
  textAlign: z.enum(["left", "center", "right"]),
  verticalAlign: z.enum(["top", "middle", "bottom"]).describe("Position of text inside its containerId shape. Free text boxes always fit their content, so it has no visible effect without containerId."),
  lineHeight: finite.positive().max(10),
  autoResize: z.boolean().describe("Text only. true (default for new text): width and height are recomputed to fit the text without wrapping. false: width is kept, text wraps to it and height is recomputed. The measured size replaces the supplied size, as in the editor."),
  containerId: id.nullable(),
  name: z.string().max(160).nullable(), order: finite.int().nonnegative(), exportScale: finite.min(0.25).max(4),
  points: z.array(point).min(2).max(512), pressures: z.array(finite.min(0).max(1)).max(512), simulatePressure: z.boolean(),
  elbowed: z.boolean().describe("Arrow only. true (default for new arrows, as in the editor): the engine routes right-angle segments between the endpoints or bound elements; intermediate points are ignored. false: straight segments through points, or a curve with roundness {type:2}. Supplying a non-null roundness without elbowed creates a curved arrow."),
  startBinding: binding.nullable().describe(connectorBindingHelp),
  endBinding: binding.nullable().describe(connectorBindingHelp),
  startArrowhead: z.enum(["arrow", "bar", "dot", "triangle", "diamond", "circle"]).nullable(),
  endArrowhead: z.enum(["arrow", "bar", "dot", "triangle", "diamond", "circle"]).nullable(),
  vectorData: SvgVectorDataSchema, assetId: id, fileId: id.nullable(), altText: z.string().max(500),
  crop: z.object({ x: finite, y: finite, width: finite.positive(), height: finite.positive(), naturalWidth: finite.positive(), naturalHeight: finite.positive() }).strict().nullable(),
  customData: z.record(z.string().min(1).max(128), z.unknown()).nullable(), link: z.string().max(2048).nullable(),
};
export const CanvasElementPatchSchema = z.object(nativeFields).partial().strict();
export const CanvasElementCreateSchema = CanvasElementPatchSchema.extend({
  id: id.optional(), type: CanvasElementTypeSchema, x: finite, y: finite,
  width: finite.nonnegative().max(100000), height: finite.nonnegative().max(100000),
}).strict();
const selection = { ids };
const iconDescription = z.string().trim().min(1).max(200).describe("Short English icon description; local vector search selects the first match. Mutually exclusive with assetRef.").optional();
export const CanvasOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), ref: id.optional(), element: CanvasElementCreateSchema, assetRef: id.optional(), iconDescription }).strict()
    .refine(op => !(op.assetRef && op.iconDescription), "Use assetRef or iconDescription, not both")
    .refine(op => !op.iconDescription || op.element.type === "rectangle", "Icons require a rectangle host"),
  z.object({ op: z.literal("update"), id, patch: CanvasElementPatchSchema, assetRef: id.optional(), iconDescription }).strict()
    .refine(op => !(op.assetRef && op.iconDescription), "Use assetRef or iconDescription, not both"),
  z.object({ op: z.literal("delete"), ...selection, children: z.enum(["delete", "detach"]) }).strict(),
  z.object({ op: z.literal("duplicate"), ...selection, dx: finite.default(0), dy: finite.default(0), externalBindings: z.enum(["detach", "preserve"]).default("detach") }).strict(),
  z.object({ op: z.literal("move"), ...selection, dx: finite, dy: finite }).strict(),
  z.object({ op: z.literal("scale"), ...selection, factor: finite.positive().max(100), origin: point, scaleText: z.boolean().default(true), scaleStroke: z.boolean().default(true) }).strict(),
  z.object({ op: z.literal("rotate"), ...selection, angle: finite, origin: point }).strict(),
  z.object({ op: z.literal("reparent"), ...selection, frameId: id.nullable() }).strict(),
  z.object({ op: z.literal("reorder"), ...selection, position: z.enum(["front", "back", "before", "after"]), referenceId: id.optional() }).strict(),
  z.object({ op: z.literal("group"), ...selection, groupId: id.optional() }).strict(),
  z.object({ op: z.literal("ungroup"), ...selection, groupId: id }).strict(),
  z.object({ op: z.literal("align"), ...selection, alignment: z.enum(["left", "center-x", "right", "top", "center-y", "bottom"]), reference: BoundsSchema.optional() }).strict(),
  z.object({ op: z.literal("distribute"), ...selection, axis: z.enum(["horizontal", "vertical"]), gap: finite.nonnegative().optional() }).strict(),
  z.object({ op: z.literal("arrange"), ...selection, columns: z.number().int().min(1).max(500), origin: point, gapX: finite.nonnegative().default(16), gapY: finite.nonnegative().default(16) }).strict(),
  z.object({ op: z.literal("fit_container"), id, padding: finite.nonnegative().max(1000).default(24) }).strict(),
]).meta({ type: "object" });
export type CanvasOperation = z.infer<typeof CanvasOperationSchema>;
export const ApplyOperationsSchema = z.object({
  ...documentInput, baseRevision: finite.int().nonnegative(), requestId: id,
  taskId: id.describe("Active begin_task ID covering this batch. Required for real edits; dryRun may omit it.").optional(),
  label: z.string().min(1).max(160), dryRun: z.boolean().default(false),
  coordinateSpace: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("canvas") }).strict(),
    z.object({ kind: z.literal("container"), id }).strict(),
  ]).meta({ type: "object" }).default({ kind: "canvas" }),
  operations: z.array(CanvasOperationSchema).min(1).max(500),
}).strict();
export type ApplyOperationsInput = z.infer<typeof ApplyOperationsSchema>;
export const OutlineSchema = z.object({ ...readInput, scope: CanvasScopeSchema, offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(200).default(50) }).strict();
export const QuerySchema = z.object({
  ...readInput, scope: CanvasScopeSchema, ids: z.array(id).max(500).optional(), types: z.array(CanvasElementTypeSchema).optional(),
  groupIds: z.array(id).max(100).optional(), textQuery: z.string().max(200).optional(), locked: z.boolean().optional(),
  metadata: z.object({ key: z.string().min(1), value: z.unknown() }).strict().optional(),
  fields: z.array(z.string().min(1)).min(1).max(50).optional(),
  offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(200).default(50),
}).strict();
export const ChangesSchema = z.object({ ...documentInput, sinceRevision: finite.int().nonnegative() }).strict();
export const ViewSchema = z.object({ ...documentInput }).strict();
export const SetViewSchema = z.object({ ...documentInput, selection: z.array(id).max(500).optional(), focusId: id.nullable().optional(), scrollX: finite.optional(), scrollY: finite.optional(), zoom: finite.min(0.1).max(10).optional(), fitIds: ids.optional() }).strict();
export const BoundsInputSchema = z.object({ ...readInput, scope: CanvasScopeSchema, includeStroke: z.boolean().default(false) }).strict();
export const TextMeasureSchema = z.object({ ...documentInput, text: z.string().max(10000), fontFamily: nativeFields.fontFamily.default(6), fontSize: nativeFields.fontSize.default(20), lineHeight: nativeFields.lineHeight.default(1.35), maxWidth: finite.positive().optional() }).strict();
export const SearchAssetsSchema = z.object({ ...documentInput, sources: z.array(z.enum(["document", "builtin"])).min(1), query: z.string().max(200).default(""), category: z.enum(["icon", "placeholder", "image", "vector"]).optional(), format: z.enum(["vector", "raster"]).optional(), offset: finite.int().nonnegative().default(0), limit: finite.int().min(1).max(100).default(20) }).strict();
export const GetAssetsSchema = z.object({ ...documentInput, assetRefs: z.array(id).min(1).max(20), content: z.boolean().default(false) }).strict();
export const ImportAssetsSchema = z.object({ ...documentInput, requestId: id, assets: z.array(z.object({ data: z.string().min(1).max(8 * 1024 * 1024), mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]), fileName: z.string().min(1).max(255) }).strict()).min(1).max(10) }).strict();
export const BeginTaskSchema = z.object({ ...documentInput, taskId: id, label: z.string().min(1).max(160), scope: CanvasScopeSchema, ttlMs: finite.int().min(1000).max(600000).default(180000) }).strict();
export const FinishTaskSchema = z.object({ ...documentInput, taskId: id, status: z.enum(["completed", "failed", "cancelled"]), message: z.string().max(500).optional() }).strict();
export const CaptureSchema = z.object({ ...readInput, scope: CanvasScopeSchema, scale: finite.min(0.25).max(4).default(2), background: z.string().max(512).default("transparent"), padding: finite.nonnegative().max(1000).default(0) }).strict();
export const ExportSchema = CaptureSchema.extend({ format: z.enum(["png", "svg"]) }).strict();
export const InspectSchema = z.object({ ...readInput, scope: CanvasScopeSchema, checks: z.array(z.enum(["overlap", "out_of_bounds", "text_overflow", "references"])).min(1), limit: finite.int().min(1).max(500).default(100) }).strict();
export const HistorySchema = z.object({ ...documentInput, action: z.enum(["list", "undo", "redo"]), baseRevision: finite.int().nonnegative().optional(), transactionId: id.optional(), offset: finite.int().nonnegative().default(0), limit: finite.int().min(1).max(100).default(20) }).strict();

export const ProjectTreeOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), type: z.literal("canvas"), name: z.string().trim().min(1).max(160).optional(), parentId: z.null() }).strict(),
  z.object({ op: z.literal("rename"), id, name: z.string().trim().min(1).max(160) }).strict(),
  z.object({ op: z.literal("move"), id, parentId: z.null(), beforeId: id.optional() }).strict(),
  z.object({ op: z.literal("delete"), id }).strict(),
  z.object({ op: z.literal("duplicate"), id }).strict(),
]).meta({ type: "object" });
export const CANVAS_TOOL_SCHEMAS = {
  get_project_tree: z.object(projectInput).strict(),
  switch_canvas: z.object(documentInput).strict(),
  manage_project_tree: z.object({ ...projectInput, baseRevision: finite.int().nonnegative(), requestId: id, operation: ProjectTreeOperationSchema }).strict(),
  get_capabilities: z.object({ includeSchemas: z.boolean().default(false) }).strict(), get_status: z.object({}).strict(),
  get_view_state: ViewSchema, set_view_state: SetViewSchema, get_outline: OutlineSchema, query_elements: QuerySchema,
  get_changes: ChangesSchema, apply_operations: ApplyOperationsSchema, measure_text: TextMeasureSchema, get_bounds: BoundsInputSchema,
  search_assets: SearchAssetsSchema, get_assets: GetAssetsSchema, import_assets: ImportAssetsSchema,
  begin_task: BeginTaskSchema, finish_task: FinishTaskSchema, capture: CaptureSchema, inspect_geometry: InspectSchema,
  export: ExportSchema, history: HistorySchema,
};
export type CanvasMethod = keyof typeof CANVAS_TOOL_SCHEMAS;
