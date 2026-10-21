---
name: easydraw-product-sketch
description: Create and refine editable low-fidelity product interface sketches in EasyDraw from product briefs or reference screens. Use for early UI structure and screen layouts; exclude general diagrams, posters, illustrations, and production frontend implementation.
---

# Product sketches in EasyDraw

Use EasyDraw MCP to create and refine editable product interface sketches. This skill defines the sketch conventions; MCP provides general canvas operations. Do not edit project files directly.

## Reach the canvas tools

Tool names below are server-side names; use the EasyDraw tool identifiers exposed by the current client. In Pi 0.99.0 and later, use built-in MCP. If tools are reached through `codemode` or `tool_search`, or a direct call rejects a JSON-encoded object argument, read [Pi native MCP in references/protocol.md](references/protocol.md#pi-native-mcp) for discovery, object-literal calls, result handling and screenshot forwarding. Missing direct tool declarations do not mean EasyDraw is disconnected.

## Understand the screen

Read `get_status`, then choose the smallest useful content read for the task:

- **Add a new page or screen:** if the current canvas is nonempty, use `get_outline` with document scope and `limit: 1` for the overall `bounds` and counts; the limit does not restrict the overall bounds. Get existing screen summaries with `query_elements`, document scope, `types: ["frame"]`, and `fields: ["name", "x", "y", "width", "height", "angle"]`. Do not expand every existing element merely to find unused space. The overall bounds also cover free elements outside frames; place the new screen beyond those bounds with a reasonable gap. If `elementCount` is zero, skip these content reads. See [compact placement reads](references/protocol.md#find-space-for-a-new-screen) for requests.
- **Modify existing content:** read the target frame's outline or query relevant IDs/groups with only the fields needed for the edit. Expand other scopes only when the requested change needs them.

Follow `nextOffset` when more relevant results are needed, carrying the first response's revision; refresh on `SNAPSHOT_EXPIRED`. A full document outline is appropriate for a requested canvas-wide inventory or review, not the default setup for adding a screen.

Read `get_capabilities` with `includeSchemas: true` when supported properties are uncertain. Every content request identifies `documentId` and the explicit `canvasId` from `get_status`; when targeting a different existing canvas, use `get_project_tree` and `switch_canvas` before editing; edits use the latest revision.

When adding a page or screen, prefer unused space on the current canvas and create a native `frame` there. Inspect existing content to avoid overlaps and preserve it. Create a new canvas only when the user explicitly requests one; asking for a new homepage, another screen or a different app does not by itself request a new canvas.

Infer the device, main user action and information hierarchy from the brief. Ask only for missing choices that change the product structure. Use the user's dimensions when provided; otherwise start with 390 × 844 for mobile or 1440 × 900 for desktop. These heights are starting sizes, not content budgets or first-screen constraints. Create a screen as a native `frame` through `apply_operations`. Frame positions use canvas coordinates; child batches may use the existing frame's local coordinates.

Initial planning must stop at the ordered screen regions and a short content summary for each. Do not enumerate all text, controls, icons or repeated items across the screen, calculate internal coordinates, or precompute every region's height. Choose shared margins, gaps and typography once, then start creating the frame and first region.

## Sketch conventions

- Default to low-fidelity sketches: neutral surfaces, clear borders, readable text, consistent margins and gaps. Honor explicit user styling requests.
- Use editable text and shapes for UI geometry. Use library icons for recognizable actions; do not replace available icons with emoji or assembled shapes.
- Default bounded image regions to a grouped background shape plus a small centered `builtin:placeholder:image-logo`. Use actual images when explicitly requested; do not fetch stock photos merely to decorate a sketch.
- Group coherent components: button backgrounds and labels, card contents, navigation items, form fields and each repeated list item. Keep repeated items independently editable. Avoid grouping an entire screen as one component.
- Use descriptive IDs or local refs. Patch existing elements instead of rebuilding them. Preserve the user's edits outside the requested change.

## Build

Read [references/protocol.md](references/protocol.md) when constructing batches or placing assets.

For icons, put a short English `iconDescription` on a create/update operation with a rectangle host. For screenshot recreation, describe the visible icon's shape and purpose in English. The application runs local vector retrieval and immediately uses the first match; accept approximate matches without searching, previewing or asking for confirmation. Set `element.strokeColor` or `patch.strokeColor` in the same operation. Use `assetRef` instead only when an exact asset is already known; never provide both fields.

For bounded photos, thumbnails, banners and avatars, use the fixed image-logo asset directly; do not send it through `iconDescription` or search for a different picture icon. Floating decorative illustrations are ordinary icons without a placeholder background. Read the composition example in `references/protocol.md`.

- Create an editable background first: rounded rectangle by default, an inscribed circle for circular reference crops. Give it no border and a fill subtly distinct from the underlying surface.
- Put the picture logo above it, centered in the region, with square size `min(32, width/2, height/2)`; never stretch it to the whole image region. Its rectangle host stays transparent and has no outline.
- Choose background and logo colors from the surrounding surface in the same batch. On white, use background `#e3e3e3` and logo `#686868`; on a dark `#242424` surface, use `#595959` and `#dadada`. On colored surfaces, keep the background near the surface hue with a lightness shift and give the logo stronger contrast. The caller supplies both colors; the canvas does not infer them.
- Group both layers immediately. Submit background, logo, group and nearby content together in one `apply_operations`; do not draw another image backdrop. Card surfaces remain separate UI geometry. Moving, resizing, rotating or deleting through MCP must include both element IDs; editing a single layer's color may target just that layer.

Detail only the region being submitted: decide its contents, measure text when necessary, and calculate its element coordinates. Submit it immediately through `apply_operations`, mixing shapes, text, asset references and grouping in the same atomic batch. Give every screen member its explicit `frameId`, including grouped elements; local coordinates and groups alone do not establish frame membership. Provide the active taskId, a unique requestId, latest baseRevision and concise label. Use local ref names for newly created objects referenced in that batch.

Continue with the next region using the previous region's actual content bottom plus the chosen gap. Track that bottom from the submitted geometry; request `get_bounds` only when the rendered extent is uncertain. Keep later regions at summary level until their turn. Do not repeat whole-screen planning or re-enumerate already submitted content.

After every AI batch, the application automatically increases affected frames' heights when their members extend below the bottom. The response's `frameHeightChanges` reports the resulting heights. Width stays fixed; height has no device-based limit. Do not squeeze, rearrange or rebuild earlier regions to fit the starting height, and do not call `fit_container` or send extra resize operations merely for vertical overflow. Automatic growth never shrinks a frame. Explicitly requested size changes remain ordinary edits. Tasks never resize containers. Before the first real edit, call `begin_task` and pass its `taskId` on every `apply_operations` batch. For an existing screen use its container scope; for multiple screens use an elements scope listing their frame IDs. For a new screen begin with bounds matching its planned frame in canvas coordinates; this task follows the page as it grows. Use document scope only for work spanning the whole canvas or unbounded free elements. Keep the same task active across region batches, captures and corrections. Successful writes renew its TTL; repeat the identical begin call to renew during long planning or verification. Finish with completed only after inspecting the final capture; use failed or cancelled when abandoning the work. See [task lifecycle and recovery](references/protocol.md#edit-task-lifecycle) for request examples and errors.

On a revision conflict, refresh affected elements and regenerate the patch. Retry an uncertain transport result with the exact same requestId and parameters. Use a new requestId after changing parameters; do not replay successful regions.

## Verify and hand off

Capture the explicit frame scope after a complete screen or a region with substantial layout risk. For long screens that exceed capture limits, capture bounded regions or reduce the capture scale; do not reduce the frame height to accommodate screenshots. Check hierarchy, clipping, spacing, grouping, icons and placeholders. Use explicit `inspect_geometry` checks when useful; overlaps inside components can be intentional.

Correct affected elements, finish active tasks, and use `set_view_state` to fit or select useful content. Report the changed screens and whether the final capture was actually inspected.
