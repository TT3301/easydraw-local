import type { CanvasMethod } from "./canvas";
export interface BridgeRequest {
  type: "request";
  id: string;
  method: CanvasMethod;
  params: unknown;
}
export interface BridgeResponse {
  type: "response";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string; details?: unknown };
}
