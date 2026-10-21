import type { VectorData, VectorPath } from "../../model/vector";
import type { EasyDrawElement } from "../element/types";

export type VectorElement = EasyDrawElement & { vectorData: VectorData };

export const isVectorElement = (element: EasyDrawElement): element is VectorElement =>
  element.type === "rectangle" && !!element.vectorData?.paths.length;

const pathCache = new WeakMap<VectorData, { path: Path2D; record: VectorPath }[]>();
const getPaths = (data: VectorData) => {
  const cached = pathCache.get(data);
  if (cached) return cached;
  const paths: { path: Path2D; record: VectorPath }[] = [];
  for (const record of data.paths) {
    try {
      const path = new Path2D();
      path.addPath(new Path2D(record.d), new DOMMatrix(record.transform));
      paths.push({ path, record });
    } catch {
      // An invalid path must not prevent other elements from rendering.
    }
  }
  pathCache.set(data, paths);
  return paths;
};

export const drawVectorElement = (element: VectorElement, context: CanvasRenderingContext2D) => {
  const [x, y, width, height] = element.vectorData.viewBox;
  if (!(width > 0 && height > 0 && element.width > 0 && element.height > 0)) return;
  const alpha = context.globalAlpha;
  context.save();
  context.scale(element.width / width, element.height / height);
  context.translate(-x, -y);
  for (const { path, record } of getPaths(element.vectorData)) {
    context.lineCap = record.lineCap;
    context.lineJoin = record.lineJoin;
    context.miterLimit = record.miterLimit;
    context.lineWidth = record.strokeWidth;
    if (record.fill && record.fill !== "none") {
      context.globalAlpha = alpha * record.opacity * record.fillOpacity;
      context.fillStyle = element.strokeColor;
      context.fill(path, record.fillRule);
    }
    if (record.stroke && record.stroke !== "none" && record.strokeWidth > 0) {
      context.globalAlpha = alpha * record.opacity * record.strokeOpacity;
      context.strokeStyle = element.strokeColor;
      context.stroke(path);
    }
  }
  context.restore();
};

let hitContext: CanvasRenderingContext2D | null = null;
export const hitVectorElement = (x: number, y: number, element: VectorElement, threshold: number) => {
  const [vx, vy, vw, vh] = element.vectorData.viewBox;
  if (!(vw > 0 && vh > 0 && element.width > 0 && element.height > 0)) return false;
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const cos = Math.cos(-element.angle);
  const sin = Math.sin(-element.angle);
  const px = vx + (cx + (x - cx) * cos - (y - cy) * sin - element.x) * vw / element.width;
  const py = vy + (cy + (x - cx) * sin + (y - cy) * cos - element.y) * vh / element.height;
  const tolerance = threshold * Math.max(vw / element.width, vh / element.height);
  hitContext ??= document.createElement("canvas").getContext("2d");
  if (!hitContext) return false;
  for (const { path, record } of getPaths(element.vectorData)) {
    if (record.fill && record.fill !== "none") {
      if (hitContext.isPointInPath(path, px, py, record.fillRule)) return true;
      hitContext.lineCap = "round";
      hitContext.lineJoin = "round";
      hitContext.lineWidth = tolerance * 2;
      if (tolerance > 0 && hitContext.isPointInStroke(path, px, py)) return true;
    }
    if (record.stroke && record.stroke !== "none" && record.strokeWidth > 0) {
      hitContext.lineCap = record.lineCap;
      hitContext.lineJoin = record.lineJoin;
      hitContext.miterLimit = record.miterLimit;
      hitContext.lineWidth = record.strokeWidth + tolerance * 2;
      if (hitContext.isPointInStroke(path, px, py)) return true;
    }
  }
  return false;
};
