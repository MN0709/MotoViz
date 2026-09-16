import type { Reference, RequiredPart, SourceLocation } from '@motorcycle-ai/shared';

export interface KnowledgeDocument extends SourceLocation {
  knowledgeId: string;
  title: string;
  sourceType: Reference['sourceType'];
  sourceUrl: string;
  content: string;
  /** 由采集/库存服务提供的可信配件快照；LLM 只能选择其中的 partId。 */
  parts?: readonly RequiredPart[];
}

export interface KnowledgeSearchHit extends KnowledgeDocument {
  /** 关键词相关性排序分，不代表故障概率；fault-case 会在基础分上乘 1.2。 */
  score: number;
}

const DEFAULT_LIMIT = 5;
const FAULT_CASE_WEIGHT = 1.2;
const SYNONYM_GROUPS = [
  ['刹车', '制动'],
  ['启动', '打火', '点火'],
  ['熄火', '灭车'],
  ['异响', '噪音', '响声'],
  ['电瓶', '蓄电池', '电池'],
  ['过热', '高温', '水温'],
  ['漏油', '渗油'],
] as const;

function isTrustedPart(part: RequiredPart): boolean {
  return (
    part.partId.trim().length > 0 &&
    part.name.trim().length > 0 &&
    part.brand.trim().length > 0 &&
    Number.isInteger(part.stock) &&
    part.stock >= 0
  );
}

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** 沿用 feasibility 的轻量 keyword-index：空格词元 + 连续中文二元词。 */
export function tokenizeKnowledge(text: string): string[] {
  const normalized = normalize(text);
  if (!normalized) return [];

  const tokens = normalized.split(/\s+/u).filter(Boolean);
  for (const segment of normalized.match(/[\p{Script=Han}]{3,}/gu) ?? []) {
    const characters = [...segment];
    for (let index = 0; index < characters.length - 1; index += 1) {
      tokens.push(`${characters[index]}${characters[index + 1]}`);
    }
  }
  return [...new Set(tokens)];
}

function expandSynonyms(query: string): string {
  const normalized = normalize(query);
  const additions = SYNONYM_GROUPS.flatMap((group) =>
    group.some((term) => normalized.includes(term)) ? [...group] : [],
  );
  return additions.length > 0 ? `${query} ${additions.join(' ')}` : query;
}

function overlapScore(query: string, document: KnowledgeDocument): number {
  const tokens = tokenizeKnowledge(query);
  if (tokens.length === 0) return 0;
  const searchableText = normalize(`${document.title} ${document.content}`);
  const matched = tokens.filter((token) => searchableText.includes(token)).length;
  return matched / tokens.length;
}

/** 从维修手册和故障案例中稳定召回最多 5 条正相关资料。 */
export function searchKnowledge(
  query: string,
  documents: readonly KnowledgeDocument[],
  limit = DEFAULT_LIMIT,
): KnowledgeSearchHit[] {
  const safeLimit = Math.max(0, Math.min(DEFAULT_LIMIT, Math.trunc(limit)));
  const eligibleDocuments = documents.filter(
    (document) => document.sourceType === 'manual' || document.sourceType === 'fault-case',
  );
  const seenIds = new Set<string>();
  for (const document of eligibleDocuments) {
    if (
      !document.knowledgeId.trim() ||
      !document.title.trim() ||
      !document.sourceUrl.trim() ||
      !document.content.trim()
    ) {
      throw new Error('知识条目的 knowledgeId、title、sourceUrl 和 content 均不能为空');
    }
    if (seenIds.has(document.knowledgeId)) {
      throw new Error(`知识条目 ID 重复：${document.knowledgeId}`);
    }
    if (document.parts && !document.parts.every(isTrustedPart)) {
      throw new Error(`知识条目配件数据不完整：${document.knowledgeId}`);
    }
    const partIds = document.parts?.map((part) => part.partId) ?? [];
    if (new Set(partIds).size !== partIds.length) {
      throw new Error(`知识条目配件 ID 重复：${document.knowledgeId}`);
    }
    seenIds.add(document.knowledgeId);
  }

  const rank = (searchQuery: string): KnowledgeSearchHit[] =>
    eligibleDocuments
      .map((document) => {
        const baseScore = overlapScore(searchQuery, document);
        const score = baseScore * (document.sourceType === 'fault-case' ? FAULT_CASE_WEIGHT : 1);
        return { ...document, score: Number(score.toFixed(4)) };
      })
      .filter((document) => document.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.knowledgeId.localeCompare(right.knowledgeId),
      )
      .slice(0, safeLimit);
  const direct = rank(query);
  return direct.length > 0 ? direct : rank(expandSynonyms(query));
}
