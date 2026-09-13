import type { FaultDiagnosisResult, Reference } from '@motorcycle-ai/shared';
import type { LLMDiagnosisDraft } from './diagnosis-types.js';

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

/** LLM 草稿的运行时边界；正常生成必须给出至少一个原因和一个引用 ID。 */
export function isLLMDiagnosisDraft(value: unknown): value is LLMDiagnosisDraft {
  return (
    isRecord(value) &&
    isNonEmptyString(value.diagnosis) &&
    Array.isArray(value.possibleCauses) &&
    value.possibleCauses.length > 0 &&
    value.possibleCauses.every(validPossibleCause) &&
    Array.isArray(value.requiredParts) &&
    value.requiredParts.length === 0 &&
    Array.isArray(value.references) &&
    value.references.length > 0 &&
    value.references.every(
      (reference) => isRecord(reference) && isNonEmptyString(reference.knowledgeId),
    )
  );
}

/** 最终 API 结构校验；降级响应允许原因和配件为空，但引用仍不得为空。 */
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
    value.references.length > 0 &&
    value.references.every(validReference)
  );
}
