import { generateNKeysBetween } from "fractional-indexing";
import type { EasyDrawElement, FractionalIndex } from "./elements";

/** Connectors live on the canvas, along with any text bound to them. */
function normalizeConnectorScope(elements: readonly EasyDrawElement[]): EasyDrawElement[] {
  const connectorIds = new Set(
    elements.filter((element) => element.type === "arrow").map((element) => element.id),
  );
  return elements.map((element) => {
    const isConnectorLabel =
      element.type === "text" &&
      element.containerId !== null &&
      connectorIds.has(element.containerId);
    if ((element.type === "arrow" || isConnectorLabel) && element.frameId !== null) {
      return { ...element, frameId: null, version: element.version + 1 };
    }
    return element;
  });
}

/** Page children precede their container; their relative stacking stays intact. */
export function normalizePageLayerOrder(elements: readonly EasyDrawElement[]): EasyDrawElement[] {
  const pages = new Set(elements.filter((element) => element.type === "frame").map((element) => element.id));
  return elements.filter((element) => !element.frameId || !pages.has(element.frameId)).flatMap((element) =>
    element.type === "frame" ? [...elements.filter((child) => child.frameId === element.id), element] : [element]);
}

/** One canonical ordering for command commits, persistence and the renderer. */
export function normalizeSceneElements(elements: readonly EasyDrawElement[]): EasyDrawElement[] {
  const ordered = normalizePageLayerOrder(normalizeConnectorScope(elements));
  let previous: string | null = null;
  const valid = ordered.every((element) => {
    const valid = element.index !== null && (previous === null || element.index > previous);
    previous = element.index;
    return valid;
  });
  if (valid) return ordered;
  const keys = generateNKeysBetween(null, null, ordered.length);
  return ordered.map((element, index) => element.index === keys[index] ? element : {
    ...element, index: keys[index] as FractionalIndex, version: element.version + 1,
  });
}

/** A deleted page owns its content; deleting it must not leave detached content. */
export function reconcilePageAggregates(next: readonly EasyDrawElement[], previous: readonly EasyDrawElement[]) {
  const liveIds = new Set(next.filter((element) => !element.isDeleted).map((element) => element.id));
  const deletedPages = new Set(previous.filter((element) => element.type === "frame" && !liveIds.has(element.id)).map((element) => element.id));
  if (deletedPages.size === 0) return next;
  const owned = new Set(previous.filter((element) => element.frameId && deletedPages.has(element.frameId)).map((element) => element.id));
  let changed = false;
  const reconciled = next.map((element) => {
    if (!element.isDeleted && (owned.has(element.id) || (element.frameId && deletedPages.has(element.frameId)))) {
      changed = true;
      return { ...element, isDeleted: true, version: element.version + 1 };
    }
    return element;
  });
  return changed ? reconciled : next;
}
