import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
const { hashSkillDirectory } = createRequire(import.meta.url)("./skill-content.cjs");
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });
async function setup() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "easydraw-skill-content-"));
  directories.push(directory);
  await fs.mkdir(path.join(directory, "references"));
  await fs.writeFile(path.join(directory, "SKILL.md"), "skill instructions");
  await fs.writeFile(path.join(directory, "references/protocol.md"), "protocol");
  return directory;
}
describe("bundled skill content fingerprint", () => {
  it("is independent of installation path and file creation order", async () => {
    const first = await setup(), second = await setup();
    await fs.rm(path.join(second, "SKILL.md"));
    await fs.writeFile(path.join(second, "SKILL.md"), "skill instructions");
    expect(await hashSkillDirectory(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashSkillDirectory(first)).toBe(await hashSkillDirectory(second));
  });
  it("detects changes to instructions, references, added files and renamed files", async () => {
    const directory = await setup();
    const initial = await hashSkillDirectory(directory);
    await fs.writeFile(path.join(directory, "SKILL.md"), "updated instructions");
    expect(await hashSkillDirectory(directory)).not.toBe(initial);
    await fs.writeFile(path.join(directory, "SKILL.md"), "skill instructions");
    await fs.writeFile(path.join(directory, "references/protocol.md"), "updated protocol");
    expect(await hashSkillDirectory(directory)).not.toBe(initial);
    await fs.writeFile(path.join(directory, "references/protocol.md"), "protocol");
    await fs.writeFile(path.join(directory, "references/extra.md"), "extra");
    expect(await hashSkillDirectory(directory)).not.toBe(initial);
    await fs.rm(path.join(directory, "references/extra.md"));
    expect(await hashSkillDirectory(directory)).toBe(initial);
    await fs.rename(path.join(directory, "references/protocol.md"), path.join(directory, "references/renamed.md"));
    expect(await hashSkillDirectory(directory)).not.toBe(initial);
  });
  it("rejects incomplete skill directories", async () => {
    const directory = await setup();
    await fs.rm(path.join(directory, "SKILL.md"));
    await expect(hashSkillDirectory(directory)).rejects.toThrow("Skill 文件缺失");
  });
});
