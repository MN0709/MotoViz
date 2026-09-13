import type { FaultDiagnosisResult, PossibleCause, RequiredPart } from '@motorcycle-ai/shared';
import type { KnowledgeSearchHit } from './knowledge-search.js';

export interface LLMReferenceDraft {
  knowledgeId: string;
}

export interface LLMDiagnosisDraft {
  diagnosis: string;
  possibleCauses: PossibleCause[];
  requiredParts: RequiredPart[];
  references: LLMReferenceDraft[];
}

export interface LLMAdapter {
  generateDiagnosis(
    symptom: string,
    context: readonly KnowledgeSearchHit[],
    motorcycleModel?: string,
    mileage?: number,
  ): Promise<unknown>;
}

export interface DiagnosisOutcome {
  result: FaultDiagnosisResult;
  degraded: boolean;
  fallbackReason?:
    | 'timeout'
    | 'invalid-json'
    | 'http-error'
    | 'llm-error'
    | 'invalid-structure'
    | 'invalid-reference'
    | 'invalid-part'
    | 'no-context';
  context: KnowledgeSearchHit[];
}
