import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ActionManager } from "../actions/manager";
import type { ActionName } from "../actions/types";
import type { AppClassProperties, AppState } from "../types";
import { getCommonBounds } from "../element/bounds";
import { isArrowElement } from "../element/typeChecks";
import { getTargetElements } from "../scene";
import { hasBackground, hasStrokeWidth, hasStrokeStyle } from "../scene/comparisons";
import { t } from "../i18n";
import {
  AlignLeftIcon,
  ArrowIcon,
  BringToFrontIcon,
  elbowArrowIcon,
  roundArrowIcon,
  sharpArrowIcon,
  StrokeWidthBaseIcon,
  TextAlignLeftIcon,
} from "./icons";
import "./SelectionToolbar.scss";
import { SelectionInspectorToggle } from "./SelectionInspectorToggle";

type Props = { app: AppClassProperties; appState: AppState; renderAction: ActionManager["renderAction"]; onOpenInspector: () => void };
type Section = { id: string; label: string; icon: ReactNode; actions: ActionName[] };

/** Contextual presentation of the same actions used by the property inspector. */
export function SelectionToolbar({ app, appState, renderAction, onOpenInspector }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 420, height: 48 });
  const selected = app.scene.getSelectedElements(appState);
  const targets = getTargetElements(app.scene.getNonDeletedElementsMap(), appState);
  const selectionKey = selected.map(element => element.id).sort().join(",");
  const hidden = !selected.length || appState.viewModeEnabled || appState.zenModeEnabled ||
    appState.selectedElementsAreBeingDragged || appState.isResizing || appState.isRotating ||
    !!appState.editingTextElement || !!appState.editingFrame || !!appState.newElement || !!appState.croppingElementId;

  useEffect(() => { setOpen(null); }, [selectionKey, hidden]);
  useLayoutEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [hidden]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!root.current?.contains(target) && !target.closest(".color-picker, .popover, [data-radix-popper-content-wrapper]")) setOpen(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  if (hidden) return null;

  const allText = selected.every(element => element.type === "text");
  const allIcons = selected.every(element => element.type === "rectangle" && !!element.vectorData);
  const stroke = selected.every(element => !element.vectorData && hasStrokeWidth(element.type));
  const background = selected.every(element => !element.vectorData && (hasBackground(element.type) || element.type === "frame"));
  const styledStroke = stroke && selected.every(element => hasStrokeStyle(element.type));
  const multi = selected.length > 1 && selected.every(element => element.type !== "frame" && element.type !== "magicframe");
  const common = (key: "strokeColor" | "backgroundColor" | "opacity" | "fontSize") => {
    const values = targets.map(element => (element as unknown as Record<string, unknown>)[key]);
    return values.every(value => value === values[0]) ? values[0] : null;
  };
  const swatch = (color: unknown) => <span className={`selection-toolbar__swatch${color === null ? " is-mixed" : ""}`} style={{ backgroundColor: typeof color === "string" ? color : undefined }} />;
  const sections: Section[] = [];
  if (allText || allIcons) sections.push({ id: "color", label: t("labels.stroke"), icon: swatch(common("strokeColor")), actions: ["changeStrokeColor"] });
  if (background) sections.push({ id: "background", label: t("labels.background"), icon: swatch(common("backgroundColor")), actions: ["changeBackgroundColor", ...(selected.every(element => hasBackground(element.type)) && selected.some(element => element.backgroundColor !== "transparent") ? ["changeFillStyle" as const] : [])] });
  if (stroke) sections.push({ id: "stroke", label: t("labels.stroke"), icon: StrokeWidthBaseIcon, actions: ["changeStrokeColor", "changeStrokeWidth", ...(styledStroke ? ["changeStrokeStyle" as const, "changeSloppiness" as const] : [])] });
  if (allText) {
    const fontSize = common("fontSize");
    sections.push({ id: "size", label: t("labels.fontSize"), icon: <span>{typeof fontSize === "number" ? Math.round(fontSize) : "—"}</span>, actions: ["changeFontSize"] });
    sections.push({ id: "text-align", label: t("labels.textAlign"), icon: TextAlignLeftIcon, actions: ["changeTextAlign"] });
  }
  const allArrows = selected.every(isArrowElement);
  if (allArrows) {
    const arrowTypes = selected.map(element => isArrowElement(element) && element.elbowed ? "elbow" : element.roundness ? "round" : "sharp");
    const arrowType = arrowTypes.every(value => value === arrowTypes[0]) ? arrowTypes[0] : null;
    const arrowTypeIcon = arrowType === "elbow" ? elbowArrowIcon : arrowType === "round" ? roundArrowIcon : arrowType === "sharp" ? sharpArrowIcon : ArrowIcon;
    sections.push({ id: "arrow-type", label: t("labels.arrowtypes"), icon: arrowTypeIcon, actions: ["changeArrowType"] });
    sections.push({ id: "arrows", label: t("labels.arrowheads"), icon: ArrowIcon, actions: ["changeArrowhead"] });
  }
  sections.push({ id: "opacity", label: t("labels.opacity"), icon: <span className="selection-toolbar__opacity" />, actions: ["changeOpacity"] });
  sections.push({ id: "layers", label: t("labels.layers"), icon: BringToFrontIcon, actions: ["sendToBack", "sendBackward", "bringForward", "bringToFront"] });
  if (multi) sections.push({ id: "align", label: t("labels.align"), icon: AlignLeftIcon, actions: ["alignLeft", "alignHorizontallyCentered", "alignRight", "alignTop", "alignVerticallyCentered", "alignBottom", ...(selected.length > 2 ? ["distributeHorizontally" as const, "distributeVertically" as const] : [])] });
  const active = sections.find(section => section.id === open);
  const [left, top, right, bottom] = getCommonBounds(selected);
  const zoom = appState.zoom.value;
  const minX = appState.offsetLeft + 12;
  // The inspector and toolbar are mutually exclusive, so use the whole viewport.
  const maxX = appState.offsetLeft + appState.width - 12;
  const x = Math.max(minX, Math.min((left / 2 + right / 2 + appState.scrollX) * zoom + appState.offsetLeft - size.width / 2, maxX - size.width));
  const minY = appState.offsetTop + 76;
  const maxY = appState.offsetTop + appState.height - 80;
  const above = (top + appState.scrollY) * zoom + appState.offsetTop - size.height - 18;
  const below = above < minY;
  const y = Math.max(minY, Math.min(below ? (bottom + appState.scrollY) * zoom + appState.offsetTop + 18 : above, maxY - size.height));
  const spaceBelow = appState.offsetTop + appState.height - y - size.height - 21;
  const spaceAbove = y - appState.offsetTop - 21;
  const popoverAbove = spaceBelow < 320 && spaceAbove > spaceBelow;
  const popoverWidth = Math.min(270, Math.max(180, maxX - minX));
  return <div ref={root} className="selection-toolbar" style={{ left: x, top: y, maxWidth: Math.max(180, maxX - minX) }}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(null); }
      if ((event.target as HTMLElement).matches("input, textarea")) event.stopPropagation();
    }}>
    <div className="selection-toolbar__bar" role="toolbar" aria-label={t("headings.selectedShapeActions")}>
      {sections.map(section => <button key={section.id} type="button" className="selection-toolbar__trigger" aria-label={section.label} title={section.label}
        aria-expanded={open === section.id} aria-controls={`selection-toolbar-${section.id}`} aria-haspopup="dialog"
        onClick={() => setOpen(open === section.id ? null : section.id)}>{section.icon}</button>)}
      {multi && <div className="selection-toolbar__groups">{renderAction("group")}{renderAction("ungroup")}</div>}
      <button type="button" className="selection-toolbar__trigger selection-toolbar__inspector-toggle"
        aria-label={t("labels.showSelectionInspector")} title={t("labels.showSelectionInspector")}
        onClick={onOpenInspector}><SelectionInspectorToggle /></button>
    </div>
    {active && <div id={`selection-toolbar-${active.id}`} role="dialog" aria-label={active.label}
      className={`selection-toolbar__popover${popoverAbove ? " is-above" : ""}`}
      style={{ width: popoverWidth, left: Math.min(0, maxX - x - popoverWidth), maxHeight: Math.max(100, popoverAbove ? spaceAbove : spaceBelow) }}>
      <div className="selection-toolbar__heading">{active.label}<button type="button" aria-label={t("buttons.close")} onClick={() => setOpen(null)}>×</button></div>
      <form onSubmit={event => event.preventDefault()} className={`selection-toolbar__content selection-toolbar__content--${active.id}`}>
        {active.actions.map(action => <div key={action}>{renderAction(action)}</div>)}
      </form>
    </div>}
  </div>;
}
