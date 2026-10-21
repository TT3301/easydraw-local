import type { ProjectDocument } from "@easydraw/editor-contracts";
import type { SceneController } from "../core/scene-controller";

/** A generation identifies an open project instance, including reopening the same ID. */
export class EditorSession {
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(readonly controller: SceneController) {}
  getGeneration = () => this.generation;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  replace(document: ProjectDocument) {
    this.generation++;
    // Cancel old tasks before exposing the new controller document.
    this.listeners.forEach(listener => listener());
    this.controller.replaceDocument(document);
  }
  captureProject(isAlive: () => boolean = () => true) { return this.capture(isAlive, false); }
  capture(isAlive: () => boolean = () => true, canvasScoped = true) {
    const epoch = this.controller.getCanvasEpoch();
    const generation = this.generation;
    const isCurrent = () => generation === this.generation && (!canvasScoped || epoch === this.controller.getCanvasEpoch()) && isAlive();
    const assertCurrent = () => {
      if (!isCurrent()) throw new Error("PROJECT_SESSION_EXPIRED: 项目已切换，请重新读取当前项目");
    };
    // All controller access after await is checked, not only revision writes.
    const controller = new Proxy(this.controller, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function"
          ? (...args: unknown[]) => { assertCurrent(); return value.apply(target, args); }
          : value;
      },
    });
    return { controller, isCurrent, assertCurrent };
  }
}
