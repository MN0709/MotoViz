import type { FaultDiagnosisResult, KnowledgeEntry, Reference } from '@motorcycle-ai/shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validReference(value: unknown): value is Reference {
  return (
    isRecord(value) &&
    typeof value.knowledgeId === 'string' &&
    typeof value.title === 'string' &&
    (value.sourceType === 'manual' || value.sourceType === 'fault-case' || value.sourceType === 'part-catalog') &&
    typeof value.excerpt === 'string' &&
    typeof value.url === 'string'
  );
}

/** 运行时验证 FaultDiagnosisResult，防止“能编译”被误当成供应商响应稳定。 */
export function isFaultDiagnosisResult(value: unknown): value is FaultDiagnosisResult {
  if (!isRecord(value)) return false;
  if (typeof value.queryId !== 'string' || typeof value.diagnosis !== 'string') return false;
  if (!Array.isArray(value.possibleCauses) || !Array.isArray(value.requiredParts)) return false;
  if (!Array.isArray(value.references) || value.references.length === 0) return false;
  const causesValid = value.possibleCauses.every(
    (item) =>
      isRecord(item) &&
      typeof item.cause === 'string' &&
      typeof item.solution === 'string' &&
      typeof item.probability === 'number' &&
      item.probability >= 0 &&
      item.probability <= 1,
  );
  const partsValid = value.requiredParts.every(
    (item) =>
      isRecord(item) &&
      typeof item.partId === 'string' &&
      typeof item.name === 'string' &&
      typeof item.brand === 'string' &&
      typeof item.stock === 'number' &&
      Number.isInteger(item.stock) &&
      item.stock >= 0,
  );
  return causesValid && partsValid && value.references.every(validReference);
}

/** 验证知识详情 API 的返回结构。 */
export function isKnowledgeEntry(value: unknown): value is KnowledgeEntry {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.content === 'string' &&
    (value.sourceType === 'manual' || value.sourceType === 'fault-case' || value.sourceType === 'part-catalog') &&
    typeof value.sourceUrl === 'string' &&
    typeof value.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(value.updatedAt))
  );
}
