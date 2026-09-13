import { readFileSync } from 'node:fs';
import type { Part, PartType } from '@motorcycle-ai/shared';

/**
 * 配件数据加载器
 *
 * 职责：从CSV文件读取配件数据，清洗后返回Part数组。
 * 数据清洗包括：去重、中文类别映射成英文枚举、描述拼到name里。
 *
 * 设计决策：
 * - 为什么在加载时清洗，而不是要求谢以波先返工？
 *   因为数据返工可能慢，加载时清洗能让引擎先跑起来，不阻塞开发。
 *   等谢以波返工完，清洗逻辑可以简化，但接口不变。
 * - 为什么sourceUrl和imageUrl不存进Part？
 *   因为接口文档里的SearchResult没有这两个字段。
 *   sourceUrl是溯源用的，imageUrl是给3D组跑Demo用的，都不进RAG API响应。
 */

/** CSV的中文表头映射 */
const CSV_COLUMNS = {
  motorcycleBrand: '摩托品牌',
  partCategory: '可改配件',
  brand: '配件品牌',
  model: '配件型号',
  price: '价格',
  source: 'source',
  sourceUrl: 'sourceUrl',
  imageUrl: 'imageUrl',
  description: '描述',
} as const;

/** 中文配件类别 → 英文枚举映射 */
function mapPartType(chineseCategory: string): PartType {
  if (/排气|exhaust/i.test(chineseCategory)) return 'exhaust';
  if (/风挡|挡风|windshield/i.test(chineseCategory)) return 'windshield';
  if (/边箱|侧箱|saddlebag/i.test(chineseCategory)) return 'saddlebag';
  return 'other';
}

/** 解析CSV一行，返回字段数组（处理引号包裹的逗号） */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/** 加载并清洗配件数据 */
export function loadPartsFromCsv(csvPath: string): Part[] {
  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim() !== '');

  if (lines.length < 2) {
    return [];
  }

  // 解析表头，建立列名→索引的映射
  const headers = parseCsvLine(lines[0]);
  const columnIndex: Record<string, number> = {};
  headers.forEach((header, index) => {
    columnIndex[header] = index;
  });

  const parts: Part[] = [];
  const seen = new Set<string>(); // 去重用：品牌+型号+车型

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 5) continue;

    const motorcycleBrand = fields[columnIndex[CSV_COLUMNS.motorcycleBrand] ?? 0] ?? '';
    const partCategory = fields[columnIndex[CSV_COLUMNS.partCategory] ?? 1] ?? '';
    const brand = fields[columnIndex[CSV_COLUMNS.brand] ?? 2] ?? '';
    const model = fields[columnIndex[CSV_COLUMNS.model] ?? 3] ?? '';
    const priceStr = fields[columnIndex[CSV_COLUMNS.price] ?? 4] ?? '0';
    const source = fields[columnIndex[CSV_COLUMNS.source] ?? 5] ?? '';
    const sourceUrl = fields[columnIndex[CSV_COLUMNS.sourceUrl] ?? 6] ?? '';
    const description = fields[columnIndex[CSV_COLUMNS.description] ?? 8] ?? '';

    // 去重：品牌+型号+车型
    const dedupKey = `${brand}|${model}|${motorcycleBrand}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    // 描述拼到name里（方案A：不加description字段）
    const name = description ? `${model}（${description}）` : model;

    // 价格解析（去掉非数字字符）
    const price = parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0;

    // 中文类别映射成英文枚举
    const partType = mapPartType(partCategory);

    parts.push({
      partId: `part-${parts.length + 1}`,
      name,
      brand,
      partType,
      fitModels: [motorcycleBrand],
      price,
      source,
      sourceUrl,
    });
  }

  return parts;
}
