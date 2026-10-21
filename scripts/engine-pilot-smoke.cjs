const { app, BrowserWindow } = require("electron");
const { resolve } = require("node:path");
const { writeFileSync } = require("node:fs");
const assert = require("node:assert/strict");

// This process never opens or changes the user's EasyDraw project directory.
app.setPath("userData", resolve(process.env.TMPDIR || "/tmp", "easydraw-engine-pilot-profile"));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1100, height: 820, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const errors = [];
  window.webContents.on("console-message", (details) => {
    if (details.level === "error") errors.push(details.message);
  });
  const run = (source) => window.webContents.executeJavaScript(source);
  async function settle() { await delay(160); }
  async function waitFor(source, description) {
    for (let i = 0; i < 100; i++) {
      if (await run(source)) return;
      await delay(50);
    }
    throw new Error(`Timed out: ${description}; browser errors: ${errors.join("; ")}`);
  }
  async function drag(x, y, dx, dy) {
    window.webContents.sendInputEvent({ type: "mouseMove", x, y });
    window.webContents.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
    for (let i = 1; i <= 5; i++) {
      window.webContents.sendInputEvent({ type: "mouseMove", x: x + dx * i / 5, y: y + dy * i / 5, button: "left" });
      await delay(20);
    }
    window.webContents.sendInputEvent({ type: "mouseUp", x: x + dx, y: y + dy, button: "left", clickCount: 1 });
    await settle();
  }
  try {
    await window.webContents.session.clearStorageData({ storages: ["localstorage"] });
    await window.loadFile(resolve("dist/engine-pilot/index.html"));
    await waitFor("!!window.pilotAPI?.getSceneElements().length", "initial render");
    await settle();
    await run('document.querySelector(".App-toolbar__shape-tools-trigger").click()');
    await settle();
    await run(`document.querySelector('[data-testid="toolbar-shape-menu-ellipse"]').click()`);
    await settle();
    assert.equal(await run("pilot.api.getAppState().activeTool.type"), "ellipse");
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await settle();
    assert.equal(await run("pilot.api.getAppState().activeTool.type"), "selection");
    const initial = await run("pilot.api.getSceneElements()");
    assert.equal(initial.length, 4, "page background must not create another document element");
    assert(initial.find((element) => element.id === "pilot-vector").vectorData);

    // View/selection updates leave the content version unchanged. External
    // replacements clean stale selections at the engine boundary.
    const sceneVersion = await run("pilot.api.getSceneVersion()");
    await run(`pilot.api.updateScene({appState: {selectedElementIds: {'pilot-rectangle': true, 'pilot-vector': true}}, captureUpdate: 'NEVER'})`);
    await settle();
    assert.equal(await run("pilot.api.getSceneVersion()"), sceneVersion);
    await run(`pilot.api.updateScene({appState: {scrollX: 10, zoom: {value: 1.1}}, captureUpdate: 'NEVER'})`);
    await settle();
    assert.equal(await run("pilot.api.getSceneVersion()"), sceneVersion);
    await run(`pilot.api.updateScene({elements: pilot.api.getSceneElements().filter(e => e.id !== 'pilot-vector'), captureUpdate: 'NEVER'})`);
    await settle();
    assert.deepEqual(await run("pilot.api.getAppState().selectedElementIds"), { 'pilot-rectangle': true });
    assert(await run("pilot.api.getSceneVersion()") > sceneVersion);
    await run(`pilot.api.updateScene({elements: ${JSON.stringify(initial)}, appState: {selectedElementIds: {}, scrollX: 0, zoom: {value: 1}}, captureUpdate: 'NEVER'})`);
    await settle();

    // A presentation mask must retain the complete native scene and exports.
    await run(`pilot.api.setHiddenElementIds(['pilot-page', 'pilot-rectangle', 'pilot-text', 'pilot-vector'])`);
    await settle();
    assert.deepEqual(await run("pilot.api.getSceneElements()"), initial);
    assert(!await run(`!!document.querySelector('[id$="-frame-name-pilot-page"]')`), "hidden frame labels must not appear early");
    assert((await run("pilot.exportSvg()")).includes("#dbeafe"), "export retains masked content");
    assert(!await run("pilot.api.history.canUndo()"), "display steps must not create history");

    // Bound text and its host are independently displayable in either order.
    await run(`(() => {
      window.presentationOriginal = pilot.api.getSceneElements();
      const shape = {...presentationOriginal.find(e => e.id === 'pilot-rectangle'), id: 'reveal-host', frameId: null,
        x: 160, y: 240, width: 180, height: 90, boundElements: [{id: 'reveal-text', type: 'text'}]};
      const text = {...presentationOriginal.find(e => e.id === 'pilot-text'), id: 'reveal-text', frameId: null,
        containerId: 'reveal-host', x: 180, y: 270, width: 130, height: 30,
        text: 'REVEAL', originalText: 'REVEAL', strokeColor: '#000000', fontSize: 24};
      pilot.api.updateScene({elements: [shape, text], captureUpdate: 'NEVER'});
      pilot.api.setHiddenElementIds(['reveal-text']);
      window.presentationPixels = () => {
        const c = document.querySelector('canvas.easydraw__canvas.static:not(.connector-layer)');
        const s = pilot.api.getAppState(), ratio = devicePixelRatio;
        const x = Math.round((180 + s.scrollX) * s.zoom.value * ratio);
        const y = Math.round((265 + s.scrollY) * s.zoom.value * ratio);
        const pixels = c.getContext('2d').getImageData(x,y,Math.round(130*s.zoom.value*ratio),Math.round(45*s.zoom.value*ratio)).data;
        let dark = 0; for (let i=0;i<pixels.length;i+=4) if (pixels[i]<80 && pixels[i+1]<80 && pixels[i+2]<80 && pixels[i+3]>0) dark++;
        return dark;
      };
    })()`);
    await settle();
    const presentationSnapshot = await run("pilot.api.getSceneElements()");
    assert.equal(await run("presentationPixels()"), 0, "host must not reveal bound text early");
    await run("pilot.api.setHiddenElementIds(['reveal-host'])"); await settle();
    assert(await run("presentationPixels() > 20"), "text must display while its host is still hidden");
    assert.deepEqual(await run("pilot.api.getSceneElements()"), presentationSnapshot, "mask must not rewrite opacity, bindings or geometry");
    await run("pilot.api.setHiddenElementIds([]); pilot.api.updateScene({elements: presentationOriginal, captureUpdate: 'NEVER'})");
    await settle();

    // Programmatic mutation uses the same native history as pointer gestures.
    await run('pilot.changeColor("pilot-vector", "#16a34a")');
    await settle();
    assert.equal(await run('pilot.api.getSceneElements().find(e => e.id === "pilot-vector").strokeColor'), "#16a34a");
    assert(await run("pilot.api.history.canUndo()"));
    await run("pilot.api.history.undo()");
    await settle();
    assert.equal(await run('pilot.api.getSceneElements().find(e => e.id === "pilot-vector").strokeColor'), "#dc2626");
    await run("pilot.api.history.redo()");
    await settle();
    assert.equal(await run('pilot.api.getSceneElements().find(e => e.id === "pilot-vector").strokeColor'), "#16a34a");

    // A real pointer drag must be committed to that same history.
    await drag(260, 280, 80, 40);
    const moved = await run('pilot.api.getSceneElements().find(e => e.id === "pilot-rectangle")');
    assert.equal(moved.x, 240);
    assert.equal(moved.y, 280);
    await run("pilot.api.history.undo()");
    await settle();
    assert.equal(await run('pilot.api.getSceneElements().find(e => e.id === "pilot-rectangle").x'), 160);
    await run("pilot.api.history.redo()");
    await settle();
    assert.equal(await run('pilot.api.getSceneElements().find(e => e.id === "pilot-rectangle").x'), 240);

    await drag(448, 300, 40, 20);
    const movedVector = await run('pilot.api.getSceneElements().find(e => e.id === "pilot-vector")');
    assert.equal(movedVector.x, 440, "native vector must support pointer hit testing and dragging");
    assert.equal(movedVector.frameId, "pilot-page");
    await run("pilot.api.history.undo()");
    await settle();
    assert.equal(await run('pilot.api.getSceneElements().find(e => e.id === "pilot-vector").x'), 400);

    window.webContents.sendInputEvent({ type: "mouseMove", x: 350, y: 175 });
    window.webContents.sendInputEvent({ type: "mouseDown", x: 350, y: 175, button: "left", clickCount: 1 });
    window.webContents.sendInputEvent({ type: "mouseUp", x: 350, y: 175, button: "left", clickCount: 1 });
    await settle();
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
    await waitFor('!!document.querySelector(".easydraw-wysiwyg")', "native text editor");
    assert.equal(await run("pilot.api.getAppState().editingTextElement?.id"), "pilot-text");
    await run('document.querySelector(".easydraw-wysiwyg").focus(); document.querySelector(".easydraw-wysiwyg").select()');
    await window.webContents.insertText("统一模型文字编辑");
    await settle();
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await settle();
    assert.equal(await run('pilot.api.getSceneElements().find(e => e.id === "pilot-text").text'), "统一模型文字编辑");

    const snapshot = await run("pilot.save()");
    await run("pilot.reload()");
    await settle();
    assert.deepEqual(await run("pilot.api.getSceneElements()"), JSON.parse(snapshot), "native save/reload must be lossless");
    const svg = await run("pilot.exportSvg()");
    assert(svg.includes('d="M12 2 L22 22 L2 22 Z"') && svg.includes('fill="#16a34a"'), "SVG must retain native vector geometry and color");
    assert(svg.includes('fill="#ffffff"'), "SVG must include native page background");
    const exportVector = (source, color) => run(`pilot.exportVector(${JSON.stringify(source)}, ${JSON.stringify(color)})`);
    const coloredSvg = await exportVector('<svg width="32" height="16"><path d="M0 0L32 16" stroke="currentColor"/></svg>', "#e03131");
    assert(coloredSvg.includes('d="M0 0L32 16"') && coloredSvg.includes('stroke="#e03131"'));
    const multicolor = await exportVector(`
      <svg viewBox="0 0 24 24">
        <defs>
          <linearGradient id="paint"><stop offset="0" stop-color="#f00"/></linearGradient>
        </defs>
        <path d="M0 0h8v8z" fill="#f00"/>
        <path d="M8 8h8v8z" fill="url(#paint)"/>
        <path d="M2 20h20" fill="none" stroke="#00f" stroke-width="2"/>
      </svg>
    `, "#7048e8");
    assert.equal((multicolor.match(/fill="#7048e8"/g) || []).length, 2);
    assert(!multicolor.includes("#f00") && !multicolor.includes("#00f") && !multicolor.includes("url(#paint)"));
    assert(multicolor.includes('fill="none" stroke="#7048e8"'));
    const iconfont = await exportVector('<svg t="1786345428670" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1158" width="200" height="200"><path d="M155.9552 623.4112H861.184v237.4656H155.9552z" fill="#C4F000" p-id="1159"></path><path d="M514.816 109.6192L115.0464 341.504v574.1056h799.5392V341.504z m317.8496 724.0704H196.9664V388.7104l317.8496-184.32 317.8496 184.32z" fill="#333333" p-id="1160"></path><path d="M473.856 515.7888h81.92v191.4368h-81.92z" fill="#333333" p-id="1161"></path></svg>', "#1971c2");
    assert.equal((iconfont.match(/fill="#1971c2"/g) || []).length, 3);
    assert(!iconfont.includes("#C4F000") && !iconfont.includes("#333333"));

    const exported = await run("pilot.exportPage()");
    assert(exported.size > 1000 && exported.type === "image/png");
    assert.equal(exported.width, 1280); assert.equal(exported.height, 960, "PNG clips to the frame at 2x despite outside content");
    writeFileSync(resolve(process.env.TMPDIR || "/tmp", "easydraw-engine-pilot.png"), (await window.webContents.capturePage()).toPNG());

    await run("pilot.reload(true)");
    await settle();
    assert(await run("pilot.api.getAppState().viewModeEnabled"));
    await drag(300, 310, 80, 40);
    assert.deepEqual(await run("pilot.api.getSceneElements()"), JSON.parse(snapshot), "viewer pointer input must not edit the document");
    assert.deepEqual(errors, [], "browser must not log runtime errors");
    console.log(JSON.stringify({ passed: true, elements: initial.length, nativeSaveReload: true,
      sharedHistory: true, pointerDrag: true, readonlyViewer: true, export: exported }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    if (errors.length) console.error(errors);
    app.exit(1);
  }
});
