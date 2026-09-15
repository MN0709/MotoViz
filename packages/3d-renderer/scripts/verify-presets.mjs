import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../assets/presets/', import.meta.url);
const entries = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
assert(entries.length >= 5 && entries.length <= 8);
assert.equal(new Set(entries.map((item) => item.modelId)).size, entries.length);
for (const item of entries) {
  const bytes = await readFile(new URL(item.file, root));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length');
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'JSON chunk');
  const length = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
  assert(document.meshes.length > 0);
  assert(document.accessors.some((accessor) => accessor.type === 'VEC3' && accessor.count > 0));
  assert(
    document.buffers.every((buffer) => !buffer.uri),
    'Assets must be self-contained',
  );
  assert.equal(item.sizeBytes, bytes.length);
  assert.equal(item.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert(
    Object.values(item.dimensionsMeters).every(
      (value) => Number.isFinite(value) && value > 0 && value < 2,
    ),
  );
  assert(['exhaust', 'windshield', 'saddlebag'].includes(item.partType));
  console.log(`PASS ${item.modelId}: ${bytes.length} bytes`);
}
console.log('Structural checks only; browser and visual checks remain required.');
