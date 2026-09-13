import type { Part, PartType } from '@motorcycle-ai/shared';

export interface PartSearchResult extends Part {
  score: number;
}
export interface PartSearchRequest {
  query: string;
  motorcycleModel?: string;
  limit?: number;
}

const SYNONYM_GROUPS = [
  ['排气', '消音器', '尾段'],
  ['风挡', '挡风', '风镜'],
  ['边箱', '侧箱', '行李箱'],
  ['刹车', '制动'],
] as const;

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function queryTerms(query: string): string[] {
  const normalized = normalize(query);
  const terms = new Set(normalized.split(/\s+/u).filter(Boolean));
  for (const group of SYNONYM_GROUPS) {
    if (group.some((term) => normalized.includes(term))) for (const term of group) terms.add(term);
  }
  return [...terms];
}

function inferPartType(query: string): PartType | undefined {
  if (/排气|消音|尾段|exhaust/iu.test(query)) return 'exhaust';
  if (/风挡|挡风|风镜|windshield/iu.test(query)) return 'windshield';
  if (/边箱|侧箱|行李箱|saddlebag/iu.test(query)) return 'saddlebag';
  return undefined;
}

function canonicalModel(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function withoutYearRange(value: string): string {
  return value.replace(/(?:19|20)\d{2}(?:(?:19|20)\d{2})?$/u, '');
}

/** 保守车型匹配：忽略空格/标点，但不把“车型A”误当作“车型AB”。 */
export function matchesMotorcycleModel(candidate: string, requested: string): boolean {
  const fit = canonicalModel(candidate);
  const model = canonicalModel(requested);
  return fit === model || withoutYearRange(fit) === model;
}

function fitsModel(part: Part, requested: string): boolean {
  return part.fitModels.some((candidate) => matchesMotorcycleModel(candidate, requested));
}

/** 关键词检索。指定车型时硬过滤；没有文本或类型相关性时返回空数组。 */
export function searchParts(
  parts: readonly Part[],
  request: PartSearchRequest,
): PartSearchResult[] {
  const query = request.query.trim();
  if (!query) return [];
  const terms = queryTerms(query);
  const inferredType = inferPartType(query);
  const eligible = request.motorcycleModel?.trim()
    ? parts.filter((part) => fitsModel(part, request.motorcycleModel ?? ''))
    : parts;
  return eligible
    .map((part) => {
      const searchable = normalize(`${part.name} ${part.brand} ${part.partType} ${part.source}`);
      const matched = terms.filter((term) => searchable.includes(normalize(term))).length;
      const typeMatch = inferredType === part.partType;
      const score = Math.min(
        0.99,
        (matched / Math.max(terms.length, 1)) * 0.7 + (typeMatch ? 0.29 : 0),
      );
      return { ...part, score: Number(score.toFixed(4)) };
    })
    .filter((part) => part.score > 0)
    .filter((part) => inferredType === undefined || part.partType === inferredType)
    .sort((left, right) => right.score - left.score || left.partId.localeCompare(right.partId))
    .slice(0, Math.max(0, Math.min(20, Math.trunc(request.limit ?? 10))));
}
