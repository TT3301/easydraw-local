import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectService } from "./project-service";
import { EditorSession } from "./editor-session";
import { CanvasSession } from "../canvas/canvas-session";
import { SceneController } from "../core/scene-controller";
import { createInitialDocument } from "../core/protocol";
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const setup = async () => {
  const controller = new SceneController(createInitialDocument());
  const session = new EditorSession(controller);
  const canvas = new CanvasSession(controller, vi.fn());
  canvas.connect(() => {});
  const desktop = {
    saveProject: vi.fn(async ({ projectPath }: { projectPath: string; document: unknown }) => ({ projectPath })),
    saveProjectAs: vi.fn(async () => ({ projectPath: "/project-a" })),
    openProject: vi.fn(async () => ({ projectPath: "/project-b", document: createInitialDocument("B") })),
  };
  const notify = vi.fn();
  const service = new ProjectService(session, canvas, desktop, notify);
  const stop = service.connect();
  session.subscribe(() => canvas.reset());
  await service.create("en"); canvas.sync();
  const edit = (name: string) => controller.commitProjectChange("rename", draft => { draft.name = name; });
  return { controller, canvas, service, desktop, notify, edit, stop };
};
afterEach(() => vi.useRealTimers());
describe("project persistence", () => {
  it("queues system file requests while the file picker is open", async () => {
    const { service, desktop, controller, stop } = await setup();
    const picker = deferred<{ projectPath: string; document: ReturnType<typeof createInitialDocument> }>();
    desktop.openProject.mockImplementationOnce(() => picker.promise);
    desktop.openProject.mockResolvedValueOnce({ projectPath: "/external.edw", document: createInitialDocument("External") });
    const manualOpen = service.open();
    const systemOpen = service.open("/external.edw");
    expect(desktop.openProject).toHaveBeenCalledTimes(1);
    picker.resolve({ projectPath: "/manual.edw", document: createInitialDocument("Manual") });
    await Promise.all([manualOpen, systemOpen]);
    expect(desktop.openProject.mock.calls).toEqual([[undefined], ["/external.edw"]]);
    expect(service.getSnapshot().projectPath).toBe("/external.edw");
    expect(controller.getSnapshot().document.name).toBe("External");
    stop();
  });

  it("preserves edits before opening a system file", async () => {
    const { service, desktop, edit, controller, stop } = await setup();
    edit("Keep my edits");
    await service.open("/external.edw");
    expect(desktop.openProject).toHaveBeenCalledWith("/external.edw");
    expect(desktop.saveProject).toHaveBeenCalledWith(expect.objectContaining({ projectPath: "/project-a", document: expect.objectContaining({ name: "Keep my edits" }) }));
    expect(controller.getSnapshot().document.name).toBe("B");
    stop();
  });

  it.each(["/projects/活动管理 2026.edw", "C:\\projects\\活动管理 2026.edw"])("uses the opened file name in the toast for %s", async projectPath => {
    const { controller, service, desktop, notify, stop } = await setup();
    const document = createInitialDocument();
    desktop.openProject.mockResolvedValueOnce({ projectPath, document });
    await service.open();
    expect(notify).toHaveBeenLastCalledWith({ tone: "success", text: "已打开项目：活动管理 2026.edw" });
    expect(service.getSnapshot().projectPath).toBe(projectPath);
    expect(controller.getSnapshot().document.name).toBe(document.name);
    stop();
  });
  it("serializes autosave before a newer explicit save", async () => {
    vi.useFakeTimers();
    const { service, desktop, edit, stop } = await setup();
    const first = deferred<{ projectPath: string }>();
    desktop.saveProject.mockImplementationOnce(() => first.promise);
    edit("first");
    await vi.advanceTimersByTimeAsync(900);
    edit("second");
    const saved = service.save();
    await Promise.resolve();
    expect(desktop.saveProject).toHaveBeenCalledTimes(1);
    first.resolve({ projectPath: "/project-a" });
    await saved;
    expect(desktop.saveProject.mock.calls.map(call => (call[0].document as { name: string }).name)).toEqual(["first", "second"]);
    expect(service.getSnapshot().saveState).toBe("saved"); stop();
  });
  it("saves pending canvas changes before accepting another project", async () => {
    vi.useFakeTimers();
    const { controller, canvas, service, desktop, stop } = await setup();
    const elements = structuredClone(controller.getSnapshot().document.scene.elements);
    elements[1] = { ...elements[1], x: elements[1].x + 40 };
    canvas.observe(elements, {});
    await service.open();
    expect(desktop.saveProject.mock.calls[0][0]).toMatchObject({ projectPath: "/project-a", document: { scene: { elements: expect.arrayContaining([expect.objectContaining({ id: elements[1].id, x: elements[1].x })]) } } });
    expect(controller.getSnapshot().document.name).toBe("B");
    await vi.advanceTimersByTimeAsync(1000);
    expect(desktop.saveProject).toHaveBeenCalledTimes(1); stop();
  });
  it("keeps the current project when its pending edit cannot be saved", async () => {
    const { controller, canvas, service, stop } = await setup();
    canvas.observe(controller.getSnapshot().document.scene.elements, { cursorButton: "down" });
    await service.open();
    expect(service.getSnapshot()).toMatchObject({ projectPath: "/project-a", saveState: "error" });
    expect(controller.getSnapshot().document.name).not.toBe("B"); stop();
  });
});
