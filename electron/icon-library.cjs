const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  readSvgDimensions,
  validateSvg,
} = require("./svg-dimensions.cjs");

const DEFAULT_MAX_ICONS = 5000;
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_DIRECTORY_DEPTH = 8;

const portablePath = (value) => value.split(path.sep).join("/");

const displayName = (fileName) =>
  path
    .basename(fileName, path.extname(fileName))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const scanIconLibrary = async (
  rootPath,
  { maxIcons = DEFAULT_MAX_ICONS } = {},
) => {
  const root = path.resolve(rootPath);
  const icons = [];
  let skipped = 0;
  let truncated = false;
  const directories = [{ absolutePath: root, depth: 0 }];

  while (directories.length > 0 && icons.length < maxIcons) {
    const current = directories.shift();
    let entries;
    try {
      entries = await fs.readdir(current.absolutePath, {
        withFileTypes: true,
      });
    } catch {
      skipped += 1;
      continue;
    }
    entries.sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    );

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolutePath = path.join(current.absolutePath, entry.name);
      if (
        entry.isDirectory() &&
        current.depth < MAX_DIRECTORY_DEPTH
      ) {
        directories.push({
          absolutePath,
          depth: current.depth + 1,
        });
        continue;
      }
      if (
        !entry.isFile() ||
        path.extname(entry.name).toLowerCase() !== ".svg"
      ) {
        continue;
      }
      if (icons.length >= maxIcons) {
        truncated = true;
        break;
      }

      try {
        const stat = await fs.stat(absolutePath);
        if (stat.size <= 0 || stat.size > MAX_ICON_BYTES) {
          skipped += 1;
          continue;
        }
        const data = await fs.readFile(absolutePath);
        validateSvg(data);
        const dimensions = readSvgDimensions(data);
        const relativePath = portablePath(path.relative(root, absolutePath));
        const directory = portablePath(path.dirname(relativePath));
        const group = directory === "." ? "未分组" : directory;
        const id = `icon_${crypto
          .createHash("sha256")
          .update(relativePath.toLowerCase())
          .digest("hex")
          .slice(0, 24)}`;
        icons.push({
          id,
          name: displayName(entry.name),
          fileName: entry.name,
          group,
          relativePath,
          absolutePath,
          width: dimensions.width,
          height: dimensions.height,
          size: stat.size,
        });
      } catch {
        skipped += 1;
      }
    }
  }

  if (directories.length > 0) truncated = true;
  const groups = [...new Set(icons.map((icon) => icon.group))].sort(
    (left, right) => left.localeCompare(right, "zh-CN"),
  );
  return {
    root,
    rootName: path.basename(root),
    icons,
    groups,
    skipped,
    truncated,
  };
};

module.exports = {
  DEFAULT_MAX_ICONS,
  MAX_ICON_BYTES,
  scanIconLibrary,
};
