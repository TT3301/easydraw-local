import { createNativeElement, NativeElementSchema } from "@easydraw/document-model";
import type { EasyDrawElement, EasyDrawFrameElement } from "@easydraw/document-model";
import type { ElementCreateInput, PageCreateInput, DrawableCreateInput } from "./element-input";
import type { z } from "zod";
import type { SceneElementPatchSchema } from "./protocol";

// UI/MCP describe an intention; only native elements enter the document. No
// inverse conversion exists and the canvas consumes those same elements.
export function createElementFromInput(input: PageCreateInput): EasyDrawFrameElement;
export function createElementFromInput(input: DrawableCreateInput): Exclude<EasyDrawElement, EasyDrawFrameElement>;
export function createElementFromInput(input: ElementCreateInput): EasyDrawElement;
export function createElementFromInput(input: ElementCreateInput): EasyDrawElement {
  const base = {
    id: input.id, x: input.x, y: input.y, width: input.width, height: input.height,
    angle: input.rotation * Math.PI / 180, locked: input.locked, groupIds: [...input.groupIds], roughness: 0,
  };
  if (input.type === "page") return createNativeElement({
    ...base, type: "frame", name: input.name, order: input.order, exportScale: input.exportScale,
    backgroundColor: input.background, roundness: input.rounded ? { type: 3 } : null,
  });
  const native = {
    ...base, type: input.type === "icon" ? "rectangle" as const : input.type,
    frameId: input.containerId, strokeColor: input.style.stroke,
    backgroundColor: input.type === "icon" || input.type === "text" ? "transparent" : input.style.fill,
    strokeWidth: input.style.strokeWidth, opacity: input.style.opacity * 100,
    roundness: input.style.radius ? { type: 3, value: input.style.radius } : null,
    ...(input.altText ? { altText: input.altText } : {}),
  };
  if (input.type === "text") return createNativeElement({
    ...native, text: input.text ?? "", fontSize: input.style.fontSize,
    fontFamily: input.style.fontFamily ?? 6, textAlign: input.style.textAlign,
  });
  if (input.type === "image") return createNativeElement({
    ...native, fileId: input.assetId ?? null, status: input.assetId ? "saved" : "pending",
  });
  if (input.type === "icon") return createNativeElement({
    ...native, vectorData: input.vectorData, assetId: input.assetId, strokeWidth: 0, roundness: null,
  });
  if (input.type === "line" || input.type === "arrow") return createNativeElement({ ...native, points: input.points });
  return createNativeElement(native);
}

function buildElementUpdate(element: EasyDrawElement, input: z.infer<typeof SceneElementPatchSchema>) {
  const { rotation, containerId, style, background, rounded, assetId, ...direct } = input;
  const patch: Record<string, unknown> = { ...direct };
  if (rotation !== undefined) patch.angle = rotation * Math.PI / 180;
  if (containerId !== undefined) patch.frameId = containerId;
  if (assetId !== undefined) patch[element.type === "image" ? "fileId" : "assetId"] = assetId;
  if (background !== undefined) patch.backgroundColor = background;
  if (rounded !== undefined) patch.roundness = rounded ? { type: 3 } : null;
  if (style) {
    if (style.fill !== undefined) patch.backgroundColor = style.fill;
    if (style.stroke !== undefined) patch.strokeColor = style.stroke;
    if (style.strokeWidth !== undefined) patch.strokeWidth = style.strokeWidth;
    if (style.opacity !== undefined) patch.opacity = style.opacity * 100;
    if (style.radius !== undefined) patch.roundness = style.radius ? { type: 3, value: style.radius } : null;
    if (element.type === "text") {
      if (style.fontSize !== undefined) patch.fontSize = style.fontSize;
      if (style.fontFamily !== undefined) patch.fontFamily = style.fontFamily;
      if (style.textAlign !== undefined) patch.textAlign = style.textAlign;
    }
  }
  if (element.type === "text" && input.text !== undefined) patch.originalText = input.text;
  return { ...element, ...patch, version: element.version + 1,
    versionNonce: (element.versionNonce + 1) % 2147483647, updated: Date.now() };
}

export const isVectorElement = (element: EasyDrawElement) => element.type === "rectangle" && !!element.vectorData;
export const getElementKind = (element: EasyDrawElement) => element.type === "frame" ? "page" : isVectorElement(element) ? "icon" : element.type;
export { getElementAssetId } from "@easydraw/document-model";

export const updateElementFromInput = (element: EasyDrawElement, input: z.infer<typeof SceneElementPatchSchema>) =>
  NativeElementSchema.parse(buildElementUpdate(element, input));
export const safeUpdateElementFromInput = (element: EasyDrawElement, input: z.infer<typeof SceneElementPatchSchema>) =>
  NativeElementSchema.safeParse(buildElementUpdate(element, input));
