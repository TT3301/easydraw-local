const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const AdmZip = require("adm-zip");

const MAX_PROJECT_BYTES = 512 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const MAX_ASSET_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 10000;
const isBackup = (name) => /^project\.json\.v3-backup(?:-\d+)?$/.test(name);
const normalizeProjectPath = (selectedPath) => `${selectedPath.replace(/\.edw$/i, "")}.edw`;

const assetPath = (relativePath) => {
  const portable = String(relativePath).replaceAll("\\", "/");
  if (!portable.startsWith("assets/") || portable.length > 512 ||
      portable.split("/").some((part) => !part || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error("素材路径无效");
  }
  return portable;
};

const atomicWrite = async (targetPath, data) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp-${crypto.randomUUID()}`;
  try {
    await fs.writeFile(temporaryPath, data, { flag: "wx" });
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
};

const atomicWriteJson = async (targetPath, value) => {
  if (value?.schemaVersion === 4) {
    const { activeCanvasId, scene, focusedPageElementId, ...project } = value;
    value = project;
    try {
      const original = await fs.readFile(targetPath, "utf8");
      if (JSON.parse(original).schemaVersion === 3) {
        try { await fs.writeFile(`${targetPath}.v3-backup`, original, { flag: "wx" }); }
        catch (error) {
          if (error.code !== "EEXIST") throw error;
          if (await fs.readFile(`${targetPath}.v3-backup`, "utf8") !== original) {
            await fs.writeFile(`${targetPath}.v3-backup-${Date.now()}`, original, { flag: "wx" });
          }
        }
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const data = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await atomicWrite(targetPath, data);
  return data;
};

exports.createProjectStorage = ({ localeText, windowForEvent, smokeProjectPath, projectDialog }) => {
  // Pure storage operations and tests do not need an installed Electron binary.
  const getProjectDialog = () => projectDialog ?? require("electron").dialog;
  // Public project paths stay stable; asset callers only see their authorized working directory.
  const authorizedProjects = new Map();
  const temporaryDirectories = new Set();
  const createWorkspace = async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "easydraw-project-"));
    temporaryDirectories.add(directory);
    return directory;
  };
  const resolveAssetPath = (projectPath, relativePath) => {
    const portable = assetPath(relativePath);
    if (!projectPath) throw new Error("请先打开项目，或新建并保存项目");
    const base = authorizedProjects.get(path.resolve(projectPath));
    if (!base) throw new Error("该项目路径尚未由用户授权，请先打开项目或使用“另存项目”");
    const target = path.resolve(base, portable);
    if (!target.startsWith(`${base}${path.sep}`)) throw new Error("素材路径超出项目目录");
    return target;
  };

  const openArchive = async (projectPath) => {
    if ((await fs.stat(projectPath)).size > MAX_PROJECT_BYTES) throw new Error("项目文件超过 512 MB");
    const zip = new AdmZip(await fs.readFile(projectPath));
    if (zip.getEntryCount() > MAX_ENTRIES) throw new Error("项目文件条目过多");
    const entries = zip.getEntries();
    let totalBytes = 0;
    const names = new Set();
    for (const entry of entries) {
      const name = entry.entryName;
      const canonical = entry.isDirectory ? name.slice(0, -1) : name;
      if (canonical === "assets" && !entry.isDirectory) throw new Error("assets 必须是目录");
      if (names.has(name.toLowerCase())) throw new Error("项目文件存在重复条目");
      names.add(name.toLowerCase());
      if (canonical !== "assets" && name !== "project.json" && !isBackup(name)) {
        if (name.includes("\\") || assetPath(canonical) !== canonical) throw new Error("项目文件条目路径无效");
      }
      if ((entry.attr >>> 16 & 0xf000) === 0xa000 || entry.header.encrypted) {
        throw new Error("项目文件不支持符号链接或加密 ZIP 条目");
      }
      totalBytes += entry.header.size;
      if (entry.header.size > (name.startsWith("assets/") ? MAX_ASSET_BYTES : MAX_JSON_BYTES) ||
          totalBytes > MAX_PROJECT_BYTES) throw new Error("项目解压后大小超过限制");
    }
    const projectEntry = zip.getEntry("project.json");
    if (!projectEntry || projectEntry.isDirectory) throw new Error("项目文件缺少 project.json");
    const projectData = projectEntry.getData();
    if (projectData.length !== projectEntry.header.size) throw new Error("项目文件条目大小不匹配");
    const document = JSON.parse(projectData.toString("utf8"));
    // Reopening must retain imported assets awaiting the renderer's next autosave.
    const root = authorizedProjects.get(projectPath) ?? await createWorkspace();
    for (const entry of entries) {
      if (entry.isDirectory || entry.entryName === "project.json") continue;
      const data = entry.getData(); // adm-zip checks CRC and bounds inflation by the declared size.
      if (data.length !== entry.header.size) throw new Error("项目文件条目大小不匹配");
      const target = path.join(root, entry.entryName);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
    }
    await fs.writeFile(path.join(root, "project.json"), projectData);
    authorizedProjects.set(projectPath, root);
    return document;
  };

  const saveArchive = async (projectPath, root, document) => {
    const projectData = await atomicWriteJson(path.join(root, "project.json"), document);
    const zip = new AdmZip();
    let totalBytes = 0;
    const addFile = async (name, limit) => {
      const file = path.join(root, name);
      const size = (await fs.stat(file)).size;
      totalBytes += size;
      if (size > limit || totalBytes > MAX_PROJECT_BYTES) throw new Error("项目内容大小超过限制（总计 512 MB）");
      zip.addFile(name, await fs.readFile(file));
    };
    if (projectData.length > MAX_JSON_BYTES) throw new Error("项目 JSON 超过 64 MB");
    zip.addFile("project.json", projectData);
    totalBytes += projectData.length;
    for (const name of await fs.readdir(root)) {
      if (isBackup(name)) await addFile(name, MAX_JSON_BYTES);
    }
    for (const name of new Set((document.assets ?? []).map((asset) => assetPath(asset.relativePath)))) {
      try { await addFile(name, MAX_ASSET_BYTES); }
      catch (error) {
        if (error.code === "ENOENT") throw new Error(`素材缺失：${name}`);
        throw error;
      }
    }
    if (zip.getEntryCount() > MAX_ENTRIES) throw new Error("项目文件条目过多");
    // ponytail: rewrites the whole ZIP on save; switch to streaming if large projects need it.
    const data = await zip.toBufferPromise();
    if (data.length > MAX_PROJECT_BYTES) throw new Error("项目文件超过 512 MB");
    await atomicWrite(projectPath, data);
  };

  const register = (ipcMain) => {
    ipcMain.handle("easydraw:project:open", async (event, requestedPath) => {
      if (requestedPath !== undefined && (typeof requestedPath !== "string" || !requestedPath.trim())) {
        throw new Error(localeText("请选择 .edw 项目文件", "Choose an .edw project file"));
      }
      let selectedPath = requestedPath ?? smokeProjectPath;
      if (!selectedPath) {
        const result = await getProjectDialog().showOpenDialog(windowForEvent(event), {
          title: localeText("打开 EasyDraw 项目", "Open EasyDraw project"),
          buttonLabel: localeText("打开项目", "Open project"),
          properties: ["openFile"],
          filters: [{ name: "EasyDraw", extensions: ["edw"] }],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        [selectedPath] = result.filePaths;
      }
      const projectPath = path.resolve(selectedPath);
      if (!/\.edw$/i.test(projectPath)) {
        throw new Error(localeText("请选择 .edw 项目文件", "Choose an .edw project file"));
      }
      if (!(await fs.stat(projectPath)).isFile()) {
        throw new Error(localeText("仅支持 .edw 单文件项目", "Only single-file .edw projects are supported"));
      }
      const document = await openArchive(projectPath);
      return { projectPath, document };
    });

    ipcMain.handle("easydraw:project:save-as", async (event, { suggestedName, sourceProjectPath, document }) => {
      let selectedPath = smokeProjectPath;
      if (!selectedPath) {
        const result = await getProjectDialog().showSaveDialog(windowForEvent(event), {
          title: localeText("项目另存为", "Save project as"),
          defaultPath: normalizeProjectPath(suggestedName || localeText("未命名原型", "Untitled prototype")),
          buttonLabel: localeText("保存项目", "Save project"),
          filters: [{ name: "EasyDraw", extensions: ["edw"] }],
        });
        if (result.canceled || !result.filePath) return null;
        selectedPath = result.filePath;
      }
      const projectPath = path.resolve(normalizeProjectPath(selectedPath));
      try {
        if ((await fs.stat(projectPath)).isDirectory()) {
          throw new Error(localeText("此位置是文件夹，请另选文件名保存项目", "This location is a folder; choose another file name"));
        }
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      const sameSource = sourceProjectPath && path.resolve(sourceProjectPath) === projectPath;
      const root = (sameSource && authorizedProjects.get(projectPath)) || await createWorkspace();
      for (const asset of document.assets ?? []) {
        const target = path.join(root, assetPath(asset.relativePath));
        const source = resolveAssetPath(sourceProjectPath, asset.relativePath);
        if (source === target) continue;
        await fs.mkdir(path.dirname(target), { recursive: true });
        try { await fs.copyFile(source, target); }
        catch (error) {
          if (error.code === "ENOENT") throw new Error(`素材缺失：${asset.fileName}`);
          throw error;
        }
      }
      await saveArchive(projectPath, root, document);
      authorizedProjects.set(projectPath, root);
      return { projectPath };
    });

    ipcMain.handle("easydraw:project:save", async (_event, { projectPath, document }) => {
      const resolved = path.resolve(projectPath);
      const root = authorizedProjects.get(resolved);
      if (!root) throw new Error("该项目路径尚未由用户授权，请使用“另存项目”");
      await saveArchive(resolved, root, document);
      return { projectPath: resolved };
    });
  };
  const dispose = () => {
    for (const directory of temporaryDirectories) fsSync.rmSync(directory, { recursive: true, force: true });
    temporaryDirectories.clear();
    authorizedProjects.clear();
  };
  return { register, resolveAssetPath, dispose };
};
