/** 3D 文件格式；MVP 交付统一使用 GLB。 */
export type Model3DFormat = 'glb';

/** 可展示的车型，是装配场景的主体。 */
export interface VehicleModel {
  id: string;
  brand: string;
  name: string;
  year: number;
  modelUrl: string;
}

/** 配件类别用于检索匹配和挂载点选择。 */
export type PartType = 'exhaust' | 'windscreen' | 'side-case' | 'mirror' | 'handlebar' | 'other';

/** 三轴坐标，单位由具体字段注释限定。 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** 车型上的配件挂载规则。rotation 使用角度，position 使用米。 */
export interface MountPoint {
  id: string;
  vehicleModelId: string;
  partType: PartType;
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
}

/** 可加载的 3D 模型及用于比例校验的包围盒信息。 */
export interface Model3D {
  id: string;
  url: string;
  format: Model3DFormat;
  vertexCount: number;
  boundingBoxMeters: Vector3;
  source: 'generated' | 'preset';
}

/** 配件主数据，由 3D 展示和 RAG 检索共同使用。 */
export interface Part {
  id: string;
  brand: string;
  model: string;
  type: PartType;
  compatibleVehicleIds: string[];
  dimensionsMeters?: Vector3;
  stockQuantity: number;
  referencePriceCny: number;
  model3D?: Model3D;
}

/** 已保存的单个配件装配参数。 */
export interface MountedPart {
  partId: string;
  mountPointId: string;
  positionOffset: Vector3;
  rotationOffset: Vector3;
  scale: Vector3;
}

/** 可持久化并重新打开的改装场景状态。 */
export interface SceneState {
  id: string;
  vehicleModelId: string;
  mountedParts: MountedPart[];
  updatedAt: string;
}
