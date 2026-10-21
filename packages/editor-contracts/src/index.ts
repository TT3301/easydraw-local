import { z } from "zod";
import {
  NativeElementSchema as SceneElementSchema,
  NativePageElementSchema as PageElementSchema,
  NativeProjectDocumentSchema as ProjectDocumentSchema,
  ProjectAssetSchema, SvgVectorDataSchema, SvgVectorPathSchema,
} from "@easydraw/document-model";
import type {
  EasyDrawElement, EasyDrawFrameElement, NativeProjectDocument,
  ProjectAsset, VectorData as SvgVectorData, VectorPath as SvgVectorPath,
} from "@easydraw/document-model";
import {
  DrawableElementTypeSchema, ElementTypeSchema, ElementStyleSchema, LinearPointSchema,
  ElementCreateInputSchema,
} from "./element-input";
import type { ElementType, ElementStyle, LinearPoint } from "./element-input";
export { SceneElementSchema, PageElementSchema, ProjectDocumentSchema, ProjectAssetSchema,
  SvgVectorDataSchema, SvgVectorPathSchema, DrawableElementTypeSchema, ElementTypeSchema,
  ElementStyleSchema, LinearPointSchema };
export type { ProjectAsset, SvgVectorData, SvgVectorPath, ElementType, ElementStyle, LinearPoint };
export type SceneElement = EasyDrawElement;
export type PageElement = EasyDrawFrameElement;
export type DrawableSceneElement = Exclude<EasyDrawElement, EasyDrawFrameElement>;
export const DrawableSceneElementSchema = SceneElementSchema.refine((element) => element.type !== "frame")
  .transform((element) => element as DrawableSceneElement);
export const CanvasSceneSchema = z.object({ elements: z.array(SceneElementSchema) });
export type CanvasScene = z.infer<typeof CanvasSceneSchema>;
export type ProjectDocument = NativeProjectDocument;

const CreateOperationSchema = z.object({
  op: z.literal("create"),
  element: ElementCreateInputSchema,
});

export const SceneElementPatchSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().max(10000).optional(),
  height: z.number().positive().max(10000).optional(),
  rotation: z.number().finite().optional(),
  locked: z.boolean().optional(),
  groupIds: z.array(z.string()).optional(),
  containerId: z.string().min(1).nullable().optional(),
  points: z.array(LinearPointSchema).min(2).max(256).optional(),
  text: z.string().max(10000).optional(),
  assetId: z.string().min(1).max(256).optional(),
  altText: z.string().max(500).optional(),
  vectorData: SvgVectorDataSchema.optional(),
  style: ElementStyleSchema.partial().optional(),
  name: z.string().min(1).max(160).optional(),
  background: z.string().optional(),
  rounded: z.boolean().optional(),
  order: z.number().int().nonnegative().optional(),
  exportScale: z.number().min(0.25).max(4).optional(),
});

const UpdateOperationSchema = z.object({
  op: z.literal("update"),
  id: z.string().min(1),
  patch: SceneElementPatchSchema,
});

const DeleteOperationSchema = z.object({
  op: z.literal("delete"),
  id: z.string().min(1),
});

export const SceneOperationSchema = z.union([
  CreateOperationSchema,
  UpdateOperationSchema,
  DeleteOperationSchema,
]);

export type SceneOperation = z.infer<typeof SceneOperationSchema>;

export const OperationBatchSchema = z.object({
  scopeElementId: z.string().min(1).optional(),
  baseRevision: z.number().int().nonnegative(),
  transactionLabel: z.string().min(1).max(160),
  operations: z.array(SceneOperationSchema).min(1).max(500),
});

export type OperationBatch = z.infer<typeof OperationBatchSchema>;

export interface TransactionRecord {
  canvasId?: string | null;
  id: string;
  label: string;
  source: "human" | "ai";
  beforeRevision: number;
  afterRevision: number;
  createdIds: string[];
  updatedIds: string[];
  deletedIds: string[];
  committedAt: string;
}

export interface ApplyResult {
  ok: true;
  transaction: TransactionRecord;
  revision: number;
}

export interface ApplyError {
  ok: false;
  code:
    | "REVISION_CONFLICT"
    | "SCOPE_NOT_FOUND"
    | "ELEMENT_NOT_FOUND"
    | "DUPLICATE_ELEMENT_ID"
    | "INVALID_CONTAINER"
    | "VALIDATION_FAILED";
  message: string;
  revision: number;
}

export type ApplyBatchResult = ApplyResult | ApplyError;


export * from "./canvas";
