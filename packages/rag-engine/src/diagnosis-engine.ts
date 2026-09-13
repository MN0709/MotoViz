import { randomUUID } from 'node:crypto';
import type { FaultDiagnosisResult } from '@motorcycle-ai/shared';
import type { DiagnosisOutcome, LLMAdapter } from './diagnosis-types.js';
import { buildFallbackResult } from './fallback.js';
import type { KnowledgeDocument } from './knowledge-search.js';
import { searchKnowledge } from './knowledge-search.js';
import { LLMAdapterError } from './llm-adapter.js';
import { bindReferences } from './reference-binder.js';
import { isFaultDiagnosisResult, isLLMDiagnosisDraft } from './validate.js';

export interface DiagnoseOptions {
  queryId?: string;
}

function fallbackOutcome(
  queryId: string,
  context: DiagnosisOutcome['context'],
  fallbackReason: NonNullable<DiagnosisOutcome['fallbackReason']>,
): DiagnosisOutcome {
  const result = buildFallbackResult(queryId, context);
  if (!isFaultDiagnosisResult(result)) {
    throw new Error('知识数据不完整，无法构造合法的降级诊断响应');
  }
  return { result, degraded: true, fallbackReason, context };
}

/** 检索 → LLM → 结构校验 → 引用回填；任一失败都整体降级。 */
export async function diagnoseFault(
  symptom: string,
  documents: readonly KnowledgeDocument[],
  adapter: LLMAdapter,
  options: DiagnoseOptions = {},
): Promise<DiagnosisOutcome> {
  const suppliedQueryId = options.queryId?.trim();
  const queryId = suppliedQueryId || `query-${randomUUID()}`;
  const context = searchKnowledge(symptom, documents);
  if (context.length === 0) {
    throw new Error('知识库中没有可用于诊断的维修手册或故障案例');
  }

  let draft: unknown;
  try {
    draft = await adapter.generateDiagnosis(symptom, context);
  } catch (error) {
    const reason =
      error instanceof LLMAdapterError &&
      (error.code === 'timeout' || error.code === 'invalid-json' || error.code === 'http-error')
        ? error.code
        : 'llm-error';
    return fallbackOutcome(queryId, context, reason);
  }
  if (!isLLMDiagnosisDraft(draft)) {
    return fallbackOutcome(queryId, context, 'invalid-structure');
  }

  let result: FaultDiagnosisResult;
  try {
    result = {
      queryId,
      diagnosis: draft.diagnosis.trim(),
      possibleCauses: draft.possibleCauses,
      requiredParts: draft.requiredParts,
      references: bindReferences(draft.references, context),
    };
  } catch {
    return fallbackOutcome(queryId, context, 'invalid-reference');
  }

  if (!isFaultDiagnosisResult(result)) {
    return fallbackOutcome(queryId, context, 'invalid-structure');
  }
  return { result, degraded: false, context };
}
