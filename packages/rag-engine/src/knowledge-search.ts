import type { Reference } from '@motorcycle-ai/shared';

export interface KnowledgeDocument {
  knowledgeId: string;
  title: string;
  sourceType: Reference['sourceType'];
  sourceUrl: string;
  content: string;
}

export interface KnowledgeSearchHit extends KnowledgeDocument {
  /** 关键词相关性排序分，不代表故障概率；fault-case 会在基础分上乘 1.2。 */
  score: number;
}

const DEFAULT_LIMIT = 5;
const FAULT_CASE_WEIGHT = 1.2;

/**
 * 摩托车领域同义词词典
 *
 * 用户说"刹车"，资料里写"制动"；用户说"打不着火"，资料里写"启动困难"。
 * 关键词检索不做语义理解，所以需要手动维护同义词映射。
 */
const SYNONYMS: Record<string, string[]> = {
  '刹车': ['制动', '刹车'],
  '制动': ['制动', '刹车'],
  '启动': ['启动', '打火', '点火'],
  '打火': ['启动', '打火', '点火'],
  '点火': ['启动', '打火', '点火'],
  '熄火': ['熄火', '怠速', '停机'],
  '怠速': ['怠速', '熄火', '低速'],
  '排气': ['排气', '消音', '排气管'],
  '消音': ['排气', '消音', '排气管'],
  '漏油': ['漏油', '渗漏', '渗油'],
  '渗漏': ['漏油', '渗漏', '渗油'],
  '异响': ['异响', '噪音', '响声', '吱吱', '嗡嗡'],
  '噪音': ['异响', '噪音', '响声'],
  '电瓶': ['电瓶', '蓄电池', '电池'],
  '蓄电池': ['电瓶', '蓄电池', '电池'],
  '电池': ['电瓶', '蓄电池', '电池'],
  '火花塞': ['火花塞', '火嘴', '火花'],
  '链条': ['链条', '传动链'],
  '轮胎': ['轮胎', '车胎', '外胎'],
  '机油': ['机油', '润滑油', '发动机油'],
  '水温': ['水温', '温度', '过热', '高温'],
  '过热': ['水温', '温度', '过热', '高温'],
};

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** 沿用 feasibility 的轻量 keyword-index：空格词元 + 连续中文二元词 + 同义词扩展。 */
export function tokenizeKnowledge(text: string): string[] {
  const normalized = normalize(text);
  if (!normalized) return [];

  const tokens = normalized.split(/\s+/u).filter(Boolean);
  for (const segment of normalized.match(/[\p{Script=Han}]{3,}/gu) ?? []) {
    const characters = [...segment];
    for (let index = 0; index < characters.length - 1; index += 1) {
      const word = `${characters[index]}${characters[index + 1]}`;
      tokens.push(word);
      // 同义词扩展
      const synonyms = SYNONYMS[word];
      if (synonyms) {
        tokens.push(...synonyms);
      }
    }
  }
  return [...new Set(tokens)];
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
    seenIds.add(document.knowledgeId);
  }

  return eligibleDocuments
    .map((document) => {
      const baseScore = overlapScore(query, document);
      const score = baseScore * (document.sourceType === 'fault-case' ? FAULT_CASE_WEIGHT : 1);
      return { ...document, score: Number(score.toFixed(4)) };
    })
    .filter((document) => document.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.knowledgeId.localeCompare(right.knowledgeId),
    )
    .slice(0, safeLimit);
}
