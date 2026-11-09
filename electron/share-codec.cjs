// Encrypted share snapshot format (v1). The decoder lives in src/features/share/snapshot-codec.ts.
//
//   envelope  = "EDS1" | iv (12 bytes) | AES-256-GCM(ciphertext + 16-byte tag), AAD = "EDS1"
//   plaintext = gzip( u32be manifestLength | manifest JSON (utf8) | asset bytes in manifest order )
//   manifest  = { version: 1, document: StoredProjectDocument, assets: [{ relativePath, length }] }
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const MAGIC = Buffer.from("EDS1");
const IV_BYTES = 12;

/** A fresh 256-bit key, base64url-encoded for the URL fragment. */
exports.createShareKey = () => crypto.randomBytes(32).toString("base64url");

/**
 * @param {{ document: { assets?: Array<{ relativePath: string }> }, readAsset: (relativePath: string) => Promise<Buffer> }} snapshot
 * @param {string} key base64url 256-bit key
 * @returns {Promise<Buffer>} envelope bytes
 */
exports.encodeSnapshot = async ({ document, readAsset }, key) => {
  const keyBytes = Buffer.from(key, "base64url");
  if (keyBytes.length !== 32) throw new Error("Invalid share key");
  const paths = [...new Set((document.assets ?? []).map(asset => asset.relativePath))];
  const blobs = await Promise.all(paths.map(path => readAsset(path)));
  const manifest = Buffer.from(JSON.stringify({
    version: 1, document, assets: paths.map((relativePath, index) => ({ relativePath, length: blobs[index].length })),
  }));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(manifest.length);
  const plaintext = zlib.gzipSync(Buffer.concat([length, manifest, ...blobs]));
  const iv = crypto.randomBytes(IV_BYTES); // Random per upload: a key is reused across updates, an IV never is.
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes, iv);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([MAGIC, iv, ciphertext]);
};
