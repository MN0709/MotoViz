import type { KnowledgeEntry } from '@motorcycle-ai/shared';
import { faultCases } from './faults.js';
import { parts } from './parts.js';

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

/** Mock 目录记录，仅验证追溯链路，不代表已经核实供应商网页。 */
knowledgeEntries.push(
  ...parts.map((part): KnowledgeEntry => ({
    id: `kn-catalog-${part.partId}`,
    documentId: `mock-catalog-${part.partId}`,
    title: part.source,
    sourceType: 'part-catalog',
    sourceUrl: part.sourceUrl,
    content: `${part.name}；适配车型：${part.fitModels.join('、')}。（Mock 数据，非真实维修依据）`,
    models: [...part.fitModels],
    updatedAt: '2026-09-12T09:00:00.000Z',
  })),
);
