const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const { app, dialog, nativeImage } = require("electron");
const { readSvgDimensions, validateSvg } = require("./svg-dimensions.cjs");
const { MAX_ICON_BYTES } = require("./icon-library.cjs");
const { loadRemixIconLibrary } = require("./remix-icon-library.cjs");
exports.registerAssetHandlers = (ipcMain, { resolveAssetPath, localeText, windowForEvent }) => {
const bundledIconLibraryPath = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, "remix-icons")
    : path.join(__dirname, "..", "remix-icons");
const { createIconSelectionService } = require("./icon-selection.cjs");
const iconSelection = createIconSelectionService(
  app.isPackaged ? path.join(process.resourcesPath, "icon-embedding") : path.join(__dirname, "..", "assets", "icon-embedding"),
  async () => (await currentIconLibrary()).icons,
);
app.once("will-quit", () => iconSelection.close());
ipcMain.handle("easydraw:icons:resolve-descriptions", (_event, payload) => iconSelection.resolve(payload?.descriptions));
const placeholderFileName = (variant = "logo") => {
  if (variant !== "logo" && variant !== "wireframe") throw new Error("Unknown image placeholder variant");
  return `image-placeholder-${variant}.svg`;
};
const bundledImagePlaceholderPath = (variant) => path.join(
  app.isPackaged ? path.join(process.resourcesPath, "image-placeholders") : path.join(__dirname, "..", "placeholder-library"),
  placeholderFileName(variant),
);

let iconLibrarySnapshot = null;
let iconLibraryEntries = new Map();
const iconLibraryDataCache = new Map();
const imagePlaceholderPrepared = new Map();
const mimeForExtension = (extension) =>
  ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  })[extension];

const extensionForClipboardMime = (mimeType) =>
  ({
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
  })[String(mimeType).toLowerCase()];

const clipboardAssetFileName = (fileName, extension) => {
  const requestedName = path.basename(
    typeof fileName === "string" && fileName.trim()
      ? fileName.trim()
      : "clipboard-image",
  );
  const requestedExtension = path.extname(requestedName);
  const stem = path
    .basename(requestedName, requestedExtension)
    .slice(0, 240)
    .trim();
  return `${stem || "clipboard-image"}${extension}`;
};

const persistPreparedAsset = async ({
  projectPath,
  data,
  extension,
  fileName,
  kind,
  dimensions,
  sha256,
  source,
}) => {
  const portableExtension = extension === ".jpeg" ? ".jpg" : extension;
  const relativePath = `assets/${sha256}${portableExtension}`;
  const target = resolveAssetPath(projectPath ?? null, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  let copied = false;
  try {
    await fs.writeFile(target, data, { flag: "wx" });
    copied = true;
  } catch (error) {
    if (!error || error.code !== "EEXIST") throw error;
  }
  return {
    asset: {
      id: `asset_${sha256.slice(0, 24)}`,
      kind,
      fileName,
      relativePath,
      mimeType: mimeForExtension(portableExtension),
      width: dimensions.width,
      height: dimensions.height,
      size: data.length,
      sha256,
      createdAt: new Date().toISOString(),
      ...(source ? { source } : {}),
    },
    data: data.toString("base64"),
    copied,
  };
};

const persistAssetData = async (input) =>
  persistPreparedAsset({
    ...input,
    sha256: crypto
      .createHash("sha256")
      .update(input.data)
      .digest("hex"),
  });

const loadBundledIconLibrary = async () => {
  const root = path.resolve(bundledIconLibraryPath());
  const loaded = await loadRemixIconLibrary(root);
  iconLibraryEntries = loaded.entries;
  iconLibrarySnapshot = loaded.snapshot;
  return iconLibrarySnapshot;
};

const currentIconLibrary = async () =>
  iconLibrarySnapshot ?? loadBundledIconLibrary();

const readIconLibraryEntry = async (iconId) => {
  await currentIconLibrary();
  const entry = iconLibraryEntries.get(iconId);
  const cached = iconLibraryDataCache.get(iconId);
  if (cached) return { entry, data: cached };
  if (!entry) throw new Error("内置图标不存在，请重新打开图标库");
  const stat = await fs.stat(entry.absolutePath);
  if (stat.size <= 0 || stat.size > MAX_ICON_BYTES) {
    throw new Error("图标文件为空或超过 2 MB");
  }
  const data = await fs.readFile(entry.absolutePath);
  validateSvg(data);
  if (!entry.sha256) {
    entry.sha256 = crypto.createHash("sha256").update(data).digest("hex");
    entry.assetId = `asset_${entry.sha256.slice(0, 24)}`;
  }
  iconLibraryDataCache.set(iconId, data);
  return { entry, data };
};

const persistIconLibraryEntry = async (iconId, projectPath) => {
  const { entry, data } = await readIconLibraryEntry(iconId);
  return persistPreparedAsset({
    projectPath,
    data,
    extension: ".svg",
    fileName: entry.fileName,
    kind: "svg",
    dimensions: {
      width: entry.width,
      height: entry.height,
    },
    sha256: entry.sha256,
  });
};

const mapWithConcurrency = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
};

const prepareImagePlaceholder = async (variant = "logo") => {
  const fileName = placeholderFileName(variant);
  if (imagePlaceholderPrepared.has(variant)) return imagePlaceholderPrepared.get(variant);
  const data = await fs.readFile(bundledImagePlaceholderPath(variant));
  validateSvg(data);
  const prepared = {
    data, fileName,
    dimensions: readSvgDimensions(data),
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
  };
  imagePlaceholderPrepared.set(variant, prepared);
  return prepared;
};

  ipcMain.handle(
    "easydraw:asset:import",
    async (event, { projectPath, sourcePath } = {}) => {
      let selectedPath = sourcePath;
      if (selectedPath && process.env.EASYDRAW_SMOKE_TEST !== "1") {
        throw new Error("不允许直接指定素材路径");
      }
      if (!selectedPath) {
        const result = await dialog.showOpenDialog(windowForEvent(event), {
          title: localeText("导入图片", "Import image"),
          properties: ["openFile"],
          filters: [
            {
              name: localeText("图片", "Images"),
              extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
            },
          ],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        [selectedPath] = result.filePaths;
      }

      const source = path.resolve(selectedPath);
      const extension = path.extname(source).toLowerCase();
      const mimeType = mimeForExtension(extension);
      if (!mimeType) throw new Error("仅支持 PNG、JPG、WEBP、GIF 和 SVG");
      const data = await fs.readFile(source);
      if (data.length > 25 * 1024 * 1024) {
        throw new Error("单个素材不能超过 25 MB");
      }
      let dimensions;
      if (extension === ".svg") {
        validateSvg(data);
        dimensions = readSvgDimensions(data);
      } else {
        const image = nativeImage.createFromBuffer(data);
        if (image.isEmpty()) throw new Error("无法读取该图片素材");
        dimensions = image.getSize();
      }
      return persistAssetData({
        projectPath,
        data,
        extension,
        fileName: path.basename(source),
        kind: extension === ".svg" ? "svg" : "image",
        dimensions,
      });
    },
  );

  ipcMain.handle(
    "easydraw:asset:clipboard",
    async (_event, { projectPath, data, mimeType, fileName } = {}) => {
      const extension = extensionForClipboardMime(mimeType);
      if (!extension) {
        throw new Error("剪贴板素材仅支持 PNG、JPG、WebP、GIF 和 SVG");
      }
      if (typeof data !== "string" || data.length === 0) {
        throw new Error("剪贴板素材内容为空");
      }
      const assetData = Buffer.from(data, "base64");
      if (assetData.length === 0) {
        throw new Error("剪贴板素材内容为空");
      }
      if (assetData.length > 25 * 1024 * 1024) {
        throw new Error("单个素材不能超过 25 MB");
      }
      let dimensions;
      if (extension === ".svg") {
        validateSvg(assetData);
        dimensions = readSvgDimensions(assetData);
      } else {
        const image = nativeImage.createFromBuffer(assetData);
        if (image.isEmpty()) {
          throw new Error("无法读取剪贴板中的图片");
        }
        dimensions = image.getSize();
      }
      return persistAssetData({
        projectPath,
        data: assetData,
        extension,
        fileName: clipboardAssetFileName(fileName, extension),
        kind: extension === ".svg" ? "svg" : "image",
        dimensions,
      });
    },
  );

  ipcMain.handle(
    "easydraw:asset:read",
    async (_event, { projectPath, relativePath }) => {
      const target = resolveAssetPath(projectPath ?? null, relativePath);
      try {
        const data = await fs.readFile(target);
        return { data: data.toString("base64") };
      } catch (error) {
        if (error && error.code === "ENOENT") {
          throw new Error(`素材文件不存在：${relativePath}`);
        }
        throw error;
      }
    },
  );

  ipcMain.handle("easydraw:icons:list", async () =>
    currentIconLibrary(),
  );

  ipcMain.handle(
    "easydraw:icons:preview",
    async (_event, { iconId }) => {
      const { data } = await readIconLibraryEntry(iconId);
      return {
        data: data.toString("base64"),
        mimeType: "image/svg+xml",
      };
    },
  );

  ipcMain.handle(
    "easydraw:icons:insert",
    async (_event, { iconId, projectPath }) =>
      persistIconLibraryEntry(iconId, projectPath),
  );

  ipcMain.handle(
    "easydraw:icons:insert-many",
    async (_event, { iconIds, projectPath }) => {
      if (!Array.isArray(iconIds) || iconIds.length === 0) {
        throw new Error("iconIds must be a non-empty array");
      }
      if (iconIds.length > 200) {
        throw new Error("A batch can contain at most 200 icons");
      }
      const uniqueIconIds = [...new Set(iconIds)];
      return mapWithConcurrency(
        uniqueIconIds,
        12,
        async (iconId) => ({
          iconId,
          ...(await persistIconLibraryEntry(iconId, projectPath)),
        }),
      );
    },
  );

  ipcMain.handle("easydraw:placeholder:read", async (_event, { variant } = {}) => {
    const prepared = await prepareImagePlaceholder(variant);
    return { data: prepared.data.toString("base64"), mimeType: "image/svg+xml" };
  });

  ipcMain.handle(
    "easydraw:placeholder:insert",
    async (_event, { projectPath, variant }) => {
      const prepared = await prepareImagePlaceholder(variant);
      return persistPreparedAsset({
        projectPath,
        data: prepared.data,
        extension: ".svg",
        fileName: prepared.fileName,
        kind: "svg",
        dimensions: prepared.dimensions,
        sha256: prepared.sha256,
      });
    },
  );

};
