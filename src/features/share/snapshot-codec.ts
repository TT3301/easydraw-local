// Browser decoder for the share snapshot format; see electron/share-codec.cjs for the layout.
import { gcm } from "@noble/ciphers/aes.js";

const MAGIC = new TextEncoder().encode("EDS1");
const IV_BYTES = 12;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

export interface SnapshotManifest {
  version: 1;
  document: unknown;
  assets: Array<{ relativePath: string; length: number }>;
}
export interface DecodedSnapshot {
  document: unknown;
  /** Asset bytes keyed by project-relative path. */
  assets: Map<string, Uint8Array>;
}

const base64UrlToBytes = (value: string) => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

const gunzip = async (data: Uint8Array) =>
  new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());

/**
 * AES-256-GCM decryption. Browsers expose WebCrypto only in secure contexts (HTTPS, localhost);
 * links served over plain HTTP on a LAN fall back to the audited pure-JS implementation.
 */
async function decrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return gcm(key, iv, MAGIC).decrypt(ciphertext);
  const cryptoKey = await subtle.importKey("raw", key as BufferSource, "AES-GCM", false, ["decrypt"]);
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: MAGIC }, cryptoKey, ciphertext as BufferSource));
}

/** Decrypts and unpacks an envelope. Throws on a wrong key, tampering, or a malformed layout. */
export async function decodeSnapshot(envelope: Uint8Array, key: string): Promise<DecodedSnapshot> {
  if (envelope.length < MAGIC.length + IV_BYTES + 16 || MAGIC.some((byte, index) => envelope[index] !== byte)) {
    throw new Error("Unsupported snapshot format");
  }
  let keyBytes: Uint8Array;
  try { keyBytes = base64UrlToBytes(key); } catch { keyBytes = new Uint8Array(); }
  if (keyBytes.length !== 32) throw new Error("Invalid share key");
  const iv = envelope.slice(MAGIC.length, MAGIC.length + IV_BYTES);
  const plaintext = await decrypt(keyBytes, iv, envelope.slice(MAGIC.length + IV_BYTES))
    .catch(() => { throw new Error("Wrong key or damaged snapshot"); });
  const body = await gunzip(plaintext);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const manifestLength = body.length >= 4 ? view.getUint32(0) : -1;
  if (manifestLength < 0 || manifestLength > MAX_MANIFEST_BYTES || 4 + manifestLength > body.length) throw new Error("Malformed snapshot");
  const manifest = JSON.parse(new TextDecoder().decode(body.subarray(4, 4 + manifestLength))) as SnapshotManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.assets)) throw new Error("Unsupported snapshot version");
  const assets = new Map<string, Uint8Array>();
  let offset = 4 + manifestLength;
  for (const { relativePath, length } of manifest.assets) {
    if (!Number.isInteger(length) || length < 0 || offset + length > body.length) throw new Error("Malformed snapshot");
    assets.set(relativePath, body.subarray(offset, offset + length));
    offset += length;
  }
  if (offset !== body.length) throw new Error("Malformed snapshot");
  return { document: manifest.document, assets };
}

/** Splits `#<key>` from a share URL fragment. */
export const keyFromFragment = (hash: string) => hash.replace(/^#/, "").trim();
