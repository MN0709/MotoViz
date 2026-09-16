import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './App.css';

type AssetStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';
type DisplayMode = 'verified' | 'preset' | 'unsupported';
type Axis = 'x' | 'y' | 'z';

interface TransformConfig {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

interface DemoPart {
  partId: string;
  modelId?: string;
  name: string;
  type: string;
  useCase: string;
  fitModels: string[];
  thumbnailUrl: string;
  modelUrl?: string;
  mountPointId?: string;
  displayMode: DisplayMode;
  transform: TransformConfig;
  reason: string;
}

const STORAGE_KEY = 'motoviz.mount-adjustments.v2';

const VEHICLE = {
  vehicleModelId: 'vehicle-demo-generic-sport',
  displayName: '通用运动街跑 Demo 车架',
  year: 'P0 技术切片',
  modelUrl: '/models/generic-sport-bike.glb',
  license: '本地生成无品牌 GLB，见 docs/demo-model-license.md',
};

const PARTS: DemoPart[] = [
  {
    partId: 'demo-part-exhaust-compact',
    modelId: 'preset-exhaust-compact',
    name: 'Compact exhaust 预设排气',
    type: '排气',
    useCase: '验证 F08 首件 exhaust-compact.glb 在 F05 实际场景中的加载、旋转缩放和预设示意标注。',
    fitModels: [VEHICLE.displayName],
    thumbnailUrl: '2D 图片位：后续接 RAG thumbnailUrl',
    modelUrl: '/models/presets/exhaust-compact.glb',
    mountPointId: 'rear-right-exhaust',
    displayMode: 'preset',
    transform: { position: [-1.02, 0.92, -0.62], rotation: [0, 0.08, -0.12], scale: 1 },
    reason: '来自 PR #29 的 F08 通用预设 GLB，MIT 许可，只作为预设效果示意。',
  },
  {
    partId: 'demo-part-exhaust-long',
    modelId: 'preset-exhaust-long',
    name: 'Long exhaust 预设排气',
    type: '排气',
    useCase: '验证同一配件类型下第二个预设排气模型的加载与切换。',
    fitModels: [VEHICLE.displayName],
    thumbnailUrl: '2D 图片位：后续接 RAG thumbnailUrl',
    modelUrl: '/models/presets/exhaust-long.glb',
    mountPointId: 'rear-right-exhaust-alt',
    displayMode: 'preset',
    transform: { position: [-1.12, 0.86, -0.68], rotation: [0, 0.1, -0.08], scale: 1 },
    reason: '来自 PR #29 的 F08 通用预设 GLB，用于展示同类型预设切换，不代表具体商品。',
  },
  {
    partId: 'demo-part-windshield-short',
    modelId: 'preset-windshield-short',
    name: 'Short windshield 预设风挡',
    type: '风挡',
    useCase: '验证车头区域短风挡预设模型加载和透明/薄片类配件展示。',
    fitModels: [VEHICLE.displayName],
    thumbnailUrl: '2D 图片位：后续接 RAG thumbnailUrl',
    modelUrl: '/models/presets/windshield-short.glb',
    mountPointId: 'front-cockpit-shield-short',
    displayMode: 'preset',
    transform: { position: [1.72, 1.82, 0], rotation: [0, 0, -0.28], scale: 1 },
    reason: '来自 PR #29 的 F08 通用预设 GLB，只能标注为预设效果示意。',
  },
  {
    partId: 'demo-part-windshield-touring',
    modelId: 'preset-windshield-touring',
    name: 'Touring windshield 预设风挡',
    type: '风挡',
    useCase: '验证更大风挡模型在同一 3D 场景中的加载、对比和微调。',
    fitModels: [VEHICLE.displayName],
    thumbnailUrl: '2D 图片位：后续接 RAG thumbnailUrl',
    modelUrl: '/models/presets/windshield-touring.glb',
    mountPointId: 'front-cockpit-shield-touring',
    displayMode: 'preset',
    transform: { position: [1.76, 1.9, 0], rotation: [0, 0, -0.26], scale: 1 },
    reason: '来自 PR #29 的 F08 通用预设 GLB，用于预设模型降级展示。',
  },
  {
    partId: 'demo-part-saddlebag-compact',
    modelId: 'preset-saddlebag-compact',
    name: 'Compact saddlebag 预设边箱',
    type: '边箱',
    useCase: '验证车身侧后方边箱类配件的预设展示和挂载微调。',
    fitModels: [VEHICLE.displayName],
    thumbnailUrl: '2D 图片位：后续接 RAG thumbnailUrl',
    modelUrl: '/models/presets/saddlebag-compact.glb',
    mountPointId: 'rear-left-saddlebag',
    displayMode: 'preset',
    transform: { position: [-1.66, 1.1, 0.58], rotation: [0, -0.05, 0], scale: 1 },
    reason: '来自 PR #29 的 F08 通用预设 GLB，不绑定具体车型或 SKU。',
  },
  {
    partId: 'demo-part-saddlebag-large',
    modelId: 'preset-saddlebag-large',
    name: 'Large saddlebag 预设边箱',
    type: '边箱',
    useCase: '验证更大边箱预设模型的加载和展示位调整。',
    fitModels: [VEHICLE.displayName],
    thumbnailUrl: '2D 图片位：后续接 RAG thumbnailUrl',
    modelUrl: '/models/presets/saddlebag-large.glb',
    mountPointId: 'rear-right-saddlebag',
    displayMode: 'preset',
    transform: { position: [-1.66, 1.08, -0.62], rotation: [0, 0.05, 0], scale: 1 },
    reason: '来自 PR #29 的 F08 通用预设 GLB，用于本地联调完整预设库展示。',
  },
  {
    partId: 'rag-only-unknown',
    name: 'RAG 检索到但未支持 3D 的配件',
    type: '待定',
    useCase: '验证“只展示信息，禁用挂载”的产品规则。',
    fitModels: ['春风 / CFMOTO 450SR 2025 普通版'],
    thumbnailUrl: 'RAG 2D 图片，不是 GLB',
    displayMode: 'unsupported',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    reason: '没有 partId → modelId 登记和真实可加载 GLB，所以不能开启 3D 挂载。',
  },
];

const ENABLED_PARTS = PARTS.filter((part) => part.type !== '边箱');
const ENABLED_PRESET_COUNT = ENABLED_PARTS.filter((part) => part.displayMode === 'preset').length;

function cloneTransform(transform: TransformConfig): TransformConfig {
  return {
    position: [...transform.position] as [number, number, number],
    rotation: [...transform.rotation] as [number, number, number],
    scale: transform.scale,
  };
}

function getStoredTransforms(): Record<string, TransformConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredTransforms(value: Record<string, TransformConfig>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Local storage can be unavailable in privacy modes; the page should still work.
  }
}

function applyTransform(object: THREE.Object3D, transform: TransformConfig) {
  object.position.set(...transform.position);
  object.rotation.set(...transform.rotation);
  object.scale.setScalar(transform.scale);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function statusText(status: AssetStatus) {
  const map: Record<AssetStatus, string> = {
    idle: '等待加载',
    loading: '正在加载 GLB',
    ready: 'GLB 已加载',
    error: '加载失败，已显示降级提示',
    unsupported: 'WebGL 不可用',
  };
  return map[status];
}

export function App() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const vehicleRef = useRef<THREE.Object3D | null>(null);
  const mountedRefs = useRef<Record<string, THREE.Object3D>>({});
  const frameRef = useRef<number | null>(null);
  const loaderRef = useRef(new GLTFLoader());
  const [selectedId, setSelectedId] = useState(PARTS[0].partId);
  const [mountedIds, setMountedIds] = useState<string[]>(['demo-part-exhaust-compact']);
  const [assetStatus, setAssetStatus] = useState<AssetStatus>('idle');
  const [message, setMessage] = useState('准备加载本地通用 GLB 模型。');
  const [lowPower, setLowPower] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [transforms, setTransforms] = useState<Record<string, TransformConfig>>(() => getStoredTransforms());

  const selectedPart = useMemo(() => PARTS.find((part) => part.partId === selectedId) ?? PARTS[0], [selectedId]);

  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;

    if (!window.WebGLRenderingContext) {
      setAssetStatus('unsupported');
      setMessage('当前浏览器不支持 WebGL，无法展示 3D 画布。');
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f7fb);
    scene.fog = new THREE.Fog(0xf5f7fb, 7, 16);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.1, 100);
    camera.position.set(4.3, 3, 5.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: false, powerPreference: lowPower ? 'low-power' : 'high-performance' });
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setPixelRatio(lowPower ? 1 : Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = !lowPower;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.85;
    controls.target.set(0, 1, 0);
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa5b1, 1.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(4, 6, 5);
    keyLight.castShadow = !lowPower;
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x38bdf8, 2.4, 8);
    rimLight.position.set(-3, 2.6, -3);
    scene.add(rimLight);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.8, 80), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.82, metalness: 0.05 }));
    floor.name = 'showroom_floor';
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(7.2, 18, 0x93c5fd, 0xcbd5e1);
    grid.position.y = 0.01;
    scene.add(grid);

    setAssetStatus('loading');
    setMessage('正在加载通用车型 GLB。');
    loaderRef.current.load(
      VEHICLE.modelUrl,
      (gltf) => {
        const vehicle = gltf.scene;
        vehicle.name = VEHICLE.vehicleModelId;
        vehicle.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(vehicle);
        vehicleRef.current = vehicle;
        setAssetStatus('ready');
        setMessage('车型 GLB 已加载，可旋转、缩放、平移。');
      },
      undefined,
      () => {
        setAssetStatus('error');
        setMessage('车型 GLB 加载失败：页面保留错误提示和降级状态。');
      },
    );

    const resize = () => {
      if (!canvasRef.current || !cameraRef.current || !rendererRef.current) return;
      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', resize);
    const animate = () => {
      controls.autoRotate = autoRotate;
      controls.update();
      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      scene.clear();
      mountedRefs.current = {};
      vehicleRef.current = null;
    };
  }, [autoRotate, lowPower]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !vehicleRef.current) return;

    Object.entries(mountedRefs.current).forEach(([partId, object]) => {
      if (!mountedIds.includes(partId)) {
        scene.remove(object);
        delete mountedRefs.current[partId];
      }
    });

    mountedIds.forEach((partId) => {
      const part = PARTS.find((item) => item.partId === partId);
      if (!part?.modelUrl || part.displayMode === 'unsupported' || mountedRefs.current[partId]) return;

      setMessage(`正在加载配件 GLB：${part.name}`);
      loaderRef.current.load(
        part.modelUrl,
        (gltf) => {
          const object = gltf.scene;
          object.name = part.modelId ?? part.partId;
          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          applyTransform(object, transforms[part.partId] ?? part.transform);
          mountedRefs.current[partId] = object;
          scene.add(object);
          setMessage(`${part.name} 已加载。当前展示为预设效果示意。`);
        },
        undefined,
        () => {
          setAssetStatus('error');
          setMessage(`${part.name} GLB 加载失败，页面已保留失败反馈。`);
        },
      );
    });
  }, [mountedIds, transforms]);

  const updateSelectedTransform = (kind: 'position' | 'rotation', axis: Axis, delta: number) => {
    if (selectedPart.displayMode === 'unsupported') return;
    const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const current = cloneTransform(transforms[selectedPart.partId] ?? selectedPart.transform);
    const nextValue = current[kind][axisIndex] + delta;
    current[kind][axisIndex] = kind === 'position' ? clamp(nextValue, -3, 3) : clamp(nextValue, -Math.PI / 4, Math.PI / 4);
    const next = { ...transforms, [selectedPart.partId]: current };
    setTransforms(next);
    saveStoredTransforms(next);
    const object = mountedRefs.current[selectedPart.partId];
    if (object) applyTransform(object, current);
  };

  const updateScale = (delta: number) => {
    if (selectedPart.displayMode === 'unsupported') return;
    const current = cloneTransform(transforms[selectedPart.partId] ?? selectedPart.transform);
    current.scale = clamp(current.scale + delta, 0.5, 1.5);
    const next = { ...transforms, [selectedPart.partId]: current };
    setTransforms(next);
    saveStoredTransforms(next);
    const object = mountedRefs.current[selectedPart.partId];
    if (object) applyTransform(object, current);
  };

  const toggleMount = (part: DemoPart) => {
    setSelectedId(part.partId);
    if (part.displayMode === 'unsupported') {
      setMessage('该配件没有 3D 模型登记，只展示信息并禁用挂载。');
      return;
    }
    setMountedIds((current) => current.includes(part.partId) ? current.filter((id) => id !== part.partId) : [...current, part.partId]);
  };

  const resetView = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(4.3, 3, 5.2);
    controlsRef.current.target.set(0, 1, 0);
    controlsRef.current.update();
  };

  const resetTransform = () => {
    const next = { ...transforms };
    delete next[selectedPart.partId];
    setTransforms(next);
    saveStoredTransforms(next);
    const object = mountedRefs.current[selectedPart.partId];
    if (object) applyTransform(object, selectedPart.transform);
  };

  const selectedTransform = transforms[selectedPart.partId] ?? selectedPart.transform;
  const canMount = selectedPart.displayMode !== 'unsupported';
  const isMounted = mountedIds.includes(selectedPart.partId);

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">MotoViz / Visualize</p>
          <h1>把改装方案拖进 3D 工作台</h1>
          <p className="hero-copy">把车型、配件信息和 3D 挂载放在同一个工作台里。当前按 #20 范围只启用排气与风挡，先验证 GLB 加载、旋转缩放、预设示意和暂不支持 3D 的产品口径。</p>
        </div>
        <div className="status-card">
          <span>{statusText(assetStatus)}</span>
          <strong>{mountedIds.length}/{ENABLED_PRESET_COUNT}</strong>
          <small>已挂载启用预设</small>
        </div>
      </section>

      <section className="workspace-grid">
        <aside className="parts-panel">
          <div className="panel-heading">
            <span>配件结果</span>
            <b>方案 A 口径</b>
          </div>
          {ENABLED_PARTS.map((part) => (
            <button key={part.partId} className={`part-card ${selectedId === part.partId ? 'active' : ''}`} onClick={() => setSelectedId(part.partId)}>
              <span className={`mode-dot ${part.displayMode}`} />
              <strong>{part.name}</strong>
              <small>{part.type} · {part.displayMode === 'unsupported' ? '暂不支持 3D' : '预设效果示意'}</small>
            </button>
          ))}
        </aside>

        <section className="viewer-panel">
          <div className="viewer-toolbar">
            <div>
              <b>{VEHICLE.displayName}</b>
              <span>{VEHICLE.year}</span>
            </div>
            <div className="toolbar-actions">
              <button onClick={() => setAutoRotate((value) => !value)}>{autoRotate ? '关闭自转' : '开启自转'}</button>
              <button onClick={resetView}>重置视角</button>
              <button onClick={() => setLowPower((value) => !value)}>{lowPower ? '标准画质' : '低性能模式'}</button>
            </div>
          </div>
          <div ref={canvasRef} className="viewer-canvas" />
          <p className={`runtime-message ${assetStatus}`}>{message}</p>
        </section>

        <aside className="detail-panel">
          <div className="panel-heading">
            <span>配件详情</span>
            <b>{selectedPart.partId}</b>
          </div>
          <h2>{selectedPart.name}</h2>
          <p>{selectedPart.useCase}</p>
          <dl>
            <dt>展示状态</dt>
            <dd>{selectedPart.displayMode === 'unsupported' ? '暂不支持 3D，禁用挂载' : '预设效果示意，不冒充真实产品'}</dd>
            <dt>RAG 图片</dt>
            <dd>{selectedPart.thumbnailUrl}</dd>
            <dt>模型映射</dt>
            <dd>{selectedPart.modelId ?? '无 partId → modelId 登记'}</dd>
            <dt>挂载点</dt>
            <dd>{selectedPart.mountPointId ?? '无挂载点'}</dd>
          </dl>
          <button className="primary-action" disabled={!canMount} onClick={() => toggleMount(selectedPart)}>{!canMount ? '暂不支持 3D 挂载' : isMounted ? '拆下配件' : '安装配件'}</button>
          <div className="adjust-panel">
            <div className="panel-heading compact">
              <span>挂载微调</span>
              <button onClick={resetTransform} disabled={!canMount}>恢复默认</button>
            </div>
            {(['x', 'y', 'z'] as Axis[]).map((axis, index) => (
              <div className="adjust-row" key={axis}>
                <span>{axis.toUpperCase()} 位移 {selectedTransform.position[index].toFixed(2)}</span>
                <button disabled={!canMount} onClick={() => updateSelectedTransform('position', axis, -0.05)}>-</button>
                <button disabled={!canMount} onClick={() => updateSelectedTransform('position', axis, 0.05)}>+</button>
              </div>
            ))}
            {(['x', 'y', 'z'] as Axis[]).map((axis, index) => (
              <div className="adjust-row" key={`r-${axis}`}>
                <span>{axis.toUpperCase()} 旋转 {Math.round(selectedTransform.rotation[index] * 180 / Math.PI)}°</span>
                <button disabled={!canMount} onClick={() => updateSelectedTransform('rotation', axis, -0.05)}>-</button>
                <button disabled={!canMount} onClick={() => updateSelectedTransform('rotation', axis, 0.05)}>+</button>
              </div>
            ))}
            <div className="adjust-row">
              <span>缩放 {selectedTransform.scale.toFixed(2)}</span>
              <button disabled={!canMount} onClick={() => updateScale(-0.05)}>-</button>
              <button disabled={!canMount} onClick={() => updateScale(0.05)}>+</button>
            </div>
          </div>
        </aside>
      </section>

      <section className="handoff-panel">
        <div>
          <b>当前可交付说明</b>
          <p>当前页面只启用 2 件排气和 2 件风挡通用无品牌模型；边箱资产仅保留为储备，不进入用户页面、演示和本期验收。</p>
        </div>
        <div>
          <b>下一步依赖</b>
          <p>A 提供具体配件数据，C 提供真实 GLB 和挂载配置，#20 确认生产托管路径，首页终稿后统一视觉。</p>
        </div>
      </section>
    </main>
  );
}
