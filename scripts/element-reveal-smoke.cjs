const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow } = require("electron");
const WebSocket = require("ws");

// Reuse the desktop's isolated test profile and real bridge, never the user's project.
process.env.EASYDRAW_LIVE_SMOKE = "1";
process.env.EASYDRAW_DEVELOPMENT_URL = pathToFileURL(path.resolve("dist/index.html")).href;
require("../electron/main.cjs");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
const timeout = setTimeout(() => { console.error("Element reveal smoke timed out"); app.exit(1); }, 30_000);
app.whenReady().then(async () => {
  try {
    let window;
    for (let i = 0; i < 100; i++) {
      window = BrowserWindow.getAllWindows()[0];
      if (window && await window.webContents.executeJavaScript("!!document.querySelector('.app-shell')")) break;
      await delay(50);
    }
    assert(window, "isolated workbench did not start");
    window.webContents.setBackgroundThrottling(false);
    const run = source => window.webContents.executeJavaScript(source);
    await run("window.easydrawDesktop.setMcpEnabled(true)");
    const descriptor = JSON.parse(await fs.readFile(path.join(app.getPath("userData"), "mcp-bridge.json"), "utf8"));
    const url = new URL(descriptor.endpoint); url.searchParams.set("token", descriptor.token);
    socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    let sequence = 0;
    const waiting = new Map();
    socket.on("message", raw => {
      const response = JSON.parse(String(raw));
      const pending = waiting.get(response.id);
      if (!pending) return;
      waiting.delete(response.id);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(`${response.error.code}: ${response.error.message}`));
    });
    const call = (method, params) => new Promise((resolve, reject) => {
      const id = String(++sequence); waiting.set(id, { resolve, reject });
      socket.send(JSON.stringify({ type: "request", id, method, params: method === "apply_operations" ? { taskId: "reveal-edit", ...params } : params }));
    });
    let status = await call("get_status", {});
    const doc = { documentId: status.documentId, canvasId: status.canvasId };
    await call("begin_task", { ...doc, taskId: "reveal-edit", label: "Reveal test", scope: { kind: "document" } });
    const initial = await call("query_elements", { ...doc, scope: { kind: "document" }, limit: 200 });
    if (initial.elements.length) {
      await call("apply_operations", { ...doc, baseRevision: status.revision, requestId: "clear", label: "Clear test fixture",
        operations: [{ op: "delete", ids: initial.elements.map(e => e.id), children: "delete" }] });
    }
    await call("set_view_state", { ...doc, scrollX: 0, scrollY: 0, zoom: 1, selection: [] });
    await delay(100);
    await run(`(() => {
      window.revealFrames = [];
      window.sampleReveal = () => {
        const canvas = document.querySelector('canvas.easydraw__canvas.static:not(.connector-layer)');
        const context = canvas.getContext('2d'), ratio = devicePixelRatio;
        return Array.from({length:6}, (_, i) => {
          const color = context.getImageData(Math.round((65+i*80)*ratio),Math.round(165*ratio),1,1).data;
          return color[0]>200 && color[1]<60 && color[2]<60 ? '1' : '0';
        }).join('');
      };
      window.recordReveal = setInterval(() => {
        const state = sampleReveal();
        if (revealFrames.at(-1)?.state !== state) revealFrames.push({state, time: performance.now()});
      }, 16);
    })()`);
    status = await call("get_status", {});
    const shape = (index, prefix = "reveal") => ({ op: "create", element: { id: `${prefix}-${index}`, type: "rectangle", x: 40 + index * 80, y: 140,
      width: 50, height: 50, backgroundColor: "#ff0000", strokeColor: "transparent", strokeWidth: 0, fillStyle: "solid", roughness: 0 } });
    const first = await call("apply_operations", { ...doc, baseRevision: status.revision, requestId: "first", label: "First three",
      operations: [shape(0), shape(1), shape(2), { op: "group", ids: ["reveal-0", "reveal-1", "reveal-2"], groupId: "component" }] });
    assert.equal((await call("query_elements", { ...doc, scope: { kind: "document" } })).elements.length, 3, "response must contain a complete committed batch");
    const second = await call("apply_operations", { ...doc, baseRevision: first.revision, requestId: "second", label: "Append three",
      operations: [shape(3), shape(4), shape(5)] });
    for (let i = 0; i < 120 && await run("sampleReveal()") !== "111111"; i++) await delay(25);
    const frames = await run("clearInterval(recordReveal); revealFrames");
    assert.deepEqual(frames.map(frame => frame.state), ["000000", "100000", "110000", "111000", "111100", "111110", "111111"], "each element must appear separately, across batches and groups");
    for (let i = 2; i < frames.length; i++) {
      const elapsed = frames[i].time - frames[i - 1].time;
      assert(elapsed >= 300 && elapsed <= 550, `expected approximately 400ms between steps, got ${elapsed}`);
    }
    assert.equal((await call("get_status", {})).revision, second.revision, "playback must not create revisions");

    // User interaction ends the presentation without changing document content.
    const next = await call("apply_operations", { ...doc, baseRevision: second.revision, requestId: "interact", label: "Interaction test",
      operations: [{ op: "delete", ids: Array.from({length:6}, (_, i) => `reveal-${i}`), children: "delete" }, shape(0, "interact"), shape(1, "interact"), shape(2, "interact")] });
    await delay(50);
    assert.equal(await run("sampleReveal()"), "000000", "new content should still be queued before interaction");
    await run("document.querySelector('.canvas-wrap').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))");
    await delay(60);
    assert.equal(await run("sampleReveal()"), "111000", "interaction should show all remaining elements");
    assert.equal((await call("get_status", {})).revision, next.revision);
    await call("finish_task", { ...doc, taskId: "reveal-edit", status: "completed" });
    await call("begin_task", { ...doc, taskId: "page-edit", label: "Edit page", scope: { kind: "bounds", bounds: { x: 40, y: 260, width: 300, height: 180 } } });
    const pageInput = { ...doc, baseRevision: next.revision, requestId: "page", label: "Page fixture", operations: [
      { op: "create", element: { id: "page", type: "frame", name: "活动管理后台页面名称长度测试活动管理后台页面名称长度测试", x: 40, y: 260, width: 300, height: 180, backgroundColor: "#ffffff", roundness: { type: 3, value: 24 } } },
    ] };
    await assert.rejects(call("apply_operations", { ...pageInput, taskId: undefined }), /TASK_REQUIRED/);
    const page = await call("apply_operations", { ...pageInput, taskId: "page-edit" });
    await delay(80);
    assert.equal(await run("document.querySelectorAll('.ai-construction-overlay--active').length"), 1);
    assert.equal(await run("getComputedStyle(document.querySelector('.ai-construction-overlay')).borderTopLeftRadius"), '24px');
    assert.equal(await run("getComputedStyle(document.querySelector('.ai-construction-overlay__sweep')).animationName"), 'ai-construction-sweep');
    await call("capture", { ...doc, scope: { kind: "container", id: "page" }, scale: 1 });
    assert.equal((await call("get_status", {})).tasks[0].status, "active", "verification must keep task active");
    const cards = await call("apply_operations", { ...doc, taskId: "page-edit", baseRevision: page.revision, requestId: "page-cards", label: "Page content", operations: [
      { op: "create", element: { id: "page-card-1", type: "rectangle", frameId: "page", x: 60, y: 280, width: 100, height: 40 } },
      { op: "create", element: { id: "page-card-2", type: "rectangle", frameId: "page", x: 60, y: 340, width: 100, height: 40 } },
    ] });
    const finished = await call("finish_task", { ...doc, taskId: "page-edit", status: "completed" });
    assert(finished.presentationPending, "completion should wait for page elements");
    await delay(100);
    assert.equal(await run("document.querySelectorAll('.ai-construction-overlay--active').length"), 1);
    await delay(1050);
    assert.equal(await run("document.querySelectorAll('.ai-construction-overlay').length"), 0);
    assert.equal((await call("get_status", {})).revision, cards.revision, "task/display lifecycle must not edit the document");
    await call("set_view_state", { ...doc, scrollX: 100, scrollY: 80, zoom: 1, selection: [] });
    await delay(100);
    const titleSelector = '[id$="-frame-name-page"]';
    const checkWheel = async selector => {
      for (const [deltaY, modifiers, expected] of [[5, ["control"], { zoom: 1.05 }], [-5, ["control"], { zoom: 0.95 }], [20, [], { scrollY: 100 }]]) {
        await call("set_view_state", { ...doc, scrollX: 100, scrollY: 80, zoom: 1 });
        await delay(50);
        const point = await run(`(() => { const box = document.querySelector('${selector}').getBoundingClientRect(); return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }; })()`);
        window.webContents.sendInputEvent({ type: "mouseMove", ...point });
        window.webContents.sendInputEvent({ type: "mouseWheel", ...point, deltaX: 0, deltaY, modifiers });
        await delay(100);
        const view = await call("get_view_state", doc);
        for (const [key, value] of Object.entries(expected)) assert.equal(view[key], value, `${selector}: wheel changes ${key} once`);
      }
      await call("set_view_state", { ...doc, scrollX: 100, scrollY: 80, zoom: 1 });
      await delay(50);
    };
    await checkWheel('canvas.easydraw__canvas.interactive');
    await checkWheel(titleSelector);
    const titleBounds = await run(`(() => { const title = document.querySelector('${titleSelector}'); const box = title.getBoundingClientRect(); return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), fontSize: getComputedStyle(title).fontSize, clickable: title.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) }; })()`);
    assert.equal(titleBounds.fontSize, "12px");
    assert(titleBounds.clickable, "page name must receive pointer events above the interactive canvas");
    for (const clickCount of [1, 2]) {
      window.webContents.sendInputEvent({ type: "mouseDown", x: titleBounds.x, y: titleBounds.y, button: "left", clickCount });
      window.webContents.sendInputEvent({ type: "mouseUp", x: titleBounds.x, y: titleBounds.y, button: "left", clickCount });
    }
    await delay(100);
    assert(await run(`document.activeElement === document.querySelector('${titleSelector} input')`), "double-click focuses the name input");
    assert(await run(`!document.querySelector('.selection-toolbar')`), "selection toolbar must not cover the name editor");
    await checkWheel(`${titleSelector} input`);
    assert.equal(await run(`getComputedStyle(document.querySelector('${titleSelector} input')).fontSize`), "12px");
    const editingBounds = await run(`(() => { const input = document.querySelector('${titleSelector} input'); const box = input.getBoundingClientRect(), style = getComputedStyle(input); const canvas = document.querySelector('.easydraw').getBoundingClientRect(); return { width: box.width, bottom: box.bottom, left: box.left, border: style.borderTopStyle, borderWidth: style.borderTopWidth, right: box.right, canvasRight: canvas.right }; })()`);
    assert.equal(editingBounds.border, "solid");
    assert.equal(editingBounds.borderWidth, "1px");
    assert.equal(editingBounds.width, 160, "long names start at the full editing width");
    assert(editingBounds.bottom <= 340 - 3, "name input stays above the page instead of overlapping it");
    assert.equal(editingBounds.left, 140, "input border aligns with the page left edge");
    assert(editingBounds.right <= editingBounds.canvasRight);
    await fs.mkdir(path.resolve("qa"), { recursive: true });
    await fs.writeFile(path.resolve("qa/page-name-editing.png"), (await window.webContents.capturePage()).toPNG());
    await call("set_view_state", { ...doc, scrollX: editingBounds.canvasRight - 140, scrollY: 80, zoom: 1, selection: [] });
    await delay(100);
    assert(await run(`(() => { const input = document.querySelector('${titleSelector} input').getBoundingClientRect(); return input.width < 160 && input.right <= document.querySelector('.easydraw').getBoundingClientRect().right; })()`), "editor stays within the canvas near the right edge");
    await call("set_view_state", { ...doc, scrollX: 100, scrollY: 80, zoom: 1, selection: [] });
    await delay(100);
    await run(`(() => { const input = document.querySelector('${titleSelector} input'); input.setSelectionRange(input.value.length, input.value.length); })()`);
    await window.webContents.insertText("新增文字");
    assert.equal(await run(`document.querySelector('${titleSelector} input').getBoundingClientRect().width`), editingBounds.width, "typing does not resize the editor");
    for (const text of ["哈", "哈", "W", "活动", "😀", "哈"]) {
      await window.webContents.insertText(text);
      await delay(50);
      assert(await run(`(() => { const input = document.querySelector('${titleSelector} input'); return input.selectionEnd === input.value.length && input.scrollLeft >= input.scrollWidth - input.clientWidth - 1; })()`), "typing keeps the end of a long name visible");
    }
    window.webContents.debugger.attach("1.3");
    try {
      const nameBeforeComposition = await run(`document.querySelector('${titleSelector} input').value`);
      await window.webContents.debugger.sendCommand("Input.imeSetComposition", { text: "输入法", selectionStart: 3, selectionEnd: 3, replacementStart: nameBeforeComposition.length, replacementEnd: nameBeforeComposition.length });
      await window.webContents.debugger.sendCommand("Input.insertText", { text: "输入法" });
      await delay(100);
      assert(await run(`(() => { const input = document.querySelector('${titleSelector} input'); return input.value === ${JSON.stringify(nameBeforeComposition + "输入法")} && input.selectionEnd === input.value.length && input.scrollLeft >= input.scrollWidth - input.clientWidth - 1; })()`), "IME commit keeps the long name, final character and caret in view");
    } finally { window.webContents.debugger.detach(); }
    await run(`(() => { const input = document.querySelector('${titleSelector} input'); input.style.caretAnimation = 'manual'; })()`);
    await delay(150);
    await fs.writeFile(path.resolve("qa/page-name-caret.png"), (await window.webContents.capturePage()).toPNG());
    await run(`(() => { const input = document.querySelector('${titleSelector} input'); input.setSelectionRange(3, 3); input.scrollLeft = 0; })()`);
    await window.webContents.insertText("中");
    await delay(50);
    assert(await run(`(() => { const input = document.querySelector('${titleSelector} input'); return input.selectionEnd === 4 && input.scrollLeft === 0; })()`), "editing in the middle does not jump to the end");
    await run(`document.querySelector('${titleSelector} input').select()`);
    await window.webContents.insertText("订单列表");
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await delay(400);
    assert.equal(await run(`document.querySelector('${titleSelector}').textContent`), "订单列表");
    const readPage = async () => (await call("query_elements", { ...doc, scope: { kind: "document" }, ids: ["page"] })).elements[0];
    assert.equal((await readPage()).name, "订单列表", "renamed page must persist to the document");
    await run(`document.querySelector('[aria-label="撤销"]').click()`);
    await delay(100);
    assert.notEqual((await readPage()).name, "订单列表");
    await run(`document.querySelector('[aria-label="重做"]').click()`);
    await delay(100);
    assert.equal((await readPage()).name, "订单列表");
    await fs.writeFile(path.resolve("qa/page-name-renamed.png"), (await window.webContents.capturePage()).toPNG());
    const viewport = await run(`(() => { const box = document.querySelector('.canvas-wrap .easydraw').getBoundingClientRect(); return { width: box.width, height: box.height }; })()`);
    for (const [selector, initialZoom, targetZoom] of [[".zoom-value", 0.5, 1], [".zoom-value", 2, 1], [".zoom-control button:first-child", 1, 0.9], [".zoom-control button:last-child", 1, 1.1]]) {
      await call("set_view_state", { ...doc, scrollX: -600, scrollY: -400, zoom: initialZoom });
      await delay(100);
      const before = await call("get_view_state", doc);
      await run(`document.querySelector('${selector}').click()`);
      await delay(100);
      const after = await call("get_view_state", doc);
      assert.equal(after.zoom, targetZoom);
      assert(Math.abs((viewport.width / 2 / before.zoom - before.scrollX) - (viewport.width / 2 / after.zoom - after.scrollX)) < 0.001, "zoom controls keep the horizontal viewport center fixed");
      assert(Math.abs((viewport.height / 2 / before.zoom - before.scrollY) - (viewport.height / 2 / after.zoom - after.scrollY)) < 0.001, "zoom controls keep the vertical viewport center fixed");
    }
    console.log("ZOOM_CENTER_SMOKE_OK: restore 100%, zoom in and zoom out keep the viewport center fixed");
    console.log("PAGE_NAME_SMOKE_OK: double-click, stable editor bounds, long-name caret, IME commit, middle editing, persisted rename, undo and redo");
    console.log("EDIT_TASK_SMOKE_OK: required task, new page scope, scan, page radius, verification, queue completion, fade, unchanged revision");
    console.log("ELEMENT_REVEAL_SMOKE_OK: per-element timing, grouped elements, FIFO batches, immediate commit, unchanged revision, user interaction");
  } catch (error) {
    console.error(error); process.exitCode = 1;
  } finally {
    clearTimeout(timeout); socket?.close(); app.exit(process.exitCode || 0);
  }
});
