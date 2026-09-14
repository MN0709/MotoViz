import type { PartType } from '../types/3d.js';

export const CONTROLLED_PART_SYNONYM_GROUPS = [
  ['排气', '消音器', '尾段'],
  ['风挡', '挡风', '风镜'],
  ['边箱', '侧箱', '行李箱'],
  ['刹车', '制动'],
] as const;

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function expandControlledPartQueryTerms(query: string): string[] {
  const normalized = normalizeSearchText(query);
  const terms = new Set(normalized.split(/\s+/u).filter(Boolean));
  for (const group of CONTROLLED_PART_SYNONYM_GROUPS) {
    if (group.some((term) => normalized.includes(term))) {
      for (const term of group) terms.add(term);
    }
  }
  return [...terms];
}

export function inferPartTypeFromQuery(query: string): PartType | undefined {
  if (/排气|消音|尾段|exhaust/iu.test(query)) return 'exhaust';
  if (/风挡|挡风|风镜|windshield/iu.test(query)) return 'windshield';
  if (/边箱|侧箱|行李箱|saddlebag/iu.test(query)) return 'saddlebag';
  return undefined;
}

interface ModelYearSuffix {
  base: string;
  start: number;
  end: number;
}

function canonicalModel(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function parseModelYearSuffix(value: string): ModelYearSuffix | undefined {
  const range = /^(.*)((?:19|20)\d{2})((?:19|20)\d{2})$/u.exec(value);
  if (range) {
    const start = Number(range[2]);
    const end = Number(range[3]);
    if (range[1] && start <= end) return { base: range[1], start, end };
  }

  const single = /^(.*)((?:19|20)\d{2})$/u.exec(value);
  if (single?.[1]) {
    const year = Number(single[2]);
    return { base: single[1], start: year, end: year };
  }
  return undefined;
}

/** 保守车型匹配：忽略空格/标点，理解候选年款区间，但不接受前缀误判。 */
export function matchesMotorcycleModel(candidate: string, requested: string): boolean {
  const fit = canonicalModel(candidate);
  const model = canonicalModel(requested);
  if (fit === model) return true;

  const fitYears = parseModelYearSuffix(fit);
  const requestedYears = parseModelYearSuffix(model);
  if (!fitYears) return false;

  // 保留既有行为：未指定年款的同一车型可匹配带单年或区间的目录候选。
  if (!requestedYears) return fitYears.base === model;
  if (fitYears.base !== requestedYears.base) return false;

  // 仅将单一年款请求解释为目录区间中的一个年份；区间请求仍要求精确一致。
  return (
    requestedYears.start === requestedYears.end &&
    requestedYears.start >= fitYears.start &&
    requestedYears.start <= fitYears.end
  );
}
