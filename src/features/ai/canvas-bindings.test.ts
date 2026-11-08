import "./engine-test-globals";
import { describe, it, expect, beforeAll } from "vitest";
import { setCustomTextMetricsProvider } from "@easydraw/canvas-engine/editor/element/textMeasurements";
import { getHoveredElementForBinding } from "@easydraw/canvas-engine/editor/element/binding";
import { createNativeElement, normalizeSceneElements, type EasyDrawElement } from "@easydraw/document-model";
import { ApplyOperationsSchema, createInitialDocument, type ProjectDocument } from "../../core/protocol";
import { executeCanvasOperations } from "../../core/canvas-commands";
import { reconcileCanvasBindings } from "./canvas-runtime";

const page = (id: string, x: number, extra = {}) => createNativeElement({ id, type: "frame", x, y: 0, width: 300, height: 300, ...extra });
const hovered = (elements: EasyDrawElement[], x: number, y: number) => {
  const scene = normalizeSceneElements(elements) as any[];
  return getHoveredElementForBinding({ x, y }, scene, new Map(scene.map(e => [e.id, e])) as any)?.id ?? null;
};

describe("connectors bound to pages", () => {
  it("snaps to a page border but prefers a member sitting on that edge", () => {
    const elements = [page("home", 0), createNativeElement({ id: "button", type: "rectangle", frameId: "home", x: 0, y: 100, width: 120, height: 40 })];
    expect(hovered(elements, 2, 120)).toBe("button");
    expect(hovered(elements, 2, 250)).toBe("home");
    expect(hovered(elements, 150, 150)).toBeNull();
  });

  it("moves a bound endpoint when the page it points to grows", () => {
    const binding = (elementId: string) => ({ elementId, focus: 0, gap: 5 });
    const before: ProjectDocument = { ...createInitialDocument(), focusedPageElementId: "home", scene: { elements: [
      page("home", 0, { boundElements: [{ id: "flow", type: "arrow" }] }),
      page("detail", 400, { boundElements: [{ id: "flow", type: "arrow" }] }),
      createNativeElement({ id: "flow", type: "arrow", x: 305, y: 150, width: 90, height: 0, points: [[0, 0], [90, 0]],
        startBinding: binding("home"), endBinding: binding("detail") }),
    ] } };
    const draft = structuredClone(before);
    draft.scene.elements = draft.scene.elements.map(e => e.id === "detail" ? { ...e, height: 900 } : e);
    reconcileCanvasBindings(before, draft);
    const flow = draft.scene.elements.find(e => e.id === "flow") as Extract<EasyDrawElement, { type: "arrow" }>;
    const [endX, endY] = flow.points[flow.points.length - 1];
    // The end stays just outside the grown page's left edge and turns toward its new centre.
    expect(flow.x + endX).toBeGreaterThan(385);
    expect(flow.x + endX).toBeLessThan(400);
    expect(flow.y + endY).toBeGreaterThan(150);
    expect(flow.endBinding).toMatchObject({ elementId: "detail" });
  });
});

describe("elbow arrows written through commands", () => {
  beforeAll(() => setCustomTextMetricsProvider({ getLineWidth: text => text.length * 10 }));
  type Arrow = Extract<EasyDrawElement, { type: "arrow" }>;
  const orthogonal = (points: readonly (readonly number[])[]) => points.slice(1).every(([x, y], i) => x === points[i][0] || y === points[i][1]);
  const write = (document: ProjectDocument, operations: unknown[]) => {
    const { draft } = executeCanvasOperations(document, ApplyOperationsSchema.parse({ documentId: document.projectId, canvasId: document.activeCanvasId!, baseRevision: 0, requestId: "w", label: "W", operations }), new Map());
    reconcileCanvasBindings(document, draft);
    return draft;
  };
  const get = (d: ProjectDocument, id: string) => d.scene.elements.find(e => e.id === id)!;
  const end = (arrow: Arrow) => [arrow.x + arrow.points.at(-1)![0], arrow.y + arrow.points.at(-1)![1]];

  it("routes on creation, re-routes when a connected element moves and keeps its label on the path", () => {
    const empty: ProjectDocument = { ...createInitialDocument(), focusedPageElementId: null, scene: { elements: [] } };
    const created = write(empty, [
      { op: "create", element: { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 60 } },
      { op: "create", element: { id: "b", type: "rectangle", x: 300, y: 200, width: 100, height: 60 } },
      { op: "create", element: { id: "flow", type: "arrow", x: 100, y: 30, width: 200, height: 200, points: [[0, 0], [200, 200]], startBinding: { elementId: "a" }, endBinding: { elementId: "b" } } },
      { op: "create", element: { id: "label", type: "text", x: 0, y: 0, width: 40, height: 25, text: "go", containerId: "flow" } },
    ]);
    const routed = get(created, "flow") as Arrow;
    expect(routed).toMatchObject({ elbowed: true, startBinding: { elementId: "a", fixedPoint: expect.any(Array) }, endBinding: { elementId: "b", fixedPoint: expect.any(Array) } });
    expect(routed.points.length).toBeGreaterThan(2);
    expect(orthogonal(routed.points)).toBe(true);

    const labelBefore = get(created, "label");
    const moved = write(created, [{ op: "move", ids: ["b"], dx: 200, dy: 100 }]);
    const rerouted = get(moved, "flow") as Arrow;
    expect(orthogonal(rerouted.points)).toBe(true);
    const [ex, ey] = end(rerouted);
    // The end stays on b's moved outline (within the binding gap), not where b used to be.
    expect(ex).toBeGreaterThanOrEqual(490);
    expect(ex).toBeLessThanOrEqual(610);
    expect(ey).toBeGreaterThanOrEqual(290);
    expect(ey).toBeLessThanOrEqual(370);
    expect(rerouted.endBinding?.fixedPoint).toEqual(routed.endBinding?.fixedPoint);
    expect(get(moved, "label")).not.toMatchObject({ x: labelBefore.x, y: labelBefore.y });
  });
});
