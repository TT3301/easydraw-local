import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@easydraw/canvas-engine", () => ({ CaptureUpdateAction: { NEVER: "NEVER" }, exportToBlob: vi.fn() }));
vi.mock("./canvas-runtime", () => ({ reconcileCanvasBindings: vi.fn(), measureCanvasText: vi.fn(), renderedBounds: vi.fn() }));
import { startAiSession } from "./ai-session";
import { EditorSession } from "../../app/editor-session";
import { SceneController } from "../../core/scene-controller";
import { createInitialDocument } from "../../core/protocol";
import type { BridgeRequest, BridgeResponse, McpRuntimeStatus } from "../../core/mcp-bridge";
import type { AiSessionPorts } from "./request-ports";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("AI project session", () => {
  it("invalidates pending asset writes and tasks on MCP revocation, even after re-enabling", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    let receive!: (request: BridgeRequest) => void;
    let runtime!: (status: McpRuntimeStatus) => void;
    let resolveAsset!: (asset: unknown) => void;
    const assetPromise = new Promise(resolve => { resolveAsset = resolve; });
    const response = vi.fn(), preloadAssets = vi.fn(), setConnection = vi.fn(), setPhases = vi.fn();
    const initialStatus = { enabled: true, listening: true, rendererReady: true, clientCount: 1, clients: [], port: 1, descriptorVersion: 1 };
    const desktop = Object.freeze({
      onMcpRequest: (callback: typeof receive) => { receive = callback; return vi.fn(); },
      onMcpRuntimeStatus: (callback: typeof runtime) => { runtime = callback; return vi.fn(); },
      getMcpRuntimeStatus: async () => initialStatus,
      sendMcpResponse: response,
      insertImagePlaceholder: vi.fn(() => assetPromise),
    });
    const controller = new SceneController(createInitialDocument());
    const stop = startAiSession(new EditorSession(controller), { desktop, getApi: () => null, getProjectPath: () => "/test", isReady: () => true,
      getSelection: () => [], setSelection: vi.fn(), requestFit: vi.fn(), flush: vi.fn(),
      notify: vi.fn(), preloadAssets, setConnection, setPhases,
    } as unknown as AiSessionPorts);
    const doc = { documentId: controller.getSnapshot().document.projectId, canvasId: controller.getSnapshot().document.activeCanvasId! };
    receive({ type: "request", id: "task", method: "begin_task", params: { ...doc, taskId: "old-task", label: "Asset", scope: { kind: "document" } } });
    receive({ type: "request", id: "asset", method: "apply_operations", params: { ...doc, taskId: "old-task", requestId: "asset", label: "Asset", baseRevision: 0,
      operations: [{ op: "create", assetRef: "builtin:placeholder:image-wireframe", element: { id: "placeholder", type: "rectangle", x: 5, y: 5, width: 20, height: 20 } }],
    } });
    await vi.advanceTimersByTimeAsync(0);
    expect(desktop.insertImagePlaceholder).toHaveBeenCalledOnce();
    runtime({ ...initialStatus, enabled: false, listening: false, clientCount: 0 });
    expect(setConnection).toHaveBeenLastCalledWith("disabled");
    expect(setPhases).toHaveBeenLastCalledWith({});
    receive({ type: "request", id: "disabled-read", method: "get_status", params: {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(response).toHaveBeenCalledWith(expect.objectContaining({ id: "disabled-read", ok: false, error: expect.objectContaining({ code: "MCP_DISABLED" }) }));
    runtime(initialStatus);
    resolveAsset({});
    await vi.advanceTimersByTimeAsync(0);
    expect(response).toHaveBeenCalledWith(expect.objectContaining({ id: "asset", ok: false, error: expect.objectContaining({ code: "MCP_DISABLED" }) }));
    expect(preloadAssets).not.toHaveBeenCalled();
    expect(controller.getSnapshot().document.revision).toBe(0);
    receive({ type: "request", id: "old-task-write", method: "apply_operations", params: { ...doc, taskId: "old-task", requestId: "old-task-write", label: "No stale task", baseRevision: 0,
      operations: [{ op: "create", element: { id: "new-shape", type: "rectangle", x: 5, y: 5, width: 20, height: 20 } }],
    } });
    await vi.advanceTimersByTimeAsync(0);
    expect(response).toHaveBeenCalledWith(expect.objectContaining({ id: "old-task-write", ok: false, error: expect.objectContaining({ code: "TASK_NOT_ACTIVE" }) }));
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not let a delayed initial status response undo a newer revocation", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    let receive!: (request: BridgeRequest) => void, runtime!: (status: McpRuntimeStatus) => void;
    let resolveStatus!: (status: McpRuntimeStatus) => void;
    const pending = new Promise<McpRuntimeStatus>(resolve => { resolveStatus = resolve; });
    const response = vi.fn(), setConnection = vi.fn();
    const desktop = { onMcpRequest: (callback: typeof receive) => { receive = callback; return vi.fn(); },
      onMcpRuntimeStatus: (callback: typeof runtime) => { runtime = callback; return vi.fn(); },
      getMcpRuntimeStatus: () => pending, sendMcpResponse: response,
    };
    const stop = startAiSession(new EditorSession(new SceneController(createInitialDocument())), {
      desktop, getApi: () => null, getProjectPath: () => null, isReady: () => true,
      getSelection: () => [], setSelection: vi.fn(), requestFit: vi.fn(), flush: vi.fn(),
      notify: vi.fn(), preloadAssets: vi.fn(), setConnection, setPhases: vi.fn(),
    } as unknown as AiSessionPorts);
    const disabled: McpRuntimeStatus = { enabled: false, listening: false, rendererReady: true, clientCount: 0, clients: [], port: null, descriptorVersion: 1 };
    runtime(disabled);
    resolveStatus({ ...disabled, enabled: true, listening: true });
    await Promise.resolve();
    expect(setConnection).toHaveBeenLastCalledWith("disabled");
    receive({ type: "request", id: "late-read", method: "get_status", params: {} });
    await Promise.resolve();
    expect(response).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "MCP_DISABLED" }) }));
    stop();
  });
  it("supports frozen Electron APIs and rejects delayed asset writes after a project switch", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    let receive!: (request: BridgeRequest) => void;
    let resolveAsset!: (asset: unknown) => void;
    const response = vi.fn<(response: BridgeResponse) => void>();
    const assetPromise = new Promise(resolve => { resolveAsset = resolve; });
    const desktop = Object.freeze({
      onMcpRequest: (callback: typeof receive) => { receive = callback; return vi.fn(); },
      onMcpRuntimeStatus: () => vi.fn(),
      getMcpRuntimeStatus: async () => ({ enabled: true, listening: true, rendererReady: true, clientCount: 1 }),
      sendMcpResponse: response,
      readImagePlaceholder: vi.fn(async () => ({ data: "", mimeType: "image/svg+xml" })),
      insertImagePlaceholder: vi.fn(() => assetPromise),
    });
    const controller = new SceneController(createInitialDocument());
    const session = new EditorSession(controller);
    const preloadAssets = vi.fn();
    const ports = { desktop, getApi: () => null, getProjectPath: () => "/test", isReady: () => true,
      getSelection: () => [], setSelection: vi.fn(), requestFit: vi.fn(), flush: vi.fn(),
      notify: vi.fn(), preloadAssets, setConnection: vi.fn(), setPhases: vi.fn(),
    } as unknown as AiSessionPorts;
    const stop = startAiSession(session, ports);
    receive({ type: "request", id: "task", method: "begin_task", params: {
      documentId: controller.getSnapshot().document.projectId, canvasId: controller.getSnapshot().document.activeCanvasId,
      taskId: "asset-task", label: "Asset", scope: { kind: "document" },
    } });
    receive({ type: "request", id: "asset", method: "apply_operations", params: {
      documentId: controller.getSnapshot().document.projectId, canvasId: controller.getSnapshot().document.activeCanvasId!, taskId: "asset-task", requestId: "asset", label: "Asset", baseRevision: 0,
      operations: [{ op: "create", assetRef: "builtin:placeholder:image-wireframe", element: { id: "placeholder", type: "rectangle", x: 5, y: 5, width: 20, height: 20 } }],
    } });
    await vi.advanceTimersByTimeAsync(0);
    expect(desktop.insertImagePlaceholder).toHaveBeenCalledTimes(1);
    stop?.();
    session.replace(createInitialDocument("new"));
    resolveAsset({});
    await vi.advanceTimersByTimeAsync(1000);
    expect(response).toHaveBeenCalledWith(expect.objectContaining({ ok: false,
      error: expect.objectContaining({ message: expect.stringContaining("PROJECT_SESSION_EXPIRED") }) }));
    expect(preloadAssets).not.toHaveBeenCalled();
    expect(controller.getSnapshot().document.revision).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
