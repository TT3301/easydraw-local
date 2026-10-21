import type { InsertedAssetResult } from "../../desktop-api";
import type { SvgVectorData } from "../../core/protocol";
import { parseSvgVectorBase64 } from "./svg-vector";
export const vectorDataFromInsertedAsset = (
  inserted: InsertedAssetResult,
): SvgVectorData => {
  if (inserted.asset.mimeType !== "image/svg+xml") {
    throw new Error("图标素材必须是 SVG");
  }
  const vectorData = parseSvgVectorBase64(inserted.data);
  if (!vectorData) {
    throw new Error(`无法解析 SVG 图标：${inserted.asset.fileName}`);
  }
  return vectorData;
};

