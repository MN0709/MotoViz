import type { KnowledgeEntry } from '@motorcycle-ai/shared';
import { faultCases } from './faults.js';

export const knowledgeEntries: KnowledgeEntry[] = faultCases.map((faultCase) => {
  const reference = faultCase.references[0];
  if (!reference) {
    throw new Error(`故障案例 ${faultCase.id} 缺少引用`);
  }

  return {
    id: reference.knowledgeId,
    title: reference.title,
    content: [
      faultCase.diagnosis,
      ...faultCase.possibleCauses.map((item) => `${item.cause}：${item.solution}`),
    ].join('\n'),
    sourceType: reference.sourceType,
    sourceUrl: reference.url,
    models: [...faultCase.motorcycleModels],
    updatedAt: '2026-09-12T09:00:00.000Z',
  };
});
