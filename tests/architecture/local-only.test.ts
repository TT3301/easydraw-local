import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { trackEvent } from "../../packages/canvas-engine/src/editor/analytics";

const root = resolve(import.meta.dirname, "../..");
const source = (file: string) => readFileSync(join(root, file), "utf8");

describe("local-only distribution", () => {
  it("contains only the local workspaces and a separate desktop identity", () => {
    const pkg = JSON.parse(source("package.json"));
    expect(pkg.license).toBe("MIT");
    expect(pkg.workspaces).toEqual([
      "packages/canvas-engine", "packages/document-model", "packages/editor-contracts", "packages/mcp-server",
    ]);
    expect(pkg.build.appId).toBe("com.easydraw.local");
    expect(pkg.build.productName).toBe("EasyDraw Local");
    expect(pkg.build.files.some((path: string) => path.startsWith("tests/"))).toBe(false);
    expect(Object.keys(pkg.dependencies).join(" ")).not.toMatch(/@easydraw\/share-|fastify|ali-oss|better-sqlite3/);
    expect(JSON.stringify([pkg.build.files, pkg.build.extraResources])).not.toMatch(/apps\/|infra\/|share-api|share-viewer|share-service/);
    expect(pkg.scripts.build).toBe("npm run build:desktop");
    expect(pkg.scripts["build:desktop"]).not.toMatch(/share|website/);
    for (const path of ["infra", "src/share", "packages/share-codec", "packages/share-contracts", "packages/share-storage"]) {
      expect(existsSync(join(root, path)), path).toBe(false);
    }
    // Fork: the only application is the self-hosted share server, which is never packaged.
    expect(readdirSync(join(root, "apps")).filter(name => !name.startsWith("."))).toEqual(["share-server"]);
  });

  it("exposes no account methods and only the allow-listed self-hosted share methods", () => {
    let api: Record<string, unknown> = {};
    runInNewContext(source("electron/preload.cjs"), {
      require(name: string) {
        expect(name).toBe("electron");
        return {
          contextBridge: { exposeInMainWorld(_name: string, value: Record<string, unknown>) { api = value; } },
          ipcRenderer: { invoke: vi.fn(), on: vi.fn(), send: vi.fn(), removeListener: vi.fn() },
        };
      },
    });
    expect(Object.keys(api).join(" ")).not.toMatch(/account|registration|password/i);
    expect(Object.keys(api).filter(name => /share/i.test(name)).sort()).toEqual([
      "copyShareLink", "deleteShare", "getShareSettings", "getShareStatus", "publishShare",
      "setShareEnabled", "setShareExpiry", "setShareSettings", "testShareServer",
    ]);
    for (const method of ["openProject", "saveProject", "saveProjectAs", "importAsset", "savePng", "setMcpEnabled"]) {
      expect(api[method], method).toBeTypeOf("function");
    }
  });

  it("removes cloud UI, publication hooks, and cloud service configuration", () => {
    expect(source("src/App.tsx")).not.toMatch(/AccountDialog|getShareCapability|share-status-control/);
    expect(source("src/app/project-service.ts")).not.toContain("preparePublishSnapshot");
    expect(source("electron/main.cjs")).not.toMatch(/registerShareHandlers/);
    const engine = "packages/canvas-engine/src/editor/";
    for (const path of ["components/PublishLibrary.tsx", "components/LibraryMenuBrowseButton.tsx", "components/live-collaboration/LiveCollaborationTrigger.tsx"]) {
      expect(existsSync(join(root, engine, path)), path).toBe(false);
    }
    expect(source(`${engine}vite-env.d.ts`)).not.toMatch(/BACKEND|FIREBASE|MATOMO|WS_SERVER/);
    expect(source(`${engine}data/library.ts`)).not.toMatch(/fetch\(|importLibraryFromURL/);
  });

  it("keeps the opt-in local MCP switch styled independently of removed sharing UI", () => {
    const dialog = source("src/components/McpDialog.tsx");
    const css = source("src/styles.css");
    expect(dialog).toContain("access-switch");
    expect(dialog).not.toContain("share-switch");
    for (const selector of [".access-switch {", ".access-switch span {", ".access-switch.is-on {", ".access-switch:disabled {"]) {
      expect(css).toContain(selector);
    }
    expect(css).not.toMatch(/\.account-|\.cloud-account/);
  });

  it("never sends analytics even if a host provides a telemetry callback", () => {
    const event = vi.fn();
    vi.stubGlobal("window", { sa_event: event });
    try {
      trackEvent("export", "png", "local", 1);
      expect(event).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("self-hosted share boundaries (fork)", () => {
  const rendererSources = (directory: string): string[] => readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? rendererSources(path) : /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });

  it("keeps the server token and keychain access out of the renderer", () => {
    for (const file of rendererSources("src")) {
      expect(source(file), file).not.toMatch(/safeStorage|Authorization|Bearer /);
    }
  });

  it("never lets an MCP agent publish, and never writes share state into .edw projects", () => {
    for (const file of rendererSources("packages/mcp-server/src")) expect(source(file), file).not.toMatch(/share/i);
    expect(source("electron/project-storage.cjs")).not.toMatch(/share/i);
    expect(source("src/core/mcp-bridge.ts")).not.toMatch(/publishShare|easydraw:share:/);
  });

  it("keeps the share server dependency-free and out of the desktop package", () => {
    const server = source("apps/share-server/server.mjs");
    for (const match of server.matchAll(/from\s+["']([^"']+)["']/g)) expect(match[1], "server import").toMatch(/^node:/);
    const pkg = JSON.parse(source("package.json"));
    expect(JSON.stringify(pkg.build)).not.toMatch(/share-server|dist-viewer/);
  });
});
