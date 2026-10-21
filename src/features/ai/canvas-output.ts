import { createNativeElement, type EasyDrawElement, type EasyDrawFrameElement } from "@easydraw/document-model";
import { exportToBlob, exportToSvg } from "@easydraw/canvas-engine";
import type { BinaryFiles } from "@easydraw/canvas-engine/types";
import type { CanvasScope, ProjectDocument } from "../../core/protocol";
import { scopeElements } from "../../core/canvas-query";
import { unionBounds } from "../../core/canvas-geometry";
import { renderedBounds } from "./canvas-runtime";
import { fail } from "../../core/canvas-commands";
import { blobToBase64 } from "../../canvas/export-page";
export async function renderCanvasScope(document: ProjectDocument, input: { scope: CanvasScope; scale: number; background: string; padding: number; format?: "png" | "svg" }, files: BinaryFiles | null) {
  const selected = scopeElements(document, input.scope);
  const contentBounds = input.scope.kind === "bounds" ? input.scope.bounds : input.scope.kind === "container"
    ? document.scene.elements.find(e => e.id === (input.scope as { id: string }).id)!
    : unionBounds(renderedBounds(selected, document.scene.elements, true));
  if (!contentBounds) return fail("EMPTY_SCOPE", "The requested scope is empty");
  const bounds = { x: contentBounds.x - input.padding, y: contentBounds.y - input.padding,
    width: Math.max(1, contentBounds.width + input.padding * 2), height: Math.max(1, contentBounds.height + input.padding * 2) };
  if (bounds.width * input.scale > 8192 || bounds.height * input.scale > 8192 || bounds.width * bounds.height * input.scale ** 2 > 16_000_000) fail("OUTPUT_TOO_LARGE", "Output is limited to 8192px per edge and 16 megapixels");
  const frame = createNativeElement({ id: "__capture_frame__", type: "frame", ...bounds, backgroundColor: input.background, name: null }) as EasyDrawFrameElement;
  // Flatten only the output copy. Document containers and their backgrounds remain intact.
  const backgrounds = selected.filter(e => e.type === "frame").map(e => createNativeElement({ id: `__background_${e.id}`, type: "rectangle", x: e.x, y: e.y, width: e.width, height: e.height, backgroundColor: e.backgroundColor, strokeWidth: 0, roundness: e.roundness, roughness: 0, frameId: frame.id }));
  const elements: EasyDrawElement[] = [...backgrounds, ...selected.filter(e => e.type !== "frame").map(e => ({ ...structuredClone(e), frameId: frame.id })), frame];
  const appState = { exportBackground: input.background !== "transparent", viewBackgroundColor: input.background, exportWithDarkMode: false };
  if (input.format === "svg") {
    const svg = await exportToSvg({ elements, files, exportingFrame: frame, exportPadding: 0, appState: { ...appState, exportScale: input.scale } });
    const data = await blobToBase64(new Blob([svg.outerHTML], { type: "image/svg+xml" }));
    if (data.length > 12 * 1024 * 1024) fail("OUTPUT_TOO_LARGE", "Encoded output exceeds 12MB");
    return { documentId: document.projectId, revision: document.revision, bounds, width: Math.round(bounds.width * input.scale), height: Math.round(bounds.height * input.scale), mimeType: "image/svg+xml", encoding: "base64", data };
  }
  const blob = await exportToBlob({ elements, files, exportingFrame: frame, exportPadding: 0, appState,
    getDimensions: () => ({ width: bounds.width * input.scale, height: bounds.height * input.scale, scale: input.scale }) });
  const data = await blobToBase64(blob);
  if (data.length > 12 * 1024 * 1024) fail("OUTPUT_TOO_LARGE", "Encoded output exceeds 12MB");
  return { documentId: document.projectId, revision: document.revision, bounds, width: Math.round(bounds.width * input.scale), height: Math.round(bounds.height * input.scale), mimeType: "image/png", encoding: "base64", data };
}
