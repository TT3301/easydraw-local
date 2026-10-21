import { describe, expect, it } from "vitest";
import { createNativeElement, NativeProjectDocumentSchema, serializeProjectDocument } from "@easydraw/document-model";
import { createObjectLink, parseObjectLink, resolveObjectLink } from "../../packages/canvas-engine/src/object-links";
import { createInitialDocument } from "../core/protocol";

const pageUrl = "file:///Applications/EasyDraw.app/Contents/Resources/app.asar/dist/index.html";
const fixture = () => {
  const document = createInitialDocument();
  document.tree.push({ id: "second", type: "canvas", name: "第二张", parentId: null, order: 1 });
  document.canvases.second = { id: "second", focusedPageElementId: null, scene: { elements: [
    createNativeElement({ id: "target / 中文", type: "rectangle", x: 8000, y: 9000, width: 100, height: 60, groupIds: ["group"] }),
    createNativeElement({ id: "group-member", type: "rectangle", x: 8200, y: 9000, width: 100, height: 60, groupIds: ["group"] }),
  ] } };
  return document;
};

describe("project object links", () => {
  it("survives serialization/reopening and resolves an object on a different canvas without a local path", () => {
    const document = fixture();
    const href = createObjectLink(document.projectId, "second", "target / 中文", "element");
    expect(href).not.toContain("file:");
    expect(href).not.toContain("Applications");
    document.scene.elements[0].link = href;
    const reopened = NativeProjectDocumentSchema.parse(JSON.parse(JSON.stringify(serializeProjectDocument(document))));
    const link = parseObjectLink(reopened.scene.elements[0].link!, pageUrl)!;
    const target = resolveObjectLink(reopened, link);
    expect(target.canvasId).toBe("second");
    expect(target.elements.map(element => element.id)).toEqual(["target / 中文"]);
  });

  it("finds a group and ignores deleted members", () => {
    const document = fixture();
    const link = parseObjectLink(createObjectLink(document.projectId, "second", "group", "group"), pageUrl)!;
    expect(resolveObjectLink(document, link).elements).toHaveLength(2);
    document.canvases.second.scene.elements[0].isDeleted = true;
    expect(resolveObjectLink(document, link).elements.map(element => element.id)).toEqual(["group-member"]);
  });

  it("uses the active working projection and accepts legacy desktop links after moving the installation", () => {
    const document = fixture();
    document.scene.elements = [createNativeElement({ id: "recent", type: "rectangle", x: 0, y: 0, width: 100, height: 50 })];
    const link = parseObjectLink("file:///old-install/dist/index.html?element=recent", pageUrl)!;
    expect(resolveObjectLink(document, link).canvasId).toBe(document.activeCanvasId);
    const legacyGroup = parseObjectLink("file:///old-install/dist/index.html?element=group", pageUrl)!;
    expect(resolveObjectLink(document, legacyGroup).elements).toHaveLength(2);
  });

  it("leaves external links alone, including unrelated websites with an element query", () => {
    expect(parseObjectLink("https://example.com/?element=target", pageUrl)).toBeNull();
    expect(parseObjectLink("https://example.com/", "https://canvas.test/project")).toBeNull();
    expect(parseObjectLink("https://canvas.test/project?element=target", "https://canvas.test/project#section")).toMatchObject({ id: "target" });
    expect(parseObjectLink("not-a-url", pageUrl)).toBeNull();
  });

  it("rejects malformed links, other projects, deleted objects, and removed canvases", () => {
    const document = fixture();
    for (const href of ["easydraw:%%%", "easydraw://object?element=x", "easydraw://user@object?project=p&canvas=c&element=x&type=element"]) {
      expect(() => parseObjectLink(href, pageUrl)).toThrow("对象链接无效");
    }
    const link = parseObjectLink(createObjectLink(document.projectId, "second", "target / 中文", "element"), pageUrl)!;
    expect(() => resolveObjectLink(document, { ...link, projectId: "another-project" })).toThrow("其他项目");
    document.canvases.second.scene.elements[0].isDeleted = true;
    expect(() => resolveObjectLink(document, link)).toThrow("链接目标不存在");
    expect(() => resolveObjectLink(document, { ...link, canvasId: "missing" })).toThrow("链接目标不存在");
  });
});
