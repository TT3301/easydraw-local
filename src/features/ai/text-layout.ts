import type { EasyDrawElement } from "@easydraw/document-model";

type TextElement = Extract<EasyDrawElement, { type: "text" }>;
const textLayoutFields = ["text", "originalText", "fontSize", "fontFamily", "lineHeight", "autoResize", "width", "containerId", "textAlign", "verticalAlign"] as const;
const containerGeometry = ["x", "y", "width", "height", "angle", "points"] as const;
const differs = (a: object, b: object, keys: readonly string[]) =>
  keys.some(key => JSON.stringify((a as Record<string, unknown>)[key]) !== JSON.stringify((b as Record<string, unknown>)[key]));

/**
 * Text whose layout an API write may have invalidated: new text, edited
 * typography or wrapping width, and text inside a new or reshaped container.
 * The editor lays these out on every edit; command writes must do the same.
 */
export function textLayoutTargets(before: readonly EasyDrawElement[], after: readonly EasyDrawElement[]): TextElement[] {
  const previous = new Map(before.map(e => [e.id, e]));
  const reshaped = new Set(after.filter(e => {
    const old = previous.get(e.id);
    return !old || differs(old, e, containerGeometry);
  }).map(e => e.id));
  return after.filter((e): e is TextElement => {
    if (e.type !== "text") return false;
    const old = previous.get(e.id);
    return !old || differs(old, e, textLayoutFields) || (e.containerId !== null && reshaped.has(e.containerId));
  });
}
