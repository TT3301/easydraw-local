import { useEffect, useState } from "react";
import type { ActionManager } from "../actions/manager";
import type {
  EasyDrawElement,
  EasyDrawElementType,
  NonDeletedElementsMap,
  NonDeletedSceneElementsMap,
} from "../element/types";
import { t } from "../i18n";
import { useDevice } from "./App";
import {
  canChangeRoundness,
  canHaveArrowheads,
  getTargetElements,
  hasBackground,
  hasStrokeStyle,
  hasStrokeWidth,
} from "../scene";
import { SHAPES } from "../shapes";
import type { AppClassProperties, AppProps, UIAppState, Zoom } from "../types";
import { capitalizeString, isTransparent } from "../utils";
import Stack from "./Stack";
import { ToolButton } from "./ToolButton";
import { hasStrokeColor, toolIsArrow } from "../scene/comparisons";
import { trackEvent } from "../analytics";
import {
  hasBoundTextElement,
  isElbowArrow,
  isImageElement,
  isLinearElement,
  isTextElement,
} from "../element/typeChecks";
import clsx from "clsx";
import { actionToggleZenMode } from "../actions";
import { Tooltip } from "./Tooltip";
import {
  shouldAllowVerticalAlign,
  suppportsHorizontalAlign,
} from "../element/textElement";

import "./Actions.scss";
import DropdownMenu from "./dropdownMenu/DropdownMenu";
import {
  EmbedIcon,
  extraToolsIcon,
  frameToolIcon,
  mermaidLogoIcon,
  laserPointerToolIcon,
  MagicIcon,
} from "./icons";
import { KEYS } from "../keys";
import { useTunnels } from "../context/tunnels";
import { CLASSES } from "../constants";
import { alignActionsPredicate } from "../actions/actionAlign";

export const canChangeStrokeColor = (
  appState: UIAppState,
  targetElements: EasyDrawElement[],
) => {
  let commonSelectedType: EasyDrawElementType | null =
    targetElements[0]?.type || null;

  for (const element of targetElements) {
    if (element.type !== commonSelectedType) {
      commonSelectedType = null;
      break;
    }
  }

  return (
    (hasStrokeColor(appState.activeTool.type) &&
      commonSelectedType !== "image" &&
      commonSelectedType !== "frame" &&
      commonSelectedType !== "magicframe") ||
    targetElements.some((element) => hasStrokeColor(element.type))
  );
};

export const canChangeBackgroundColor = (
  appState: UIAppState,
  targetElements: EasyDrawElement[],
) => {
  return (
    hasBackground(appState.activeTool.type) ||
    targetElements.some((element) => hasBackground(element.type) || element.type === "frame")
  );
};

export const SelectedShapeActions = ({
  appState,
  elementsMap,
  renderAction,
  app,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
}) => {
  const targetElements = getTargetElements(elementsMap, appState);

  let isSingleElementBoundContainer = false;
  if (
    targetElements.length === 2 &&
    (hasBoundTextElement(targetElements[0]) ||
      hasBoundTextElement(targetElements[1]))
  ) {
    isSingleElementBoundContainer = true;
  }
  const isEditingTextOrNewElement = Boolean(
    appState.editingTextElement || appState.newElement,
  );
  const device = useDevice();
  const isRTL = document.documentElement.getAttribute("dir") === "rtl";

  const showFillIcons =
    (hasBackground(appState.activeTool.type) &&
      !isTransparent(appState.currentItemBackgroundColor)) ||
    targetElements.some(
      (element) =>
        hasBackground(element.type) && !isTransparent(element.backgroundColor),
    );

  const showLinkIcon =
    targetElements.length === 1 || isSingleElementBoundContainer;

  const showLineEditorAction =
    !appState.editingLinearElement &&
    targetElements.length === 1 &&
    isLinearElement(targetElements[0]) &&
    !isElbowArrow(targetElements[0]);

  const showCropEditorAction =
    !appState.croppingElementId &&
    targetElements.length === 1 &&
    isImageElement(targetElements[0]);

  const showAlignActions =
    !isSingleElementBoundContainer && alignActionsPredicate(appState, app);

  return (
    <div className="panelColumn">
      <div>
        {canChangeStrokeColor(appState, targetElements) &&
          renderAction("changeStrokeColor")}
      </div>
      {canChangeBackgroundColor(appState, targetElements) && (
        <div>{renderAction("changeBackgroundColor")}</div>
      )}
      {showFillIcons && renderAction("changeFillStyle")}

      {(hasStrokeWidth(appState.activeTool.type) ||
        targetElements.some((element) => hasStrokeWidth(element.type))) &&
        renderAction("changeStrokeWidth")}

      {(appState.activeTool.type === "freedraw" ||
        targetElements.some((element) => element.type === "freedraw")) &&
        renderAction("changeStrokeShape")}

      {(hasStrokeStyle(appState.activeTool.type) ||
        targetElements.some((element) => hasStrokeStyle(element.type))) && (
        <>
          {renderAction("changeStrokeStyle")}
          {renderAction("changeSloppiness")}
        </>
      )}

      {(canChangeRoundness(appState.activeTool.type) ||
        targetElements.some((element) => canChangeRoundness(element.type))) && (
        <>{renderAction("changeRoundness")}</>
      )}

      {(toolIsArrow(appState.activeTool.type) ||
        targetElements.some((element) => toolIsArrow(element.type))) && (
        <>{renderAction("changeArrowType")}</>
      )}

      {(appState.activeTool.type === "text" ||
        targetElements.some(isTextElement)) && (
        <>
          {renderAction("changeFontFamily")}
          {renderAction("changeFontSize")}
          {(appState.activeTool.type === "text" ||
            suppportsHorizontalAlign(targetElements, elementsMap)) &&
            renderAction("changeTextAlign")}
        </>
      )}

      {shouldAllowVerticalAlign(targetElements, elementsMap) &&
        renderAction("changeVerticalAlign")}
      {(canHaveArrowheads(appState.activeTool.type) ||
        targetElements.some((element) => canHaveArrowheads(element.type))) && (
        <>{renderAction("changeArrowhead")}</>
      )}

      {renderAction("changeOpacity")}

      <fieldset>
        <legend>{t("labels.layers")}</legend>
        <div className="buttonList">
          {renderAction("sendToBack")}
          {renderAction("sendBackward")}
          {renderAction("bringForward")}
          {renderAction("bringToFront")}
        </div>
      </fieldset>

      {showAlignActions && !isSingleElementBoundContainer && (
        <fieldset>
          <legend>{t("labels.align")}</legend>
          <div className="buttonList">
            {
              // swap this order for RTL so the button positions always match their action
              // (i.e. the leftmost button aligns left)
            }
            {isRTL ? (
              <>
                {renderAction("alignRight")}
                {renderAction("alignHorizontallyCentered")}
                {renderAction("alignLeft")}
              </>
            ) : (
              <>
                {renderAction("alignLeft")}
                {renderAction("alignHorizontallyCentered")}
                {renderAction("alignRight")}
              </>
            )}
            {targetElements.length > 2 &&
              renderAction("distributeHorizontally")}
            {renderAction("alignTop")}
            {renderAction("alignVerticallyCentered")}
            {renderAction("alignBottom")}
            {targetElements.length > 2 &&
              renderAction("distributeVertically")}
          </div>
        </fieldset>
      )}
      {!isEditingTextOrNewElement && targetElements.length > 0 && (
        <fieldset>
          <legend>{t("labels.actions")}</legend>
          <div className="buttonList">
            {!device.editor.isMobile && renderAction("duplicateSelection")}
            {!device.editor.isMobile && renderAction("deleteSelectedElements")}
            {renderAction("group")}
            {renderAction("ungroup")}
            {showLinkIcon && renderAction("hyperlink")}
            {showCropEditorAction && renderAction("cropEditor")}
            {showLineEditorAction && renderAction("toggleLinearEditor")}
          </div>
        </fieldset>
      )}
    </div>
  );
};

export const ShapesSwitcher = ({ activeTool, appState, app, UIOptions }: {
  activeTool: UIAppState["activeTool"];
  appState: UIAppState;
  app: AppClassProperties;
  UIOptions: AppProps["UIOptions"];
}) => {
  const [isExtraToolsMenuOpen, setIsExtraToolsMenuOpen] = useState(false);
  const [isShapeToolsMenuOpen, setIsShapeToolsMenuOpen] = useState(false);
  const collapsed = new Set<string>(["rectangle", "diamond", "ellipse", "line"]);
  const shapeSelected = collapsed.has(activeTool.type);
  const freedrawSelected = activeTool.type === "freedraw";
  const eraserSelected = activeTool.type === "eraser";
  const laserSelected = activeTool.type === "laser";
  const extraSelected = freedrawSelected || eraserSelected || laserSelected;
  const tools = UIOptions.tools as Partial<Record<string, boolean>>;
  const shapeTools = SHAPES.filter((shape) => collapsed.has(shape.value) && tools?.[shape.value] !== false);
  const current = shapeTools.find((shape) => shape.value === activeTool.type) ?? shapeTools[0];
  const freedraw = SHAPES.find((shape) => shape.value === "freedraw");
  const eraser = SHAPES.find((shape) => shape.value === "eraser");
  const letter = (shape: typeof SHAPES[number]) => capitalizeString(typeof shape.key === "string" ? shape.key : shape.key?.[0] ?? "");
  const extraLabel = t(freedrawSelected ? "toolBar.freedraw" : eraserSelected ? "toolBar.eraser" : laserSelected ? "toolBar.laser" : "toolBar.extraTools");
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === KEYS.ESCAPE && !event.defaultPrevented && (shapeSelected || extraSelected) &&
        !isShapeToolsMenuOpen && !isExtraToolsMenuOpen && !appState.newElement && !appState.multiElement &&
        !appState.editingLinearElement && !appState.editingTextElement) app.setActiveTool({ type: "selection" });
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [app, appState.newElement, appState.multiElement, appState.editingLinearElement,
    appState.editingTextElement, shapeSelected, extraSelected, isShapeToolsMenuOpen, isExtraToolsMenuOpen]);
  return <>
    {SHAPES.map((shape) => {
      if (collapsed.has(shape.value)) {
        if (shape.value !== "rectangle" || !current) return null;
        return <div className="App-toolbar__shape-tools" key="shape-tools">
          <ToolButton type="radio" className={clsx("Shape", { fillable: current.fillable })}
            icon={current.icon} checked={shapeSelected} name="editor-current-shape"
            title={`${t(`toolBar.${current.value}`)} — ${letter(current)}`}
            aria-label={t(`toolBar.${current.value}`)} keyBindingLabel={letter(current)}
            data-testid="toolbar-current-shape"
            onPointerDown={({ pointerType }) => { if (!appState.penDetected && pointerType === "pen") app.togglePenMode(true); }}
            onChange={() => app.setActiveTool({ type: current.value })} />
          <DropdownMenu open={isShapeToolsMenuOpen}>
            <DropdownMenu.Trigger className={clsx("App-toolbar__shape-tools-trigger", { "App-toolbar__shape-tools-trigger--selected": shapeSelected })}
              onToggle={() => setIsShapeToolsMenuOpen(!isShapeToolsMenuOpen)} title={t("toolBar.extraTools")} aria-label={t("toolBar.extraTools")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="m7 9.5 5 5 5-5" /></svg>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="App-toolbar__shape-tools-dropdown" onClickOutside={() => setIsShapeToolsMenuOpen(false)} onSelect={() => setIsShapeToolsMenuOpen(false)}>
              {shapeTools.map((option) => <DropdownMenu.Item key={option.value} icon={option.icon} shortcut={letter(option)}
                data-testid={`toolbar-shape-menu-${option.value}`} selected={activeTool.type === option.value}
                onSelect={() => app.setActiveTool({ type: option.value })}>{t(`toolBar.${option.value}`)}</DropdownMenu.Item>)}
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>;
      }
      if (shape.value === "freedraw" || shape.value === "eraser" || tools?.[shape.value] === false) return null;
      return <ToolButton key={shape.value} type="radio" className={clsx("Shape", { fillable: shape.fillable })}
        icon={shape.icon} checked={activeTool.type === shape.value} name="editor-current-shape"
        title={`${t(`toolBar.${shape.value}`)} — ${letter(shape)}`} aria-label={t(`toolBar.${shape.value}`)}
        keyBindingLabel={shape.numericKey || letter(shape)} data-testid={`toolbar-${shape.value}`}
        onPointerDown={({ pointerType }) => { if (!appState.penDetected && pointerType === "pen") app.togglePenMode(true); }}
        onChange={({ pointerType }) => {
          trackEvent("toolbar", shape.value, "ui");
          app.setActiveTool(shape.value === "image" ? { type: "image", insertOnCanvasDirectly: pointerType !== "mouse" } : { type: shape.value });
        }} />;
    })}
    <div className="App-toolbar__divider" />
    <DropdownMenu open={isExtraToolsMenuOpen}>
      <DropdownMenu.Trigger className={clsx("App-toolbar__extra-tools-trigger", { "App-toolbar__extra-tools-trigger--selected": extraSelected })}
        onToggle={() => setIsExtraToolsMenuOpen(!isExtraToolsMenuOpen)} title={extraLabel} aria-label={extraLabel} data-testid="toolbar-extra-tools">
        {freedrawSelected ? freedraw?.icon : eraserSelected ? eraser?.icon : laserSelected ? laserPointerToolIcon : extraToolsIcon}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="App-toolbar__extra-tools-dropdown" onClickOutside={() => setIsExtraToolsMenuOpen(false)} onSelect={() => setIsExtraToolsMenuOpen(false)}>
        {freedraw && tools?.freedraw !== false && <DropdownMenu.Item icon={freedraw.icon} shortcut={letter(freedraw)} data-testid="toolbar-freedraw" selected={freedrawSelected}
          onSelect={() => app.setActiveTool({ type: "freedraw" })}>{t("toolBar.freedraw")}</DropdownMenu.Item>}
        {eraser && <DropdownMenu.Item icon={eraser.icon} shortcut="E" data-testid="toolbar-eraser" selected={eraserSelected}
          onSelect={() => app.setActiveTool({ type: "eraser" })}>{t("toolBar.eraser")}</DropdownMenu.Item>}
        <DropdownMenu.Item icon={laserPointerToolIcon} shortcut="K" data-testid="toolbar-laser" selected={laserSelected}
          onSelect={() => app.setActiveTool({ type: "laser" })}>{t("toolBar.laser")}</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  </>;
};

export const ZoomActions = ({
  renderAction,
  zoom,
}: {
  renderAction: ActionManager["renderAction"];
  zoom: Zoom;
}) => (
  <Stack.Col gap={1} className={CLASSES.ZOOM_ACTIONS}>
    <Stack.Row align="center">
      {renderAction("zoomOut")}
      {renderAction("resetZoom")}
      {renderAction("zoomIn")}
    </Stack.Row>
  </Stack.Col>
);

export const UndoRedoActions = ({
  renderAction,
  className,
}: {
  renderAction: ActionManager["renderAction"];
  className?: string;
}) => (
  <div className={`undo-redo-buttons ${className}`}>
    <div className="undo-button-container">
      <Tooltip label={t("buttons.undo")}>{renderAction("undo")}</Tooltip>
    </div>
    <div className="redo-button-container">
      <Tooltip label={t("buttons.redo")}> {renderAction("redo")}</Tooltip>
    </div>
  </div>
);

export const ExitZenModeAction = ({
  actionManager,
  showExitZenModeBtn,
}: {
  actionManager: ActionManager;
  showExitZenModeBtn: boolean;
}) => (
  <button
    type="button"
    className={clsx("disable-zen-mode", {
      "disable-zen-mode--visible": showExitZenModeBtn,
    })}
    onClick={() => actionManager.executeAction(actionToggleZenMode)}
  >
    {t("buttons.exitZenMode")}
  </button>
);

export const FinalizeAction = ({
  renderAction,
  className,
}: {
  renderAction: ActionManager["renderAction"];
  className?: string;
}) => (
  <div className={`finalize-button ${className}`}>
    {renderAction("finalize", { size: "small" })}
  </div>
);
