import type { FaultDiagnosisResult, Reference } from '@motorcycle-ai/shared';
import type { LLMDiagnosisDraft } from './diagnosis-types.js';
import { INSUFFICIENT_DIAGNOSIS, UNSUPPORTED_DIAGNOSIS } from './prompts.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validPossibleCause(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.cause) &&
    typeof value.probability === 'number' &&
    Number.isFinite(value.probability) &&
    value.probability >= 0 &&
    value.probability <= 1 &&
    isNonEmptyString(value.solution)
  );
}

function validRequiredPart(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.partId) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.brand) &&
    typeof value.stock === 'number' &&
    Number.isInteger(value.stock) &&
    value.stock >= 0
  );
}

function validRequiredPartDraft(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.partId);
}

function validReferenceDraft(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.knowledgeId);
}

function validReference(value: unknown): value is Reference {
  return (
    isRecord(value) &&
    isNonEmptyString(value.knowledgeId) &&
    isNonEmptyString(value.title) &&
    (value.sourceType === 'manual' ||
      value.sourceType === 'fault-case' ||
      value.sourceType === 'part-catalog') &&
    isNonEmptyString(value.excerpt) &&
    isNonEmptyString(value.url)
  );
}

/** LLM 草稿边界：正常诊断需证据；两种正式安全响应允许空原因/空引用。 */
export function isLLMDiagnosisDraft(value: unknown): value is LLMDiagnosisDraft {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.diagnosis) ||
    !Array.isArray(value.possibleCauses) ||
    !value.possibleCauses.every(validPossibleCause) ||
    !Array.isArray(value.requiredParts) ||
    !value.requiredParts.every(validRequiredPartDraft) ||
    !Array.isArray(value.references) ||
    !value.references.every(validReferenceDraft)
  ) {
    return false;
  }

  if (value.diagnosis === UNSUPPORTED_DIAGNOSIS) {
    return (
      value.possibleCauses.length === 0 &&
      value.requiredParts.length === 0 &&
      value.references.length === 0
    );
  }
  if (value.diagnosis === INSUFFICIENT_DIAGNOSIS) {
    return (
      value.possibleCauses.length === 0 &&
      value.requiredParts.length === 0 &&
      value.references.length <= 2
    );
  }
  return (
    value.possibleCauses.length > 0 &&
    value.possibleCauses.length <= 3 &&
    value.references.length > 0 &&
    value.references.length <= 5
  );
}

/** 最终 API 结构校验；按 RC5，知识库无相关案例时 references 允许为空。 */
export function isFaultDiagnosisResult(value: unknown): value is FaultDiagnosisResult {
  return (
    isRecord(value) &&
    isNonEmptyString(value.queryId) &&
    isNonEmptyString(value.diagnosis) &&
    Array.isArray(value.possibleCauses) &&
    value.possibleCauses.every(validPossibleCause) &&
    Array.isArray(value.requiredParts) &&
    value.requiredParts.every(validRequiredPart) &&
    Array.isArray(value.references) &&
    value.references.every(validReference)
  );
}
