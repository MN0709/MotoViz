import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import type { Part } from '@motorcycle-ai/shared';
import { loadPartsFromCsv } from './parts-loader.js';
import { searchParts } from './parts-search.js';

const productionCsv = fileURLToPath(new URL('../data/parts/改装配件.csv', import.meta.url));

test('CSV production data has stable unique IDs and API-aligned thumbnails and fitModels', () => {
  const firstLoad = loadPartsFromCsv(productionCsv);
  const secondLoad = loadPartsFromCsv(productionCsv);
  assert.equal(firstLoad.length, 600);
  assert.deepEqual(
    firstLoad.map((part) => part.partId),
    secondLoad.map((part) => part.partId),
  );
  assert.equal(new Set(firstLoad.map((part) => part.partId)).size, firstLoad.length);
  assert.equal(
    firstLoad.every((part) => part.thumbnailUrl.length > 0),
    true,
  );
  assert.equal(
    firstLoad.every((part) => part.fitModels.length === 0),
    true,
  );
});

test('CSV loader rejects blank and duplicate persistent part IDs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'motoviz-parts-'));
  const path = join(directory, 'parts.csv');
  const header =
    'partId,摩托品牌,可改配件,配件品牌,配件型号,价格,source,sourceUrl,imageUrl,描述,fitModels\n';
  try {
    writeFileSync(
      path,
      `${header},车型A,排气,品牌,型号,1,来源,https://source,https://image,,车型A\n`,
    );
    assert.throws(() => loadPartsFromCsv(path), /partId 不能为空/u);
    writeFileSync(
      path,
      `${header}fixed-id,车型A,排气,品牌,型号,1,来源,https://source,https://image,,车型A\nfixed-id,车型B,排气,品牌,型号2,2,来源,https://source,https://image,,车型B\n`,
    );
    assert.throws(() => loadPartsFromCsv(path), /partId 重复/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const fixtures: Part[] = [
  {
    partId: 'p-a',
    name: '碳纤维尾段排气',
    brand: 'A',
    partType: 'exhaust',
    fitModels: ['车型A'],
    price: 1,
    source: '目录',
    sourceUrl: 'https://a',
    thumbnailUrl: 'https://a/image',
  },
  {
    partId: 'p-b',
    name: '旅行风挡',
    brand: 'B',
    partType: 'windshield',
    fitModels: ['车型B'],
    price: 2,
    source: '目录',
    sourceUrl: 'https://b',
    thumbnailUrl: 'https://b/image',
  },
  {
    partId: 'p-unknown',
    name: '排气',
    brand: 'C',
    partType: 'exhaust',
    fitModels: [],
    price: 3,
    source: '目录',
    sourceUrl: 'https://c',
    thumbnailUrl: 'https://c/image',
  },
];

test('part search hard-filters mismatched and unknown fitment', () => {
  assert.deepEqual(searchParts(fixtures, { query: '排气', motorcycleModel: '车型B' }), []);
  assert.deepEqual(
    searchParts(fixtures, { query: '排气', motorcycleModel: '车型A' }).map((part) => part.partId),
    ['p-a'],
  );
});

test('part search ignores model spacing without prefix false positives', () => {
  const spaced = [{ ...fixtures[0]!, fitModels: ['春风 250SR 2020-2023'] }];
  assert.equal(searchParts(spaced, { query: '排气', motorcycleModel: '春风250SR' }).length, 1);
  assert.deepEqual(searchParts(fixtures, { query: '排气', motorcycleModel: '车型AB' }), []);
});

test('part search returns empty for completely unrelated query', () => {
  assert.deepEqual(searchParts(fixtures, { query: '完全不存在的商品' }), []);
});

test('controlled part synonyms retrieve the intended category', () => {
  assert.deepEqual(
    searchParts(fixtures, { query: '消音器', motorcycleModel: '车型A' }).map((part) => part.partId),
    ['p-a'],
  );
});
