import type { EasyDrawElement, EasyDrawFrameElement } from "./elements";
import { z } from "zod";
import { NativeElementSchema } from "./schema";
import { ProjectAssetSchema } from "./assets";

export const LegacyProjectDocumentSchema = z.object({
  schemaVersion: z.literal(3),
  projectId: z.string().min(1), name: z.string().min(1),
  revision: z.number().int().nonnegative(), focusedPageElementId: z.string().min(1).nullable(),
  scene: z.object({ elements: z.array(NativeElementSchema) }),
  assets: z.array(ProjectAssetSchema), updatedAt: z.string(),
}).superRefine((document, context) => {
  const byId = new Map(document.scene.elements.map((element) => [element.id, element]));
  if (byId.size !== document.scene.elements.length) {
    context.addIssue({ code: "custom", path: ["scene", "elements"], message: "Duplicate element ID" });
  }
  const assetIds = new Set(document.assets.map((asset) => asset.id));
  if (assetIds.size !== document.assets.length) {
    context.addIssue({ code: "custom", path: ["assets"], message: "Duplicate asset ID" });
  }
  const focused = document.focusedPageElementId ? byId.get(document.focusedPageElementId) : null;
  if (document.focusedPageElementId !== null && (!focused || focused.isDeleted || focused.type !== "frame")) {
    context.addIssue({ code: "custom", path: ["focusedPageElementId"], message: "Focused page does not exist" });
  }
  for (let index = 0; index < document.scene.elements.length; index++) {
    const element = document.scene.elements[index];
    if (element.isDeleted || element.frameId === null) continue;
    const page = byId.get(element.frameId);
    if (!page || page.isDeleted || (page.type !== "frame" && page.type !== "magicframe") || element.id === page.id) {
      context.addIssue({ code: "custom", path: ["scene", "elements", index, "frameId"], message: "Invalid page reference" });
    }
  }
});

// Kept only for reading projects created by the earlier folder-based implementation.
const LegacyProjectNodeSchema = z.object({
  id: z.string().min(1), type: z.enum(["folder", "canvas"]),
  name: z.string().trim().min(1).max(160), parentId: z.string().min(1).nullable(),
  order: z.number().finite().nonnegative(),
});
export const CanvasDocumentSchema = z.object({
  id: z.string().min(1), scene: z.object({ elements: z.array(NativeElementSchema) }),
  focusedPageElementId: z.string().min(1).nullable(),
});
const LegacyMultiCanvasDocumentSchema = z.object({
  schemaVersion: z.literal(4), projectId: z.string().min(1), name: z.string().min(1),
  revision: z.number().int().nonnegative(), updatedAt: z.string(),
  tree: z.array(LegacyProjectNodeSchema), canvases: z.record(z.string(), CanvasDocumentSchema),
  assets: z.array(ProjectAssetSchema),
}).superRefine((project, ctx) => {
  const nodes = new Map(project.tree.map(n => [n.id, n]));
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (nodes.size !== project.tree.length) issue("Duplicate project node ID");
  const elementIds = new Set<string>();
  for (const node of project.tree) {
    if (node.parentId !== null && nodes.get(node.parentId)?.type !== "folder") issue("Invalid folder parent");
    const visited = new Set([node.id]);
    let parent = node.parentId;
    while (parent !== null && nodes.has(parent)) {
      if (visited.has(parent)) { issue("Folder cycle"); break; }
      visited.add(parent); parent = nodes.get(parent)!.parentId;
    }
    if (node.type === "canvas" && !Object.hasOwn(project.canvases, node.id)) issue("Canvas scene missing");
  }
  for (const [id, canvas] of Object.entries(project.canvases)) {
    if (canvas.id !== id || nodes.get(id)?.type !== "canvas") issue("Orphan canvas scene");
    const parsed = LegacyProjectDocumentSchema.safeParse({ ...project, schemaVersion: 3, ...canvas });
    if (!parsed.success) for (const error of parsed.error.issues) ctx.addIssue({ ...error, path: ["canvases", id, ...error.path] });
    for (const element of canvas.scene.elements) {
      if (elementIds.has(element.id)) issue("Duplicate element ID across canvases");
      elementIds.add(element.id);
    }
  }
  for (const [id, canvas] of Object.entries(project.canvases)) {
    const local = new Set(canvas.scene.elements.map(e => e.id));
    for (const element of canvas.scene.elements) {
      const bindings = element.type === "text" ? [element.containerId] : element.type === "arrow" || element.type === "line" ? [element.startBinding?.elementId, element.endBinding?.elementId] : [];
      for (const target of [...bindings, ...element.boundElements?.map(b => b.id) ?? []]) {
        if (target && elementIds.has(target) && !local.has(target)) ctx.addIssue({ code: "custom", path: ["canvases", id], message: "Cross-canvas binding" });
      }
    }
  }
  if (new Set(project.assets.map(a => a.id)).size !== project.assets.length) issue("Duplicate asset ID");
});
// `tree` is retained as a format field, but contains only a flat ordered canvas list.
export const ProjectNodeSchema = LegacyProjectNodeSchema.extend({ type: z.literal("canvas"), parentId: z.null() });
export const StoredProjectDocumentSchema = LegacyMultiCanvasDocumentSchema.safeExtend({ tree: z.array(ProjectNodeSchema) });
export type StoredProjectDocument = z.infer<typeof StoredProjectDocumentSchema>;
export type ProjectNode = z.infer<typeof ProjectNodeSchema>;
export type CanvasDocument = z.infer<typeof CanvasDocumentSchema>;

export const orderedProjectNodes = (project: Pick<StoredProjectDocument, "tree">, parentId: string | null = null): ProjectNode[] =>
  project.tree.filter(n => n.parentId === parentId).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
export function projectCanvasIds(project: Pick<StoredProjectDocument, "tree">): string[] {
  return orderedProjectNodes(project).map(n => n.id);
}

/** Selected-scene projection for the editor. Never serialized to project.json. */
export type NativeProjectDocument = StoredProjectDocument & {
  activeCanvasId: string | null;
  scene: CanvasDocument["scene"];
  focusedPageElementId: string | null;
};
export function selectProjectCanvas(project: StoredProjectDocument, canvasId: string | null): NativeProjectDocument {
  const activeCanvasId = canvasId && Object.hasOwn(project.canvases, canvasId) ? canvasId : projectCanvasIds(project)[0] ?? null;
  const canvas = activeCanvasId ? project.canvases[activeCanvasId] : null;
  return { ...project, activeCanvasId, scene: canvas?.scene ?? { elements: [] }, focusedPageElementId: canvas?.focusedPageElementId ?? null };
}
function projectInput(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  let input = value as Record<string, any>;
  if (input.schemaVersion === 3) {
    const legacy = LegacyProjectDocumentSchema.safeParse(input);
    if (!legacy.success) return value;
    const id = `canvas_${legacy.data.projectId}`;
    return { ...legacy.data, schemaVersion: 4,
      tree: [{ id, type: "canvas", name: "画布 1", parentId: null, order: 0 }],
      canvases: { [id]: { id, scene: legacy.data.scene, focusedPageElementId: legacy.data.focusedPageElementId } },
      activeCanvasId: id };
  }
  if (input.schemaVersion === 4 && input.activeCanvasId === null && (input.scene?.elements?.length || input.focusedPageElementId)) {
    return { ...input, schemaVersion: -1 }; // An empty project cannot accept unowned elements.
  }
  // A working projection is explicitly committed back to its own canvas.
  if (input.schemaVersion === 4 && input.activeCanvasId && input.canvases && Object.hasOwn(input.canvases, input.activeCanvasId) && input.scene) {
    input = { ...input, canvases: { ...input.canvases, [input.activeCanvasId]: {
      ...input.canvases[input.activeCanvasId], scene: input.scene, focusedPageElementId: input.focusedPageElementId,
    } } };
  }
  if (input.schemaVersion === 4 && Array.isArray(input.tree) && input.tree.some((n: any) => n.type === "folder" || n.parentId !== null)) {
    // Validate the old hierarchy before traversal, then preserve its visible canvas order.
    const legacy = LegacyMultiCanvasDocumentSchema.safeParse(input);
    if (!legacy.success) return input;
    const flatten = (parentId: string | null): z.infer<typeof ProjectNodeSchema>[] => legacy.data.tree
      .filter(n => n.parentId === parentId).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .flatMap(n => n.type === "canvas" ? [{ ...n, type: "canvas" as const, parentId: null }] : flatten(n.id));
    return { ...input, tree: flatten(null).map((n, order) => ({ ...n, order })) };
  }
  return input;
}
const ProjectWithSelectionSchema = StoredProjectDocumentSchema.safeExtend({ activeCanvasId: z.string().min(1).nullable().optional() });
export const NativeProjectDocumentSchema = z.preprocess(projectInput, ProjectWithSelectionSchema).transform(project => selectProjectCanvas(project, project.activeCanvasId ?? null));
export function serializeProjectDocument(document: NativeProjectDocument): StoredProjectDocument {
  return StoredProjectDocumentSchema.parse(projectInput(document));
}
export const allProjectElements = (project: StoredProjectDocument) => Object.values(project.canvases).flatMap(c => c.scene.elements);

export const getPageElements = (document: NativeProjectDocument) => document.scene.elements
  .filter((element): element is EasyDrawFrameElement => element.type === "frame" && !element.isDeleted)
  .sort((left, right) => left.order - right.order);
export const getPageMembers = (document: NativeProjectDocument, pageId: string) => document.scene.elements
  .filter((element): element is Exclude<EasyDrawElement, EasyDrawFrameElement> =>
    element.type !== "frame" && !element.isDeleted && element.frameId === pageId);
export const getElementAssetId = (element: EasyDrawElement) => element.type === "image" ? element.fileId : element.assetId;
