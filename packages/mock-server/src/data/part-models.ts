import type { PartModelRegistration } from '@motorcycle-ai/shared';

/** Mock 中明确支持 3D 挂载的配件；未登记的 partId 不得推断为可挂载。 */
export const partModelRegistrations: PartModelRegistration[] = [
  { partId: 'part-001', modelId: 'model-exhaust-akrapovic' },
  { partId: 'part-002', modelId: 'model-exhaust-yoshimura' },
  { partId: 'part-007', modelId: 'model-windshield-touring' },
  { partId: 'part-012', modelId: 'model-saddlebag-givi' },
  { partId: 'part-013', modelId: 'model-saddlebag-shad' },
];
