const { spawn } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const electron = require("electron");

const child = spawn(electron, ["."], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  env: {
    ...process.env,
    EASYDRAW_SMOKE_TEST: "1",
    EASYDRAW_DEVELOPMENT_URL: pathToFileURL(path.resolve(__dirname, "../dist/index.html")).href,
  },
});
const timer = setTimeout(() => {
  console.error("Desktop smoke test timed out");
  child.kill();
  process.exitCode = 1;
}, 120000);
child.on("error", error => {
  clearTimeout(timer);
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", code => {
  clearTimeout(timer);
  process.exitCode = code ?? 1;
});
