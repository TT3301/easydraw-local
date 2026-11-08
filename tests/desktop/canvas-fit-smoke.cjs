const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow } = require("electron");
const file = process.argv[2];
process.env.EASYDRAW_LIVE_SMOKE = "1";
process.env.EASYDRAW_DEVELOPMENT_URL = pathToFileURL(path.resolve("dist/index.html")).href;
// This test opens its file itself; skip the generic harness's automatic new project.
require("./smoke.cjs").runDesktopSmoke = async () => {};
require("../../electron/main.cjs");
app.emit("open-file", { preventDefault() {} }, file);
const delay = ms => new Promise(done => setTimeout(done, ms));
app.whenReady().then(async () => {
  try {
    let window;
    const run = source => window.webContents.executeJavaScript(source);
    for (let i = 0; i < 200; i++) {
      window = BrowserWindow.getAllWindows()[0];
      if (window && !window.webContents.isLoadingMainFrame() && await run(`document.querySelector('.project-file')?.textContent.trim() === ${JSON.stringify(path.basename(file))}`)) break;
      await delay(50);
    }
    await delay(800);
    const zoom = () => run(`parseInt(document.querySelector('.zoom-value').textContent)`);
    const scrolledAway = () => run(`!!document.querySelector('.scroll-back-to-content')`);
    // The engine's first initialization must not reset the fitted first canvas to 100%.
    const firstZoom = await zoom();
    assert(firstZoom < 100, `the first canvas is fitted when the project opens (zoom ${firstZoom}%)`);
    assert(!await scrolledAway(), "the first canvas shows its content");

    if (!await run(`!!document.querySelector('.left-panel')`)) await run(`document.querySelector('[aria-label="展开左侧边栏"]').click()`);
    await delay(300);
    // Record every zoom value painted after the switch; an intermediate 100% frame is a flash.
    await run(`window.fitTrace = []; (function tick() { const z = document.querySelector('.zoom-value')?.textContent; if (z && window.fitTrace[window.fitTrace.length - 1] !== z) window.fitTrace.push(z); window.fitFrame = requestAnimationFrame(tick); })()`);
    await run(`Array.from(document.querySelectorAll('.tree-name')).find(n => n.title === '远处画布').click()`);
    await delay(800);
    const trace = await run(`cancelAnimationFrame(window.fitFrame), window.fitTrace`);
    const secondZoom = await zoom();
    assert(secondZoom < 100 && secondZoom !== firstZoom, `the second canvas is fitted (zoom ${secondZoom}%)`);
    assert.deepEqual(trace.slice(1), [`${secondZoom}%`], `entering a canvas paints only its fitted zoom: ${JSON.stringify(trace)}`);
    assert(!await scrolledAway(), "the second canvas shows its content");

    await run(`Array.from(document.querySelectorAll('.tree-name'))[0].click()`);
    await delay(500);
    assert.equal(await zoom(), firstZoom, "returning to a canvas keeps its view");
    console.log(`CANVAS_FIT_SMOKE_OK: first canvas ${firstZoom}%, second canvas ${secondZoom}% without intermediate frames, view kept on return`);
    app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
