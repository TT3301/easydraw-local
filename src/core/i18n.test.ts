import { describe, expect, it } from "vitest";
import {
  localizeRuntimeMessage,
  translate,
  translateIconGroup,
} from "./i18n";
import { createInitialDocument } from "./protocol";

describe("application localization", () => {
  it("translates interface labels and interpolates values", () => {
    expect(translate("en", "设置")).toBe("Settings");
    expect(
      translate("en", "当前缩放 {zoom}%，点击恢复 100%", { zoom: 75 }),
    ).toBe("Current zoom 75%, click to reset to 100%");
    expect(translate("zh-CN", "设置")).toBe("设置");
  });

  it("localizes dynamic runtime messages", () => {
    expect(
      localizeRuntimeMessage("en", "页面容器 page-2 不存在"),
    ).toBe("Page frame page-2 does not exist");
    expect(
      localizeRuntimeMessage("en", "已复制页面及 4 个元素"),
    ).toBe("Copied the page and 4 elements");
  });

  it("localizes built-in icon group names", () => {
    expect(translateIconGroup("en", "系统")).toBe("System");
    expect(translateIconGroup("zh-CN", "系统")).toBe("系统");
  });

  it("creates new document content in the active language", () => {
    const englishDocument = createInitialDocument(undefined, "en");
    expect(englishDocument.name).toBe("Untitled prototype");
    expect(englishDocument.scene.elements[0]).toMatchObject({
      type: "frame",
      name: "Home",
    });
  });
});
