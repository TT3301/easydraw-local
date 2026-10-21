import { createElementFromInput } from "./element-commands";
import { describe, expect, it } from "vitest";
import {
  createDemoBatch,
  createInitialDocument,
  getFocusedPage,
  getPageMembers,
} from "./protocol";
import { SceneController } from "./scene-controller";

describe("SceneController", () => {
  it("commits an AI batch to one CanvasScene as one undo step", () => {
    const controller = new SceneController(createInitialDocument());
    const result = controller.applyBatch(createDemoBatch(0));

    expect(result.ok).toBe(true);
    expect(controller.getSnapshot().document.revision).toBe(1);
    expect(controller.getSnapshot().document.scene.elements).toHaveLength(14);
    expect(
      getPageMembers(controller.getSnapshot().document, "page-home"),
    ).toHaveLength(13);

    expect(controller.undo()).toBe(true);
    expect(controller.getSnapshot().document.revision).toBe(2);
    expect(controller.getSnapshot().document.scene.elements).toHaveLength(3);
  });

  it("rejects a stale AI batch", () => {
    const controller = new SceneController(createInitialDocument());
    expect(controller.applyBatch(createDemoBatch(0)).ok).toBe(true);

    const stale = controller.applyBatch(createDemoBatch(0));
    expect(stale).toMatchObject({
      ok: false,
      code: "REVISION_CONFLICT",
      revision: 1,
    });
  });

  it("commits a library asset and placed element as one undoable AI change", () => {
    const controller = new SceneController(createInitialDocument());
    const result = controller.commitAiProjectChange(
      "放置 Remix Icon 图标",
      0,
      (draft) => {
        draft.assets.push({
          id: "asset_remix_system_search",
          kind: "svg",
          fileName: "search-line.svg",
          relativePath: `assets/${"a".repeat(64)}.svg`,
          mimeType: "image/svg+xml",
          width: 24,
          height: 24,
          size: 320,
          sha256: "a".repeat(64),
          createdAt: "2026-07-29T00:00:00.000Z",
        });
        draft.scene.elements.push(createElementFromInput({
          id: "header-search-icon",
          type: "icon",
          containerId: "page-home",
          x: 320,
          y: 36,
          width: 20,
          height: 20,
          rotation: 0,
          assetId: "asset_remix_system_search",
          altText: "搜索",
          vectorData: {
            viewBox: [0, 0, 24, 24],
            content:
              '<path d="M4 11C4 7 7 4 11 4S18 7 18 11 15 18 11 18 4 15 4 11Z" fill="none" stroke="currentColor"></path>',
            paths: [{
              d: "M4 11C4 7 7 4 11 4S18 7 18 11 15 18 11 18 4 15 4 11Z", transform: [1, 0, 0, 1, 0, 0],
              fill: "none", stroke: "currentColor", strokeWidth: 1,
              lineCap: "butt", lineJoin: "miter", miterLimit: 4,
              fillRule: "nonzero", opacity: 1, fillOpacity: 1, strokeOpacity: 1,
            }],
          },
          style: {
            fill: "transparent",
            stroke: "#1e1e1e",
            strokeWidth: 0,
            radius: 0,
            opacity: 1,
            fontSize: 16,
            textAlign: "left",
          },
          locked: false,
          groupIds: ["group_header_search"],
        }));
      },
    );

    expect(result).toMatchObject({
      ok: true,
      revision: 1,
      transaction: {
        source: "ai",
        createdIds: ["header-search-icon"],
      },
    });
    expect(controller.getSnapshot().document.assets).toHaveLength(1);
    expect(
      controller.undoAiTransaction(
        result.ok ? result.transaction.id : undefined,
      ),
    ).toBe(true);
    expect(controller.getSnapshot().document.assets).toHaveLength(0);
    expect(
      controller
        .getSnapshot()
        .document.scene.elements.some(
          (element) => element.id === "header-search-icon",
        ),
    ).toBe(false);
  });

  it("commits a batch of library elements in one revision and one undo step", () => {
    const controller = new SceneController(createInitialDocument());
    const result = controller.commitAiProjectChange(
      "批量放置图片占位符",
      0,
      (draft) => {
        draft.assets.push({
          id: "asset_placeholder",
          kind: "svg",
          fileName: "image-placeholder-wireframe.svg",
          relativePath: `assets/${"b".repeat(64)}.svg`,
          mimeType: "image/svg+xml",
          width: 180,
          height: 184,
          size: 512,
          sha256: "b".repeat(64),
          createdAt: "2026-07-31T00:00:00.000Z",
        });
        for (const [id, x] of [
          ["batch-placeholder-a", 24],
          ["batch-placeholder-b", 160],
        ] as const) {
          draft.scene.elements.push(createElementFromInput({
            id,
            type: "image",
            containerId: "page-home",
            x,
            y: 120,
            width: 100,
            height: 80,
            rotation: 0,
            assetId: "asset_placeholder",
            altText: id,
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
            groupIds: [`group_${id}`],
          }));
        }
      },
    );

    expect(result).toMatchObject({
      ok: true,
      revision: 1,
      transaction: {
        createdIds: ["batch-placeholder-a", "batch-placeholder-b"],
      },
    });
    expect(controller.getSnapshot().document.assets).toHaveLength(1);
    expect(controller.getSnapshot().document.revision).toBe(1);

    expect(
      controller.undoAiTransaction(
        result.ok ? result.transaction.id : undefined,
      ),
    ).toBe(true);
    expect(controller.getSnapshot().document.assets).toHaveLength(0);
    expect(controller.getSnapshot().document.revision).toBe(2);
  });

  it("commits design chunk operations and assets in one undoable batch", () => {
    const controller = new SceneController(createInitialDocument());
    const asset = {
      id: "asset_design_chunk",
      kind: "svg" as const,
      fileName: "design-chunk.svg",
      relativePath: `assets/${"c".repeat(64)}.svg`,
      mimeType: "image/svg+xml",
      width: 64,
      height: 64,
      size: 256,
      sha256: "c".repeat(64),
      createdAt: "2026-07-31T00:00:00.000Z",
    };
    const result = controller.applyBatch(
      {
        scopeElementId: "page-home",
        baseRevision: 0,
        transactionLabel: "Build complete header region",
        operations: [
          {
            op: "create",
            element: {
              id: "chunk-header-card",
              type: "rectangle",
              containerId: "page-home",
              x: 24,
              y: 140,
              width: 342,
              height: 80,
              rotation: 0,
              style: {
                fill: "#ffffff",
                stroke: "#e5e7eb",
                strokeWidth: 1,
                radius: 12,
                opacity: 1,
                fontSize: 16,
                textAlign: "left",
              },
              locked: false,
              groupIds: ["group_chunk_header"],
            },
          },
          {
            op: "create",
            element: {
              id: "chunk-header-icon",
              type: "icon",
              containerId: "page-home",
              x: 40,
              y: 160,
              width: 24,
              height: 24,
              rotation: 0,
              assetId: asset.id,
              altText: "Header icon",
              vectorData: {
                viewBox: [0, 0, 24, 24],
                content:
                  '<path d="M3 12C3 7 7 3 12 3S21 7 21 12 17 21 12 21 3 17 3 12Z" fill="none" stroke="currentColor"></path>',
                paths: [{
                  d: "M3 12C3 7 7 3 12 3S21 7 21 12 17 21 12 21 3 17 3 12Z", transform: [1, 0, 0, 1, 0, 0],
                  fill: "none", stroke: "currentColor", strokeWidth: 1,
                  lineCap: "butt", lineJoin: "miter", miterLimit: 4,
                  fillRule: "nonzero", opacity: 1, fillOpacity: 1, strokeOpacity: 1,
                }],
              },
              style: {
                fill: "transparent",
                stroke: "#1e1e1e",
                strokeWidth: 0,
                radius: 0,
                opacity: 1,
                fontSize: 16,
                textAlign: "left",
              },
              locked: false,
              groupIds: ["group_chunk_header"],
            },
          },
        ],
      },
      "ai",
      [asset],
    );

    expect(result).toMatchObject({
      ok: true,
      revision: 1,
      transaction: {
        createdIds: ["chunk-header-card", "chunk-header-icon"],
      },
    });
    expect(controller.getSnapshot().document.assets).toEqual([asset]);
    expect(
      controller.undoAiTransaction(
        result.ok ? result.transaction.id : undefined,
      ),
    ).toBe(true);
    expect(controller.getSnapshot().document.assets).toHaveLength(0);
    expect(controller.getSnapshot().document.revision).toBe(2);
  });

  it("redo restores the whole AI transaction", () => {
    const controller = new SceneController(createInitialDocument());
    controller.applyBatch(createDemoBatch(0));
    controller.undo();

    expect(controller.redo()).toBe(true);
    expect(controller.getSnapshot().document.revision).toBe(3);
    expect(controller.getSnapshot().document.scene.elements).toHaveLength(14);
  });

  it("moves a page element and all of its members in one AI transaction", () => {
    const controller = new SceneController(createInitialDocument());
    const result = controller.applyBatch({
      scopeElementId: "page-home",
      baseRevision: 0,
      transactionLabel: "移动页面容器",
      operations: [
        {
          op: "update",
          id: "page-home",
          patch: { x: 100, y: 60 },
        },
      ],
    });

    expect(result.ok).toBe(true);
    const document = controller.getSnapshot().document;
    expect(getFocusedPage(document)).toMatchObject({ x: 100, y: 60 });
    expect(
      document.scene.elements.find((element) => element.id === "welcome-title"),
    ).toMatchObject({ x: 128, y: 96, frameId: "page-home" });
    expect(result.ok && result.transaction.updatedIds).toEqual(
      expect.arrayContaining([
        "page-home",
        "welcome-title",
        "welcome-note",
      ]),
    );
  });

  it("preserves a manual move when AI re-reads and applies a local update", () => {
    const controller = new SceneController(createInitialDocument());
    const movedElements = structuredClone(
      controller.getSnapshot().document.scene.elements,
    ).map((element) =>
      element.id === "page-home" ||
      (element.type !== "frame" && element.frameId === "page-home")
        ? { ...element, x: element.x + 40, y: element.y + 24 }
        : element,
    );

    expect(controller.commitManualElements(movedElements)).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(controller.applyBatch(createDemoBatch(0))).toMatchObject({
      ok: false,
      code: "REVISION_CONFLICT",
    });

    const result = controller.applyBatch({
      scopeElementId: "page-home",
      baseRevision: 1,
      transactionLabel: "局部修改标题",
      operations: [
        {
          op: "update",
          id: "welcome-title",
          patch: { text: "人工移动后继续修改" },
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(
      controller
        .getSnapshot()
        .document.scene.elements.find(
          (element) => element.id === "welcome-title",
        ),
    ).toMatchObject({
      x: 68,
      y: 60,
      text: "人工移动后继续修改",
      frameId: "page-home",
    });
  });

  it("rejects an invalid page container without changing the document", () => {
    const controller = new SceneController(createInitialDocument());
    const result = controller.applyBatch({
      baseRevision: 0,
      transactionLabel: "无效容器",
      operations: [
        {
          op: "create",
          element: {
            id: "orphan",
            type: "rectangle",
            containerId: "missing-page",
            x: 0,
            y: 0,
            width: 100,
            height: 60,
            rotation: 0,
            style: {
              fill: "#ffffff",
              stroke: "#111111",
              strokeWidth: 1,
              radius: 0,
              opacity: 1,
              fontSize: 16,
              textAlign: "left",
            },
            locked: false,
            groupIds: [],
          },
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_CONTAINER",
      revision: 0,
    });
    expect(controller.getSnapshot().document.revision).toBe(0);
    expect(controller.getSnapshot().document.scene.elements).toHaveLength(3);
  });
});
