import { createNativeElement, isConnectorBindingTarget, NativeElementSchema, type EasyDrawElement, type ProjectAsset } from "@easydraw/document-model";
import type { ApplyOperationsInput, ProjectDocument } from "./protocol";
import { elementBounds, unionBounds } from "./canvas-geometry";

export class CanvasCommandError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}
export const fail = (code: string, message: string, details?: unknown): never => { throw new CanvasCommandError(code, message, details); };
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export interface ResolvedAsset { asset: ProjectAsset; vectorData?: EasyDrawElement["vectorData"] }
export function executeCanvasOperations(document: ProjectDocument, input: ApplyOperationsInput, assets: Map<string, ResolvedAsset>) {
  const draft = structuredClone(document);
  const refs: Record<string, string> = Object.create(null);
  const duplicates: Array<{ operationIndex: number; ids: Record<string, string> }> = [];
  const groups: Array<{ operationIndex: number; groupId: string }> = [];
  const creationOrder: string[] = [];
  const resolve = (id: string) => refs[id] ?? id;
  for (const operation of input.operations) {
    if (operation.op === "create" && operation.ref) {
      if (refs[operation.ref] || draft.scene.elements.some(e => e.id === operation.ref)) fail("DUPLICATE_REF", operation.ref);
      refs[operation.ref] = operation.element.id ?? newId("element");
    }
  }
  const get = (id: string): EasyDrawElement => draft.scene.elements.find(e => e.id === resolve(id)) ?? fail("ELEMENT_NOT_FOUND", id);
  const touch = (element: EasyDrawElement, patch: Record<string, unknown>) => {
    const updated = NativeElementSchema.parse({ ...element, ...patch, version: element.version + 1, versionNonce: element.versionNonce + 1, updated: Date.now() });
    draft.scene.elements[draft.scene.elements.findIndex(e => e.id === element.id)] = updated;
    return updated;
  };
  const resolvePatch = (patch: Record<string, unknown>) => {
    const result = { ...patch };
    for (const key of ["frameId", "containerId"]) if (typeof result[key] === "string") result[key] = resolve(result[key] as string);
    for (const key of ["startBinding", "endBinding"]) if (result[key]) {
      const binding = result[key] as { elementId: string };
      result[key] = { ...binding, elementId: resolve(binding.elementId) };
    }
    if (result.customData === null) result.customData = undefined;
    return result;
  };
  const applyAsset = (type: string, assetRef: string | undefined): Record<string, unknown> => {
    if (!assetRef) return {};
    const resolved = assets.get(assetRef) ?? fail("ASSET_NOT_FOUND", assetRef);
    if (!draft.assets.some(asset => asset.id === resolved.asset.id)) draft.assets.push(resolved.asset);
    if (type === "image") return { fileId: resolved.asset.id, status: "saved" };
    if (resolved.vectorData) {
      if (type !== "rectangle") fail("INVALID_ASSET_TYPE", "Vector assets require a rectangle host");
      return { vectorData: resolved.vectorData, assetId: resolved.asset.id, strokeWidth: 0, roundness: null, backgroundColor: "transparent", roughness: 0 };
    }
    return fail("INVALID_ASSET_TYPE", "Raster assets require an image element");
  };
  let origin = { x: 0, y: 0 };
  if (input.coordinateSpace.kind === "container") {
    const frame = get(input.coordinateSpace.id);
    if (frame.type !== "frame" || frame.angle !== 0) fail("INVALID_COORDINATE_SPACE", "Local coordinates require an unrotated existing frame");
    origin = { x: frame.x, y: frame.y };
  }
  const expand = (ids: string[]): EasyDrawElement[] => {
    const selected = ids.map(get), selectedIds = new Set(selected.map(e => e.id));
    for (const e of selected) if (e.type === "frame") for (const child of draft.scene.elements) if (child.frameId === e.id) selectedIds.add(child.id);
    for (const e of draft.scene.elements) if (e.type === "text" && e.containerId && selectedIds.has(e.containerId)) selectedIds.add(e.id);
    return draft.scene.elements.filter(e => selectedIds.has(e.id));
  };
  const move = (ids: string[], dx: number, dy: number) => expand(ids).forEach(e => touch(e, { x: e.x + dx, y: e.y + dy }));
  const fieldsForType: Record<string, string[]> = {
    frame: ["name", "order", "exportScale"],
    text: ["text", "fontSize", "fontFamily", "textAlign", "verticalAlign", "lineHeight", "autoResize", "containerId"],
    rectangle: ["vectorData", "assetId"], image: ["fileId", "crop"],
    line: ["points", "startBinding", "endBinding", "startArrowhead", "endArrowhead"],
    arrow: ["points", "startBinding", "endBinding", "startArrowhead", "endArrowhead", "elbowed"],
    freedraw: ["points", "pressures", "simulatePressure"],
  };
  const specialized = new Set(Object.values(fieldsForType).flat());
  // Arrow styles are exclusive, as in the editor: elbow, curved (roundness) or straight.
  // An explicit curve implies elbowed:false; switching to elbow drops roundness.
  const arrowStyle = (patch: Record<string, unknown>, current?: EasyDrawElement) => {
    const result = { ...patch };
    if (result.elbowed === undefined && result.roundness) result.elbowed = false;
    if (result.elbowed === undefined && !current) result.elbowed = true;
    if (result.elbowed === true && result.roundness) fail("INVALID_ELEMENT_PROPERTY", "Elbow arrows cannot have roundness; set elbowed:false for a curved arrow");
    if (result.elbowed === true && result.roundness === undefined) result.roundness = null;
    // Leaving elbow keeps only the endpoints, like the editor's arrow type switch.
    if (current && "elbowed" in current && current.elbowed && result.elbowed === false && result.points === undefined) {
      const [[x0, y0], [x, y]] = [current.points[0], current.points[current.points.length - 1]];
      Object.assign(result, { points: [[x0, y0], [x, y]], width: Math.abs(x - x0), height: Math.abs(y - y0) });
    }
    return result;
  };
  const checkFields = (type: string, patch: Record<string, unknown>) => {
    for (const key of Object.keys(patch)) if (specialized.has(key) && !fieldsForType[type]?.includes(key)) fail("INVALID_ELEMENT_PROPERTY", `${type} does not support ${key}`);
    if (patch.frameId && type === "arrow") fail("UNSUPPORTED_CONTAINER", "Arrows belong to the canvas, not a frame");
    if (patch.frameId && type === "frame") fail("UNSUPPORTED_NESTING", "Nested frames are not supported by the current engine");
  };
  for (const [operationIndex, operation] of input.operations.entries()) {
    try {
      if (operation.op === "create") {
        const id = operation.element.id ?? (operation.ref ? refs[operation.ref] : newId("element"));
        if (draft.scene.elements.some(e => e.id === id)) fail("DUPLICATE_ELEMENT_ID", id);
        checkFields(operation.element.type, operation.element);
        if (["frame", "image", "text"].includes(operation.element.type) && (operation.element.width === 0 || operation.element.height === 0)) fail("INVALID_DIMENSIONS", "Frame, text and image dimensions must be positive");
        const resolved = resolvePatch(operation.element);
        const patch = operation.element.type === "arrow" ? arrowStyle(resolved) : resolved;
        const asset = applyAsset(operation.element.type, operation.assetRef);
        // New text fits its content unless a wrapping width is requested, as with the editor's text tool.
        const textDefaults = operation.element.type === "text" ? { autoResize: true } : {};
        const element = createNativeElement({ ...textDefaults, ...patch, ...asset, id, type: operation.element.type,
          x: operation.element.x + origin.x, y: operation.element.y + origin.y,
          width: operation.element.width, height: operation.element.height,
        });
        draft.scene.elements.push(element);
        creationOrder.push(id);
        continue;
      }
      if (operation.op === "update") {
        const element = get(operation.id);
        checkFields(element.type, operation.patch);
        const patch = element.type === "arrow" ? arrowStyle(resolvePatch(operation.patch), element) : resolvePatch(operation.patch);
        if (typeof patch.x === "number") patch.x += origin.x;
        if (typeof patch.y === "number") patch.y += origin.y;
        if (element.type === "text" && patch.text !== undefined) patch.originalText = patch.text;
        if (element.type === "frame" && (patch.x !== undefined || patch.y !== undefined)) {
          move([element.id], typeof patch.x === "number" ? patch.x - element.x : 0, typeof patch.y === "number" ? patch.y - element.y : 0);
        }
        touch(get(element.id), { ...patch, ...applyAsset(element.type, operation.assetRef) });
        continue;
      }
      if (operation.op === "fit_container") {
        const frame = get(operation.id);
        if (frame.type !== "frame") fail("INVALID_CONTAINER", frame.id);
        const b = unionBounds(draft.scene.elements.filter(e => e.frameId === frame.id).map(e => elementBounds(e)));
        if (b) touch(frame, { x: b.x - operation.padding, y: b.y - operation.padding, width: b.width + operation.padding * 2, height: b.height + operation.padding * 2 });
        continue;
      }
      const selected = operation.ids.map(get);
      if (["align", "distribute", "arrange"].includes(operation.op)) {
        const selectedIds = new Set(selected.map(e => e.id));
        if (selected.some(e => e.frameId && selectedIds.has(e.frameId))) fail("OVERLAPPING_SELECTION", "Layout cannot select a frame together with its members");
      }
      if (new Set(selected.map(e => e.id)).size !== selected.length) fail("DUPLICATE_SELECTION", "Element IDs must be unique");
      if (operation.op === "delete") {
        const removed = new Set((operation.children === "delete" ? expand(operation.ids) : selected).map(e => e.id));
        if (operation.children === "detach") {
          for (const e of draft.scene.elements) if (e.frameId && removed.has(e.frameId) && !removed.has(e.id)) touch(e, { frameId: null });
        }
        draft.scene.elements = draft.scene.elements.filter(e => !removed.has(e.id));
        for (const e of draft.scene.elements) {
          const patch: Record<string, unknown> = {};
          if (e.type === "text" && e.containerId && removed.has(e.containerId)) patch.containerId = null;
          for (const key of ["startBinding", "endBinding"] as const) if (key in e && (e as any)[key] && removed.has((e as any)[key].elementId)) patch[key] = null;
          if (Object.keys(patch).length) touch(e, patch);
        }
      } else if (operation.op === "duplicate") {
        const all = expand(operation.ids), mapping = new Map(all.map(e => [e.id, newId("element")]));
        const groups = new Map(all.flatMap(e => e.groupIds).map(id => [id, newId("group")]));
        for (const e of all) {
          const clone: Record<string, unknown> = { ...structuredClone(e), id: mapping.get(e.id), x: e.x + operation.dx, y: e.y + operation.dy, groupIds: e.groupIds.map(g => groups.get(g)), boundElements: [], index: null };
          if (e.frameId) clone.frameId = mapping.get(e.frameId) ?? e.frameId;
          if (e.type === "text" && e.containerId) clone.containerId = mapping.get(e.containerId) ?? (operation.externalBindings === "preserve" ? e.containerId : null);
          for (const key of ["startBinding", "endBinding"] as const) if ((clone as any)[key]) {
            const binding = (clone as any)[key];
            clone[key] = mapping.has(binding.elementId) ? { ...binding, elementId: mapping.get(binding.elementId) } : operation.externalBindings === "preserve" ? binding : null;
          }
          draft.scene.elements.push(NativeElementSchema.parse(clone));
          creationOrder.push(mapping.get(e.id)!);
        }
        duplicates.push({ operationIndex, ids: Object.fromEntries(mapping) });
      } else if (operation.op === "move") move(operation.ids, operation.dx, operation.dy);
      else if (operation.op === "scale" || operation.op === "rotate") {
        for (const e of expand(operation.ids)) {
          if (e.type === "frame" && operation.op === "rotate") fail("UNSUPPORTED_TRANSFORM", "Frame rotation is not supported");
          const ox = operation.origin[0] + origin.x, oy = operation.origin[1] + origin.y;
          if (operation.op === "scale") {
            const patch: Record<string, unknown> = { x: ox + (e.x - ox) * operation.factor, y: oy + (e.y - oy) * operation.factor, width: e.width * operation.factor, height: e.height * operation.factor };
            if ("points" in e) patch.points = e.points.map(([x, y]) => [x * operation.factor, y * operation.factor]);
            if (e.type === "text" && operation.scaleText) patch.fontSize = e.fontSize * operation.factor;
            if (operation.scaleStroke) patch.strokeWidth = e.strokeWidth * operation.factor;
            touch(e, patch);
          } else {
            const cx = e.x + e.width / 2 - ox, cy = e.y + e.height / 2 - oy;
            touch(e, { x: ox + cx * Math.cos(operation.angle) - cy * Math.sin(operation.angle) - e.width / 2,
              y: oy + cx * Math.sin(operation.angle) + cy * Math.cos(operation.angle) - e.height / 2, angle: e.angle + operation.angle });
          }
        }
      } else if (operation.op === "reparent") {
        const frameId = operation.frameId ? resolve(operation.frameId) : null;
        if (frameId && get(frameId).type !== "frame") fail("INVALID_CONTAINER", frameId);
        for (const e of selected) { checkFields(e.type, { frameId }); touch(e, { frameId }); }
      } else if (operation.op === "group" || operation.op === "ungroup") {
        const groupId = operation.groupId ?? newId("group");
        for (const e of selected) touch(e, { groupIds: operation.op === "group" ? [...new Set([...e.groupIds, groupId])] : e.groupIds.filter(g => g !== groupId) });
        if (operation.op === "group") groups.push({ operationIndex, groupId });
      } else if (operation.op === "reorder") {
        const parentId = selected[0].frameId;
        if (selected.some(e => e.frameId !== parentId)) fail("INVALID_SELECTION", "Reorder operates on siblings with the same frameId");
        if (operation.referenceId && get(operation.referenceId).frameId !== parentId) fail("INVALID_SELECTION", "The reference must have the same frameId");
        const wanted = new Set(selected.map(e => e.id));
        const rest = draft.scene.elements.filter(e => !wanted.has(e.id));
        let at = operation.position === "front" ? rest.length : 0;
        if (operation.position === "before" || operation.position === "after") {
          if (!operation.referenceId) fail("MISSING_REFERENCE", "referenceId is required");
          at = rest.findIndex(e => e.id === resolve(operation.referenceId!));
          if (at < 0) fail("ELEMENT_NOT_FOUND", operation.referenceId!);
          if (operation.position === "after") at++;
        }
        rest.splice(at, 0, ...draft.scene.elements.filter(e => wanted.has(e.id)));
        draft.scene.elements = rest.map(e => ({ ...e, index: null }));
      } else if (operation.op === "align") {
        const b = operation.reference ? { ...operation.reference, x: operation.reference.x + origin.x, y: operation.reference.y + origin.y } : unionBounds(selected.map(e => elementBounds(e)))!;
        for (const e of selected) {
          const eb = elementBounds(e);
          const horizontal = ["left", "center-x", "right"].includes(operation.alignment);
          const dx = operation.alignment === "left" ? b.x - eb.x : operation.alignment === "right" ? b.x + b.width - eb.x - eb.width : b.x + b.width / 2 - eb.x - eb.width / 2;
          const dy = operation.alignment === "top" ? b.y - eb.y : operation.alignment === "bottom" ? b.y + b.height - eb.y - eb.height : b.y + b.height / 2 - eb.y - eb.height / 2;
          move([e.id], horizontal ? dx : 0, horizontal ? 0 : dy);
        }
      } else if (operation.op === "distribute") {
        if (selected.length < 2) fail("INVALID_SELECTION", "Distribution requires at least two elements");
        const horizontal = operation.axis === "horizontal";
        const sorted = selected.sort((a, b) => horizontal ? a.x - b.x : a.y - b.y);
        const bs = sorted.map(e => elementBounds(e)), pos = horizontal ? "x" : "y", size = horizontal ? "width" : "height";
        const gap = operation.gap ?? (bs[bs.length - 1][pos] + bs[bs.length - 1][size] - bs[0][pos] - bs.reduce((s, b) => s + b[size], 0)) / (bs.length - 1);
        let cursor = bs[0][pos];
        sorted.forEach((e, i) => { move([e.id], horizontal ? cursor - bs[i].x : 0, horizontal ? 0 : cursor - bs[i].y); cursor += bs[i][size] + gap; });
      } else if (operation.op === "arrange") {
        const sizes = selected.map(e => elementBounds(e)), cw = Math.max(...sizes.map(b => b.width)), ch = Math.max(...sizes.map(b => b.height));
        selected.forEach((e, i) => move([e.id], operation.origin[0] + origin.x + i % operation.columns * (cw + operation.gapX) - sizes[i].x, operation.origin[1] + origin.y + Math.floor(i / operation.columns) * (ch + operation.gapY) - sizes[i].y));
      }
    } catch (error) {
      if (error instanceof CanvasCommandError) throw new CanvasCommandError(error.code, error.message, { operationIndex, ...error.details as object });
      fail("VALIDATION_FAILED", error instanceof Error ? error.message : String(error), { operationIndex });
    }
  }
  // Rebuild reverse references from authoritative forward references.
  const byId = new Map(draft.scene.elements.map(e => [e.id, e]));
  const bound = new Map<string, Array<{ id: string; type: "arrow" | "text" }>>();
  for (const e of draft.scene.elements) {
    if (e.type === "frame" && (e.frameId || e.angle !== 0)) fail("UNSUPPORTED_NESTING", "Frames must be unrotated and top-level");
    const refs = e.type === "text" && e.containerId ? [{ id: e.containerId, type: "text" as const, field: "containerId" }]
      : e.type === "arrow" || e.type === "line" ? (["startBinding", "endBinding"] as const).flatMap(field => e[field] ? [{ id: e[field]!.elementId, type: "arrow" as const, field }] : []) : [];
    for (const ref of refs) {
      const target = byId.get(ref.id);
      const details = { elementId: e.id, elementType: e.type, field: ref.field, targetId: ref.id, targetType: target?.type ?? null };
      if (!target) fail("INVALID_BINDING", `${e.type} ${e.id} ${ref.field} references missing element ${ref.id}`, details);
      const allowed = target!.id !== e.id && (e.type === "text" ? ["rectangle", "diamond", "ellipse", "arrow"].includes(target!.type) : isConnectorBindingTarget(target!));
      if (!allowed) fail("INVALID_BINDING", `${e.type} ${e.id} ${ref.field} cannot bind to ${target!.type} ${ref.id}; ${e.type === "text" ? "text containers must be rectangle, diamond, ellipse or arrow" : "connectors bind only to rectangle, diamond, ellipse, image, free text or frame"}`, details);
      const list = bound.get(ref.id) ?? [];
      if (!list.some(b => b.id === e.id)) list.push({ id: e.id, type: ref.type });
      bound.set(ref.id, list);
    }
    const assetId = e.type === "image" ? e.fileId : e.assetId;
    if (assetId && !draft.assets.some(a => a.id === assetId)) fail("ASSET_NOT_FOUND", assetId);
  }
  draft.scene.elements = draft.scene.elements.map(e => ({ ...e, boundElements: bound.get(e.id) ?? [] }));
  if (!draft.scene.elements.some(e => e.id === draft.focusedPageElementId && e.type === "frame")) draft.focusedPageElementId = draft.scene.elements.find(e => e.type === "frame")?.id ?? null;
  return { draft, idMap: refs, duplicates, groups, creationOrder };
}
