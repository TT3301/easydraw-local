import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createIconSelectionService } = require("./icon-selection.cjs");
const { createIconResolver } = require("./icon-embedding.cjs");
const root = path.resolve("assets/icon-embedding");
const { loadRemixIconLibrary } = require("./remix-icon-library.cjs");
const entries = (await loadRemixIconLibrary(path.resolve("remix-icons"))).snapshot.icons;
describe("offline icon selection", () => {
  it("uses the real bundled model in a persistent worker, accepting approximate top1", async () => {
    const service = createIconSelectionService(root, async () => entries);
    try {
      const descriptions = ["shopping cart icon", "notification bell icon", "settings gear icon"];
      const result = await service.resolve(descriptions);
      expect(result.map((icon: { id: string }) => icon.id)).toEqual(["remix_finance_shopping_cart", "remix_media_notification", "remix_system_list_settings"]);
      expect(await service.resolve(descriptions)).toEqual(result);
      const [a, b] = await Promise.all([service.resolve(["search icon"]), service.resolve(["home icon"])]);
      expect(a[0].assetRef).toMatch(/^builtin:icon:/);
      expect(b[0].assetRef).toMatch(/^builtin:icon:/);
      await expect(service.resolve([" "])).rejects.toThrow("descriptions");
    } finally { service.close(); }
  }, 30000);
  it("rejects stale index metadata before loading inference", async () => {
    await expect(createIconResolver(root, entries.slice(1))).rejects.toThrow("outdated");
  });
});
