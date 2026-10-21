const supportedCanvasTools = new Set([
  "selection",
  "hand",
  "frame",
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "text",
  "freedraw",
  "eraser",
  "laser",
]);

export const isSupportedCanvasTool = (tool: string) =>
  supportedCanvasTools.has(tool);
