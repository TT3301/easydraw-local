// Self-hosted public sharing. Runs only in the main process: the server token and share keys
// are encrypted with safeStorage (OS keychain) and never cross into the renderer or the .edw file.
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { createShareKey, encodeSnapshot } = require("./share-codec.cjs");

const STORE_FILE = "share-store.json";
const MIN_TOKEN_BYTES = 32;
const EXPIRY_DAYS = new Set([7, 30]);

exports.createShareService = ({ userDataPath, safeStorage, fetch, clipboard, resolveAssetPath, localeText, isTrusted, now = () => Date.now() }) => {
  const storePath = path.join(userDataPath, STORE_FILE);
  let queue = Promise.resolve();
  /** Serializes operations so concurrent IPC calls never interleave store writes. */
  const serial = (task) => { const run = queue.then(task, task); queue = run.catch(() => {}); return run; };

  const readStore = async () => {
    try {
      const store = JSON.parse(await fs.readFile(storePath, "utf8"));
      return { settings: store.settings ?? {}, shares: store.shares ?? {} };
    } catch (error) {
      if (error.code === "ENOENT") return { settings: {}, shares: {} };
      throw error;
    }
  };
  const writeStore = async (store) => {
    const temporary = `${storePath}.tmp-${crypto.randomUUID()}`;
    await fs.writeFile(temporary, JSON.stringify(store, null, 2), { mode: 0o600, flag: "wx" });
    await fs.rename(temporary, storePath);
  };
  const seal = (text) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error(localeText("系统钥匙串不可用，无法安全保存分享凭据", "The system keychain is unavailable; share credentials cannot be stored securely"));
    return safeStorage.encryptString(text).toString("base64");
  };
  const unseal = (sealed) => safeStorage.decryptString(Buffer.from(sealed, "base64"));

  const normalizeServerUrl = (input) => {
    let url;
    try { url = new URL(String(input).trim()); } catch { throw new Error(localeText("服务器地址无效", "Invalid server address")); }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    // Browsers expose WebCrypto only in secure contexts, so viewers need HTTPS outside localhost.
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error(localeText("服务器地址必须以 https:// 开头", "The server address must start with https://"));
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
      throw new Error(localeText("服务器地址只填写域名，不要包含路径", "Enter only the server origin, without a path"));
    }
    return url.origin;
  };
  const connection = (store) => {
    const { serverUrl, token } = store.settings;
    if (!serverUrl || !token) throw new Error(localeText("请先在设置中配置分享服务器", "Configure the share server in Settings first"));
    return { serverUrl, token: unseal(token) };
  };
  const request = async ({ serverUrl, token }, method, route, { body, headers = {}, timeout = 15_000 } = {}) => {
    let response;
    try {
      response = await fetch(`${serverUrl}${route}`, { method, body, headers: { Authorization: `Bearer ${token}`, ...headers }, signal: AbortSignal.timeout(timeout) });
    } catch (error) {
      throw new Error(localeText(`无法连接分享服务器：${error.message}`, `Cannot reach the share server: ${error.message}`));
    }
    if (response.ok) return response.status === 204 ? null : response.json();
    const detail = await response.json().then(data => data.error, () => "");
    const message = {
      401: localeText("访问令牌无效", "Invalid access token"),
      404: localeText("服务器上找不到该分享", "The share was not found on the server"),
      413: localeText("快照超过服务器大小上限", "The snapshot exceeds the server size limit"),
      429: localeText("鉴权失败次数过多，请稍后再试", "Too many failed attempts; try again later"),
    }[response.status] ?? localeText(`服务器错误 ${response.status}`, `Server error ${response.status}`);
    const error = new Error(detail && response.status >= 500 ? `${message}: ${detail}` : message);
    error.status = response.status;
    throw error;
  };
  const expiryFrom = (days) => {
    if (days === null || days === undefined) return null;
    if (!EXPIRY_DAYS.has(days)) throw new Error(localeText("过期时间无效", "Invalid expiry"));
    return new Date(now() + days * 86_400_000).toISOString();
  };
  const projectIdOf = (value) => {
    if (typeof value !== "string" || !value) throw new Error(localeText("项目标识无效", "Invalid project id"));
    return value;
  };
  /** The record for this project on the currently configured server, if any. */
  const recordFor = (store, projectId) => {
    const record = store.shares[projectId];
    return record && record.serverUrl === store.settings.serverUrl ? record : null;
  };
  const shareUrl = (record) => `${record.serverUrl}/s/${record.id}#${unseal(record.key)}`;
  const publicView = (record) => record ? {
    link: `${record.serverUrl}/s/${record.id.slice(0, 8)}…#••••••••••••`,
    size: record.size, updatedAt: record.updatedAt, enabled: record.enabled, expiresAt: record.expiresAt,
  } : null;
  const applyMeta = (record, meta) => ({ ...record, size: meta.size, updatedAt: meta.updatedAt, enabled: meta.enabled, expiresAt: meta.expiresAt });

  const getSettings = async () => {
    const { settings } = await readStore();
    return { serverUrl: settings.serverUrl ?? "", hasToken: Boolean(settings.token) };
  };
  /** token: string replaces, null clears, undefined keeps the saved one. */
  const setSettings = ({ serverUrl, token }) => serial(async () => {
    const store = await readStore();
    store.settings.serverUrl = serverUrl ? normalizeServerUrl(serverUrl) : "";
    if (typeof token === "string") {
      if (Buffer.byteLength(token.trim()) < MIN_TOKEN_BYTES) throw new Error(localeText("访问令牌至少 32 个字符", "The access token must be at least 32 characters"));
      store.settings.token = seal(token.trim());
    } else if (token === null) delete store.settings.token;
    await writeStore(store);
    return getSettings();
  });
  const testServer = async () => request(connection(await readStore()), "GET", "/api/health");

  const status = (projectId) => serial(async () => {
    const store = await readStore();
    const configured = Boolean(store.settings.serverUrl && store.settings.token);
    const record = recordFor(store, projectIdOf(projectId));
    if (!configured || !record) return { configured, serverUrl: store.settings.serverUrl ?? "", share: null };
    try {
      const meta = await request(connection(store), "GET", `/api/shares/${record.id}`);
      store.shares[projectId] = applyMeta(record, meta);
    } catch (error) {
      if (error.status !== 404) return { configured, serverUrl: store.settings.serverUrl, share: publicView(record), error: error.message };
      delete store.shares[projectId]; // Deleted elsewhere or expired and swept.
    }
    await writeStore(store);
    return { configured, serverUrl: store.settings.serverUrl, share: publicView(store.shares[projectId]) };
  });

  const publish = ({ projectPath, document, expiresInDays }) => serial(async () => {
    if (typeof projectPath !== "string" || !projectPath) throw new Error(localeText("请先保存项目，再发布分享", "Save the project before sharing it"));
    if (!document || typeof document !== "object" || !Array.isArray(document.assets)) throw new Error(localeText("项目内容无效", "Invalid project content"));
    const projectId = projectIdOf(document.projectId);
    const store = await readStore();
    const server = connection(store);
    const { maxBytes } = await request(server, "GET", "/api/health");
    const encode = async (key) => {
      const body = await encodeSnapshot({ document, readAsset: relativePath => fs.readFile(resolveAssetPath(projectPath, relativePath)) }, key);
      if (body.length > maxBytes) {
        const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
        throw new Error(localeText(`快照 ${mb(body.length)} MB 超过服务器上限 ${mb(maxBytes)} MB`, `Snapshot ${mb(body.length)} MB exceeds the server limit of ${mb(maxBytes)} MB`));
      }
      return { body, timeout: 300_000, headers: { "Content-Type": "application/octet-stream" } };
    };
    let record = recordFor(store, projectId);
    let meta = null;
    if (record) {
      // Updates keep the id and key so the link stays stable; the codec draws a fresh IV every time.
      try { meta = await request(server, "PUT", `/api/shares/${record.id}`, await encode(unseal(record.key))); }
      catch (error) { if (error.status !== 404) throw error; record = null; }
    }
    if (!record) {
      // New, or deleted/expired on the server: a fresh id and a fresh key.
      const key = createShareKey();
      const upload = await encode(key);
      const expiresAt = expiryFrom(expiresInDays);
      if (expiresAt) upload.headers["X-Expires-At"] = expiresAt;
      meta = await request(server, "POST", "/api/shares", upload);
      record = { serverUrl: server.serverUrl, id: meta.id, key: seal(key) };
    }
    store.shares[projectId] = applyMeta(record, meta);
    await writeStore(store);
    return publicView(store.shares[projectId]);
  });

  const patch = (projectId, body) => serial(async () => {
    const store = await readStore();
    const record = recordFor(store, projectIdOf(projectId));
    if (!record) throw new Error(localeText("该项目还没有分享", "This project has not been shared"));
    const meta = await request(connection(store), "PATCH", `/api/shares/${record.id}`, { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    store.shares[projectId] = applyMeta(record, meta);
    await writeStore(store);
    return publicView(store.shares[projectId]);
  });
  const remove = (projectId) => serial(async () => {
    const store = await readStore();
    const record = recordFor(store, projectIdOf(projectId));
    if (record) {
      try { await request(connection(store), "DELETE", `/api/shares/${record.id}`); }
      catch (error) { if (error.status !== 404) throw error; }
    }
    delete store.shares[projectId];
    await writeStore(store);
    return null;
  });
  const copyLink = async (projectId) => {
    const store = await readStore();
    const record = recordFor(store, projectIdOf(projectId));
    if (!record) throw new Error(localeText("该项目还没有分享", "This project has not been shared"));
    clipboard.writeText(shareUrl(record));
    return true;
  };

  const register = (ipcMain) => {
    const handle = (channel, run) => ipcMain.handle(channel, (event, payload) => {
      if (!isTrusted(event)) throw new Error(localeText("分享请求来源无效", "Invalid share request origin"));
      return run(payload ?? {});
    });
    handle("easydraw:share:get-settings", () => getSettings());
    handle("easydraw:share:set-settings", setSettings);
    handle("easydraw:share:test", () => testServer());
    handle("easydraw:share:status", ({ projectId }) => status(projectId));
    handle("easydraw:share:publish", publish);
    handle("easydraw:share:set-enabled", ({ projectId, enabled }) => {
      if (typeof enabled !== "boolean") throw new Error(localeText("开关状态无效", "Invalid switch state"));
      return patch(projectId, { enabled });
    });
    handle("easydraw:share:set-expiry", ({ projectId, expiresInDays }) => patch(projectId, { expiresAt: expiryFrom(expiresInDays) }));
    handle("easydraw:share:delete", ({ projectId }) => remove(projectId));
    handle("easydraw:share:copy-link", ({ projectId }) => copyLink(projectId));
  };
  return { register, getSettings, setSettings, testServer, status, publish, setEnabled: (id, enabled) => patch(id, { enabled }), remove, copyLink };
};
