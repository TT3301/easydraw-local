import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkPublicSource } from "../../scripts/check-public-source.mjs";

const directories: string[] = [];
const put = (root: string, path: string, content = "") => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "easydraw-public-source-"));
  directories.push(root);
  put(root, "package.json", JSON.stringify({
    license: "MIT",
    workspaces: ["canvas-engine", "document-model", "editor-contracts", "mcp-server"].map(name => `packages/${name}`),
  }));
  for (const path of ["README.md", "README.zh-CN.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]) put(root, path);
  return root;
};
afterEach(() => directories.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

describe("public-source hygiene checker", () => {
  it("accepts a clean source tree while ignoring normal generated output", () => {
    const root = fixture();
    put(root, "src/editor.ts", "export const local = true;");
    put(root, "README.zh-CN.md", "本仓库不包含云端分享。");
    put(root, "dist/generated.js", "generated output");
    put(root, "node_modules/example/index.js", "third-party dependency");
    expect(checkPublicSource(root).errors).toEqual([]);
  });

  it("rejects private configuration, process notes, and saved projects", () => {
    const root = fixture();
    for (const path of [".env", "docs/validation/report.md", "project.edw", "infra/deploy.yml"]) put(root, path);
    const errors = checkPublicSource(root).errors.join("\n");
    for (const path of [".env", "docs/validation/report.md", "project.edw", "infra/deploy.yml"]) expect(errors).toContain(path);
  });

  it("detects cloud packages and application publication APIs", () => {
    const root = fixture();
    put(root, "src/accidental.ts", "desktop.getShareCapability();");
    put(root, "package-lock.json", JSON.stringify({ dependencies: { [["@easydraw", "share-codec"].join("/")]: "1.0.0" } }));
    const errors = checkPublicSource(root).errors.join("\n");
    expect(errors).toContain("src/accidental.ts: removed cloud runtime surface");
    expect(errors).toContain("package-lock.json: cloud-only dependency");
  });

  it("flags potential secrets and real home paths without echoing their values", () => {
    const root = fixture();
    const dummyKey = "AKIA" + "A".repeat(16);
    const homePath = ["", "Users", "private-person", "Documents", "note"].join("/");
    put(root, "src/unsafe.ts", JSON.stringify({ dummyKey, homePath }));
    const errors = checkPublicSource(root).errors.join("\n");
    expect(errors).toContain("potential credential");
    expect(errors).toContain("machine-specific home path");
    expect(errors).not.toContain(dummyKey);
    expect(errors).not.toContain(homePath);
  });
});
