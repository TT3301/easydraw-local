import { describe, expect, it } from "vitest";
import { createNativeElement, type LocalPoint } from "@easydraw/document-model";
import { createInitialDocument, SceneElementSchema } from "../core/protocol";
import {
  areSceneElementsCommitReady,
  mergeManualCanvasElements,
  sceneElementsSignature,
} from "./canvas-sync";

describe("native canvas synchronization", () => {
  it("does not echo an unchanged document back into a gesture", () => {
    const elements = createInitialDocument().scene.elements;
    expect(sceneElementsSignature(elements)).toBe(sceneElementsSignature(structuredClone(elements)));
    const moved = elements.map((element) => element.id === "welcome-title" ? { ...element, x: element.x + 20 } : element);
    expect(sceneElementsSignature(moved)).not.toBe(sceneElementsSignature(elements));
  });

  it("ignores object key ordering while preserving all native fields", () => {
    const elements = createInitialDocument().scene.elements;
    const reordered = elements.map((element) => SceneElementSchema.parse(Object.fromEntries(Object.entries(element).reverse())));
    expect(sceneElementsSignature(reordered)).toBe(sceneElementsSignature(elements));
  });

  it("recognizes changed path geometry and waits for an unfinished gesture", () => {
    const arrow = createNativeElement({ id: "arrow", type: "arrow", x: 100, y: 200,
      width: 120, height: 80, points: [[0, 0], [120, -80]] });
    const changed = createNativeElement({ ...arrow, points: [[0, 0], [120, 80]] });
    expect(sceneElementsSignature([changed])).not.toBe(sceneElementsSignature([arrow]));
    const unfinished = { ...arrow, points: [[0, 0] as LocalPoint] };
    expect(() => sceneElementsSignature([unfinished])).not.toThrow();
    expect(areSceneElementsCommitReady([unfinished])).toBe(false);
    expect(areSceneElementsCommitReady([changed])).toBe(true);
  });

  it("retains authoritative unchanged elements when another native element moves", () => {
    const elements = createInitialDocument().scene.elements;
    const rectangle = createNativeElement({ id: "outside", type: "rectangle", x: 500, y: 900, width: 80, height: 60 });
    const document = [...elements, rectangle];
    const previous = document.map((element) => element.id === "welcome-title" ? { ...element, x: element.x - 64 } : element);
    const next = previous.map((element) => element.id === "outside" ? { ...element, x: 740 } : element);
    const merged = mergeManualCanvasElements(document, previous, next);
    expect(merged.find((element) => element.id === "welcome-title")).toMatchObject({ x: 28 });
    expect(merged.find((element) => element.id === "outside")).toMatchObject({ x: 740 });
  });
});
