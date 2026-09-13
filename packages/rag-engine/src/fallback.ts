import type { FaultDiagnosisResult } from '@motorcycle-ai/shared';
import type { KnowledgeSearchHit } from './knowledge-search.js';
import { bindAllContextReferences } from './reference-binder.js';

export const FALLBACK_DIAGNOSIS = 'AI 诊断暂时不可用，以下是最相关的维修资料';

export function buildFallbackResult(
  queryId: string,
  context: readonly KnowledgeSearchHit[],
): FaultDiagnosisResult {
  if (context.length === 0) {
    throw new Error('没有受信知识上下文，不能构造带引用的诊断响应');
  }
  return {
    queryId,
    diagnosis: FALLBACK_DIAGNOSIS,
    possibleCauses: [],
    requiredParts: [],
    references: bindAllContextReferences(context),
  };
}
