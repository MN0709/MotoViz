import type { Reference } from '@motorcycle-ai/shared';
import type { LLMReferenceDraft } from './diagnosis-types.js';
import type { KnowledgeDocument, KnowledgeSearchHit } from './knowledge-search.js';

function toTrustedReference(hit: KnowledgeDocument): Reference {
  let url: URL;
  try {
    url = new URL(hit.sourceUrl);
  } catch {
    throw new Error(`引用来源必须是 HTTP(S) 链接：${hit.knowledgeId}`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new Error(`引用来源必须是 HTTP(S) 链接：${hit.knowledgeId}`);
  }
  if (
    (hit.pageStart !== undefined && (!Number.isInteger(hit.pageStart) || hit.pageStart < 1)) ||
    (hit.pageEnd !== undefined &&
      (!Number.isInteger(hit.pageEnd) ||
        hit.pageStart === undefined ||
        hit.pageEnd < hit.pageStart))
  ) {
    throw new Error(`引用页码不合法：${hit.knowledgeId}`);
  }
  return {
    knowledgeId: hit.knowledgeId,
    title: hit.title,
    sourceType: hit.sourceType,
    excerpt: hit.content.slice(0, 200),
    url: hit.sourceUrl,
    ...(hit.documentId !== undefined ? { documentId: hit.documentId } : {}),
    ...(hit.pageStart !== undefined ? { pageStart: hit.pageStart } : {}),
    ...(hit.pageEnd !== undefined ? { pageEnd: hit.pageEnd } : {}),
    ...(hit.section !== undefined ? { section: hit.section } : {}),
  };
}

/**
 * 引用元数据只由服务端上下文回填。任一 ID 不属于本次 Top-5 就抛错，
 * 让上层整体降级，绝不保留“部分可信”的 AI 诊断。
 */
export function bindReferences(
  drafts: readonly LLMReferenceDraft[],
  context: readonly KnowledgeSearchHit[],
  currentDocuments: readonly KnowledgeDocument[] = context,
): Reference[] {
  const contextById = new Map(context.map((hit) => [hit.knowledgeId, hit]));
  const uniqueIds = [...new Set(drafts.map((draft) => draft.knowledgeId))];
  return uniqueIds.map((knowledgeId) => {
    const hit = contextById.get(knowledgeId);
    if (!hit) throw new Error(`LLM 引用了本次上下文之外的知识条目：${knowledgeId}`);
    const current = currentDocuments.find((document) => document.knowledgeId === knowledgeId);
    if (!current || current.content !== hit.content || current.sourceUrl !== hit.sourceUrl) {
      throw new Error(`引用来源已删除或变更：${knowledgeId}`);
    }
    return toTrustedReference(current);
  });
}

/** 配件引用必须由可信目录条目的 parts 显式关联，不能靠名称猜测。 */
export function bindPartReferences(
  partId: string,
  documents: readonly KnowledgeDocument[],
): Reference[] {
  return documents
    .filter((document) => document.parts?.some((part) => part.partId === partId))
    .map(toTrustedReference);
}

export function bindAllContextReferences(context: readonly KnowledgeSearchHit[]): Reference[] {
  return context.map(toTrustedReference);
}
