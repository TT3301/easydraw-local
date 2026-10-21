import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("@easydraw/canvas-engine", () => ({ CaptureUpdateAction: { NEVER: "NEVER" }, exportToBlob: vi.fn(), exportToSvg: vi.fn() }));
vi.mock("./canvas-runtime", () => ({
  reconcileCanvasBindings: vi.fn(),
  measureCanvasText: vi.fn(async (input: { text: string }) => ({ width: input.text.length * 10, height: 20, text: input.text })),
  renderedBounds: (elements: Array<{ id: string; x: number; y: number; width: number; height: number }>) => elements.map(e => ({ id: e.id, x: e.x, y: e.y, width: e.width, height: e.height })),
}));
import { createEditorRequestHandler } from "./editor-requests";
import { createInitialDocument } from "../../core/protocol";
import { SceneController } from "../../core/scene-controller";
import type { EditorRequestPorts } from "./request-ports";
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0 L24 24" stroke="black"/></svg>').toString("base64");
function setup(withTask = true) {
  const document = createInitialDocument(); document.scene.elements = []; document.focusedPageElementId = null;
  const controller = new SceneController(document);
  const inserted = { asset: { id: "svg-asset", kind: "svg", fileName: "icon.svg", relativePath: "assets/icon.svg", mimeType: "image/svg+xml", width: 24, height: 24, size: 100, sha256: "0".repeat(64), createdAt: "" }, data: svg, copied: true };
  const desktop = { resolveIconDescriptions: vi.fn(async ({ descriptions }: { descriptions: string[] }) => descriptions.map(description => ({ description, id: "search-line", name: "search", assetRef: "builtin:icon:search-line" }))), listIconLibrary: vi.fn(async () => ({ icons: [{ id: "search-line", name: "search", group: "system", tags: ["find"], width: 24, height: 24 }], license: "Apache-2.0" })), readIconLibraryIcon: vi.fn(async () => ({ data: svg, mimeType: "image/svg+xml" })),
    readImagePlaceholder: vi.fn(async () => ({ data: svg, mimeType: "image/svg+xml" })), insertIconLibraryIcon: vi.fn(async () => inserted), insertImagePlaceholder: vi.fn(async () => inserted), importClipboardAsset: vi.fn(async () => inserted), readAsset: vi.fn(async () => ({ data: svg })) };
  const ports = { controller, desktop, getApi: () => null, flush: vi.fn(), getProjectPath: () => null, isReady: () => true, getSelection: () => [], setSelection: vi.fn(), notify: vi.fn(), preloadAssets: vi.fn(), setPhases: vi.fn() } as unknown as EditorRequestPorts;
  const handle = createEditorRequestHandler(ports);
  if (withTask) void handle("begin_task", { documentId: document.projectId, canvasId: document.activeCanvasId, taskId: "fixture-task", label: "Generic drawing", scope: { kind: "document" }, ttlMs: 600000 });
  handles.push(handle);
  const base = { documentId: document.projectId, canvasId: document.activeCanvasId!, taskId: "fixture-task", baseRevision: 0, requestId: "write-1", label: "Generic drawing" };
  return { controller, desktop, ports, handle, base };
}
const handles: Array<ReturnType<typeof createEditorRequestHandler>> = [];
afterEach(() => { handles.splice(0).forEach(h => h.dispose()); vi.useRealTimers(); });
const shape = { op: "create", element: { id: "free", type: "rectangle", x: -50, y: -50, width: 30, height: 30 } };
describe("required editing tasks", () => {
  it("rejects missing or inactive tasks before assets and lets a rejected request recover", async () => {
    const { handle, base, controller, desktop } = setup(false);
    const input = { ...base, taskId: undefined, operations: [{ ...shape, iconDescription: "search icon" }] };
    await expect(handle("apply_operations", input)).rejects.toMatchObject({ code: "TASK_REQUIRED" });
    await expect(handle("apply_operations", { ...input, taskId: "missing" })).rejects.toMatchObject({ code: "TASK_NOT_ACTIVE" });
    expect(desktop.resolveIconDescriptions).not.toHaveBeenCalled();
    expect(controller.getSnapshot().document.revision).toBe(0);
    await handle("apply_operations", { ...input, requestId: "preview", dryRun: true });
    expect((await handle("get_status", {}) as any).tasks).toEqual([]);
    await handle("begin_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, label: "Edit", scope: { kind: "document" } });
    const result = await handle("apply_operations", { ...input, taskId: base.taskId });
    await handle("finish_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, status: "completed" });
    expect(await handle("apply_operations", { ...input, taskId: base.taskId })).toEqual(result);
    await expect(handle("apply_operations", { ...base, baseRevision: 1, requestId: "after-end", operations: [shape] })).rejects.toMatchObject({ code: "TASK_NOT_ACTIVE" });
    expect(desktop.insertIconLibraryIcon).toHaveBeenCalledTimes(1);
  });

  it("checks real targets, reorder and both reparent memberships before persisting icons", async () => {
    const { handle, base, controller, desktop } = setup();
    await handle("apply_operations", { ...base, operations: [
      { op: "create", element: { id: "a", type: "frame", x: 0, y: 0, width: 100, height: 100 } },
      { op: "create", element: { id: "b", type: "frame", x: 200, y: 0, width: 100, height: 100 } },
      { ...shape, element: { ...shape.element, x: 10, y: 10, frameId: "a" } },
      { ...shape, element: { ...shape.element, id: "other", x: 210, y: 10, frameId: "b" } },
    ] });
    await handle("finish_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, status: "completed" });
    await handle("begin_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: "page-a", label: "Edit A", scope: { kind: "container", id: "a" } });
    for (const operations of [
      [{ op: "update", id: "other", patch: {}, iconDescription: "search icon" }],
      [{ op: "reorder", ids: ["other"], position: "front" }],
      [{ op: "reparent", ids: ["free"], frameId: "b" }],
      [{ op: "delete", ids: ["b"], children: "delete" }],
    ]) await expect(handle("apply_operations", { ...base, taskId: "page-a", baseRevision: 1, requestId: "outside", operations })).rejects.toMatchObject({ code: "TASK_SCOPE_MISMATCH" });
    expect(desktop.resolveIconDescriptions).not.toHaveBeenCalled();
    expect(controller.getSnapshot().document.revision).toBe(1);
    await handle("begin_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: "member", label: "Edit member", scope: { kind: "elements", ids: ["free"] } });
    await expect(handle("apply_operations", { ...base, taskId: "member", baseRevision: 1, requestId: "member-reparent", operations: [{ op: "reparent", ids: ["free"], frameId: "b" }] })).rejects.toMatchObject({ code: "TASK_SCOPE_MISMATCH" });
    await handle("begin_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: "both", label: "Move between pages", scope: { kind: "elements", ids: ["a", "b"] } });
    await handle("apply_operations", { ...base, taskId: "both", baseRevision: 1, requestId: "reparent", operations: [{ op: "reparent", ids: ["free"], frameId: "b" }] });
    expect(controller.getSnapshot().document.scene.elements.find(e => e.id === "free")?.frameId).toBe("b");
  });

  it("starts a bounds task before page creation and follows automatic growth and movement", async () => {
    const { handle, base, ports, controller } = setup(false);
    await handle("begin_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, label: "New page", scope: { kind: "bounds", bounds: { x: 0, y: 0, width: 390, height: 100 } } });
    expect(ports.setPhases).toHaveBeenLastCalledWith({});
    await handle("apply_operations", { ...base, operations: [
      { op: "create", element: { id: "page", type: "frame", x: 0, y: 0, width: 390, height: 100 } },
      { op: "create", element: { id: "content", type: "rectangle", frameId: "page", x: 20, y: 400, width: 100, height: 40 } },
    ] });
    expect(ports.setPhases).toHaveBeenLastCalledWith({ page: "active" });
    await handle("apply_operations", { ...base, baseRevision: 1, requestId: "move", operations: [{ op: "move", ids: ["page"], dx: 1000, dy: 0 }] });
    expect(ports.setPhases).toHaveBeenLastCalledWith({ page: "active" });
    await handle("apply_operations", { ...base, baseRevision: 2, requestId: "edit-moved", operations: [{ op: "update", id: "content", patch: { backgroundColor: "#abcdef" } }] });
    expect(controller.getSnapshot().document.scene.elements.find(e => e.id === "page")?.height).toBe(440);
    await handle("finish_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, status: "completed" });
    expect(ports.setPhases).toHaveBeenLastCalledWith({});
    expect(controller.getSnapshot().document.revision).toBe(3);
  });

  it("renews successful batches and identical begin calls but not replayed writes or previews", async () => {
    vi.useFakeTimers();
    const { handle, base, ports } = setup(false);
    const task = { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, label: "Edit", scope: { kind: "document" }, ttlMs: 1000 };
    await handle("begin_task", task);
    await vi.advanceTimersByTimeAsync(800);
    const input = { ...base, operations: [shape] };
    await handle("apply_operations", input);
    await vi.advanceTimersByTimeAsync(800);
    expect((await handle("get_status", {}) as any).tasks).toHaveLength(1);
    await handle("apply_operations", input);
    await handle("apply_operations", { ...base, requestId: "preview", baseRevision: 1, dryRun: true, operations: [{ op: "update", id: "free", patch: { x: 10 } }] });
    await vi.advanceTimersByTimeAsync(200);
    expect((await handle("get_status", {}) as any).tasks).toEqual([]);
    await handle("begin_task", task);
    await vi.advanceTimersByTimeAsync(800);
    await handle("begin_task", task);
    await vi.advanceTimersByTimeAsync(800);
    expect((await handle("get_status", {}) as any).tasks).toHaveLength(1);
    expect(ports.notify).toHaveBeenCalledTimes(2);
    await expect(handle("begin_task", { ...task, label: "Different" })).rejects.toMatchObject({ code: "TASK_ID_REUSED" });
  });

  it.each(["completed", "expired", "restarted"])("rejects an asynchronous edit whose task is %s", async action => {
    vi.useFakeTimers();
    const { handle, base, controller, desktop } = setup(false);
    const task = { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, label: "Edit", scope: { kind: "document" }, ttlMs: 1000 };
    await handle("begin_task", task);
    let release!: (value: any) => void;
    desktop.resolveIconDescriptions.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = handle("apply_operations", { ...base, operations: [{ ...shape, iconDescription: "search icon" }] });
    const rejected = expect(pending).rejects.toMatchObject({ code: "TASK_NOT_ACTIVE" });
    await Promise.resolve(); await Promise.resolve();
    if (action === "expired") await vi.advanceTimersByTimeAsync(1000);
    else {
      await handle("finish_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, status: "completed" });
      if (action === "restarted") await handle("begin_task", task);
    }
    release([{ description: "search icon", assetRef: "builtin:icon:search-line" }]);
    await rejected;
    expect(desktop.insertIconLibraryIcon).not.toHaveBeenCalled();
    expect(controller.getSnapshot().document.revision).toBe(0);
  });

  it("keeps a page active until the last task ends and immediately cleans manually deleted targets", async () => {
    const { handle, base, ports, controller } = setup();
    await handle("apply_operations", { ...base, operations: [{ op: "create", element: { id: "page", type: "frame", x: 0, y: 0, width: 100, height: 100 } }] });
    await handle("finish_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, status: "completed" });
    for (const taskId of ["one", "two"]) await handle("begin_task", { documentId: base.documentId, canvasId: base.canvasId, taskId, label: "Edit", scope: { kind: "container", id: "page" } });
    await handle("finish_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: "one", status: "failed" });
    expect(ports.setPhases).toHaveBeenLastCalledWith({ page: "active" });
    expect(controller.commitProjectChange("Human deletion", doc => { doc.scene.elements = []; doc.focusedPageElementId = null; }).ok).toBe(true);
    expect(ports.setPhases).toHaveBeenLastCalledWith({});
    expect((await handle("get_status", {}) as any).tasks).toEqual([]);
  });
});
describe("general MCP request handler", () => {
  it("grows a page in the same AI transaction, previews without writing and undoes/redoes height with content", async () => {
    const { handle, base, controller } = setup();
    await handle("apply_operations", { ...base, operations: [
      { op: "create", element: { id: "page", type: "frame", x: 500, y: 200, width: 390, height: 844 } },
    ] });
    const input = { ...base, baseRevision: 1, requestId: "overflow", coordinateSpace: { kind: "container", id: "page" }, operations: [
      { op: "create", element: { id: "card", type: "rectangle", frameId: "page", x: 24, y: 900, width: 342, height: 120 } },
      { op: "create", element: { id: "label", type: "text", frameId: "page", x: 40, y: 920, width: 200, height: 30, text: "More content" } },
      { op: "group", ids: ["card", "label"], groupId: "block" },
    ] };
    const dry = await handle("apply_operations", { ...input, requestId: "preview-height", dryRun: true }) as any;
    expect(dry).toMatchObject({ revision: 1, frameHeightChanges: [{ frameId: "page", previousHeight: 844, height: 1020 }], affected: { updatedIds: ["page"] } });
    expect(controller.getSnapshot().document.scene.elements[0].height).toBe(844);
    const result = await handle("apply_operations", input) as any;
    expect(result.revision).toBe(2);
    expect(result.frameHeightChanges).toEqual(dry.frameHeightChanges);
    expect(controller.getSnapshot().document.scene.elements.find(e => e.id === "page")).toMatchObject({ x: 500, y: 200, width: 390, height: 1020 });
    expect(controller.getSnapshot().document.scene.elements.find(e => e.id === "card")).toMatchObject({ x: 524, y: 1100, width: 342, height: 120, frameId: "page" });
    expect(controller.getHistory().undo).toHaveLength(2);
    expect(await handle("apply_operations", input)).toEqual(result);
    await handle("history", { documentId: base.documentId, canvasId: base.canvasId, action: "undo", baseRevision: 2, transactionId: result.transaction.id });
    expect(controller.getSnapshot().document.scene.elements).toHaveLength(1);
    expect(controller.getSnapshot().document.scene.elements[0].height).toBe(844);
    await handle("history", { documentId: base.documentId, canvasId: base.canvasId, action: "redo", baseRevision: 3, transactionId: result.transaction.id });
    expect(controller.getSnapshot().document.scene.elements.find(e => e.id === "page")?.height).toBe(1020);
    const deleted = await handle("apply_operations", { ...base, baseRevision: 4, requestId: "remove-block", operations: [{ op: "delete", ids: ["card", "label"], children: "delete" }] }) as any;
    expect(deleted.frameHeightChanges).toEqual([]);
    expect(controller.getSnapshot().document.scene.elements[0].height).toBe(1020);
  });

  it("grows same-batch frames and existing members moved below the bottom, but rejects invalid batches atomically", async () => {
    const { handle, base, controller } = setup();
    const input = { ...base, operations: [
      { op: "create", element: { id: "page", type: "frame", x: 0, y: 0, width: 390, height: 100 } },
      { op: "create", element: { id: "card", type: "rectangle", frameId: "page", x: 24, y: 90, width: 342, height: 50 } },
    ] };
    await expect(handle("apply_operations", { ...input, operations: [...input.operations, { op: "move", ids: ["missing"], dx: 0, dy: 10 }] })).rejects.toThrow();
    expect(controller.getSnapshot().document.revision).toBe(0);
    const created = await handle("apply_operations", input) as any;
    expect(created.frameHeightChanges).toEqual([{ frameId: "page", previousHeight: 100, height: 140 }]);
    expect(created.affected).toMatchObject({ createdIds: expect.arrayContaining(["page", "card"]), updatedIds: [] });
    const moved = await handle("apply_operations", { ...base, baseRevision: 1, requestId: "move-down", operations: [{ op: "move", ids: ["card"], dx: 0, dy: 200 }] }) as any;
    expect(moved.frameHeightChanges).toEqual([{ frameId: "page", previousHeight: 140, height: 340 }]);
    expect(moved.affected.updatedIds).toEqual(expect.arrayContaining(["page", "card"]));
  });

  it("advertises a flat canvas list and rejects folder operations without mutating the project", async () => {
    const { handle, base, controller } = setup();
    expect(await handle("get_capabilities", {})).toMatchObject({ features: { multiCanvas: true, projectFolders: false } });
    const revision = controller.getSnapshot().document.revision;
    for (const operation of [
      { op: "create", type: "folder", parentId: null },
      { op: "create", type: "canvas", parentId: "folder-id" },
      { op: "move", id: base.canvasId, parentId: "folder-id" },
    ]) {
      await expect(handle("manage_project_tree", { documentId: base.documentId, baseRevision: revision, requestId: "invalid-folder", operation })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(controller.getSnapshot().document.revision).toBe(revision);
    expect(controller.getSnapshot().document.tree).toHaveLength(1);
  });
  it("requires an explicit current canvas and lets the agent manage and switch the project tree", async () => {
    const { handle, base, controller } = setup();
    await expect(handle("query_elements", { documentId: base.documentId, scope: { kind: "document" } })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const created = await handle("manage_project_tree", { documentId: base.documentId, baseRevision: 0, requestId: "new-board", operation: { op: "create", type: "canvas", name: "B", parentId: null } }) as any;
    const tree = await handle("get_project_tree", { documentId: base.documentId }) as any;
    expect(tree.nodes).toHaveLength(2);
    await handle("switch_canvas", { documentId: base.documentId, canvasId: created.nodeId });
    await expect(handle("apply_operations", { ...base, baseRevision: 1, operations: [shape] })).rejects.toMatchObject({ code: "CANVAS_MISMATCH" });
    expect(controller.getSnapshot().document.revision).toBe(1);
    await handle("begin_task", { documentId: base.documentId, canvasId: created.nodeId, taskId: base.taskId, label: "New canvas edit", scope: { kind: "document" } });
    await handle("apply_operations", { ...base, canvasId: created.nodeId, baseRevision: 1, operations: [shape] });
    expect(controller.getSnapshot().document.canvases[base.canvasId].scene.elements).toEqual([]);
  });
  it("rejects an asynchronous result after switching away and back even if revision stayed the same", async () => {
    const { handle, base, controller, desktop } = setup();
    const next = controller.manageTree({ op: "create", type: "canvas", parentId: null })!;
    let resolve!: (value: any) => void;
    const waiting = new Promise<any>(done => { resolve = done; });
    desktop.resolveIconDescriptions.mockImplementationOnce(() => waiting);
    const request = handle("apply_operations", { ...base, baseRevision: 1, operations: [{ op: "create", iconDescription: "Search", element: { type: "rectangle", x: 0, y: 0, width: 24, height: 24 } }] });
    const rejected = expect(request).rejects.toMatchObject({ code: "CANVAS_SESSION_EXPIRED" });
    await Promise.resolve(); await Promise.resolve();
    controller.switchCanvas(next); controller.switchCanvas(base.canvasId);
    resolve([{ description: "Search", id: "search-line", assetRef: "builtin:icon:search-line" }]);
    await rejected;
    expect(controller.getSnapshot().document.scene.elements).toEqual([]);
  });

  it("executes the Skill image composition example atomically with a centered fixed logo and separate colors", async () => {
    const { handle, base, controller, desktop } = setup();
    const protocol = readFileSync(new URL("../../../skills/easydraw-product-sketch/references/protocol.md", import.meta.url), "utf8");
    const example = JSON.parse(protocol.split("## Build an image region")[1].match(/```json\n([\s\S]*?)\n```/)![1]);
    const logo = readFileSync(new URL("../../../placeholder-library/image-placeholder-logo.svg", import.meta.url)).toString("base64");
    desktop.insertImagePlaceholder.mockResolvedValueOnce({ asset: { id: "logo-asset", kind: "svg", fileName: "image-placeholder-logo.svg", relativePath: "assets/logo.svg", mimeType: "image/svg+xml", width: 24, height: 24, size: 250, sha256: "0".repeat(64), createdAt: "" }, data: logo, copied: true });
    await handle("apply_operations", { ...base, operations: [{ op: "create", element: { id: "frame", type: "frame", x: 100, y: 50, width: 400, height: 500 } }] });
    example.taskId = base.taskId; example.documentId = base.documentId; example.canvasId = base.canvasId; example.baseRevision = 1; example.coordinateSpace.id = "frame";
    for (const op of example.operations) if (op.element) op.element.frameId = "frame";
    const result = await handle("apply_operations", example) as any;
    const elements = controller.getSnapshot().document.scene.elements;
    const background = elements.find(e => e.id === result.idMap["image-background"])!;
    const glyph = elements.find(e => e.id === result.idMap["image-logo"])!;
    expect(background.backgroundColor).toBe("#e3e3e3");
    expect(background.vectorData).toBeUndefined();
    expect(glyph.strokeColor).toBe("#686868");
    expect(glyph.backgroundColor).toBe("transparent");
    expect(glyph.width).toBe(32); expect(glyph.height).toBe(32);
    expect(glyph.x + 16).toBe(background.x + background.width / 2);
    expect(glyph.y + 16).toBe(background.y + background.height / 2);
    expect(glyph.groupIds).toEqual(background.groupIds);
    expect(glyph.vectorData?.paths).toHaveLength(2);
    expect(desktop.insertImagePlaceholder).toHaveBeenCalledExactlyOnceWith({ projectPath: null, variant: "logo" });
    expect(desktop.resolveIconDescriptions).not.toHaveBeenCalled();
    expect(await handle("apply_operations", example)).toEqual(result);
  });
  it("advertises the logo, avoids metadata reads and keeps explicit legacy references compatible", async () => {
    const { handle, base, desktop } = setup();
    const search = await handle("search_assets", { documentId: base.documentId, canvasId: base.canvasId, sources: ["builtin"], category: "placeholder" }) as any;
    expect(search.items.map((item: any) => item.assetRef)).toEqual(["builtin:placeholder:image-logo"]);
    await handle("get_assets", { documentId: base.documentId, canvasId: base.canvasId, assetRefs: ["builtin:placeholder:image-logo"] });
    expect(desktop.readImagePlaceholder).not.toHaveBeenCalled();
    await handle("apply_operations", { ...base, dryRun: true, operations: [{ ...shape, assetRef: "builtin:placeholder:image-logo" }] });
    expect(desktop.readImagePlaceholder).toHaveBeenCalledWith({ variant: "logo" });
    expect(desktop.insertImagePlaceholder).not.toHaveBeenCalled();
    await handle("apply_operations", { ...base, requestId: "legacy", operations: [{ ...shape, assetRef: "builtin:placeholder:image-wireframe" }] });
    expect(desktop.insertImagePlaceholder).toHaveBeenCalledWith({ projectPath: null, variant: "wireframe" });
  });
  it("selects deduplicated descriptions once and writes icons with color in the same retryable transaction", async () => {
    const { handle, base, controller, desktop } = setup();
    const input = { ...base, operations: ["first", "second"].map((id, n) => ({ op: "create", iconDescription: " search magnifying glass icon ", element: { id, type: "rectangle", x: n * 30, y: 0, width: 24, height: 24, strokeColor: "#abcdef" } })) };
    const result = await handle("apply_operations", input) as any;
    expect(result.iconSelections[0].assetRef).toBe("builtin:icon:search-line");
    expect(await handle("apply_operations", input)).toEqual(result);
    expect(desktop.resolveIconDescriptions).toHaveBeenCalledExactlyOnceWith({ descriptions: ["search magnifying glass icon"] });
    expect(desktop.insertIconLibraryIcon).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().document.scene.elements.every(e => e.strokeColor === "#abcdef" && e.vectorData?.paths.length === 1)).toBe(true);
    await handle("apply_operations", { ...base, baseRevision: 1, requestId: "replace", operations: [{ op: "update", id: "first", iconDescription: "bell notification icon", patch: { strokeColor: "#123456" } }] });
    expect(controller.getSnapshot().document.scene.elements[0].strokeColor).toBe("#123456");
  });
  it("rejects incompatible descriptions before selection and preserves dryRun semantics", async () => {
    const { handle, base, controller, desktop } = setup();
    for (const operation of [{ ...shape, iconDescription: " " }, { ...shape, iconDescription: "search", assetRef: "builtin:icon:search-line" }, { ...shape, iconDescription: "search", element: { ...shape.element, type: "ellipse" } }])
      await expect(handle("apply_operations", { ...base, operations: [operation] })).rejects.toBeDefined();
    expect(desktop.resolveIconDescriptions).not.toHaveBeenCalled();
    await handle("apply_operations", { ...base, dryRun: true, operations: [{ ...shape, iconDescription: "search icon" }] });
    expect(desktop.insertIconLibraryIcon).not.toHaveBeenCalled();
    expect(controller.getSnapshot().document.revision).toBe(0);
  });
  it("checks revision again after asynchronous icon selection before asset persistence", async () => {
    const { handle, base, controller, desktop } = setup();
    desktop.resolveIconDescriptions.mockImplementationOnce(async ({ descriptions }) => {
      controller.commitAiProjectChange("Human change", 0, draft => { draft.scene.elements = []; });
      return descriptions.map(description => ({ description, id: "search-line", name: "search", assetRef: "builtin:icon:search-line" }));
    });
    await expect(handle("apply_operations", { ...base, operations: [{ ...shape, iconDescription: "search icon" }] })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(desktop.insertIconLibraryIcon).not.toHaveBeenCalled();
  });
  it("atomically commits a free shape, icon and group, with exact retry replay", async () => {
    const { handle, base, controller, desktop } = setup();
    const search = await handle("search_assets", { documentId: base.documentId, canvasId: base.canvasId, sources: ["builtin"], category: "icon", query: "search" }) as any;
    const input = { ...base, operations: [shape, { op: "create", assetRef: search.items[0].assetRef, element: { id: "icon", type: "rectangle", x: -30, y: 0, width: 24, height: 24 } }, { op: "group", ids: ["free", "icon"], groupId: "diagram" }] };
    const result = await handle("apply_operations", input);
    expect(await handle("apply_operations", input)).toEqual(result);
    expect(controller.getSnapshot().document.revision).toBe(1);
    expect(controller.getSnapshot().document.assets).toHaveLength(1);
    expect(controller.getSnapshot().document.scene.elements.find(e => e.id === "icon")?.vectorData?.paths).toHaveLength(1);
    expect(desktop.insertIconLibraryIcon).toHaveBeenCalledTimes(1);
    await expect(handle("apply_operations", { ...input, label: "Changed" })).rejects.toMatchObject({ code: "REQUEST_ID_REUSED" });
  });
  it("dryRun validates vectors without persisting, preloading or changing history", async () => {
    const { handle, base, controller, desktop, ports } = setup();
    await handle("apply_operations", { ...base, dryRun: true, operations: [{ ...shape, assetRef: "builtin:icon:search-line" }] });
    expect(controller.getSnapshot().document.revision).toBe(0);
    expect(controller.getSnapshot().document.assets).toEqual([]);
    expect(controller.getSnapshot().canUndo).toBe(false);
    expect(desktop.insertIconLibraryIcon).not.toHaveBeenCalled();
    expect(ports.preloadAssets).not.toHaveBeenCalled();
  });
  it("does not commit earlier operations when the batch is invalid", async () => {
    const { handle, base, controller } = setup();
    await expect(handle("apply_operations", { ...base, operations: [shape, { op: "move", ids: ["missing"], dx: 10, dy: 0 }] })).rejects.toMatchObject({ code: "ELEMENT_NOT_FOUND", details: { operationIndex: 1 } });
    expect(controller.getSnapshot().document.scene.elements).toEqual([]);
    expect(controller.getSnapshot().document.revision).toBe(0);
  });
  it("rejects stale reads and writes after human edits and reports changes", async () => {
    const { handle, base, controller } = setup();
    await handle("apply_operations", { ...base, operations: [shape] });
    controller.commitProjectChange("Human edit", d => { d.scene.elements[0] = { ...d.scene.elements[0], x: 500 }; });
    await expect(handle("query_elements", { documentId: base.documentId, canvasId: base.canvasId, scope: { kind: "document" }, revision: 1 })).rejects.toMatchObject({ code: "SNAPSHOT_EXPIRED" });
    await expect(handle("apply_operations", { ...base, requestId: "new", operations: [shape] })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const delta = await handle("get_changes", { documentId: base.documentId, canvasId: base.canvasId, sinceRevision: 1 }) as any;
    expect(delta.changes[0].updatedIds).toContain("free");
  });
  it("tasks on arbitrary bounds expire without editing content or creating frames", async () => {
    vi.useFakeTimers();
    const { handle, base, controller } = setup(false);
    await handle("begin_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: "task", label: "Diagram", scope: { kind: "bounds", bounds: { x: 0, y: 0, width: 100, height: 100 } }, ttlMs: 1000 });
    expect(controller.getSnapshot().document.revision).toBe(0);
    expect((await handle("get_status", {}) as any).tasks).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await handle("get_status", {}) as any).tasks).toHaveLength(0);
    expect(controller.getSnapshot().document.scene.elements).toEqual([]);
  });
  it("history protects human edits and undo/redo uses monotonic revisions", async () => {
    const { handle, base, controller } = setup();
    const write = await handle("apply_operations", { ...base, operations: [shape] }) as any;
    await handle("history", { documentId: base.documentId, canvasId: base.canvasId, action: "undo", baseRevision: 1, transactionId: write.transaction.id });
    expect(controller.getSnapshot().document.revision).toBe(2);
    expect(controller.getSnapshot().document.scene.elements).toEqual([]);
    await handle("history", { documentId: base.documentId, canvasId: base.canvasId, action: "redo", baseRevision: 2, transactionId: write.transaction.id });
    expect(controller.getSnapshot().document.revision).toBe(3);
    controller.commitProjectChange("Human edit", d => { d.scene.elements[0] = { ...d.scene.elements[0], x: 22 }; });
    await expect(handle("history", { documentId: base.documentId, canvasId: base.canvasId, action: "undo", baseRevision: 4, transactionId: write.transaction.id })).rejects.toMatchObject({ code: "HISTORY_CONFLICT" });
  });
  it("supports explicit detach deletion through controller reconciliation", async () => {
    const { handle, base, controller } = setup();
    await handle("apply_operations", { ...base, operations: [{ op: "create", element: { id: "frame", type: "frame", x: 0, y: 0, width: 100, height: 100 } }, { ...shape, element: { ...shape.element, frameId: "frame" } }] });
    await handle("apply_operations", { ...base, baseRevision: 1, requestId: "delete", operations: [{ op: "delete", ids: ["frame"], children: "detach" }] });
    expect(controller.getSnapshot().document.scene.elements).toHaveLength(1);
    expect(controller.getSnapshot().document.scene.elements[0].frameId).toBeNull();
  });
  it("imports assets as handles, then commits references in one document transaction", async () => {
    const { handle, base, controller } = setup();
    const imported = await handle("import_assets", { documentId: base.documentId, canvasId: base.canvasId, requestId: "import", assets: [{ data: svg, mimeType: "image/svg+xml", fileName: "custom.svg" }] }) as any;
    expect(controller.getSnapshot().document.assets).toEqual([]);
    await handle("apply_operations", { ...base, operations: [{ ...shape, assetRef: imported.items[0].assetRef }] });
    expect(controller.getSnapshot().document.assets).toHaveLength(1);
    const content = await handle("get_assets", { documentId: base.documentId, canvasId: base.canvasId, assetRefs: [imported.items[0].assetRef], content: true }) as any;
    expect(content.items[0].relativePath).toBeUndefined();
    expect(content.items[0].data).toBe(svg);
  });
  it("checks revision again after asynchronous asset preparation", async () => {
    const { handle, base, controller, desktop, ports } = setup();
    let release!: (value: unknown) => void;
    desktop.insertIconLibraryIcon.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }) as any);
    const pending = handle("apply_operations", { ...base, operations: [{ ...shape, assetRef: "builtin:icon:search-line" }] });
    for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
    expect(release).toBeTypeOf("function");
    controller.commitProjectChange("Human rename", draft => { draft.name = "User change"; });
    release({ asset: { id: "svg-asset", kind: "svg", fileName: "icon.svg", relativePath: "assets/icon.svg", mimeType: "image/svg+xml", width: 24, height: 24, size: 100, sha256: "0".repeat(64), createdAt: "" }, data: svg, copied: true });
    await expect(pending).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(controller.getSnapshot().document.name).toBe("User change");
    expect(controller.getSnapshot().document.assets).toEqual([]);
    expect(ports.preloadAssets).not.toHaveBeenCalled();
  });
  it("shares concurrent retries and rejects a switched document identity", async () => {
    const { handle, base, controller, desktop } = setup();
    const input = { ...base, operations: [{ ...shape, assetRef: "builtin:icon:search-line" }] };
    const [first, second] = await Promise.all([handle("apply_operations", input), handle("apply_operations", input)]);
    expect(first).toEqual(second);
    expect(desktop.insertIconLibraryIcon).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().document.revision).toBe(1);
    await expect(handle("query_elements", { documentId: "different", canvasId: base.canvasId, scope: { kind: "document" } })).rejects.toMatchObject({ code: "DOCUMENT_MISMATCH" });
  });
  it("does not preload assets or commit metadata when a subsequent command fails", async () => {
    const { handle, base, controller, ports } = setup();
    await expect(handle("apply_operations", { ...base, operations: [{ ...shape, assetRef: "builtin:icon:search-line" }, { op: "move", ids: ["missing"], dx: 0, dy: 0 }] })).rejects.toMatchObject({ code: "ELEMENT_NOT_FOUND" });
    expect(controller.getSnapshot().document.scene.elements).toEqual([]);
    expect(controller.getSnapshot().document.assets).toEqual([]);
    expect(ports.preloadAssets).not.toHaveBeenCalled();
  });
  it("cleans a task safely when its target was removed manually", async () => {
    vi.useFakeTimers();
    const { handle, base, controller } = setup();
    await handle("apply_operations", { ...base, operations: [shape] });
    await handle("finish_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, status: "completed" });
    await handle("begin_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: "target-task", label: "Edit", scope: { kind: "elements", ids: ["free"] }, ttlMs: 1000 });
    controller.commitProjectChange("Delete", draft => { draft.scene.elements = []; });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await handle("get_status", {}) as any).tasks).toHaveLength(0);
  });

  it("keeps capability discovery compact and exposes schemas on request", async () => {
    const { handle } = setup();
    const summary = await handle("get_capabilities", {}) as any;
    expect(summary.elementSchema).toBeUndefined();
    const detailed = await handle("get_capabilities", { includeSchemas: true }) as any;
    expect(detailed.elementSchema.properties.type.enum).toContain("diamond");
    expect(detailed.operationSchema.anyOf ?? detailed.operationSchema.oneOf).toBeDefined();
    expect(detailed.elementSchema.properties.points.items).toMatchObject({
      type: "array", items: { type: "number" }, minItems: 2, maxItems: 2,
    });
    const rotate = (detailed.operationSchema.anyOf ?? detailed.operationSchema.oneOf)
      .find((schema: any) => schema.properties.op.const === "rotate");
    expect(rotate.properties.origin).toMatchObject({
      type: "array", items: { type: "number" }, minItems: 2, maxItems: 2,
    });
  });
  it("can display SVG as an image without forcing monochrome vector rendering", async () => {
    const { handle, base, controller } = setup();
    await handle("apply_operations", { ...base, operations: [{ ...shape, assetRef: "builtin:icon:search-line", element: { ...shape.element, type: "image" } }] });
    expect(controller.getSnapshot().document.scene.elements[0]).toMatchObject({ type: "image", fileId: "svg-asset" });
    expect(controller.getSnapshot().document.scene.elements[0].vectorData).toBeUndefined();
  });

});
