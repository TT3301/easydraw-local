import throttle from "lodash.throttle";
import { ENV } from "../constants";
import type { OrderedEasyDrawElement } from "../element/types";
import {
  orderByFractionalIndex,
  syncInvalidIndices,
  validateFractionalIndices,
} from "../fractionalIndex";
import type { AppState } from "../types";
import type { MakeBrand } from "../utility-types";
import { arrayToMap } from "../utils";

export type ReconciledEasyDrawElement = OrderedEasyDrawElement &
  MakeBrand<"ReconciledElement">;

export type RemoteEasyDrawElement = OrderedEasyDrawElement &
  MakeBrand<"RemoteEasyDrawElement">;

const shouldDiscardRemoteElement = (
  localAppState: AppState,
  local: OrderedEasyDrawElement | undefined,
  remote: RemoteEasyDrawElement,
): boolean => {
  if (
    local &&
    // local element is being edited
    (local.id === localAppState.editingTextElement?.id ||
      local.id === localAppState.resizingElement?.id ||
      local.id === localAppState.newElement?.id || // TODO: Is this still valid? As newElement is selection element, which is never part of the elements array
      // local element is newer
      local.version > remote.version ||
      // resolve conflicting edits deterministically by taking the one with
      // the lowest versionNonce
      (local.version === remote.version &&
        local.versionNonce < remote.versionNonce))
  ) {
    return true;
  }
  return false;
};

const validateIndicesThrottled = throttle(
  (
    orderedElements: readonly OrderedEasyDrawElement[],
    localElements: readonly OrderedEasyDrawElement[],
    remoteElements: readonly RemoteEasyDrawElement[],
  ) => {
    if (
      import.meta.env.DEV ||
      import.meta.env.MODE === ENV.TEST ||
      window?.DEBUG_FRACTIONAL_INDICES
    ) {
      // create new instances due to the mutation
      const elements = syncInvalidIndices(
        orderedElements.map((x) => ({ ...x })),
      );

      validateFractionalIndices(elements, {
        // throw in dev & test only, to remain functional on `DEBUG_FRACTIONAL_INDICES`
        shouldThrow: import.meta.env.DEV || import.meta.env.MODE === ENV.TEST,
        includeBoundTextValidation: true,
        reconciliationContext: {
          localElements,
          remoteElements,
        },
      });
    }
  },
  1000 * 60,
  { leading: true, trailing: false },
);

export const reconcileElements = (
  localElements: readonly OrderedEasyDrawElement[],
  remoteElements: readonly RemoteEasyDrawElement[],
  localAppState: AppState,
): ReconciledEasyDrawElement[] => {
  const localElementsMap = arrayToMap(localElements);
  const reconciledElements: OrderedEasyDrawElement[] = [];
  const added = new Set<string>();

  // process remote elements
  for (const remoteElement of remoteElements) {
    if (!added.has(remoteElement.id)) {
      const localElement = localElementsMap.get(remoteElement.id);
      const discardRemoteElement = shouldDiscardRemoteElement(
        localAppState,
        localElement,
        remoteElement,
      );

      if (localElement && discardRemoteElement) {
        reconciledElements.push(localElement);
        added.add(localElement.id);
      } else {
        reconciledElements.push(remoteElement);
        added.add(remoteElement.id);
      }
    }
  }

  // process remaining local elements
  for (const localElement of localElements) {
    if (!added.has(localElement.id)) {
      reconciledElements.push(localElement);
      added.add(localElement.id);
    }
  }

  const orderedElements = orderByFractionalIndex(reconciledElements);

  validateIndicesThrottled(orderedElements, localElements, remoteElements);

  // de-duplicate indices
  syncInvalidIndices(orderedElements);

  return orderedElements as ReconciledEasyDrawElement[];
};
