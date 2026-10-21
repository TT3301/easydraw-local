import type { EasyDrawElement } from "@easydraw/document-model";
import type { CanvasScope, ProjectDocument } from "./protocol";
import { fail } from "./canvas-commands";
import { elementBounds, intersects, unionBounds } from "./canvas-geometry";

export function scopeElements(document: ProjectDocument, scope: CanvasScope): EasyDrawElement[] {
  const elements = document.scene.elements.filter(e => !e.isDeleted);
  if (scope.kind === "document") return elements;
  if (scope.kind === "bounds") return elements.filter(e => intersects(elementBounds(e), scope.bounds));
  if (scope.kind === "elements") {
    const ids = new Set(scope.ids);
    for (const id of ids) if (!elements.some(e => e.id === id)) fail("ELEMENT_NOT_FOUND", id);
    return elements.filter(e => ids.has(e.id));
  }
  const container = elements.find(e => e.id === scope.id);
  if (container?.type !== "frame") fail("INVALID_CONTAINER", scope.id);
  return elements.filter(e => e.id === scope.id || e.frameId === scope.id);
}
export function canvasOutline(document: ProjectDocument, scope: CanvasScope, offset: number, limit: number) {
  const elements = scopeElements(document, scope), groups = new Map<string, EasyDrawElement[]>();
  for (const e of elements) for (const id of e.groupIds) groups.set(id, [...groups.get(id) ?? [], e]);
  const items = elements.map(e => ({ id: e.id, type: e.type, ...(e.type === "frame" ? { name: e.name } : {}), frameId: e.frameId, groupIds: e.groupIds,
    bounds: elementBounds(e), ...(e.type === "text" ? { textPreview: e.text.slice(0, 120) } : {}),
    ...(e.type === "frame" ? { childCount: document.scene.elements.filter(c => c.frameId === e.id).length } : {}),
  }));
  return { documentId: document.projectId, canvasId: document.activeCanvasId, revision: document.revision, bounds: unionBounds(elements.map(e => elementBounds(e))),
    total: items.length, items: items.slice(offset, offset + limit), nextOffset: offset + limit < items.length ? offset + limit : null,
    groups: [...groups].slice(offset, offset + limit).map(([id, members]) => ({ id, memberCount: members.length, bounds: unionBounds(members.map(e => elementBounds(e))) })), totalGroups: groups.size,
  };
}
