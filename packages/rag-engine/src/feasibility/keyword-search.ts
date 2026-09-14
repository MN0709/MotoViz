import type { Part, SearchResult } from '@motorcycle-ai/shared';

const typeAliases: Record<Part['partType'], string> = {
  exhaust: '排气 尾排 exhaust',
  windshield: '风挡 挡风 windshield',
  saddlebag: '边箱 侧箱 saddlebag',
  other: '轮胎 刹车 减震 其他 other',
};

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * 中文不依赖分词库：保留空格切出的完整词，并为连续中文生成二元词。
 * 二元词能让“冷车启动”和“冷车难启动”共享“冷车”等局部信号。
 */
export function tokenize(text: string): string[] {
  const normalized = normalize(text);
  const tokens = normalized.split(/\s+/u).filter(Boolean);
  for (const segment of normalized.match(/[\p{Script=Han}]{3,}/gu) ?? []) {
    const characters = [...segment];
    for (let index = 0; index < characters.length - 1; index += 1) {
      tokens.push(`${characters[index]}${characters[index + 1]}`);
    }
  }
  return [...new Set(tokens)];
}

/**
 * 每个查询词只取“命中字段中的最高权重”：名称 1、类型 0.9、车型 0.85、
 * 品牌 0.75、来源 0.45，避免同一词在多个字段重复加分。
 * 所有词的最高可能权重均为 1，所以权重和除以词数天然落在 0-1；
 * 最后用 clamp 抵御浮点误差。该 score 是相关性排序分，不是适配概率。
 */
export function keywordScore(query: string, part: Part): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;

  const fields: ReadonlyArray<readonly [string, number]> = [
    [normalize(part.name), 1],
    [normalize(typeAliases[part.partType]), 0.9],
    [normalize(part.fitModels.join(' ')), 0.85],
    [normalize(part.brand), 0.75],
    [normalize(`${part.source} ${part.sourceUrl}`), 0.45],
  ];
  const sum = tokens.reduce((total, token) => {
    const bestWeight = fields.reduce(
      (best, [field, weight]) => (field.includes(token) ? Math.max(best, weight) : best),
      0,
    );
    return total + bestWeight;
  }, 0);
  return Number(Math.max(0, Math.min(1, sum / tokens.length)).toFixed(4));
}

/** 返回正相关结果，并按 score 降序；同分时用 partId 保证结果稳定。 */
export function searchParts(query: string, entries: readonly Part[], limit = 10): SearchResult[] {
  return entries
    .map((part) => ({ ...part, score: keywordScore(query, part) }))
    .filter((part) => part.score > 0)
    .sort((left, right) => right.score - left.score || left.partId.localeCompare(right.partId))
    .slice(0, limit);
}

/** 故障片段的轻量选择器，只用于为 Demo 的 LLM 提供相关上下文。 */
export function textOverlapScore(query: string, text: string): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;
  const normalizedText = normalize(text);
  const matched = tokens.filter((token) => normalizedText.includes(token)).length;
  return Number((matched / tokens.length).toFixed(4));
}
