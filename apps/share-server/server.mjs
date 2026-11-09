// Minimal self-hosted EasyDraw share server.
// Stores only ciphertext produced by the desktop app; the decryption key never leaves the URL fragment.
// Zero dependencies: Node 22+ built-ins only.
import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { extname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";

const ID = /^[A-Za-z0-9_-]{22}$/;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".txt": "text/plain; charset=utf-8" };
const VIEWER_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const AUTH_WINDOW_MS = 10 * 60_000, AUTH_MAX_FAILURES = 10;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

/** Creates the HTTP server. Exported for tests; `main()` wires it to the environment. */
export function createShareServer({ token, dataDir, viewerDir, maxBytes, now = () => Date.now() }) {
  if (typeof token !== "string" || Buffer.byteLength(token) < 32) throw new Error("SHARE_TOKEN must be at least 32 bytes");
  const tokenDigest = createHash("sha256").update(token).digest();
  const failures = new Map(); // ip -> { count, resetAt }
  const blobPath = id => join(dataDir, `${id}.bin`);
  const metaPath = id => join(dataDir, `${id}.json`);

  const json = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const clientIp = req => String(req.headers["x-real-ip"] || req.socket.remoteAddress || "");
  const authorize = req => {
    const ip = clientIp(req), entry = failures.get(ip);
    if (entry && entry.resetAt > now() && entry.count >= AUTH_MAX_FAILURES) throw new HttpError(429, "Too many failed attempts");
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
    // Compare fixed-length digests so neither length nor content leaks through timing.
    if (match && timingSafeEqual(createHash("sha256").update(match[1]).digest(), tokenDigest)) return;
    const current = entry && entry.resetAt > now() ? entry : { count: 0, resetAt: now() + AUTH_WINDOW_MS };
    current.count += 1;
    failures.set(ip, current);
    throw new HttpError(401, "Unauthorized");
  };
  const readMeta = async id => {
    try { return JSON.parse(await readFile(metaPath(id), "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  const isExpired = meta => meta.expiresAt !== null && Date.parse(meta.expiresAt) <= now();
  const writeMeta = async meta => {
    const temporary = join(dataDir, `.${meta.id}.${randomBytes(6).toString("hex")}.json`);
    await writeFile(temporary, JSON.stringify(meta), { flag: "wx" });
    await rename(temporary, metaPath(meta.id));
  };
  const parseExpiry = value => {
    if (value === null) return null;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new HttpError(400, "expiresAt must be an ISO date or null");
    return new Date(value).toISOString();
  };
  /** Streams the request body to a temporary file, enforcing the size limit before rename. */
  const receiveBlob = async (req, id) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "Snapshot too large");
    const temporary = join(dataDir, `.${id}.${randomBytes(6).toString("hex")}.bin`);
    let size = 0;
    const limit = new Transform({ transform(chunk, _encoding, done) {
      size += chunk.length;
      done(size > maxBytes ? new HttpError(413, "Snapshot too large") : null, chunk);
    } });
    try {
      await pipeline(req, limit, createWriteStream(temporary, { flag: "wx" }));
      if (size === 0) throw new HttpError(400, "Empty snapshot");
      await rename(temporary, blobPath(id));
      return size;
    } catch (error) { await rm(temporary, { force: true }); throw error; }
  };
  const removeShare = id => Promise.all([rm(blobPath(id), { force: true }), rm(metaPath(id), { force: true })]);
  const readJsonBody = async req => {
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new HttpError(413, "Body too large"); }
    try { return JSON.parse(body); } catch { throw new HttpError(400, "Invalid JSON"); }
  };
  const serveFile = async (res, file, headers = {}) => {
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) throw new HttpError(404, "Not found");
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Content-Length": info.size,
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...headers });
    await pipeline(createReadStream(file), res);
  };
  const serveViewer = res => serveFile(res, join(viewerDir, "viewer.html"), {
    "Content-Security-Policy": VIEWER_CSP, "Cache-Control": "no-cache, no-transform", "X-Frame-Options": "DENY" });

  const handle = async (req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    const parts = pathname.split("/").filter(Boolean);
    const method = req.method ?? "GET";

    if (pathname === "/api/health" && method === "GET") { authorize(req); return json(res, 200, { ok: true, maxBytes }); }
    if (pathname === "/api/shares" && method === "POST") {
      authorize(req);
      const id = randomBytes(16).toString("base64url");
      const expiresAt = parseExpiry(req.headers["x-expires-at"] ? String(req.headers["x-expires-at"]) : null);
      const size = await receiveBlob(req, id);
      const timestamp = new Date(now()).toISOString();
      const meta = { id, size, createdAt: timestamp, updatedAt: timestamp, enabled: true, expiresAt };
      await writeMeta(meta);
      return json(res, 201, meta);
    }
    if (parts[0] === "api" && parts[1] === "shares" && parts.length >= 3) {
      const id = parts[2];
      if (!ID.test(id)) throw new HttpError(404, "Not found");
      if (parts.length === 4 && parts[3] === "blob" && method === "GET") {
        const meta = await readMeta(id);
        if (!meta || !meta.enabled || isExpired(meta)) throw new HttpError(404, "Not found");
        return serveFile(res, blobPath(id), { "Cache-Control": "no-store, no-transform", "Content-Type": "application/octet-stream" });
      }
      if (parts.length !== 3) throw new HttpError(404, "Not found");
      authorize(req);
      const meta = await readMeta(id);
      if (!meta) throw new HttpError(404, "Not found");
      if (method === "GET") return json(res, 200, meta);
      if (method === "DELETE") { await removeShare(id); res.writeHead(204).end(); return; }
      if (method === "PUT") {
        const size = await receiveBlob(req, id);
        const next = { ...meta, size, updatedAt: new Date(now()).toISOString() };
        await writeMeta(next);
        return json(res, 200, next);
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        const next = { ...meta };
        if ("enabled" in body) {
          if (typeof body.enabled !== "boolean") throw new HttpError(400, "enabled must be boolean");
          next.enabled = body.enabled;
        }
        if ("expiresAt" in body) next.expiresAt = parseExpiry(body.expiresAt);
        await writeMeta(next);
        return json(res, 200, next);
      }
      throw new HttpError(405, "Method not allowed");
    }
    if (method !== "GET") throw new HttpError(405, "Method not allowed");
    if (parts[0] === "s" && parts.length === 2 && ID.test(parts[1])) return serveViewer(res);
    // Static viewer assets: resolved strictly inside viewerDir.
    const target = resolve(viewerDir, `.${pathname}`);
    if (!target.startsWith(`${resolve(viewerDir)}${sep}`) || parts.length === 0) throw new HttpError(404, "Not found");
    return serveFile(res, target, { "Cache-Control": parts[0] === "assets" ? "public, max-age=31536000, immutable" : "no-cache" });
  };

  const server = createServer((req, res) => {
    handle(req, res).catch(error => {
      if (error?.code === "ERR_STREAM_PREMATURE_CLOSE") return; // The client went away mid-transfer.
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error(error);
      if (res.headersSent) { res.destroy(); return; }
      json(res, status, { error: status === 500 ? "Internal error" : error.message });
      req.resume(); // Drain any unread upload so the connection closes cleanly.
    });
  });

  /** Deletes expired shares; run at startup and hourly. */
  server.sweepExpired = async () => {
    for (const name of await readdir(dataDir)) {
      const id = name.endsWith(".json") ? name.slice(0, -5) : "";
      if (!ID.test(id)) continue;
      const meta = await readMeta(id).catch(() => null);
      if (meta && isExpired(meta)) await removeShare(id);
    }
  };
  return server;
}

async function main() {
  const dataDir = resolve(process.env.DATA_DIR ?? "./data");
  const viewerDir = resolve(process.env.VIEWER_DIR ?? "./viewer");
  const maxBytes = Number(process.env.MAX_BLOB_MB ?? 50) * 1024 * 1024;
  const port = Number(process.env.PORT ?? 8787), host = process.env.HOST ?? "127.0.0.1";
  await mkdir(dataDir, { recursive: true });
  const server = createShareServer({ token: process.env.SHARE_TOKEN, dataDir, viewerDir, maxBytes });
  const sweep = () => server.sweepExpired().catch(error => console.error("sweep failed", error));
  await sweep();
  setInterval(sweep, 60 * 60_000).unref();
  server.listen(port, host, () => console.log(`easydraw-share listening on ${host}:${port}, max ${maxBytes} bytes`));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}
