const path = require("node:path");

exports.registerProjectOpen = ({ app, ipcMain, getWindow, createWindow, argv = process.argv }) => {
  const pending = [];
  let started = false;
  let rendererReady = false;

  const showWindow = () => {
    if (!started) return;
    if (!getWindow()) createWindow();
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };
  const flush = () => {
    const window = getWindow();
    if (!rendererReady || !window || window.isDestroyed()) return;
    while (pending.length) window.webContents.send("easydraw:project:open-file", pending.shift());
  };
  const request = (file, cwd = process.cwd()) => {
    if (typeof file !== "string" || file.startsWith("-") || !/\.edw$/i.test(file)) return;
    const projectPath = path.resolve(cwd, file);
    if (!pending.includes(projectPath)) pending.push(projectPath);
    showWindow();
    flush();
  };

  app.on("open-file", (event, file) => {
    event.preventDefault();
    request(file);
  });
  app.on("second-instance", (_event, args, cwd) => {
    for (const file of args) request(file, cwd);
    showWindow();
  });
  ipcMain.on("easydraw:project:renderer-ready", event => {
    if (event.sender !== getWindow()?.webContents) return;
    rendererReady = true;
    flush();
  });
  for (const file of argv) request(file);

  return {
    start() { started = true; if (pending.length) showWindow(); },
    reset() { rendererReady = false; },
  };
};
