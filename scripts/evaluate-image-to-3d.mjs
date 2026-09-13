#!/usr/bin/env node

/**
 * F02 research-only smoke test for the public TripoSR Gradio demo.
 * Inputs and generated models stay in a temporary directory by default.
 * This is not the production API adapter and the public demo has no SLA.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';

const endpoint = (process.env.MOTOFIT_3D_DEMO_URL ?? 'https://stabilityai-triposr.hf.space').replace(/\/$/, '');
const outputDir = process.env.MOTOFIT_3D_EVAL_DIR ?? join(tmpdir(), 'motofit-3d-evaluation');
const imagePaths = process.argv.slice(2);

function elapsed(start) {
  return Math.round(performance.now() - start);
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response;
}

async function uploadImage(imagePath) {
  const bytes = await readFile(imagePath);
  const extension = extname(imagePath).toLowerCase();
  const mimeType = extension === '.png' ? 'image/png' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : null;
  if (!mimeType) throw new Error(`Only PNG/JPEG images are supported: ${imagePath}`);
  const form = new FormData();
  form.append('files', new Blob([bytes], { type: mimeType }), basename(imagePath));
  const paths = await (await request(`${endpoint}/upload`, { method: 'POST', body: form })).json();
  if (!Array.isArray(paths) || typeof paths[0] !== 'string') throw new Error('Demo upload did not return a file path');
  return { path: paths[0], meta: { _type: 'gradio.FileData' } };
}

async function callDemo(name, data) {
  const submitted = await (await request(`${endpoint}/call/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })).json();
  if (typeof submitted.event_id !== 'string') throw new Error(`${name} did not return an event ID`);
  const events = await (await request(`${endpoint}/call/${name}/${submitted.event_id}`)).text();
  const complete = events.match(/event: complete\s*data: ([^\n]+)/);
  if (!complete) throw new Error(`${name} did not complete: ${events.slice(-500)}`);
  return JSON.parse(complete[1]);
}

function inspectGlb(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Not a binary glTF file');
  const version = bytes.readUInt32LE(4);
  const declaredSize = bytes.readUInt32LE(8);
  if (version !== 2 || declaredSize !== bytes.length || bytes.toString('ascii', 16, 20) !== 'JSON') {
    throw new Error('Invalid GLB header or JSON chunk');
  }
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const positions = (gltf.meshes ?? []).flatMap((mesh) => mesh.primitives ?? [])
    .map((primitive) => gltf.accessors?.[primitive.attributes?.POSITION])
    .filter(Boolean);
  const boundsAvailable = positions.length > 0 && positions.every((accessor) =>
    Array.isArray(accessor.min) && Array.isArray(accessor.max) && accessor.min.length === 3 && accessor.max.length === 3);
  const min = boundsAvailable ? [0, 1, 2].map((axis) => Math.min(...positions.map((accessor) => accessor.min[axis]))) : null;
  const max = boundsAvailable ? [0, 1, 2].map((axis) => Math.max(...positions.map((accessor) => accessor.max[axis]))) : null;
  return {
    validGlb: true,
    bytes: bytes.length,
    meshCount: gltf.meshes?.length ?? 0,
    vertexCount: positions.reduce((sum, accessor) => sum + accessor.count, 0),
    bounds: min && max ? { min, max, size: max.map((value, axis) => value - min[axis]) } : null,
  };
}

async function evaluate(imagePath) {
  const start = performance.now();
  const upload = await uploadImage(imagePath);
  const uploadMs = elapsed(start);
  const processed = await callDemo('preprocess', [upload, true, 0.85]);
  if (!processed?.[0]?.path) throw new Error('Preprocessing did not return an image');
  const preprocessMs = elapsed(start) - uploadMs;
  const generated = await callDemo('generate', [processed[0], 256]);
  if (!generated?.[1]?.path?.endsWith('.glb')) throw new Error('Demo did not return a GLB path');
  const generateMs = elapsed(start) - uploadMs - preprocessMs;
  // The demo currently returns a malformed URL prefix, so use its path on the same host.
  const modelResponse = await request(`${endpoint}/file=${generated[1].path}`);
  const model = Buffer.from(await modelResponse.arrayBuffer());
  const downloadMs = elapsed(start) - uploadMs - preprocessMs - generateMs;
  const outputPath = join(outputDir, `${basename(imagePath, extname(imagePath))}.glb`);
  await writeFile(outputPath, model);
  return {
    input: basename(imagePath), outputPath, ...inspectGlb(model),
    elapsedMs: { upload: uploadMs, preprocess: preprocessMs, generate: generateMs, download: downloadMs, total: elapsed(start) },
  };
}

if (imagePaths.length === 0) {
  process.stderr.write('Usage: node scripts/evaluate-image-to-3d.mjs <image1.jpg> [image2.jpg ...]\n');
  process.exitCode = 2;
} else {
  await mkdir(outputDir, { recursive: true });
  const results = [];
  for (const imagePath of imagePaths) {
    try {
      const result = await evaluate(imagePath);
      results.push(result);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      const result = { input: basename(imagePath), error: error instanceof Error ? error.message : String(error) };
      results.push(result);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = 1;
    }
  }
  await writeFile(join(outputDir, 'results.json'), `${JSON.stringify({ endpoint, results }, null, 2)}\n`);
}
