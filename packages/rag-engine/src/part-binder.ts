import type { Part, RequiredPart } from '@motorcycle-ai/shared';
import type { LLMRequiredPartDraft } from './diagnosis-types.js';
import type { KnowledgeSearchHit } from './knowledge-search.js';
import { matchesMotorcycleModel } from './parts-search.js';

/**
 * 模型只能选择本次上下文显式提供的 partId；名称、品牌和库存全部使用服务端可信快照。
 * 任一未知 ID 都抛错，让上层整体降级。
 */
export function bindRequiredParts(
  drafts: readonly LLMRequiredPartDraft[],
  context: readonly KnowledgeSearchHit[],
  catalog?: readonly Part[],
  motorcycleModel?: string,
): RequiredPart[] {
  if (drafts.length > 0 && motorcycleModel?.trim() && catalog === undefined) {
    throw new Error('指定车型时缺少可验证适配关系的可信配件目录');
  }

  const trustedParts = new Map<string, RequiredPart>();
  for (const hit of context) {
    for (const part of hit.parts ?? []) {
      const existing = trustedParts.get(part.partId);
      if (
        existing &&
        (existing.name !== part.name ||
          existing.brand !== part.brand ||
          existing.stock !== part.stock)
      ) {
        throw new Error(`上下文中的配件快照冲突：${part.partId}`);
      }
      if (!existing) trustedParts.set(part.partId, { ...part });
    }
  }

  const catalogById = catalog ? new Map(catalog.map((part) => [part.partId, part])) : undefined;
  return [...new Set(drafts.map((draft) => draft.partId))].flatMap((partId) => {
    const part = trustedParts.get(partId);
    if (!part) throw new Error(`LLM 引用了本次上下文之外的配件：${partId}`);
    const catalogPart = catalogById?.get(partId);
    if (catalogById && !catalogPart) throw new Error(`配件目录中不存在 ID：${partId}`);
    if (
      catalogPart &&
      motorcycleModel?.trim() &&
      !catalogPart.fitModels.some((model) => matchesMotorcycleModel(model, motorcycleModel))
    ) {
      return [];
    }
    return { ...part };
  });
}
