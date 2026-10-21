import type { EasyDrawElement } from "@easydraw/document-model";
export interface Rect { x: number; y: number; width: number; height: number }
export function elementBounds(element: EasyDrawElement, stroke = false): Rect {
  const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
  const cos = Math.cos(element.angle), sin = Math.sin(element.angle);
  const points = "points" in element && element.points.length
    ? element.points.map(([x, y]) => [element.x + x, element.y + y])
    : element.type === "diamond"
      ? [[cx, element.y], [element.x + element.width, cy], [cx, element.y + element.height], [element.x, cy]]
      : [[element.x, element.y], [element.x + element.width, element.y], [element.x + element.width, element.y + element.height], [element.x, element.y + element.height]];
  const rotated = points.map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]);
  let minX = Math.min(...rotated.map(p => p[0])), maxX = Math.max(...rotated.map(p => p[0]));
  let minY = Math.min(...rotated.map(p => p[1])), maxY = Math.max(...rotated.map(p => p[1]));
  if (element.type === "ellipse") {
    const rx = Math.hypot(element.width / 2 * cos, element.height / 2 * sin);
    const ry = Math.hypot(element.width / 2 * sin, element.height / 2 * cos);
    minX = cx - rx; maxX = cx + rx; minY = cy - ry; maxY = cy + ry;
  }
  const padding = stroke ? element.strokeWidth / 2 : 0;
  return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
}
export function unionBounds(bounds: Rect[]): Rect | null {
  if (!bounds.length) return null;
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y));
  return { x, y, width: Math.max(...bounds.map(b => b.x + b.width)) - x, height: Math.max(...bounds.map(b => b.y + b.height)) - y };
}
export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
export const contains = (a: Rect, b: Rect) => a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height;
