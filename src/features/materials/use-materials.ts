import type { Notice } from "../../app/ports";
import { CanvasSession } from "../../canvas/canvas-session";
import { EditorSession } from "../../app/editor-session";

import { CaptureUpdateAction } from "@easydraw/canvas-engine";

import type { EasyDrawImperativeAPI, LibraryItem, LibraryItems } from "@easydraw/canvas-engine/types";
import { useCallback, useMemo, useState } from "react";

import { getFocusedPage, getPageElements } from "../../core/protocol";

import { localizeRuntimeMessage, type AppLocale } from "../../core/i18n";

import {
  MATERIAL_LIBRARY_STORAGE_KEY,
  createMaterialLibraryItem,
  instantiateMaterialLibraryItem,
  isMaterialLibraryElementType,
  parseStoredMaterialLibrary,
} from "./material-library";

const readMaterialLibrary = (): LibraryItems => {
  if (typeof window === "undefined") return [];
  return parseStoredMaterialLibrary(
    window.localStorage.getItem(MATERIAL_LIBRARY_STORAGE_KEY),
  );
};

interface MaterialOptions {
  editorSession: EditorSession;
  canvasSession: CanvasSession;
  api: EasyDrawImperativeAPI | null;
  selectedIds: string[];
  locale: AppLocale;
  select(ids: string[]): void;
  showMaterials(): void;
  setNotice(notice: Notice): void;
}
export function useMaterials({ editorSession, canvasSession, api, selectedIds, locale, select, showMaterials, setNotice }: MaterialOptions) {
  const controller = editorSession.controller;
  const [materialLibraryItems, setMaterialLibraryItems] =
    useState<LibraryItems>(readMaterialLibrary);
  const [materialLibraryBusyId, setMaterialLibraryBusyId] =
    useState<string | null>(null);
  const canAddSelectionToMaterialLibrary = useMemo(() => {
    if (!api || selectedIds.length === 0) return false;
    const selectedIdSet = new Set(selectedIds);
    return api
      .getSceneElements()
      .some(
        (element) =>
          selectedIdSet.has(element.id) &&
          isMaterialLibraryElementType(element.type),
      );
  }, [api, selectedIds]);
  const handleMaterialLibraryChange = useCallback(
    (items: LibraryItems) => {
      setMaterialLibraryItems(items);
      try {
        window.localStorage.setItem(
          MATERIAL_LIBRARY_STORAGE_KEY,
          JSON.stringify(items),
        );
      } catch (error) {
        setNotice({
          tone: "warning",
          text: `素材库已更新，但无法持久保存：${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
    [],
  );

  const addSelectionToMaterialLibrary = async () => {
    const canvasApi = api;
    if (!canvasApi || materialLibraryBusyId) return;
    const selectedElementIds = new Set(
      Object.entries(canvasApi.getAppState().selectedElementIds)
        .filter(([, selected]) => selected)
        .map(([id]) => id),
    );
    const item = createMaterialLibraryItem({
      sceneElements: canvasApi.getSceneElements(),
      selectedIds: selectedElementIds,
      id: `material_${crypto.randomUUID()}`,
      name: `素材 ${materialLibraryItems.length + 1}`,
    });
    if (!item) {
      setNotice({
        tone: "warning",
        text: "请先选择矩形、圆形、线条、箭头或文字，再添加到素材库",
      });
      return;
    }

    setMaterialLibraryBusyId("adding");
    try {
      await canvasApi.updateLibrary({
        libraryItems: (currentItems) => [item, ...currentItems],
      });
      showMaterials();
      setNotice({
        tone: "success",
        text: `已将 ${item.elements.length} 个元素保存为“${item.name}”`,
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        text: `添加素材失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      setMaterialLibraryBusyId(null);
    }
  };

  const insertMaterialLibraryItem = async (item: LibraryItem) => {
    if (materialLibraryBusyId) return;
    const scope = editorSession.capture();
    const currentDocument = controller.getSnapshot().document;
    const targetPage = getFocusedPage(currentDocument) ?? getPageElements(currentDocument)[0];
    if (!targetPage) {
      setNotice({ tone: "warning", text: "当前项目没有可插入素材的页面" });
      return;
    }

    setMaterialLibraryBusyId(item.id);
    try {
      const canvasElements = instantiateMaterialLibraryItem({
        item,
        page: targetPage,
        createId: () => crypto.randomUUID(),
      });
      const productElements = canvasElements.filter((element) => !element.isDeleted);
      if (productElements.length === 0) {
        throw new Error("该素材不包含 EasyDraw 当前支持的元素");
      }
      canvasSession.flush();
      const result = controller.commitProjectChange(
        `插入素材：${item.name ?? "未命名素材"}`,
        (draft) => {
          draft.scene.elements.push(...productElements);
        },
      );
      if (!result.ok) throw new Error(result.message);

      const insertedIds = productElements.map((element) => element.id);
      select(insertedIds);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (!scope.isCurrent()) return;
          api?.updateScene({
            appState: {
              selectedElementIds: Object.fromEntries(
                insertedIds.map((id) => [id, true]),
              ),
            },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        });
      });
      setNotice({
        tone: "success",
        text: `已将“${item.name ?? "未命名素材"}”插入当前页面`,
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        text: `插入素材失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      setMaterialLibraryBusyId(null);
    }
  };

  const removeMaterialLibraryItem = async (item: LibraryItem) => {
    const canvasApi = api;
    if (!canvasApi || materialLibraryBusyId) return;
    const itemName = item.name ?? "未命名素材";
    if (
      !window.confirm(
        localizeRuntimeMessage(locale, `从素材库删除“${itemName}”？`),
      )
    ) return;

    setMaterialLibraryBusyId(item.id);
    try {
      await canvasApi.updateLibrary({
        libraryItems: (currentItems) =>
          currentItems.filter((currentItem) => currentItem.id !== item.id),
      });
      setNotice({ tone: "neutral", text: `已删除“${itemName}”` });
    } catch (error) {
      setNotice({
        tone: "danger",
        text: `删除素材失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      setMaterialLibraryBusyId(null);
    }
  };

return { materialLibraryItems, materialLibraryBusyId, canAddSelectionToMaterialLibrary, handleMaterialLibraryChange, addSelectionToMaterialLibrary, insertMaterialLibraryItem, removeMaterialLibraryItem };
}
