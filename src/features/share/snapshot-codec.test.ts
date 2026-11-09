import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { decodeSnapshot } from "./snapshot-codec";

const { createShareKey, encodeSnapshot } = createRequire(import.meta.url)("../../../electron/share-codec.cjs");
const document = { name: "项目", assets: [{ relativePath: "assets/a.png" }, { relativePath: "assets/b.svg" }, { relativePath: "assets/a.png" }] };
const files: Record<string, Buffer> = { "assets/a.png": Buffer.from([137, 80, 78, 71]), "assets/b.svg": Buffer.from("<svg/>") };
const encode = (key: string) => encodeSnapshot({ document, readAsset: async (path: string) => files[path] }, key);

describe("share snapshot codec", () => {
  it("round-trips the document and deduplicated assets between the desktop encoder and the browser decoder", async () => {
    const key = createShareKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const decoded = await decodeSnapshot(new Uint8Array(await encode(key)), key);
    expect(decoded.document).toEqual(document);
    expect([...decoded.assets.keys()]).toEqual(["assets/a.png", "assets/b.svg"]);
    expect(Buffer.from(decoded.assets.get("assets/b.svg")!).toString()).toBe("<svg/>");
  });

  it("uses a fresh IV per encoding so a reused key never repeats a nonce", async () => {
    const key = createShareKey();
    const [first, second] = await Promise.all([encode(key), encode(key)]);
    expect(first.subarray(4, 16).equals(second.subarray(4, 16))).toBe(false);
  });

  it("rejects wrong keys, tampering, and foreign formats", async () => {
    const key = createShareKey();
    const envelope = new Uint8Array(await encode(key));
    await expect(decodeSnapshot(envelope, createShareKey())).rejects.toThrow("Wrong key");
    const tampered = envelope.slice();
    tampered[tampered.length - 1] ^= 1;
    await expect(decodeSnapshot(tampered, key)).rejects.toThrow("Wrong key");
    const relabeled = envelope.slice();
    relabeled[3] = "2".charCodeAt(0);
    await expect(decodeSnapshot(relabeled, key)).rejects.toThrow("Unsupported");
    await expect(decodeSnapshot(envelope, "short")).rejects.toThrow("Invalid share key");
  });

  it("decrypts without WebCrypto, as browsers do on plain-HTTP LAN links", async () => {
    const key = createShareKey();
    const envelope = new Uint8Array(await encode(key));
    vi.stubGlobal("crypto", {});
    try {
      expect(globalThis.crypto.subtle).toBeUndefined();
      expect((await decodeSnapshot(envelope, key)).document).toEqual(document);
      await expect(decodeSnapshot(envelope, createShareKey())).rejects.toThrow("Wrong key");
      const tampered = envelope.slice();
      tampered[tampered.length - 1] ^= 1;
      await expect(decodeSnapshot(tampered, key)).rejects.toThrow("Wrong key");
    } finally { vi.unstubAllGlobals(); }
  });
});
