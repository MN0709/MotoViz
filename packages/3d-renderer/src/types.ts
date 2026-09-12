/** 生成方案不可用时必须能够切换到预设模型。 */
export type RendererMode = 'generated' | 'preset';

/** 骨架阶段仅约定状态，不包含渲染实现。 */
export interface RendererStatus {
  mode: RendererMode;
  ready: boolean;
  message?: string;
}
