import { TIMING, phaseAt, sceneAt, ribbonVertices, createRibbonMesh, quadVertices } from './ribbon-math.js';
const $ = (id) => document.getElementById(id);
const canvas = $('gallery');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const SEEN_KEY = 'motoviz.opening.seen';
const LOAD_BUDGET_MS = 1800;
function hasSeenOpening() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
function rememberOpening() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* Storage may be disabled. */ }
}
// Viewing order: light full-bike portraits alternate with darker detail pages.
// Credits live on sources.html; source-photo watermarks remain in the artwork.
const items = [3, 1, 4, 6, 8, 10, 7, 9, 2, 5].map((id) => ({
  image: `motoviz-case-${String(id).padStart(2, '0')}-v36`,
}));
function makePoster(item, photo) {
  if (!photo) throw new Error(`Case artwork unavailable: ${item.image}`);
  return photo;
}

let booting = false;
let renderer = null,
  finished = false,
  elapsed = 0,
  playing = true,
  frameId = 0,
  last = 0,
  phase = '';
const home = $('home'),
  opening = $('opening');
document.body.classList.add('is-opening');
function finish(message = '开场结束，已进入首页。', remember = true) {
  if (remember) rememberOpening();
  finished = true;
  playing = false;
  cancelAnimationFrame(frameId);
  last = 0;
  opening.hidden = true;
  home.inert = false;
  home.removeAttribute('aria-hidden');
  document.body.classList.remove('is-opening');
  $('announcement').textContent = message;
  $('home-title').focus({ preventScroll: true });
}
function updateStage() {
  const scene = sceneAt(elapsed, innerWidth / innerHeight);
  $('curtain-left').style.transform = `translateX(${-scene.opening * 100}%)`;
  $('curtain-right').style.transform = `translateX(${scene.opening * 100}%)`;
  opening.querySelector('.opening-nav').style.opacity = String(1 - scene.opening);
  opening.querySelector('.opening-footer').style.opacity = String(1 - scene.opening);
  const next = phaseAt(elapsed);
  opening.dataset.phase = next;
  if (next !== phase) {
    phase = next;
    $('phase-label').textContent = {
      entering: '低位弧带展开',
      orbiting: '沿三维轨迹绕行',
      leaving: '飘带向右上方离场',
      cleared: '飘带已离场',
      opening: '展开首页',
      home: '首页预览',
    }[phase];
  }
  renderer?.draw(elapsed);
  if (elapsed >= TIMING.end) finish();
}
function tick(now) {
  if (finished || !playing || document.hidden) return;
  if (last) elapsed += Math.min((now - last) / 1000, 0.05);
  last = now;
  updateStage();
  if (!finished) frameId = requestAnimationFrame(tick);
}
function playLoop() {
  cancelAnimationFrame(frameId);
  last = 0;
  if (renderer && !finished && playing && !document.hidden) frameId = requestAnimationFrame(tick);
}
function replay() {
  if (reduced.matches) {
    finish('已按减少动态偏好直接显示首页。');
    return;
  }
  finished = false;
  playing = true;
  elapsed = 0;
  phase = '';
  opening.hidden = false;
  home.inert = true;
  home.setAttribute('aria-hidden', 'true');
  document.body.classList.add('is-opening');
  $('pause').textContent = '暂停';
  $('pause').setAttribute('aria-pressed', 'false');
  updateStage();
  $('skip').focus({ preventScroll: true });
  playLoop();
  if (!renderer) {
    document.body.classList.remove('gpu-ready');
    init(true);
  }
}
$('skip').addEventListener('click', () => finish('已跳过开场，进入首页。'));
$('replay').addEventListener('click', replay);
$('restart').addEventListener('click', replay);
$('pause').addEventListener('click', () => {
  playing = !playing;
  $('pause').textContent = playing ? '暂停' : '继续';
  $('pause').setAttribute('aria-pressed', String(!playing));
  playLoop();
});
document.addEventListener('visibilitychange', playLoop);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !finished) finish('已跳过开场，进入首页。');
});
reduced.addEventListener('change', () => {
  if (reduced.matches && !finished) finish('已按减少动态偏好直接显示首页。');
});

function createRenderer(posters) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) throw new Error('WebGL unavailable');
  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const vs = shader(
    gl.VERTEX_SHADER,
    `
    attribute vec3 aPosition;attribute vec2 aUv;attribute vec3 aNormal;
    uniform float uAspect,uCameraZ;varying vec2 vUv;varying vec3 vNormal;
    void main(){float z=aPosition.z-uCameraZ;gl_Position=vec4(3.1715948/uAspect*aPosition.x,3.1715948*aPosition.y,-1.002002*z-.2002002,-z);vUv=aUv;vNormal=aNormal;}
  `,
  );
  const fs = shader(
    gl.FRAGMENT_SHADER,
    `
    precision mediump float;uniform sampler2D uFront,uBack;uniform float uText;varying vec2 vUv;varying vec3 vNormal;
    void main(){
      vec4 color=gl_FrontFacing||uText>.5?texture2D(uFront,vUv):texture2D(uBack,vec2(1.-vUv.x,vUv.y));
      if(color.a<.08)discard;
      float light=uText>.5?1.:.80+.20*abs(normalize(vNormal).z);
      gl_FragColor=vec4(color.rgb*light,color.a);
    }
  `,
  );
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const uniforms = Object.fromEntries(
    ['uAspect', 'uCameraZ', 'uFront', 'uBack', 'uText'].map((x) => [
      x,
      gl.getUniformLocation(program, x),
    ]),
  );
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const [name, size, offset] of [
    ['aPosition', 3, 0],
    ['aUv', 2, 12],
    ['aNormal', 3, 20],
  ]) {
    const a = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, size, gl.FLOAT, false, 32, offset);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.uniform1i(uniforms.uFront, 0);
  gl.uniform1i(uniforms.uBack, 1);
  const allTextures = [];
  function texture(image) {
    const t = gl.createTexture();
    allTextures.push(t);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const fronts = posters.map(texture);
  const meshes = items.map(() => createRibbonMesh());
  // Stage the complete frame once instead of reallocating/uploading the same GPU
  // buffer separately for every card and headline.
  const frameVertices = new Float32Array(items.length * 32 * 6 * 8 + 2 * 6 * 8);
  const drawCalls = [];
  let frameOffset = 0;
  // Printed on both faces for this study; mirrored UV correction preserves readable artwork.
  // The source does not establish a blank paper backing, so no invented blank faces.
  const backs = fronts;
  const titles = ['MOTOVIZ', 'AI STUDIO'].map((value) => {
    const c = document.createElement('canvas');
    c.width = 1536;
    c.height = 270;
    const ctx = c.getContext('2d');
    ctx.font = '200px InterTight, sans-serif';
    ctx.fillStyle = '#172b3b';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(value, 768, 139, 1500);
    return texture(c);
  });
  let width = 1,
    height = 1,
    destroyed = false;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    width = rect.width || innerWidth;
    height = rect.height || innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (renderer && !finished) draw(elapsed);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  function drawMesh(vertices, front, back, isText = false) {
    frameVertices.set(vertices, frameOffset);
    drawCalls.push({ front, back, isText, first: frameOffset / 8, count: vertices.length / 8 });
    frameOffset += vertices.length;
  }
  function draw(time) {
    if (destroyed) return;
    frameOffset = 0;
    drawCalls.length = 0;
    const scene = sceneAt(time, width / height, items.length);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(uniforms.uAspect, width / height);
    gl.uniform1f(uniforms.uCameraZ, scene.cameraZ);
    const units = (2 * scene.cameraZ) / (3.1715948 * height);
    const textWidth = Math.min(width * 0.594, 1100),
      textHeight = (textWidth * 270) / 1536;
    // Both headline groups share z=0 with depth-writing only on actual glyph pixels.
    // Cards in front cover glyphs; cards behind remain visible through the letter gaps.
    for (let i = 0; i < 2; i++) {
      const x =
        ((i === 0 ? 1 : -1) *
            (scene.titleDrift * width * 0.29 + scene.opening * (width + textWidth))) *
        units;
      const y = (i === 0 ? 1 : -1) * textHeight * 0.42 * units;
      drawMesh(
        quadVertices(x, y, 0, textWidth * units, textHeight * units),
        titles[i],
        titles[i],
        true,
      );
    }
    if (scene.showRibbon)
      for (let i = 0; i < items.length; i++)
        drawMesh(ribbonVertices(scene, i, 32, meshes[i]), fronts[i], backs[i]);
    gl.bufferData(gl.ARRAY_BUFFER, frameVertices.subarray(0, frameOffset), gl.DYNAMIC_DRAW);
    for (const call of drawCalls) {
      gl.uniform1f(uniforms.uText, call.isText ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, call.front);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, call.back || call.front);
      gl.drawArrays(gl.TRIANGLES, call.first, call.count);
    }
    canvas.dataset.ready = 'true';
    canvas.dataset.phase = phaseAt(time);
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    observer.disconnect();
    allTextures.forEach((t) => gl.deleteTexture(t));
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    destroy();
    renderer = null;
    finish('开场播放已中断，已直接进入首页。');
  });
  window.addEventListener('pagehide', destroy);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  return { draw, destroy };
}
async function loadImage(name) {
  return new Promise((resolve) => {
    const image = new Image();
    const timeout = setTimeout(() => {
      image.onload = image.onerror = null;
      resolve(null);
    }, LOAD_BUDGET_MS);
    image.onload = () => {
      clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    image.src = `./assets/${name}.jpg`;
  });
}
async function init(force = false) {
  if (booting || renderer) return;
  if (!force && hasSeenOpening()) {
    finish('欢迎回来，已直接进入首页。', false);
    return;
  }
  if (reduced.matches) {
    finish('已按减少动态偏好直接显示首页。');
    return;
  }
  booting = true;
  try {
    // Start both requests together; a slow asset cannot hold the homepage indefinitely.
    const [photos] = await Promise.all([
      Promise.all(items.map((item) => loadImage(item.image))),
      Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, LOAD_BUDGET_MS))]),
    ]);
    if (photos.some((photo) => !photo)) {
      if (!finished) finish('开场图片暂未加载完成，已直接进入首页，可稍后重播。', false);
      return;
    }
    renderer = createRenderer(items.map((item, i) => makePoster(item, photos[i])));
    document.body.classList.add('gpu-ready');
    if (!finished) {
      updateStage();
      playLoop();
    }
  } catch (error) {
    console.error('Opening unavailable:', error);
    if (!finished) finish('当前设备无法播放开场，已直接显示首页。', false);
  } finally {
    booting = false;
  }
}
init();
