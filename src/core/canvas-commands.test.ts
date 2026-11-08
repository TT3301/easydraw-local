import { describe, it, expect } from "vitest";
import { createNativeElement, NativeProjectDocumentSchema } from "@easydraw/document-model";
import { ApplyOperationsSchema, createInitialDocument, type ProjectDocument } from "./protocol";
import { executeCanvasOperations } from "./canvas-commands";
import { scopeElements, canvasOutline } from "./canvas-query";
const freeDocument = (): ProjectDocument => ({ ...createInitialDocument(), focusedPageElementId: null, scene: { elements: [] } });
const apply = (operations: unknown[], document = freeDocument(), extras = {}) => executeCanvasOperations(document, ApplyOperationsSchema.parse({ documentId: document.projectId, canvasId: document.activeCanvasId!, baseRevision: 0, requestId: "test", label: "Test", operations, ...extras }), new Map());
const shape = (id: string, extras = {}) => ({ op: "create", element: { id, type: "rectangle", x: 10, y: 10, width: 100, height: 40, ...extras } });
describe("general canvas commands", () => {
  it("edits an empty frame-free canvas and queries free elements", () => {
    const { draft } = apply([shape("a"), { op: "create", element: { id: "b", type: "diamond", x: -100, y: -100, width: 80, height: 80 } }]);
    expect(NativeProjectDocumentSchema.safeParse(draft).success).toBe(true);
    expect(scopeElements(draft, { kind: "document" })).toHaveLength(2);
    expect(canvasOutline(draft, { kind: "document" }, 0, 1)).toMatchObject({ total: 2, nextOffset: 1 });
  });
  it("resolves forward local refs and mixed grouping in one batch", () => {
    const { draft, idMap } = apply([
      { ...shape("a", { frameId: "screen" }), ref: "a-ref" },
      { op: "create", ref: "screen", element: { type: "frame", x: 0, y: 0, width: 300, height: 300 } },
      { op: "group", ids: ["a-ref", "screen"], groupId: "component" },
    ]);
    expect(draft.scene.elements.find(e => e.id === "a")?.frameId).toBe(idMap.screen);
    expect(draft.scene.elements.every(e => e.groupIds.includes("component"))).toBe(true);
  });
  it("uses explicit local coordinates without implicit membership", () => {
    const d = apply([{ op: "create", element: { id: "frame", type: "frame", x: 300, y: 200, width: 300, height: 300 } }]).draft;
    const result = apply([shape("a")], d, { coordinateSpace: { kind: "container", id: "frame" } });
    expect(result.draft.scene.elements.find(e => e.id === "a")).toMatchObject({ x: 310, y: 210, frameId: null });
  });
  it("does not mutate the input when a later operation fails", () => {
    const document = freeDocument(), before = structuredClone(document);
    expect(() => apply([shape("a"), { op: "move", ids: ["missing"], dx: 20, dy: 0 }], document)).toThrow("missing");
    expect(document).toEqual(before);
  });
  it("duplicates groups, frame membership and internal text bindings", () => {
    const d = apply([{ op: "create", element: { id: "frame", type: "frame", x: 0, y: 0, width: 300, height: 300 } }, shape("a", { frameId: "frame", groupIds: ["g"] }),
      { op: "create", element: { id: "label", type: "text", frameId: "frame", containerId: "a", groupIds: ["g"], text: "Hi", x: 20, y: 20, width: 50, height: 20 } }]).draft;
    const { draft, duplicates } = apply([{ op: "duplicate", ids: ["frame"], dx: 400, dy: 0 }], d);
    const label = draft.scene.elements.find(e => e.id === duplicates[0].ids.label);
    expect(label).toMatchObject({ x: 420, frameId: duplicates[0].ids.frame, containerId: duplicates[0].ids.a });
    expect(label?.groupIds[0]).not.toBe("g");
  });
  it("makes container deletion policy explicit and supports deleting the last frame", () => {
    const d = apply([{ op: "create", element: { id: "frame", type: "frame", x: 0, y: 0, width: 300, height: 300 } }, shape("a", { frameId: "frame" })]).draft;
    const detached = apply([{ op: "delete", ids: ["frame"], children: "detach" }], d).draft;
    expect(detached.scene.elements).toHaveLength(1);
    expect(detached.scene.elements[0].frameId).toBeNull();
    expect(detached.focusedPageElementId).toBeNull();
    expect(apply([{ op: "delete", ids: ["frame"], children: "delete" }], d).draft.scene.elements).toHaveLength(0);
  });
  it("composes layout with creation and metadata while clearing fields explicitly", () => {
    const { draft } = apply([shape("a", { customData: { "diagram.role": "node" } }), shape("b", { x: 220 }),
      { op: "arrange", ids: ["a", "b"], columns: 1, origin: [50, 60], gapY: 12 },
      { op: "update", id: "a", patch: { customData: null } }]);
    expect(draft.scene.elements[0]).toMatchObject({ x: 50, y: 60 });
    expect(draft.scene.elements[1]).toMatchObject({ x: 50, y: 112 });
    expect(draft.scene.elements[0].customData).toBeUndefined();
  });
  it("scales points and typography and rejects unsupported properties", () => {
    const { draft } = apply([{ op: "create", element: { id: "line", type: "line", x: 10, y: 20, width: 50, height: 0, points: [[0, 0], [50, 0]] } },
      { op: "scale", ids: ["line"], factor: 2, origin: [0, 0] }]);
    expect(draft.scene.elements[0]).toMatchObject({ x: 20, y: 40, points: [[0, 0], [100, 0]] });
    expect(() => apply([shape("bad", { text: "unsupported" })])).toThrow("does not support text");
    expect(() => apply([{ op: "create", element: { id: "nested", type: "frame", frameId: "parent", x: 0, y: 0, width: 20, height: 20 } }])).toThrow("Nested frames");
  });
  it("requires document/scope for content queries at the public protocol boundary", () => {
    expect(ApplyOperationsSchema.safeParse({ baseRevision: 0, transactionLabel: "old", operations: [shape("a")] }).success).toBe(false);
  });
  it("does not let generated group IDs overwrite a local element ref", () => {
    const { draft, idMap, groups } = apply([{ ...shape("a"), ref: "group" }, shape("b"), { op: "group", ids: ["group", "b"] }, { op: "move", ids: ["group"], dx: 20, dy: 0 }]);
    expect(draft.scene.elements.find(e => e.id === idMap.group)?.x).toBe(30);
    expect(groups[0].groupId).not.toBe(idMap.group);
  });
  it("connects pages with arrows and keeps the binding through page moves and deletion", () => {
    const page = (id: string, x: number) => ({ op: "create", element: { id, type: "frame", x, y: 0, width: 300, height: 300 } });
    const flow = { op: "create", element: { id: "flow", type: "arrow", x: 305, y: 150, width: 90, height: 0, points: [[0, 0], [90, 0]],
      startBinding: { elementId: "home" }, endBinding: { elementId: "detail" } } };
    const { draft } = apply([page("home", 0), page("detail", 400), flow]);
    expect(draft.scene.elements.find(e => e.id === "flow")).toMatchObject({ startBinding: { elementId: "home" }, endBinding: { elementId: "detail" }, frameId: null });
    expect(draft.scene.elements.find(e => e.id === "detail")?.boundElements).toEqual([{ id: "flow", type: "arrow" }]);
    const deleted = apply([{ op: "delete", ids: ["detail"], children: "delete" }], draft).draft;
    expect(deleted.scene.elements.find(e => e.id === "flow")).toMatchObject({ startBinding: { elementId: "home" }, endBinding: null });
  });
  it("creates elbow arrows by default and keeps elbow, curved and straight styles exclusive", () => {
    const arrow = (id: string, extra = {}) => ({ op: "create", element: { id, type: "arrow", x: 0, y: 0, width: 100, height: 50, points: [[0, 0], [100, 0], [100, 50]], ...extra } });
    const { draft } = apply([arrow("elbow"), arrow("curve", { roundness: { type: 2 } }), arrow("straight", { elbowed: false })]);
    const get = (d: typeof draft, id: string) => d.scene.elements.find(e => e.id === id) as any;
    expect(get(draft, "elbow")).toMatchObject({ elbowed: true, roundness: null });
    expect(get(draft, "curve")).toMatchObject({ elbowed: false, roundness: { type: 2 } });
    expect(get(draft, "straight")).toMatchObject({ elbowed: false, roundness: null });
    expect(() => apply([arrow("bad", { elbowed: true, roundness: { type: 2 } })])).toThrow("Elbow arrows cannot have roundness");
    expect(() => apply([shape("box", { elbowed: true })])).toThrow("rectangle does not support elbowed");

    const switched = apply([{ op: "update", id: "elbow", patch: { roundness: { type: 2 } } }, { op: "update", id: "curve", patch: { elbowed: true } }], draft).draft;
    expect(get(switched, "elbow")).toMatchObject({ elbowed: false, roundness: { type: 2 }, points: [[0, 0], [100, 50]], width: 100, height: 50 });
    expect(get(switched, "curve")).toMatchObject({ elbowed: true, roundness: null });
    expect(get(apply([{ op: "update", id: "elbow", patch: { strokeColor: "#e03131" } }], draft).draft, "elbow")).toMatchObject({ elbowed: true, points: [[0, 0], [100, 0], [100, 50]] });
  });
  it("names the connector, field and target type when a binding is invalid", () => {
    const line = { op: "create", element: { id: "rail", type: "line", x: 0, y: 0, width: 100, height: 0, points: [[0, 0], [100, 0]] } };
    const arrow = { op: "create", element: { id: "flow", type: "arrow", x: 0, y: 0, width: 100, height: 0, points: [[0, 0], [100, 0]], endBinding: { elementId: "rail" } } };
    let error: any;
    try { apply([line, arrow]); } catch (e) { error = e; }
    expect(error).toMatchObject({ code: "INVALID_BINDING", details: { elementId: "flow", field: "endBinding", targetId: "rail", targetType: "line" } });
    expect(error.message).toContain("arrow flow endBinding cannot bind to line rail");
    expect(() => apply([{ ...arrow, element: { ...arrow.element, startBinding: { elementId: "missing" }, endBinding: null } }]))
      .toThrow("arrow flow startBinding references missing element missing");
  });
});
