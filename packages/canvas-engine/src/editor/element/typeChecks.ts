import { ROUNDNESS } from "../constants";
import type { ElementOrToolType } from "../types";
import type { MarkNonNullable } from "../utility-types";
import { assertNever } from "../utils";
import type { Bounds } from "./bounds";
import type {
  EasyDrawElement,
  EasyDrawTextElement,
  EasyDrawEmbeddableElement,
  EasyDrawLinearElement,
  EasyDrawBindableElement,
  EasyDrawFreeDrawElement,
  InitializedEasyDrawImageElement,
  EasyDrawImageElement,
  EasyDrawTextElementWithContainer,
  EasyDrawTextContainer,
  EasyDrawFrameElement,
  RoundnessType,
  EasyDrawFrameLikeElement,
  EasyDrawElementType,
  EasyDrawIframeElement,
  EasyDrawIframeLikeElement,
  EasyDrawMagicFrameElement,
  EasyDrawArrowElement,
  EasyDrawElbowArrowElement,
  PointBinding,
  FixedPointBinding,
  EasyDrawFlowchartNodeElement,
} from "./types";

export const isInitializedImageElement = (
  element: EasyDrawElement | null,
): element is InitializedEasyDrawImageElement => {
  return !!element && element.type === "image" && !!element.fileId;
};

export const isImageElement = (
  element: EasyDrawElement | null,
): element is EasyDrawImageElement => {
  return !!element && element.type === "image";
};

export const isEmbeddableElement = (
  element: EasyDrawElement | null | undefined,
): element is EasyDrawEmbeddableElement => {
  return !!element && element.type === "embeddable";
};

export const isIframeElement = (
  element: EasyDrawElement | null,
): element is EasyDrawIframeElement => {
  return !!element && element.type === "iframe";
};

export const isIframeLikeElement = (
  element: EasyDrawElement | null,
): element is EasyDrawIframeLikeElement => {
  return (
    !!element && (element.type === "iframe" || element.type === "embeddable")
  );
};

export const isTextElement = (
  element: EasyDrawElement | null,
): element is EasyDrawTextElement => {
  return element != null && element.type === "text";
};

export const isFrameElement = (
  element: EasyDrawElement | null,
): element is EasyDrawFrameElement => {
  return element != null && element.type === "frame";
};

export const isMagicFrameElement = (
  element: EasyDrawElement | null,
): element is EasyDrawMagicFrameElement => {
  return element != null && element.type === "magicframe";
};

export const isFrameLikeElement = (
  element: EasyDrawElement | null,
): element is EasyDrawFrameLikeElement => {
  return (
    element != null &&
    (element.type === "frame" || element.type === "magicframe")
  );
};

export const isFreeDrawElement = (
  element?: EasyDrawElement | null,
): element is EasyDrawFreeDrawElement => {
  return element != null && isFreeDrawElementType(element.type);
};

export const isFreeDrawElementType = (
  elementType: EasyDrawElementType,
): boolean => {
  return elementType === "freedraw";
};

export const isLinearElement = (
  element?: EasyDrawElement | null,
): element is EasyDrawLinearElement => {
  return element != null && isLinearElementType(element.type);
};

export const isArrowElement = (
  element?: EasyDrawElement | null,
): element is EasyDrawArrowElement => {
  return element != null && element.type === "arrow";
};

export const isElbowArrow = (
  element?: EasyDrawElement,
): element is EasyDrawElbowArrowElement => {
  return isArrowElement(element) && element.elbowed;
};

export const isLinearElementType = (
  elementType: ElementOrToolType,
): boolean => {
  return (
    elementType === "arrow" || elementType === "line" // || elementType === "freedraw"
  );
};

export const isBindingElement = (
  element?: EasyDrawElement | null,
  includeLocked = true,
): element is EasyDrawLinearElement => {
  return (
    element != null &&
    (!element.locked || includeLocked === true) &&
    isBindingElementType(element.type)
  );
};

export const isBindingElementType = (
  elementType: ElementOrToolType,
): boolean => {
  return elementType === "arrow";
};

export const isBindableElement = (
  element: EasyDrawElement | null | undefined,
  includeLocked = true,
): element is EasyDrawBindableElement => {
  return (
    element != null &&
    (!element.locked || includeLocked === true) &&
    // Must match isConnectorBindingTarget in @easydraw/document-model.
    (element.type === "rectangle" ||
      element.type === "diamond" ||
      element.type === "ellipse" ||
      element.type === "image" ||
      element.type === "iframe" ||
      element.type === "embeddable" ||
      element.type === "frame" ||
      element.type === "magicframe" ||
      (element.type === "text" && !element.containerId))
  );
};

export const isRectanguloidElement = (
  element?: EasyDrawElement | null,
): element is EasyDrawBindableElement => {
  return (
    element != null &&
    (element.type === "rectangle" ||
      element.type === "diamond" ||
      element.type === "image" ||
      element.type === "iframe" ||
      element.type === "embeddable" ||
      element.type === "frame" ||
      element.type === "magicframe" ||
      (element.type === "text" && !element.containerId))
  );
};

// TODO: Remove this when proper distance calculation is introduced
// @see binding.ts:distanceToBindableElement()
export const isRectangularElement = (
  element?: EasyDrawElement | null,
): element is EasyDrawBindableElement => {
  return (
    element != null &&
    (element.type === "rectangle" ||
      element.type === "image" ||
      element.type === "text" ||
      element.type === "iframe" ||
      element.type === "embeddable" ||
      element.type === "frame" ||
      element.type === "magicframe" ||
      element.type === "freedraw")
  );
};

export const isTextBindableContainer = (
  element: EasyDrawElement | null,
  includeLocked = true,
): element is EasyDrawTextContainer => {
  return (
    element != null &&
    (!element.locked || includeLocked === true) &&
    (element.type === "rectangle" ||
      element.type === "diamond" ||
      element.type === "ellipse" ||
      isArrowElement(element))
  );
};

export const isEasyDrawElement = (
  element: any,
): element is EasyDrawElement => {
  const type: EasyDrawElementType | undefined = element?.type;
  if (!type) {
    return false;
  }
  switch (type) {
    case "text":
    case "diamond":
    case "rectangle":
    case "iframe":
    case "embeddable":
    case "ellipse":
    case "arrow":
    case "freedraw":
    case "line":
    case "frame":
    case "magicframe":
    case "image":
    case "selection": {
      return true;
    }
    default: {
      assertNever(type, null);
      return false;
    }
  }
};

export const isFlowchartNodeElement = (
  element: EasyDrawElement,
): element is EasyDrawFlowchartNodeElement => {
  return (
    element.type === "rectangle" ||
    element.type === "ellipse" ||
    element.type === "diamond"
  );
};

export const hasBoundTextElement = (
  element: EasyDrawElement | null,
): element is MarkNonNullable<EasyDrawBindableElement, "boundElements"> => {
  return (
    isTextBindableContainer(element) &&
    !!element.boundElements?.some(({ type }) => type === "text")
  );
};

export const isBoundToContainer = (
  element: EasyDrawElement | null,
): element is EasyDrawTextElementWithContainer => {
  return (
    element !== null &&
    "containerId" in element &&
    element.containerId !== null &&
    isTextElement(element)
  );
};

export const isUsingAdaptiveRadius = (type: string) =>
  type === "rectangle" || type === "frame" ||
  type === "embeddable" ||
  type === "iframe" ||
  type === "image";

export const isUsingProportionalRadius = (type: string) =>
  type === "line" || type === "arrow" || type === "diamond";

export const canApplyRoundnessTypeToElement = (
  roundnessType: RoundnessType,
  element: EasyDrawElement,
) => {
  if (
    (roundnessType === ROUNDNESS.ADAPTIVE_RADIUS ||
      // if legacy roundness, it can be applied to elements that currently
      // use adaptive radius
      roundnessType === ROUNDNESS.LEGACY) &&
    isUsingAdaptiveRadius(element.type)
  ) {
    return true;
  }
  if (
    roundnessType === ROUNDNESS.PROPORTIONAL_RADIUS &&
    isUsingProportionalRadius(element.type)
  ) {
    return true;
  }

  return false;
};

export const getDefaultRoundnessTypeForElement = (
  element: EasyDrawElement,
) => {
  if (isUsingProportionalRadius(element.type)) {
    return {
      type: ROUNDNESS.PROPORTIONAL_RADIUS,
    };
  }

  if (isUsingAdaptiveRadius(element.type)) {
    return {
      type: ROUNDNESS.ADAPTIVE_RADIUS,
    };
  }

  return null;
};

export const isFixedPointBinding = (
  binding: PointBinding | FixedPointBinding,
): binding is FixedPointBinding => {
  return (
    Object.hasOwn(binding, "fixedPoint") &&
    (binding as FixedPointBinding).fixedPoint != null
  );
};

// TODO: Move this to @easydraw/canvas-engine/math
export const isBounds = (box: unknown): box is Bounds =>
  Array.isArray(box) &&
  box.length === 4 &&
  typeof box[0] === "number" &&
  typeof box[1] === "number" &&
  typeof box[2] === "number" &&
  typeof box[3] === "number";
