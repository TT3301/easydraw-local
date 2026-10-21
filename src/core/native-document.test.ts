import { describe, expect, it } from "vitest";
import { createNativeElement, NativeProjectDocumentSchema, normalizeSceneElements, reconcilePageAggregates } from "@easydraw/document-model";
import { createInitialDocument } from "./protocol";
import { SceneController } from "./scene-controller";

const native = (id: string, type: "rectangle" | "frame" = "rectangle", extra = {}) =>
  createNativeElement({ id, type, x: 0, y: 0, width: 200, height: 200, ...extra });

describe("owned native document rules", () => {
  it("retains native geometry, bindings and extension data across JSON validation", () => {
    const document = createInitialDocument();
    document.scene.elements.push(native("shape", "rectangle", {
      frameId: "page-home", angle: 0.4, customData: { tag: "component" },
      boundElements: [{ id: "label", type: "text" }],
    }), createNativeElement({ id: "label", type: "text", x: 20, y: 20, width: 100, height: 30,
      text: "Hello", containerId: "shape", frameId: "page-home" }));
    expect(NativeProjectDocumentSchema.parse(JSON.parse(JSON.stringify(document)))).toEqual(document);
    expect(NativeProjectDocumentSchema.safeParse({ ...document, schemaVersion: 2 }).success).toBe(false);
  });

  it("normalizes page membership and stacking without adding background elements", () => {
    const elements = [native("page", "frame"), native("lower", "rectangle", { frameId: "page" }),
      native("free"), native("upper", "rectangle", { frameId: "page" })];
    const ordered = normalizeSceneElements(elements);
    expect(ordered.map((element) => element.id)).toEqual(["lower", "upper", "page", "free"]);
    expect(normalizeSceneElements(ordered)).toEqual(ordered);
    expect(ordered.every((element, i) => !i || element.index! > ordered[i - 1].index!)).toBe(true);
    expect(elements[0].index).toBeNull();
  });

  it("keeps connectors and their labels canvas-scoped while lines stay page-scoped", () => {
    const page = native("page", "frame");
    const connector = createNativeElement({
      id: "connector", type: "arrow", x: 0, y: 0, width: 100, height: 20,
      frameId: page.id, boundElements: [{ id: "connector-label", type: "text" }],
    });
    const label = createNativeElement({
      id: "connector-label", type: "text", x: 20, y: 0, width: 60, height: 20,
      text: "Next", containerId: connector.id, frameId: page.id,
    });
    const line = createNativeElement({
      id: "line", type: "line", x: 0, y: 40, width: 100, height: 0,
      frameId: page.id,
    });

    const ordered = normalizeSceneElements([page, connector, label, line]);

    expect(ordered.find((element) => element.id === connector.id)?.frameId).toBeNull();
    expect(ordered.find((element) => element.id === label.id)?.frameId).toBeNull();
    expect(ordered.find((element) => element.id === line.id)?.frameId).toBe(page.id);
  });

  it("deleting a page removes content even if the gesture detached it first", () => {
    const page = native("page", "frame");
    const child = native("child", "rectangle", { frameId: page.id });
    const free = native("free");
    const next = reconcilePageAggregates([{ ...child, frameId: null }, free], [page, child, free]);
    expect(next.find((element) => element.id === "child")?.isDeleted).toBe(true);
    expect(next.find((element) => element.id === "free")).toBe(free);
  });

  it("uses one transaction and undo for page movement from an AI command", () => {
    const controller = new SceneController(createInitialDocument());
    const before = structuredClone(controller.getSnapshot().document);
    expect(controller.applyBatch({ baseRevision: 0, transactionLabel: "move", operations: [
      { op: "update", id: "page-home", patch: { x: 100 } },
    ] }).ok).toBe(true);
    const oldChild = before.scene.elements.find((element) => element.id === "welcome-title")!;
    const child = controller.getSnapshot().document.scene.elements.find((element) => element.id === oldChild.id)!;
    expect(child.x).toBe(oldChild.x + 100);
    expect(child.version).toBeGreaterThan(oldChild.version);
    controller.undo();
    expect(controller.getSnapshot().document.scene).toEqual(before.scene);
    expect(controller.getSnapshot().document.revision).toBe(before.revision + 2);
    controller.redo();
    expect(controller.getSnapshot().document.scene.elements.find((element) => element.id === child.id)?.x).toBe(child.x);
  });
});
