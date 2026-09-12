import type { Part } from './3d';

/** 可回溯到原始资料的证据片段。 */
export interface SourceReference {
  chunkId: string;
  documentName: string;
  page?: number;
  excerpt: string;
}

/** 配件检索请求；query 可容纳门店人员的自然语言补充。 */
export interface SearchRequest {
  vehicleModelId: string;
  partType: string;
  query?: string;
  limit?: number;
}

/** 单条配件结果必须携带匹配度和依据。 */
export interface PartSearchHit {
  part: Part;
  score: number;
  requiresManualConfirmation: boolean;
  references: SourceReference[];
}

export interface SearchResponse {
  hits: PartSearchHit[];
  elapsedMs: number;
}

/** 故障诊断的输入。 */
export interface FaultDiagnosisRequest {
  vehicleModelId: string;
  symptom: string;
}

export type FaultLikelihood = 'high' | 'medium' | 'low';

/** 诊断原因不可脱离 evidenceChunkIds 指向的证据生成。 */
export interface FaultCause {
  summary: string;
  likelihood: FaultLikelihood;
  evidenceChunkIds: string[];
}

export interface DiagnosisStep {
  order: number;
  instruction: string;
  evidenceChunkIds: string[];
}

/** 完整诊断结果；无可靠资料时 insufficientEvidence 为 true。 */
export interface FaultDiagnosis {
  causes: FaultCause[];
  steps: DiagnosisStep[];
  requiredParts: Part[];
  references: SourceReference[];
  insufficientEvidence: boolean;
  elapsedMs: number;
}
