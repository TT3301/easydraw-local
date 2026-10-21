import { applyTreeOperation, type TreeOperation } from "../features/canvases/project-tree";
import { allProjectElements, selectProjectCanvas, serializeProjectDocument, normalizeSceneElements, reconcilePageAggregates } from "@easydraw/document-model";
import { createElementFromInput, updateElementFromInput, safeUpdateElementFromInput } from "./element-commands";
import { applyProjectChange, calculateProjectChange, invertProjectChange, type ProjectChange } from "./project-change";
import {
  OperationBatchSchema,
  ProjectDocumentSchema,
  SceneElementSchema,
  type ApplyBatchResult,
  type OperationBatch,
  type ProjectAsset,
  type ProjectDocument,
  type SceneElement,
  type TransactionRecord,
} from "./protocol";

interface HistoryEntry {
  change: ProjectChange[];
  transaction: TransactionRecord;
}

const HISTORY_LIMIT = 50;

const resolveManualFocus = (
  currentPageId: string | null,
  elements: readonly SceneElement[],
) => {
  const pages = elements
    .filter((element) => element.type === "frame")
    .sort((left, right) => left.order - right.order);
  return pages.some((page) => page.id === currentPageId)
    ? currentPageId
    : pages[0]?.id ?? null;
};

export interface ControllerSnapshot {
  document: ProjectDocument;
  canUndo: boolean;
  canRedo: boolean;
  lastTransaction: TransactionRecord | null;
  highlightedIds: string[];
}

export type ManualCommitResult =
  | { ok: true; changed: boolean }
  | { ok: false; message: string };

const cloneDocument = (document: ProjectDocument): ProjectDocument =>
  structuredClone(document);

const transactionId = () =>
  `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const addUnique = (items: string[], id: string) => {
  if (!items.includes(id)) {
    items.push(id);
  }
};

const diffElements = (before: ProjectDocument, after: ProjectDocument) => {
  const beforeById = new Map(allProjectElements(before).map(element => [element.id, element]));
  const afterById = new Map(allProjectElements(after).map(element => [element.id, element]));
  return {
    createdIds: [...afterById.keys()].filter(id => !beforeById.has(id)),
    deletedIds: [...beforeById.keys()].filter(id => !afterById.has(id)),
    updatedIds: [...afterById].filter(([id, element]) => {
      const previous = beforeById.get(id);
      return previous && JSON.stringify(previous) !== JSON.stringify(element);
    }).map(([id]) => id),
  };
};

export class SceneController {
  private document: ProjectDocument;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<() => void>();
  private lastTransaction: TransactionRecord | null = null;
  private highlightedIds: string[] = [];
  private snapshot: ControllerSnapshot;
  private canvasEpoch = 0;
  getCanvasEpoch = () => this.canvasEpoch;

  constructor(initialDocument: ProjectDocument) {
    this.document = ProjectDocumentSchema.parse({ ...initialDocument, scene: { elements: normalizeSceneElements(initialDocument.scene.elements) } });
    this.snapshot = this.createSnapshot();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private createSnapshot(): ControllerSnapshot {
    return {
      document: this.document,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      lastTransaction: this.lastTransaction,
      highlightedIds: this.highlightedIds,
    };
  }

  private emit() {
    this.snapshot = this.createSnapshot();
    this.listeners.forEach((listener) => listener());
  }

  private recordCommit(before: ProjectDocument, after: ProjectDocument, transaction: TransactionRecord) {
    const change = invertProjectChange(calculateProjectChange(before, after));
    if (this.document.activeCanvasId !== after.activeCanvasId) this.canvasEpoch++;
    transaction.canvasId ??= before.activeCanvasId;
    this.document = after;
    this.undoStack.push({ change, transaction });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.lastTransaction = transaction;
    this.highlightedIds = transaction.source === "ai"
      ? [...transaction.createdIds, ...transaction.updatedIds] : [];
    this.emit();
  }

  switchCanvas(id: string) {
    if (!Object.hasOwn(this.document.canvases, id)) throw new Error("画布不存在");
    if (this.document.activeCanvasId === id) return;
    this.document = selectProjectCanvas(serializeProjectDocument(this.document), id);
    this.canvasEpoch++; this.highlightedIds = []; this.emit();
  }

  manageTree(operation: TreeOperation, source: "human" | "ai" = "human") {
    let id: string | null = null;
    const update = (draft: ProjectDocument) => { id = applyTreeOperation(draft, operation); };
    const label = ({ create: "新建", rename: "重命名", move: "移动", delete: "删除", duplicate: "复制画布" })[operation.op];
    const result = source === "ai" ? this.commitAiProjectChange(label, this.document.revision, update) : this.commitProjectChange(label, update);
    if (!result.ok) throw new Error(result.message);
    return id;
  }

  applyBatch(
    input: OperationBatch,
    source: TransactionRecord["source"] = "ai",
    assets: ProjectAsset[] = [],
  ): ApplyBatchResult {
    if (!this.document.activeCanvasId) return { ok: false, code: "VALIDATION_FAILED", message: "请先新建画布", revision: this.document.revision };
    const parsed = OperationBatchSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        message: parsed.error.issues[0]?.message ?? "操作参数无效",
        revision: this.document.revision,
      };
    }

    const batch = parsed.data;
    if (batch.baseRevision !== this.document.revision) {
      return {
        ok: false,
        code: "REVISION_CONFLICT",
        message: `操作基于修订 ${batch.baseRevision}，当前修订为 ${this.document.revision}`,
        revision: this.document.revision,
      };
    }

    const scope = batch.scopeElementId
      ? this.document.scene.elements.find(
          (element) => element.id === batch.scopeElementId,
        )
      : null;
    if (batch.scopeElementId && !scope) {
      return {
        ok: false,
        code: "SCOPE_NOT_FOUND",
        message: `作用域元素 ${batch.scopeElementId} 不存在`,
        revision: this.document.revision,
      };
    }

    const before = this.document;
    const next = cloneDocument(this.document);
    const elements = next.scene.elements;
    const createdIds: string[] = [];
    const updatedIds: string[] = [];
    const deletedIds: string[] = [];

    for (const operation of batch.operations) {
      if (operation.op === "create") {
        if (
          elements.some((element) => element.id === operation.element.id)
        ) {
          return {
            ok: false,
            code: "DUPLICATE_ELEMENT_ID",
            message: `元素 ${operation.element.id} 已存在`,
            revision: this.document.revision,
          };
        }

        const candidate =
          operation.element.type !== "page" &&
          operation.element.containerId === null &&
          scope?.type === "frame"
            ? { ...operation.element, containerId: scope.id }
            : operation.element;
        elements.push(createElementFromInput(candidate));
        createdIds.push(operation.element.id);
        continue;
      }

      const elementIndex = elements.findIndex(
        (element) => element.id === operation.id,
      );
      if (elementIndex < 0) {
        return {
          ok: false,
          code: "ELEMENT_NOT_FOUND",
          message: `元素 ${operation.id} 不存在`,
          revision: this.document.revision,
        };
      }

      if (operation.op === "delete") {
        elements.splice(elementIndex, 1);
        deletedIds.push(operation.id);
        continue;
      }

      const current = elements[elementIndex];
      const candidate = updateElementFromInput(current, operation.patch);
      elements[elementIndex] = candidate;
      addUnique(updatedIds, operation.id);

      if (current.type === "frame" && candidate.type === "frame") {
        const deltaX = candidate.x - current.x;
        const deltaY = candidate.y - current.y;
        if (deltaX !== 0 || deltaY !== 0) {
          for (let index = 0; index < elements.length; index += 1) {
            const child = elements[index];
            if (child.type === "frame" || child.frameId !== current.id) {
              continue;
            }
            elements[index] = SceneElementSchema.parse({
              ...child,
              x: child.x + deltaX,
              y: child.y + deltaY,
              version: child.version + 1,
              versionNonce: child.versionNonce + 1,
              updated: Date.now(),
            });
            addUnique(updatedIds, child.id);
          }
        }
      }
    }

    for (const asset of assets) {
      if (!next.assets.some((item) => item.id === asset.id)) {
        next.assets.push(asset);
      }
    }

    next.scene.elements = normalizeSceneElements(reconcilePageAggregates(next.scene.elements, before.scene.elements).filter((element) => !element.isDeleted));
    const liveIds = new Set(next.scene.elements.map((element) => element.id));
    for (const element of before.scene.elements) {
      if (!liveIds.has(element.id)) addUnique(deletedIds, element.id);
    }
    next.revision += 1;
    next.updatedAt = new Date().toISOString();
    const validated = ProjectDocumentSchema.safeParse(next);
    if (!validated.success) {
      return {
        ok: false,
        code: "INVALID_CONTAINER",
        message:
          validated.error.issues[0]?.message ?? "页面容器关系验证失败",
        revision: this.document.revision,
      };
    }

    const transaction: TransactionRecord = {
      id: transactionId(),
      label: batch.transactionLabel,
      source,
      beforeRevision: before.revision,
      afterRevision: validated.data.revision,
      createdIds,
      updatedIds,
      deletedIds,
      committedAt: validated.data.updatedAt,
    };

    this.recordCommit(before, validated.data, transaction);

    return {
      ok: true,
      transaction,
      revision: validated.data.revision,
    };
  }

  replaceDocument(document: ProjectDocument) {
    this.document = ProjectDocumentSchema.parse({ ...document, scene: { elements: normalizeSceneElements(document.scene.elements) } });
    this.canvasEpoch++;
    this.undoStack = [];
    this.redoStack = [];
    this.lastTransaction = null;
    this.highlightedIds = [];
    this.emit();
  }

  setFocusedPage(pageElementId: string | null) {
    if (this.document.focusedPageElementId === pageElementId) {
      return true;
    }
    const page = this.document.scene.elements.find(
      (element) => element.id === pageElementId && element.type === "frame",
    );
    if (pageElementId !== null && !page) {
      return false;
    }
    const next = cloneDocument(this.document);
    next.focusedPageElementId = pageElementId;
    next.updatedAt = new Date().toISOString();
    this.document = ProjectDocumentSchema.parse(next);
    this.highlightedIds = [];
    this.emit();
    return true;
  }

  commitAiProjectChange(
    label: string,
    baseRevision: number,
    update: (draft: ProjectDocument) => void,
    options: { reconcileContainers?: boolean } = {},
  ): ApplyBatchResult {
    if (baseRevision !== this.document.revision) {
      return {
        ok: false,
        code: "REVISION_CONFLICT",
        message: `操作基于修订 ${baseRevision}，当前修订为 ${this.document.revision}`,
        revision: this.document.revision,
      };
    }

    const before = this.document;
    const next = cloneDocument(this.document);
    try {
      update(next);
    } catch (error) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        message: error instanceof Error ? error.message : String(error),
        revision: this.document.revision,
      };
    }
    next.scene.elements = normalizeSceneElements((options.reconcileContainers === false ? next.scene.elements : reconcilePageAggregates(next.scene.elements, before.scene.elements)).filter((element) => !element.isDeleted));
    next.revision += 1;
    next.updatedAt = new Date().toISOString();
    const validated = ProjectDocumentSchema.safeParse(next);
    if (!validated.success) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        message:
          validated.error.issues[0]?.message ?? "项目状态验证失败",
        revision: this.document.revision,
      };
    }

    const { createdIds, updatedIds, deletedIds } = diffElements(before, validated.data);
    const transaction: TransactionRecord = {
      id: transactionId(),
      label,
      source: "ai",
      beforeRevision: before.revision,
      afterRevision: validated.data.revision,
      createdIds,
      updatedIds,
      deletedIds,
      committedAt: validated.data.updatedAt,
    };

    this.recordCommit(before, validated.data, transaction);
    return {
      ok: true,
      transaction,
      revision: validated.data.revision,
    };
  }

  commitProjectChange(
    label: string,
    update: (draft: ProjectDocument) => void,
  ): ManualCommitResult {
    const before = this.document;
    const next = cloneDocument(this.document);
    try { update(next); } catch (error) { return { ok: false, message: (error as Error).message }; }
    next.scene.elements = normalizeSceneElements(reconcilePageAggregates(next.scene.elements, before.scene.elements).filter((element) => !element.isDeleted));
    next.revision += 1;
    next.updatedAt = new Date().toISOString();
    const validated = ProjectDocumentSchema.safeParse(next);
    if (!validated.success) {
      return {
        ok: false,
        message:
          validated.error.issues[0]?.message ?? "项目状态验证失败",
      };
    }
    if (
      JSON.stringify({ ...before, revision: 0, updatedAt: "" }) ===
      JSON.stringify({ ...validated.data, revision: 0, updatedAt: "" })
    ) {
      return { ok: true, changed: false };
    }

    const { createdIds, updatedIds, deletedIds } = diffElements(before, validated.data);
    const transaction: TransactionRecord = {
      id: transactionId(),
      label,
      source: "human",
      beforeRevision: before.revision,
      afterRevision: validated.data.revision,
      createdIds,
      updatedIds,
      deletedIds,
      committedAt: validated.data.updatedAt,
    };

    this.recordCommit(before, validated.data, transaction);
    return { ok: true, changed: true };
  }

  undoAiTransaction(transactionId?: string) {
    const entry = this.undoStack[this.undoStack.length - 1];
    if (
      !entry ||
      entry.transaction.source !== "ai" ||
      (transactionId && entry.transaction.id !== transactionId)
    ) {
      return false;
    }
    return this.undo();
  }

  commitManualElements(elements: SceneElement[]): ManualCommitResult {
    if (!this.document.activeCanvasId) return { ok: false, message: "请先新建画布" };
    const parsedElements = SceneElementSchema.array().safeParse(elements);
    if (!parsedElements.success) {
      return {
        ok: false,
        message:
          parsedElements.error.issues[0]?.message ??
          "手动画布状态验证失败",
      };
    }
    const normalizedElements = normalizeSceneElements(parsedElements.data);
    if (
      JSON.stringify(this.document.scene.elements) ===
      JSON.stringify(normalizedElements)
    ) {
      return { ok: true, changed: false };
    }

    const before = this.document;
    const next = cloneDocument(this.document);
    next.scene.elements = normalizedElements;
    next.focusedPageElementId = resolveManualFocus(
      next.focusedPageElementId,
      normalizedElements,
    );
    next.scene.elements = normalizeSceneElements(reconcilePageAggregates(next.scene.elements, before.scene.elements).filter((element) => !element.isDeleted));
    next.revision += 1;
    next.updatedAt = new Date().toISOString();
    const validated = ProjectDocumentSchema.safeParse(next);
    if (!validated.success) {
      return {
        ok: false,
        message:
          validated.error.issues[0]?.message ?? "手动画布状态验证失败",
      };
    }

    const { createdIds, updatedIds, deletedIds } = diffElements(before, validated.data);

    const transaction: TransactionRecord = {
      id: transactionId(),
      label: "手动画布调整",
      source: "human",
      beforeRevision: before.revision,
      afterRevision: validated.data.revision,
      createdIds,
      updatedIds,
      deletedIds,
      committedAt: validated.data.updatedAt,
    };

    this.recordCommit(before, validated.data, transaction);
    return { ok: true, changed: true };
  }

  private restoreEntry(entry: HistoryEntry) {
    const next = applyProjectChange(this.document, entry.change);
    const id = entry.transaction.canvasId && Object.hasOwn(next.canvases, entry.transaction.canvasId)
      ? entry.transaction.canvasId : next.activeCanvasId;
    const selected = selectProjectCanvas(next, id);
    const focus = this.document.focusedPageElementId;
    if (selected.scene.elements.some(element => element.id === focus && element.type === "frame")) {
      selected.focusedPageElementId = focus;
    }
    // Validate before changing either the document or its history stacks.
    const validated = ProjectDocumentSchema.parse(selected);
    if (id !== this.document.activeCanvasId) this.canvasEpoch++;
    this.document = validated;
  }

  undo() {
    const entry = this.undoStack[this.undoStack.length - 1];
    if (!entry) {
      return false;
    }
    this.restoreEntry(entry);
    this.undoStack.pop();
    this.redoStack.push({ ...entry, change: invertProjectChange(entry.change) });
    this.lastTransaction = {
      ...entry.transaction,
      label: `已撤销：${entry.transaction.label}`,
    };
    this.highlightedIds = [];
    this.emit();
    return true;
  }

  redo() {
    const entry = this.redoStack[this.redoStack.length - 1];
    if (!entry) {
      return false;
    }
    this.restoreEntry(entry);
    this.redoStack.pop();
    this.undoStack.push({ ...entry, change: invertProjectChange(entry.change) });
    this.lastTransaction = {
      ...entry.transaction,
      label: `已重做：${entry.transaction.label}`,
    };
    this.highlightedIds = [
      ...entry.transaction.createdIds,
      ...entry.transaction.updatedIds,
    ];
    this.emit();
    return true;
  }

  getHistory() {
    return {
      undo: this.undoStack.map(entry => structuredClone(entry.transaction)),
      redo: this.redoStack.map(entry => structuredClone(entry.transaction)),
    };
  }

  clearHighlight() {
    if (this.highlightedIds.length === 0) {
      return;
    }
    this.highlightedIds = [];
    this.emit();
  }
}
