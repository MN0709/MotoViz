import { randomUUID } from 'node:crypto';
import type { FaultDiagnosisResult } from '@motorcycle-ai/shared';
import type { Part } from '@motorcycle-ai/shared';
import type { DiagnosisOutcome, LLMAdapter } from './diagnosis-types.js';
import { buildFallbackResult } from './fallback.js';
import type { KnowledgeDocument } from './knowledge-search.js';
import { searchKnowledge } from './knowledge-search.js';
import { LLMAdapterError } from './llm-adapter.js';
import { bindRequiredParts } from './part-binder.js';
import { INSUFFICIENT_DIAGNOSIS } from './prompts.js';
import { bindReferences } from './reference-binder.js';
import { isFaultDiagnosisResult, isLLMDiagnosisDraft } from './validate.js';

export interface DiagnoseOptions {
  queryId?: string;
  /** 接入知识库时提供实时快照，防止 LLM 调用期间删除的 chunk 被回填。 */
  getCurrentDocuments?: () => readonly KnowledgeDocument[];
  motorcycleModel?: string;
  mileage?: number;
  partsCatalog?: readonly Part[];
}

function fallbackOutcome(
  queryId: string,
  context: DiagnosisOutcome['context'],
  fallbackReason: NonNullable<DiagnosisOutcome['fallbackReason']>,
): DiagnosisOutcome {
  if (context.length === 0) {
    return {
      result: {
        queryId,
        diagnosis: INSUFFICIENT_DIAGNOSIS,
        possibleCauses: [],
        requiredParts: [],
        references: [],
      },
      degraded: true,
      fallbackReason,
      context,
    };
  }
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
  const fallback = (reason: NonNullable<DiagnosisOutcome['fallbackReason']>) => {
    const current = options.getCurrentDocuments?.() ?? documents;
    const validContext = context.flatMap((hit) => {
      try {
        bindReferences([{ knowledgeId: hit.knowledgeId }], [hit], current);
        const document = current.find((item) => item.knowledgeId === hit.knowledgeId)!;
        return [{ ...document, score: hit.score }];
      } catch {
        return [];
      }
    });
    return fallbackOutcome(queryId, validContext, reason);
  };

  if (context.length === 0) {
    return {
      result: {
        queryId,
        diagnosis: INSUFFICIENT_DIAGNOSIS,
        possibleCauses: [],
        requiredParts: [],
        references: [],
      },
      degraded: false,
      context,
    };
  }

  let draft: unknown;
  try {
    draft = await adapter.generateDiagnosis(
      symptom,
      context,
      options.motorcycleModel,
      options.mileage,
    );
  } catch (error) {
    const reason =
      error instanceof LLMAdapterError &&
      (error.code === 'timeout' || error.code === 'invalid-json' || error.code === 'http-error')
        ? error.code
        : 'llm-error';
    return fallback(reason);
  }
  if (!isLLMDiagnosisDraft(draft)) {
    return fallback('invalid-structure');
  }

  let references: FaultDiagnosisResult['references'];
  try {
    references = bindReferences(
      draft.references,
      context,
      options.getCurrentDocuments?.() ?? documents,
    );
  } catch {
    return fallback('invalid-reference');
  }

  let requiredParts: FaultDiagnosisResult['requiredParts'];
  try {
    requiredParts = bindRequiredParts(
      draft.requiredParts,
      context,
      options.partsCatalog,
      options.motorcycleModel,
    );
  } catch {
    return fallback('invalid-part');
  }

  const result: FaultDiagnosisResult = {
    queryId,
    diagnosis: draft.diagnosis.trim(),
    possibleCauses: draft.possibleCauses,
    requiredParts,
    references,
  };

  if (!isFaultDiagnosisResult(result)) {
    return fallback('invalid-structure');
  }
  return { result, degraded: false, context };
}
