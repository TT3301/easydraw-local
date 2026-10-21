import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { scanIconLibrary } = require("./icon-library.cjs") as {
  scanIconLibrary(rootPath: string, options?: { maxIcons?: number }): Promise<{
    icons: Array<{
      id: string;
      name: string;
      group: string;
      relativePath: string;
      width: number;
      height: number;
    }>;
    groups: string[];
    skipped: number;
    truncated: boolean;
  }>;
};

const temporaryDirectories: string[] = [];

const makeLibrary = async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "easydraw-icons-"),
  );
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("icon library scanner", () => {
  it("indexes safe SVG files and derives groups from folders", async () => {
    const root = await makeLibrary();
    await fs.mkdir(path.join(root, "导航"), { recursive: true });
    await fs.writeFile(
      path.join(root, "导航", "arrow-left.svg"),
      '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    );

    const result = await scanIconLibrary(root);

    expect(result.groups).toEqual(["导航"]);
    expect(result.icons).toHaveLength(1);
    expect(result.icons[0]).toMatchObject({
      name: "arrow left",
      group: "导航",
      relativePath: "导航/arrow-left.svg",
      width: 24,
      height: 24,
    });
  });

  it("skips unsafe SVG files", async () => {
    const root = await makeLibrary();
    await fs.writeFile(
      path.join(root, "unsafe.svg"),
      '<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>',
    );

    const result = await scanIconLibrary(root);

    expect(result.icons).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it("caps very large libraries", async () => {
    const root = await makeLibrary();
    await Promise.all(
      ["one", "two", "three"].map((name) =>
        fs.writeFile(
          path.join(root, `${name}.svg`),
          '<svg width="24" height="24"></svg>',
        ),
      ),
    );

    const result = await scanIconLibrary(root, { maxIcons: 2 });

    expect(result.icons).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});
