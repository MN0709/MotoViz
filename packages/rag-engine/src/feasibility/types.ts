import type {
  FaultDiagnosisResult,
  PossibleCause,
  Reference,
  RequiredPart,
} from '@motorcycle-ai/shared';

/** 送给 LLM 的受信知识片段；引用只能从这些片段中选择。 */
export interface KnowledgeSnippet {
  knowledgeId: string;
  title: string;
  sourceType: Reference['sourceType'];
  sourceUrl: string;
  content: string;
}

/** LLM 层输出；degraded 是内部状态，不改变当前 HTTP 契约。 */
export interface DiagnosisGeneration {
  diagnosis: string;
  possibleCauses: PossibleCause[];
  requiredParts: RequiredPart[];
  references: Reference[];
  degraded: boolean;
}

/** 可替换的诊断生成适配器；Mock 和真实 HTTP 模式遵循同一接口。 */
export interface LLMAdapter {
  generateDiagnosis(symptom: string, context: readonly KnowledgeSnippet[]): Promise<DiagnosisGeneration>;
}

/** 将适配器结果包装为正式 API 类型时使用的结构。 */
export type DiagnosisApiPayload = FaultDiagnosisResult;
