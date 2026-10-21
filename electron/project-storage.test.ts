import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInitialDocument } from "../src/core/protocol";
import { SceneController } from "../src/core/scene-controller";
const require = createRequire(import.meta.url);
const { createProjectStorage } = require("./project-storage.cjs");
const AdmZip = require("adm-zip");
const directories: string[] = [];
const storages: Array<ReturnType<typeof createProjectStorage>> = [];
afterEach(async () => {
  for (const storage of storages.splice(0)) storage.dispose();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
function storageAt(projectPath?: string, projectDialog?: unknown) {
  const handlers = new Map<string, Function>();
  const storage = createProjectStorage({ localeText: (s: string) => s, windowForEvent: () => null,
    smokeProjectPath: projectPath, projectDialog });
  storages.push(storage);
  storage.register({ handle: (name: string, fn: Function) => handlers.set(name, fn) });
  const call = (name: string, input?: unknown) => handlers.get(`easydraw:project:${name}`)!(null, input);
  return { storage, call };
}
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "easydraw-storage-test-")); directories.push(directory);
  const projectPath = join(directory, "测试项目.edw");
  return { directory, projectPath, ...storageAt(projectPath) };
}
const imageData = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16"/></svg>');
const sha256 = createHash("sha256").update(imageData).digest("hex");
const imageAsset = { id: `asset_${sha256.slice(0, 24)}`, kind: "svg" as const, fileName: "测试.svg",
  relativePath: `assets/${sha256}.svg`, mimeType: "image/svg+xml", width: 24, height: 16,
  size: imageData.length, sha256, createdAt: new Date().toISOString() };

describe("multi-canvas project disk persistence", () => {
  it("writes all scenes without editor projection fields and opens them losslessly", async () => {
    const { projectPath, call } = await setup(), controller = new SceneController(createInitialDocument());
    const second = controller.manageTree({ op: "create", type: "canvas", name: "B", parentId: null })!;
    controller.switchCanvas(second);
    await call("save-as", { document: controller.getSnapshot().document });
    expect((await stat(projectPath)).isFile()).toBe(true);
    const raw = JSON.parse(new AdmZip(await readFile(projectPath)).readAsText("project.json"));
    expect(Object.keys(raw.canvases)).toHaveLength(2);
    expect(raw).not.toHaveProperty("scene"); expect(raw).not.toHaveProperty("activeCanvasId");
    expect((await call("open")).document).toEqual(raw);
  });
});

describe("single-file project container", () => {
  it("opens a system-provided file path without showing the file picker", async () => {
    const { projectPath, call } = await setup();
    const document = createInitialDocument("系统打开");
    await call("save-as", { document });
    const projectDialog = { showOpenDialog: vi.fn() };
    const external = storageAt(undefined, projectDialog);
    expect(await external.call("open", projectPath)).toMatchObject({ projectPath, document: { projectId: document.projectId } });
    expect(projectDialog.showOpenDialog).not.toHaveBeenCalled();
    for (const invalid of [null, 42, "", projectPath.replace(/\.edw$/, ".json")]) {
      await expect(external.call("open", invalid)).rejects.toThrow("请选择 .edw");
    }
  });

  it.each(["新项目", "新项目.EDW"])("uses .edw without doubling the suffix for %s", async (fileName) => {
    const { directory } = await setup();
    const projectDialog = {
      showSaveDialog: vi.fn(async (_window: unknown, _options: unknown) => ({ filePath: join(directory, fileName) })),
    };
    const { call } = storageAt(undefined, projectDialog);
    const saved = await call("save-as", { suggestedName: fileName, document: createInitialDocument() });
    expect(saved.projectPath).toBe(join(directory, "新项目.edw"));
    expect(projectDialog.showSaveDialog.mock.calls[0][1]).toMatchObject({
      defaultPath: "新项目.edw", filters: [{ name: "EasyDraw", extensions: ["edw"] }],
    });
    expect((await stat(saved.projectPath)).isFile()).toBe(true);
  });

  it("packs imported assets, autosaves, and reopens after moving only the file to another directory", async () => {
    const { directory, projectPath, call, storage } = await setup();
    const document = createInitialDocument();
    await call("save-as", { document });
    const assetFile = storage.resolveAssetPath(projectPath, imageAsset.relativePath);
    await mkdir(dirname(assetFile), { recursive: true });
    await writeFile(assetFile, imageData);
    await call("open"); // A staged import is not lost by reopening before autosave.
    document.assets = [imageAsset]; document.revision = 2;
    await call("save", { projectPath, document });
    const zip = new AdmZip(await readFile(projectPath));
    expect(zip.readFile(imageAsset.relativePath)).toEqual(imageData);
    expect(JSON.parse(zip.readAsText("project.json")).revision).toBe(2);
    expect(await readdir(directory)).toEqual(["测试项目.edw"]);
    const movedDirectory = await mkdtemp(join(tmpdir(), "easydraw-moved-")); directories.push(movedDirectory);
    const movedPath = join(movedDirectory, "移动.edw");
    await writeFile(movedPath, await readFile(projectPath));
    storage.dispose(); await rm(directory, { recursive: true, force: true });
    const moved = storageAt(movedPath);
    const opened = await moved.call("open");
    expect(opened.document.assets).toEqual([imageAsset]);
    expect(await readFile(moved.storage.resolveAssetPath(movedPath, imageAsset.relativePath))).toEqual(imageData);
    const workingDirectory = dirname(dirname(moved.storage.resolveAssetPath(movedPath, imageAsset.relativePath)));
    moved.storage.dispose();
    await expect(stat(workingDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("copies an .edw project and its assets through Save As", async () => {
    const { directory, projectPath, call: sourceCall, storage: sourceStorage } = await setup();
    await sourceCall("save-as", { document: createInitialDocument() });
    const document = createInitialDocument(); document.assets = [imageAsset];
    const assetFile = sourceStorage.resolveAssetPath(projectPath, imageAsset.relativePath);
    await mkdir(dirname(assetFile), { recursive: true });
    await writeFile(assetFile, imageData);
    await sourceCall("save", { projectPath, document });
    const original = await readFile(projectPath);
    const target = join(directory, "便携项目");
    const projectDialog = { showOpenDialog: vi.fn(async (_window: unknown, _options: unknown) => ({ filePaths: [projectPath] })),
      showSaveDialog: vi.fn(async (_window: unknown, _options: unknown) => ({ filePath: target })) };
    const { call, storage } = storageAt(undefined, projectDialog);
    expect((await call("open")).projectPath).toBe(projectPath);
    const saved = await call("save-as", { document, sourceProjectPath: projectPath });
    expect(saved.projectPath).toBe(`${target}.edw`);
    expect((await stat(saved.projectPath)).isFile()).toBe(true);
    expect(await readFile(projectPath)).toEqual(original);
    expect(await readFile(storage.resolveAssetPath(saved.projectPath, imageAsset.relativePath))).toEqual(imageData);
    expect(projectDialog.showOpenDialog.mock.calls[0]).toMatchObject([null, {
      properties: ["openFile"], filters: [{ name: "EasyDraw", extensions: ["edw"] }],
    }]);
    projectDialog.showOpenDialog.mockResolvedValue({ filePaths: [saved.projectPath] });
    expect((await call("open")).document.assets).toEqual([imageAsset]);
  });

  it("leaves the last saved archive intact when an asset is missing", async () => {
    const { directory, projectPath, call } = await setup();
    const document = createInitialDocument();
    await call("save-as", { document });
    const original = await readFile(projectPath);
    await expect(call("save", { projectPath, document: { ...document, assets: [imageAsset] } })).rejects.toThrow("素材缺失");
    expect(await readFile(projectPath)).toEqual(original);
    expect(await readdir(directory)).toEqual(["测试项目.edw"]);
  });

  it("rejects directories and unauthorised saves and asset paths", async () => {
    const { projectPath, call, storage } = await setup();
    const document = createInitialDocument();
    await mkdir(projectPath);
    await writeFile(join(projectPath, "project.json"), JSON.stringify(document));
    await expect(call("open")).rejects.toThrow("单文件");
    await expect(call("save-as", { document })).rejects.toThrow("文件夹");
    await expect(call("save", { projectPath, document })).rejects.toThrow("授权");
    expect(() => storage.resolveAssetPath(projectPath, imageAsset.relativePath)).toThrow("授权");
    await rm(projectPath, { recursive: true });
    await call("save-as", { document });
    for (const name of ["../escape.svg", "assets/../escape.svg", "assets/a/../../escape.svg", "assets/C:/escape.svg", "assets/NUL.svg", "assets/foo."]) {
      expect(() => storage.resolveAssetPath(projectPath, name)).toThrow("路径");
    }
  });

  it("rejects .easydraw files, old directory projects, and standalone project.json", async () => {
    const { directory } = await setup();
    const oldFile = join(directory, "旧单文件.easydraw");
    const zip = new AdmZip(); zip.addFile("project.json", Buffer.from(JSON.stringify(createInitialDocument())));
    await writeFile(oldFile, zip.toBuffer());
    const oldDirectory = join(directory, "旧目录.easydraw");
    await mkdir(oldDirectory);
    const json = join(oldDirectory, "project.json");
    await writeFile(json, JSON.stringify(createInitialDocument()));
    for (const selected of [oldFile, oldDirectory, json]) {
      const { call, storage } = storageAt(selected);
      await expect(call("open")).rejects.toThrow("请选择 .edw 项目文件");
      expect(() => storage.resolveAssetPath(selected, imageAsset.relativePath)).toThrow("授权");
    }
    expect((await stat(oldFile)).isFile()).toBe(true);
    expect((await stat(oldDirectory)).isDirectory()).toBe(true);
  });

  it("cleans up the temporary archive and preserves the original when the final rename fails", async () => {
    const { directory, projectPath, call } = await setup();
    const document = createInitialDocument();
    await call("save-as", { document });
    const original = await readFile(projectPath);
    const fs = require("node:fs/promises");
    const rename = fs.rename;
    const spy = vi.spyOn(fs, "rename").mockImplementation(async (from: unknown, to: unknown) => {
      if (to === projectPath) throw new Error("disk write failed");
      return rename(from, to);
    });
    try {
      await expect(call("save", { projectPath, document: { ...document, revision: 2 } })).rejects.toThrow("disk write failed");
      expect(await readFile(projectPath)).toEqual(original);
      expect(await readdir(directory)).toEqual(["测试项目.edw"]);
    } finally { spy.mockRestore(); }
  });

  it("keeps an exact v3 backup inside the archive across upgraded saves", async () => {
    const { projectPath, call } = await setup();
    const document = createInitialDocument();
    const original = JSON.stringify({ schemaVersion: 3, scene: document.scene, assets: [] });
    const zip = new AdmZip(); zip.addFile("project.json", Buffer.from(original));
    await writeFile(projectPath, zip.toBuffer());
    await call("open");
    await call("save-as", { sourceProjectPath: projectPath, document });
    await call("save", { projectPath, document: { ...document, revision: 2 } });
    const saved = new AdmZip(await readFile(projectPath));
    expect(saved.readAsText("project.json.v3-backup")).toBe(original);
    expect(JSON.parse(saved.readAsText("project.json")).schemaVersion).toBe(4);
  });

  it("rejects unsafe paths, oversized inflation, and corrupt containers", async () => {
    const { projectPath, call, storage } = await setup();
    const zip = new AdmZip(); zip.addFile("project.json", Buffer.from(JSON.stringify(createInitialDocument())));
    zip.addFile("assets/escape.svg", imageData);
    // Assign directly because addFile normalizes names before writing.
    zip.getEntry("assets/escape.svg").entryName = "assets/../escape.svg";
    await writeFile(projectPath, zip.toBuffer());
    await expect(call("open")).rejects.toThrow("路径");
    expect(() => storage.resolveAssetPath(projectPath, imageAsset.relativePath)).toThrow("授权");
    const large = new AdmZip(); large.addFile("project.json", Buffer.from("{}"));
    const data = large.toBuffer();
    const central = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    data.writeUInt32LE(65 * 1024 * 1024, central + 24);
    await writeFile(projectPath, data);
    await expect(call("open")).rejects.toThrow("大小超过限制");
    await writeFile(projectPath, Buffer.from("not a ZIP"));
    await expect(call("open")).rejects.toThrow();
    const corrupt = new AdmZip(); corrupt.addFile("project.json", Buffer.from("{}"));
    const corruptData = corrupt.toBuffer();
    corruptData[30 + "project.json".length] ^= 0xff;
    await writeFile(projectPath, corruptData);
    await expect(call("open")).rejects.toThrow();
  });
});
