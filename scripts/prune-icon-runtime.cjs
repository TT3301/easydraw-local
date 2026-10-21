// onnxruntime-node includes several OS binaries. Ship only this build's target.
const fs = require('node:fs/promises');
const path = require('node:path');
const { Arch } = require('builder-util');
module.exports = async context => {
  const platform = context.electronPlatformName, arch = Arch[context.arch];
  const resources = platform === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  const root = path.join(resources, 'app.asar.unpacked', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6');
  await fs.access(path.join(root, platform, arch, 'onnxruntime_binding.node'));
  if (platform === 'darwin') {
    const directory = path.join(root, platform, arch);
    const linkedLibrary = await fs.readFile(path.join(directory, 'libonnxruntime.1.dylib'));
    for (const file of await fs.readdir(directory)) {
      if (/^libonnxruntime\.\d+\.\d+\.\d+\.dylib$/.test(file) && (await fs.readFile(path.join(directory, file))).equals(linkedLibrary))
        await fs.rm(path.join(directory, file));
    }
  }
  for (const os of await fs.readdir(root)) {
    if (os !== platform) await fs.rm(path.join(root, os), { recursive: true, force: true });
    else for (const cpu of await fs.readdir(path.join(root, os))) {
      if (cpu !== arch) await fs.rm(path.join(root, os, cpu), { recursive: true, force: true });
    }
  }
};
