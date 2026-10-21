import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  CATEGORY_LABELS,
  iconId,
} = require("../electron/remix-icon-library.cjs");

const root = path.resolve("remix-icons");
const tags = JSON.parse(
  await fs.readFile(path.join(root, "tags.json"), "utf8"),
);
const normalizeIconName = (name) => name.replace(/-line$/, "");
const iconDisplayName = (name) =>
  normalizeIconName(name).replaceAll("-", " ");
const parseTags = (value) =>
  typeof value === "string"
    ? value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
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
    const data = await fs.readFile(path.join(categoryPath, file.name));
    const normalizedName = normalizeIconName(name);
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
      relativePath: `${category}/${file.name}`,
      width: 24,
      height: 24,
      size: data.length,
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
    });
  }
}

entries.sort((left, right) =>
  left.name.localeCompare(right.name, "en"),
);
await fs.writeFile(
  path.join(root, "manifest.json"),
  `${JSON.stringify({ schemaVersion: 1, entries })}\n`,
  "utf8",
);
process.stdout.write(`Generated ${entries.length} Remix Icon entries.\n`);
