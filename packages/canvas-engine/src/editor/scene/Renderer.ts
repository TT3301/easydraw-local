import { isElementInViewport } from "../element/sizeHelpers";
import { isImageElement } from "../element/typeChecks";
import type {
  EasyDrawElement,
  NonDeletedElementsMap,
  NonDeletedEasyDrawElement,
} from "../element/types";
import { renderInteractiveSceneThrottled } from "../renderer/interactiveScene";
import { renderStaticSceneThrottled } from "../renderer/staticScene";

import type { AppState } from "../types";
import { memoize, toBrandedType } from "../utils";
import type Scene from "./Scene";
import type { RenderableElementsMap } from "./types";

export class Renderer {
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public getRenderableElements = (() => {
    const getVisibleCanvasElements = ({
      elementsMap,
      zoom,
      offsetLeft,
      offsetTop,
      scrollX,
      scrollY,
      height,
      width,
    }: {
      elementsMap: NonDeletedElementsMap;
      zoom: AppState["zoom"];
      offsetLeft: AppState["offsetLeft"];
      offsetTop: AppState["offsetTop"];
      scrollX: AppState["scrollX"];
      scrollY: AppState["scrollY"];
      height: AppState["height"];
      width: AppState["width"];
    }): readonly NonDeletedEasyDrawElement[] => {
      const visibleElements: NonDeletedEasyDrawElement[] = [];
      for (const element of elementsMap.values()) {
        if (
          isElementInViewport(
            element,
            width,
            height,
            {
              zoom,
              offsetLeft,
              offsetTop,
              scrollX,
              scrollY,
            },
            elementsMap,
          )
        ) {
          visibleElements.push(element);
        }
      }
      return visibleElements;
    };

    const getRenderableElements = ({
      elements,
      editingTextElement,
      newElementId,
      pendingImageElementId,
    }: {
      elements: readonly NonDeletedEasyDrawElement[];
      editingTextElement: AppState["editingTextElement"];
      newElementId: EasyDrawElement["id"] | undefined;
      pendingImageElementId: AppState["pendingImageElementId"];
    }) => {
      const elementsMap = toBrandedType<RenderableElementsMap>(new Map());

      for (const element of elements) {
        if (isImageElement(element)) {
          if (
            // => not placed on canvas yet (but in elements array)
            pendingImageElementId === element.id
          ) {
            continue;
          }
        }

        if (newElementId === element.id) {
          continue;
        }

        // we don't want to render text element that's being currently edited
        // (it's rendered on remote only)
        if (
          !editingTextElement ||
          editingTextElement.type !== "text" ||
          element.id !== editingTextElement.id
        ) {
          elementsMap.set(element.id, element);
        }
      }
      return elementsMap;
    };

    return memoize(
      ({
        zoom,
        offsetLeft,
        offsetTop,
        scrollX,
        scrollY,
        height,
        width,
        editingTextElement,
        newElementId,
        pendingImageElementId,
        frameToHighlight,
        selectedElementsAreBeingDragged,
        selectedElements,
        // cache-invalidation nonce
        sceneNonce: _sceneNonce,
      }: {
        zoom: AppState["zoom"];
        offsetLeft: AppState["offsetLeft"];
        offsetTop: AppState["offsetTop"];
        scrollX: AppState["scrollX"];
        scrollY: AppState["scrollY"];
        height: AppState["height"];
        width: AppState["width"];
        editingTextElement: AppState["editingTextElement"];
        /** note: first render of newElement will always bust the cache
         * (we'd have to prefilter elements outside of this function) */
        newElementId: EasyDrawElement["id"] | undefined;
        pendingImageElementId: AppState["pendingImageElementId"];
        frameToHighlight: AppState["frameToHighlight"];
        selectedElementsAreBeingDragged: AppState["selectedElementsAreBeingDragged"];
        selectedElements: readonly NonDeletedEasyDrawElement[];
        sceneNonce: ReturnType<InstanceType<typeof Scene>["getSceneNonce"]>;
      }) => {
        const elements = this.scene.getNonDeletedElements();

        const elementsMap = getRenderableElements({
          elements,
          editingTextElement,
          newElementId,
          pendingImageElementId,
        });

        let visibleElements = getVisibleCanvasElements({
          elementsMap,
          zoom,
          offsetLeft,
          offsetTop,
          scrollX,
          scrollY,
          height,
          width,
        });

        // Preview the same top-of-page insertion order that drop commits.
        if (selectedElementsAreBeingDragged && frameToHighlight && selectedElements.length &&
            selectedElements.some((element) => element.frameId !== frameToHighlight.id) &&
            !selectedElements.some((element) => element.type === "frame" || element.type === "magicframe")) {
          const selectedIds = new Set(selectedElements.map((element) => element.id));
          const moving = visibleElements.filter((element) => selectedIds.has(element.id));
          const ordered = visibleElements.filter((element) => !selectedIds.has(element.id));
          let insertion = ordered.findIndex((element) => element.id === frameToHighlight.id);
          if (insertion < 0) {
            insertion = ordered.length;
            for (let index = ordered.length - 1; index >= 0; index--) {
              if (ordered[index].frameId === frameToHighlight.id) { insertion = index + 1; break; }
            }
          }
          ordered.splice(insertion, 0, ...moving);
          visibleElements = ordered;
        }
        return { elementsMap, visibleElements };
      },
    );
  })();

  // NOTE Doesn't destroy everything (scene, rc, etc.) because it may not be
  // safe to break TS contract here (for upstream cases)
  public destroy() {
    renderInteractiveSceneThrottled.cancel();
    renderStaticSceneThrottled.cancel();
    this.getRenderableElements.clear();
  }
}
