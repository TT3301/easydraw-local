import { vectorDataFromInsertedAsset } from "./inserted-asset";
import type { Notice } from "../../app/ports";
import { CanvasSession } from "../../canvas/canvas-session";
import { EditorSession } from "../../app/editor-session";

import { createElementFromInput, isVectorElement } from "../../core/element-commands";
import { CaptureUpdateAction } from "@easydraw/canvas-engine";

import type { BinaryFileData, DataURL, EasyDrawImperativeAPI } from "@easydraw/canvas-engine/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent } from "react";

import type { IconLibraryIcon, IconLibrarySnapshot, InsertedAssetResult } from "../../desktop-api";

import { DEFAULT_ICON_STROKE } from "./icon-color";

import { blobToBase64 } from "../../canvas/export-page";

import {
  getPageElements,
  getPageMembers,
  type DrawableSceneElement,
  type ProjectAsset,
  type SvgVectorData,
} from "../../core/protocol";
import { parseSvgVector } from "./svg-vector";
import { extractClipboardSvg } from "./clipboard-svg";

import type { ControllerSnapshot } from "../../core/scene-controller";
interface AssetOptions {
  editorSession: EditorSession;
  canvasSession: CanvasSession;
  api: EasyDrawImperativeAPI | null;
  projectPath: string | null;
  snapshot: ControllerSnapshot;
  selectedIds: string[];
  select(ids: string[]): void;
  setNotice(notice: Notice): void;
}
export function useAssets({ editorSession, canvasSession, api, projectPath, snapshot, selectedIds, select, setNotice }: AssetOptions) {
  const controller = editorSession.controller;
  const [iconLibrary, setIconLibrary] =
    useState<IconLibrarySnapshot | null>(null);
  const [iconLibraryLoading, setIconLibraryLoading] = useState(true);
  const [iconSearch, setIconSearch] = useState("");
  const [iconGroup, setIconGroup] = useState("all");
  const [iconPreviews, setIconPreviews] = useState<Record<string, string>>({});
  const [insertingIconId, setInsertingIconId] = useState<string | null>(null);
  const [iconVisibleLimit, setIconVisibleLimit] = useState(120);
  useEffect(() => editorSession.subscribe(() => { loadedAssets.current.clear(); }), [editorSession]);
  const clipboardAssetImporting = useRef(false);
  const loadedAssets = useRef(new Map<string, string>());
  const filteredLibraryIcons = useMemo(() => {
    if (!iconLibrary) return [];
    const query = iconSearch.trim().toLocaleLowerCase();
    return iconLibrary.icons.filter((icon) => {
      if (iconGroup !== "all" && icon.group !== iconGroup) return false;
      if (!query) return true;
      return [
        icon.name,
        icon.fileName,
        icon.group,
        icon.relativePath,
        ...icon.tags,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [iconGroup, iconLibrary, iconSearch]);
  const visibleLibraryIcons = useMemo(
    () => filteredLibraryIcons.slice(0, iconVisibleLimit),
    [filteredLibraryIcons, iconVisibleLimit],
  );
  useEffect(() => setIconVisibleLimit(120), [iconGroup, iconSearch]);
  const loadMoreLibraryIcons = useCallback(() => {
    setIconVisibleLimit((current) =>
      Math.min(current + 120, filteredLibraryIcons.length),
    );
  }, [filteredLibraryIcons.length]);
  const preloadInsertedAssets = useCallback(
    (insertedAssets: InsertedAssetResult[]) => {
      const currentApi = api;
      if (!currentApi || insertedAssets.length === 0) return;
      const currentProjectPath = projectPath;
      const uniqueAssets = [
        ...new Map(
          insertedAssets.map((inserted) => [
            inserted.asset.id,
            inserted,
          ]),
        ).values(),
      ].filter(
        ({ asset }) =>
          loadedAssets.current.get(asset.id) !==
          `${currentProjectPath ?? "unassigned"}:${asset.relativePath}`,
      );
      if (uniqueAssets.length === 0) return;
      const now = Date.now();
      const files = uniqueAssets.map(({ asset, data }) => ({
        id: asset.id as BinaryFileData["id"],
        mimeType: asset.mimeType as BinaryFileData["mimeType"],
        dataURL: `data:${asset.mimeType};base64,${data}` as DataURL,
        created: Date.parse(asset.createdAt) || now,
        lastRetrieved: now,
      }));
      currentApi.addFiles(files);
      for (const { asset } of uniqueAssets) {
        loadedAssets.current.set(
          asset.id,
          `${currentProjectPath ?? "unassigned"}:${asset.relativePath}`,
        );
      }
    },
    [api, projectPath],
  );

  useEffect(() => {
    const desktop = window.easydrawDesktop;
    if (!api || !desktop) return;
    let stopped = false;
    const scope = editorSession.capture();
    void Promise.all(
      snapshot.document.assets.map(async (asset) => {
        const locationKey = `${projectPath ?? "unassigned"}:${asset.relativePath}`;
        if (loadedAssets.current.get(asset.id) === locationKey) return;
        try {
          const result = await desktop.readAsset({
            projectPath,
            relativePath: asset.relativePath,
          });
          if (stopped || !scope.isCurrent()) return;
          const file: BinaryFileData = {
            id: asset.id as BinaryFileData["id"],
            mimeType: asset.mimeType as BinaryFileData["mimeType"],
            dataURL:
              `data:${asset.mimeType};base64,${result.data}` as DataURL,
            created: Date.parse(asset.createdAt) || Date.now(),
            lastRetrieved: Date.now(),
          };
          api.addFiles([file]);
          loadedAssets.current.set(asset.id, locationKey);
        } catch (error) {
          if (!stopped) {
            setNotice({
              tone: "warning",
              text: `素材“${asset.fileName}”缺失，画布已保留可定位的降级元素`,
            });
          }
        }
      }),
    );
    return () => {
      stopped = true;
    };
  }, [
    api,
    projectPath,
    snapshot.document.assets,
    snapshot.document.activeCanvasId,
  ]);

  useEffect(() => {
    const desktop = window.easydrawDesktop;
    if (!desktop) {
      setIconLibraryLoading(false);
      return;
    }
    let stopped = false;
    setIconLibraryLoading(true);
    void desktop
      .listIconLibrary()
      .then((library) => {
        if (!stopped) setIconLibrary(library);
      })
      .catch((error) => {
        if (!stopped) {
          setNotice({
            tone: "danger",
            text: `图标库读取失败：${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }
      })
      .finally(() => {
        if (!stopped) setIconLibraryLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, []);

  useEffect(() => {
    const desktop = window.easydrawDesktop;
    if (!desktop || visibleLibraryIcons.length === 0) return;
    let stopped = false;
    const missing = visibleLibraryIcons.filter(
      (icon) => !iconPreviews[icon.id],
    );
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (icon) => {
        try {
          const preview = await desktop.readIconLibraryIcon({
            iconId: icon.id,
          });
          return [
            icon.id,
            `data:${preview.mimeType};base64,${preview.data}`,
          ] as const;
        } catch {
          return [icon.id, ""] as const;
        }
      }),
    ).then((previews) => {
      if (stopped) return;
      setIconPreviews((current) => ({
        ...current,
        ...Object.fromEntries(previews),
      }));
    });
    return () => {
      stopped = true;
    };
  }, [iconPreviews, visibleLibraryIcons]);

  const addAssetToCurrentPage = (
    asset: ProjectAsset,
    placement: "asset" | "icon",
    vectorData?: SvgVectorData,
  ) => {
    if (placement === "icon" && !vectorData) {
      throw new Error(`无法解析 SVG 图标：${asset.fileName}`);
    }
    canvasSession.flush();
    const scope = editorSession.capture();
    const document = controller.getSnapshot().document;
    const targetPage = getPageElements(document).find((item) =>
      selectedIds.includes(item.id),
    );
    const appState = api?.getAppState();
    const viewportZoom = appState?.zoom.value ?? 1;
    const viewportCenter = {
      x: appState
        ? -appState.scrollX + appState.width / (2 * viewportZoom)
        : 0,
      y: appState
        ? -appState.scrollY + appState.height / (2 * viewportZoom)
        : 0,
    };

    const scale =
      placement === "icon"
        ? 48 / Math.max(asset.width, asset.height)
        : targetPage
          ? Math.min(
              1,
              (targetPage.width * 0.72) / asset.width,
              (targetPage.height * 0.55) / asset.height,
            )
          : Math.min(1, 360 / Math.max(asset.width, asset.height));
    const width = Math.max(
      placement === "icon" ? 16 : 24,
      Math.round(asset.width * scale),
    );
    const height = Math.max(
      placement === "icon" ? 16 : 24,
      Math.round(asset.height * scale),
    );
    const existingIconCount = targetPage
      ? getPageMembers(document, targetPage.id).filter(
          (element) => isVectorElement(element),
        ).length
      : 0;
    const cascade = placement === "icon" ? (existingIconCount % 5) * 8 : 0;
    const centeredX = targetPage
      ? targetPage.x + (targetPage.width - width) / 2
      : viewportCenter.x - width / 2;
    const centeredY = targetPage
      ? targetPage.y + (targetPage.height - height) / 2
      : viewportCenter.y - height / 2;
    const element: DrawableSceneElement = createElementFromInput({
      id: `${asset.kind === "svg" ? "svg" : "image"}_${crypto.randomUUID()}`,
      type: asset.kind === "svg" ? "icon" : "image",
      containerId: targetPage?.id ?? null,
      x:
        placement === "icon" && targetPage
          ? Math.min(
              targetPage.x + targetPage.width - width - 24,
              centeredX + cascade,
            )
          : centeredX,
      y:
        placement === "icon" && targetPage
          ? Math.min(
              targetPage.y + targetPage.height - height - 24,
              centeredY + cascade,
            )
          : centeredY,
      width,
      height,
      rotation: 0,
      assetId: asset.id,
      altText: asset.fileName,
      vectorData: placement === "icon" ? vectorData : undefined,
      style: {
        fill: "transparent",
        stroke:
          placement === "icon"
            ? DEFAULT_ICON_STROKE
            : "transparent",
        strokeWidth: 0,
        radius: 0,
        opacity: 1,
        fontSize: 16,
        textAlign: "left",
      },
      locked: false,
      groupIds: [],
    });
    canvasSession.flush();
    const result = controller.commitProjectChange(
      placement === "icon" ? "插入图标" : "导入图片素材",
      (draft) => {
        if (!draft.assets.some((item) => item.id === asset.id)) {
          draft.assets.push(asset);
        }
        draft.scene.elements.push(element);
      },
    );
    if (!result.ok) throw new Error(result.message);

    select([element.id]);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!scope.isCurrent()) return;
        api?.updateScene({
          appState: {
            selectedElementIds: { [element.id]: true },
          },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      });
    });
    return element;
  };

  const importAsset = async () => {
    const scope = editorSession.capture();
    const desktop = window.easydrawDesktop;
    if (!desktop) {
      setNotice({ tone: "warning", text: "请在 EasyDraw 桌面应用中导入素材" });
      return;
    }
    try {
      const inserted = await desktop.importAsset({ projectPath });
      if (!inserted) return;
      scope.assertCurrent();
      preloadInsertedAssets([inserted]);
      const asset = inserted.asset;
      const placement = asset.kind === "svg" ? "icon" : "asset";
      addAssetToCurrentPage(
        asset,
        placement,
        placement === "icon"
          ? vectorDataFromInsertedAsset(inserted)
          : undefined,
      );
      setNotice({
        tone: "success",
        text: `已将“${asset.fileName}”插入画布`,
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleCanvasPasteCapture = (
    event: ReactClipboardEvent<HTMLDivElement>,
  ) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        Boolean(target.closest("input, textarea, [contenteditable='true']")))
    ) {
      return;
    }

    const clipboardFiles = Array.from(event.clipboardData.files);
    const clipboardItemFile = Array.from(event.clipboardData.items)
      .find(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      )
      ?.getAsFile();
    const imageFile =
      clipboardFiles.find((file) => file.type.startsWith("image/")) ??
      clipboardItemFile;
    const svgMarkup = imageFile
      ? null
      : extractClipboardSvg(event.clipboardData.getData("text/plain"));
    if (!imageFile && !svgMarkup) return;

    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();

    if (clipboardAssetImporting.current) return;
    const desktop = window.easydrawDesktop;
    if (!desktop) {
      setNotice({
        tone: "warning",
        text: svgMarkup
          ? "请在 EasyDraw 桌面应用中粘贴 SVG 代码"
          : "请在 EasyDraw 桌面应用中粘贴图片",
      });
      return;
    }
    if (!projectPath) {
      setNotice({
        tone: "warning",
        text: "请先保存项目，再粘贴图片",
      });
      return;
    }
    const svgVector = svgMarkup ? parseSvgVector(svgMarkup) : null;
    if (svgMarkup && !svgVector) {
      setNotice({
        tone: "danger",
        text: "SVG 代码中没有可编辑的 path，请复制完整的 SVG 源码",
      });
      return;
    }
    const clipboardBlob = svgMarkup
      ? new Blob([svgMarkup], { type: "image/svg+xml" })
      : imageFile!;
    if (clipboardBlob.size > 25 * 1024 * 1024) {
      setNotice({ tone: "danger", text: "单个素材不能超过 25 MB" });
      return;
    }

    clipboardAssetImporting.current = true;
    const scope = editorSession.capture();
    void (async () => {
      try {
        const inserted = await desktop.importClipboardAsset({
          projectPath,
          data: await blobToBase64(clipboardBlob),
          mimeType: clipboardBlob.type,
          fileName: svgMarkup ? "clipboard-icon.svg" : imageFile!.name,
        });
        scope.assertCurrent();
      preloadInsertedAssets([inserted]);
        const placement = inserted.asset.kind === "svg" ? "icon" : "asset";
        addAssetToCurrentPage(
          inserted.asset,
          placement,
          placement === "icon" ? svgVector ?? undefined : undefined,
        );
        setNotice({
          tone: "success",
          text:
            placement === "icon"
              ? "已粘贴 SVG 图标"
              : `已粘贴图片“${inserted.asset.fileName}”`,
        });
      } catch (error) {
        setNotice({
          tone: "danger",
          text: `粘贴${svgMarkup ? " SVG 代码" : "图片"}失败：${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      } finally {
        clipboardAssetImporting.current = false;
      }
    })();
  };

  const insertLibraryIcon = async (icon: IconLibraryIcon) => {
    const scope = editorSession.capture();
    const desktop = window.easydrawDesktop;
    if (!desktop || insertingIconId) return;
    setInsertingIconId(icon.id);
    try {
      const inserted = await desktop.insertIconLibraryIcon({
        iconId: icon.id,
        projectPath,
      });
      scope.assertCurrent();
      preloadInsertedAssets([inserted]);
      const asset = inserted.asset;
      addAssetToCurrentPage(
        asset,
        "icon",
        vectorDataFromInsertedAsset(inserted),
      );
      setNotice({
        tone: "success",
        text: `已插入图标“${icon.name}”`,
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        text: `插入图标失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      setInsertingIconId(null);
    }
  };

return { iconLibrary, iconLibraryLoading, iconSearch, setIconSearch, iconGroup, setIconGroup, iconPreviews, insertingIconId, filteredLibraryIcons, visibleLibraryIcons, loadMoreLibraryIcons, preloadInsertedAssets, importAsset, handleCanvasPasteCapture, insertLibraryIcon };
}
