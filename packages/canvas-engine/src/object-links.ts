import type { NativeProjectDocument } from "@easydraw/document-model";

export interface ObjectLink {
  projectId: string | null;
  canvasId: string | null;
  id: string;
  type: "element" | "group" | null;
}

export function createObjectLink(projectId: string, canvasId: string, id: string, type: "element" | "group"): string {
  const url = new URL("easydraw://object");
  url.search = new URLSearchParams({ project: projectId, canvas: canvasId, element: id, type }).toString();
  return url.toString();
}

export function parseObjectLink(link: string, pageUrl: string): ObjectLink | null {
  let url: URL;
  try { url = new URL(link); } catch {
    if (/^easydraw:/i.test(link)) throw new Error("对象链接无效");
    return null;
  }
  const internal = url.protocol === "easydraw:";
  if (!internal) {
    const page = new URL(pageUrl);
    // Old desktop links include the installation path; accept them without navigating to that file.
    const legacyDesktop = url.protocol === "file:" && /\/dist\/index\.html$/.test(url.pathname);
    if (!legacyDesktop && (url.origin !== page.origin || url.pathname !== page.pathname)) return null;
    if (!url.searchParams.has("element")) return null;
  }
  const id = url.searchParams.get("element");
  const projectId = internal ? url.searchParams.get("project") : null;
  const canvasId = internal ? url.searchParams.get("canvas") : null;
  const type = internal ? url.searchParams.get("type") : null;
  if (!id || (internal && (url.host !== "object" || url.username || url.password ||
      (url.pathname !== "" && url.pathname !== "/") || !projectId || !canvasId ||
      (type !== "element" && type !== "group")))) throw new Error("对象链接无效");
  return { projectId, canvasId, id, type: type as ObjectLink["type"] };
}

export function resolveObjectLink(document: NativeProjectDocument, link: ObjectLink) {
  if (link.projectId && link.projectId !== document.projectId) throw new Error("对象链接属于其他项目，请先打开对应项目");
  const canvasIds = link.canvasId ? [link.canvasId] : Object.keys(document.canvases);
  for (const canvasId of canvasIds) {
    if (!Object.hasOwn(document.canvases, canvasId)) continue;
    const scene = canvasId === document.activeCanvasId ? document.scene : document.canvases[canvasId].scene;
    const live = scene.elements.filter(element => !element.isDeleted);
    const element = link.type !== "group" && live.find(element => element.id === link.id);
    const elements = element ? [element] : link.type !== "element" ? live.filter(element => element.groupIds.includes(link.id)) : [];
    if (elements.length) return { canvasId, elements };
  }
  throw new Error("链接目标不存在，可能已被删除");
}
