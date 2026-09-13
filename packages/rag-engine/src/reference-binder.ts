import type { Reference } from '@motorcycle-ai/shared';
import type { LLMReferenceDraft } from './diagnosis-types.js';
import type { KnowledgeSearchHit } from './knowledge-search.js';

function toTrustedReference(hit: KnowledgeSearchHit): Reference {
  return {
    knowledgeId: hit.knowledgeId,
    title: hit.title,
    sourceType: hit.sourceType,
    excerpt: hit.content.slice(0, 200),
    url: hit.sourceUrl,
  };
}

/**
 * 引用元数据只由服务端上下文回填。任一 ID 不属于本次 Top-5 就抛错，
 * 让上层整体降级，绝不保留“部分可信”的 AI 诊断。
 */
export function bindReferences(
  drafts: readonly LLMReferenceDraft[],
  context: readonly KnowledgeSearchHit[],
): Reference[] {
  const contextById = new Map(context.map((hit) => [hit.knowledgeId, hit]));
  const uniqueIds = [...new Set(drafts.map((draft) => draft.knowledgeId))];
  return uniqueIds.map((knowledgeId) => {
    const hit = contextById.get(knowledgeId);
    if (!hit) throw new Error(`LLM 引用了本次上下文之外的知识条目：${knowledgeId}`);
    return toTrustedReference(hit);
  });
}

export function bindAllContextReferences(context: readonly KnowledgeSearchHit[]): Reference[] {
  return context.map(toTrustedReference);
}
