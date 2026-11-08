import "../features/ai/engine-test-globals";
import { describe, expect, it } from "vitest";
import { createNativeElement } from "@easydraw/document-model";
import type { AppState } from "@easydraw/canvas-engine/types";
import { calculateScrollCenter } from "@easydraw/canvas-engine/editor/scene/scroll";

const view = (zoom: number, scrollX = 0, scrollY = 0) => ({
  width: 1200, height: 800, offsetLeft: 0, offsetTop: 0,
  scrollX, scrollY, zoom: { value: zoom },
}) as AppState;

describe("return to canvas content", () => {
  it.each([0.5, 1, 2])("centers all content at %sx without changing zoom or depending on the starting position", zoom => {
    const elements = [
      createNativeElement({ id: "left", type: "frame", x: -1600, y: -800, width: 200, height: 200 }),
      createNativeElement({ id: "right", type: "frame", x: 2400, y: 1200, width: 200, height: 200 }),
    ];
    for (const [x, y] of [[-10000, -10000], [10000, 10000]]) {
      const state = view(zoom, x, y);
      const result = calculateScrollCenter(elements, state);
      expect(result).toEqual({ scrollX: 600 / zoom - 500, scrollY: 400 / zoom - 300 });
      expect(state.zoom.value).toBe(zoom);
    }
  });

  it("ignores deleted elements when finding the overall center", () => {
    const elements = [
      createNativeElement({ id: "content", type: "rectangle", x: 0, y: 0, width: 200, height: 200 }),
      { ...createNativeElement({ id: "deleted", type: "rectangle", x: 10000, y: 10000, width: 200, height: 200 }), isDeleted: true },
    ];
    expect(calculateScrollCenter(elements, view(1))).toEqual({ scrollX: 500, scrollY: 300 });
  });

  it("returns to the origin when there is no content", () => {
    expect(calculateScrollCenter([], view(2))).toEqual({ scrollX: 0, scrollY: 0 });
  });
});
