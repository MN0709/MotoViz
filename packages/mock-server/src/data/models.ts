import type { Model3D } from '@motorcycle-ai/shared';

const origin = 'http://localhost:3001';

/** 前端联调使用的预设 GLB 元数据；URL 稳定，暂不承诺模型文件内容。 */
export const models: Model3D[] = [
  {
    modelId: 'model-exhaust-akrapovic',
    name: 'Akrapovič 碳纤维尾段排气',
    partType: 'exhaust',
    modelUrl: `${origin}/mock-assets/models/akrapovic-exhaust.glb`,
    thumbnailUrl: `${origin}/mock-assets/thumbnails/akrapovic-exhaust.webp`,
    format: 'glb',
    scale: { x: 1, y: 1, z: 1 },
    defaultPosition: { x: 0.34, y: 0.48, z: -0.72 },
    defaultRotation: { x: 0, y: -8, z: 4 },
  },
  {
    modelId: 'model-exhaust-yoshimura',
    name: 'Yoshimura R-11 排气',
    partType: 'exhaust',
    modelUrl: `${origin}/mock-assets/models/yoshimura-r11.glb`,
    thumbnailUrl: `${origin}/mock-assets/thumbnails/yoshimura-r11.webp`,
    format: 'glb',
    scale: { x: 1, y: 1, z: 1 },
    defaultPosition: { x: 0.33, y: 0.46, z: -0.69 },
    defaultRotation: { x: 0, y: -7, z: 3 },
  },
  {
    modelId: 'model-windshield-touring',
    name: 'Puig Touring 加高风挡',
    partType: 'windshield',
    modelUrl: `${origin}/mock-assets/models/puig-touring-windshield.glb`,
    thumbnailUrl: `${origin}/mock-assets/thumbnails/puig-touring-windshield.webp`,
    format: 'glb',
    scale: { x: 1, y: 1, z: 1 },
    defaultPosition: { x: 0, y: 1.08, z: 0.55 },
    defaultRotation: { x: -18, y: 0, z: 0 },
  },
  {
    modelId: 'model-saddlebag-givi',
    name: 'GIVI V35N 边箱套装',
    partType: 'saddlebag',
    modelUrl: `${origin}/mock-assets/models/givi-v35n-saddlebags.glb`,
    thumbnailUrl: `${origin}/mock-assets/thumbnails/givi-v35n-saddlebags.webp`,
    format: 'glb',
    scale: { x: 1, y: 1, z: 1 },
    defaultPosition: { x: 0, y: 0.64, z: -0.56 },
    defaultRotation: { x: 0, y: 0, z: 0 },
  },
  {
    modelId: 'model-saddlebag-shad',
    name: 'SHAD SH36 边箱套装',
    partType: 'saddlebag',
    modelUrl: `${origin}/mock-assets/models/shad-sh36-saddlebags.glb`,
    thumbnailUrl: `${origin}/mock-assets/thumbnails/shad-sh36-saddlebags.webp`,
    format: 'glb',
    scale: { x: 1, y: 1, z: 1 },
    defaultPosition: { x: 0, y: 0.62, z: -0.54 },
    defaultRotation: { x: 0, y: 0, z: 0 },
  },
];
