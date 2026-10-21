import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInitialDocument } from "../src/core/document-fixtures";
import { serializeProjectDocument } from "@easydraw/document-model";
import electron from "electron";
const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");
const directory = await mkdtemp(join(tmpdir(), "easydraw-open-test-"));
let child: ReturnType<typeof spawn> | undefined;
try {
  const cold = join(directory, "启动 打开 A.edw"), warm = join(directory, "运行中打开 B.EDW"), invalid = join(directory, "损坏项目.edw");
  for (const [file, name] of [[cold, "系统文件 A"], [warm, "系统文件 B"]]) {
    const zip = new AdmZip();
    zip.addFile("project.json", Buffer.from(JSON.stringify(serializeProjectDocument(createInitialDocument(name)))));
    await writeFile(file, zip.toBuffer());
  }
  await writeFile(invalid, "invalid project");
  child = spawn(electron as unknown as string, ["tests/desktop/project-open-smoke.cjs", cold], {
    cwd: resolve("."), stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, EASYDRAW_OPEN_TEST_WARM: warm, EASYDRAW_OPEN_TEST_INVALID: invalid },
  });
  let output = "";
  child.stdout!.on("data", chunk => { output += chunk; process.stdout.write(chunk); });
  const timeout = setTimeout(() => child?.kill(), 45000);
  try {
    const code = await new Promise<number | null>((done, reject) => { child!.once("close", done); child!.once("error", reject); });
    if (code !== 0 || !output.includes("PROJECT_OPEN_SMOKE_OK")) throw new Error("System project opening smoke failed");
  } finally { clearTimeout(timeout); }
} finally {
  if (child?.pid) await rm(join(tmpdir(), `easydraw-smoke-${child.pid}`), { recursive: true, force: true });
  await rm(directory, { recursive: true, force: true });
}
