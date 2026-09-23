/** 三车型 MVP 的本地联调草案。冻结前不得复制进 packages/shared。 */
export type VehicleId =
  | 'kawasaki-ninja-zx25r-demo-pending'
  | 'aprilia-rs660-2021-demo'
  | 'aprilia-rsv4r-2010-demo';

export type SlotKey =
  | 'mirror_left' | 'mirror_right' | 'windscreen' | 'front_cowl'
  | 'front_fender' | 'seat' | 'seat_rear' | 'tank' | 'tail'
  | 'tail_left' | 'tail_right' | 'fairing_left' | 'fairing_right'
  | 'lower_cowl' | 'front_wheel' | 'rear_wheel' | 'muffler'
  | 'license_bracket';

export interface Vector3 { x: number; y: number; z: number }
export interface Transform3D { position: Vector3; rotation: Vector3; scale: Vector3 }

export interface VehicleSlot {
  slotKey: SlotKey;
  slotId: string;
  label: string;
  /** GLB 内实际节点名，由 3D 组保证存在。 */
  groupNode: string;
  replaceable: boolean;
  mount: Transform3D;
  explodeOffset: [number, number, number];
  replacementPolicy: {
    fitMode: 'bounds';
    manualCalibration: true;
    reason: string;
  };
}

export interface VehicleTemplate {
  vehicleId: VehicleId;
  templateId: string;
  templateVersion: string;
  displayName: string;
  identityStatus: 'pending' | 'filename-only' | 'verified';
  unitStatus: 'uncalibrated' | 'approximate-meter-from-model-bounds' | 'verified-meter';
  modelUrl: string;
  defaultSlotKey: SlotKey;
  slots: VehicleSlot[];
}

/** RAG/资产层给前端的换件指令；渲染层按四个主键定位。 */
export interface ReplacementBinding {
  vehicleId: VehicleId;
  templateVersion: string;
  slotKey: SlotKey;
  assetId: string;
  modelUrl: string;
  transform?: Partial<Transform3D>;
}

/** 前端只调用这一层，不直接按模型内部 mesh 名称查找。 */
export interface MotoVizRendererApi {
  listVehicles(): VehicleTemplate[];
  switchVehicle(vehicleId: VehicleId): Promise<void>;
  selectSlot(slotKey: SlotKey): void;
  replacePart(binding: ReplacementBinding): Promise<void>;
  restorePart(slotKey: SlotKey): void;
  setExplode(percent: number): void;
  resetVehicle(): void;
}
