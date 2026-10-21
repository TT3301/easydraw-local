import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneController } from "../core/scene-controller";
import { createInitialDocument } from "../core/protocol";
import { CanvasSession } from "./canvas-session";
import * as canvasSync from "./canvas-sync";

const setup = () => {
  const controller = new SceneController(createInitialDocument());
  const onError = vi.fn();
  const canvas = new CanvasSession(controller, onError);
  const render = vi.fn();
  canvas.connect(render);
  const edit = () => {
    const elements = structuredClone(controller.getSnapshot().document.scene.elements);
    elements[1] = { ...elements[1], x: elements[1].x + 20 };
    return elements;
  };
  return { controller, canvas, render, edit, onError };
};
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("canvas session commit barrier", () => {
  it("skips content comparison for viewport/selection changes with the same scene version", () => {
    const { canvas, controller } = setup();
    const elements = structuredClone(controller.getSnapshot().document.scene.elements);
    canvas.observe(elements, {}, 1);
    const signature = vi.spyOn(canvasSync, "sceneElementsSignature");
    for (let i = 0; i < 100; i++) {
      expect(canvas.observe(elements, {}, 1)).toBe(elements);
    }
    expect(signature).not.toHaveBeenCalled();
    expect(controller.getSnapshot().document.revision).toBe(0);
  });
  it("does no content comparisons during a long drag and commits its final position on release", () => {
    vi.useFakeTimers();
    const { canvas, controller, edit } = setup();
    const elements = edit();
    canvas.observe(controller.getSnapshot().document.scene.elements, {}, 1);
    const signature = vi.spyOn(canvasSync, "sceneElementsSignature");
    for (let i = 0; i < 30; i++) {
      elements[1].x += 1;
      canvas.observe(elements, { cursorButton: "down" }, i + 2);
      vi.advanceTimersByTime(100);
    }
    expect(signature).not.toHaveBeenCalled();
    expect(controller.getSnapshot().document.revision).toBe(0);
    canvas.observe(elements, { cursorButton: "up" }, 31);
    expect(controller.getSnapshot().document.scene.elements[1].x).toBe(elements[1].x);
    expect(controller.getSnapshot().document.revision).toBe(1);
    vi.runAllTimers();
    expect(controller.getSnapshot().document.revision).toBe(1);
  });
  it("does not postpone a pending content commit when only the viewport changes", () => {
    vi.useFakeTimers();
    const { canvas, controller, edit } = setup();
    const elements = edit();
    canvas.observe(elements, {}, 2);
    vi.advanceTimersByTime(200);
    canvas.observe(elements, {}, 2);
    vi.advanceTimersByTime(80);
    expect(controller.getSnapshot().document.revision).toBe(1);
  });
  it("flushes a pending edit when a subsequent gesture ends without changing content", () => {
    vi.useFakeTimers();
    const { canvas, controller, edit } = setup();
    const elements = edit();
    canvas.observe(elements, {}, 2);
    canvas.observe(elements, { cursorButton: "down" }, 2);
    vi.advanceTimersByTime(3000);
    expect(controller.getSnapshot().document.revision).toBe(0);
    canvas.observe(elements, { cursorButton: "up" }, 2);
    expect(controller.getSnapshot().document.revision).toBe(1);
  });
  it("flushes pointer-up edits immediately and creates exactly one undo entry", () => {
    vi.useFakeTimers();
    const { controller, canvas, edit, render } = setup();
    const elements = edit();
    canvas.observe(elements, { cursorButton: "up" });
    expect(canvas.flush().scene.elements[1].x).toBe(elements[1].x);
    vi.runAllTimers();
    expect(controller.getSnapshot().document.revision).toBe(1);
    expect(controller.undo()).toBe(true);
    expect(controller.undo()).toBe(false);
    expect(render).toHaveBeenCalledTimes(1); // no gesture echo/repeated frame reconciliation
  });
  it("defers explicit actions during dragging and text editing", () => {
    const { controller, canvas, edit } = setup();
    for (const state of [{ cursorButton: "down" as const }, { editingTextElement: {} }]) {
      canvas.observe(edit(), state);
      expect(() => canvas.flush()).toThrow("结束拖拽或文字编辑");
      expect(controller.getSnapshot().document.revision).toBe(0);
    }
    canvas.observe(edit(), { cursorButton: "up", editingTextElement: null });
    expect(canvas.flush().revision).toBe(1);
  });
  it("does not save invalid or unfinished elements as if the document were current", () => {
    const { controller, canvas, edit } = setup();
    const invalid = edit(); invalid[1] = { ...invalid[1], x: NaN };
    canvas.observe(invalid, {});
    expect(() => canvas.flush()).toThrow("尚未完成");
    expect(controller.getSnapshot().document.revision).toBe(0);
    canvas.reset();
  });
  it("cancels old pending edits on project switch and isolates the baseline from engine mutation", () => {
    vi.useFakeTimers();
    const { controller, canvas, edit, render } = setup();
    render.mock.calls[0][0][1].x = 999;
    canvas.observe(edit(), {});
    canvas.reset();
    const next = createInitialDocument("next");
    controller.replaceDocument(next); canvas.sync();
    vi.runAllTimers();
    expect(controller.getSnapshot().document).toMatchObject({ name: next.name, projectId: next.projectId, revision: 0 });
    expect(canvas.flush().revision).toBe(0);
  });
  it("retains AI additions arriving while a manual edit is pending", () => {
    const { controller, canvas, edit } = setup();
    canvas.observe(edit(), {});
    controller.commitProjectChange("remote addition", draft => {
      draft.scene.elements.push({ ...structuredClone(draft.scene.elements[1]), id: "remote" });
    });
    canvas.sync();
    expect(canvas.flush().scene.elements.some(element => element.id === "remote")).toBe(true);
  });
});
