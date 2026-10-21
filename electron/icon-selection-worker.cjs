const { parentPort, workerData } = require('node:worker_threads');
const { createIconResolver } = require('./icon-embedding.cjs');
let resolver;
let queue = Promise.resolve();
parentPort.on('message', ({ id, descriptions }) => {
  queue = queue.then(async () => {
    try {
      resolver ??= await createIconResolver(workerData.root, workerData.entries);
      parentPort.postMessage({ id, result: await resolver.resolve(descriptions) });
    } catch {
      // Keep internal paths and native runtime diagnostics out of bridge errors.
      parentPort.postMessage({ id, error: 'Local icon selection failed. Check the bundled model and icon index.' });
    }
  });
});
