import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@easydraw/canvas-engine", () => ({ CaptureUpdateAction: { NEVER: "NEVER" } }));
vi.mock("./canvas-runtime", () => ({ reconcileCanvasBindings: vi.fn(), layoutCanvasText: vi.fn(async () => {}),
  renderedBounds: (elements: Array<{ id: string; x: number; y: number; width: number; height: number }>) => elements.map(e => ({ id: e.id, x: e.x, y: e.y, width: e.width, height: e.height })),
}));
vi.mock("./canvas-output", () => ({ renderCanvasScope: vi.fn(async () => ({ mimeType: "image/png" })) }));
import { createInitialDocument } from "../../core/protocol";
import { SceneController } from "../../core/scene-controller";
import { CanvasSession } from "../../canvas/canvas-session";
import { createEditorRequestHandler } from "./editor-requests";
import { AiElementRevealQueue } from "./element-reveal-queue";
import type { EditorRequestPorts } from "./request-ports";

const cleanups: Array<() => void> = [];
function setup(withTask = true) {
  vi.useFakeTimers();
  const document = createInitialDocument(); document.scene.elements = []; document.focusedPageElementId = null;
  const controller = new SceneController(document);
  const queue = new AiElementRevealQueue(controller);
  const publish = vi.fn(); cleanups.push(queue.connect(publish));
  const canvas = new CanvasSession(controller, vi.fn(), queue.finish);
  // Simulate synchronous engine onChange echoes with the entire committed scene.
  cleanups.push(canvas.connect(elements => { canvas.observe(elements, {}); }));
  const ports = { controller, elementReveal: queue, desktop: {}, getApi: () => null,
    isReady: () => true, getProjectPath: () => null, setPhases: vi.fn(), preloadAssets: vi.fn(), notify: vi.fn(),
  } as unknown as EditorRequestPorts;
  const handle = createEditorRequestHandler(ports);
  if (withTask) void handle("begin_task", { documentId: document.projectId, canvasId: document.activeCanvasId, taskId: "fixture-task", label: "Drawing", scope: { kind: "document" }, ttlMs: 600000 }); cleanups.push(handle.dispose);
  const base = { documentId: document.projectId, canvasId: document.activeCanvasId!, taskId: "fixture-task", baseRevision: 0, requestId: "batch", label: "Drawing" };
  return { handle, base, controller, queue, publish, canvas, ports };
}
afterEach(() => { cleanups.splice(0).reverse().forEach(stop => stop()); vi.useRealTimers(); });
const shape = (id: string) => ({ op: "create", element: { id, type: "rectangle", x: 0, y: 0, width: 100, height: 40 } });

describe("MCP display queue integration", () => {
  it("keeps the mask until completed task elements appear, while capture preserves an active task", async () => {
    const { handle, base, ports, controller } = setup();
    const input = { ...base, operations: [
      { op: "create", element: { id: "page", type: "frame", x: 0, y: 0, width: 390, height: 100 } },
      { op: "create", element: { id: "card", type: "rectangle", frameId: "page", x: 20, y: 20, width: 50, height: 40 } },
    ] };
    await handle("apply_operations", input);
    const finished = await handle("finish_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, status: "completed" }) as any;
    expect(finished.presentationPending).toBe(true);
    expect(ports.setPhases).toHaveBeenLastCalledWith({ page: "active" });
    await expect(handle("apply_operations", { ...input, baseRevision: 1, requestId: "too-late" })).rejects.toMatchObject({ code: "TASK_FINISHING" });
    vi.advanceTimersByTime(400);
    expect(ports.setPhases).toHaveBeenLastCalledWith({ page: "active" });
    vi.advanceTimersByTime(400);
    expect(ports.setPhases).toHaveBeenLastCalledWith({});
    expect((await handle("get_status", {}) as any).tasks).toEqual([]);
    await handle("begin_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: "verify", label: "Verify", scope: { kind: "container", id: "page" } });
    await handle("capture", { documentId: base.documentId, canvasId: base.canvasId, scope: { kind: "container", id: "page" } });
    expect(ports.setPhases).toHaveBeenLastCalledWith({ page: "active" });
    expect((await handle("get_status", {}) as any).tasks[0].status).toBe("active");
    expect(controller.getSnapshot().document.revision).toBe(1);
  });

  it("finishes each page independently of other pending pages", async () => {
    const { handle, base, ports } = setup();
    await handle("apply_operations", { ...base, operations: ["a", "b"].map((id, i) => ({ op: "create", element: { id, type: "frame", x: i * 200, y: 0, width: 100, height: 100 } })) });
    // Flush initial page creation and end its document task before scoped edits.
    await handle("capture", { documentId: base.documentId, canvasId: base.canvasId, scope: { kind: "document" } });
    await handle("finish_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: base.taskId, status: "completed" });
    for (const id of ["a", "b"]) await handle("begin_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: id, label: "Edit", scope: { kind: "container", id } });
    let revision = 1;
    for (const id of ["a", "b"]) {
      await handle("apply_operations", { ...base, taskId: id, baseRevision: revision++, requestId: id, operations: [{ ...shape(`${id}-card`), element: { ...shape(`${id}-card`).element, frameId: id } }] });
      await handle("finish_task", { documentId: base.documentId, canvasId: base.canvasId, taskId: id, status: "completed" });
    }
    vi.advanceTimersByTime(400);
    expect(ports.setPhases).toHaveBeenLastCalledWith({ b: "active" });
    vi.advanceTimersByTime(400);
    expect(ports.setPhases).toHaveBeenLastCalledWith({});
  });

  it("commits automatic height before playback and reveals grouped members one by one", async () => {
    const { handle, base, publish, controller, canvas } = setup();
    const result = await handle("apply_operations", { ...base, operations: [
      { op: "create", element: { id: "page", type: "frame", x: 0, y: 0, width: 390, height: 100 } },
      { op: "create", element: { id: "card", type: "rectangle", frameId: "page", x: 24, y: 120, width: 342, height: 100 } },
      { op: "create", element: { id: "label", type: "text", frameId: "page", x: 40, y: 140, width: 200, height: 30, text: "Content" } },
      { op: "group", ids: ["card", "label"], groupId: "block" },
    ] }) as any;
    expect(result.frameHeightChanges).toEqual([{ frameId: "page", previousHeight: 100, height: 220 }]);
    expect(publish).toHaveBeenLastCalledWith(["page", "card", "label"]);
    expect(controller.getSnapshot().document.scene.elements.find(e => e.id === "page")?.height).toBe(220);
    vi.advanceTimersByTime(400);
    expect(publish).toHaveBeenLastCalledWith(["card", "label"]);
    vi.advanceTimersByTime(400);
    expect(publish).toHaveBeenLastCalledWith(["label"]);
    vi.advanceTimersByTime(400);
    expect(publish).toHaveBeenLastCalledWith([]);
    canvas.sync();
    expect(canvas.hasPendingEdit).toBe(false);
    expect(controller.getSnapshot().document.revision).toBe(1);
    expect(controller.getHistory().undo).toHaveLength(1);
  });

  it("returns a full committed batch immediately, preserves forward bindings/grouping and replays requests without requeuing", async () => {
    const { handle, base, publish, controller, canvas } = setup();
    const input = { ...base, operations: [
      { op: "create", ref: "text", element: { id: "text", type: "text", containerId: "node", x: 10, y: 10, width: 80, height: 20, text: "Button" } },
      { ...shape("node"), ref: "node" },
      { op: "group", ids: ["text", "node"], groupId: "button" },
    ] };
    const result = await handle("apply_operations", input) as any;
    canvas.sync();
    expect(result).toMatchObject({ revision: 1, idMap: { text: "text", node: "node" } });
    expect(publish).toHaveBeenLastCalledWith(["text", "node"]);
    expect(controller.getSnapshot().document.scene.elements).toHaveLength(2);
    expect(controller.getSnapshot().document.scene.elements.every(e => e.groupIds.includes("button"))).toBe(true);
    expect(canvas.hasPendingEdit).toBe(false);
    vi.advanceTimersByTime(400);
    expect(publish).toHaveBeenLastCalledWith(["node"]);
    expect(await handle("apply_operations", input)).toEqual(result);
    expect(publish).toHaveBeenLastCalledWith(["node"]);
    expect(canvas.flush().revision).toBe(1);
    expect(controller.getHistory().undo).toHaveLength(1);
    canvas.observe(controller.getSnapshot().document.scene.elements, { cursorButton: "down" });
    expect(publish).toHaveBeenLastCalledWith([]);
    expect(vi.getTimerCount()).toBe(1); // active edit task expiry only
  });

  it("keeps creation order for anonymous elements, copies and final reorder operations", async () => {
    const { handle, base, publish, controller } = setup();
    await handle("apply_operations", { ...base, operations: [
      { op: "create", element: { type: "rectangle", x: 42, y: 0, width: 100, height: 40 } },
      shape("last"), { op: "duplicate", ids: ["last"], dx: 200 },
      { op: "reorder", ids: ["last"], position: "back" },
    ] });
    const elements = controller.getSnapshot().document.scene.elements;
    const anonymous = elements.find(e => e.x === 42)!;
    const copy = elements.find(e => e.x === 200)!;
    expect(publish).toHaveBeenLastCalledWith([anonymous.id, "last", copy.id]);
    expect(elements[0].id).toBe("last");
  });

  it("does not queue dry runs or rejected transactions", async () => {
    const { handle, base, publish, controller } = setup();
    await handle("apply_operations", { ...base, dryRun: true, operations: [shape("a")] });
    await expect(handle("apply_operations", { ...base, operations: [shape("a"), { op: "move", ids: ["missing"], dx: 1, dy: 1 }] })).rejects.toThrow();
    expect(publish).toHaveBeenCalledTimes(1); // initial empty mask only
    expect(controller.getSnapshot().document.revision).toBe(0);
    expect(vi.getTimerCount()).toBe(1); // active edit task expiry only
  });

  it.each(["capture", "export", "history"])("finishes playback before %s", async method => {
    const { handle, base, publish } = setup();
    const result = await handle("apply_operations", { ...base, operations: [shape("a"), shape("b")] }) as any;
    await handle(method as "capture" | "export" | "history", method === "history"
      ? { documentId: base.documentId, canvasId: base.canvasId, action: "undo", baseRevision: 1, transactionId: result.transaction.id }
      : { documentId: base.documentId, canvasId: base.canvasId, scope: { kind: "document" }, ...(method === "export" ? { format: "svg" } : {}) });
    expect(publish).toHaveBeenLastCalledWith([]);
    expect(vi.getTimerCount()).toBe(1); // active edit task expiry only
  });
});
