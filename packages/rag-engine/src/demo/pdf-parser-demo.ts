import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePdf } from '../pdf-parser.js';

const fixtures = [
  {
    path: fileURLToPath(new URL('../../fixtures/chinese-maintenance-guide.pdf', import.meta.url)),
    expectedTerms: ['冷车启动困难', '蓄电池静态电压', '专业技师复核'],
  },
  {
    path: fileURLToPath(new URL('../../fixtures/chinese-parts-catalog.pdf', import.meta.url)),
    expectedTerms: ['碳纤维尾段排气', '川崎 Ninja 400', '5980 元'],
  },
];

const requestedPaths = process.argv.slice(2);
const targets =
  requestedPaths.length > 0
    ? requestedPaths.map((path) => ({ path, expectedTerms: [] }))
    : fixtures;

let failed = false;

for (const target of targets) {
  try {
    const input = await readFile(target.path);
    const parsed = await parsePdf(new Uint8Array(input));
    const missingTerms = target.expectedTerms.filter((term) => !parsed.text.includes(term));
    const hasBrokenCharacters = parsed.text.includes('\uFFFD') || parsed.text.includes('\u0000');

    if (parsed.text.length === 0 || hasBrokenCharacters || missingTerms.length > 0) {
      throw new Error(
        `文本验收失败：字符数=${parsed.text.length}，乱码=${hasBrokenCharacters}，缺少=${missingTerms.join(', ') || '无'}`,
      );
    }

    console.log(`\n=== ${basename(target.path)} ===`);
    console.log(`页数：${parsed.totalPages}；字符数：${parsed.text.length}；中文验收：通过`);
    console.log(parsed.text);
  } catch (error) {
    failed = true;
    console.error(`\n[失败] ${target.path}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

if (failed) {
  process.exitCode = 1;
}
