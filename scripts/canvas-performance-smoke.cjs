const { app, BrowserWindow } = require("electron");
const { resolve, join } = require("node:path");
const { tmpdir } = require("node:os");
const { rm } = require("node:fs/promises");
const assert = require("node:assert/strict");

const profile = join(tmpdir(), `easydraw-canvas-performance-${process.pid}`);
app.setPath("userData", profile);
app.on("window-all-closed", () => {});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = setTimeout(() => { console.error("Canvas performance smoke timed out"); app.exit(1); }, 45_000);

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1100, height: 820, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const run = source => window.webContents.executeJavaScript(source);
  try {
    await window.loadURL("about:blank");
    // Count host renders in the isolated test process, without instrumenting production code.
    window.webContents.debugger.attach("1.3");
    await window.webContents.debugger.sendCommand("Page.enable");
    await window.webContents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.hostRenders = 0;
      window.findHost = fiber => {
        if (!fiber) return null;
        if (fiber.tag === 0) {
          for (let hook = fiber.memoizedState; hook; hook = hook.next) {
            if (hook.memoizedState?.getSceneVersion && hook.memoizedState?.getAppState) return fiber;
          }
        }
        return findHost(fiber.child) || findHost(fiber.sibling);
      };
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true, inject: () => 1,
        onCommitFiberRoot: (_id, root) => {
          window.testRoot = root;
          const host = findHost(root.current);
          if (host && host.memoizedState !== window.lastHostState) {
            window.hostRenders++;
            window.lastHostState = host.memoizedState;
          }
        },
        onCommitFiberUnmount: () => {},
      };
      window.getTestApi = () => {
        for (let hook = findHost(testRoot?.current)?.memoizedState; hook; hook = hook.next) {
          const value = hook.memoizedState;
          if (value?.getSceneVersion && value?.getAppState) return value;
        }
      };
      window.getTestCanvasSession = () => {
        for (let hook = findHost(testRoot?.current)?.memoizedState; hook; hook = hook.next) {
          const value = hook.memoizedState;
          if (value?.observe && value?.flush && value?.controller) return value;
        }
      };
    ` });
    await window.loadFile(resolve("dist/index.html"));
    console.log("Canvas performance smoke: workbench loaded");
    for (let i = 0; i < 100 && !await run("!!window.getTestApi?.()"); i++) await delay(50);
    assert(await run("!!getTestApi()"), "workbench API unavailable");
    await delay(600);
    await run("window.api = getTestApi(); void 0");
    // Warm the callback once before counting stable view-only updates.
    await run("api.updateScene({appState:{scrollX:api.getAppState().scrollX+1},captureUpdate:'NEVER'})");
    await delay(300);
    const version = await run("api.getSceneVersion()");
    const renders = await run("hostRenders");
    for (let i = 0; i < 30; i++) {
      await run(`api.updateScene({appState:{scrollX:api.getAppState().scrollX+1,zoom:{value:1+${i}/100}},captureUpdate:'NEVER'})`);
      await delay(30);
    }
    assert.equal(await run("api.getSceneVersion()"), version, "view movement must not change content version");
    assert.equal(await run("hostRenders"), renders, "view changes must not render the host menus/sidebar");
    assert.equal(await run("document.querySelector('.zoom-value').textContent"), "129%", "zoom label must update independently");

    // Native external updates must clear only stale selected IDs.
    await run(`(() => {
      const source = api.getSceneElements()[0];
      window.originalElements = api.getSceneElements();
      const a = {...source,type:'rectangle',id:'perf-a',frameId:null,groupIds:[],boundElements:null,index:null,x:100,y:100,width:100,height:60};
      const b = {...a,id:'perf-b',x:250};
      api.updateScene({elements:[a,b],appState:{selectedElementIds:{'perf-a':true,'perf-b':true},scrollX:0,scrollY:0,zoom:{value:1}},captureUpdate:'NEVER'});
    })()`);
    await delay(400);
    await run("api.updateScene({elements:api.getSceneElements().filter(e=>e.id!=='perf-b'),captureUpdate:'NEVER'})");
    await delay(400);
    assert.deepEqual(await run("api.getAppState().selectedElementIds"), { "perf-a": true });

    // A real pointer gesture keeps storage quiet until release and preserves undo.
    const point = await run(`(() => { const s=api.getAppState(),e=api.getSceneElements().find(e=>e.id==='perf-a');
      return {x:Math.round((e.x+e.width/2+s.scrollX)*s.zoom.value+s.offsetLeft),
        y:Math.round((e.y+e.height/2+s.scrollY)*s.zoom.value+s.offsetTop),startX:e.x}; })()`);
    window.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y});
    window.webContents.sendInputEvent({type:'mouseDown',x:point.x,y:point.y,button:'left',clickCount:1});
    for (let i = 1; i <= 30; i++) {
      window.webContents.sendInputEvent({type:'mouseMove',x:point.x+i*2,y:point.y,button:'left'});
      await delay(100);
    }
    window.webContents.sendInputEvent({type:'mouseUp',x:point.x+60,y:point.y,button:'left',clickCount:1});
    await delay(400);
    const movedX = await run("api.getSceneElements().find(e=>e.id==='perf-a').x");
    assert(movedX > point.startX, "pointer drag must move the element");
    await run("api.history.undo()");
    await delay(250);
    assert.equal(await run("api.getSceneElements().find(e=>e.id==='perf-a').x"), point.startX, "release must commit one undoable edit");
    await run("api.history.redo()");
    await delay(250);
    assert.equal(await run("api.getSceneElements().find(e=>e.id==='perf-a').x"), movedX);

    // Within one opened project, leaving a canvas (even before the idle timer) keeps its view;
    // the first visit of a canvas fits its content at most at 100%.
    await run(`(() => {
      window.canvasSession = getTestCanvasSession();
      const controller = canvasSession.controller, doc = controller.getSnapshot().document;
      window.oldCanvasId = doc.activeCanvasId;
      window.nextCanvasId = controller.manageTree({op:'create',type:'canvas',parentId:null});
    })()`);
    await delay(250);
    await run(`(() => {
      api.updateScene({appState:{scrollX:123,scrollY:45,zoom:{value:1.2}},captureUpdate:'NEVER'});
    })()`);
    // Let React deliver the view notification, but switch before its 200ms idle timer.
    await delay(40);
    await run("canvasSession.controller.switchCanvas(nextCanvasId)");
    await delay(300);
    assert(await run("api.getAppState().zoom.value") <= 1, "a first visit never zooms beyond 100%");
    await run("canvasSession.controller.switchCanvas(oldCanvasId)");
    await delay(300);
    assert.equal(await run("api.getAppState().scrollX"), 123);
    assert.equal(await run("api.getAppState().zoom.value"), 1.2);
    assert.equal(await run("Object.keys(localStorage).filter(k => k.startsWith('easydraw:view:')).length"), 0, "views are not persisted across project opens");
    console.log("CANVAS_PERFORMANCE_SMOKE_OK: view-only content version, zero host renders during pan/zoom, external selection cleanup, three-second drag, undo/redo, first-visit fit and in-session canvas view restoration");
  } catch (error) {
    console.error(error); process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    window.destroy();
    try {
      await rm(profile, {recursive:true,force:true,maxRetries:5,retryDelay:100});
    } finally {
      app.exit(process.exitCode || 0);
    }
  }
});
