// Set on the main thread before native ORT initializes in any worker.
process.env.ORT_DISABLE_TELEMETRY = '1';
const path = require('node:path');
const { Worker } = require('node:worker_threads');
exports.createIconSelectionService = (root, getEntries) => {
  let worker, nextId = 0, starting;
  const pending = new Map();
  const stop = () => {
    const previous = worker; worker = undefined;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Local icon selection unavailable')); }
    pending.clear();
    if (previous) void previous.terminate();
  };
  const start = async () => {
    if (worker) return worker;
    starting ??= getEntries().then(entries => {
      worker = new Worker(path.join(__dirname, 'icon-selection-worker.cjs'), { workerData: { root, entries } });
      worker.on('message', ({ id, result, error }) => {
        const item = pending.get(id);
        if (!item) return;
        pending.delete(id); clearTimeout(item.timer);
        if (error) item.reject(new Error(error)); else item.resolve(result);
        if (!pending.size) worker?.unref();
      });
      const instance = worker;
      worker.on('error', () => { if (worker === instance) stop(); });
      worker.on('exit', () => { if (worker === instance) stop(); });
      worker.unref(); return worker;
    }).finally(() => { starting = undefined; });
    return starting;
  };
  return { close: stop, async resolve(descriptions) {
    if (!Array.isArray(descriptions) || descriptions.length < 1 || descriptions.length > 500 || descriptions.some(text => typeof text !== 'string' || !text.trim() || text.length > 200))
      throw new Error('Expected 1–500 short icon descriptions');
    const active = await start(); active.ref();
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(stop, 30000);
      pending.set(id, { resolve, reject, timer });
      active.postMessage({ id, descriptions: descriptions.map(text => text.trim()) });
    });
  } };
};
