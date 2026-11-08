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

/** Connectors bind to shapes, images, free text and pages (for flows between screens). Must match the engine's isBindableElement. */
export function isConnectorBindingTarget(element: EasyDrawElement): boolean {
  switch (element.type) {
    case "rectangle": case "diamond": case "ellipse": case "image":
    case "frame": case "magicframe": case "iframe": case "embeddable": return true;
    case "text": return element.containerId === null;
    default: return false;
  }
}

/** Drops connector bindings whose target is missing or not bindable, with the target's back-reference. */
function normalizeConnectorBindings(elements: readonly EasyDrawElement[]): EasyDrawElement[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const detached = new Map<string, Set<string>>();
  let changed = false;
  const unbound = elements.map((element) => {
    if (element.type !== "arrow" && element.type !== "line") return element;
    const patch: Partial<Record<"startBinding" | "endBinding", null>> = {};
    for (const key of ["startBinding", "endBinding"] as const) {
      const targetId = element[key]?.elementId;
      if (!targetId) continue;
      const target = byId.get(targetId);
      if (target && target.id !== element.id && isConnectorBindingTarget(target)) continue;
      patch[key] = null;
      detached.set(targetId, (detached.get(targetId) ?? new Set()).add(element.id));
    }
    if (Object.keys(patch).length === 0) return element;
    changed = true;
    return { ...element, ...patch, version: element.version + 1 };
  });
  if (!changed) return elements as EasyDrawElement[];
  return unbound.map((element) => {
    const removed = detached.get(element.id);
    if (!removed || !element.boundElements?.some((bound) => removed.has(bound.id))) return element;
    return { ...element, boundElements: element.boundElements.filter((bound) => !removed.has(bound.id)), version: element.version + 1 };
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
  const ordered = normalizePageLayerOrder(normalizeConnectorBindings(normalizeConnectorScope(elements)));
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
