import { z } from "zod";
import { FONT_FAMILY, NativeProjectDocumentSchema } from "@easydraw/document-model";
import { CaptureUpdateAction } from "@easydraw/canvas-engine";
import { CANVAS_TOOL_SCHEMAS, CanvasElementTypeSchema, CanvasOperationSchema, CanvasElementCreateSchema,
  type CanvasMethod, type ProjectDocument } from "../../core/protocol";
import { executeCanvasOperations, fail, type ResolvedAsset } from "../../core/canvas-commands";
import { canvasOutline, scopeElements } from "../../core/canvas-query";
import { contains, intersects, unionBounds } from "../../core/canvas-geometry";
import { CanvasAssets } from "./canvas-assets";
import { layoutCanvasText, measureCanvasText, reconcileCanvasBindings, renderedBounds } from "./canvas-runtime";
import { renderCanvasScope } from "./canvas-output";
import { growAiFrameHeights } from "./frame-height";
import type { EditorRequestPorts } from "./request-ports";
import { AiEditTasks } from "./edit-tasks";

export function createEditorRequestHandler(ports: EditorRequestPorts) {
  const controller = ports.controller, assets = new CanvasAssets(ports);
  const tasks = new AiEditTasks(ports);
  const replay = new Map<string, { fingerprint: string; promise: Promise<unknown> }>();
  let disposed = false;
  let observed = structuredClone(controller.getSnapshot().document);
  const changes: Array<{ fromRevision: number; revision: number; canvasId: string | null; createdIds: string[]; updatedIds: string[]; deletedIds: string[]; assetsChanged: boolean }> = [];
  const stopChanges = controller.subscribe(() => {
    const next = controller.getSnapshot().document;
    if (observed.projectId !== next.projectId) { changes.length = 0; replay.clear(); observed = structuredClone(next); return; }
    if (observed.activeCanvasId !== next.activeCanvasId) {
      if (observed.revision === next.revision) { observed = structuredClone(next); return; }
    }
    if (observed.revision === next.revision) return;
    const ids = new Set([...Object.keys(observed.canvases), ...Object.keys(next.canvases)]);
    for (const canvasId of ids) {
      const previous = new Map((observed.canvases[canvasId]?.scene.elements ?? []).map(e => [e.id, e]));
      const current = new Map((next.canvases[canvasId]?.scene.elements ?? []).map(e => [e.id, e]));
      changes.push({ fromRevision: observed.revision, revision: next.revision, canvasId,
        createdIds: [...current.keys()].filter(id => !previous.has(id)), deletedIds: [...previous.keys()].filter(id => !current.has(id)),
        updatedIds: [...current].filter(([id, e]) => previous.has(id) && JSON.stringify(previous.get(id)) !== JSON.stringify(e)).map(([id]) => id),
        assetsChanged: JSON.stringify(observed.assets) !== JSON.stringify(next.assets) });
    }
    const revisions = [...new Set(changes.map(c => c.revision))];
    if (revisions.length > 100) while (changes.length && changes[0].revision === revisions[0]) changes.shift();
    observed = structuredClone(next);
  });
  const assertActive = () => { if (disposed) fail("PROJECT_SESSION_EXPIRED", "Canvas session ended"); ports.assertActive?.(); };
  const idempotent = async (kind: string, input: { requestId: string }, work: () => Promise<unknown>) => {
    const key = `${kind}:${input.requestId}`, fingerprint = JSON.stringify(input);
    const cached = replay.get(key);
    if (cached) {
      if (cached.fingerprint !== fingerprint) fail("REQUEST_ID_REUSED", "A requestId must have identical parameters on retry");
      return cached.promise;
    }
    if (replay.size >= 512) fail("REQUEST_CACHE_FULL", "Session request cache is full; reopen the document before issuing new writes");
    const promise = Promise.resolve().then(work);
    replay.set(key, { fingerprint, promise });
    try { return await promise; } catch (error) { replay.delete(key); throw error; }
  };
  const handle = async (method: CanvasMethod, params: unknown): Promise<unknown> => {
    assertActive();
    if (!Object.hasOwn(CANVAS_TOOL_SCHEMAS, method)) fail("METHOD_NOT_FOUND", String(method));
    const schema = CANVAS_TOOL_SCHEMAS[method];
    const parsed = schema.safeParse(params);
    if (!parsed.success) fail("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid input", parsed.error.issues);
    const input = parsed.data as any;
    let document = controller.getSnapshot().document;
    if (method === "get_capabilities") return {
      protocolVersion: 2, documentSchemaVersion: 4, tools: Object.keys(CANVAS_TOOL_SCHEMAS),
      elementTypes: CanvasElementTypeSchema.options, operations: CanvasOperationSchema.options.map(s => s.shape.op.value),
      ...(input.includeSchemas ? { elementSchema: z.toJSONSchema(CanvasElementCreateSchema, { io: "input", unrepresentable: "any" }), operationSchema: z.toJSONSchema(CanvasOperationSchema, { io: "input", unrepresentable: "any" }) } : {}),
      fonts: FONT_FAMILY, assetSources: ["document", "builtin"], exportFormats: ["png", "svg"],
      coordinates: { unit: "canvas", angle: "radians", opacity: "0–100", frameLocalRequiresUnrotated: true },
      limits: { operations: 500, queryPage: 200, retainedChanges: 100, idempotentRequestsPerSession: 512, outputPixels: 16_000_000, outputEdge: 8192, importBase64BytesPerAsset: 8 * 1024 * 1024 },
      features: { multiCanvas: true, projectFolders: false, explicitCanvasId: true, editingTarget: "active-canvas", editTasks: "required-for-writes", freeCanvas: true, autoFrameHeight: "grow-only", nestedFrames: false, hiddenElements: false, arbitraryHistoryRollback: false, connectorFrameMembership: false, iconSelection: "english-description-vector-top1", vectorColorMode: "tint", svgImagePreservesColors: true },
    };
    if (method === "get_status") return { app: "EasyDraw", documentId: document.projectId, canvasId: document.activeCanvasId, canvasName: document.tree.find(n => n.id === document.activeCanvasId)?.name ?? null, canvasCount: Object.keys(document.canvases).length, revision: document.revision,
      ready: ports.isReady() && Boolean(ports.getApi()), saveState: ports.getSaveState?.() ?? "unknown", elementCount: document.scene.elements.length,
      tasks: tasks.list() };
    if (!ports.isReady()) fail("DOCUMENT_NOT_READY", "Open a document in EasyDraw first");
    if (input.documentId !== document.projectId) fail("DOCUMENT_MISMATCH", "The active document changed", { documentId: document.projectId, revision: document.revision });
    if (method === "get_project_tree") return { documentId: document.projectId, revision: document.revision, canvasId: document.activeCanvasId, nodes: document.tree };
    if (method === "switch_canvas") { ports.flush(); controller.switchCanvas(input.canvasId); return { documentId: document.projectId, revision: document.revision, canvasId: input.canvasId }; }
    if (method === "manage_project_tree") return idempotent(method, input, async () => {
      ports.flush();
      if (controller.getSnapshot().document.revision !== input.baseRevision) fail("REVISION_CONFLICT", "Project changed");
      const id = controller.manageTree(input.operation, "ai");
      return { ok: true, documentId: document.projectId, revision: controller.getSnapshot().document.revision, nodeId: id };
    });
    if (input.canvasId !== document.activeCanvasId || !document.activeCanvasId) fail("CANVAS_MISMATCH", "Switch to the target canvas and read its state first", { canvasId: document.activeCanvasId });
    const epoch = controller.getCanvasEpoch();
    const assertRequest = () => { assertActive(); if (epoch !== controller.getCanvasEpoch()) fail("CANVAS_SESSION_EXPIRED", "Canvas changed during request"); };
    if (input.revision !== undefined && input.revision !== document.revision) fail("SNAPSHOT_EXPIRED", "Read again at the current revision", { revision: document.revision });
    const envelope = () => ({ documentId: document.projectId, canvasId: document.activeCanvasId, revision: document.revision });
    if (method === "get_outline") return canvasOutline(document, input.scope, input.offset, input.limit);
    if (method === "query_elements") {
      const matches = scopeElements(document, input.scope).filter(e => (!input.ids || input.ids.includes(e.id)) && (!input.types || input.types.includes(e.type))
        && (!input.groupIds || input.groupIds.some((g: string) => e.groupIds.includes(g))) && (input.locked === undefined || input.locked === e.locked)
        && (!input.textQuery || [e.id, e.altText, "text" in e ? e.text : "", "name" in e ? e.name : ""].join(" ").toLowerCase().includes(input.textQuery.toLowerCase()))
        && (!input.metadata || JSON.stringify(e.customData?.[input.metadata.key]) === JSON.stringify(input.metadata.value)));
      const page = matches.slice(input.offset, input.offset + input.limit);
      return { ...envelope(), total: matches.length, offset: input.offset, nextOffset: input.offset + input.limit < matches.length ? input.offset + input.limit : null,
        elements: page.map(e => input.fields ? Object.fromEntries(["id", "type", ...input.fields].filter(k => k in e).map(k => [k, (e as any)[k]])) : e) };
    }
    if (method === "get_changes") {
      if (input.sinceRevision > document.revision) fail("INVALID_REVISION", "sinceRevision is ahead of the document");
      if (input.sinceRevision < (changes[0]?.fromRevision ?? document.revision)) fail("CHANGE_HISTORY_EXPIRED", "Use get_outline and query_elements to refresh");
      return { ...envelope(), changes: changes.filter(c => c.canvasId === input.canvasId && c.revision > input.sinceRevision) };
    }
    if (method === "get_view_state" || method === "set_view_state") {
      const api = ports.getApi() ?? fail("CANVAS_NOT_READY", "Canvas is not ready");
      if (method === "set_view_state") {
        for (const id of [...input.selection ?? [], ...input.fitIds ?? [], ...input.focusId ? [input.focusId] : []]) if (!document.scene.elements.some(e => e.id === id)) fail("ELEMENT_NOT_FOUND", id);
        if (input.selection) ports.elementReveal?.finish();
        if (input.focusId !== undefined && !controller.setFocusedPage(input.focusId)) fail("INVALID_CONTAINER", input.focusId);
        api.updateScene({ appState: { scrollX: api.getAppState().scrollX, scrollY: api.getAppState().scrollY, zoom: api.getAppState().zoom, selectedElementIds: api.getAppState().selectedElementIds, ...(input.selection ? { selectedElementIds: Object.fromEntries(input.selection.map((id: string) => [id, true])) } : {}),
          ...(input.scrollX !== undefined ? { scrollX: input.scrollX } : {}), ...(input.scrollY !== undefined ? { scrollY: input.scrollY } : {}),
          ...(input.zoom !== undefined ? { zoom: { value: input.zoom as any } } : {}) }, captureUpdate: CaptureUpdateAction.NEVER });
        if (input.selection) ports.setSelection(input.selection);
        if (input.fitIds) api.scrollToContent(document.scene.elements.filter(e => input.fitIds.includes(e.id)), { fitToViewport: true, animate: false });
      }
      const state = api.getAppState();
      return { ...envelope(), selection: ports.getSelection(), focusId: controller.getSnapshot().document.focusedPageElementId, scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom.value };
    }
    if (method === "search_assets") return { ...envelope(), ...await assets.search(input) };
    if (method === "get_assets") {
      const items = await Promise.all(input.assetRefs.map((ref: string) => assets.get(ref, input.content)));
      if (items.reduce((total, item) => total + (typeof item.data === "string" ? item.data.length : 0), 0) > 12 * 1024 * 1024) fail("OUTPUT_TOO_LARGE", "Read fewer assets; encoded content exceeds 12MB");
      assertRequest(); return { ...envelope(), items };
    }
    if (method === "import_assets") return idempotent(method, input, async () => {
      if (input.assets.reduce((n: number, asset: { data: string }) => n + asset.data.length, 0) > 16 * 1024 * 1024) fail("IMPORT_TOO_LARGE", "Import request exceeds 16MB base64");
      const items = [];
      for (const asset of input.assets) items.push(await assets.import(asset));
      assertRequest(); return { ...envelope(), items };
    });
    if (method === "apply_operations") return idempotent(method, input, async () => {
      const checkRevision = () => {
        document = controller.getSnapshot().document;
        if (input.baseRevision !== document.revision) fail("REVISION_CONFLICT", "Document changed", { revision: document.revision });
      };
      checkRevision();
      const task = input.dryRun ? null : tasks.require(input.taskId);
      const checkTask = () => { if (task) tasks.assertCurrent(task); };
      // Reorder resets engine indices for the whole array; only intended
      // reorder targets and real content changes belong to the edit scope.
      const changedIds = (draft: ProjectDocument) => {
        const before = new Map(document.scene.elements.map(e => [e.id, e]));
        return new Set(draft.scene.elements.filter(e => {
          const old = before.get(e.id);
          return !old || JSON.stringify({ ...old, index: null }) !== JSON.stringify({ ...e, index: null });
        }).map(e => e.id));
      };
      // `maintained` holds connectors that only followed their bound elements;
      // they are outside the scope check unless an operation targets them.
      const checkCoverage = (draft: ProjectDocument, idMap: Record<string, string>, maintained: ReadonlySet<string> = new Set()) => {
        if (!task) return;
        const after = new Map(draft.scene.elements.map(e => [e.id, e]));
        const targets = new Set([...changedIds(draft)].filter(id => !maintained.has(id)));
        for (const e of document.scene.elements) if (!after.has(e.id)) targets.add(e.id);
        for (const op of input.operations) {
          for (const id of op.ids ?? (op.id ? [op.id] : [])) targets.add(idMap[id] ?? id);
        }
        tasks.assertCoverage(task, document, draft, [...targets]);
      };
      // Validate targets before icon lookup or asset persistence. The geometry
      // and memberships are unchanged by removing asset selection fields.
      if (task) {
        const operations = input.operations.map((op: Record<string, unknown>) => {
          const { assetRef: _asset, iconDescription: _icon, ...native } = op;
          return native;
        });
        const preview = executeCanvasOperations(document, { ...input, operations }, new Map());
        checkCoverage(preview.draft, preview.idMap);
      }
      const { operations, iconSelections } = await assets.selectIcons(input.operations);
      assertRequest(); checkRevision(); checkTask();
      const resolved = new Map<string, ResolvedAsset>();
      for (const op of operations) if ("assetRef" in op && op.assetRef && !resolved.has(op.assetRef)) resolved.set(op.assetRef, await assets.resolve(op.assetRef, input.dryRun));
      assertRequest(); checkRevision(); checkTask();
      const { draft, idMap, duplicates, groups, creationOrder } = executeCanvasOperations(document, { ...input, operations }, resolved);
      await layoutCanvasText(document, draft);
      assertRequest(); checkRevision(); checkTask();
      const written = changedIds(draft);
      reconcileCanvasBindings(document, draft);
      const before = new Map(document.scene.elements.map(e => [e.id, e]));
      const affected = { createdIds: draft.scene.elements.filter(e => !before.has(e.id)).map(e => e.id), updatedIds: draft.scene.elements.filter(e => before.has(e.id) && JSON.stringify(before.get(e.id)) !== JSON.stringify(e)).map(e => e.id), deletedIds: [...before.keys()].filter(id => !draft.scene.elements.some(e => e.id === id)) };
      const frameHeightChanges = growAiFrameHeights(document.scene.elements, draft.scene.elements,
        [...affected.createdIds, ...affected.updatedIds, ...affected.deletedIds], renderedBounds);
      if (frameHeightChanges.length) {
        // Connectors bound to a grown page follow its new edges.
        reconcileCanvasBindings(document, draft);
        for (const e of draft.scene.elements) {
          if (before.has(e.id) && !affected.updatedIds.includes(e.id) && JSON.stringify(before.get(e.id)) !== JSON.stringify(e)) affected.updatedIds.push(e.id);
        }
      }
      const validated = NativeProjectDocumentSchema.safeParse(draft);
      if (!validated.success) fail("VALIDATION_FAILED", validated.error.issues[0]?.message ?? "Invalid document", validated.error.issues);
      if (input.dryRun) return { ok: true, ...envelope(), dryRun: true, idMap, duplicates, groups, affected, iconSelections, frameHeightChanges };
      // Binding maintenance (connector endpoints and their labels) follows
      // covered changes; it never widens the scope a task must declare.
      const connectorIds = new Set(draft.scene.elements.filter(e => e.type === "arrow" || e.type === "line").map(e => e.id));
      const maintained = new Set([...changedIds(draft)].filter(id => {
        const e = draft.scene.elements.find(element => element.id === id)!;
        const isConnector = connectorIds.has(id) || (e.type === "text" && e.containerId !== null && connectorIds.has(e.containerId));
        return isConnector && before.has(id) && !written.has(id);
      }));
      checkTask(); checkCoverage(draft, idMap, maintained);
      const commit = () => controller.commitAiProjectChange(input.label, input.baseRevision, next => {
        next.scene.elements = draft.scene.elements; next.assets = draft.assets; next.focusedPageElementId = draft.focusedPageElementId;
      }, { reconcileContainers: false });
      // Presentation order follows creation operations, independently of final z-order.
      const created = new Set(affected.createdIds);
      const result = ports.elementReveal
        ? ports.elementReveal.commit(creationOrder.filter(id => created.has(id)), commit) : commit();
      if (!result.ok) fail(result.code, result.message, { revision: result.revision });
      assets.preloadCommitted([...resolved.keys()]);
      document = controller.getSnapshot().document;
      if (task) tasks.committed(task);
      return { ...result, documentId: document.projectId, canvasId: document.activeCanvasId, idMap, duplicates, groups, affected, iconSelections, frameHeightChanges };
    });
    if (method === "begin_task") {
      const started = tasks.begin(input);
      if (started) ports.notify({ tone: "neutral", text: `AI 正在处理：${input.label}` });
      return { ok: true, ...envelope(), taskId: input.taskId };
    }
    if (method === "finish_task") {
      const presentation = tasks.finish(input.taskId, input.status);
      return { ok: true, ...envelope(), taskId: input.taskId, status: input.status, ...presentation };
    }
    if (method === "measure_text") return { ...envelope(), ...await measureCanvasText(input) };
    if (method === "get_bounds") {
      const items = renderedBounds(scopeElements(document, input.scope), document.scene.elements, input.includeStroke);
      return { ...envelope(), bounds: unionBounds(items), items };
    }
    if (method === "capture" || method === "export") {
      ports.elementReveal?.finish();
      const result = await renderCanvasScope(document, input, ports.getApi()?.getFiles() ?? null); assertRequest(); return result;
    }
    if (method === "inspect_geometry") {
      const elements = scopeElements(document, input.scope), rects = renderedBounds(elements, document.scene.elements, false);
      const issues: unknown[] = [], push = (issue: unknown) => { if (issues.length < input.limit + 1) issues.push(issue); };
      for (const [i, e] of elements.entries()) {
        if (input.checks.includes("out_of_bounds") && e.frameId) {
          const frame = document.scene.elements.find(f => f.id === e.frameId);
          if (frame && !contains(frame, rects[i])) push({ kind: "out_of_bounds", id: e.id, frameId: e.frameId });
        }
        if (input.checks.includes("overlap") && e.type !== "frame") for (let j = i + 1; j < elements.length && issues.length <= input.limit; j++) {
          if (elements[j].type !== "frame" && intersects(rects[i], rects[j])) push({ kind: "overlap", ids: [e.id, elements[j].id], method: "axis-aligned-bounds" });
        }
        if (input.checks.includes("text_overflow") && e.type === "text") {
          const measured = await measureCanvasText({ text: e.text, fontSize: e.fontSize, fontFamily: e.fontFamily, lineHeight: e.lineHeight });
          if (measured.width > e.width + 1 || measured.height > e.height + 1) push({ kind: "text_overflow", id: e.id, measured: { width: measured.width, height: measured.height }, box: { width: e.width, height: e.height } });
        }
        if (input.checks.includes("references")) {
          const assetId = e.type === "image" ? e.fileId : e.assetId;
          if (assetId && !document.assets.some(a => a.id === assetId)) push({ kind: "missing_asset", id: e.id, assetId });
          const forward = e.type === "text" ? [e.containerId] : e.type === "arrow" || e.type === "line" ? [e.startBinding?.elementId, e.endBinding?.elementId] : [];
          for (const id of forward.filter(Boolean)) if (!document.scene.elements.some(target => target.id === id)) push({ kind: "invalid_binding", id: e.id, targetId: id });
        }
      }
      assertRequest(); return { ...envelope(), issues: issues.slice(0, input.limit), truncated: issues.length > input.limit };
    }
    if (method === "history") {
      const history = controller.getHistory();
      if (input.action === "list") return { ...envelope(), undo: history.undo.slice().reverse().slice(input.offset, input.offset + input.limit), redo: history.redo.slice().reverse().slice(input.offset, input.offset + input.limit), totalUndo: history.undo.length, totalRedo: history.redo.length };
      if (input.baseRevision !== document.revision) fail("REVISION_CONFLICT", "Document changed", { revision: document.revision });
      const entry = (input.action === "undo" ? history.undo : history.redo).at(-1);
      if (!input.transactionId || entry?.id !== input.transactionId || entry?.source !== "ai") fail("HISTORY_CONFLICT", "Expected latest AI transaction does not match");
      ports.elementReveal?.finish();
      const ok = input.action === "undo" ? controller.undo() : controller.redo();
      document = controller.getSnapshot().document;
      return { ok, ...envelope(), transactionId: input.transactionId };
    }
    return fail("METHOD_NOT_FOUND", method);
  };
  handle.dispose = () => { disposed = true; stopChanges(); tasks.dispose(); replay.clear(); };
  return handle;
}
