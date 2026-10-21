// Exercises the exported stdio configuration against an isolated desktop only.
// No installed agents, user configurations, skills or OS clipboard are modified.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const electron = require("electron");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  let child, first, second, timeout, userData;
  try {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    child = spawn(electron, ["."], { cwd: path.resolve("."), stdio: ["ignore", "pipe", "pipe"], env: {
      ...process.env, EASYDRAW_LIVE_SMOKE: "1", EASYDRAW_MCP_SMOKE: "1",
      EASYDRAW_DEVELOPMENT_URL: pathToFileURL(path.resolve("dist/index.html")).href,
    } });
    child.stdout.on("data", chunk => process.stdout.write(chunk));
    child.stderr.on("data", chunk => process.stderr.write(chunk));
    timeout = setTimeout(() => { process.exitCode = 1; child.kill("SIGKILL"); }, 90_000);
    userData = path.join(os.tmpdir(), `easydraw-smoke-${child.pid}`);
    const marker = name => path.join(userData, name);
    const wait = async name => {
      for (let i = 0; i < 600; i++) {
        if (child.exitCode !== null) throw new Error("Isolated MCP test window exited");
        try { await fs.access(marker(name)); return; } catch { await delay(40); }
      }
      throw new Error(`Missing MCP test stage ${name}`);
    };
    const read = result => {
      assert(!result.isError, "MCP tool returned an error");
      return result.structuredContent ?? JSON.parse(result.content.find(block => block.type === "text").text);
    };
    await wait("mcp-enabled");
    const info = JSON.parse(await fs.readFile(marker("connection-info.json"), "utf8"));
    const spec = info.config.mcpServers.easydraw;
    const originalDescriptor = JSON.parse(await fs.readFile(marker("mcp-bridge.json"), "utf8"));
    const connect = async name => {
      const client = new Client({ name, version: "test" });
      // Launch outside the repository to verify that exported paths are self-contained.
      try {
        await client.connect(new StdioClientTransport({ ...spec, cwd: os.tmpdir(), env: { ...process.env, ...spec.env }, stderr: "pipe" }));
        return client;
      } catch (error) { await client.close(); throw error; }
    };
    first = await connect("Future Agent A"); second = await connect("Future Agent B");
    assert((await first.listTools()).tools.some(tool => tool.name === "get_status"));
    const initial = read(await first.callTool({ name: "get_status", arguments: {} }));
    const doc = { documentId: initial.documentId, canvasId: initial.canvasId };
    read(await first.callTool({ name: "begin_task", arguments: { ...doc, taskId: "before-revocation", label: "Generic MCP smoke", scope: { kind: "document" } } }));
    const write = read(await first.callTool({ name: "apply_operations", arguments: {
      ...doc, taskId: "before-revocation", requestId: "generic-first-write", label: "Generic MCP smoke", baseRevision: initial.revision,
      operations: [{ op: "create", element: { id: "generic-mcp-shape", type: "rectangle", x: 40, y: 40, width: 180, height: 90 } }],
    } }));
    const query = read(await second.callTool({ name: "query_elements", arguments: { ...doc, scope: { kind: "document" }, ids: ["generic-mcp-shape"] } }));
    assert.equal(query.elements[0].id, "generic-mcp-shape");
    await fs.writeFile(marker("mcp-both-ready"), "ready");
    await wait("mcp-disabled");
    for (const client of [first, second]) assert((await client.callTool({ name: "get_status", arguments: {} })).isError, "Disabled service still allowed access");
    await fs.writeFile(marker("mcp-revocation-checked"), "ready");
    await wait("mcp-reenabled");
    const updatedDescriptor = JSON.parse(await fs.readFile(marker("mcp-bridge.json"), "utf8"));
    assert.notEqual(updatedDescriptor.token, originalDescriptor.token);
    const reconnected = read(await first.callTool({ name: "get_status", arguments: {} }));
    read(await second.callTool({ name: "get_status", arguments: {} }));
    assert.equal(reconnected.revision, write.revision);
    const staleTask = await first.callTool({ name: "apply_operations", arguments: {
      ...doc, taskId: "before-revocation", requestId: "stale-task-write", label: "Reject stale task", baseRevision: reconnected.revision,
      operations: [{ op: "create", element: { id: "must-not-exist", type: "rectangle", x: 0, y: 0, width: 20, height: 20 } }],
    } });
    assert(staleTask.isError);
    assert(JSON.stringify(staleTask).includes("TASK_NOT_ACTIVE"));
    await fs.writeFile(marker("mcp-reconnected-ready"), "ready");
    await wait("mcp-reconnected-checked");
    await second.close(); second = null;
    await fs.writeFile(marker("mcp-one-ready"), "ready");
    await wait("mcp-finished");
    console.log("GENERIC_MCP_OK: exported stdio launch, two unknown agents, real drawing/read, disabled access, token rotation and safe reconnect");
  } catch (error) {
    console.error(error); process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    await first?.close(); await second?.close();
    if (child && child.exitCode === null) {
      // Request normal Electron shutdown so the persisted preference is preserved and cleanup is exercised.
      await fs.writeFile(path.join(userData, "mcp-quit"), "ready").catch(() => {});
      await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(5000)]);
      if (child.exitCode === null) {
        console.error("Isolated MCP desktop did not quit cleanly");
        process.exitCode = 1; child.kill("SIGKILL");
      }
    }
  }
})();
