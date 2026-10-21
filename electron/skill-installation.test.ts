import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it, expect } from "vitest";
const { installBundledSkill } = require("./skill-installation.cjs");
it("installs the product sketch skill and archives the former shipped skill outside discovery", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "easydraw-skill-test-"));
  try {
    const source = path.join(root, "bundle"), destination = path.join(root, ".agents/skills/easydraw-product-sketch"), legacyPath = path.join(root, ".agents/skills/easydraw-prototype");
    await fs.mkdir(source, { recursive: true }); await fs.mkdir(legacyPath, { recursive: true });
    await fs.writeFile(path.join(source, "SKILL.md"), "name: easydraw-product-sketch\n");
    await fs.writeFile(path.join(legacyPath, "SKILL.md"), "name: easydraw-prototype\n# EasyDraw prototype workflow\n");
    await fs.writeFile(path.join(legacyPath, "user-note.txt"), "Preserve this");
    await installBundledSkill({ source, destination, legacyPath });
    expect(await fs.readFile(path.join(destination, "SKILL.md"), "utf8")).toContain("product-sketch");
    await expect(fs.access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
    const archive = (await fs.readdir(path.join(root, ".agents/skill-archive")))[0];
    expect(await fs.readFile(path.join(root, ".agents/skill-archive", archive, "user-note.txt"), "utf8")).toBe("Preserve this");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
it("preserves a user-authored skill at the former name", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "easydraw-skill-test-"));
  try {
    const source = path.join(root, "bundle"), destination = path.join(root, "skills/new"), legacyPath = path.join(root, "skills/easydraw-prototype");
    await fs.mkdir(source, { recursive: true }); await fs.mkdir(legacyPath, { recursive: true });
    await fs.writeFile(path.join(source, "SKILL.md"), "name: easydraw-product-sketch\n");
    await fs.writeFile(path.join(legacyPath, "SKILL.md"), "name: custom-prototype\nMy custom workflow");
    await installBundledSkill({ source, destination, legacyPath });
    expect(await fs.readFile(path.join(legacyPath, "SKILL.md"), "utf8")).toContain("My custom workflow");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
