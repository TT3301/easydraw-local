import type { ApplyBatchResult } from "../../core/protocol";
import type { SceneController } from "../../core/scene-controller";

export const AI_ELEMENT_REVEAL_INTERVAL_MS = 400;

/** Presentation only: the committed document always contains the complete batch. */
export class AiElementRevealQueue {
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private publish: ((hiddenIds: readonly string[]) => void) | null = null;
  private committing = false;
  private listeners = new Set<(hiddenIds: readonly string[]) => void>();

  subscribe(listener: (hiddenIds: readonly string[]) => void) {
    this.listeners.add(listener);
    listener([...this.pending]);
    return () => { this.listeners.delete(listener); };
  }

  constructor(private readonly controller: SceneController) {}

  connect(publish: (hiddenIds: readonly string[]) => void) {
    this.publish = publish;
    let epoch = this.controller.getCanvasEpoch();
    let revision = this.controller.getSnapshot().document.revision;
    const unsubscribe = this.controller.subscribe(() => {
      const nextEpoch = this.controller.getCanvasEpoch();
      const document = this.controller.getSnapshot().document;
      const switched = epoch !== nextEpoch;
      const changed = revision !== document.revision;
      epoch = nextEpoch; revision = document.revision;
      if (switched || (changed && !this.committing)) this.finish();
      else if (changed) {
        const liveIds = new Set(document.scene.elements.filter(e => !e.isDeleted).map(e => e.id));
        const previousSize = this.pending.size;
        for (const id of this.pending) if (!liveIds.has(id)) this.pending.delete(id);
        if (this.pending.size !== previousSize) this.emit();
        if (!this.pending.size) this.cancelTimer();
      }
    });
    this.emit();
    return () => { unsubscribe(); this.finish(); this.publish = null; };
  }

  /** Hide before commit so the first document sync cannot flash the whole batch. */
  commit = (createdIds: readonly string[], work: () => ApplyBatchResult): ApplyBatchResult => {
    if (!this.publish) return work();
    const previous = new Set(this.pending);
    for (const id of createdIds) this.pending.add(id);
    if (createdIds.length) this.emit();
    this.committing = true;
    try {
      const result = work();
      if (!result.ok) { this.pending = previous; this.emit(); }
      return result;
    } catch (error) {
      this.pending = previous; this.emit();
      throw error;
    } finally {
      this.committing = false;
      this.schedule();
    }
  };

  finish = () => {
    this.cancelTimer();
    if (!this.pending.size) return;
    this.pending.clear(); this.emit();
  };

  private emit() {
    const pending = [...this.pending];
    this.publish?.(pending);
    for (const listener of this.listeners) listener(pending);
  }

  private schedule() {
    if (this.timer !== null || !this.pending.size) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const next = this.pending.values().next();
      if (!next.done) this.pending.delete(next.value);
      this.emit(); this.schedule();
    }, AI_ELEMENT_REVEAL_INTERVAL_MS);
  }

  private cancelTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
