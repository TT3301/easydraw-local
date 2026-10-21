import { createElementFromInput } from "../../core/element-commands";
import { describe, expect, it } from "vitest";
import type { EasyDrawElement } from "@easydraw/canvas-engine/element/types";
import {
  createMaterialLibraryItem,
  instantiateMaterialLibraryItem,
  parseStoredMaterialLibrary,
} from "./material-library";

const element = (
  overrides: Partial<EasyDrawElement> & Pick<EasyDrawElement, "id" | "type">,
) =>
  ({
    x: 10,
    y: 20,
    width: 100,
    height: 40,
    angle: 0,
    strokeColor: "#1f2937",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: "page-1",
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    customData: undefined,
    ...overrides,
  }) as EasyDrawElement;

describe("material library", () => {
  it("ignores malformed persisted data", () => {
    expect(parseStoredMaterialLibrary("not-json")).toEqual([]);
    expect(parseStoredMaterialLibrary('{"items":[]}')).toEqual([]);
  });

  it("stores supported selected elements without their page frame", () => {
    const item = createMaterialLibraryItem({
      sceneElements: [
        element({ id: "shape", type: "rectangle" }),
        element({ id: "image", type: "image" }),
        element({ id: "page-1", type: "frame" }),
      ],
      selectedIds: new Set(["shape", "image", "page-1"]),
      id: "material-1",
      name: "素材 1",
      created: 100,
    });

    expect(item?.id).toBe("material-1");
    expect(item?.elements.map((entry) => entry.id)).toEqual(["shape"]);
    expect(item?.elements[0].frameId).toBeNull();
  });

  it("centers an inserted item and remaps element and group ids", () => {
    let nextId = 0;
    const item = createMaterialLibraryItem({
      sceneElements: [
        element({
          id: "shape-a",
          type: "rectangle",
          x: 10,
          y: 20,
          width: 100,
          height: 40,
          groupIds: ["group-a"],
        }),
        element({
          id: "shape-b",
          type: "ellipse",
          x: 130,
          y: 20,
          width: 60,
          height: 40,
          groupIds: ["group-a"],
        }),
      ],
      selectedIds: new Set(["shape-a", "shape-b"]),
      id: "material-1",
      name: "素材 1",
    });
    if (!item) throw new Error("expected a material item");

    const inserted = instantiateMaterialLibraryItem({
      item,
      page: createElementFromInput({
        id: "page-2",
        type: "page",
        name: "首页",
        x: 1000,
        y: 500,
        width: 400,
        height: 300,
        rotation: 0,
        background: "#ffffff",
        rounded: true,
        order: 0,
        exportScale: 2,
        locked: false,
        groupIds: [],
      }),
      createId: () => `new-${++nextId}`,
    });

    expect(inserted).toHaveLength(2);
    expect(inserted[0].id).not.toBe("shape-a");
    expect(inserted[0].frameId).toBe("page-2");
    expect(inserted[0].x).toBe(1110);
    expect(inserted[1].x).toBe(1230);
    expect(inserted[0].groupIds[0]).toBe(inserted[1].groupIds[0]);
    expect(inserted[0].groupIds[0]).not.toBe("group-a");
  });
});
