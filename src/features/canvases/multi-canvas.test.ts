import { describe, expect, it, vi } from "vitest";
import { createNativeElement, NativeProjectDocumentSchema, serializeProjectDocument, StoredProjectDocumentSchema } from "@easydraw/document-model";
import { SceneController } from "../../core/scene-controller";
import { createInitialDocument } from "../../core/protocol";
import { CanvasSession } from "../../canvas/canvas-session";
import { EditorSession } from "../../app/editor-session";

const setup = () => new SceneController(createInitialDocument());
const create = (controller: SceneController, type: "canvas" = "canvas") => controller.manageTree({ op: "create", type, parentId: null })!;
describe("independent project canvases", () => {
  it("migrates a v3 project without changing scene IDs, assets or identity, and serializes only v4 content", () => {
    const initial = createInitialDocument();
    const legacy = { schemaVersion: 3, projectId: initial.projectId, name: initial.name, revision: 7,
      updatedAt: initial.updatedAt, scene: initial.scene, focusedPageElementId: initial.focusedPageElementId, assets: initial.assets };
    const migrated = NativeProjectDocumentSchema.parse(legacy);
    expect(migrated).toMatchObject({ schemaVersion: 4, projectId: legacy.projectId, revision: 7, scene: legacy.scene });
    const stored = serializeProjectDocument(migrated);
    expect(stored).not.toHaveProperty("scene"); expect(stored).not.toHaveProperty("activeCanvasId");
    expect(NativeProjectDocumentSchema.parse(stored).scene).toEqual(legacy.scene);
    expect(NativeProjectDocumentSchema.safeParse({ ...stored, schemaVersion: 5 }).success).toBe(false);
  });
  it("saves a pending manual edit to the original canvas, switches synchronously and retains both after reopening", () => {
    const controller = setup(), first = controller.getSnapshot().document.activeCanvasId!;
    const canvas = new CanvasSession(controller, vi.fn()), render = vi.fn(); canvas.connect(render);
    const second = create(controller, "canvas");
    const elements = structuredClone(controller.getSnapshot().document.scene.elements);
    elements[1] = { ...elements[1], x: 999 };
    canvas.observe(elements, {}); canvas.flush(); controller.switchCanvas(second);
    expect(controller.getSnapshot().document.scene.elements).toEqual([]);
    expect(render.mock.calls.at(-1)?.[0]).toEqual([]);
    const revision = controller.getSnapshot().document.revision;
    controller.commitManualElements([createNativeElement({ id: "only-second", type: "rectangle", x: 1, y: 2, width: 30, height: 40 })]);
    controller.switchCanvas(first);
    expect(controller.getSnapshot().document.scene.elements[1].x).toBe(999);
    controller.switchCanvas(second); expect(controller.getSnapshot().document.revision).toBe(revision + 1);
    const reopened = NativeProjectDocumentSchema.parse(JSON.parse(JSON.stringify(serializeProjectDocument(controller.getSnapshot().document))));
    expect(reopened.canvases[first].scene.elements[1].x).toBe(999);
    expect(reopened.canvases[second].scene.elements[0].id).toBe("only-second");
  });
  it("isolates canvas captures while a project save scope remains current", () => {
    const controller = setup(), session = new EditorSession(controller);
    const second = create(controller, "canvas"), task = session.capture(), save = session.captureProject();
    controller.switchCanvas(second);
    expect(task.isCurrent()).toBe(false); expect(save.isCurrent()).toBe(true);
    expect(() => task.controller.commitManualElements([])).toThrow("PROJECT_SESSION_EXPIRED");
  });
  it("flattens legacy folders in visible order without losing scenes, identity or the selected canvas", () => {
    const initial = serializeProjectDocument(setup().getSnapshot().document);
    const first = initial.tree[0].id;
    const legacy = { ...initial, activeCanvasId: "nested-b", tree: [
      { ...initial.tree[0], order: 3 },
      { id: "folder-a", type: "folder", name: "A", parentId: null, order: 0 },
      { id: "nested-a", type: "canvas", name: "Same name", parentId: "folder-a", order: 0 },
      { id: "folder-b", type: "folder", name: "B", parentId: "folder-a", order: 1 },
      { id: "nested-b", type: "canvas", name: "Same name", parentId: "folder-b", order: 0 },
      { id: "empty-folder", type: "folder", name: "Empty", parentId: null, order: 2 },
    ], canvases: { ...initial.canvases,
      "nested-a": { id: "nested-a", scene: { elements: [createNativeElement({ id: "a", type: "rectangle", x: 10, y: 20, width: 30, height: 40 })] }, focusedPageElementId: null },
      "nested-b": { id: "nested-b", scene: { elements: [] }, focusedPageElementId: null },
    } };
    const migrated = NativeProjectDocumentSchema.parse(legacy);
    expect(migrated.tree.map(n => n.id)).toEqual(["nested-a", "nested-b", first]);
    expect(migrated.tree.every(n => n.type === "canvas" && n.parentId === null)).toBe(true);
    expect(migrated.canvases).toEqual(legacy.canvases);
    expect(migrated.activeCanvasId).toBe("nested-b");
    expect(migrated.revision).toBe(initial.revision);
    expect(StoredProjectDocumentSchema.safeParse(serializeProjectDocument(migrated)).success).toBe(true);
    const invalid = { ...legacy, tree: legacy.tree.map(n => n.id === "folder-a" ? { ...n, parentId: "folder-b" } : n) };
    expect(NativeProjectDocumentSchema.safeParse(invalid).success).toBe(false);
  });
  it("orders a flat list and rejects missing sort targets atomically", () => {
    const controller = setup(), first = controller.getSnapshot().document.activeCanvasId!, second = create(controller);
    controller.manageTree({ op: "move", id: second, parentId: null, beforeId: first });
    expect(controller.getSnapshot().document.tree.find(n => n.id === second)!.order).toBe(0);
    const before = serializeProjectDocument(controller.getSnapshot().document);
    expect(() => controller.manageTree({ op: "move", id: first, parentId: null, beforeId: "missing" })).toThrow("排序目标");
    expect(serializeProjectDocument(controller.getSnapshot().document)).toEqual(before);
  });
  it("duplicates frame, group, text and arrow bindings while sharing asset references", () => {
    const controller = setup(), first = controller.getSnapshot().document.activeCanvasId!;
    controller.commitManualElements([
      createNativeElement({ id: "f", type: "frame", x: 0, y: 0, width: 400, height: 400 }),
      createNativeElement({ id: "s", type: "rectangle", x: 20, y: 20, width: 100, height: 60, frameId: "f", groupIds: ["g"], boundElements: [{ id: "t", type: "text" }, { id: "a", type: "arrow" }] }),
      createNativeElement({ id: "t", type: "text", x: 20, y: 20, width: 80, height: 30, text: "Hello", containerId: "s", frameId: "f", groupIds: ["g"] }),
      createNativeElement({ id: "a", type: "arrow", x: 120, y: 40, width: 100, height: 10, startBinding: { elementId: "s", focus: 0, gap: 5 } }),
    ]);
    const copy = controller.manageTree({ op: "duplicate", id: first })!;
    const copied = controller.getSnapshot().document.canvases[copy].scene.elements;
    const f = copied.find(e => e.type === "frame")!, s = copied.find(e => e.type === "rectangle")!, t = copied.find(e => e.type === "text")!, a = copied.find(e => e.type === "arrow")!;
    expect(s.frameId).toBe(f.id); expect(t.type === "text" && t.containerId).toBe(s.id);
    expect(a.type === "arrow" && a.startBinding?.elementId).toBe(s.id);
    expect(s.boundElements?.map(b => b.id)).toContain(t.id);
    expect(s.groupIds).toEqual(t.groupIds); expect(s.groupIds).not.toContain("g");
    expect(copied.map(e => e.id).some(id => ["f", "s", "t", "a"].includes(id))).toBe(false);
  });
  it("deletes one canvas, restores it through history and supports zero-canvas empty state", () => {
    const controller = setup(), first = controller.getSnapshot().document.activeCanvasId!, second = create(controller);
    controller.switchCanvas(second); controller.manageTree({ op: "delete", id: second });
    expect(controller.getSnapshot().document.activeCanvasId).toBe(first);
    expect(controller.getSnapshot().document.canvases[second]).toBeUndefined();
    controller.undo(); expect(controller.getSnapshot().document.activeCanvasId).toBe(second);
    controller.redo(); controller.manageTree({ op: "delete", id: first });
    expect(controller.getSnapshot().document.activeCanvasId).toBe(null);
    expect(controller.commitManualElements([]).ok).toBe(false);
    const fresh = create(controller); controller.switchCanvas(fresh);
    expect(controller.getSnapshot().document.scene.elements).toEqual([]);
  });
  it("rejects cross-canvas bindings and unknown canvas selection without changing the project", () => {
    const controller = setup(), second = create(controller, "canvas");
    controller.switchCanvas(second);
    const before = serializeProjectDocument(controller.getSnapshot().document);
    const result = controller.commitManualElements([createNativeElement({ id: "cross", type: "text", x: 0, y: 0, width: 30, height: 20, containerId: "welcome-title" })]);
    expect(result.ok).toBe(false); expect(serializeProjectDocument(controller.getSnapshot().document)).toEqual(before);
    expect(() => controller.switchCanvas("toString")).toThrow("不存在");
  });
  it("undoing another canvas edit navigates there without decreasing the project revision", () => {
    const controller = setup(), first = controller.getSnapshot().document.activeCanvasId!, second = create(controller, "canvas");
    controller.commitProjectChange("edit first", draft => { draft.scene.elements[1] = { ...draft.scene.elements[1], x: 300 }; });
    const revision = controller.getSnapshot().document.revision;
    controller.switchCanvas(second); controller.undo();
    expect(controller.getSnapshot().document.activeCanvasId).toBe(first);
    expect(controller.getSnapshot().document.scene.elements[1].x).not.toBe(300);
    expect(controller.getSnapshot().document.revision).toBe(revision + 1);
  });
});
