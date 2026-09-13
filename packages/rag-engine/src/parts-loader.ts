import { readFileSync } from 'node:fs';
import type { Part, PartType } from '@motorcycle-ai/shared';

const REQUIRED_COLUMNS = [
  'partId',
  '摩托品牌',
  '可改配件',
  '配件品牌',
  '配件型号',
  '价格',
  'source',
  'sourceUrl',
  'imageUrl',
  'fitModels',
] as const;

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function mapPartType(category: string): PartType {
  if (/排气|exhaust/iu.test(category)) return 'exhaust';
  if (/风挡|挡风|windshield/iu.test(category)) return 'windshield';
  if (/边箱|侧箱|saddlebag/iu.test(category)) return 'saddlebag';
  return 'other';
}

function requireValue(value: string | undefined, column: string, rowNumber: number): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new Error(`CSV 第 ${rowNumber} 行 ${column} 不能为空`);
  return normalized;
}

/** 从 CSV 加载配件。partId 必须由源数据持久化提供，且全表唯一。 */
export function loadPartsFromCsv(csvPath: string): Part[] {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  if (rows.length === 0) return [];
  const headers = rows[0] ?? [];
  for (const column of REQUIRED_COLUMNS) {
    if (!headers.includes(column)) throw new Error(`CSV 缺少必需列：${column}`);
  }
  const indexOf = (column: string): number => headers.indexOf(column);
  const ids = new Set<string>();
  return rows.slice(1).map((row, offset) => {
    const rowNumber = offset + 2;
    const partId = requireValue(row[indexOf('partId')], 'partId', rowNumber);
    if (ids.has(partId)) throw new Error(`CSV partId 重复：${partId}`);
    ids.add(partId);
    const model = requireValue(row[indexOf('配件型号')], '配件型号', rowNumber);
    const description = row[indexOf('描述')]?.trim();
    const fitModelsRaw = requireValue(row[indexOf('fitModels')], 'fitModels', rowNumber);
    const fitModels =
      fitModelsRaw === '数据未覆盖'
        ? []
        : fitModelsRaw
            .split('|')
            .map((item) => item.trim())
            .filter(Boolean);
    const price = Number(
      requireValue(row[indexOf('价格')], '价格', rowNumber).replace(/[^0-9.]/gu, ''),
    );
    if (!Number.isFinite(price) || price < 0) throw new Error(`CSV 第 ${rowNumber} 行价格不合法`);
    return {
      partId,
      name: description ? `${model}（${description}）` : model,
      brand: requireValue(row[indexOf('配件品牌')], '配件品牌', rowNumber),
      partType: mapPartType(requireValue(row[indexOf('可改配件')], '可改配件', rowNumber)),
      fitModels,
      price,
      source: requireValue(row[indexOf('source')], 'source', rowNumber),
      sourceUrl: requireValue(row[indexOf('sourceUrl')], 'sourceUrl', rowNumber),
      thumbnailUrl: requireValue(row[indexOf('imageUrl')], 'imageUrl', rowNumber),
    };
  });
}
