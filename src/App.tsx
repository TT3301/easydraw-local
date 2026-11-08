import { canvasPath, type TreeOperation } from "./features/canvases/project-tree";
import { CANVAS_CONTENT_FIT, useCanvasUi } from "./canvas/use-canvas-ui";
import { useWorkspaceInteraction } from "./canvas/workspace-interaction";
import { LibrarySidebar } from "./components/LibrarySidebar";
import { IconLibraryPopover } from "./features/assets/IconLibraryPopover";
import { SettingsDialog } from "./components/SettingsDialog";
import { McpDialog } from "./components/McpDialog";
import { hasSkillUpdate, SKILL_UPDATE_STORAGE_KEY } from "./core/skill-update";
import { ApplicationMenu } from "./components/ApplicationMenu";
import { ProjectService } from "./app/project-service";
import { useAssets } from "./features/assets/use-assets";
import { useMaterials } from "./features/materials/use-materials";
import { startAiSession } from "./features/ai/ai-session";
import { AiElementRevealQueue } from "./features/ai/element-reveal-queue";

import type { Notice } from "./app/ports";
import { CanvasSession } from "./canvas/canvas-session";
import { EditorSession } from "./app/editor-session";

import { isVectorElement } from "./core/element-commands";
import { EasyDraw, MainMenu } from "@easydraw/canvas-engine";

import type { EasyDrawImperativeAPI } from "@easydraw/canvas-engine/types";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { createPortal } from "react-dom";
import easyDrawIconUrl from "../assets/branding/easydraw-icon.svg";
import leftSidebarIcon from "../assets/icons/left-sidebar.svg";
import { CanvasViewportOverlay, CanvasZoomControl } from "./components/CanvasViewportUi";

const DEFAULT_TEXT_FONT_FAMILY = 6;

import {
  connectionStateFromRuntime,
  type BridgeConnectionState,
  type McpRuntimeStatus,
  type McpConnectionInfo,
} from "./core/mcp-bridge";

import { createInitialDocument, getPageElements, type DrawableSceneElement } from "./core/protocol";

import {
  LOCALE_STORAGE_KEY,
  getInitialLocale,
  localizeRuntimeMessage,
  translate,
  type AppLocale,
} from "./core/i18n";

import { SceneController } from "./core/scene-controller";

type EasyDrawHotData = {
  controller?: SceneController;
};

const hotData = import.meta.hot?.data as EasyDrawHotData | undefined;
const initialLocale = getInitialLocale();
const controller =
  hotData?.controller ??
  new SceneController(createInitialDocument(undefined, initialLocale));
if (hotData) {
  hotData.controller = controller;
}

const editorSession = new EditorSession(controller);

type SaveState = "saved" | "saving" | "error";
type LeftPanelTab = "canvases" | "materials";
type AppMenuName = "file" | "edit" | "view" | "windows";

const HistoryIcon = ({ direction }: { direction: "undo" | "redo" }) => (
  <svg
    className="history-control__icon"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
  >
    <path
      d={
        direction === "undo"
          ? "M7.5 11 4.2 7.7 7.5 4.4M4.2 7.7h8.7a3.5 3.5 0 0 1 0 7H11"
          : "M12.5 11 15.8 7.7 12.5 4.4M15.8 7.7H7.1a3.5 3.5 0 0 0 0 7H9"
      }
    />
  </svg>
);

const connectionLabel: Record<BridgeConnectionState, string> = {
  disabled: "MCP 已关闭",
  connecting: "正在启动本地服务",
  connected: "AI 客户端已连接",
  disconnected: "等待客户端连接",
};
const saveLabel: Record<SaveState, string> = {
  saved: "已保存到本地",
  saving: "正在保存",
  error: "保存失败",
};

export default function App() {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [api, setApi] = useState<EasyDrawImperativeAPI | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canHandleShortcut = useWorkspaceInteraction(workspaceRef, canvasWrapRef);
  const [locale, setLocale] = useState<AppLocale>(initialLocale);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = useCallback(
    (message: string, values?: Record<string, string | number>) =>
      translate(locale, message, values),
    [locale],
  );
  const [connection, setConnection] =
    useState<BridgeConnectionState>("connecting");
  const [mcpRuntime, setMcpRuntime] = useState<McpRuntimeStatus | null>(null);
  const [mcpConnectionInfo, setMcpConnectionInfo] = useState<McpConnectionInfo | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [skillUpdateAvailable, setSkillUpdateAvailable] = useState(false);
  const [notice, setNotice] = useState<Notice>({
    tone: "neutral",
    text: "本地画布已就绪",
  });
  const [elementReveal] = useState(() => new AiElementRevealQueue(controller));
  const [canvasSession] = useState(() => new CanvasSession(controller,
    (text) => setNotice({ tone: "danger", text }), elementReveal.finish));
  useEffect(() => elementReveal.connect(ids => api?.setHiddenElementIds(ids)), [elementReveal, api]);
  const [projectService] = useState(() => new ProjectService(editorSession, canvasSession, window.easydrawDesktop, setNotice));
  const { projectPath, saveState, startupResolved, startupAction, startupError } =
    useSyncExternalStore(projectService.subscribe, projectService.getSnapshot);
  useEffect(() => projectService.connect(), [projectService]);
  const newProject = () => projectService.create(locale);
  const openProject = () => projectService.open();
  const saveProject = (forceSaveAs = false) => projectService.save(forceSaveAs);
  const { selectedIds, select, getSelection, getApi, requestFit, activeCustomCanvasTool, hasPendingEdit,
    canvasToolbar, handleCanvasChange, objectsSnapModeEnabled, generateLinkForSelection, handleLinkOpen,
    activateFrameTool, selectCanvasPage, setCanvasZoom } =
    useCanvasUi({ editorSession, canvasSession, api, snapshot, t, setNotice, canHandleShortcut });
  const activateCanvas = useCallback((id: string) => {
    try { canvasSession.flush(); controller.switchCanvas(id); }
    catch (error) { setNotice({ tone: "warning", text: (error as Error).message }); }
  }, [canvasSession]);
  const operateTree = useCallback((operation: TreeOperation): string | null => {
    try {
      // Renaming or reordering only touches the canvas list, so it need not wait for a
      // pointer press on the canvas — such as the click that blurs the rename input.
      // That edit still commits on pointer-up.
      const listOnly = operation.op === "rename" || operation.op === "move";
      if (!(listOnly && canvasSession.activeGesture)) canvasSession.flush();
      const id = controller.manageTree(operation);
      if (operation.op === "create" && operation.type === "canvas" && id) controller.switchCanvas(id);
      return id;
    } catch (error) { setNotice({ tone: "warning", text: (error as Error).message }); return null; }
  }, [canvasSession]);
  const rightPanelOpen = selectedIds.length > 0;
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [leftPanelTab, setLeftPanelTab] =
    useState<LeftPanelTab>("canvases");
  const [openAppMenu, setOpenAppMenu] =
    useState<AppMenuName | null>(null);
  const [aiConstructionPagePhases, setAiConstructionPagePhases] = useState<
    Record<string, "active" | "leaving">
  >({});
  const [iconLibraryOpen, setIconLibraryOpen] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(true);
  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    void window.easydrawDesktop?.setLocale(locale);
  }, [locale]);

  const pages = getPageElements(snapshot.document);
  const aiConstructionPages = pages.flatMap((item) => {
    const phase = aiConstructionPagePhases[item.id];
    return phase ? [{ page: item, phase }] : [];
  });
  const selectedPageId =
    pages.find((item) => selectedIds.includes(item.id))?.id ?? null;
  const selectedIconElements = useMemo(() => {
    const selectedIdSet = new Set(selectedIds);
    return snapshot.document.scene.elements.filter(
      (element): element is DrawableSceneElement =>
        isVectorElement(element) && selectedIdSet.has(element.id),
    );
  }, [selectedIds, snapshot.document.scene.elements]);
  const hasIconSelection = selectedIconElements.length > 0;
  const projectFileName =
    projectPath?.split(/[\\/]/).pop() ?? snapshot.document.name;
  const sceneElements = useMemo(
    () =>
      snapshot.document.scene.elements,
    [snapshot.document.assets, snapshot.document.scene.elements],
  );
  useEffect(() => {
    const desktop = window.easydrawDesktop;
    if (!desktop) { setConnection("disabled"); return; }
    if (typeof desktop.setMcpEnabled !== "function" || typeof desktop.getMcpConnectionInfo !== "function") {
      setConnection("disabled");
      setNotice({ tone: "warning", text: "请重启 EasyDraw 以加载新版 MCP 接入功能。" });
      return;
    }
    let disposed = false, observedStatus = false;
    const update = (status: McpRuntimeStatus) => {
      if (disposed) return;
      setMcpRuntime(status);
      setConnection(connectionStateFromRuntime(status));
    };
    const unsubscribe = desktop.onMcpRuntimeStatus(status => { observedStatus = true; update(status); });
    void desktop.getMcpRuntimeStatus().then(status => { if (!observedStatus) update(status); }).catch(() => {
      if (!disposed) setNotice({ tone: "warning", text: "无法读取 MCP 状态，请稍后重试。" });
    });
    void desktop.getMcpConnectionInfo().then(info => {
      if (disposed) return;
      setMcpConnectionInfo(info);
      try {
        if (!info.skillHash) throw new Error("Skill hash unavailable");
        setSkillUpdateAvailable(hasSkillUpdate(info.skillHash, window.localStorage));
      } catch {
        setNotice({ tone: "warning", text: "无法读取 Skills 更新状态，请重启 EasyDraw 后重试。" });
      }
    }).catch(() => {
      if (!disposed) setNotice({ tone: "warning", text: "无法读取 MCP 接入信息，请稍后重试。" });
    });
    return () => { disposed = true; unsubscribe(); };
  }, []);

  const setMcpEnabled = useCallback(async (enabled: boolean) => {
    const desktop = window.easydrawDesktop;
    if (!desktop || mcpLoading) return;
    setMcpLoading(true);
    try {
      const status = await desktop.setMcpEnabled(enabled);
      setMcpRuntime(status);
      setConnection(connectionStateFromRuntime(status));
    } catch {
      // A persistence failure still revokes access. Refresh instead of assuming the old state.
      const status = await desktop.getMcpRuntimeStatus().catch(() => null);
      if (status) { setMcpRuntime(status); setConnection(connectionStateFromRuntime(status)); }
      setNotice({ tone: "danger", text: !enabled && status?.enabled === false
        ? "MCP 已关闭，但开关状态未能保存。下次启动请确认访问状态。"
        : "无法更改 MCP 开关，请稍后重试。" });
    } finally { setMcpLoading(false); }
  }, [mcpLoading]);

  const acknowledgeSkillUpdate = () => {
    if (!mcpConnectionInfo?.skillHash) throw new Error("Skill hash unavailable");
    window.localStorage.setItem(SKILL_UPDATE_STORAGE_KEY, mcpConnectionInfo.skillHash);
    setSkillUpdateAvailable(false);
  };

  const assets = useAssets({ editorSession, canvasSession, api, projectPath, snapshot, selectedIds,
    select, setNotice });
  const materials = useMaterials({ editorSession, canvasSession, api, selectedIds, locale,
    select,
    showMaterials: () => setLeftPanelTab("materials"), setNotice });
  const { preloadInsertedAssets, importAsset, handleCanvasPasteCapture } = assets;
  const { materialLibraryItems, handleMaterialLibraryChange } = materials;
  useEffect(() => {
    setNoticeVisible(true);
    const timer = window.setTimeout(() => setNoticeVisible(false), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const closeMenu = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        setOpenAppMenu(null);
        setSettingsOpen(false);
        setMcpDialogOpen(false);
        setIconLibraryOpen(false);
      }
    };
    window.addEventListener("keydown", closeMenu);
    return () => window.removeEventListener("keydown", closeMenu);
  }, []);

  useEffect(() => editorSession.subscribe(() => {
    setAiConstructionPagePhases({});
  }), []);
  useEffect(() => {
    const desktop = window.easydrawDesktop;
    if (!desktop || typeof desktop.setMcpEnabled !== "function") { setConnection("disabled"); return; }
    const start = () => startAiSession(editorSession, {
      desktop,
      getApi,
      getProjectPath: () => projectService.getSnapshot().projectPath,
      isReady: () => projectService.getSnapshot().startupResolved,
      getSelection,
      setSelection: select,
      requestFit,
      flush: canvasSession.flush,
      elementReveal,
      getSaveState: () => projectService.getSnapshot().saveState,
      notify: setNotice,
      preloadAssets: preloadInsertedAssets,
      setConnection, setPhases: setAiConstructionPagePhases,
    });
    let stop = start();
    const unsubscribe = editorSession.subscribe(() => { stop?.(); stop = start(); });
    return () => { unsubscribe(); stop?.(); };
  }, [canvasSession, elementReveal, preloadInsertedAssets]);

  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !canHandleShortcut(event)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.shiftKey) redo();
        else undo();
      }
      if (key === "s") {
        event.preventDefault();
        if (startupResolved) {
          void saveProject(event.shiftKey);
        }
      }
      if (key === "o") {
        event.preventDefault();
        void openProject();
      }
      if (key === "n") {
        event.preventDefault();
        void newProject();
      }
    };
    window.addEventListener("keydown", handleShortcuts, true);
    return () => window.removeEventListener("keydown", handleShortcuts, true);
  });

  useEffect(() => {
    const desktop = window.easydrawDesktop;
    if (!desktop) return;
    return desktop.onMenuCommand((command) => {
      if (command === "new-project") {
        void newProject();
      } else if (command === "open-project") {
        void openProject();
      } else if (command === "save-project") {
        void saveProject();
      } else if (command === "save-project-as") {
        void saveProject(true);
      } else if (command === "open-settings") {
        setSettingsOpen(true);
      }
    });
  });

  useEffect(() => window.easydrawDesktop?.onOpenProjectFile(projectPath => {
    void projectService.open(projectPath);
  }), [projectService]);

  const undo = () => {
    try { canvasSession.flush(); } catch (error) { setNotice({ tone: "warning", text: (error as Error).message }); return; }
    elementReveal.finish();
    setNotice(
      controller.undo()
        ? { tone: "neutral", text: `${canvasPath(controller.getSnapshot().document.tree, controller.getSnapshot().document.activeCanvasId)} / ${controller.getSnapshot().lastTransaction?.label}` }
        : { tone: "warning", text: "没有可撤销的事务" },
    );
  };
  const redo = () => {
    try { canvasSession.flush(); } catch (error) { setNotice({ tone: "warning", text: (error as Error).message }); return; }
    elementReveal.finish();
    setNotice(
      controller.redo()
        ? { tone: "neutral", text: `${canvasPath(controller.getSnapshot().document.tree, controller.getSnapshot().document.activeCanvasId)} / ${controller.getSnapshot().lastTransaction?.label}` }
        : { tone: "warning", text: "没有可重做的事务" },
    );

  };

  const startupScreen = (
    <div className="start-screen">
      <header className="start-brand" aria-label="EasyDraw">
        <img
          className="start-brand-mark"
          src={easyDrawIconUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <span>EasyDraw</span>
      </header>
      <main className="start-content" aria-labelledby="start-title">
        <div className="start-heading">
          <h1 id="start-title">{t("开始一个项目")}</h1>
          <p>{t("打开已有项目，或选择保存位置创建新项目。")}</p>
        </div>
        <div className="start-actions" aria-busy={Boolean(startupAction)}>
          <button
            className="start-action start-action--primary"
            data-start-action="new-project"
            onClick={() => void newProject()}
            disabled={Boolean(startupAction)}
          >
            <span>{t("新建项目")}</span>
            <small>
              {startupAction === "new-project"
                ? t("正在选择保存位置")
                : t("创建空白画布并立即保存")}
            </small>
          </button>
          <button
            className="start-action start-action--secondary"
            data-start-action="open-project"
            onClick={() => void openProject()}
            disabled={Boolean(startupAction)}
          >
            <span>{t("打开项目")}</span>
            <small>
              {startupAction === "open-project"
                ? t("正在选择项目文件")
                : t("从本地继续编辑已有项目")}
            </small>
          </button>
        </div>
        <p className="start-save-note">
          {t("正式项目会在停止修改 900ms 后自动保存。")}
        </p>
        {startupError && (
          <p className="start-error" role="alert">
            {localizeRuntimeMessage(locale, startupError)}
          </p>
        )}
      </main>
    </div>
  );

  const redesignedApp = (
    <div
      ref={workspaceRef}
      className={[
        "app-shell",
        window.easydrawDesktop ? "is-desktop-shell" : "is-web-shell",
        leftPanelOpen ? "is-left-open" : "is-left-closed",
        rightPanelOpen ? "is-right-open" : "is-right-closed",
        selectedIds.length > 0 ? "has-selection" : "has-no-selection",
        hasIconSelection ? "has-icon-selection" : "",
      ].join(" ")}
    >
      <ApplicationMenu {...{ t, openAppMenu, setOpenAppMenu, newProject, openProject, saveProject, setSettingsOpen, undo, redo, leftPanelOpen, setLeftPanelOpen, setCanvasZoom }} snapshot={{ ...snapshot, canUndo: snapshot.canUndo || (hasPendingEdit && canvasSession.hasPendingEdit) }} />

      <main className="workspace">
        <div
          className="canvas-wrap"
          aria-label={t("EasyDraw 画布")}
          ref={canvasWrapRef}
          onPointerDownCapture={elementReveal.finish}
          onKeyDownCapture={elementReveal.finish}
          onPasteCapture={event => { elementReveal.finish(); handleCanvasPasteCapture(event); }}
        >
          <EasyDraw
            shouldHandleKeyboardEvent={canHandleShortcut}
            viewModeEnabled={!snapshot.document.activeCanvasId}
            documentHistory={{ undo, redo, canUndo: (snapshot.canUndo || (hasPendingEdit && canvasSession.hasPendingEdit)), canRedo: snapshot.canRedo }}
            canvasAPI={setApi}
            initialData={{
              elements: sceneElements,
              fitToContent: CANVAS_CONTENT_FIT,
              libraryItems: materialLibraryItems,
              appState: {
                viewBackgroundColor: "#eef0f3",
                currentItemRoughness: 0,
                currentItemStrokeStyle: "solid",
                currentItemFillStyle: "solid",
                currentItemFontFamily: DEFAULT_TEXT_FONT_FAMILY,
                gridSize: 8,
                objectsSnapModeEnabled,
              },
            }}
            onChange={handleCanvasChange}
            generateLinkForSelection={generateLinkForSelection}
            onLinkOpen={handleLinkOpen}
            onLibraryChange={handleMaterialLibraryChange}
            gridModeEnabled={false}
            zenModeEnabled={false}
            theme="light"
            langCode={locale}
            UIOptions={{
              tools: { image: false },
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: false,
                toggleTheme: false,
              },
            }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.Help />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
          </EasyDraw>

          {!snapshot.document.activeCanvasId && <div className="canvas-empty"><p>{t("新建画布，开始绘制")}</p><button onClick={() => operateTree({ op: "create", type: "canvas", parentId: null })}>＋ {t("新建画布")}</button></div>}

          <CanvasViewportOverlay
            api={api}
            key={`${snapshot.document.projectId}:${snapshot.document.activeCanvasId}`}
            hostRef={canvasWrapRef}
            pages={aiConstructionPages}
            locale={locale}
          />

          <div className="canvas-top-left">
            <button
              className="canvas-control"
              onClick={() => setLeftPanelOpen((current) => !current)}
              aria-label={t(leftPanelOpen ? "收起左侧边栏" : "展开左侧边栏")}
              aria-pressed={leftPanelOpen}
              title={t(leftPanelOpen ? "收起左侧边栏" : "展开左侧边栏")}
            >
              <img
                className="canvas-control__icon"
                src={leftSidebarIcon}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            </button>
            <span className="native-menu-space" aria-hidden="true" />
            <span className="project-file" title={projectFileName}>
              <span
                className={`save-indicator save-indicator--${saveState}`}
                aria-label={t(saveLabel[saveState])}
              />
              {projectFileName}
            </span>
            <div className="history-control" aria-label={t("撤销与重做")}>
              <button
                className="canvas-control"
                onClick={undo}
                disabled={!(snapshot.canUndo || (hasPendingEdit && canvasSession.hasPendingEdit))}
                aria-label={t("撤销")}
                title={t("撤销")}
              >
                <HistoryIcon direction="undo" />
              </button>
              <button
                className="canvas-control"
                onClick={redo}
                disabled={!snapshot.canRedo}
                aria-label={t("重做")}
                title={t("重做")}
              >
                <HistoryIcon direction="redo" />
              </button>
            </div>
          </div>

          <div className="canvas-top-right">
            <button
              className={`mcp-status-control mcp-status-control--${connection}`}
              onClick={() => setMcpDialogOpen(true)}
              aria-label={t("打开 AI 设置")}
              aria-haspopup="dialog"
              aria-expanded={mcpDialogOpen}
              title={t(connectionLabel[connection])}
            >
              <span
                className={`connection-dot connection-dot--${connection}`}
                aria-hidden="true"
              />
              <span>AI</span>
            </button>
            <CanvasZoomControl {...{ api, setCanvasZoom, t }} />
          </div>

      <LibrarySidebar {...{ leftPanelOpen, leftPanelTab, setLeftPanelTab, t, snapshot, activateCanvas, operateTree, materials }} />

          {canvasToolbar &&
            createPortal(
              <>
                <label
                  className="ToolIcon Shape easydraw-frame-tool"
                  title={t("页面容器（Frame）— F")}
                >
                  <input
                    id="easydraw-toolbar-frame"
                    className="ToolIcon_type_radio ToolIcon_size_medium"
                    type="radio"
                    name="editor-current-shape"
                    aria-label={t("页面容器（Frame）")}
                    aria-keyshortcuts="F"
                    data-testid="toolbar-frame"
                    checked={activeCustomCanvasTool === "frame"}
                    onChange={activateFrameTool}
                  />
                  <div className="ToolIcon__icon">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      strokeWidth="1.5"
                      stroke="currentColor"
                    >
                      <path d="M6 3v18M18 3v18M3 6h18M3 18h18" />
                    </svg>
                    <span className="ToolIcon__keybinding">F</span>
                  </div>
                </label>
                <button
                  className="ToolIcon Shape easydraw-image-tool"
                  title={t("插入图片")}
                  aria-label={t("插入图片")}
                  onClick={() => void importAsset()}
                >
                  <span className="ToolIcon__icon">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      strokeWidth="1.5"
                      stroke="currentColor"
                    >
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <circle cx="8.5" cy="9" r="1.5" />
                      <path d="m4 17 5-5 4 4 2-2 5 5" />
                    </svg>
                  </span>
                </button>
                <IconLibraryPopover
                  open={iconLibraryOpen}
                  onOpenChange={setIconLibraryOpen}
                  t={t}
                  locale={locale}
                  assets={assets}
                />
              </>,
              canvasToolbar,
            )}

          {noticeVisible && (
            <div className={`canvas-notice canvas-notice--${notice.tone}`} role="status">
              <span aria-hidden="true">
                {notice.tone === "success" ? "✓" : notice.tone === "danger" ? "!" : "i"}
              </span>
              {localizeRuntimeMessage(locale, notice.text)}
            </div>
          )}
        </div>
      </main>

      {mcpDialogOpen && <McpDialog {...{ mcpDialogOpen, setMcpDialogOpen, t, mcpRuntime, mcpConnectionInfo, mcpLoading, setMcpEnabled, skillUpdateAvailable, acknowledgeSkillUpdate }} />}

      <SettingsDialog {...{ settingsOpen, setSettingsOpen, t, locale, setLocale }} />

    </div>
  );

  if (window.easydrawDesktop && !startupResolved) return startupScreen;
  return redesignedApp;
}
