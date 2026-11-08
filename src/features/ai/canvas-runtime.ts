import { createNativeElement, type EasyDrawElement } from "@easydraw/document-model";
import { measureText } from "@easydraw/canvas-engine/editor/element/textMeasurements";
import { wrapText } from "@easydraw/canvas-engine/editor/element/textWrapping";
import { getFontString } from "@easydraw/canvas-engine/editor/utils";
import { Fonts } from "@easydraw/canvas-engine/editor/fonts/Fonts";
import { updateBoundElements } from "@easydraw/canvas-engine/editor/element/binding";
import { getElementBounds } from "@easydraw/canvas-engine/editor/element/bounds";
import { computeBoundTextPosition, redrawTextBoundingBox } from "@easydraw/canvas-engine/editor/element/textElement";
import { routeElbowArrow } from "@easydraw/canvas-engine/editor/element/elbowArrowRouting";
import type { Mutable } from "@easydraw/canvas-engine/editor/utility-types";
import type { EasyDrawElbowArrowElement, EasyDrawTextElement, EasyDrawTextElementWithContainer, FontFamilyValues, NonDeletedEasyDrawElement, NonDeletedSceneElementsMap, SceneElementsMap } from "@easydraw/canvas-engine/element/types";
import type { ProjectDocument } from "../../core/protocol";
import { textLayoutTargets } from "./text-layout";
export async function measureCanvasText(input: { text: string; fontSize: number; fontFamily: number; lineHeight: number; maxWidth?: number }) {
  const sample = createNativeElement({ id: "measurement", type: "text", x: 0, y: 0, width: 1, height: 1, ...input });
  await Fonts.loadElementsFonts([sample]);
  const font = getFontString({ fontSize: input.fontSize, fontFamily: input.fontFamily as FontFamilyValues });
  const text = input.maxWidth ? wrapText(input.text, font, input.maxWidth) : input.text;
  return { ...measureText(text, font, input.lineHeight as any), text, font, fontFamily: input.fontFamily,
    fontReady: globalThis.document.fonts.check(font, input.text || " ") };
}
/** Lays out written text exactly as the editor does after an edit. */
export async function layoutCanvasText(before: ProjectDocument, draft: ProjectDocument) {
  const targets = textLayoutTargets(before.scene.elements, draft.scene.elements);
  if (targets.length === 0) return;
  await Fonts.loadElementsFonts(targets);
  const map = new Map(draft.scene.elements.map(e => [e.id, e])) as SceneElementsMap;
  // Draft elements are owned copies; the engine updates text and grows containers in place.
  for (const text of targets) {
    // Unwrapped text shows its source verbatim; wrapping is re-derived from originalText otherwise.
    if (text.autoResize && !text.containerId) (text as { text: string }).text = text.originalText;
    redrawTextBoundingBox(text as EasyDrawTextElement, text.containerId ? map.get(text.containerId) ?? null : null, map, false);
  }
}
export function reconcileCanvasBindings(before: ProjectDocument, draft: ProjectDocument) {
  const map = new Map(draft.scene.elements.map(e => [e.id, e])) as SceneElementsMap;
  const previous = new Map(before.scene.elements.map(e => [e.id, e]));
  const changed = draft.scene.elements.filter(e => {
    const old = previous.get(e.id);
    return old && (e.x !== old.x || e.y !== old.y || e.width !== old.width || e.height !== old.height || e.angle !== old.angle);
  });
  for (const e of changed) updateBoundElements(e as NonDeletedEasyDrawElement, map, { simultaneouslyUpdated: changed });
  routeElbowArrows(before, map);
  draft.scene.elements = [...map.values()];
}
/**
 * Draft elements belong to no engine scene, so elbow arrows that were written
 * or dragged along by binding maintenance are routed here against the draft,
 * the same way the editor routes them; their labels follow the new path.
 */
function routeElbowArrows(before: ProjectDocument, map: SceneElementsMap) {
  const previous = new Map(before.scene.elements.map(e => [e.id, JSON.stringify(e)]));
  const elements = [...map.values()] as NonDeletedEasyDrawElement[];
  for (const arrow of elements) {
    if (arrow.type !== "arrow" || !("elbowed" in arrow && arrow.elbowed) || previous.get(arrow.id) === JSON.stringify(arrow)) continue;
    routeElbowArrow(arrow as Mutable<EasyDrawElbowArrowElement>, elements, map as unknown as NonDeletedSceneElementsMap, { bindHovered: false, keepFixedPoints: true });
    for (const { id, type } of arrow.boundElements ?? []) {
      const label = map.get(id);
      if (type === "text" && label?.type === "text") Object.assign(label, computeBoundTextPosition(arrow, label as EasyDrawTextElementWithContainer, map));
    }
  }
}
export function renderedBounds(elements: EasyDrawElement[], all: EasyDrawElement[], includeStroke: boolean) {
  const map = new Map(all.map(e => [e.id, e]));
  return elements.map(e => {
    const [x1, y1, x2, y2] = getElementBounds(e, map);
    const p = includeStroke ? e.strokeWidth / 2 : 0;
    return { id: e.id, x: x1 - p, y: y1 - p, width: x2 - x1 + p * 2, height: y2 - y1 + p * 2 };
  });
}
