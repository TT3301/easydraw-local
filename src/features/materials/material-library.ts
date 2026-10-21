import type { EasyDrawElement } from "@easydraw/canvas-engine/element/types";
import type {
  LibraryItem,
  LibraryItems,
} from "@easydraw/canvas-engine/types";
import type { PageElement } from "../../core/protocol";

export const MATERIAL_LIBRARY_STORAGE_KEY =
  "easydraw:material-library:v1";

const supportedMaterialTypes = new Set([
  "rectangle",
  "ellipse",
  "line",
  "arrow",
  "text",
]);

export const isMaterialLibraryElementType = (type: string) =>
  supportedMaterialTypes.has(type);

type MaterialLibraryElement = LibraryItem["elements"][number];

export type MaterialLibraryBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const isMaterialLibraryElement = (
  element: EasyDrawElement,
): element is MaterialLibraryElement =>
  !element.isDeleted && isMaterialLibraryElementType(element.type);

export const parseStoredMaterialLibrary = (
  serialized: string | null,
): LibraryItems => {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LibraryItem =>
        Boolean(
          item &&
            typeof item === "object" &&
            "id" in item &&
            typeof item.id === "string" &&
            "elements" in item &&
            Array.isArray(item.elements),
        ),
    );
  } catch {
    return [];
  }
};

export const getMaterialLibraryBounds = (
  elements: readonly MaterialLibraryElement[],
): MaterialLibraryBounds => {
  if (elements.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(
    ...elements.map((element) => element.x + Math.max(1, element.width)),
  );
  const bottom = Math.max(
    ...elements.map((element) => element.y + Math.max(1, element.height)),
  );
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
};

export const createMaterialLibraryItem = ({
  sceneElements,
  selectedIds,
  id,
  name,
  created = Date.now(),
}: {
  sceneElements: readonly EasyDrawElement[];
  selectedIds: ReadonlySet<string>;
  id: string;
  name: string;
  created?: number;
}): LibraryItem | null => {
  const expandedIds = new Set(selectedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of sceneElements) {
      const containerId =
        "containerId" in element ? element.containerId : null;
      if (
        element.isDeleted ||
        !containerId ||
        !expandedIds.has(containerId) ||
        expandedIds.has(element.id)
      ) {
        continue;
      }
      expandedIds.add(element.id);
      changed = true;
    }
  }

  const elements = sceneElements
    .filter(
      (element) =>
        expandedIds.has(element.id) && isMaterialLibraryElement(element),
    )
    .map(
      (element) =>
        ({
          ...structuredClone(element),
          frameId: null,
        }) as MaterialLibraryElement,
    );
  if (elements.length === 0) return null;

  return {
    id,
    status: "unpublished",
    elements,
    created,
    name,
  };
};

export const instantiateMaterialLibraryItem = ({
  item,
  page,
  createId,
}: {
  item: LibraryItem;
  page: PageElement;
  createId: () => string;
}): EasyDrawElement[] => {
  const supportedElements = item.elements.filter((element) =>
    isMaterialLibraryElementType(element.type),
  );
  if (supportedElements.length === 0) return [];

  const bounds = getMaterialLibraryBounds(supportedElements);
  const offsetX = page.x + (page.width - bounds.width) / 2 - bounds.x;
  const offsetY = page.y + (page.height - bounds.height) / 2 - bounds.y;
  const elementIds = new Map(
    supportedElements.map((element) => [element.id, createId()]),
  );
  const groupIds = new Map<string, string>();

  return supportedElements.map((element) => {
    const cloned = structuredClone(element);
    const nextGroups = element.groupIds.map((groupId) => {
      let nextGroupId = groupIds.get(groupId);
      if (!nextGroupId) {
        nextGroupId = createId();
        groupIds.set(groupId, nextGroupId);
      }
      return nextGroupId;
    });
    const inserted = {
      ...cloned,
      id: elementIds.get(element.id) ?? createId(),
      x: element.x + offsetX,
      y: element.y + offsetY,
      frameId: page.id,
      groupIds: nextGroups,
      boundElements: null,
      locked: false,
    } as unknown as EasyDrawElement & Record<string, unknown>;
    const mutableInserted = inserted as unknown as Record<string, unknown>;
    if ("containerId" in inserted) mutableInserted.containerId = null;
    if ("startBinding" in inserted) mutableInserted.startBinding = null;
    if ("endBinding" in inserted) mutableInserted.endBinding = null;
    return inserted;
  });
};
