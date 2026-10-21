import { SceneElementSchema, type SceneElement } from "../core/protocol";

const canonicalizeJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeJson(entry)]),
    );
  }
  return value;
};

export const sceneElementSignature = (element: SceneElement) =>
  JSON.stringify(canonicalizeJson(element));

export const sceneElementsSignature = (
  elements: readonly SceneElement[],
) => JSON.stringify(canonicalizeJson(elements));

export const areSceneElementsCommitReady = (
  elements: readonly SceneElement[],
) =>
  elements.every(
    (element) => SceneElementSchema.safeParse(element).success,
  );

export const mergeManualCanvasElements = (
  documentElements: readonly SceneElement[],
  previousCanvasElements: readonly SceneElement[],
  nextCanvasElements: readonly SceneElement[],
): SceneElement[] => {
  const documentById = new Map(
    documentElements.map((element) => [element.id, element]),
  );
  const previousCanvasById = new Map(
    previousCanvasElements.map((element) => [element.id, element]),
  );

  const nextIds = new Set(nextCanvasElements.map(element => element.id));
  const merged = nextCanvasElements.map((nextElement) => {
    const previousCanvasElement = previousCanvasById.get(nextElement.id);
    const documentElement = documentById.get(nextElement.id);
    if (
      previousCanvasElement &&
      documentElement &&
      sceneElementSignature(previousCanvasElement) ===
        sceneElementSignature(nextElement)
    ) {
      return documentElement;
    }
    return nextElement;
  });
  // Preserve remote additions made after this working copy was observed.
  return [...merged, ...documentElements.filter(element =>
    !previousCanvasById.has(element.id) && !nextIds.has(element.id))];
};
