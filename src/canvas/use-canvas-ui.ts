import { safeExportName } from "./export-names";
import type { Notice } from "../app/ports";
import { CanvasSession } from "./canvas-session";
import { CanvasViewRecorder, type SavedCanvasView } from "./canvas-view-recorder";
import { readObjectsSnapPreference, saveObjectsSnapPreference } from "./objects-snap-preference";
import { isSupportedCanvasTool } from "./canvas-tool-support";
import { EditorSession } from "../app/editor-session";

import { CaptureUpdateAction, createObjectLink, parseObjectLink, resolveObjectLink } from "@easydraw/canvas-engine";
import type { EasyDrawElement } from "@easydraw/canvas-engine/element/types";
import type { EasyDrawImperativeAPI, EasyDrawProps } from "@easydraw/canvas-engine/types";
import { getStateForZoom } from "@easydraw/canvas-engine/editor/scene/zoom";
import { useCallback, useEffect, useRef, useState } from "react";


import type { ControllerSnapshot } from "../core/scene-controller";
/** First visits show the whole canvas content, never above 100%. */
export const CANVAS_CONTENT_FIT = { viewportZoomFactor: 0.82, maxZoom: 1 } as const;
// Fit what the engine shows now; an empty canvas stays at the origin at 100%.
function fitCanvasContent(api: EasyDrawImperativeAPI) {
  const content = api.getSceneElements().filter(element => !element.isDeleted);
  if (content.length) api.scrollToContent(content, { fitToViewport: true, ...CANVAS_CONTENT_FIT, animate: false });
}
type CanvasToolType =
  | "selection"
  | "hand"
  | "frame"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "text"
  | "freedraw"
  | "eraser"
  | "laser";
const canvasToolShortcuts: Record<
  string,
  { tool: CanvasToolType; label: string; name: string }
> = {
  h: { tool: "hand", label: "H", name: "抓手" },
  v: { tool: "selection", label: "V", name: "选择" },
  e: { tool: "arrow", label: "E", name: "箭头" },
  t: { tool: "text", label: "T", name: "文本" },
  f: { tool: "frame", label: "F", name: "页面容器" },
  p: { tool: "freedraw", label: "P", name: "铅笔" },
  k: { tool: "laser", label: "K", name: "激光笔" },
};
const blockedCanvasToolShortcuts = new Set([
  "0",
  "3",
  "7",
  "9",
  "d",
]);

interface CanvasUiOptions {
  editorSession: EditorSession;
  canvasSession: CanvasSession;
  api: EasyDrawImperativeAPI | null;
  snapshot: ControllerSnapshot;
  t(key: string): string;
  setNotice(notice: Notice): void;
  canHandleShortcut(event: KeyboardEvent): boolean;
}
export function useCanvasUi({ editorSession, canvasSession, api, snapshot, t, setNotice, canHandleShortcut }: CanvasUiOptions) {
  const controller = editorSession.controller;
  const renderEpoch = controller.getCanvasEpoch();
  const sceneElements = snapshot.document.scene.elements;
  const [hasPendingEdit, setHasPendingEdit] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [objectsSnapModeEnabled, setObjectsSnapModeEnabled] = useState(readObjectsSnapPreference);
  const [activeCustomCanvasTool, setActiveCustomCanvasTool] =
    useState<"frame" | null>(null);
  const [canvasToolbar, setCanvasToolbar] = useState<HTMLElement | null>(null);
  // Views of canvases visited since the project was opened (by canvas ID). A first
  // visit fits the content; returning to a canvas keeps where the user left it.
  const [visitedViews] = useState(() => new Map<string, SavedCanvasView>());
  const [viewRecorder] = useState(() => new CanvasViewRecorder((canvasId, view) => { visitedViews.set(canvasId, view); }));
  // False until the current canvas content has been fitted into view once.
  const didFitContent = useRef(false);
  const latestApi = useRef(api);
  latestApi.current = api;
  const latestSelection = useRef<string[]>([]);
  const syncCanvas = canvasSession.sync;
  const generateLinkForSelection = useCallback((id: string, type: "element" | "group") => {
    const doc = controller.getSnapshot().document;
    if (!doc.activeCanvasId) throw new Error("画布不存在");
    return createObjectLink(doc.projectId, doc.activeCanvasId, id, type);
  }, [controller]);
  const handleLinkOpen: NonNullable<EasyDrawProps["onLinkOpen"]> = useCallback((element, event) => {
    try {
      const link = parseObjectLink(element.link ?? "", window.location.href);
      if (!link) return;
      event.preventDefault();
      const sourceScope = editorSession.capture();
      // Wait for pointer-up to finish the working-copy gesture before switching scenes.
      window.requestAnimationFrame(() => {
        if (!sourceScope.isCurrent()) return;
        try {
          const target = resolveObjectLink(canvasSession.flush(), link);
          controller.switchCanvas(target.canvasId);
          didFitContent.current = true;
          const scope = editorSession.capture();
          window.requestAnimationFrame(() => {
            if (!scope.isCurrent() || !latestApi.current) return;
            const api = latestApi.current;
            api.updateScene({ appState: { selectedElementIds: Object.fromEntries(target.elements.map(e => [e.id, true])),
              selectedGroupIds: {}, editingGroupId: null }, captureUpdate: CaptureUpdateAction.NEVER });
            api.scrollToContent(target.elements, { fitToViewport: true, viewportZoomFactor: .7, maxZoom: 1, animate: false });
          });
        } catch (error) { setNotice({ tone: "warning", text: t((error as Error).message) }); }
      });
    } catch (error) {
      event.preventDefault();
      setNotice({ tone: "warning", text: t((error as Error).message) });
    }
  }, [controller, canvasSession, editorSession, t, setNotice]);
  useEffect(() => {
    if (!api) return;
    let currentEpoch = -1;
    return canvasSession.connect(elements => {
      const changed = currentEpoch !== controller.getCanvasEpoch();
      currentEpoch = controller.getCanvasEpoch();
      if (changed) {
        viewRecorder.reset();
        setHasPendingEdit(false); latestSelection.current = []; setSelectedIds([]);
        const activeCanvasId = controller.getSnapshot().document.activeCanvasId;
        const view = activeCanvasId ? visitedViews.get(activeCanvasId) : undefined;
        // A loading engine fits its initial data itself (CANVAS_CONTENT_FIT); otherwise fit
        // in this same update so the canvas never paints an intermediate viewport.
        const loading = api.getAppState().isLoading;
        didFitContent.current = true;
        api.history.clear();
        const selection = { selectedElementIds: {}, selectedGroupIds: {}, editingGroupId: null };
        if (loading) api.updateScene({ elements, appState: selection, captureUpdate: CaptureUpdateAction.NEVER });
        else api.updateScene({ elements, appState: { ...selection, scrollX: view?.scrollX ?? 0, scrollY: view?.scrollY ?? 0,
          zoom: { value: (view?.zoom ?? 1) as any } }, captureUpdate: CaptureUpdateAction.NEVER });
        if (!view && !loading) fitCanvasContent(api);
      } else api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
    });
  }, [api, canvasSession]);
  useEffect(() => editorSession.subscribe(() => {
    // Runs before the new project document is exposed: every canvas starts unvisited.
    viewRecorder.reset();
    visitedViews.clear();
    canvasSession.reset();
    setHasPendingEdit(false);
    latestSelection.current = [];
    setSelectedIds([]);
    didFitContent.current = false;
  }), [canvasSession]);
  useEffect(() => () => viewRecorder.reset(), [viewRecorder]);

  useEffect(() => {
    const doc = snapshot.document;
    const name = doc.tree.find(n => n.id === doc.activeCanvasId)?.name ?? "画布";
    api?.updateScene({ appState: { name: safeExportName(`${doc.name}-${name}`) }, captureUpdate: CaptureUpdateAction.NEVER });
  }, [api, snapshot.document.name, snapshot.document.tree, snapshot.document.activeCanvasId]);

  useEffect(() => {
    syncCanvas();
    if (api && !didFitContent.current) {
      didFitContent.current = true;
      const scope = editorSession.capture();
      window.requestAnimationFrame(() => {
        if (!scope.isCurrent()) return;
        fitCanvasContent(api);
      });
    }
  }, [
    api,
    sceneElements,
    snapshot.document.revision,
    syncCanvas,
  ]);

  useEffect(() => {
    if (!api || snapshot.highlightedIds.length === 0) return;
    if (canvasSession.blocked) {
      // AI updates can arrive while the user is dragging. The pending scene
      // sync will carry the visual change after pointer-up; do not replace the
      // current selection in the middle of the gesture.
      controller.clearHighlight();
      return;
    }
    api.updateScene({
      appState: {
        selectedElementIds: Object.fromEntries(
          snapshot.highlightedIds.map((id) => [id, true]),
        ),
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    const timer = window.setTimeout(() => {
      if (canvasSession.blocked) {
        controller.clearHighlight();
        return;
      }
      api.updateScene({
        appState: {
          selectedElementIds: Object.fromEntries(
            latestSelection.current.map((id) => [id, true]),
          ),
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      controller.clearHighlight();
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [api, snapshot.highlightedIds]);

  const handleCanvasChange = useCallback(
    (
      elements: readonly EasyDrawElement[],
      appState: {
        selectedElementIds: Record<string, boolean>;
        activeTool?: { type: string };
        newElement?: EasyDrawElement | null;
        editingTextElement?: EasyDrawElement | null;
        cursorButton?: "up" | "down";
        isResizing?: boolean;
        isRotating?: boolean;
        selectedElementsAreBeingDragged?: boolean;
        zoom?: { value: number };
        scrollX?: number;
        scrollY?: number;
        offsetLeft?: number;
        offsetTop?: number;
        objectsSnapModeEnabled?: boolean;
      },
    ) => {
      if (renderEpoch !== controller.getCanvasEpoch()) return;
      if (typeof appState.objectsSnapModeEnabled === "boolean" && appState.objectsSnapModeEnabled !== objectsSnapModeEnabled) {
        saveObjectsSnapPreference(appState.objectsSnapModeEnabled);
        setObjectsSnapModeEnabled(appState.objectsSnapModeEnabled);
      }
      const nextActiveTool = appState.activeTool?.type;
      if (nextActiveTool && isSupportedCanvasTool(nextActiveTool)) {
        const nextCustomTool = nextActiveTool === "frame" ? "frame" : null;
        setActiveCustomCanvasTool((current) =>
          current === nextCustomTool ? current : nextCustomTool,
        );
      } else if (nextActiveTool) {
        setActiveCustomCanvasTool(null);
        window.requestAnimationFrame(() => {
          latestApi.current?.setActiveTool({ type: "selection" });
        });
      }

      const orderedElements = canvasSession.observe(elements, appState, latestApi.current?.getSceneVersion());
      setHasPendingEdit(canvasSession.hasPendingEdit);
      const hasActiveCanvasGesture = canvasSession.activeGesture;
      const activeCanvasId = controller.getSnapshot().document.activeCanvasId;
      if (activeCanvasId && appState.zoom) {
        viewRecorder.observe(activeCanvasId, {
          zoom: appState.zoom.value, scrollX: appState.scrollX ?? 0, scrollY: appState.scrollY ?? 0,
        }, hasActiveCanvasGesture);
      }
      const canvasEpoch = canvasSession.epoch;
      const rawSelectedIds = Object.keys(
        appState.selectedElementIds,
      ).filter((id) => appState.selectedElementIds[id]);
      if (
        !hasActiveCanvasGesture &&
        orderedElements !== elements
      ) {
        window.requestAnimationFrame(() => {
          if (canvasSession.activeGesture || canvasSession.epoch !== canvasEpoch) return;
          latestApi.current?.updateScene({
            elements: orderedElements,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        });
      }
      latestSelection.current = rawSelectedIds;
      setSelectedIds((current) =>
        current.length === rawSelectedIds.length && current.every((id, index) => id === rawSelectedIds[index])
          ? current
          : rawSelectedIds,
      );

    },
    [syncCanvas, renderEpoch, objectsSnapModeEnabled],
  );

  useEffect(() => {
    if (!api) {
      setCanvasToolbar(null);
      return;
    }
    const canvasRoot = document.querySelector(".canvas-wrap .easydraw");
    if (!canvasRoot) return;
    const syncToolbar = () => {
      const toolbarAnchor = canvasRoot.querySelector(
        '[data-testid="toolbar-selection"]',
      );
      const toolbar = toolbarAnchor?.closest(".Stack_horizontal");
      setCanvasToolbar((current) =>
        current === toolbar ? current : (toolbar as HTMLElement | null),
      );
      for (const { tool, label, name } of Object.values(canvasToolShortcuts)) {
        const input = canvasRoot.querySelector<HTMLElement>(
          `[data-testid="toolbar-${tool}"]`,
        );
        const toolRoot = input?.closest<HTMLElement>(".ToolIcon");
        const icon = toolRoot?.querySelector<HTMLElement>(".ToolIcon__icon");
        if (!input || !toolRoot || !icon) continue;
        input.setAttribute("aria-keyshortcuts", label);
        toolRoot.title = `${t(name)} — ${label}`;
        let keybinding =
          icon.querySelector<HTMLElement>(".ToolIcon__keybinding");
        if (!keybinding) {
          keybinding = document.createElement("span");
          keybinding.className = "ToolIcon__keybinding";
          icon.append(keybinding);
        }
        if (keybinding.textContent !== label) {
          keybinding.textContent = label;
        }
      }
    };
    syncToolbar();
    const observer = new MutationObserver(syncToolbar);
    observer.observe(canvasRoot, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [api, t]);

  useEffect(() => {
    const handleCanvasToolShortcuts = (event: KeyboardEvent) => {
      if (
        !canHandleShortcut(event) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      const shortcut = canvasToolShortcuts[key];
      if (shortcut) {
        event.preventDefault();
        event.stopImmediatePropagation();
        api?.setActiveTool({ type: shortcut.tool });
        setActiveCustomCanvasTool(shortcut.tool === "frame" ? "frame" : null);
        return;
      }
      if (blockedCanvasToolShortcuts.has(key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        api?.setActiveTool({ type: "selection" });
        setActiveCustomCanvasTool(null);
        setNotice({
          tone: "neutral",
          text: "该工具不在 EasyDraw 当前元素协议中",
        });
      }
    };
    window.addEventListener("keydown", handleCanvasToolShortcuts, true);
    return () =>
      window.removeEventListener(
        "keydown",
        handleCanvasToolShortcuts,
        true,
      );
  }, [api, canHandleShortcut]);

  const activateFrameTool = useCallback(() => {
    api?.setActiveTool({ type: "frame" });
    setActiveCustomCanvasTool("frame");
  }, [api]);

  const selectCanvasPage = useCallback(
    (pageId: string) => {
      if (!api) return;
      const target = api
        .getSceneElements()
        .find((element) => element.id === pageId);
      api.updateScene({
        appState: {
          selectedElementIds: { [pageId]: true },
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      latestSelection.current = [pageId];
      setSelectedIds([pageId]);
      if (target) {
        api.scrollToContent([target], {
          fitToViewport: false,
          animate: true,
        });
      }
    },
    [api],
  );

  const setCanvasZoom = useCallback(
    (nextPercent: number) => {
      if (!api) return;
      const state = api.getAppState();
      const bounded = Math.min(400, Math.max(10, nextPercent));
      api.updateScene({
        appState: getStateForZoom({
          viewportX: state.offsetLeft + state.width / 2,
          viewportY: state.offsetTop + state.height / 2,
          nextZoom: (bounded / 100) as typeof state.zoom.value,
        }, state),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    [api],
  );

  const select = useCallback((ids: string[]) => { latestSelection.current = ids; setSelectedIds(ids); }, []);
  const getSelection = useCallback(() => latestSelection.current, []);
  const getApi = useCallback(() => latestApi.current, []);
  const requestFit = useCallback(() => { didFitContent.current = false; }, []);
  return { selectedIds, select, getSelection, getApi, requestFit, activeCustomCanvasTool, hasPendingEdit,
    canvasToolbar, handleCanvasChange, objectsSnapModeEnabled, generateLinkForSelection, handleLinkOpen,
    activateFrameTool, selectCanvasPage, setCanvasZoom };
}
