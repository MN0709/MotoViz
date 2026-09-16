import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';

globalThis.FileReader = class {
  constructor() {
    this.result = null;
    this.onloadend = null;
  }
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      if (this.onloadend) this.onloadend();
    });
  }
};

function material(color, roughness = 0.45, metalness = 0.25) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function roundedBox(name, size, position, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(name, radiusTop, radiusBottom, height, position, rotation, color, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material(color));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createBike() {
  const root = new THREE.Group();
  root.name = 'MotoViz_Generic_Sport_Bike_CC0';
  root.add(cylinder('front_wheel', 0.48, 0.48, 0.18, [1.45, 0.48, 0], [Math.PI / 2, 0, 0], 0x111827));
  root.add(cylinder('rear_wheel', 0.52, 0.52, 0.22, [-1.45, 0.52, 0], [Math.PI / 2, 0, 0], 0x111827));
  root.add(cylinder('front_rim', 0.28, 0.28, 0.2, [1.45, 0.48, 0], [Math.PI / 2, 0, 0], 0x94a3b8));
  root.add(cylinder('rear_rim', 0.31, 0.31, 0.24, [-1.45, 0.52, 0], [Math.PI / 2, 0, 0], 0x94a3b8));
  root.add(roundedBox('main_frame', [2.35, 0.18, 0.22], [0, 1.05, 0], 0x0f172a));
  root.add(roundedBox('lower_fairing', [1.45, 0.34, 0.52], [-0.25, 0.82, 0], 0x2563eb));
  root.add(roundedBox('fuel_tank', [0.92, 0.46, 0.62], [-0.25, 1.33, 0], 0x38bdf8));
  root.add(roundedBox('seat', [0.9, 0.16, 0.48], [-0.95, 1.54, 0], 0x111827));
  root.add(roundedBox('tail', [0.7, 0.24, 0.42], [-1.5, 1.42, 0], 0x1d4ed8));
  root.add(roundedBox('head', [0.48, 0.32, 0.44], [1.2, 1.36, 0], 0x60a5fa));
  root.add(cylinder('handle_bar', 0.035, 0.035, 0.92, [1.25, 1.65, 0], [Math.PI / 2, 0, Math.PI / 2], 0xe5e7eb, 16));
  root.add(cylinder('front_fork_left', 0.035, 0.035, 0.95, [1.28, 0.94, 0.16], [0.25, 0, 0], 0xcbd5e1, 16));
  root.add(cylinder('front_fork_right', 0.035, 0.035, 0.95, [1.28, 0.94, -0.16], [0.25, 0, 0], 0xcbd5e1, 16));
  root.add(cylinder('swing_arm', 0.055, 0.055, 1.15, [-0.9, 0.72, 0], [0, 0, Math.PI / 2.8], 0x64748b, 16));
  root.scale.setScalar(1.25);
  return root;
}

function createExhaust() {
  const root = new THREE.Group();
  root.name = 'MotoViz_Generic_Exhaust_CC0';
  root.add(cylinder('silencer_body', 0.16, 0.2, 1.05, [0, 0, 0], [0, 0, Math.PI / 2], 0xd1d5db, 32));
  root.add(cylinder('black_tip', 0.13, 0.15, 0.2, [0.58, 0, 0], [0, 0, Math.PI / 2], 0x111827, 32));
  root.add(cylinder('connector_pipe', 0.06, 0.06, 0.72, [-0.65, -0.08, 0], [0.35, 0, Math.PI / 2], 0x94a3b8, 16));
  root.scale.setScalar(0.95);
  return root;
}

function createWindshield() {
  const root = new THREE.Group();
  root.name = 'MotoViz_Generic_Windshield_CC0';
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.88), new THREE.MeshPhysicalMaterial({ color: 0x7dd3fc, transmission: 0.35, transparent: true, opacity: 0.45, roughness: 0.08, metalness: 0 }));
  shield.name = 'transparent_shield';
  shield.rotation.z = -0.22;
  shield.castShadow = true;
  root.add(shield);
  root.add(roundedBox('mount_bracket', [0.08, 0.16, 0.96], [-0.08, -0.42, 0], 0x334155));
  return root;
}

function createTopCase() {
  const root = new THREE.Group();
  root.name = 'MotoViz_Generic_Top_Case_CC0';
  root.add(roundedBox('case_body', [0.86, 0.48, 0.62], [0, 0, 0], 0x111827));
  root.add(roundedBox('case_lid', [0.78, 0.12, 0.56], [0, 0.28, 0], 0x334155));
  root.add(roundedBox('reflector', [0.08, 0.18, 0.4], [0.46, 0.04, 0], 0xef4444));
  return root;
}

function exportGlb(scene, file) {
  const exporter = new GLTFExporter();
  exporter.parse(scene, (result) => {
    writeFileSync(file, Buffer.from(result));
  }, (error) => {
    throw error;
  }, { binary: true });
}

exportGlb(createBike(), 'apps/web/public/models/generic-sport-bike.glb');
exportGlb(createExhaust(), 'apps/web/public/models/generic-exhaust.glb');
exportGlb(createWindshield(), 'apps/web/public/models/generic-windshield.glb');
exportGlb(createTopCase(), 'apps/web/public/models/generic-top-case.glb');
