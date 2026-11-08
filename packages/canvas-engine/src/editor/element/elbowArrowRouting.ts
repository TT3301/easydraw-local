import { pointFrom } from "../../math";
import type { LocalPoint } from "../../math";
import { ShapeCache } from "../scene/ShapeCache";
import type { AppState } from "../types";
import { tupleToCoors } from "../utils";
import {
  bindLinearElement,
  bindPointToSnapToElementOutline,
  calculateFixedPointForElbowArrowBinding,
  getHoveredElementForBinding,
} from "./binding";
import { updateElbowArrowPoints } from "./elbowArrow";
import { LinearElementEditor } from "./linearElementEditor";
import type {
  EasyDrawBindableElement,
  EasyDrawElbowArrowElement,
  EasyDrawElement,
  FixedPointBinding,
  NonDeletedEasyDrawElement,
  NonDeletedSceneElementsMap,
} from "./types";
import type { Mutable } from "../utility-types";

/**
 * Routes an elbow arrow in place against an explicit elements map.
 *
 * `mutateElement` routes elbow arrows against the element's registered scene.
 * A freshly created copy (an arrow type switch, or a command draft) has no
 * scene, so it would only renormalize its old points and the route would
 * appear on the next edit. Routing here uses the map the caller owns.
 *
 * - `bindHovered`: bind free ends to elements under them (editor behaviour).
 * - `keepFixedPoints`: reuse existing fixed points; otherwise derive them from
 *   the current endpoints, as when a straight arrow becomes elbowed.
 */
export const routeElbowArrow = (
  arrow: Mutable<EasyDrawElbowArrowElement>,
  elements: readonly NonDeletedEasyDrawElement[],
  elementsMap: NonDeletedSceneElementsMap,
  options: {
    zoom?: AppState["zoom"];
    bindHovered: boolean;
    keepFixedPoints: boolean;
  },
) => {
  const startGlobalPoint = LinearElementEditor.getPointAtIndexGlobalCoordinates(
    arrow,
    0,
    elementsMap,
  );
  const endGlobalPoint = LinearElementEditor.getPointAtIndexGlobalCoordinates(
    arrow,
    -1,
    elementsMap,
  );
  const hovered = (
    point: typeof startGlobalPoint,
    binding: FixedPointBinding | null,
  ) =>
    options.bindHovered && !binding
      ? getHoveredElementForBinding(
          tupleToCoors(point),
          elements,
          elementsMap,
          options.zoom,
          false,
          true,
        )
      : null;
  const startHovered = hovered(startGlobalPoint, arrow.startBinding);
  const endHovered = hovered(endGlobalPoint, arrow.endBinding);
  const bound = (binding: FixedPointBinding | null) =>
    binding
      ? (elementsMap.get(binding.elementId) as
          | EasyDrawBindableElement
          | undefined)
      : undefined;
  const startElement = startHovered || bound(arrow.startBinding);
  const endElement = endHovered || bound(arrow.endBinding);

  const finalStartPoint = startHovered
    ? bindPointToSnapToElementOutline(arrow, startHovered, "start")
    : startGlobalPoint;
  const finalEndPoint = endHovered
    ? bindPointToSnapToElementOutline(arrow, endHovered, "end")
    : endGlobalPoint;

  if (startHovered) {
    bindLinearElement(arrow, startHovered, "start", elementsMap);
  }
  if (endHovered) {
    bindLinearElement(arrow, endHovered, "end", elementsMap);
  }

  const fixed = (
    side: "start" | "end",
    element: EasyDrawBindableElement | undefined,
  ): FixedPointBinding | undefined => {
    const binding = side === "start" ? arrow.startBinding : arrow.endBinding;
    if (!element || !binding) {
      return undefined;
    }
    if (options.keepFixedPoints && binding.fixedPoint) {
      return { ...binding };
    }
    return {
      ...binding,
      ...calculateFixedPointForElbowArrowBinding(
        arrow,
        element,
        side,
        elementsMap,
      ),
    };
  };
  const startBinding = fixed("start", startElement);
  const endBinding = fixed("end", endElement);

  // Fresh binding objects (or an omitted binding) defeat the no-op shortcut,
  // so the route is always recomputed.
  const routed = updateElbowArrowPoints(arrow, elementsMap, {
    points: [finalStartPoint, finalEndPoint].map(
      (p): LocalPoint => pointFrom(p[0] - arrow.x, p[1] - arrow.y),
    ),
    ...(startBinding ? { startBinding } : {}),
    ...(endBinding ? { endBinding } : {}),
  });

  Object.assign(arrow, {
    ...(startBinding ? { startBinding } : {}),
    ...(endBinding ? { endBinding } : {}),
    ...routed,
    angle: 0,
  });
  ShapeCache.delete(arrow as EasyDrawElement);
  return arrow;
};
