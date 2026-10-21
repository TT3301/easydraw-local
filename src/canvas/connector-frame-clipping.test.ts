import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeElement } from "@easydraw/document-model";
import type {
  EasyDrawElement,
  EasyDrawFrameLikeElement,
  ElementsMap,
} from "@easydraw/canvas-engine/element/types";
import type { StaticCanvasAppState } from "@easydraw/canvas-engine/types";

describe("connector frame clipping", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not clip a dragged connector to the highlighted page", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    vi.stubGlobal("document", { createElement: () => ({}) });
    vi.stubGlobal("devicePixelRatio", 1);
    vi.stubGlobal("navigator", { platform: "", userAgent: "" });

    const { shouldApplyFrameClip } = await import(
      "@easydraw/canvas-engine/editor/frame"
    );
    const page = createNativeElement({
      id: "page",
      type: "frame",
      x: 100,
      y: 100,
      width: 400,
      height: 400,
    }) as EasyDrawFrameLikeElement;
    const connector = createNativeElement({
      id: "connector",
      type: "arrow",
      x: 50,
      y: 200,
      width: 500,
      height: 0,
      frameId: null,
    }) as EasyDrawElement;
    const elementsMap = new Map([
      [page.id, page],
      [connector.id, connector],
    ]) as ElementsMap;
    const appState = {
      frameRendering: { enabled: true, clip: true, outline: true, name: true },
      frameToHighlight: page,
      selectedElementIds: { [connector.id]: true },
      selectedElementsAreBeingDragged: true,
    } as StaticCanvasAppState;

    expect(
      shouldApplyFrameClip(connector, page, appState, elementsMap),
    ).toBe(false);

  });
});
