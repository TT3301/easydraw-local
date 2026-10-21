import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeElement } from "@easydraw/document-model";
import { createInitialDocument } from "../../core/protocol";
import { SceneController } from "../../core/scene-controller";
import { AiElementRevealQueue } from "./element-reveal-queue";

const cleanups: Array<() => void> = [];
function setup() {
  vi.useFakeTimers();
  const document = createInitialDocument(); document.scene.elements = []; document.focusedPageElementId = null;
  const controller = new SceneController(document);
  const otherCanvas = controller.manageTree({ op: "create", type: "canvas", parentId: null })!;
  const queue = new AiElementRevealQueue(controller);
  const publish = vi.fn(); cleanups.push(queue.connect(publish));
  const create = (ids: string[]) => queue.commit(ids, () => controller.commitAiProjectChange("AI batch", controller.getSnapshot().document.revision, draft => {
    draft.scene.elements.push(...ids.map(id => createNativeElement({ id, type: "rectangle", x: 0, y: 0, width: 100, height: 40, groupIds: ["same-group"] })));
  }));
  return { controller, queue, publish, create, otherCanvas };
}
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.useRealTimers(); });

describe("AI element display queue", () => {
  it("reveals grouped elements individually, appends batches FIFO and keeps complete atomic history", () => {
    const { controller, publish, create } = setup();
    const first = create(["a", "b"]);
    expect(first.ok).toBe(true);
    expect(controller.getSnapshot().document.scene.elements.map(e => e.id)).toEqual(["a", "b"]);
    expect(publish).toHaveBeenLastCalledWith(["a", "b"]);
    vi.advanceTimersByTime(399);
    expect(publish).toHaveBeenLastCalledWith(["a", "b"]);
    vi.advanceTimersByTime(1);
    expect(publish).toHaveBeenLastCalledWith(["b"]);
    vi.advanceTimersByTime(50);
    create(["c", "d"]);
    expect(publish).toHaveBeenLastCalledWith(["b", "c", "d"]);
    vi.advanceTimersByTime(350);
    expect(publish).toHaveBeenLastCalledWith(["c", "d"]);
    vi.advanceTimersByTime(400);
    expect(publish).toHaveBeenLastCalledWith(["d"]);
    vi.advanceTimersByTime(400);
    expect(publish).toHaveBeenLastCalledWith([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(controller.getSnapshot().document.revision).toBe(3); // canvas creation + two batches
    controller.undo();
    expect(controller.getSnapshot().document.scene.elements.map(e => e.id)).toEqual(["a", "b"]);
  });

  it("reads the latest committed content and drops deleted pending IDs without restarting the clock", () => {
    const { controller, queue, publish, create } = setup();
    create(["a", "b", "c"]);
    vi.advanceTimersByTime(100);
    queue.commit([], () => controller.commitAiProjectChange("Update/delete", controller.getSnapshot().document.revision, draft => {
      draft.scene.elements = draft.scene.elements.filter(e => e.id !== "a").map(e => e.id === "b" ? { ...e, x: 300 } : e);
    }));
    expect(publish).toHaveBeenLastCalledWith(["b", "c"]);
    vi.advanceTimersByTime(300);
    expect(publish).toHaveBeenLastCalledWith(["c"]);
    expect(controller.getSnapshot().document.scene.elements.find(e => e.id === "b")?.x).toBe(300);
  });

  it("rolls back only failed additions and keeps the previous batch's timer", () => {
    const { controller, queue, publish, create } = setup();
    create(["a", "b"]); vi.advanceTimersByTime(100);
    const failed = queue.commit(["failed"], () => controller.commitAiProjectChange("Stale", 0, () => {}));
    expect(failed.ok).toBe(false);
    expect(publish).toHaveBeenLastCalledWith(["a", "b"]);
    expect(() => queue.commit(["throw"], () => { throw new Error("Failed"); })).toThrow("Failed");
    expect(publish).toHaveBeenLastCalledWith(["a", "b"]);
    vi.advanceTimersByTime(300);
    expect(publish).toHaveBeenLastCalledWith(["b"]);
  });

  it.each(["finish", "human", "undo", "switch", "replace", "disconnect"])("cleans timers and shows complete state on %s", action => {
    const { controller, queue, publish, create, otherCanvas } = setup();
    create(["a", "b"]);
    if (action === "finish") queue.finish();
    if (action === "human") controller.commitProjectChange("Human edit", draft => { draft.scene.elements[0].x = 20; });
    if (action === "undo") controller.undo();
    if (action === "switch") controller.switchCanvas(otherCanvas);
    if (action === "replace") controller.replaceDocument(createInitialDocument("Replacement"));
    if (action === "disconnect") cleanups.pop()!();
    expect(publish).toHaveBeenLastCalledWith([]);
    expect(vi.getTimerCount()).toBe(0);
    const count = publish.mock.calls.length;
    vi.advanceTimersByTime(2000);
    expect(publish).toHaveBeenCalledTimes(count);
  });
});
