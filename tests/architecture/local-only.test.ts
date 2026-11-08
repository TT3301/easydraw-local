import { existsSync, readFileSync } from "node:fs";
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
    for (const path of ["apps", "infra", "src/share", "electron/share-service.cjs", "packages/share-codec", "packages/share-contracts", "packages/share-storage"]) {
      expect(existsSync(join(root, path)), path).toBe(false);
    }
  });

  it("does not expose account or sharing methods through the preload bridge", () => {
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
    expect(Object.keys(api).join(" ")).not.toMatch(/share|account|registration|password/i);
    for (const method of ["openProject", "saveProject", "saveProjectAs", "importAsset", "savePng", "setMcpEnabled"]) {
      expect(api[method], method).toBeTypeOf("function");
    }
  });

  it("removes cloud UI, publication hooks, and cloud service configuration", () => {
    expect(source("src/App.tsx")).not.toMatch(/ShareDialog|AccountDialog|getShareCapability|share-status-control/);
    expect(source("src/app/project-service.ts")).not.toContain("preparePublishSnapshot");
    expect(source("electron/main.cjs")).not.toMatch(/registerShareHandlers|share-service/);
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
    expect(css).not.toMatch(/\.share-|\.account-|\.cloud-account/);
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
