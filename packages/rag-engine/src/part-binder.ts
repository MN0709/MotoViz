import type { RequiredPart } from '@motorcycle-ai/shared';
import type { LLMRequiredPartDraft } from './diagnosis-types.js';
import type { KnowledgeSearchHit } from './knowledge-search.js';

/**
 * 模型只能选择本次上下文显式提供的 partId；名称、品牌和库存全部使用服务端可信快照。
 * 任一未知 ID 都抛错，让上层整体降级。
 */
export function bindRequiredParts(
  drafts: readonly LLMRequiredPartDraft[],
  context: readonly KnowledgeSearchHit[],
): RequiredPart[] {
  const trustedParts = new Map<string, RequiredPart>();
  for (const hit of context) {
    for (const part of hit.parts ?? []) trustedParts.set(part.partId, part);
  }

  return [...new Set(drafts.map((draft) => draft.partId))].map((partId) => {
    const part = trustedParts.get(partId);
    if (!part) throw new Error(`LLM 引用了本次上下文之外的配件：${partId}`);
    return { ...part };
  });
}
