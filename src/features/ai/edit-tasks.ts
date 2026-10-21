import type { EasyDrawElement } from "@easydraw/document-model";
import type { CanvasScope, ProjectDocument } from "../../core/protocol";
import { fail } from "../../core/canvas-commands";
import { elementBounds, intersects } from "../../core/canvas-geometry";
import { scopeElements } from "../../core/canvas-query";
import type { EditorRequestPorts } from "./request-ports";

interface EditTask {
  taskId: string;
  label: string;
  scope: CanvasScope;
  ttlMs: number;
  expiresAt: number;
  status: "active" | "finishing";
  pageIds: Set<string>;
  timer?: ReturnType<typeof setTimeout>;
}

/** Task lifetime is independent of document revisions and presentation playback. */
export class AiEditTasks {
  private tasks = new Map<string, EditTask>();
  private pendingIds: readonly string[] = [];
  private stopChanges: () => void;
  private stopPlayback?: () => void;

  constructor(private readonly ports: EditorRequestPorts) {
    let epoch = ports.controller.getCanvasEpoch();
    let projectId = this.document.projectId;
    this.stopChanges = ports.controller.subscribe(() => {
      const nextEpoch = ports.controller.getCanvasEpoch();
      const nextProjectId = this.document.projectId;
      if (epoch !== nextEpoch || projectId !== nextProjectId) this.clear();
      else this.refresh();
      epoch = nextEpoch;
      projectId = nextProjectId;
    });
    this.stopPlayback = ports.elementReveal?.subscribe(ids => {
      this.pendingIds = ids;
      for (const task of this.tasks.values()) if (task.status === "finishing") this.renew(task);
      this.refresh();
    });
  }

  private get document() { return this.ports.controller.getSnapshot().document; }

  begin(input: { taskId: string; label: string; scope: CanvasScope; ttlMs: number }) {
    const elements = scopeElements(this.document, input.scope);
    const existing = this.tasks.get(input.taskId);
    if (existing && (existing.label !== input.label || JSON.stringify(existing.scope) !== JSON.stringify(input.scope))) {
      fail("TASK_ID_REUSED", "Use a new taskId for a different label or scope");
    }
    if (existing?.status === "finishing") fail("TASK_FINISHING", "This task is completing; begin a new taskId");
    const pageIds = new Set(elements.flatMap(e => e.type === "frame" ? [e.id] : e.frameId ? [e.frameId] : []));
    const task: EditTask = existing ?? { ...input, status: "active", pageIds, expiresAt: 0 };
    task.ttlMs = input.ttlMs;
    this.tasks.set(input.taskId, task);
    this.renew(task);
    this.refresh();
    return !existing;
  }

  require(taskId: string | undefined): EditTask {
    if (!taskId) return fail("TASK_REQUIRED", "Call begin_task for the edit scope, then pass its taskId to apply_operations");
    const task = this.tasks.get(taskId);
    if (!task || task.expiresAt <= Date.now()) {
      if (task) { this.remove(task); this.refresh(); }
      return fail("TASK_NOT_ACTIVE", "Task ended or expired; call begin_task and retry with an active taskId", { taskId });
    }
    if (task.status !== "active") fail("TASK_FINISHING", "Task is completing; begin a new taskId", { taskId });
    return task;
  }

  assertCurrent(task: EditTask) {
    if (this.require(task.taskId) !== task) fail("TASK_NOT_ACTIVE", "Task changed while preparing this batch; retry with a new requestId");
  }

  private pagesFor(task: EditTask, documents: ProjectDocument[]) {
    const pages = new Set(task.pageIds);
    // A bounds task can be declared before its page exists. Once committed,
    // page membership survives growth and movement outside the initial bounds.
    if (task.scope.kind === "bounds") {
      const bounds = task.scope.bounds;
      for (const doc of documents) for (const e of doc.scene.elements) {
        if (e.type === "frame" && intersects(elementBounds(e), bounds)) pages.add(e.id);
      }
    }
    return pages;
  }

  private covers(task: EditTask, element: EasyDrawElement, pages: Set<string>) {
    if (task.scope.kind === "document") return true;
    if (pages.has(element.type === "frame" ? element.id : element.frameId ?? "")) return true;
    if (task.scope.kind === "elements") return !element.frameId && task.scope.ids.includes(element.id);
    if (task.scope.kind === "bounds") return intersects(elementBounds(element), task.scope.bounds);
    return false;
  }

  assertCoverage(task: EditTask, before: ProjectDocument, after: ProjectDocument, targetIds: readonly string[]) {
    const pages = this.pagesFor(task, [before, after]);
    const previous = new Map(before.scene.elements.map(e => [e.id, e]));
    const current = new Map(after.scene.elements.map(e => [e.id, e]));
    const outside = new Set<string>();
    for (const id of targetIds) {
      const old = previous.get(id), next = current.get(id);
      // Check both memberships when reparenting; deleting a page may detach its children.
      const detachedByDeletion = old?.frameId && !current.has(old.frameId) && !next?.frameId;
      if (old && !this.covers(task, old, pages)) outside.add(id);
      if (next && !this.covers(task, next, pages) && !detachedByDeletion) outside.add(id);
    }
    if (outside.size) fail("TASK_SCOPE_MISMATCH", "Batch changes elements outside this task; begin a task covering all target pages/elements and retry", {
      taskId: task.taskId, outsideIds: [...outside], scope: task.scope,
    });
  }

  committed(task: EditTask) {
    if (this.tasks.get(task.taskId) !== task) return;
    task.pageIds = this.pagesFor(task, [this.document]);
    this.renew(task);
    this.refresh();
  }

  finish(taskId: string, status: "completed" | "failed" | "cancelled") {
    const task = this.tasks.get(taskId);
    if (task) {
      if (status === "completed") task.status = "finishing";
      else this.remove(task);
      this.refresh();
    }
    return { presentationPending: this.tasks.has(taskId) };
  }

  list() {
    return [...this.tasks.values()].map(({ timer: _timer, pageIds: _pages, ttlMs: _ttl, ...task }) => task);
  }

  private renew(task: EditTask) {
    clearTimeout(task.timer);
    task.expiresAt = Date.now() + task.ttlMs;
    task.timer = setTimeout(() => { this.remove(task); this.refresh(); }, task.ttlMs);
  }

  private remove(task: EditTask) {
    clearTimeout(task.timer);
    this.tasks.delete(task.taskId);
  }

  private refresh() {
    const doc = this.document;
    const byId = new Map(doc.scene.elements.filter(e => !e.isDeleted).map(e => [e.id, e]));
    const activePages = new Set<string>();
    for (const task of this.tasks.values()) {
      const scope = task.scope;
      if ((scope.kind === "container" && !byId.has(scope.id))
        || (scope.kind === "elements" && !scope.ids.some(id => byId.has(id)))) {
        this.remove(task); continue;
      }
      const pages = this.pagesFor(task, [doc]);
      if (task.status === "finishing" && !this.pendingIds.some(id => {
        const e = byId.get(id);
        return e && this.covers(task, e, pages);
      })) { this.remove(task); continue; }
      for (const e of byId.values()) if (this.covers(task, e, pages)) {
        const pageId = e.type === "frame" ? e.id : e.frameId;
        if (pageId && byId.get(pageId)?.type === "frame") activePages.add(pageId);
      }
    }
    this.ports.setPhases(Object.fromEntries([...activePages].map(id => [id, "active" as const])));
  }

  private clear() {
    for (const task of this.tasks.values()) clearTimeout(task.timer);
    this.tasks.clear();
    this.ports.setPhases({});
  }

  dispose() { this.stopChanges(); this.stopPlayback?.(); this.clear(); }
}
