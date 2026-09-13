/** MotoFit AI 当前支持的配件分类，也是 3D 与 RAG 之间的稳定枚举。 */
export type PartType = 'exhaust' | 'windshield' | 'saddlebag' | 'other';

/** 3D 文件格式；MVP 接口统一交付二进制 GLB。 */
export type Model3DFormat = 'glb';

/** 三维向量。位置和缩放使用米制场景坐标，旋转使用角度。 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** 上传文件的元数据；实际二进制内容通过 multipart/form-data 传输。 */
export interface UploadFileMetadata {
  filename: string;
  mimeType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
}

/** 图片上传请求经 multipart 解析后的逻辑结构。 */
export interface UploadRequest {
  images: UploadFileMetadata[];
}

/** 上传任务状态。 */
export type UploadStatus = 'processing' | 'done' | 'failed';

/** 图片上传接口响应。 */
export interface UploadResponse {
  uploadId: string;
  status: UploadStatus;
}

/** 拍照转 3D 请求。 */
export interface GenerateRequest {
  uploadId: string;
  partType: PartType;
}

/** 生成成功或使用预设模型降级时的响应。 */
export interface GenerateResponse {
  modelId: string;
  modelUrl: string;
  format: Model3DFormat;
  status: 'success' | 'fallback';
}

/** 前端加载和挂载一个 3D 配件模型所需的完整信息。 */
export interface Model3D {
  modelId: string;
  name: string;
  partType: PartType;
  modelUrl: string;
  thumbnailUrl: string;
  format: Model3DFormat;
  scale: Vector3;
  defaultPosition: Vector3;
  defaultRotation: Vector3;
}

/** 配件主数据；由 3D 展示和 RAG 检索共同使用。 */
export interface Part {
  partId: string;
  name: string;
  brand: string;
  partType: PartType;
  fitModels: string[];
  price: number;
  source: string;
  sourceUrl: string;
  thumbnailUrl: string;
}

/** 可展示的车型，是装配场景的主体。 */
export interface VehicleModel {
  id: string;
  brand: string;
  name: string;
  year: number;
  modelUrl: string;
}

/** 车型上的配件挂载规则。 */
export interface MountPoint {
  id: string;
  vehicleModelId: string;
  partType: PartType;
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
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
