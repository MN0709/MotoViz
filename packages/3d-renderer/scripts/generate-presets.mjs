import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// GLTFExporter uses the browser FileReader API when assembling a binary GLB.
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
};

const destination = new URL('../assets/presets/', import.meta.url);
await mkdir(destination, { recursive: true });
const metal = new THREE.MeshStandardMaterial({ color: 0x87949c, metalness: 0.8, roughness: 0.3 });
const dark = new THREE.MeshStandardMaterial({ color: 0x252a2c, metalness: 0.3, roughness: 0.6 });
const glass = new THREE.MeshStandardMaterial({
  color: 0x799eac,
  metalness: 0.1,
  roughness: 0.24,
  side: THREE.DoubleSide,
});
const red = new THREE.MeshStandardMaterial({ color: 0xad252e, roughness: 0.35 });

function add(group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(position);
  mesh.rotation.set(...rotation);
  group.add(mesh);
  return mesh;
}

function exhaust(length, radius) {
  const group = new THREE.Group();
  add(
    group,
    new THREE.CylinderGeometry(radius, radius * 0.85, length, 32),
    metal,
    [0, 0, 0],
    [Math.PI / 2, 0, 0],
  );
  for (const z of [-length / 2, length / 2]) {
    add(group, new THREE.TorusGeometry(radius * 0.85, 0.008, 8, 32), dark, [0, 0, z]);
    add(
      group,
      new THREE.CircleGeometry(radius * 0.65, 32),
      dark,
      [0, 0, z + Math.sign(z) * 0.001],
      [0, z < 0 ? Math.PI : 0, 0],
    );
  }
  for (const z of [-length * 0.27, length * 0.27]) {
    add(group, new THREE.TorusGeometry(radius * 1.01, 0.006, 8, 32), dark, [0, 0, z]);
  }
  add(group, new THREE.BoxGeometry(0.025, 0.055, 0.045), metal, [0, radius + 0.018, 0]);
  return group;
}

function windshield(width, height) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.38, 0);
  shape.lineTo(-width / 2, height * 0.5);
  shape.quadraticCurveTo(-width * 0.45, height, 0, height);
  shape.quadraticCurveTo(width * 0.45, height, width / 2, height * 0.5);
  shape.lineTo(width * 0.38, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.004,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometry.translate(0, -height / 2, 0);
  add(group, geometry, glass);
  for (const x of [-width * 0.27, width * 0.27]) {
    add(
      group,
      new THREE.CylinderGeometry(0.007, 0.007, 0.008, 12),
      metal,
      [x, -height * 0.33, 0.006],
      [Math.PI / 2, 0, 0],
    );
  }
  return group;
}

function saddlebag(width, height, depth) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  const r = 0.03;
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  add(group, geometry, dark);
  add(group, new THREE.BoxGeometry(width * 0.6, 0.018, 0.01), red, [
    0,
    -height * 0.22,
    depth / 2 + 0.006,
  ]);
  add(group, new THREE.BoxGeometry(width * 0.35, 0.026, 0.03), metal, [0, height / 2 + 0.013, 0]);
  add(group, new THREE.BoxGeometry(0.025, 0.025, 0.012), metal, [
    0,
    height * 0.25,
    depth / 2 + 0.006,
  ]);
  return group;
}

const candidates = [
  ['exhaust-compact', 'Compact exhaust', 'exhaust', exhaust(0.32, 0.055)],
  ['exhaust-long', 'Long exhaust', 'exhaust', exhaust(0.46, 0.065)],
  ['windshield-short', 'Short windshield', 'windshield', windshield(0.3, 0.3)],
  ['windshield-touring', 'Touring windshield', 'windshield', windshield(0.36, 0.46)],
  ['saddlebag-compact', 'Compact saddlebag', 'saddlebag', saddlebag(0.36, 0.28, 0.2)],
  ['saddlebag-large', 'Large saddlebag', 'saddlebag', saddlebag(0.46, 0.35, 0.25)],
];
const manifest = [];
for (const [id, name, partType, group] of candidates) {
  group.name = `preset-${id}`;
  const scene = new THREE.Scene();
  scene.add(group);
  const binary = Buffer.from(await new GLTFExporter().parseAsync(scene, { binary: true }));
  await writeFile(new URL(`${id}.glb`, destination), binary);
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  manifest.push({
    modelId: group.name,
    name,
    partType,
    file: `${id}.glb`,
    format: 'glb',
    sizeBytes: binary.length,
    sha256: createHash('sha256').update(binary).digest('hex'),
    dimensionsMeters: { x: size.x, y: size.y, z: size.z },
    defaultPosition: { x: 0, y: 0, z: 0 },
    defaultRotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    source: 'Procedural geometry from scripts/generate-presets.mjs',
    license: 'MIT (see LICENSE.txt)',
    usage: 'Generic preset illustration; no product or vehicle compatibility claim',
  });
}
await writeFile(new URL('manifest.json', destination), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Generated ${manifest.length} presets (${manifest.reduce((sum, item) => sum + item.sizeBytes, 0)} bytes)`,
);
