import type { Part, PartType } from '@motorcycle-ai/shared';

/**
 * 配件检索器
 *
 * 职责：根据用户的搜索词和车型，从配件库中召回最相关的配件，按相关度打分排序。
 *
 * 设计决策：
 * - 为什么用关键词打分而不是向量检索？
 *   数据量小（几百条），关键词检索完全够用，而且不需要额外部署向量数据库。
 *   摩托车配件的搜索词比较固定（"排气""风挡""刹车"），关键词匹配精度高。
 * - 为什么从query推断配件类型？
 *   用户搜"排气"时，应该优先返回排气类配件，而不是所有包含"排气"二字的配件。
 *   类型推断能提高检索精度。
 * - 为什么车型匹配加分？
 *   用户指定了车型时，应该优先返回适配该车型的配件。
 */

/** 检索结果（Part + 相关度分数） */
export interface PartSearchResult extends Part {
  score: number;
}

/** 检索请求 */
export interface PartSearchRequest {
  query: string;
  motorcycleModel?: string;
  limit?: number;
}

/** 从搜索词推断配件类型 */
function inferPartType(query: string): PartType | undefined {
  if (/排气|exhaust|消音|管/i.test(query)) return 'exhaust';
  if (/风挡|挡风|windshield|玻璃/i.test(query)) return 'windshield';
  if (/边箱|侧箱|saddlebag|尾箱|箱子/i.test(query)) return 'saddlebag';
  return undefined;
}

/** 计算单个配件的相关度分数 */
function scorePart(
  part: Part,
  query: string,
  inferredType: PartType | undefined,
  motorcycleModel: string | undefined,
): number {
  const queryLower = query.toLowerCase();

  // 搜索范围：名称+品牌+来源+适配车型
  const searchable = `${part.name} ${part.brand} ${part.source} ${part.fitModels.join(' ')}`.toLowerCase();

  // 各项打分
  const typeMatch = inferredType === part.partType ? 0.3 : 0;
  const textMatch = searchable.includes(queryLower) ? 0.4 : 0;
  const modelMatch = motorcycleModel
    ? part.fitModels.some((model) => model.toLowerCase().includes(motorcycleModel.toLowerCase()))
      ? 0.2
      : 0
    : 0;

  // 基础分 + 各项加分，最高0.99（不超过1，保留一点空间）
  return Math.min(0.99, 0.1 + typeMatch + textMatch + modelMatch);
}

/** 配件检索主函数 */
export function searchParts(
  parts: readonly Part[],
  request: PartSearchRequest,
): PartSearchResult[] {
  const { query, motorcycleModel, limit = 10 } = request;
  const inferredType = inferPartType(query);

  // 对所有配件打分
  const scored = parts.map((part) => ({
    ...part,
    score: scorePart(part, query, inferredType, motorcycleModel),
  }));

  // 如果推断出了配件类型，只返回该类型的配件
  const filtered = inferredType
    ? scored.filter((part) => part.partType === inferredType)
    : scored;

  // 按分数从高到低排序，取前limit个
  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(limit, 20));
}
