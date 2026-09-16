import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parsePdf, sanitizePdfText } from './pdf-parser.js';

const maintenanceFixture = fileURLToPath(
  new URL('../fixtures/chinese-maintenance-guide.pdf', import.meta.url),
);
const catalogFixture = fileURLToPath(
  new URL('../fixtures/chinese-parts-catalog.pdf', import.meta.url),
);

test('sanitizePdfText normalizes line endings and blank lines', () => {
  assert.equal(sanitizePdfText('  第一行  \r\n\r\n\r\n第二行\u0000  '), '第一行\n\n第二行');
});

test('parsePdf extracts clean Chinese maintenance text', async () => {
  const input = await readFile(maintenanceFixture);
  const parsed = await parsePdf(new Uint8Array(input));

  assert.equal(parsed.totalPages, 1);
  assert.equal(parsed.pages.length, 1);
  assert.match(parsed.text, /冷车启动困难/);
  assert.match(parsed.text, /蓄电池静态电压/);
  assert.equal(parsed.text.includes('\uFFFD'), false);
  assert.equal(parsed.text.includes('\u0000'), false);
});

test('parsePdf preserves Chinese catalog entries and prices', async () => {
  const input = await readFile(catalogFixture);
  const parsed = await parsePdf(new Uint8Array(input));

  assert.equal(parsed.totalPages, 1);
  assert.match(parsed.text, /碳纤维尾段排气/);
  assert.match(parsed.text, /川崎 Ninja 400 2018-2023/);
  assert.match(parsed.text, /5980 元/);
  assert.equal(parsed.text.includes('\uFFFD'), false);
  assert.equal(parsed.text.includes('\u0000'), false);
});
