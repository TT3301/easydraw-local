import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const { createLanShareHost, lanAddresses } = createRequire(import.meta.url)("./lan-share-host.cjs");
const TOKEN = "l".repeat(40);
const roots: string[] = [];
const hosts: Array<{ stop(): Promise<unknown> }> = [];
const freePort = () => new Promise<number>(resolve => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const { port } = probe.address() as { port: number };
    probe.close(() => resolve(port));
  });
});
const makeHost = async () => {
  const root = await mkdtemp(join(tmpdir(), "lan-share-"));
  roots.push(root);
  await mkdir(join(root, "viewer"));
  await writeFile(join(root, "viewer", "viewer.html"), "<!doctype html>viewer");
  const host = createLanShareHost({ dataDir: join(root, "data"), viewerDir: join(root, "viewer"), localeText: (zh: string) => zh });
  hosts.push(host);
  return host;
};
afterEach(async () => {
  await Promise.all(hosts.splice(0).map(host => host.stop()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("LAN share host", () => {
  it("ranks reachable LAN addresses first and hides loopback, link-local, and proxy virtual NICs", () => {
    const entry = (address: string, internal = false) => ({ address, family: "IPv4", internal, netmask: "", mac: "", cidr: null });
    expect(lanAddresses({
      lo0: [entry("127.0.0.1", true)],
      utun4: [entry("198.18.0.1")],
      utun5: [entry("100.83.181.14")],
      bridge0: [entry("192.168.64.1")],
      en0: [entry("192.168.1.23"), { ...entry("fe80::1"), family: "IPv6" }],
      en7: [entry("169.254.3.2")],
      en9: [entry("203.0.113.5")],
    })).toEqual([
      { address: "192.168.1.23", name: "en0" },
      { address: "192.168.64.1", name: "bridge0" },
      { address: "100.83.181.14", name: "utun5" },
      { address: "203.0.113.5", name: "en9" },
    ]);
  });

  it("serves the viewer and authenticated API on all interfaces, then releases the port", async () => {
    const host = await makeHost();
    const port = await freePort();
    expect(await host.start({ port, token: TOKEN })).toEqual({ running: true, port });
    expect(host.status()).toEqual({ running: true, port });
    expect((await fetch(`http://127.0.0.1:${port}/s/${"a".repeat(22)}`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${port}/api/health`)).status).toBe(401);
    expect((await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Authorization: `Bearer ${TOKEN}` } })).status).toBe(200);
    await host.stop();
    expect(host.status()).toEqual({ running: false, port: null });
    await expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
  });

  it("reports an occupied port and rejects invalid ports", async () => {
    const first = await makeHost(), second = await makeHost();
    const port = await freePort();
    await first.start({ port, token: TOKEN });
    await expect(second.start({ port, token: TOKEN })).rejects.toThrow("已被占用");
    expect(second.status().running).toBe(false);
    await expect(second.start({ port: 80, token: TOKEN })).rejects.toThrow("1024");
  });
});
