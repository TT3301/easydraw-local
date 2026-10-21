import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Plugin } from "vite";

const engineRoot = fileURLToPath(new URL("../packages/canvas-engine/", import.meta.url));

/** Keep the runtime boundary and attribution in every distributed canvas build. */
export const ownedEngineBuild = (): Plugin => ({
  name: "owned-engine-build",
  generateBundle() {
    for (const id of this.getModuleIds()) {
      if (id.includes("node_modules/@excalidraw/excalidraw/")) {
        this.error(`Only the owned canvas source may enter this build: ${id}`);
      }
    }
    const notices = ["EasyDraw canvas engine — source and font notices\n",
      "Initial source: Excalidraw v0.18.1. Maintained as a source fork in EasyDraw.\n",
      readFileSync(join(engineRoot, "LICENSE"), "utf8")];
    const fonts = join(engineRoot, "src/editor/fonts");
    for (const directory of readdirSync(fonts, { withFileTypes: true }).filter((item) => item.isDirectory())) {
      const entry = join(fonts, directory.name, "index.ts");
      if (!existsSync(entry)) continue;
      const source = readFileSync(entry, "utf8");
      for (const match of source.matchAll(/\/\*[\s\S]*?\*\//g)) {
        if (/copyright|open font license|licensed under/i.test(match[0])) {
          notices.push(`\nFont ${directory.name}\n${match[0].slice(2, -2)}`);
        }
      }
    }
    this.emitFile({ type: "asset", fileName: "licenses/canvas-engine-notices.txt", source: notices.join("\n") });
  },
});
