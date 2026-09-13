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
    value.stock === 0 // AI不能生成库存数字，stock必须为0
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

/**
 * LLM 草稿的运行时边界。
 *
 * 产品规则（RAG组长拍板）：
 * - possibleCauses 允许为空：资料不足/非维修问题时，AI可以不给原因，避免编造
 * - references 允许为空：非维修问题没有相关资料，空引用是合理的
 * - requiredParts 允许非空，但 stock 必须为 0：配件推荐有价值，但库存是实时数据，AI不能生成
 * - diagnosis 必须非空
 */
export function isLLMDiagnosisDraft(value: unknown): value is LLMDiagnosisDraft {
  return (
    isRecord(value) &&
    isNonEmptyString(value.diagnosis) &&
    Array.isArray(value.possibleCauses) &&
    value.possibleCauses.every(validPossibleCause) &&
    Array.isArray(value.requiredParts) &&
    value.requiredParts.every(validRequiredPart) &&
    Array.isArray(value.references) &&
    value.references.every(
      (reference) => isRecord(reference) && isNonEmptyString(reference.knowledgeId),
    )
  );
}

/**
 * 最终 API 结构校验。
 * 降级响应允许原因、配件和引用为空（非维修问题/资料不足场景）。
 */
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
