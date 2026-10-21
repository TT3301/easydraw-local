const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

exports.hashSkillDirectory = async directory => {
  const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries.filter(entry => entry.isFile())
    .map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/")).sort();
  if (!files.includes("SKILL.md")) throw new Error("应用内 Skill 文件缺失。");
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const content = await fs.readFile(path.join(directory, file));
    hash.update(JSON.stringify([file, content.toString("base64")]));
  }
  return hash.digest("hex");
};
