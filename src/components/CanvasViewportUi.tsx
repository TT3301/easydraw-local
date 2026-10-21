import { useEffect, useState, type RefObject } from "react";
import type { EasyDrawImperativeAPI } from "@easydraw/canvas-engine/types";
import { AiConstructionOverlay, type AiConstructionPage, type CanvasViewportTransform } from "./AiConstructionOverlay";
import type { AppLocale } from "../core/i18n";

const defaultViewport: CanvasViewportTransform = { zoom: 1, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 };
const sameViewport = (a: CanvasViewportTransform, b: CanvasViewportTransform) =>
  a.zoom === b.zoom && a.scrollX === b.scrollX && a.scrollY === b.scrollY &&
  a.offsetLeft === b.offsetLeft && a.offsetTop === b.offsetTop;

export function CanvasViewportOverlay({ api, hostRef, pages, locale }: {
  api: EasyDrawImperativeAPI | null;
  hostRef: RefObject<HTMLDivElement | null>;
  pages: AiConstructionPage[];
  locale: AppLocale;
}) {
  const [viewport, setViewport] = useState(defaultViewport);
  useEffect(() => {
    if (!api) return;
    let frame: number | null = null;
    let latest: CanvasViewportTransform | null = null;
    const update = () => {
      const state = api.getAppState();
      const next = { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY,
        offsetLeft: state.offsetLeft, offsetTop: state.offsetTop };
      if (latest && sameViewport(latest, next)) return;
      latest = next;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const next = latest!;
        const host = hostRef.current;
        if (host) {
          host.dataset.viewportZoom = String(next.zoom);
          host.dataset.viewportScrollX = String(next.scrollX);
          host.dataset.viewportScrollY = String(next.scrollY);
          host.dataset.viewportOffsetLeft = String(next.offsetLeft);
          host.dataset.viewportOffsetTop = String(next.offsetTop);
        }
        setViewport(current => sameViewport(current, next) ? current : next);
      });
    };
    const unsubscribe = api.onChange(update);
    update();
    return () => { unsubscribe(); if (frame !== null) cancelAnimationFrame(frame); };
  }, [api, hostRef]);
  return <AiConstructionOverlay {...{ hostRef, pages, viewport, locale }} />;
}

export function CanvasZoomControl({ api, setCanvasZoom, t }: {
  api: EasyDrawImperativeAPI | null;
  setCanvasZoom(percent: number): void;
  t(message: string, values?: Record<string, string | number>): string;
}) {
  const [zoomPercent, setZoomPercent] = useState(100);
  useEffect(() => {
    if (!api) return;
    const update = () => setZoomPercent(Math.round(api.getAppState().zoom.value * 100));
    const unsubscribe = api.onScrollChange(update);
    update();
    return unsubscribe;
  }, [api]);
  return <div className="zoom-control" aria-label={t("画布缩放")}>
    <button onClick={() => setCanvasZoom(zoomPercent - 10)} disabled={!api || zoomPercent <= 10} aria-label={t("缩小")}>−</button>
    <button className="zoom-value" onClick={() => setCanvasZoom(100)} disabled={!api}
      aria-label={t("当前缩放 {zoom}%，点击恢复 100%", { zoom: zoomPercent })}>{zoomPercent}%</button>
    <button onClick={() => setCanvasZoom(zoomPercent + 10)} disabled={!api || zoomPercent >= 400} aria-label={t("放大")}>+</button>
  </div>;
}
