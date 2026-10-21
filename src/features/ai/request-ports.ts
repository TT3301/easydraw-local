import type { EasyDrawImperativeAPI } from "@easydraw/canvas-engine/types";
import type { SceneController } from "../../core/scene-controller";
import type { InsertedAssetResult } from "../../desktop-api";
import type { Notify } from "../../app/ports";
import type { BridgeConnectionState } from "../../core/mcp-bridge";
import type { Dispatch, SetStateAction } from "react";
import type { AiElementRevealQueue } from "./element-reveal-queue";
export interface AiSessionPorts {
  desktop: NonNullable<Window["easydrawDesktop"]>;
  getApi(): EasyDrawImperativeAPI | null;
  getProjectPath(): string | null;
  isReady(): boolean;
  getSelection(): string[];
  setSelection(ids: string[]): void;
  requestFit(): void;
  flush(): unknown;
  elementReveal?: AiElementRevealQueue;
  getSaveState?(): string;
  assertActive?(): void;
  notify: Notify;
  preloadAssets(assets: InsertedAssetResult[]): void;
  setConnection(state: BridgeConnectionState): void;
  setPhases: Dispatch<SetStateAction<Record<string, "active" | "leaving">>>;
}
export interface EditorRequestPorts extends AiSessionPorts { controller: SceneController }
