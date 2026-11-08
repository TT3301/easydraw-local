// Opens a project whose canvases hold large content far from the origin and checks
// that each first visit is fitted without an intermediate viewport.
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInitialDocument } from "../src/core/document-fixtures";
import { createNativeElement, serializeProjectDocument } from "@easydraw/document-model";
import electron from "electron";
const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");
const directory = await mkdtemp(join(tmpdir(), "easydraw-fit-test-"));
let child: ReturnType<typeof spawn> | undefined;
// A grid of cards covering width x height, starting at (x, y).
const cards = (prefix: string, x: number, y: number, width: number, height: number) =>
  Array.from({ length: 12 }, (_, i) => createNativeElement({ id: `${prefix}-${i}`, type: "rectangle",
    x: x + (i % 4) * (width / 4), y: y + Math.floor(i / 4) * (height / 3), width: width / 4 - 40, height: height / 3 - 40 }));
try {
  const file = join(directory, "适配测试.edw");
  const stored = serializeProjectDocument(createInitialDocument("适配测试"));
  const [first] = stored.tree;
  stored.canvases[first.id].scene.elements = cards("wide", 5000, 3000, 4000, 2000);
  stored.canvases[first.id].focusedPageElementId = null;
  const second = { ...first, id: "canvas_fit_second", name: "远处画布", order: 1 };
  stored.tree.push(second);
  stored.canvases[second.id] = { id: second.id, focusedPageElementId: null, scene: { elements: cards("far", -9000, -6000, 6000, 2400) } };
  const zip = new AdmZip();
  zip.addFile("project.json", Buffer.from(JSON.stringify(stored)));
  await writeFile(file, zip.toBuffer());
  child = spawn(electron as unknown as string, ["tests/desktop/canvas-fit-smoke.cjs", file], { cwd: resolve("."), stdio: ["ignore", "pipe", "inherit"] });
  let output = "";
  child.stdout!.on("data", chunk => { output += chunk; process.stdout.write(chunk); });
  const timeout = setTimeout(() => child?.kill(), 60000);
  try {
    const code = await new Promise<number | null>((done, reject) => { child!.once("close", done); child!.once("error", reject); });
    if (code !== 0 || !output.includes("CANVAS_FIT_SMOKE_OK")) throw new Error("Canvas fit smoke failed");
  } finally { clearTimeout(timeout); }
} finally {
  if (child?.pid) await rm(join(tmpdir(), `easydraw-smoke-${child.pid}`), { recursive: true, force: true });
  await rm(directory, { recursive: true, force: true });
}
