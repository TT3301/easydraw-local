import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocketServer } from "ws";
import { CANVAS_TOOL_SCHEMAS } from "@easydraw/editor-contracts";
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "easydraw-mcp-smoke-"));
const descriptor = path.join(directory, "bridge.json");
const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
const address = server.address();
if (!address || typeof address === "string") throw new Error("No bridge address");
await fs.writeFile(descriptor, JSON.stringify({ version: 1, endpoint: `ws://127.0.0.1:${address.port}`, token: "test-only-token", pid: process.pid, appVersion: "smoke" }));
let connected!: () => void;
const connection = new Promise<void>(resolve => { connected = resolve; });
const requests: Array<{ method: string; params: unknown }> = [];
server.on("connection", (socket, request) => {
  if (new URL(request.url ?? "/", "ws://localhost").searchParams.get("token") !== "test-only-token") { socket.close(1008); return; }
  connected();
  socket.on("message", data => {
    const request = JSON.parse(String(data)); requests.push(request);
    const result = request.method === "capture" ? { documentId: "test", revision: 0, data: "iVBORw0KGgo=", mimeType: "image/png", width: 1, height: 1 }
      : request.method === "get_assets" ? { documentId: "test", revision: 0, items: [{ assetRef: "document:test", mimeType: "image/png", data: "iVBORw0KGgo=" }] }
      : { ok: true, documentId: "test", revision: 0, method: request.method, params: request.params };
    socket.send(JSON.stringify({ type: "response", id: request.id, ok: true, result }));
  });
});
const packagedIndex = process.argv.indexOf("--packaged"), executable = packagedIndex >= 0 ? process.argv[packagedIndex + 1] : undefined;
const bundle = process.argv.includes("--bundle");
const transport = new StdioClientTransport({ command: executable ?? process.execPath,
  args: executable ? [path.join(path.dirname(executable), "resources", "app.asar", "dist-mcp", "mcp-server.cjs")]
    : bundle ? ["dist-mcp/mcp-server.cjs"] : ["--import", "tsx", "packages/mcp-server/src/index.ts"],
  cwd: process.cwd(), env: { ...process.env, EASYDRAW_BRIDGE_DESCRIPTOR: descriptor, ...(executable ? { ELECTRON_RUN_AS_NODE: "1" } : {}) } as Record<string, string>, stderr: "pipe" });
const client = new Client({ name: "general-canvas-smoke", version: "1.0.0" });
const doc = { documentId: "test", canvasId: "test-canvas" }, scope = { kind: "document" };
const inputs: Record<string, unknown> = {
  get_project_tree: { documentId: "test" }, switch_canvas: doc, manage_project_tree: { documentId: "test", baseRevision: 0, requestId: "tree", operation: { op: "create", type: "canvas", parentId: null } },
  get_capabilities: {}, get_status: {}, get_view_state: doc, set_view_state: { ...doc, selection: [] },
  get_outline: { ...doc, scope }, query_elements: { ...doc, scope, fields: ["x"] }, get_changes: { ...doc, sinceRevision: 0 },
  apply_operations: { ...doc, taskId: "task", baseRevision: 0, requestId: "draw", label: "Diagram", operations: [{ op: "create", ref: "node", element: { type: "diamond", x: -20, y: 0, width: 100, height: 100 } }, { op: "create", iconDescription: "shopping cart icon", element: { type: "rectangle", x: 100, y: 0, width: 24, height: 24, strokeColor: "#abcdef" } }] },
  measure_text: { ...doc, text: "Hello" }, get_bounds: { ...doc, scope },
  search_assets: { ...doc, sources: ["builtin"], query: "search", category: "icon" }, get_assets: { ...doc, assetRefs: ["builtin:placeholder:image-logo"], content: true },
  import_assets: { ...doc, requestId: "import", assets: [{ data: "c3Zn", mimeType: "image/svg+xml", fileName: "test.svg" }] },
  begin_task: { ...doc, taskId: "task", label: "Diagram", scope }, finish_task: { ...doc, taskId: "task", status: "completed" },
  capture: { ...doc, scope }, inspect_geometry: { ...doc, scope, checks: ["references"] }, export: { ...doc, scope, format: "svg" }, history: { ...doc, action: "list" },
};
try {
  await client.connect(transport);
  await Promise.race([connection, new Promise((_, reject) => setTimeout(() => reject(new Error("Bridge connection timed out")), 5000).unref())]);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(t => t.name).sort(), Object.keys(CANVAS_TOOL_SCHEMAS).sort());
  for (const tool of listed.tools) {
    // The MCP SDK accepts tuple JSON Schema, but Codex's tool-spec importer
    // rejects an array of schemas in `items` and silently omits that tool.
    const checkSchema = (value: unknown, location: string): void => {
      if (!value || typeof value !== "object") return;
      const schema = value as Record<string, unknown>;
      assert.ok(!Array.isArray(schema.items), `${location}: tuple items are incompatible with Codex`);
      assert.ok(!schema.prefixItems, `${location}: prefixItems are incompatible with model tool schemas`);
      for (const [key, child] of Object.entries(schema)) checkSchema(child, `${location}.${key}`);
    };
    checkSchema(tool.inputSchema, tool.name);
    for (const field of ["scope", "operation", "coordinateSpace"]) {
      const property = tool.inputSchema.properties?.[field] as { type?: string } | undefined;
      if (property) assert.equal(property.type, "object", `${tool.name}.${field}: explicit object type required`);
    }
    const result = await client.callTool({ name: tool.name, arguments: inputs[tool.name] as Record<string, unknown> });
    assert.ok(!result.isError, `${tool.name}: ${JSON.stringify(result)}`);
    assert.equal(requests.at(-1)?.method, tool.name);
    if (tool.name === "capture" || tool.name === "get_assets") assert.ok((result as any).content.some((c: any) => c.type === "image"));
  }
  const iconOperation = (requests.find(request => request.method === "apply_operations")?.params as any).operations[1];
  assert.equal((requests.find(request => request.method === "apply_operations")?.params as any).taskId, "task");
  assert.equal(iconOperation.iconDescription, "shopping cart icon");
  assert.equal(iconOperation.element.strokeColor, "#abcdef");
  const count = requests.length;
  const missingScope = await client.callTool({ name: "query_elements", arguments: doc });
  assert.ok(missingScope.isError); assert.equal(requests.length, count);
  const oldTool = await client.callTool({ name: "apply_design_plan", arguments: {} });
  assert.ok(oldTool.isError); assert.equal(requests.length, count);
  const invalidPoint = await client.callTool({ name: "apply_operations", arguments: { ...inputs.apply_operations as object,
    operations: [{ op: "rotate", ids: ["node"], angle: 1, origin: [0, 0, 0] }] } });
  assert.ok(invalidPoint.isError); assert.equal(requests.length, count);
  process.stdout.write(`General canvas MCP smoke passed: ${listed.tools.length} tools, schema validation, scope requirements, no legacy tools (${bundle ? "bundle" : "source"}).\n`);
} finally {
  await client.close(); for (const socket of server.clients) socket.terminate();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await fs.rm(directory, { recursive: true, force: true });
}
