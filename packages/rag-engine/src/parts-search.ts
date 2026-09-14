import type { Part, PartType } from '@motorcycle-ai/shared';
import {
  expandControlledPartQueryTerms,
  inferPartTypeFromQuery,
  matchesMotorcycleModel,
  normalizeSearchText,
} from '@motorcycle-ai/shared';

export interface PartSearchResult extends Part {
  score: number;
}
export interface PartSearchRequest {
  query: string;
  motorcycleModel?: string;
  limit?: number;
}

export { matchesMotorcycleModel } from '@motorcycle-ai/shared';

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
  const terms = expandControlledPartQueryTerms(query);
  const inferredType: PartType | undefined = inferPartTypeFromQuery(query);
  const eligible = request.motorcycleModel?.trim()
    ? parts.filter((part) => fitsModel(part, request.motorcycleModel ?? ''))
    : parts;
  return eligible
    .map((part) => {
      const searchable = normalizeSearchText(
        `${part.name} ${part.brand} ${part.partType} ${part.source}`,
      );
      const matched = terms.filter((term) => searchable.includes(normalizeSearchText(term))).length;
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
