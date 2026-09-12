/** HTTP API 是主模式；关键词模式是外部 AI 服务不可用时的降级。 */
export type RagMode = 'http-api' | 'keyword-fallback';

/** 骨架阶段仅约定健康状态，不包含检索实现。 */
export interface RagHealth {
  mode: RagMode;
  ready: boolean;
  indexedDocuments: number;
}
