import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = new Set([".git", "node_modules", ".vite", "coverage", "release", "qa", "test-results", "playwright-report"]);
const generatedDirectory = name => generated.has(name) || name === "dist" || name.startsWith("dist-");
const localPackages = ["canvas-engine", "document-model", "editor-contracts", "mcp-server"].map(name => `packages/${name}`);

function publicFiles(root) {
  if (existsSync(join(root, ".git"))) {
    return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" })
      .split("\0").filter(Boolean);
  }
  const walk = (folder, prefix = "") => readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = prefix + entry.name;
    if (entry.isDirectory()) return generatedDirectory(entry.name) ? [] : walk(join(folder, entry.name), `${path}/`);
    return [path];
  });
  return walk(root);
}

/** Checks files that would be published, without printing file contents or secrets. */
export function checkPublicSource(root = sourceRoot) {
  const errors = [];
  const files = publicFiles(root);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (pkg.license !== "MIT") errors.push("package.json: expected the MIT license");
  if (JSON.stringify(pkg.workspaces) !== JSON.stringify(localPackages)) errors.push("package.json: only local workspaces are allowed");
  for (const required of ["README.md", "README.zh-CN.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    if (!files.includes(required)) errors.push(`${required}: missing public documentation`);
  }

  const textExtensions = new Set([".md", ".ts", ".tsx", ".cjs", ".mjs", ".json", ".css", ".scss", ".html", ".yaml", ".yml", ".txt", ".svg"]);
  const privatePath = /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.DS_Store|AGENTS\.md|DESIGN\.md|design-qa\.md)$|\.(?:edw(?:\..*)?|sqlite(?:-shm|-wal)?|db|log|pem|key|p12|pfx|secret\.json)$/i;
  // Fork: apps/share-server is the self-hosted share backend; any other app or infra directory stays private.
  const privateDirectory = /^(?:apps\/(?!share-server\/)|(?:infra|qa|release|screenshots|\.easydraw|\.codex|\.pi)\/)|^docs\/(?:research|validation|architecture|releases)\//;
  const secret = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bLTAI[0-9A-Za-z]{16,}\b/;
  const personalPath = /\/Users\/(?!test(?:\/|"|')|example\/|user\/|<)[^/\s"']+\/|\/home\/(?!test\/|example\/|user\/|<)[^/\s"']+\//;
  const cloudDependency = /@easydraw\/share-|"(?:ali-oss|fastify|better-sqlite3)"\s*:/;
  // Fork: `easydraw:share:` IPC is the allow-listed self-hosted share channel; upstream cloud APIs stay forbidden.
  const cloudRuntime = /云端分享|分享工作台|(?:registerShareHandlers|getShareCapability|beginSharePublish|preparePublishSnapshot)\b|VITE_APP_(?:BACKEND|LIBRARY|WS_SERVER|PORTAL|FIREBASE|MATOMO|AI_BACKEND)/;

  for (const file of files) {
    if (privatePath.test(file) || privateDirectory.test(file) || file.split("/").some(generatedDirectory)) {
      errors.push(`${file}: private or generated artifact`);
    }
    if (!textExtensions.has(extname(file))) continue;
    // Deletions staged for the next commit no longer have a worktree file.
    if (!existsSync(join(root, file))) continue;
    const content = readFileSync(join(root, file), "utf8");
    if (secret.test(content)) errors.push(`${file}: potential credential (review locally)`);
    if (personalPath.test(content)) errors.push(`${file}: machine-specific home path`);
    if (cloudDependency.test(content)) errors.push(`${file}: cloud-only dependency`);
    // Boundary regression tests and this checker name the APIs they forbid.
    if (/\.(?:[cm]?[jt]sx?|css|scss|html)$/.test(file) && file !== "scripts/check-public-source.mjs" && !/\.test\.[cm]?[jt]sx?$/.test(file) && cloudRuntime.test(content)) {
      errors.push(`${file}: removed cloud runtime surface`);
    }
  }
  return { files: files.length, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkPublicSource();
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Public-source checks passed (${result.files} files; local workspaces only).`);
  }
}
