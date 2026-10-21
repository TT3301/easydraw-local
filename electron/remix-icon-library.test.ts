import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const {
  loadRemixIconLibrary,
} = require("./remix-icon-library.cjs") as {
  loadRemixIconLibrary(rootPath: string): Promise<{
    entries: Map<
      string,
      {
        absolutePath: string;
        group: string;
        sha256: string;
        assetId: string;
      }
    >;
    snapshot: {
      configured: boolean;
      rootName: string;
      license: string;
      groups: string[];
      icons: Array<{
        id: string;
        name: string;
        group: string;
        tags: string[];
      }>;
    };
  }>;
};

describe("bundled Remix Icon library", () => {
  it("loads only outlined SVGs with official categories and tags", async () => {
    const library = await loadRemixIconLibrary(
      path.resolve("remix-icons"),
    );

    expect(library.snapshot.configured).toBe(true);
    expect(library.snapshot.rootName).toBe("Remix Icon");
    expect(library.snapshot.license).toBe("Remix Icon License v1.0");
    expect(library.snapshot.icons).toHaveLength(1_690);
    expect(library.snapshot.groups).toHaveLength(20);
    expect(library.snapshot.groups).toContain("编辑");
    expect(library.snapshot.groups).toContain("系统");

    const search = library.snapshot.icons.find(
      (icon) => icon.id === "remix_system_search",
    );
    expect(search).toMatchObject({
      name: "search",
      group: "系统",
    });
    expect(search?.tags).toContain("search");
    expect(
      library.snapshot.icons.every((icon) =>
        icon.tags.every((tag) => typeof tag === "string"),
      ),
    ).toBe(true);
    expect(
      library.snapshot.icons.every(
        (icon) => !icon.fileName.toLowerCase().includes("fill"),
      ),
    ).toBe(true);
    expect(
      library.entries.get("remix_system_search")?.absolutePath,
    ).toMatch(/[\\/]remix-icons[\\/]System[\\/]search-line\.svg$/);
    const searchEntry = library.entries.get("remix_system_search");
    const searchData = await fs.readFile(searchEntry!.absolutePath);
    const searchHash = crypto
      .createHash("sha256")
      .update(searchData)
      .digest("hex");
    expect(searchEntry?.sha256).toBe(searchHash);
    expect(searchEntry?.assetId).toBe(
      `asset_${searchHash.slice(0, 24)}`,
    );
  });
});
