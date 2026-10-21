import { reconcilePageAggregates } from "@easydraw/document-model";
import type { SceneElement } from "@easydraw/editor-contracts";
import type { SceneController } from "../core/scene-controller";
import {
  areSceneElementsCommitReady,
  mergeManualCanvasElements,
  sceneElementsSignature,
} from "./canvas-sync";

export interface CanvasEditState {
  cursorButton?: "up" | "down";
  newElement?: unknown;
  editingTextElement?: unknown;
  isResizing?: boolean;
  isRotating?: boolean;
  selectedElementsAreBeingDragged?: boolean;
}

/** Owns the working-copy baseline, pending edit and echo suppression together. */
export class CanvasSession {
  private baseline: SceneElement[] = [];
  private pending: SceneElement[] | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private documentSignature = "";
  private gesture = false;
  private pendingSync = false;
  private generation = 0;
  private syncedEpoch = -1;
  private publishing = false;
  private observedVersion: number | undefined;
  private gestureChanged = false;
  private write: ((elements: SceneElement[]) => void) | null = null;

  constructor(private controller: SceneController, private onError: (message: string) => void,
    private beforeInteraction?: () => void) {}

  get blocked() { return this.gesture || this.pending !== null; }
  get hasPendingEdit() { return this.pending !== null && !this.gesture; }
  get activeGesture() { return this.gesture; }
  get epoch() { return this.generation; }

  connect(write: (elements: SceneElement[]) => void) {
    this.write = write;
    const unsubscribe = this.controller.subscribe(() => { if (this.syncedEpoch !== this.controller.getCanvasEpoch()) this.sync(); });
    this.sync();
    return () => { unsubscribe(); this.write = null; this.reset(); };
  }

  reset() {
    this.cancelTimer();
    this.generation++;
    this.pending = null;
    this.gesture = false;
    this.pendingSync = false;
    this.baseline = [];
    this.documentSignature = "";
    this.observedVersion = undefined;
    this.gestureChanged = false;
  }

  sync = () => {
    if (!this.write) return;
    if (this.syncedEpoch !== this.controller.getCanvasEpoch()) { this.reset(); this.syncedEpoch = this.controller.getCanvasEpoch(); }
    if (this.blocked) { this.pendingSync = true; return; }
    const elements = this.controller.getSnapshot().document.scene.elements;
    const signature = sceneElementsSignature(elements);
    if (!this.pendingSync && signature === this.documentSignature) return;
    this.pendingSync = false;
    this.documentSignature = signature;
    this.baseline = structuredClone(elements.filter(element => !element.isDeleted));
    this.publishing = true;
    try { this.write(structuredClone(elements)); } finally { this.publishing = false; }
  };

  observe(elements: readonly SceneElement[], state: CanvasEditState, sceneVersion?: number) {
    if (this.publishing || !this.controller.getSnapshot().document.activeCanvasId) return elements;
    const wasGesture = this.gesture;
    const contentChanged = sceneVersion === undefined || sceneVersion !== this.observedVersion;
    this.observedVersion = sceneVersion;
    this.gesture = state.cursorButton === "down" || Boolean(state.newElement) ||
      Boolean(state.editingTextElement) || state.isResizing === true ||
      state.isRotating === true || state.selectedElementsAreBeingDragged === true;
    if (this.gesture) {
      this.cancelTimer();
      this.gestureChanged ||= contentChanged;
      this.beforeInteraction?.();
      return elements;
    }
    const needsCheck = contentChanged || this.gestureChanged;
    this.gestureChanged = false;
    if (!needsCheck) {
      if (wasGesture && this.pending && areSceneElementsCommitReady(this.pending)) {
        try { this.flush(); } catch (error) { this.onError((error as Error).message); }
      }
      if (this.pendingSync && !this.pending) this.sync();
      return elements;
    }
    this.cancelTimer();
    const ordered = reconcilePageAggregates(elements, this.controller.getSnapshot().document.scene.elements);
    const live = ordered.filter(element => !element.isDeleted);
    if (sceneElementsSignature(live) === sceneElementsSignature(this.baseline)) {
      this.pending = null;
      if (this.pendingSync) this.sync();
      return ordered;
    }
    // Keep even invalid edits pending so save/export cannot silently use stale data.
    this.beforeInteraction?.();
    this.pending = structuredClone(live);
    if (areSceneElementsCommitReady(live)) {
      if (wasGesture) {
        try { this.flush(); } catch (error) { this.onError((error as Error).message); }
        return ordered;
      }
      this.timer = setTimeout(() => {
        try { this.flush(); } catch (error) { this.onError((error as Error).message); }
      }, 280);
    }
    return ordered;
  }

  /** Explicit commands defer during drag/text entry; pointer-up/blur completes it. */
  flush = () => {
    if (this.gesture) throw new Error("请先结束拖拽或文字编辑，再执行此操作");
    this.cancelTimer();
    if (!this.pending) return this.controller.getSnapshot().document;
    if (!areSceneElementsCommitReady(this.pending)) throw new Error("当前画布包含尚未完成的元素，请完成编辑后重试");
    const live = this.pending;
    const merged = mergeManualCanvasElements(this.controller.getSnapshot().document.scene.elements, this.baseline, live);
    const result = this.controller.commitManualElements(merged);
    if (!result.ok) throw new Error(result.message);
    this.pending = null;
    const document = this.controller.getSnapshot().document;
    const refresh = this.pendingSync || sceneElementsSignature(document.scene.elements) !== sceneElementsSignature(live);
    this.documentSignature = sceneElementsSignature(document.scene.elements);
    this.baseline = structuredClone(live);
    if (refresh) { this.pendingSync = true; this.sync(); }
    return document;
  };

  private cancelTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
