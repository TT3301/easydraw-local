import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { indexRecords, catalogHash, createEmbedder } = require('../electron/icon-embedding.cjs');
const root = path.resolve('assets/icon-embedding');
const { entries } = JSON.parse(await fs.readFile('remix-icons/manifest.json', 'utf8'));
const records = indexRecords(entries);
const embedder = await createEmbedder(root);
try {
  const buffer = Buffer.alloc(records.length * 384 * 4);
  for (let start = 0; start < records.length; start += 32) {
    const vectors = await embedder.embed(records.slice(start, start + 32).map(icon => icon.text));
    vectors.forEach((vector, row) => vector.forEach((value, d) => buffer.writeFloatLE(value, ((start + row) * 384 + d) * 4)));
  }
  await fs.writeFile(path.join(root, 'vectors.f32'), buffer);
  await fs.writeFile(path.join(root, 'index.json'), JSON.stringify({
    model: 'Xenova/all-MiniLM-L6-v2', revision: '751bff37182d3f1213fa05d7196b954e230abad9',
    dimension: 384, count: records.length, catalogHash: catalogHash(records), pooling: 'masked-mean-l2',
  }, null, 2) + '\n');
  console.log(`Indexed ${records.length} icons (${buffer.length} bytes).`);
} finally { await embedder.close(); }
