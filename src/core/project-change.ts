import { selectProjectCanvas } from "@easydraw/document-model";
import type { ProjectDocument } from "./protocol";

export interface ProjectChange {
  path: string[];
  deleted: unknown;
  inserted: unknown;
  index?: number;
}

const byId = <T extends { id: string }>(items: readonly T[]) =>
  Object.fromEntries(items.map(item => [item.id, item]));

// IDs keep an insertion or reorder from turning every following element into a change.
const projectContent = (document: ProjectDocument) => {
  const { revision, updatedAt, activeCanvasId, scene, focusedPageElementId, tree, assets, canvases, ...metadata } = document;
  return {
    ...metadata,
    tree: byId(tree), treeOrder: tree.map(node => node.id),
    assets: byId(assets), assetOrder: assets.map(asset => asset.id),
    canvases: Object.fromEntries(Object.entries(canvases).map(([id, canvas]) => [id, {
      ...canvas,
      scene: { elements: byId(canvas.scene.elements) },
      elementOrder: canvas.scene.elements.map(element => element.id),
    }])),
  };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const equal = (left: unknown, right: unknown) =>
  Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);

export function calculateProjectChange(before: ProjectDocument, after: ProjectDocument): ProjectChange[] {
  const changes: ProjectChange[] = [];
  const diff = (deleted: unknown, inserted: unknown, path: string[]) => {
    if (Object.is(deleted, inserted)) return;
    if (isObject(deleted) && isObject(inserted)) {
      for (const key of new Set([...Object.keys(deleted), ...Object.keys(inserted)])) {
        diff(Object.hasOwn(deleted, key) ? deleted[key] : undefined,
          Object.hasOwn(inserted, key) ? inserted[key] : undefined, [...path, key]);
      }
      return;
    }
    if (Array.isArray(deleted) && Array.isArray(inserted)) {
      let start = 0, endBefore = deleted.length, endAfter = inserted.length;
      while (start < endBefore && start < endAfter && equal(deleted[start], inserted[start])) start++;
      while (endBefore > start && endAfter > start && equal(deleted[endBefore - 1], inserted[endAfter - 1])) {
        endBefore--; endAfter--;
      }
      if (start !== endBefore || start !== endAfter) {
        changes.push({ path, index: start,
          deleted: structuredClone(deleted.slice(start, endBefore)),
          inserted: structuredClone(inserted.slice(start, endAfter)) });
      }
      return;
    }
    changes.push({ path, deleted: structuredClone(deleted), inserted: structuredClone(inserted) });
  };
  diff(projectContent(before), projectContent(after), []);
  return changes;
}

export const invertProjectChange = (changes: readonly ProjectChange[]): ProjectChange[] =>
  [...changes].reverse().map(change => ({ ...change, deleted: change.inserted, inserted: change.deleted }));

// Entity IDs can be "__proto__"; assignment must create an own data property.
const setValue = (target: Record<string, unknown>, key: string, value: unknown) =>
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });

export function applyProjectChange(document: ProjectDocument, changes: readonly ProjectChange[]): ProjectDocument {
  const content = projectContent(document);
  const owned = new WeakSet<object>([content]);
  for (const change of changes) {
    let target = content as Record<string, unknown>;
    for (const key of change.path.slice(0, -1)) {
      let child = target[key] as Record<string, unknown>;
      if (!owned.has(child)) {
        child = { ...child };
        owned.add(child);
        setValue(target, key, child);
      }
      target = child;
    }
    const key = change.path[change.path.length - 1];
    if (change.index !== undefined) {
      const value = target[key] as unknown[];
      setValue(target, key, value.slice(0, change.index)
        .concat(structuredClone(change.inserted as unknown[]), value.slice(change.index + (change.deleted as unknown[]).length)));
    } else if (change.inserted === undefined) {
      delete target[key];
    } else {
      setValue(target, key, structuredClone(change.inserted));
    }
  }
  const { tree, treeOrder, assets, assetOrder, canvases, ...metadata } = content;
  return selectProjectCanvas({
    ...metadata,
    revision: document.revision + 1,
    updatedAt: new Date().toISOString(),
    tree: treeOrder.map(id => tree[id]),
    assets: assetOrder.map(id => assets[id]),
    canvases: Object.fromEntries(Object.entries(canvases).map(([id, canvas]) => {
      const { elementOrder, ...rest } = canvas;
      return [id, { ...rest, scene: { elements: elementOrder.map(elementId => canvas.scene.elements[elementId]) } }];
    })),
  }, document.activeCanvasId);
}
