import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM module without type declarations
import { createShareServer } from "./server.mjs";

const TOKEN = "t".repeat(40);
let server: Server & { sweepExpired(): Promise<void> }, base: string, dataDir: string, clock: number;
const auth = { Authorization: `Bearer ${TOKEN}` };
const upload = (body: Uint8Array, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/shares`, { method: "POST", headers: { ...auth, ...headers }, body });

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "share-server-"));
  dataDir = join(root, "data");
  const viewerDir = join(root, "viewer");
  await Promise.all([mkdir(dataDir), mkdir(join(viewerDir, "assets"), { recursive: true })]);
  await writeFile(join(viewerDir, "viewer.html"), "<!doctype html>viewer");
  await writeFile(join(viewerDir, "assets", "app.js"), "console.log(1)");
  await writeFile(join(root, "secret.txt"), "secret");
  clock = Date.parse("2026-11-09T00:00:00Z");
  server = createShareServer({ token: TOKEN, dataDir, viewerDir, maxBytes: 1024, now: () => clock });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { await new Promise(done => server.close(done)); await rm(join(dataDir, ".."), { recursive: true, force: true }); });

describe("share server", () => {
  it("rejects weak tokens at startup", () => {
    expect(() => createShareServer({ token: "short", dataDir, viewerDir: dataDir, maxBytes: 1 })).toThrow(/32 bytes/);
  });

  it("requires the bearer token for every write and metadata route", async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(401);
    expect((await fetch(`${base}/api/health`, { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await fetch(`${base}/api/shares`, { method: "POST", body: "x" })).status).toBe(401);
    expect(await (await fetch(`${base}/api/health`, { headers: auth })).json()).toEqual({ ok: true, maxBytes: 1024 });
  });

  it("rate-limits repeated authentication failures per client", async () => {
    const headers = { Authorization: "Bearer wrong", "X-Real-IP": "203.0.113.9" };
    for (let i = 0; i < 10; i++) await fetch(`${base}/api/health`, { headers });
    expect((await fetch(`${base}/api/health`, { headers })).status).toBe(429);
    expect((await fetch(`${base}/api/health`, { headers: auth })).status).toBe(200);
  });

  it("publishes, reads, updates, pauses, and deletes a ciphertext", async () => {
    const created = await upload(new Uint8Array([1, 2, 3]));
    expect(created.status).toBe(201);
    const meta = await created.json();
    expect(meta).toMatchObject({ size: 3, enabled: true, expiresAt: null });
    expect(meta.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const blob = await fetch(`${base}/api/shares/${meta.id}/blob`);
    expect(blob.headers.get("cache-control")).toBe("no-store, no-transform");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3]);

    clock += 1000;
    const updated = await (await fetch(`${base}/api/shares/${meta.id}`, { method: "PUT", headers: auth, body: new Uint8Array([9, 9]) })).json();
    expect(updated).toMatchObject({ id: meta.id, size: 2, createdAt: meta.createdAt });
    expect(updated.updatedAt).not.toBe(meta.updatedAt);

    const paused = await fetch(`${base}/api/shares/${meta.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ enabled: false }) });
    expect((await paused.json()).enabled).toBe(false);
    expect((await fetch(`${base}/api/shares/${meta.id}/blob`)).status).toBe(404);
    await fetch(`${base}/api/shares/${meta.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ enabled: true }) });
    expect((await fetch(`${base}/api/shares/${meta.id}/blob`)).status).toBe(200);

    expect((await fetch(`${base}/api/shares/${meta.id}`, { method: "DELETE", headers: auth })).status).toBe(204);
    expect((await fetch(`${base}/api/shares/${meta.id}/blob`)).status).toBe(404);
    expect(await readdir(dataDir)).toEqual([]);
  });

  it("enforces the size limit without leaving partial files", async () => {
    expect((await upload(new Uint8Array(2048))).status).toBe(413);
    expect((await upload(new Uint8Array(0))).status).toBe(400);
    expect(await readdir(dataDir)).toEqual([]);
  });

  it("hides and sweeps expired shares", async () => {
    const meta = await (await upload(new Uint8Array([1]), { "X-Expires-At": "2026-11-10T00:00:00Z" })).json();
    expect(meta.expiresAt).toBe("2026-11-10T00:00:00.000Z");
    expect((await fetch(`${base}/api/shares/${meta.id}/blob`)).status).toBe(200);
    clock = Date.parse("2026-11-10T00:00:01Z");
    expect((await fetch(`${base}/api/shares/${meta.id}/blob`)).status).toBe(404);
    await server.sweepExpired();
    expect(await readdir(dataDir)).toEqual([]);
    expect((await upload(new Uint8Array([1]), { "X-Expires-At": "not a date" })).status).toBe(400);
  });

  it("serves the viewer for share paths and blocks traversal and malformed ids", async () => {
    const page = await fetch(`${base}/s/${"a".repeat(22)}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect((await fetch(`${base}/assets/app.js`)).headers.get("cache-control")).toContain("immutable");
    expect((await fetch(`${base}/s/short`)).status).toBe(404);
    expect((await fetch(`${base}/api/shares/..%2F..%2Fsecret/blob`)).status).toBe(404);
    expect((await fetch(`${base}/%2e%2e/secret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/`)).status).toBe(404);
  });
});
