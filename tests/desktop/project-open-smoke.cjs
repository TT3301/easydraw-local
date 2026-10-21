const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow } = require("electron");
const cold = process.argv[2];
const warm = process.env.EASYDRAW_OPEN_TEST_WARM;
const invalid = process.env.EASYDRAW_OPEN_TEST_INVALID;
process.env.EASYDRAW_LIVE_SMOKE = "1";
process.env.EASYDRAW_DEVELOPMENT_URL = pathToFileURL(path.resolve("dist/index.html")).href;
// This test opens files itself; skip the generic harness's automatic new project.
require("./smoke.cjs").runDesktopSmoke = async () => {};
require("../../electron/main.cjs");
// macOS can deliver open-file before app readiness, alongside startup arguments.
app.emit("open-file", { preventDefault() {} }, cold);
const delay = ms => new Promise(done => setTimeout(done, ms));
app.whenReady().then(async () => {
  try {
    let window;
    const run = source => window.webContents.executeJavaScript(source);
    const waitForFile = async file => {
      for (let i = 0; i < 160; i++) {
        window = BrowserWindow.getAllWindows()[0];
        if (window && !window.webContents.isLoadingMainFrame() && await run(`document.querySelector('.project-file')?.textContent.trim() === ${JSON.stringify(path.basename(file))}`)) return;
        await delay(50);
      }
      throw new Error("Requested project did not reach the workbench");
    };
    await waitForFile(cold);
    assert(!await run(`Boolean(document.querySelector('.start-screen'))`), "startup file bypasses the home screen");
    app.emit("open-file", { preventDefault() {} }, warm);
    await waitForFile(warm);

    const reloaded = new Promise(done => window.webContents.once("did-finish-load", done));
    window.webContents.once("did-start-loading", () => app.emit("open-file", { preventDefault() {} }, cold));
    window.webContents.reload();
    await reloaded;
    await waitForFile(cold);

    app.emit("second-instance", {}, ["EasyDraw", warm], path.dirname(warm));
    await waitForFile(warm);
    app.emit("open-file", { preventDefault() {} }, invalid);
    let failed = false;
    for (let i = 0; i < 100; i++) {
      failed = await run(`document.querySelector('.canvas-notice')?.textContent.includes('打开项目失败')`);
      if (failed) break;
      await delay(50);
    }
    assert(failed, "invalid system files show the existing open error");
    assert.equal(await run(`document.querySelector('.project-file').textContent.trim()`), path.basename(warm), "invalid input preserves the current project");

    if (process.platform === "darwin") {
      const closed = new Promise(done => window.once("closed", done));
      window.close();
      await closed;
      app.emit("open-file", { preventDefault() {} }, cold);
      await waitForFile(cold);
    }
    console.log("PROJECT_OPEN_SMOKE_OK: startup argv and early open-file, running app, renderer reload, second instance, invalid file and window recreation");
    app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
