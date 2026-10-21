import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { registerProjectOpen } = require("./project-open.cjs");

function setup(argv: string[] = []) {
  const app = new EventEmitter(), ipcMain = new EventEmitter();
  const window = {
    webContents: { send: vi.fn() }, isDestroyed: () => false,
    isMinimized: vi.fn(() => false), restore: vi.fn(), show: vi.fn(), focus: vi.fn(),
  };
  let currentWindow: typeof window | null = null;
  const createWindow = vi.fn(() => { currentWindow = window; });
  const router = registerProjectOpen({ app, ipcMain, argv, getWindow: () => currentWindow, createWindow });
  const ready = () => ipcMain.emit("easydraw:project:renderer-ready", { sender: window.webContents });
  return { app, ipcMain, window, createWindow, router, ready, close: () => { currentWindow = null; router.reset(); } };
}

describe("system project opening", () => {
  it("queues an early macOS open-file event until the renderer subscribes", () => {
    const { app, window, createWindow, router, ready } = setup();
    const preventDefault = vi.fn();
    app.emit("open-file", { preventDefault }, "/projects/活动 项目.edw");
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(createWindow).not.toHaveBeenCalled();
    router.start();
    expect(createWindow).toHaveBeenCalledOnce();
    expect(window.webContents.send).not.toHaveBeenCalled();
    ready();
    expect(window.webContents.send).toHaveBeenCalledExactlyOnceWith("easydraw:project:open-file", resolve("/projects/活动 项目.edw"));
    ready();
    expect(window.webContents.send).toHaveBeenCalledOnce();
  });

  it("accepts startup file arguments and ignores switches and other file types", () => {
    const { window, router, ready } = setup(["electron", "main.cjs", "--mcp-server", "--flag.edw", "project.json", "/projects/项目.EDW"]);
    router.start(); ready();
    expect(window.webContents.send).toHaveBeenCalledExactlyOnceWith("easydraw:project:open-file", resolve("/projects/项目.EDW"));
  });

  it("forwards second-instance arguments and restores the running window", () => {
    const { app, window, router, ready } = setup(["/projects/first.edw"]);
    router.start(); ready(); window.webContents.send.mockClear();
    window.isMinimized.mockReturnValue(true);
    app.emit("second-instance", {}, ["EasyDraw", "second.edw"], "/projects");
    expect(window.restore).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
    expect(window.webContents.send).toHaveBeenCalledExactlyOnceWith("easydraw:project:open-file", resolve("/projects", "second.edw"));
  });

  it("keeps requests during window reload and rejects readiness from another renderer", () => {
    const { app, ipcMain, window, router, ready } = setup(["/projects/first.edw"]);
    router.start(); ready(); window.webContents.send.mockClear(); router.reset();
    app.emit("open-file", { preventDefault() {} }, "/projects/next.edw");
    ipcMain.emit("easydraw:project:renderer-ready", { sender: {} });
    expect(window.webContents.send).not.toHaveBeenCalled();
    ready();
    expect(window.webContents.send).toHaveBeenCalledExactlyOnceWith("easydraw:project:open-file", resolve("/projects/next.edw"));
  });

  it("recreates a closed window and waits for its new renderer", () => {
    const { app, window, createWindow, router, ready, close } = setup(["/projects/first.edw"]);
    router.start(); ready(); window.webContents.send.mockClear(); close();
    app.emit("open-file", { preventDefault() {} }, "/projects/next.edw");
    expect(createWindow).toHaveBeenCalledTimes(2);
    expect(window.webContents.send).not.toHaveBeenCalled();
    ready();
    expect(window.webContents.send).toHaveBeenCalledExactlyOnceWith("easydraw:project:open-file", resolve("/projects/next.edw"));
  });
});
