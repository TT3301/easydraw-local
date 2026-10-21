import type { EasyDrawFrameLikeElement } from "../element/types";
import type { StaticCanvasAppState } from "../types";
import { FRAME_STYLE } from "../constants";
import { getCornerRadius } from "../shapes";

export const getPageRadius = (page: EasyDrawFrameLikeElement, zoom: number) =>
  page.type === "magicframe"
    ? FRAME_STYLE.radius / zoom
    : page.roundness ? getCornerRadius(Math.min(page.width, page.height), page) : 0;

/** Page backgrounds are a render pass, never synthetic document elements. */
export const drawPageBackground = (
  page: EasyDrawFrameLikeElement,
  context: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
) => {
  if (page.type !== "frame" || page.backgroundColor === "transparent") return;
  context.save();
  context.translate(page.x + appState.scrollX, page.y + appState.scrollY);
  context.globalAlpha = page.opacity / 100;
  context.fillStyle = page.backgroundColor;
  const radius = getPageRadius(page, appState.zoom.value);
  context.beginPath();
  if (context.roundRect) context.roundRect(0, 0, page.width, page.height, radius);
  else context.rect(0, 0, page.width, page.height);
  context.fill();
  context.restore();
};
