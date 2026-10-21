import type { EasyDrawTextContainer } from "./types";

export const originalContainerCache: {
  [id: EasyDrawTextContainer["id"]]:
    | {
        height: EasyDrawTextContainer["height"];
      }
    | undefined;
} = {};

export const updateOriginalContainerCache = (
  id: EasyDrawTextContainer["id"],
  height: EasyDrawTextContainer["height"],
) => {
  const data =
    originalContainerCache[id] || (originalContainerCache[id] = { height });
  data.height = height;
  return data;
};

export const resetOriginalContainerCache = (
  id: EasyDrawTextContainer["id"],
) => {
  if (originalContainerCache[id]) {
    delete originalContainerCache[id];
  }
};

export const getOriginalContainerHeightFromCache = (
  id: EasyDrawTextContainer["id"],
) => {
  return originalContainerCache[id]?.height ?? null;
};
