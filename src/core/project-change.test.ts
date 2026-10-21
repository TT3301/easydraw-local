import { createNativeElement, serializeProjectDocument } from "@easydraw/document-model";
import { describe, expect, it } from "vitest";
import { applyProjectChange, calculateProjectChange, invertProjectChange } from "./project-change";
import { createInitialDocument, ProjectDocumentSchema, type ProjectDocument } from "./protocol";
import { SceneController } from "./scene-controller";

const content = (document: ProjectDocument) => ({ ...serializeProjectDocument(document), revision: 0, updatedAt: "" });
const edit = (document: ProjectDocument, update: (draft: ProjectDocument) => void) => {
  const draft = structuredClone(document);
  update(draft);
  return ProjectDocumentSchema.parse(draft);
};

describe("project changes", () => {
  it("retains only changed fields, without unchanged elements or revision metadata", () => {
    const before = createInitialDocument();
    before.scene.elements.push(createNativeElement({ id: "large-text", type: "text", x: 0, y: 0, width: 100, height: 100,
      text: "UNCHANGED_PAYLOAD".repeat(5_000) }));
    const after = edit(before, draft => { draft.name = "Renamed"; draft.revision++; draft.updatedAt = "later"; });
    const change = calculateProjectChange(before, after);
    expect(change).toEqual([{ path: ["name"], deleted: before.name, inserted: "Renamed" }]);
    expect(content(applyProjectChange(before, change))).toEqual(content(after));
    expect(content(applyProjectChange(after, invertProjectChange(change)))).toEqual(content(before));
    const moved = edit(after, draft => { draft.scene.elements[0] = { ...draft.scene.elements[0], x: 17 }; });
    expect(calculateProjectChange(after, moved)).toEqual([{
      path: ["canvases", after.activeCanvasId!, "scene", "elements", after.scene.elements[0].id, "x"],
      deleted: after.scene.elements[0].x, inserted: 17,
    }]);
  });

  it("records a sparse insertion and reverses reorder, deletion and optional properties", () => {
    const before = createInitialDocument();
    const added = edit(before, draft => {
      draft.scene.elements.splice(1, 0, createNativeElement({ id: "added", type: "rectangle", x: 0, y: 0, width: 20, height: 20 }));
      draft.scene.elements[0] = { ...draft.scene.elements[0], customData: { note: "kept" } };
    });
    const change = calculateProjectChange(before, added);
    expect(change.find(item => item.path.at(-1) === "elementOrder")).toMatchObject({ index: 1, deleted: [], inserted: ["added"] });
    const changed = edit(added, draft => {
      draft.scene.elements.reverse();
      draft.scene.elements = draft.scene.elements.filter(element => element.id !== "added");
      const index = draft.scene.elements.findIndex(element => element.id === before.scene.elements[0].id);
      const { customData, ...element } = draft.scene.elements[index];
      draft.scene.elements[index] = element;
    });
    const second = calculateProjectChange(added, changed);
    const restored = applyProjectChange(applyProjectChange(before, change), second);
    expect(content(restored)).toEqual(content(changed));
    const undone = applyProjectChange(restored, invertProjectChange(second));
    expect(content(undone)).toEqual(content(added));
    expect(content(applyProjectChange(undone, invertProjectChange(change)))).toEqual(content(before));
    expect(content(before)).not.toEqual(content(changed));
  });

  it("isolates nested patch values from the restored document", () => {
    const before = createInitialDocument();
    const after = edit(before, draft => { draft.scene.elements[0] = { ...draft.scene.elements[0], customData: { labels: ["original"] } }; });
    const change = calculateProjectChange(before, after);
    const restored = applyProjectChange(before, change);
    restored.scene.elements[0].customData!.labels.push("mutated");
    expect(applyProjectChange(before, change).scene.elements[0].customData).toEqual({ labels: ["original"] });
    expect(after.scene.elements[0].customData).toEqual({ labels: ["original"] });
    expect(before.scene.elements[0].customData).toBeUndefined();
  });

  it("treats prototype-like element IDs as own keys", () => {
    const before = createInitialDocument();
    const after = edit(before, draft => {
      draft.scene.elements.push(createNativeElement({ id: "__proto__", type: "rectangle", x: 10, y: 0, width: 20, height: 20 }));
    });
    const changed = edit(after, draft => {
      draft.scene.elements = draft.scene.elements.map(element => element.id === "__proto__" ? { ...element, x: 99 } : element);
    });
    const first = calculateProjectChange(before, after), second = calculateProjectChange(after, changed);
    const restored = applyProjectChange(applyProjectChange(before, first), second);
    expect(content(restored)).toEqual(content(changed));
    expect(content(applyProjectChange(restored, invertProjectChange(second)))).toEqual(content(after));
  });

  it("does not retain project snapshots in controller history", () => {
    const document = createInitialDocument();
    document.scene.elements.push(createNativeElement({ id: "large-text", type: "text", x: 0, y: 0, width: 100, height: 100,
      text: "UNCHANGED_PAYLOAD".repeat(5_000) }));
    const controller = new SceneController(document);
    for (let i = 0; i < 100; i++) controller.commitProjectChange("rename", draft => { draft.name = `Name ${i}`; });
    const retained = JSON.stringify(Reflect.get(controller, "undoStack"));
    expect(retained).not.toContain("UNCHANGED_PAYLOAD");
    expect(retained).not.toContain('"before":');
    expect(retained).not.toContain('"after":');
    expect(retained.length).toBeLessThan(30_000);
    expect(controller.getHistory().undo).toHaveLength(50);
  });
});
