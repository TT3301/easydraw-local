import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasViewRecorder } from "./canvas-view-recorder";

afterEach(() => vi.useRealTimers());
const view = (scrollX = 0) => ({ zoom: 1, scrollX, scrollY: 0 });

describe("canvas view persistence", () => {
  it("writes only on release after a three-second gesture, and skips unchanged views", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const recorder = new CanvasViewRecorder(write);
    recorder.observe("canvas-a", view(), false);
    vi.advanceTimersByTime(200);
    write.mockClear();
    for (let i = 1; i <= 30; i++) {
      recorder.observe("canvas-a", view(i), true);
      vi.advanceTimersByTime(100);
    }
    expect(write).not.toHaveBeenCalled();
    recorder.observe("canvas-a", view(30), false);
    expect(write).toHaveBeenCalledExactlyOnceWith("canvas-a", view(30));
    recorder.observe("canvas-a", view(30), false);
    vi.runAllTimers();
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("writes only after continuous wheel movement stops", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const recorder = new CanvasViewRecorder(write);
    for (let i = 0; i < 30; i++) {
      recorder.observe("canvas-a", view(i), false);
      vi.advanceTimersByTime(100);
    }
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(write).toHaveBeenCalledExactlyOnceWith("canvas-a", view(29));
  });
  it("flushes the original canvas on switch and prevents its delayed write from affecting the new canvas", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const recorder = new CanvasViewRecorder(write);
    recorder.observe("project-a:canvas-a", view(10), true);
    recorder.observe("project-b:canvas-b", view(20), false);
    expect(write).toHaveBeenCalledExactlyOnceWith("project-a:canvas-a", view(10));
    recorder.reset();
    vi.runAllTimers();
    expect(write.mock.calls).toEqual([["project-a:canvas-a", view(10)], ["project-b:canvas-b", view(20)]]);
  });
  it("preserves the last view when closing before the idle timer fires", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const recorder = new CanvasViewRecorder(write);
    recorder.observe("canvas", view(10), false);
    recorder.flush();
    vi.runAllTimers();
    expect(write).toHaveBeenCalledExactlyOnceWith("canvas", view(10));
  });
});
