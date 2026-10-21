import type { NonDeletedEasyDrawElement } from "./types";
import { getSelectedElements } from "../scene";
import type { UIAppState } from "../types";

export const showSelectedShapeActions = (
  appState: UIAppState,
  elements: readonly NonDeletedEasyDrawElement[],
) =>
  Boolean(
    !appState.viewModeEnabled &&
      appState.openDialog?.name !== "elementLinkSelector" &&
      ((appState.activeTool.type !== "custom" &&
        (appState.editingTextElement ||
          (appState.activeTool.type !== "selection" &&
            appState.activeTool.type !== "eraser" &&
            appState.activeTool.type !== "hand" &&
            appState.activeTool.type !== "laser"))) ||
        getSelectedElements(elements, appState).length),
  );
