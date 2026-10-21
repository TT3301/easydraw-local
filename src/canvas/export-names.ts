export const safeExportName = (value: string) =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim() || "页面";
