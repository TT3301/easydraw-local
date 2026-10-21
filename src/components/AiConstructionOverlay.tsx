import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { getPageRadius } from "@easydraw/canvas-engine/editor/renderer/page";
import type { PageElement } from "../core/protocol";
import { translate, type AppLocale } from "../core/i18n";

export interface CanvasViewportTransform {
  zoom: number;
  scrollX: number;
  scrollY: number;
  offsetLeft: number;
  offsetTop: number;
}

export interface AiConstructionPage {
  page: PageElement;
  phase: "active" | "leaving";
}

interface AiConstructionOverlayProps {
  hostRef: RefObject<HTMLDivElement | null>;
  pages: AiConstructionPage[];
  viewport: CanvasViewportTransform;
  locale: AppLocale;
}

const EXIT_DURATION_MS = 220;

export function AiConstructionOverlay({
  hostRef,
  pages,
  viewport,
  locale,
}: AiConstructionOverlayProps) {
  const [hostOrigin, setHostOrigin] = useState({ left: 0, top: 0 });
  const [visiblePages, setVisiblePages] = useState(pages);
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const previousPages = useRef(pages);

  // Task completion removes pages from the input immediately. Keep their last
  // geometry briefly so the presentation can fade without changing the document.
  useLayoutEffect(() => {
    const presentIds = new Set(pages.map(({ page }) => page.id));
    for (const { page } of pages) {
      clearTimeout(exitTimers.current.get(page.id));
      exitTimers.current.delete(page.id);
    }
    const removedPages = previousPages.current.filter(({ page }) => !presentIds.has(page.id));
    for (const { page } of removedPages) {
      const timer = setTimeout(() => {
        exitTimers.current.delete(page.id);
        setVisiblePages(current => current.filter(item => item.page.id !== page.id));
      }, EXIT_DURATION_MS);
      exitTimers.current.set(page.id, timer);
    }
    setVisiblePages(current => [
      ...pages,
      ...current.filter(({ page }) => !presentIds.has(page.id))
        .map(item => ({ ...item, phase: "leaving" as const })),
    ]);
    previousPages.current = pages;
  }, [pages]);

  useLayoutEffect(() => () => {
    for (const timer of exitTimers.current.values()) clearTimeout(timer);
    exitTimers.current.clear();
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateOrigin = () => {
      const bounds = host.getBoundingClientRect();
      setHostOrigin({ left: bounds.left, top: bounds.top });
    };

    updateOrigin();
    const observer = new ResizeObserver(updateOrigin);
    observer.observe(host);
    return () => observer.disconnect();
  }, [hostRef]);

  if (visiblePages.length === 0 || viewport.zoom <= 0) return null;

  const activePageNames = pages
    .filter(({ phase }) => phase === "active")
    .map(({ page }) => page.name);

  return (
    <div className="ai-construction-layer">
      {activePageNames.length > 0 && (
        <span className="visually-hidden" role="status" aria-live="polite">
          {translate(locale, "AI 正在编辑页面：{pages}", {
            pages: activePageNames.join(", "),
          })}
        </span>
      )}
      {visiblePages.map(({ page, phase }) => {
        const style = {
          "--ai-dot-spacing": `${16 * viewport.zoom}px`,
          "--ai-dot-radius": `${viewport.zoom}px`,
          width: page.width * viewport.zoom,
          height: page.height * viewport.zoom,
          borderRadius: getPageRadius(page, viewport.zoom) * viewport.zoom,
          transform: `translate3d(${(
            (page.x + viewport.scrollX) * viewport.zoom +
            viewport.offsetLeft -
            hostOrigin.left
          ).toFixed(2)}px, ${(
            (page.y + viewport.scrollY) * viewport.zoom +
            viewport.offsetTop -
            hostOrigin.top
          ).toFixed(2)}px, 0)`,
        } satisfies CSSProperties & Record<`--${string}`, string>;

        return (
          <div
            aria-hidden="true"
            className={`ai-construction-overlay ai-construction-overlay--${phase}`}
            data-page-id={page.id}
            key={page.id}
            style={style}
          >
            <span className="ai-construction-overlay__sweep" />
          </div>
        );
      })}
    </div>
  );
}
