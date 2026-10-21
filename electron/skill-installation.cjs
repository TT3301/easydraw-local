const fs = require("node:fs/promises");
const path = require("node:path");

// Run only after the user clicks Connect/Update in EasyDraw.
exports.installBundledSkill = async ({ source, destination, legacyPath }) => {
  await fs.access(path.join(source, "SKILL.md"));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true, force: true });
  if (!legacyPath) return;
  let content;
  try { content = await fs.readFile(path.join(legacyPath, "SKILL.md"), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  // Preserve unrelated/user-authored skills. Archive the former shipped skill
  // outside the discovery directory instead of deleting its files.
  if (!/^name:\s*easydraw-prototype\s*$/m.test(content) || !content.includes("# EasyDraw prototype workflow")) return;
  const archiveRoot = path.join(path.dirname(path.dirname(legacyPath)), "skill-archive");
  await fs.mkdir(archiveRoot, { recursive: true });
  await fs.rename(legacyPath, path.join(archiveRoot, `easydraw-prototype-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`));
};
