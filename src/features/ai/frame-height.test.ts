import { describe, expect, it } from "vitest";
import { createNativeElement, type EasyDrawElement } from "@easydraw/document-model";
import { elementBounds } from "../../core/canvas-geometry";
import { growAiFrameHeights } from "./frame-height";

const measure = (elements: EasyDrawElement[]) => elements.map(e => ({ id: e.id, ...elementBounds(e, true) }));
const frame = (id = "page", height = 100) => createNativeElement({ id, type: "frame", x: 50, y: 200, width: 390, height });
const child = (id: string, y: number, extra = {}) => createNativeElement({ id, type: "rectangle", frameId: "page", x: 80, y, width: 100, height: 20, strokeWidth: 0, ...extra });

describe("AI frame height", () => {
  it("covers rotated grouped members and strokes without changing width, position or member geometry", () => {
    const page = frame();
    const rotated = child("card", 280, { angle: Math.PI / 2, strokeWidth: 4, groupIds: ["block"] });
    const elements = [page, rotated];
    expect(growAiFrameHeights([page], elements, [rotated.id], measure)).toEqual([{ frameId: "page", previousHeight: 100, height: 142 }]);
    expect(elements[0]).toMatchObject({ x: 50, y: 200, width: 390, height: 142, version: page.version + 1 });
    expect(elements[1]).toBe(rotated);
    expect(page.height).toBe(100);
  });

  it("includes all members of a touched page and ignores unrelated pages and unowned objects", () => {
    const page = frame(), other = frame("other");
    const elements = [page, child("old", 380), child("new", 240), other,
      child("unrelated", 600, { frameId: "other" }), child("free", 900, { frameId: null })];
    growAiFrameHeights(elements.slice(), elements, ["new"], measure);
    expect(elements[0].height).toBe(200);
    expect(elements[3]).toBe(other);
  });

  it("grows a new membership but never shrinks a former or emptied page", () => {
    const page = frame("page", 500), other = frame("other");
    const old = child("move", 600);
    const moved = { ...old, frameId: "other" };
    const elements = [page, other, moved];
    expect(growAiFrameHeights([page, other, old], elements, ["move"], measure)).toEqual([{ frameId: "other", previousHeight: 100, height: 420 }]);
    expect(elements[0]).toBe(page);
    expect(growAiFrameHeights(elements.slice(), [elements[0], elements[1]], ["move"], measure)).toEqual([]);
  });

  it("ignores left, right and top overflow and rounds a fractional bottom upwards", () => {
    const page = frame();
    const elements = [page, child("top", -100), child("wide", 240, { x: -500, width: 2000 }), child("bottom", 299.25, { height: 1 })];
    expect(growAiFrameHeights([page], elements, ["top", "wide"], measure)).toEqual([{ frameId: "page", previousHeight: 100, height: 101 }]);
    expect(elements[0].width).toBe(390);
    expect(growAiFrameHeights(elements.slice(), elements, ["top"], measure)).toEqual([]);
  });

  it("does not count canvas arrows or their labels as page members before native normalization", () => {
    const page = frame();
    const arrow = createNativeElement({ id: "arrow", type: "arrow", x: 100, y: 500, width: 100, height: 100, frameId: "page", points: [[0, 0], [100, 100]] });
    const label = createNativeElement({ id: "label", type: "text", x: 100, y: 700, width: 100, height: 20, text: "Link", frameId: "page", containerId: "arrow" });
    const elements = [page, arrow, label];
    expect(growAiFrameHeights([page], elements, ["page", "arrow", "label"], measure)).toEqual([]);
    expect(elements[0]).toBe(page);
  });
});
