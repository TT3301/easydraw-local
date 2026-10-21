import type { EasyDrawElement } from "@easydraw/document-model";
import type { Rect } from "../../core/canvas-geometry";

export interface FrameHeightChange { frameId: string; previousHeight: number; height: number }
type MeasureBounds = (elements: EasyDrawElement[], all: EasyDrawElement[], includeStroke: boolean) => Array<Rect & { id: string }>;

/** Extend affected frames downwards without moving or resizing their members. */
export function growAiFrameHeights(before: EasyDrawElement[], elements: EasyDrawElement[], changedIds: string[], measure: MeasureBounds): FrameHeightChange[] {
  const changed = new Set(changedIds);
  const touched = new Set<string>();
  const membership = (scene: EasyDrawElement[]) => {
    const arrows = new Set(scene.filter(e => e.type === "arrow").map(e => e.id));
    return (e: EasyDrawElement) => e.type === "arrow" || (e.type === "text" && e.containerId && arrows.has(e.containerId)) ? null : e.frameId;
  };
  const currentFrameId = membership(elements);
  // Include both memberships when an element is deleted or reparented.
  for (const scene of [before, elements]) {
    const frameId = membership(scene);
    for (const e of scene) {
      if (!changed.has(e.id)) continue;
      if (e.type === "frame") touched.add(e.id);
      const owner = frameId(e);
      if (owner) touched.add(owner);
    }
  }
  const frames = elements.filter(e => e.type === "frame" && touched.has(e.id));
  if (!frames.length) return [];
  const frameIds = new Set(frames.map(e => e.id));
  const members = elements.filter(e => e.type !== "frame" && frameIds.has(currentFrameId(e) ?? ""));
  const bounds = new Map(measure(members, elements, true).map(b => [b.id, b]));
  const bottoms = new Map<string, number>();
  for (const member of members) {
    const b = bounds.get(member.id)!;
    const id = member.frameId!;
    bottoms.set(id, Math.max(bottoms.get(id) ?? -Infinity, b.y + b.height));
  }
  const changes: FrameHeightChange[] = [];
  const replacements = new Map<string, EasyDrawElement>();
  for (const frame of frames) {
    const bottom = bottoms.get(frame.id);
    if (bottom === undefined || bottom <= frame.y + frame.height) continue;
    const height = Math.ceil(bottom - frame.y);
    changes.push({ frameId: frame.id, previousHeight: frame.height, height });
    replacements.set(frame.id, { ...frame, height, version: frame.version + 1, versionNonce: frame.versionNonce + 1, updated: Date.now() });
  }
  for (let i = 0; i < elements.length; i++) elements[i] = replacements.get(elements[i].id) ?? elements[i];
  return changes;
}
