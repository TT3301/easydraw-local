import "../features/ai/engine-test-globals";
import { describe, it, expect } from "vitest";
import { routeElbowArrow } from "@easydraw/canvas-engine/editor/element/elbowArrowRouting";
import { mutateElement, newElementWith } from "@easydraw/canvas-engine/editor/element/mutateElement";
import Scene from "@easydraw/canvas-engine/editor/scene/Scene";
import { createNativeElement, normalizeSceneElements, type EasyDrawElement } from "@easydraw/document-model";

type Arrow = Extract<EasyDrawElement, { type: "arrow" }>;
const orthogonal = (points: readonly (readonly number[])[]) =>
  points.slice(1).every(([x, y], i) => x === points[i][0] || y === points[i][1]);

function scene(bound: boolean) {
  const binding = (elementId: string) => ({ elementId, focus: 0, gap: 5 });
  const elements = normalizeSceneElements([
    createNativeElement({ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 60, boundElements: bound ? [{ id: "flow", type: "arrow" }] : [] }),
    createNativeElement({ id: "b", type: "rectangle", x: 300, y: 200, width: 100, height: 60, boundElements: bound ? [{ id: "flow", type: "arrow" }] : [] }),
    createNativeElement({ id: "flow", type: "arrow", x: 105, y: 30, width: 190, height: 200, points: [[0, 0], [190, 200]], elbowed: false,
      startBinding: bound ? binding("a") : null, endBinding: bound ? binding("b") : null }),
  ]) as any[];
  const s = new Scene();
  s.replaceAllElements(elements);
  return s;
}
// Same element copy the editor's "change arrow type" action builds before routing.
const elbowCopy = (s: Scene) => {
  const arrow = s.getNonDeletedElementsMap().get("flow") as any;
  return newElementWith(arrow, { roundness: null, elbowed: true, points: [arrow.points[0], arrow.points[arrow.points.length - 1]] }) as any;
};

describe("changing an arrow to elbow", () => {
  for (const bound of [false, true]) {
    it(`routes ${bound ? "a connected" : "a free"} arrow immediately`, () => {
      const s = scene(bound);
      try {
        const flow = routeElbowArrow(elbowCopy(s), s.getNonDeletedElements(), s.getNonDeletedElementsMap(), { bindHovered: true, keepFixedPoints: false }) as Arrow;
        expect(flow.elbowed).toBe(true);
        expect(flow.points.length).toBeGreaterThan(2);
        expect(orthogonal(flow.points)).toBe(true);
        if (bound) {
          expect(flow.startBinding).toMatchObject({ elementId: "a", fixedPoint: expect.any(Array) });
          expect(flow.endBinding).toMatchObject({ elementId: "b", fixedPoint: expect.any(Array) });
        }
      } finally { s.destroy(); }
    });
  }

  it("documents the old failure: a connected copy outside the scene kept its straight diagonal", () => {
    const s = scene(true);
    try {
      const copy = elbowCopy(s);
      mutateElement(copy, { points: copy.points });
      expect(copy.points).toHaveLength(2);
      expect(orthogonal(copy.points)).toBe(false);
    } finally { s.destroy(); }
  });
});
