import type { Part } from './3d';

/** 配件匹配检索请求；limit 默认 10，允许范围 1-20。 */
export interface SearchRequest {
  query: string;
  motorcycleModel?: string;
  limit?: number;
}

/** 单条配件检索结果，score 范围为 0-1，越大越相关。 */
export interface SearchResult extends Part {
  score: number;
}

/** 配件检索响应；queryId 用于后续提交结果反馈。 */
export interface SearchResponse {
  queryId: string;
  results: SearchResult[];
  total: number;
}

/** 故障诊断请求；mileage 的单位为公里且不得为负数。 */
export interface FaultDiagnosisRequest {
  symptom: string;
  motorcycleModel?: string;
  mileage?: number;
}

/** 知识来源引用；每条诊断结论都必须能追溯到至少一个引用。 */
export interface Reference {
  title: string;
  sourceType: 'manual' | 'case' | 'catalog';
  excerpt: string;
  url: string;
}

/** 单个可能原因、概率和建议处理方案。probability 范围为 0-1。 */
export interface PossibleCause {
  cause: string;
  probability: number;
  solution: string;
}

/** 故障诊断响应；references 不得为空。 */
export interface FaultDiagnosisResult {
  queryId: string;
  diagnosis: string;
  possibleCauses: PossibleCause[];
  references: Reference[];
}

/** 检索结果反馈请求。 */
export interface FeedbackRequest {
  queryId: string;
  rating: 'up' | 'down';
  comment?: string;
}

/** 反馈提交成功响应。 */
export interface FeedbackResponse {
  success: true;
}

/** 知识库条目详情。 */
export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  sourceType: Reference['sourceType'];
  sourceUrl: string;
  updatedAt: string;
}

/** 兼容旧名称；新代码应优先使用 FaultDiagnosisResult。 */
export type FaultDiagnosis = FaultDiagnosisResult;

/** 兼容旧名称；新代码应优先使用 Reference。 */
export type SourceReference = Reference;
