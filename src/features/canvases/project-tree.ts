import { projectCanvasIds, type NativeProjectDocument, type ProjectNode } from "@easydraw/document-model";
export type TreeOperation =
  | { op: "create"; type: "canvas"; name?: string; parentId: null }
  | { op: "rename"; id: string; name: string }
  | { op: "move"; id: string; parentId: null; beforeId?: string }
  | { op: "delete"; id: string }
  | { op: "duplicate"; id: string };
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export function canvasPath(tree: ProjectNode[], id: string | null): string {
  return tree.find(node => node.id === id)?.name ?? "";
}
export function applyTreeOperation(draft: NativeProjectDocument, operation: TreeOperation): string | null {
  const siblings = (parentId: null) => draft.tree.filter(n => n.parentId === parentId).sort((a, b) => a.order - b.order);
  const nextOrder = (parentId: null) => Math.max(-1, ...siblings(parentId).map(n => n.order)) + 1;
  const uniqueName = (base: string, parentId: null) => {
    const names = new Set(siblings(parentId).map(n => n.name));
    let name = base, i = 2; while (names.has(name)) name = `${base} ${i++}`; return name;
  };
  const name = (value: string) => { const result = value.trim(); if (!result || result.length > 160) throw new Error("名称须为 1–160 个字符"); return result; };
  if (operation.op === "create") {
    if (operation.type !== "canvas") throw new Error("只能新建画布");
    if (operation.parentId !== null) throw new Error("画布列表不支持文件夹");
    const id = newId(operation.type), base = operation.name ?? ("画布 1");
    draft.tree.push({ id, type: operation.type, name: uniqueName(name(base), operation.parentId), parentId: operation.parentId, order: nextOrder(operation.parentId) });
    draft.canvases[id] = { id, scene: { elements: [] }, focusedPageElementId: null };
    return id;
  }
  const node = draft.tree.find(n => n.id === operation.id); if (!node) throw new Error("节点不存在");
  if (operation.op === "rename") { node.name = name(operation.name); return node.id; }
  if (operation.op === "move") {
    if (operation.parentId !== null) throw new Error("画布列表不支持文件夹");
    if (operation.beforeId === node.id) return node.id;
    const target = siblings(operation.parentId).filter(n => n.id !== node.id);
    const index = operation.beforeId ? target.findIndex(n => n.id === operation.beforeId) : target.length;
    if (index < 0) throw new Error("排序目标不存在");
    node.parentId = operation.parentId; target.splice(index, 0, node); target.forEach((n, i) => n.order = i);
    return node.id;
  }
  if (operation.op === "delete") {
    const oldOrder = projectCanvasIds(draft), removed = new Set([node.id]);
    const activeIndex = oldOrder.indexOf(draft.activeCanvasId ?? "");
    draft.tree = draft.tree.filter(n => !removed.has(n.id));
    for (const id of removed) delete draft.canvases[id];
    if (draft.activeCanvasId && removed.has(draft.activeCanvasId)) {
      const remaining = oldOrder.slice(activeIndex + 1).filter(id => !removed.has(id));
      const previous = oldOrder.slice(0, activeIndex).filter(id => !removed.has(id)).reverse();
      draft.activeCanvasId = remaining[0] ?? previous[0] ?? null;
      draft.scene = draft.activeCanvasId ? draft.canvases[draft.activeCanvasId].scene : { elements: [] };
      draft.focusedPageElementId = draft.activeCanvasId ? draft.canvases[draft.activeCanvasId].focusedPageElementId : null;
    }
    return draft.activeCanvasId;
  }
  const id = newId("canvas"), original = draft.canvases[node.id];
  const copy = structuredClone(original); copy.id = id;
  const ids = new Map(copy.scene.elements.map(e => [e.id, newId("element")]));
  const groups = new Map<string, string>();
  copy.scene.elements = copy.scene.elements.map(original => {
    const e = { ...original, id: ids.get(original.id)!, frameId: original.frameId ? ids.get(original.frameId) ?? null : null,
      groupIds: original.groupIds.map(g => { if (!groups.has(g)) groups.set(g, newId("group")); return groups.get(g)!; }),
      boundElements: original.boundElements?.flatMap(b => ids.has(b.id) ? [{ ...b, id: ids.get(b.id)! }] : []) ?? null };
    if (e.type === "text") return { ...e, containerId: e.containerId ? ids.get(e.containerId) ?? null : null };
    if (e.type === "arrow" || e.type === "line") {
      const remap = (b: typeof e.startBinding) => b && ids.has(b.elementId) ? { ...b, elementId: ids.get(b.elementId)! } : null;
      return { ...e, startBinding: remap(e.startBinding), endBinding: remap(e.endBinding) };
    }
    return e;
  });
  copy.focusedPageElementId = copy.focusedPageElementId ? ids.get(copy.focusedPageElementId) ?? null : null;
  draft.canvases[id] = copy;
  draft.tree.push({ ...node, id, name: uniqueName(`${node.name} 副本`, node.parentId), order: nextOrder(node.parentId) });
  return id;
}
