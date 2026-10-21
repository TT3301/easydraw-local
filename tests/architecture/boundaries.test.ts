import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
const root = resolve(import.meta.dirname, "../..");
const sources = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? sources(path) : /\.(?:ts|tsx|cjs)$/.test(path) && !/\.test\./.test(path) ? [path] : [];
});
const imports = (file: string) => [...readFileSync(file, "utf8").matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g)].map(match => match[1]);
describe("application dependency boundaries", () => {
  it("keeps model and editor contracts independent of applications and browser runtimes", () => {
    for (const folder of ["packages/document-model/src", "packages/editor-contracts/src"]) {
      for (const file of sources(join(root, folder))) {
        for (const dependency of imports(file)) {
          expect(dependency, file).not.toMatch(/(?:canvas-engine|react|electron|fastify|ali-oss)/);
          if (dependency.startsWith('.')) {
            expect(resolve(file, "..", dependency), file).toMatch(/\/packages\/(document-model|editor-contracts)\//);
          }
        }
      }
    }
  });
  it("keeps MCP out of desktop implementation modules", () => {
    for (const folder of ["packages/mcp-server/src"]) {
      for (const file of sources(join(root, folder))) {
        for (const dependency of imports(file)) {
          if (dependency.startsWith('.')) {
            expect(resolve(file, "..", dependency).startsWith(join(root, "src") + "/"), file).toBe(false);
          }
          expect(dependency, file).not.toMatch(/electron/);
        }
      }
    }
  });
  it("keeps agent-specific setup out of the active desktop MCP path", () => {
    for (const file of ["electron/main.cjs", "electron/preload.cjs", "electron/mcp-service.cjs", "electron/mcp-ipc.cjs", "src/App.tsx", "src/components/McpDialog.tsx", "src/desktop-api.d.ts"]) {
      const content = readFileSync(join(root, file), "utf8");
      expect(content, file).not.toMatch(/(?:codex|pi|deepseek)-integration|easydraw:integration:|connectCodex|connectPi|connectDeepSeek|IntegrationStatus/);
    }
  });
  it("keeps desktop smoke implementations outside the production entry point", () => {
    expect(readFileSync(join(root, "electron/main.cjs"), "utf8")).not.toContain("executeJavaScript");
  });
});
