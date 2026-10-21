import { createNativeElement, serializeProjectDocument } from "@easydraw/document-model";
import { describe, expect, it } from "vitest";
import { createDemoBatch, createInitialDocument, type ProjectDocument } from "./protocol";
import { SceneController } from "./scene-controller";

const content = (document: ProjectDocument) => ({ ...serializeProjectDocument(document), revision: 0, updatedAt: "" });
const rename = (controller: SceneController, name: string) => {
  expect(controller.commitProjectChange("rename", draft => { draft.name = name; })).toEqual({ ok: true, changed: true });
};

describe("bounded project change history", () => {
  it("discards C after undoing to B and editing D, and can repeatedly undo/redo the new branch", () => {
    const controller = new SceneController(createInitialDocument("A"));
    rename(controller, "B"); rename(controller, "C");
    expect(controller.undo()).toBe(true);
    expect(controller.getSnapshot().document.name).toBe("B");
    expect(controller.getSnapshot().canRedo).toBe(true);
    rename(controller, "D");
    expect(controller.redo()).toBe(false);
    expect(controller.getHistory().redo).toEqual([]);
    for (let i = 0; i < 3; i++) {
      expect(controller.undo()).toBe(true);
      expect(controller.getSnapshot().document.name).toBe("B");
      expect(controller.undo()).toBe(true);
      expect(controller.getSnapshot().document.name).toBe("A");
      expect(controller.redo()).toBe(true);
      expect(controller.getSnapshot().document.name).toBe("B");
      expect(controller.redo()).toBe(true);
      expect(controller.getSnapshot().document.name).toBe("D");
    }
  });

  it("retains exactly 50 operations across the undo and redo stacks", () => {
    const controller = new SceneController(createInitialDocument("0"));
    for (let i = 1; i <= 55; i++) rename(controller, String(i));
    expect(controller.getHistory().undo).toHaveLength(50);
    for (let i = 0; i < 50; i++) expect(controller.undo()).toBe(true);
    expect(controller.getSnapshot().document.name).toBe("5");
    expect(controller.undo()).toBe(false);
    expect(controller.getHistory().redo).toHaveLength(50);
    for (let i = 0; i < 50; i++) expect(controller.redo()).toBe(true);
    expect(controller.getSnapshot().document.name).toBe("55");
    expect(controller.redo()).toBe(false);
    expect(controller.getSnapshot().document.revision).toBe(155);
    controller.undo(); controller.undo(); rename(controller, "new branch");
    expect(controller.getHistory().undo).toHaveLength(49);
    expect(controller.getHistory().redo).toHaveLength(0);
  });

  it("restores a complete AI batch with stable IDs, geometry and bindings as one operation", () => {
    const controller = new SceneController(createInitialDocument());
    const before = content(controller.getSnapshot().document);
    const result = controller.applyBatch(createDemoBatch(0));
    expect(result.ok).toBe(true);
    const after = content(controller.getSnapshot().document);
    expect(controller.getHistory().undo).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      expect(controller.undoAiTransaction(result.ok ? result.transaction.id : undefined)).toBe(true);
      expect(content(controller.getSnapshot().document)).toEqual(before);
      expect(controller.redo()).toBe(true);
      expect(content(controller.getSnapshot().document)).toEqual(after);
    }
  });

  it("restores asset metadata, nested geometry and bound elements in one manual operation", () => {
    const controller = new SceneController(createInitialDocument());
    controller.commitManualElements([
      createNativeElement({ id: "shape", type: "rectangle", x: 0, y: 0, width: 100, height: 50, boundElements: [{ id: "text", type: "text" }] }),
      createNativeElement({ id: "text", type: "text", x: 0, y: 0, width: 80, height: 20, text: "before", containerId: "shape" }),
      createNativeElement({ id: "arrow", type: "arrow", x: 100, y: 0, width: 50, height: 20, startBinding: { elementId: "shape", focus: 0, gap: 2 } }),
    ]);
    const before = content(controller.getSnapshot().document);
    expect(controller.commitProjectChange("edit bound elements and asset", draft => {
      draft.scene.elements = draft.scene.elements.map(element => element.id === "shape" ? { ...element, x: 30, boundElements: [] }
        : element.type === "arrow" ? { ...element, startBinding: null, points: [[0, 0], [60, 40]] }
          : { ...element, containerId: null, text: "after" });
      draft.assets.push({ id: "asset", kind: "svg", fileName: "test.svg", relativePath: `assets/${"a".repeat(64)}.svg`,
        mimeType: "image/svg+xml", width: 24, height: 24, size: 10, sha256: "a".repeat(64), createdAt: new Date().toISOString() });
    }).ok).toBe(true);
    const after = content(controller.getSnapshot().document);
    controller.undo(); expect(content(controller.getSnapshot().document)).toEqual(before);
    controller.redo(); expect(content(controller.getSnapshot().document)).toEqual(after);
  });

  it("reverses edits across canvases, duplication, deletion and the zero-canvas state", () => {
    const controller = new SceneController(createInitialDocument()), first = controller.getSnapshot().document.activeCanvasId!;
    const initial = content(controller.getSnapshot().document);
    const second = controller.manageTree({ op: "duplicate", id: first })!;
    controller.switchCanvas(second);
    controller.manageTree({ op: "rename", id: second, name: "Second" });
    controller.manageTree({ op: "move", id: second, parentId: null, beforeId: first });
    controller.commitManualElements(controller.getSnapshot().document.scene.elements.map(element => ({ ...element, x: element.x + 40 })));
    const beforeDelete = content(controller.getSnapshot().document);
    controller.manageTree({ op: "delete", id: second });
    controller.manageTree({ op: "delete", id: first });
    expect(controller.getSnapshot().document.activeCanvasId).toBeNull();
    controller.undo(); controller.undo();
    expect(controller.getSnapshot().document.activeCanvasId).toBe(second);
    expect(content(controller.getSnapshot().document)).toEqual(beforeDelete);
    for (let i = 0; i < 4; i++) expect(controller.undo()).toBe(true);
    expect(content(controller.getSnapshot().document)).toEqual(initial);
    for (let i = 0; i < 6; i++) expect(controller.redo()).toBe(true);
    expect(controller.getSnapshot().document.canvases).toEqual({});
    expect(controller.getSnapshot().document.activeCanvasId).toBeNull();
  });

  it("keeps history on rejected/no-op edits, and clears it when opening another document", () => {
    const controller = new SceneController(createInitialDocument("A"));
    rename(controller, "B"); controller.undo();
    const before = controller.getSnapshot(), history = controller.getHistory();
    expect(controller.commitProjectChange("invalid", draft => { draft.name = ""; }).ok).toBe(false);
    expect(controller.commitProjectChange("no change", () => {})).toEqual({ ok: true, changed: false });
    expect(controller.getSnapshot()).toBe(before);
    expect(controller.getHistory()).toEqual(history);
    controller.replaceDocument(createInitialDocument("other"));
    expect(controller.getHistory()).toEqual({ undo: [], redo: [] });
    expect(controller.undo()).toBe(false); expect(controller.redo()).toBe(false);
  });
});
