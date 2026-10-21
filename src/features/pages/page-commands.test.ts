import { createElementFromInput } from "../../core/element-commands";
import { describe, expect, it } from "vitest";
import {
  ProjectDocumentSchema,
  createInitialDocument,
  getPageElements,
} from "../../core/protocol";
import { SceneController } from "../../core/scene-controller";

describe("page commands and asset transactions", () => {
  it("rejects documents without the current asset manifest", () => {
    const legacy = createInitialDocument() as Record<string, unknown>;
    delete legacy.assets;

    expect(ProjectDocumentSchema.safeParse(legacy).success).toBe(false);
  });

  it("rejects legacy svg-icon elements instead of migrating them", () => {
    const legacy = createInitialDocument() as unknown as {
      scene: { elements: Array<Record<string, unknown>> };
    };
    legacy.scene.elements.push({
      id: "legacy-icon",
      type: "svg-icon",
      containerId: "page-home",
      x: 24,
      y: 160,
      width: 24,
      height: 24,
      rotation: 0,
      assetId: "asset_legacy",
      altText: "Legacy icon",
      style: {
        fill: "transparent",
        stroke: "transparent",
        strokeWidth: 0,
        radius: 0,
        opacity: 1,
        fontSize: 16,
        textAlign: "left",
      },
      locked: false,
      groupIds: [],
    });

    expect(ProjectDocumentSchema.safeParse(legacy).success).toBe(false);
  });

  it("creates, focuses, updates, deletes and restores a page through production commands", () => {
    const controller = new SceneController(createInitialDocument());
    const apply = (operations: Parameters<SceneController["applyBatch"]>[0]["operations"]) => {
      const result = controller.applyBatch({ baseRevision: controller.getSnapshot().document.revision,
        transactionLabel: "page edit", operations });
      expect(result).toMatchObject({ ok: true });
    };
    apply([{ op: "create", element: { id: "desktop-page", type: "page", name: "Desktop",
      x: 500, y: 0, width: 1440, height: 1024, order: 1, rotation: 0, background: "#ffffff", rounded: true, exportScale: 2, locked: false, groupIds: [] } }]);
    controller.setFocusedPage("desktop-page");
    expect(getPageElements(controller.getSnapshot().document)).toHaveLength(2);
    expect(controller.getSnapshot().document.focusedPageElementId).toBe("desktop-page");
    apply([{ op: "update", id: "desktop-page", patch: { order: 0 } }, { op: "update", id: "page-home", patch: { order: 1 } }]);
    expect(getPageElements(controller.getSnapshot().document)[0].id).toBe("desktop-page");
    controller.setFocusedPage("page-home");
    apply([{ op: "delete", id: "desktop-page" }]);
    expect(getPageElements(controller.getSnapshot().document)).toHaveLength(1);
    expect(controller.undo()).toBe(true);
    expect(getPageElements(controller.getSnapshot().document)).toHaveLength(2);
  });

  it("keeps asset metadata and image element in one undoable change", () => {
    const controller = new SceneController(createInitialDocument());
    const asset = {
      id: "asset_0123456789abcdef01234567",
      kind: "image" as const,
      fileName: "reference.png",
      relativePath:
        "assets/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.png",
      mimeType: "image/png",
      width: 1200,
      height: 800,
      size: 1024,
      sha256:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      createdAt: "2026-07-24T00:00:00.000Z",
      source: {
        provider: "Example CDN",
        providerAssetId: "reference-001",
        author: "EasyDraw QA",
        pageUrl: "https://example.com/assets/reference-001",
        license: "Test fixture",
        licenseUrl: "https://example.com/licenses/test-fixture",
      },
    };
    const result = controller.commitProjectChange("import asset", (draft) => {
      draft.assets.push(asset);
      draft.scene.elements.push(createElementFromInput({
        id: "reference-image",
        type: "image",
        containerId: "page-home",
        x: 24,
        y: 160,
        width: 342,
        height: 228,
        rotation: 0,
        assetId: asset.id,
        altText: asset.fileName,
        style: {
          fill: "transparent",
          stroke: "transparent",
          strokeWidth: 0,
          radius: 0,
          opacity: 1,
          fontSize: 16,
          textAlign: "left",
        },
        locked: false,
        groupIds: [],
      }));
    });

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(controller.getSnapshot().document.assets).toEqual([asset]);
    expect(controller.undo()).toBe(true);
    expect(controller.getSnapshot().document.assets).toEqual([]);
    expect(
      controller
        .getSnapshot()
        .document.scene.elements.some(
          (element) => element.id === "reference-image",
        ),
    ).toBe(false);
  });
});
