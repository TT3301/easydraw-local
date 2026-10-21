# Product sketch command examples

The authoritative schema is returned by `get_capabilities` with `includeSchemas: true`. Use native fields: angle in radians, opacity 0–100, frameId for parent frame, containerId for text bound to a shape. strokeColor also sets vector asset color. No page/design/placeholder-specific write tools exist.

## Pi native MCP

Pi registers this server's tools as `mcp__easydraw__<tool>`. With `direct` exposure, call the declared tools normally. With `deferred`, use `tool_search` to load the relevant EasyDraw tools. With `codemode` (including the `codemode-deferred` alias), discover the namespace and schema inside a script; Pi 1.0 does not list these tools in the codemode description:

```js
text(await describeNamespace("mcp__easydraw"));
text(await describeTool("mcp__easydraw__get_status"));
```

`searchTools("capture", { namespace: "mcp__easydraw" })` finds tools within the server. Codemode calls return MCP envelopes. Check `isError` before using `structuredContent`; EasyDraw also provides JSON in its text content:

Pass `scope`, `operation`, `coordinateSpace` and other object arguments as JavaScript objects, never as JSON strings. If a direct call fails with `Validation failed for tool` / `must be object` and shows an escaped JSON string, retry through Pi's native `codemode` using an object literal. That validation failure occurs before dispatch. For example, after reading `get_project_tree` for the current project revision:

```js
const result = await tools.mcp__easydraw__manage_project_tree({
  documentId: "<actual-document-id>", baseRevision: 0,
  requestId: "<unique-request-id>",
  operation: { op: "create", type: "canvas", name: "Home", parentId: null }
});
text(result);
```

Replace `baseRevision` with the current project revision. Use the native MCP connection for both drawing and verification; no custom stdio client or bridge-descriptor access is needed. If `codemode` is unavailable, tell the user to select `codemode` exposure for EasyDraw in Pi's `/mcp` manager and run `/reload`, instead of rebuilding the transport. A dispatched call whose outcome is uncertain must still use the same requestId and identical parameters on retry.

```js
const result = await tools.mcp__easydraw__get_status({});
if (result.isError) {
  for (const block of result.content ?? []) {
    if (block.type === "text") text(block.text);
  }
  exit();
}
const status = result.structuredContent ?? JSON.parse(
  result.content.find(block => block.type === "text").text
);
store("easydraw-status", status);
text(status);
```

After drawing, forward every image block from `capture` with `image(block)` so the model can inspect it. EasyDraw returns text metadata before the image; `image(result.content[0])` therefore does not work for this server. Replace the frame ID with the actual returned ID:

```js
const status = load("easydraw-status");
const result = await tools.mcp__easydraw__capture({
  documentId: status.documentId, canvasId: status.canvasId,
  scope: { kind: "container", id: "<actual-frame-id>" }
});
for (const block of result.content ?? []) {
  if (block.type === "text") text(block.text);
  else if (!result.isError && block.type === "image") image(block);
}
```

Await canvas switches and revision-dependent writes sequentially; use each successful write's returned revision for the next batch. A codemode script failure does not undo earlier tool calls, and MCP `isError` results can resolve without throwing. Check each result before continuing.

If EasyDraw is unavailable, ask the user to enable Allow MCP access in the AI dialog, follow its setup guide, and reload the MCP client or start a new session. An extension such as `pi-mcp-adapter` that owns `/mcp` overrides Pi's built-in session support; a successful shell `pi mcp list` alone does not prove that the active session uses it.

## Find space for a new screen

For a nonempty current canvas, first request only one outline item. The response's overall `bounds` covers the entire scope, including free elements outside frames; only `items` and `groups` are paginated. Use the bounds for placement, without fetching the remaining outline pages:

```json
{
  "documentId": "<get_status.documentId>",
  "canvasId": "<get_status.canvasId>",
  "revision": 0,
  "scope": { "kind": "document" },
  "limit": 1
}
```

Then use `query_elements` for existing frame summaries, rather than expanding their children:

```json
{
  "documentId": "<get_status.documentId>",
  "canvasId": "<get_status.canvasId>",
  "revision": 0,
  "scope": { "kind": "document" },
  "types": ["frame"],
  "fields": ["name", "x", "y", "width", "height", "angle"],
  "limit": 20
}
```

Replace both example revisions with the current snapshot revision. Frame queries always include `id` and `type`. Follow their `nextOffset` only when more frame summaries are relevant, preserving that revision. If a snapshot expires, refresh before deciding placement. To add a screen on the right, use `x = bounds.x + bounds.width + gap` with a reasonable gap; empty-canvas placement needs no content reads. A frame-only query is insufficient for collision avoidance because free elements can extend beyond frames. Fetch child details only when modifying or explicitly reviewing those contents.

## Edit task lifecycle

Every real `apply_operations` requires an active taskId. Begin before creating or modifying content, retain it through capture/verification/corrections, then finish. Task scope is a presentation/workflow boundary, not a document lock. Container scope covers the page and its members; elements scope covers the selected free elements and the pages of selected page members. Include both pages when reparenting. Bounds scopes also cover intersecting pages and follow those pages after creation/growth; bounds use canvas coordinates. A new page can therefore start with its planned bounds before any element exists. Document scope covers the current canvas.

```js
const doc = { documentId: status.documentId, canvasId: status.canvasId };
const taskId = "home-edit-1";
const task = await tools.mcp__easydraw__begin_task({
  ...doc, taskId, label: "Edit Home",
  scope: { kind: "container", id: "<actual-frame-id>" }, ttlMs: 600000
});
// For a new screen replace scope with its planned canvas bounds:
// { kind: "bounds", bounds: { x: 0, y: 0, width: 390, height: 844 } }
// Check task.isError before sending any editing batches.
```

Pass taskId alongside requestId on all batches below. A task does not change revision. Default TTL is 3 minutes; ttlMs may be 1 second to 10 minutes. Successful batches renew the TTL. Repeat begin_task with the same taskId, label and scope during longer pauses; it renews without another notice. After finishing verification:

```js
const finished = await tools.mcp__easydraw__finish_task({
  ...doc, taskId, status: "completed"
});
// presentationPending=true means remaining elements are still appearing;
// the application removes the mask when this task's display queue drains.
```

On TASK_REQUIRED or TASK_NOT_ACTIVE, begin/renew the intended task and retry the rejected edit with taskId. On TASK_SCOPE_MISMATCH, begin a new task covering all reported targets and resend with the new taskId; finish the abandoned task as cancelled. TASK_FINISHING requires a new task. Changing parameters requires a new requestId. Successful retries replay even after task completion; do not replay a successful region with changed parameters. dryRun may omit taskId and never starts/renews a task. Switching canvas/project clears tasks, so begin again on the new canvas. Capture/export flush pending display elements but do not finish an active editing task or include its overlay.

## Create a screen

```json
{
  "documentId": "<get_status.documentId>",
  "canvasId": "<canvasId>",
  "baseRevision": 0,
  "taskId": "home-edit-1",
  "requestId": "screen-1",
  "label": "Create screen",
  "operations": [{ "op": "create", "ref": "screen", "element": {
    "type": "frame", "name": "Home", "x": 0, "y": 0,
    "width": 390, "height": 844, "backgroundColor": "#ffffff"
  }}]
}
```

Use returned idMap.screen as the actual frame ID and returned revision for subsequent batches. Replace example values with current state.

For an unspecified size, start mobile screens at 390 × 844 and desktop screens at 1440 × 900. Plan only the region order and brief summaries before creation; expand contents and calculate coordinates for the current region immediately before submitting it.

Every `apply_operations` batch automatically extends affected frames down to their members' rendered bottom, including rotation and stroke. This happens in the same transaction, adds no extra revision, preserves width and member positions, and never automatically shrinks. Set `frameId` on every member; neither `coordinateSpace` nor grouping implies membership. Free elements do not grow nearby frames. The response includes `frameHeightChanges`, for example `[{ "frameId": "home", "previousHeight": 844, "height": 1021 }]`; `dryRun` reports the same proposed growth without saving it. No separate tool call or explicit resize is needed. Continue placing regions below existing content, without fitting them into the initial height or a device first screen.

## Build a component

```json
{
  "documentId": "<document-id>",
  "canvasId": "<canvasId>",
  "baseRevision": 1,
  "taskId": "home-edit-1",
  "requestId": "home-action-1",
  "label": "Create primary action",
  "coordinateSpace": { "kind": "container", "id": "<frame-id>" },
  "operations": [
    { "op": "create", "ref": "surface", "element": {
      "type": "rectangle", "frameId": "<frame-id>", "x": 24, "y": 120,
      "width": 342, "height": 48, "backgroundColor": "#eeeeee",
      "strokeColor": "#333333", "strokeWidth": 1, "roughness": 0
    } },
    { "op": "create", "ref": "label", "element": {
      "type": "text", "frameId": "<frame-id>", "x": 72, "y": 132,
      "width": 230, "height": 24, "text": "Continue", "fontSize": 16,
      "fontFamily": 6, "strokeColor": "#222222", "roughness": 0
    } },
    { "op": "group", "ids": ["surface", "label"], "groupId": "home-primary-action" }
  ]
}
```

Select icons directly with a short English description, without an extra search or preview round:

```json
{
  "op": "create", "iconDescription": "shopping cart icon",
  "element": {
    "type": "rectangle", "frameId": "<frame-id>",
    "x": 24, "y": 80, "width": 24, "height": 24, "strokeColor": "#333333"
  }
}
```

The application selects top1 locally. For screenshots, describe the icon in English. Updates also accept `iconDescription` with a native `patch`. `assetRef` and `iconDescription` are mutually exclusive. Submit ready regions progressively.

Place other vector assets as rectangle hosts with assetRef on the operation; use image elements for raster assets. The host has vectorData supplied by the application, a transparent background and no outline. Set its strokeColor to choose vector color. Include these operations alongside surrounding components.

## Build an image region

Use this fixed asset directly, with no search, preview or vector selection. In one atomic transaction create the background, place the centered picture logo above it, then group both. Append the operations to the surrounding region's batch when possible. The example assumes a white surface and uses frame-local coordinates.

```json
{
  "documentId": "<document-id>",
  "canvasId": "<canvasId>",
  "baseRevision": 2,
  "taskId": "home-edit-1",
  "requestId": "product-image-1",
  "label": "Create image region",
  "coordinateSpace": { "kind": "container", "id": "<frame-id>" },
  "operations": [
    { "op": "create", "ref": "image-background", "element": {
      "type": "rectangle", "frameId": "<frame-id>",
      "x": 24, "y": 200, "width": 342, "height": 180,
      "backgroundColor": "#e3e3e3", "strokeColor": "transparent",
      "strokeWidth": 0, "roughness": 0, "roundness": { "type": 3, "value": 12 }
    } },
    { "op": "create", "ref": "image-logo", "assetRef": "builtin:placeholder:image-logo", "element": {
      "type": "rectangle", "frameId": "<frame-id>",
      "x": 179, "y": 274, "width": 32, "height": 32,
      "strokeColor": "#686868", "altText": "Product image"
    } },
    { "op": "group", "ids": ["image-background", "image-logo"], "groupId": "product-image-1" }
  ]
}
```

For a region `(x,y,w,h)`, set logo size `s=min(32,w/2,h/2)` and position `(x+(w-s)/2,y+(h-s)/2)`. For a circular crop use an ellipse with diameter `d=min(w,h)` at `(x+(w-d)/2,y+(h-d)/2)`; keep the same centered logo. For smaller rectangles cap the radius at `min(12,w/5,h/5)`. Use new request and group IDs for each component; refs are local to the batch.

Choose both colors for the surrounding surface before submitting (see SKILL.md); the application uses the values supplied. The background is a normal shape and the logo a separate vector asset. To move, scale, rotate or delete the component via MCP, explicitly include both IDs returned in idMap. To find the pair later, query by groupIds. The legacy wireframe asset remains for compatibility and is not the default for new drawings.

Use update with an ID and partial native patch for existing elements. dryRun validates without changing content/history; a formal submission uses a new requestId. Capture a screen with documentId and scope `{ "kind": "container", "id": "<frame-id>" }`. A document scope includes free elements. Coordinate space never implies parent membership: set frameId explicitly.
