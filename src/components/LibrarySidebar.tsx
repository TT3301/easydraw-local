import { CanvasTree } from "../features/canvases/CanvasTree";
import type { TreeOperation } from "../features/canvases/project-tree";
import type { Dispatch, SetStateAction } from "react";
import type { ControllerSnapshot } from "../core/scene-controller";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Translate = (key: string, values?: Record<string, string | number>) => string;
import type { LibraryItem } from "@easydraw/canvas-engine/types";
import { getMaterialLibraryBounds } from "../features/materials/material-library";
import type { useMaterials } from "../features/materials/use-materials";
function MaterialLibraryThumbnail({ item }: { item: LibraryItem }) {
  const bounds = getMaterialLibraryBounds(item.elements);
  const scale = Math.min(1, 116 / bounds.width, 68 / bounds.height);
  const offsetX = (128 - bounds.width * scale) / 2;
  const offsetY = (80 - bounds.height * scale) / 2;

  return (
    <span className="material-thumbnail" aria-hidden="true">
      {item.elements.slice(0, 24).map((element) => {
        const left = offsetX + (element.x - bounds.x) * scale;
        const top = offsetY + (element.y - bounds.y) * scale;
        const width = Math.max(2, element.width * scale);
        const height = Math.max(2, element.height * scale);
        const isLinear =
          element.type === "line" || element.type === "arrow";
        return (
          <i
            key={element.id}
            className={`material-thumbnail__element material-thumbnail__element--${element.type}`}
            style={{
              left,
              top,
              width,
              height: isLinear ? 2 : height,
              borderColor: element.strokeColor,
              background:
                element.type === "text"
                  ? element.strokeColor
                  : element.backgroundColor === "transparent"
                    ? "transparent"
                    : element.backgroundColor,
              borderRadius: element.type === "ellipse" ? "50%" : undefined,
              opacity: Math.max(0.18, element.opacity / 100),
              transform: element.angle
                ? `rotate(${element.angle}rad)`
                : undefined,
            }}
          />
        );
      })}
    </span>
  );
}

interface Props {
  leftPanelOpen: boolean;
  leftPanelTab: "canvases" | "materials";
  setLeftPanelTab: Setter<"canvases" | "materials">;
  t: Translate;
  snapshot: ControllerSnapshot;
  activateCanvas: (id: string) => void;
  operateTree: (op: TreeOperation) => string | null;
  materials: ReturnType<typeof useMaterials>;
}
export function LibrarySidebar({ leftPanelOpen, leftPanelTab, setLeftPanelTab, t, snapshot, activateCanvas, operateTree, materials }: Props) {
const { materialLibraryItems, materialLibraryBusyId, canAddSelectionToMaterialLibrary, addSelectionToMaterialLibrary, insertMaterialLibraryItem, removeMaterialLibraryItem } = materials;
return <>
          {leftPanelOpen && (
            <aside className="left-panel" aria-label={t("资源边栏")}>
              <div className="panel-tabs" role="tablist" aria-label={t("资源类型")}>
                {([
                  ["canvases", t("画布")],
                  ["materials", t("素材库")],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    data-panel-tab={id}
                    aria-selected={leftPanelTab === id}
                    className={leftPanelTab === id ? "is-active" : ""}
                    onClick={() => setLeftPanelTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {leftPanelTab === "canvases" && <div className="panel-content canvas-panel" role="tabpanel"><CanvasTree key={snapshot.document.projectId} document={snapshot.document} activate={activateCanvas} operate={operateTree} t={t} /></div>}

              {leftPanelTab === "materials" && (
                <div className="panel-content material-panel" role="tabpanel">
                  <div className="material-panel__toolbar">
                    <div>
                      <strong>{t("素材库")}</strong>
                      <span>{t("{count} 个素材", { count: materialLibraryItems.length })}</span>
                    </div>
                    <button
                      className="material-add-button"
                      onClick={() => void addSelectionToMaterialLibrary()}
                      disabled={
                        !canAddSelectionToMaterialLibrary ||
                        Boolean(materialLibraryBusyId)
                      }
                    >
                      {materialLibraryBusyId === "adding"
                        ? t("正在添加")
                        : t("添加选中")}
                    </button>
                  </div>

                  {materialLibraryItems.length > 0 ? (
                    <div className="material-library-list">
                      {materialLibraryItems.map((item, index) => {
                        const itemName = item.name ?? t("素材 {index}", { index: index + 1 });
                        const isBusy = materialLibraryBusyId === item.id;
                        return (
                          <article className="material-library-item" key={item.id}>
                            <button
                              className="material-library-item__insert"
                              onClick={() =>
                                void insertMaterialLibraryItem(item)
                              }
                              disabled={Boolean(materialLibraryBusyId)}
                              aria-label={t("插入素材 {name}", { name: itemName })}
                              title={t("插入“{name}”", { name: itemName })}
                            >
                              <MaterialLibraryThumbnail item={item} />
                              <span>
                                <strong>{isBusy ? t("正在插入") : itemName}</strong>
                                <small>{t("{count} 个元素", { count: item.elements.length })}</small>
                              </span>
                            </button>
                            <button
                              className="material-library-item__remove"
                              onClick={() =>
                                void removeMaterialLibraryItem(item)
                              }
                              disabled={Boolean(materialLibraryBusyId)}
                              aria-label={t("删除素材 {name}", { name: itemName })}
                              title={t("删除“{name}”", { name: itemName })}
                            >
                              ×
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="panel-empty material-library-empty">
                      <span className="empty-symbol" aria-hidden="true">◇</span>
                      <strong>{t("还没有素材")}</strong>
                      <span>{t("在画布中选择一个或多个元素，然后点击“添加选中”")}</span>
                      <button
                        className="panel-action"
                        onClick={() => void addSelectionToMaterialLibrary()}
                        disabled={!canAddSelectionToMaterialLibrary}
                      >
                        {t("添加选中元素")}
                      </button>
                    </div>
                  )}
                </div>
              )}

            </aside>
          )}

</>;
}
