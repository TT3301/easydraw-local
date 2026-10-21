import { createNativeElement, type EasyDrawElement } from "@easydraw/document-model";
import { measureText } from "@easydraw/canvas-engine/editor/element/textMeasurements";
import { wrapText } from "@easydraw/canvas-engine/editor/element/textWrapping";
import { getFontString } from "@easydraw/canvas-engine/editor/utils";
import { Fonts } from "@easydraw/canvas-engine/editor/fonts/Fonts";
import { updateBoundElements } from "@easydraw/canvas-engine/editor/element/binding";
import { getElementBounds } from "@easydraw/canvas-engine/editor/element/bounds";
import type { FontFamilyValues, NonDeletedEasyDrawElement, SceneElementsMap } from "@easydraw/canvas-engine/element/types";
import type { ProjectDocument } from "../../core/protocol";
export async function measureCanvasText(input: { text: string; fontSize: number; fontFamily: number; lineHeight: number; maxWidth?: number }) {
  const sample = createNativeElement({ id: "measurement", type: "text", x: 0, y: 0, width: 1, height: 1, ...input });
  await Fonts.loadElementsFonts([sample]);
  const font = getFontString({ fontSize: input.fontSize, fontFamily: input.fontFamily as FontFamilyValues });
  const text = input.maxWidth ? wrapText(input.text, font, input.maxWidth) : input.text;
  return { ...measureText(text, font, input.lineHeight as any), text, font, fontFamily: input.fontFamily,
    fontReady: globalThis.document.fonts.check(font, input.text || " ") };
}
export function reconcileCanvasBindings(before: ProjectDocument, draft: ProjectDocument) {
  const map = new Map(draft.scene.elements.map(e => [e.id, e])) as SceneElementsMap;
  const previous = new Map(before.scene.elements.map(e => [e.id, e]));
  const changed = draft.scene.elements.filter(e => {
    const old = previous.get(e.id);
    return old && (e.x !== old.x || e.y !== old.y || e.width !== old.width || e.height !== old.height || e.angle !== old.angle);
  });
  for (const e of changed) updateBoundElements(e as NonDeletedEasyDrawElement, map, { simultaneouslyUpdated: changed });
  draft.scene.elements = [...map.values()];
}
export function renderedBounds(elements: EasyDrawElement[], all: EasyDrawElement[], includeStroke: boolean) {
  const map = new Map(all.map(e => [e.id, e]));
  return elements.map(e => {
    const [x1, y1, x2, y2] = getElementBounds(e, map);
    const p = includeStroke ? e.strokeWidth / 2 : 0;
    return { id: e.id, x: x1 - p, y: y1 - p, width: x2 - x1 + p * 2, height: y2 - y1 + p * 2 };
  });
}
