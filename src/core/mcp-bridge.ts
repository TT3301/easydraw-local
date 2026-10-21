export type BridgeConnectionState =
  | "disabled"
  | "connecting"
  | "connected"
  | "disconnected";

export type { BridgeRequest, BridgeResponse } from "@easydraw/editor-contracts/bridge";

export interface McpRuntimeStatus {
  enabled: boolean;
  listening: boolean;
  port: number | null;
  clientCount: number;
  clients: Array<{ name: string | null; version: string | null }>;
  rendererReady: boolean;
  descriptorVersion: number;
}

export interface McpConnectionInfo {
  transport: "stdio";
  config: { mcpServers: { easydraw: {
    command: string;
    args: string[];
    env: Record<string, string>;
  } } };
  skillPath: string;
  skillHash?: string;
}

export const connectionStateFromRuntime = (
  status: McpRuntimeStatus,
): BridgeConnectionState => {
  if (!status.enabled) return "disabled";
  if (!status.listening || !status.rendererReady) return "connecting";
  return status.clientCount > 0 ? "connected" : "disconnected";
};
