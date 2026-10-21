import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
if (!process.env.EASYDRAW_BRIDGE_DESCRIPTOR || process.env.EASYDRAW_ISOLATED_MCP_SMOKE !== "1"
  || !/^easydraw-smoke-\d+$/.test(path.basename(path.dirname(process.env.EASYDRAW_BRIDGE_DESCRIPTOR)))) {
  throw new Error("Live smoke must be launched by engine:integration:smoke against its isolated temporary desktop");
}
const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "packages/mcp-server/src/index.ts"], cwd: process.cwd(), env: process.env as Record<string, string>, stderr: "pipe" });
const client = new Client({ name: "general-canvas-live-smoke", version: "1.0.0" });
const text = (result: any) => result.content.find((item: any) => item.type === "text")?.text ?? "";
const call = async (name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: name === "apply_operations" ? { taskId: "live-edit", ...args } : args });
  if (result.isError) throw new Error(`${name}: ${text(result)}`);
  return JSON.parse(text(result));
};
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let canvasId: string | undefined, documentId: string | undefined, created: string[] = [];
try {
  await client.connect(transport);
  let status: any;
  for (let i = 0; i < 40; i++) {
    const result = await client.callTool({ name: "get_status", arguments: {} });
    if (!result.isError) { status = JSON.parse(text(result)); if (status.ready) break; }
    await wait(250);
  }
  assert.ok(status?.ready, "Canvas did not become ready");
  documentId = status.documentId; canvasId = status.canvasId;
  const doc = { documentId, canvasId }, scope = { kind: "document" };
  await call("begin_task", { ...doc, taskId: "live-edit", label: "Live verification", scope });
  const initial = await call("query_elements", { ...doc, scope, fields: ["x"], limit: 200 });
  assert.ok(initial.nextOffset === null, "Unexpectedly large isolated fixture");
  if (initial.elements.length) {
    await call("apply_operations", { ...doc, baseRevision: status.revision, requestId: "clear-isolated-fixture", label: "Verify frame-free canvas",
      operations: [{ op: "delete", ids: initial.elements.map((e: any) => e.id), children: "delete" }] });
  }
  status = await call("get_status", {});
  assert.equal(status.elementCount, 0);
  assert.equal((await call("get_view_state", doc)).focusId, null);
  const capabilities = await call("get_capabilities", {});
  assert.ok(capabilities.features.freeCanvas);
  assert.ok(capabilities.elementTypes.includes("diamond"));
  const search = await call("search_assets", { ...doc, sources: ["builtin"], category: "icon", query: "search", limit: 1 });
  assert.equal(search.items[0].source, "builtin");
  const previews = await client.callTool({ name: "get_assets", arguments: { ...doc, assetRefs: [search.items[0].assetRef, "builtin:placeholder:image-logo"], content: true } });
  assert.ok(!previews.isError);
  assert.equal((previews as any).content.filter((item: any) => item.type === "image").length, 2);
  const measured = await call("measure_text", { ...doc, text: "EasyDraw 通用画布", fontSize: 20 });
  assert.ok(measured.width > 0 && measured.height > 0);
  const run = `general-${Date.now()}`, frame = `${run}-frame`, node = `${run}-node`, icon = `${run}-icon`, placeholder = `${run}-image`, placeholderLogo = `${run}-image-logo`, label = `${run}-label`, target = `${run}-target`, arrow = `${run}-arrow`;
  const operations = [
    { op: "create", element: { id: frame, type: "frame", name: "General MCP verification", x: 1500, y: 0, width: 500, height: 400 } },
    { op: "create", element: { id: node, type: "diamond", x: 1540, y: 40, width: 140, height: 100, backgroundColor: "#e9f0ff", roughness: 0 } },
    { op: "create", element: { id: label, type: "text", x: 1560, y: 170, width: 220, height: 32, text: "General canvas", fontSize: 20, roughness: 0 } },
    { op: "create", assetRef: search.items[0].assetRef, element: { id: icon, type: "rectangle", x: 1740, y: 40, width: 40, height: 40, strokeColor: "#2266cc" } },
    { op: "create", element: { id: placeholder, type: "rectangle", x: 1740, y: 120, width: 180, height: 120, backgroundColor: "#e3e3e3", strokeColor: "transparent", strokeWidth: 0, roughness: 0, roundness: { type: 3, value: 12 } } },
    { op: "create", assetRef: "builtin:placeholder:image-logo", element: { id: placeholderLogo, type: "rectangle", x: 1814, y: 164, width: 32, height: 32, strokeColor: "#686868" } },
    { op: "group", ids: [placeholder, placeholderLogo], groupId: `${run}-image-group` },
    { op: "create", element: { id: target, type: "rectangle", x: 1800, y: 280, width: 100, height: 60, roughness: 0 } },
    { op: "create", element: { id: arrow, type: "arrow", x: 1680, y: 90, width: 120, height: 220, points: [[0, 0], [120, 220]], startBinding: { elementId: node, focus: 0, gap: 5 }, endBinding: { elementId: target, focus: 0, gap: 5 } } },
    { op: "group", ids: [node, label], groupId: `${run}-group` },
  ];
  const input = { ...doc, baseRevision: status.revision, requestId: `${run}-write`, label: "General canvas smoke", operations };
  const dry = await call("apply_operations", { ...input, dryRun: true, requestId: `${run}-preview` });
  assert.equal(dry.revision, status.revision);
  const write = await call("apply_operations", input); created = [frame, node, label, icon, placeholder, placeholderLogo, target, arrow];
  assert.equal(write.revision, status.revision + 1);
  assert.deepEqual(await call("apply_operations", input), write);
  const elements = await call("query_elements", { ...doc, scope, ids: created });
  assert.equal(elements.elements.length, 8);
  assert.ok(elements.elements.find((e: any) => e.id === icon).vectorData.paths.length > 0);
  assert.equal(elements.elements.find((e: any) => e.id === node).frameId, null);
  const imageBackground = elements.elements.find((e: any) => e.id === placeholder);
  const imageLogo = elements.elements.find((e: any) => e.id === placeholderLogo);
  assert.equal(imageBackground.backgroundColor, "#e3e3e3");
  assert.equal(imageLogo.strokeColor, "#686868");
  assert.equal(imageLogo.backgroundColor, "transparent");
  assert.equal(imageLogo.vectorData.paths.length, 2);
  assert.equal(imageLogo.width, 32);
  assert.equal(imageLogo.x + 16, imageBackground.x + imageBackground.width / 2);
  assert.equal(imageLogo.y + 16, imageBackground.y + imageBackground.height / 2);
  assert.deepEqual(imageLogo.groupIds, imageBackground.groupIds);
  await call("begin_task", { ...doc, taskId: run, label: "Inspect general drawing", scope: { kind: "elements", ids: created } });
  await call("get_bounds", { ...doc, scope: { kind: "elements", ids: created }, includeStroke: true });
  const captureScope = { kind: "bounds", bounds: { x: 1500, y: 0, width: 500, height: 400 } };
  const capture = await client.callTool({ name: "capture", arguments: { ...doc, scope: captureScope, scale: 2 } });
  if (capture.isError) throw new Error(text(capture));
  const image = (capture as any).content.find((c: any) => c.type === "image") as any;
  assert.ok(image?.data);
  await fs.writeFile(path.join(os.tmpdir(), "easydraw-general-mcp.png"), Buffer.from(image.data, "base64"));
  const svg = await call("export", { ...doc, scope: captureScope, format: "svg" });
  assert.ok(Buffer.from(svg.data, "base64").toString().includes("svg"));
  await call("inspect_geometry", { ...doc, scope: { kind: "elements", ids: created }, checks: ["references", "text_overflow"] });
  await call("finish_task", { ...doc, taskId: run, status: "completed" });
  await call("history", { ...doc, action: "undo", transactionId: write.transaction.id, baseRevision: write.revision });
  assert.equal((await call("query_elements", { ...doc, scope, ids: created })).elements.length, 0);
  await call("history", { ...doc, action: "redo", transactionId: write.transaction.id, baseRevision: write.revision + 1 });
  const moved = await call("apply_operations", { ...doc, baseRevision: write.revision + 2, requestId: `${run}-move`, label: "Move connected node", operations: [{ op: "move", ids: [node], dx: 20, dy: 20 }] });
  const afterMove = await call("query_elements", { ...doc, scope, ids: [arrow] });
  assert.notDeepEqual(afterMove.elements[0].points, elements.elements.find((e: any) => e.id === arrow).points, "Arrow follows moved bound node");
  assert.ok((await call("get_changes", { ...doc, sinceRevision: write.revision })).changes.length >= 3);
  await call("get_outline", { ...doc, scope });
  await call("set_view_state", { ...doc, selection: [node], fitIds: created });
  const view = await call("get_view_state", doc);
  assert.deepEqual(view.selection, [node]);
  assert.equal((await call("get_status", {})).revision, moved.revision);
  assert.equal(capabilities.features.autoFrameHeight, "grow-only");
  const page = `${run}-auto-height`, card = `${run}-rotated-card`, cardText = `${run}-card-text`;
  const pageWrite = await call("apply_operations", { ...doc, baseRevision: moved.revision, requestId: `${run}-page`, label: "Create short page",
    operations: [{ op: "create", element: { id: page, type: "frame", x: 2100, y: 200, width: 390, height: 100 } }] });
  created.push(page, card, cardText);
  const growthInput = { ...doc, baseRevision: pageWrite.revision, requestId: `${run}-grow`, label: "Add overflowing grouped content", operations: [
    { op: "create", element: { id: card, type: "rectangle", frameId: page, x: 2130, y: 280, width: 100, height: 20, angle: Math.PI / 2, strokeWidth: 4, roughness: 0 } },
    { op: "create", element: { id: cardText, type: "text", frameId: page, x: 2250, y: 240, width: 100, height: 25, text: "Grouped", strokeWidth: 0, fontSize: 20 } },
    { op: "group", ids: [card, cardText], groupId: `${run}-auto-height-group` },
  ] };
  const previewGrowth = await call("apply_operations", { ...growthInput, requestId: `${run}-preview-grow`, dryRun: true });
  assert.deepEqual(previewGrowth.frameHeightChanges, [{ frameId: page, previousHeight: 100, height: 142 }]);
  assert.equal((await call("query_elements", { ...doc, scope, ids: [page], fields: ["height"] })).elements[0].height, 100);
  const growth = await call("apply_operations", growthInput);
  assert.equal(growth.revision, pageWrite.revision + 1);
  assert.deepEqual(growth.frameHeightChanges, previewGrowth.frameHeightChanges);
  assert.ok(growth.affected.updatedIds.includes(page));
  assert.deepEqual(await call("apply_operations", growthInput), growth);
  const grownPage = (await call("query_elements", { ...doc, scope, ids: [page], fields: ["x", "y", "width", "height"] })).elements[0];
  assert.deepEqual(grownPage, { id: page, type: "frame", x: 2100, y: 200, width: 390, height: 142 });
  const cardBounds = await call("get_bounds", { ...doc, scope: { kind: "elements", ids: [card] }, includeStroke: true });
  assert.equal(cardBounds.bounds.y + cardBounds.bounds.height, grownPage.y + grownPage.height);
  const grownCapture = await client.callTool({ name: "capture", arguments: { ...doc, scope: { kind: "container", id: page } } });
  const grownContent = grownCapture.content as Array<{ type: string }>;
  assert.ok(!grownCapture.isError && grownContent.some(item => item.type === "image"));
  await call("history", { ...doc, action: "undo", transactionId: growth.transaction.id, baseRevision: growth.revision });
  assert.equal((await call("query_elements", { ...doc, scope, ids: [page], fields: ["height"] })).elements[0].height, 100);
  assert.equal((await call("query_elements", { ...doc, scope, ids: [card, cardText] })).elements.length, 0);
  await call("history", { ...doc, action: "redo", transactionId: growth.transaction.id, baseRevision: growth.revision + 1 });
  assert.equal((await call("query_elements", { ...doc, scope, ids: [page], fields: ["height"] })).elements[0].height, 142);
  const removeMembers = await call("apply_operations", { ...doc, baseRevision: growth.revision + 2, requestId: `${run}-remove-members`, label: "Remove members without shrinking",
    operations: [{ op: "delete", ids: [card, cardText], children: "delete" }] });
  assert.deepEqual(removeMembers.frameHeightChanges, []);
  assert.equal((await call("query_elements", { ...doc, scope, ids: [page], fields: ["height"] })).elements[0].height, 142);
  process.stdout.write("General MCP live smoke passed: native free elements, atomic vector assets, dryRun, retries, tasks, PNG/SVG, history, bindings, views and automatic frame height.\n");
} finally {
  if (documentId && created.length) {
    const status = await call("get_status", {});
    await call("begin_task", { documentId, canvasId, taskId: "live-edit", label: "Live verification", scope: { kind: "document" } });
    await call("apply_operations", { documentId, canvasId, baseRevision: status.revision, requestId: `cleanup-${Date.now()}`, label: "Remove smoke objects", operations: [{ op: "delete", ids: created, children: "delete" }] }).catch(() => undefined);
  }
  if (documentId) await call("finish_task", { documentId, canvasId, taskId: "live-edit", status: "completed" }).catch(() => undefined);
  await client.close();
}
