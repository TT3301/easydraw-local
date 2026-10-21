const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve, join } = require("node:path");
const { pathToFileURL } = require("node:url");
const electron = require("electron");
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

// The bridge descriptor belongs exclusively to this temporary desktop instance.
// Never discover or connect to the user's normal EasyDraw instance for tests.
const child = spawn(electron, ["."], { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"], env: {
  ...process.env, EASYDRAW_LIVE_SMOKE: "1", EASYDRAW_DEVELOPMENT_URL: pathToFileURL(resolve("dist/index.html")).href,
} });
child.stdout.on("data", (data) => process.stdout.write(data));
child.stderr.on("data", (data) => process.stderr.write(data));
let smoke;
const timeout = setTimeout(() => {
  console.error("Isolated desktop integration timed out");
  process.exitCode = 1;
  smoke?.kill("SIGTERM");
  child.kill("SIGTERM");
}, 120_000);
timeout.unref();
child.once("exit", () => smoke?.kill("SIGTERM"));
const descriptor = join(tmpdir(), `easydraw-smoke-${child.pid}`, "mcp-bridge.json");
(async () => {
  try {
    for (let attempt = 0; attempt < 200 && !existsSync(descriptor); attempt++) {
      if (child.exitCode !== null) throw new Error("Isolated desktop exited before bridge startup");
      await delay(50);
    }
    if (!existsSync(descriptor)) throw new Error("Isolated desktop bridge did not start");
    if (process.env.EASYDRAW_MULTI_CANVAS_SMOKE === "1") {
      const ready = join(tmpdir(), `easydraw-smoke-${child.pid}`, "multicanvas-ready");
      for (let i = 0; i < 1200 && !existsSync(ready); i++) {
        if (child.exitCode !== null) throw new Error("Multi-canvas UI smoke exited before completion");
        await delay(50);
      }
      if (!existsSync(ready)) throw new Error("Multi-canvas UI smoke did not finish");
    }
    smoke = spawn(process.execPath, ["--import", "tsx", "packages/mcp-server/src/live-smoke.ts"], {
      cwd: resolve("."), stdio: "inherit", env: { ...process.env, EASYDRAW_BRIDGE_DESCRIPTOR: descriptor, EASYDRAW_ISOLATED_MCP_SMOKE: "1" },
    });
    const code = await new Promise((done, fail) => { smoke.once("error", fail); smoke.once("exit", done); });
    if (code !== 0) throw new Error(`MCP integration exited with ${code}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    smoke?.kill("SIGTERM");
    child.kill("SIGTERM");
  }
})();
