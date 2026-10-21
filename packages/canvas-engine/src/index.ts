export * from "./editor/index";
export { createObjectLink, parseObjectLink, resolveObjectLink } from "./object-links";
export { EasyDraw as EasyDrawCanvas } from "./editor/index";
export type { EasyDrawElement } from "./editor/element/types";
export type { EasyDrawImperativeAPI, EasyDrawProps } from "./editor/types";

/** Source engine capabilities, exposed on the mounted canvas for diagnostics. */
export const CANVAS_ENGINE_ID = "easydraw-source-v1";
