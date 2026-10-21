const fs = require("node:fs/promises");
const path = require("node:path");

const CATEGORY_LABELS = new Map([
  ["Arrows", "箭头"],
  ["Buildings", "建筑"],
  ["Business", "商务"],
  ["Communication", "沟通"],
  ["Design", "设计"],
  ["Development", "开发"],
  ["Device", "设备"],
  ["Document", "文档"],
  ["Editor", "编辑"],
  ["Finance", "金融"],
  ["Food", "食物"],
  ["Game & Sports", "游戏与运动"],
  ["Health & Medical", "健康与医疗"],
  ["Logos", "品牌"],
  ["Map", "地图"],
  ["Media", "媒体"],
  ["Others", "其他"],
  ["System", "系统"],
  ["User & Faces", "用户与表情"],
  ["Weather", "天气"],
]);

const normalizeIconName = (name) => name.replace(/-line$/, "");
const iconDisplayName = (name) =>
  normalizeIconName(name).replaceAll("-", " ");
const portablePath = (value) => value.split(path.sep).join("/");
const categorySlug = (category) =>
  category.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const iconId = (category, name) =>
  `remix_${categorySlug(category)}_${normalizeIconName(name).replaceAll("-", "_")}`;
const parseTags = (value) =>
  typeof value === "string"
    ? value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

const createLibraryResult = (entries) => {
  entries.sort((left, right) =>
    left.name.localeCompare(right.name, "en"),
  );
  const presentGroups = new Set(entries.map((entry) => entry.group));
  const groups = [...CATEGORY_LABELS.values()].filter((group) =>
    presentGroups.has(group),
  );
  return {
    entries: new Map(entries.map((entry) => [entry.id, entry])),
    snapshot: {
      configured: entries.length > 0,
      rootName: "Remix Icon",
      source: "Remix Icon v4.9.1",
      license: "Remix Icon License v1.0",
      website: "https://remixicon.com",
      groups,
      skipped: 0,
      truncated: false,
      icons: entries.map(
        ({
          absolutePath: _absolutePath,
          sha256: _sha256,
          assetId: _assetId,
          ...entry
        }) => entry,
      ),
    },
  };
};

const loadRemixIconLibrary = async (rootPath) => {
  const root = path.resolve(rootPath);
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(root, "manifest.json"), "utf8"),
    );
    if (
      manifest.schemaVersion === 1 &&
      Array.isArray(manifest.entries)
    ) {
      const entries = manifest.entries.map((entry) => {
        const relativePath = portablePath(entry.relativePath);
        const absolutePath = path.resolve(root, relativePath);
        if (
          relativePath.split("/").includes("..") ||
          !absolutePath.startsWith(`${root}${path.sep}`)
        ) {
          throw new Error(`Invalid icon manifest path: ${relativePath}`);
        }
        return {
          ...entry,
          relativePath,
          absolutePath,
          assetId: `asset_${entry.sha256.slice(0, 24)}`,
        };
      });
      return createLibraryResult(entries);
    }
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }

  const tags = JSON.parse(
    await fs.readFile(path.join(root, "tags.json"), "utf8"),
  );
  const entries = [];

  for (const [category, group] of CATEGORY_LABELS) {
    const categoryPath = path.join(root, category);
    const files = await fs.readdir(categoryPath, { withFileTypes: true });
    for (const file of files) {
      if (
        !file.isFile() ||
        path.extname(file.name).toLowerCase() !== ".svg" ||
        file.name.toLowerCase().includes("fill")
      ) {
        continue;
      }
      const name = path.basename(file.name, ".svg");
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) continue;
      const normalizedName = normalizeIconName(name);
      const relativePath = portablePath(path.join(category, file.name));
      const absolutePath = path.join(root, category, file.name);
      const stat = await fs.stat(absolutePath);
      entries.push({
        id: iconId(category, name),
        name: iconDisplayName(name),
        fileName: file.name,
        group,
        tags: [
          ...new Set([
            ...normalizedName.split("-"),
            ...parseTags(tags?.[category]?.[normalizedName]),
          ]),
        ],
        relativePath,
        absolutePath,
        width: 24,
        height: 24,
        size: stat.size,
      });
    }
  }

  return createLibraryResult(entries);
};

module.exports = {
  CATEGORY_LABELS,
  iconId,
  loadRemixIconLibrary,
};
