import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeElement } from "@easydraw/document-model";
import type { EasyDrawElement } from "@easydraw/canvas-engine/element/types";

afterEach(() => vi.unstubAllGlobals());
describe("engine scene updates", () => {
  it("uses the existing element lookup to clean deleted and absent selections while preserving valid IDs", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    vi.stubGlobal("document", { createElement: () => ({}) });
    vi.stubGlobal("navigator", { platform: "", userAgent: "" });
    vi.stubGlobal("devicePixelRatio", 1);
    const { default: Scene } = await import("@easydraw/canvas-engine/editor/scene/Scene");
    const { mutateElement } = await import("@easydraw/canvas-engine/editor/element/mutateElement");
    const scene = new Scene();
    const a = createNativeElement({ id: "a", type: "rectangle", index: "a0", x: 0, y: 0, width: 100, height: 50 }) as EasyDrawElement;
    const b = createNativeElement({ id: "b", type: "rectangle", index: "a1", x: 150, y: 0, width: 100, height: 50 }) as EasyDrawElement;
    scene.replaceAllElements([a, b]);
    const selection = { a: true as const, b: true as const };
    expect(scene.getValidSelectedElementIds(selection)).toBe(selection);
    const version = scene.getVersion();
    scene.triggerUpdate(false);
    expect(scene.getVersion()).toBe(version);
    mutateElement(a, { x: 20 }, false);
    expect(scene.getVersion()).toBe(version + 1);
    mutateElement(a, { x: 20 }, false);
    expect(scene.getVersion()).toBe(version + 1);
    scene.replaceAllElements([a, { ...b, isDeleted: true }]);
    expect(scene.getVersion()).toBe(version + 2);
    expect(scene.getValidSelectedElementIds(selection)).toEqual({ a: true });
    scene.replaceAllElements([a]);
    expect(scene.getValidSelectedElementIds(selection)).toEqual({ a: true });
    expect(selection).toEqual({ a: true, b: true });
    const valid = { a: true as const };
    const lookup = vi.spyOn(scene.getNonDeletedElementsMap(), "has");
    expect(scene.getValidSelectedElementIds(valid)).toBe(valid);
    expect(lookup).toHaveBeenCalledExactlyOnceWith("a");
    scene.destroy();
  });
});
