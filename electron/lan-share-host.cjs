// Runs the self-hosted share server inside the desktop app so people without a VPS can share on their LAN.
// Reuses apps/share-server/server.mjs and the bundled read-only viewer; listens only while the user enables it.
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");

const SERVER_MODULE = path.join(__dirname, "..", "apps", "share-server", "server.mjs");
const VIEWER_DIR = path.join(__dirname, "..", "dist-viewer");
const SWEEP_MS = 60 * 60_000;

const ipv4 = (address) => address.split(".").map(Number);
const inRange = ([a, b], ranges) => ranges.some(([x, y1, y2]) => a === x && b >= y1 && b <= y2);
// RFC 1918 private ranges, then CGNAT (Tailscale and similar overlays).
const isPrivate = (address) => inRange(ipv4(address), [[10, 0, 255], [172, 16, 31], [192, 168, 168]]);
const isCgnat = (address) => inRange(ipv4(address), [[100, 64, 127]]);
// 198.18.0.0/15 is the benchmarking range that proxy apps (Surge, Clash fake-ip) use for virtual NICs.
const isVirtual = (address) => inRange(ipv4(address), [[198, 18, 19]]) || address.startsWith("169.254.");

/**
 * Candidate IPv4 addresses other devices can reach, best first:
 * private LAN on physical-looking interfaces (en*, eth*, wlan*), other private, CGNAT, then the rest.
 */
exports.lanAddresses = (interfaces = os.networkInterfaces()) => {
  const rank = ({ address, name }) => isPrivate(address) ? (/^(en|eth|wl)/.test(name) ? 0 : 1) : isCgnat(address) ? 2 : 3;
  return Object.entries(interfaces)
    .flatMap(([name, entries]) => (entries ?? [])
      .filter(entry => entry.family === "IPv4" && !entry.internal && !isVirtual(entry.address))
      .map(entry => ({ address: entry.address, name })))
    .sort((left, right) => rank(left) - rank(right) || left.name.localeCompare(right.name));
};

exports.createLanShareHost = ({ dataDir, localeText, viewerDir = VIEWER_DIR, maxBytes = 50 * 1024 * 1024, loadServer = () => import(pathToFileURL(SERVER_MODULE).href) }) => {
  let server = null, sweepTimer = null, port = null;

  const start = async ({ port: requestedPort, token }) => {
    if (server) return { running: true, port };
    if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) {
      throw new Error(localeText("端口需在 1024–65535 之间", "The port must be between 1024 and 65535"));
    }
    await fs.mkdir(dataDir, { recursive: true });
    const { createShareServer } = await loadServer();
    const instance = createShareServer({ token, dataDir, viewerDir, maxBytes });
    await new Promise((resolve, reject) => {
      instance.once("error", error => reject(error.code === "EADDRINUSE"
        ? new Error(localeText(`端口 ${requestedPort} 已被占用，请换一个端口`, `Port ${requestedPort} is already in use; choose another port`))
        : error));
      instance.listen(requestedPort, "0.0.0.0", resolve);
    });
    const sweep = () => instance.sweepExpired().catch(() => {});
    await sweep();
    sweepTimer = setInterval(sweep, SWEEP_MS);
    sweepTimer.unref?.();
    server = instance;
    port = requestedPort;
    return { running: true, port };
  };
  const stop = async () => {
    if (!server) return { running: false, port: null };
    clearInterval(sweepTimer);
    const instance = server;
    server = null; sweepTimer = null; port = null;
    instance.closeAllConnections?.();
    await new Promise(resolve => instance.close(() => resolve()));
    return { running: false, port: null };
  };
  return { start, stop, status: () => ({ running: Boolean(server), port }) };
};
