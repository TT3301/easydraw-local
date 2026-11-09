import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM module without type declarations
import { createShareServer } from "../apps/share-server/server.mjs";
import { decodeSnapshot } from "../src/features/share/snapshot-codec";

const { createShareService } = createRequire(import.meta.url)("./share-service.cjs");
const TOKEN = "k".repeat(40);
const PROJECT = "project-1";
let root: string, server: Server, serverUrl: string, clipboardText: string, service: ReturnType<typeof createShareService>, clock: number;

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text: string) => Buffer.from(`sealed:${text}`).reverse(),
  decryptString: (data: Buffer) => Buffer.from(data).reverse().toString().replace(/^sealed:/, ""),
};
const document = { projectId: PROJECT, name: "Demo", assets: [{ relativePath: "assets/logo.svg" }] };
const publish = (extra: Record<string, unknown> = {}) => service.publish({ projectPath: "/projects/demo.edw", document, ...extra });
const fetchShared = async () => {
  const url = new URL(clipboardText);
  const blob = await fetch(`${serverUrl}/api/shares${url.pathname.slice(2)}/blob`);
  return { status: blob.status, decode: async () => decodeSnapshot(new Uint8Array(await blob.arrayBuffer()), url.hash.slice(1)) };
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "share-service-"));
  await Promise.all([mkdir(join(root, "data")), mkdir(join(root, "user")), mkdir(join(root, "workspace", "assets"), { recursive: true })]);
  await writeFile(join(root, "workspace", "assets", "logo.svg"), "<svg/>");
  clock = Date.parse("2026-11-09T00:00:00Z");
  server = createShareServer({ token: TOKEN, dataDir: join(root, "data"), viewerDir: join(root, "viewer"), maxBytes: 4096, now: () => clock });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  service = createShareService({
    userDataPath: join(root, "user"), safeStorage, fetch,
    clipboard: { writeText: (text: string) => { clipboardText = text; } },
    resolveAssetPath: (_project: string, relativePath: string) => join(root, "workspace", relativePath),
    localeText: (zh: string) => zh, isTrusted: () => true, now: () => clock,
  });
});
afterEach(async () => { await new Promise(done => server.close(done)); await rm(root, { recursive: true, force: true }); });

describe("share service", () => {
  it("validates settings and keeps the token sealed on disk", async () => {
    await expect(service.setSettings({ serverUrl: "http://example.com", token: TOKEN })).rejects.toThrow("https://");
    await expect(service.setSettings({ serverUrl: "https://example.com/path", token: TOKEN })).rejects.toThrow("路径");
    await expect(service.setSettings({ serverUrl, token: "short" })).rejects.toThrow("32");
    expect(await service.setSettings({ serverUrl: `${serverUrl}/`, token: TOKEN })).toEqual({ serverUrl, hasToken: true });
    const raw = await readFile(join(root, "user", "share-store.json"), "utf8");
    expect(raw).not.toContain(TOKEN);
    expect((await stat(join(root, "user", "share-store.json"))).mode & 0o777).toBe(0o600);
    expect(await service.setSettings({ serverUrl })).toEqual({ serverUrl, hasToken: true });
    expect(await service.testServer()).toEqual({ ok: true, maxBytes: 4096 });
    expect(await service.setSettings({ serverUrl, token: null })).toEqual({ serverUrl, hasToken: false });
    await expect(service.testServer()).rejects.toThrow("配置分享服务器");
  });

  it("publishes an end-to-end encrypted snapshot whose key stays in the link fragment", async () => {
    await service.setSettings({ serverUrl, token: TOKEN });
    expect(await service.status(PROJECT)).toEqual({ configured: true, serverUrl, share: null });
    const view = await publish({ expiresInDays: 7 });
    expect(view).toMatchObject({ enabled: true, expiresAt: "2026-11-16T00:00:00.000Z" });
    expect(view.link).toMatch(/#•+$/);
    await service.copyLink(PROJECT);
    const key = new URL(clipboardText).hash.slice(1);
    expect(await readFile(join(root, "user", "share-store.json"), "utf8")).not.toContain(key);
    const shared = await fetchShared();
    const decoded = await shared.decode();
    expect(decoded.document).toEqual(document);
    expect(Buffer.from(decoded.assets.get("assets/logo.svg")!).toString()).toBe("<svg/>");
  });

  it("keeps the same link on update, pauses, and recreates after deletion", async () => {
    await service.setSettings({ serverUrl, token: TOKEN });
    await publish();
    await service.copyLink(PROJECT);
    const firstLink = clipboardText;
    await writeFile(join(root, "workspace", "assets", "logo.svg"), "<svg id='v2'/>");
    await publish();
    await service.copyLink(PROJECT);
    expect(clipboardText).toBe(firstLink);
    expect(Buffer.from((await (await fetchShared()).decode()).assets.get("assets/logo.svg")!).toString()).toContain("v2");

    expect((await service.setEnabled(PROJECT, false)).enabled).toBe(false);
    expect((await fetchShared()).status).toBe(404);
    expect((await service.status(PROJECT)).share.enabled).toBe(false);
    await service.setEnabled(PROJECT, true);

    await service.remove(PROJECT);
    expect((await fetchShared()).status).toBe(404);
    expect((await service.status(PROJECT)).share).toBeNull();
    await publish();
    await service.copyLink(PROJECT);
    expect(clipboardText).not.toBe(firstLink);
  });

  it("forgets shares that expired on the server and rejects oversized or unsaved projects", async () => {
    await service.setSettings({ serverUrl, token: TOKEN });
    await expect(service.publish({ projectPath: null, document })).rejects.toThrow("请先保存项目");
    await publish({ expiresInDays: 7 });
    clock += 8 * 86_400_000;
    await (server as Server & { sweepExpired(): Promise<void> }).sweepExpired();
    expect((await service.status(PROJECT)).share).toBeNull();
    await writeFile(join(root, "workspace", "assets", "logo.svg"), Buffer.from(Array.from({ length: 20_000 }, () => Math.random() * 256)));
    await expect(publish()).rejects.toThrow("超过服务器上限");
    await expect(publish({ expiresInDays: 3 })).rejects.toThrow();
  });
});
