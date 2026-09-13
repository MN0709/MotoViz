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
  motorcycleModel?: string;
  mileage?: number;
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

  // 搜不到资料时不报错，直接返回"资料不足"的结果
  // 这样非摩托问题和"资料里真的没有"都会返回这个提示，用户能理解
  if (context.length === 0) {
    return {
      result: {
        queryId,
        diagnosis: '未找到与该问题相关的维修资料。请确认问题是否与摩托车故障相关，或尝试更具体的故障描述。',
        possibleCauses: [],
        requiredParts: [],
        references: [],
      },
      degraded: true,
      fallbackReason: 'no-context' as const,
      context: [],
    };
  }

  let draft: unknown;
  try {
    draft = await adapter.generateDiagnosis(symptom, context, options.motorcycleModel, options.mileage);
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
