import { connectionStateFromRuntime, type BridgeRequest, type BridgeResponse, type McpRuntimeStatus } from "../../core/mcp-bridge";
import { CanvasCommandError } from "../../core/canvas-commands";
import type { AiSessionPorts } from "./request-ports";
import type { EditorSession } from "../../app/editor-session";
import { createEditorRequestHandler } from "./editor-requests";

export function startAiSession(session: EditorSession, inputPorts: AiSessionPorts) {
  let disposed = false, generation = 0;
  // Requests originate only from the enabled, authenticated main-process bridge.
  // Runtime status then keeps renderer authorization in sync with revocation.
  let enabled = true;
  const scope = session.captureProject(() => !disposed);
  const makeHandler = () => {
    const requestGeneration = generation;
    const assertActive = () => {
      scope.assertCurrent();
      if (disposed) throw new Error("PROJECT_SESSION_EXPIRED: 项目会话已关闭");
      if (!enabled || requestGeneration !== generation) throw new Error("MCP_DISABLED: MCP 访问已关闭，请重新开始任务。");
    };
    const ports: AiSessionPorts = {
      ...inputPorts, assertActive,
      notify: notice => { if (!disposed && enabled && requestGeneration === generation && scope.isCurrent()) inputPorts.notify(notice); },
      desktop: new Proxy({ ...inputPorts.desktop }, {
        get(target, key) {
          const value = Reflect.get(target, key);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            assertActive();
            const result = value.apply(target, args);
            return result instanceof Promise ? result.then(value => { assertActive(); return value; }) : result;
          };
        },
      }),
    };
    return { handle: createEditorRequestHandler({ ...ports, controller: scope.controller }), assertActive };
  };
  let current = makeHandler();
  const respond = async (request: BridgeRequest) => {
    if (disposed) return;
    const { handle, assertActive } = current;
    let response: BridgeResponse;
    try {
      assertActive(); inputPorts.flush();
      const result = await handle(request.method, request.params);
      assertActive();
      response = { type: "response", id: request.id, ok: true, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof CanvasCommandError ? error.code : message.match(/^([A-Z_]+):/)?.[1] ?? "APP_COMMAND_FAILED";
      response = { type: "response", id: request.id, ok: false, error: { code, message, ...(error instanceof CanvasCommandError ? { details: error.details } : {}) } };
    }
    inputPorts.desktop.sendMcpResponse(response);
  };
  const updateStatus = (status: McpRuntimeStatus) => {
    if (disposed) return;
    if (enabled !== status.enabled) {
      enabled = status.enabled;
      generation++;
      current.handle.dispose();
      inputPorts.elementReveal?.finish();
      if (enabled) current = makeHandler();
    }
    inputPorts.setConnection(connectionStateFromRuntime(status));
  };
  let observedStatus = false;
  const stopRequests = inputPorts.desktop.onMcpRequest(request => { void respond(request); });
  const stopStatus = inputPorts.desktop.onMcpRuntimeStatus(status => { observedStatus = true; updateStatus(status); });
  void inputPorts.desktop.getMcpRuntimeStatus().then(status => { if (!observedStatus) updateStatus(status); }).catch(() => {
    if (!disposed && !observedStatus) inputPorts.setConnection("connecting");
  });
  return () => { current.handle.dispose(); inputPorts.elementReveal?.finish(); disposed = true; stopRequests(); stopStatus(); };
}
