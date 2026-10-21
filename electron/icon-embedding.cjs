const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
exports.indexRecords = entries => entries.map(icon => ({
  id: icon.id, name: icon.name, assetRef: `builtin:icon:${icon.id}`,
  text: `${icon.name} icon. Related words: ${(icon.tags ?? []).filter(tag => /^[\x00-\x7f]*$/.test(tag) && /[a-z]/i.test(tag)).slice(0, 8).join(', ')}`,
}));
exports.catalogHash = records => crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
exports.createEmbedder = async root => {
  const { Tokenizer } = await import('@huggingface/tokenizers');
  process.env.ORT_DISABLE_TELEMETRY = '1';
  const ort = require('onnxruntime-node');
  const tokenizer = new Tokenizer(
    JSON.parse(await fs.readFile(path.join(root, 'model/tokenizer.json'), 'utf8')),
    JSON.parse(await fs.readFile(path.join(root, 'model/tokenizer_config.json'), 'utf8')),
  );
  const session = await ort.InferenceSession.create(path.join(root, 'model/onnx/model_quantized.onnx'), {
    executionProviders: ['cpu'], intraOpNumThreads: 4, interOpNumThreads: 1,
  });
  return {
    close: () => session.release(),
    async embed(texts) {
      // Keep CLS and SEP when truncating. Batch padding is masked during pooling.
      const encoded = texts.map(text => {
        const ids = tokenizer.encode(text).ids;
        return ids.length > 128 ? [...ids.slice(0, 127), ids[ids.length - 1]] : ids;
      });
      const length = Math.max(...encoded.map(ids => ids.length));
      const size = texts.length * length;
      const ids = new BigInt64Array(size), mask = new BigInt64Array(size), types = new BigInt64Array(size);
      encoded.forEach((tokens, row) => tokens.forEach((token, col) => {
        ids[row * length + col] = BigInt(token); mask[row * length + col] = 1n;
      }));
      const feeds = { input_ids: new ort.Tensor('int64', ids, [texts.length, length]),
        attention_mask: new ort.Tensor('int64', mask, [texts.length, length]),
        token_type_ids: new ort.Tensor('int64', types, [texts.length, length]) };
      const outputs = await session.run(Object.fromEntries(session.inputNames.map(name => [name, feeds[name]])));
      const output = outputs.last_hidden_state ?? outputs[session.outputNames[0]];
      const dimension = output.dims[2];
      const vectors = encoded.map((tokens, row) => {
        const vector = new Float32Array(dimension);
        for (let col = 0; col < tokens.length; col++) for (let d = 0; d < dimension; d++)
          vector[d] += output.data[(row * length + col) * dimension + d] / tokens.length;
        const norm = Math.hypot(...vector);
        if (!Number.isFinite(norm) || norm === 0) throw new Error('Invalid icon embedding');
        for (let d = 0; d < dimension; d++) vector[d] /= norm;
        return vector;
      });
      for (const tensor of Object.values(outputs)) tensor.dispose();
      for (const tensor of Object.values(feeds)) tensor.dispose();
      return vectors;
    },
  };
};
exports.createIconResolver = async (root, entries) => {
  const records = exports.indexRecords(entries);
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'index.json'), 'utf8'));
  const buffer = await fs.readFile(path.join(root, 'vectors.f32'));
  if (metadata.catalogHash !== exports.catalogHash(records) || metadata.count !== records.length || metadata.dimension !== 384 || buffer.length !== records.length * 384 * 4)
    throw new Error('Icon index is outdated; run npm run icons:index');
  const index = new Float32Array(records.length * 384);
  for (let i = 0; i < index.length; i++) index[i] = buffer.readFloatLE(i * 4);
  const embedder = await exports.createEmbedder(root);
  const cache = new Map();
  return { close: embedder.close, async resolve(descriptions) {
    const missing = [...new Set(descriptions.filter(text => !cache.has(text)))];
    // Bound inference memory even for the largest canvas transaction.
    for (let start = 0; start < missing.length; start += 32) {
      const batch = missing.slice(start, start + 32), vectors = await embedder.embed(batch);
      vectors.forEach((vector, query) => {
        let winner = 0, best = -Infinity;
        for (let row = 0; row < records.length; row++) {
          let score = 0;
          for (let d = 0; d < 384; d++) score += vector[d] * index[row * 384 + d];
          if (score > best) { best = score; winner = row; }
        }
        const { text: _text, ...icon } = records[winner];
        cache.set(batch[query], icon);
      });
    }
    const result = descriptions.map(description => ({ description, ...cache.get(description) }));
    while (cache.size > 512) cache.delete(cache.keys().next().value);
    return result;
  } };
};
