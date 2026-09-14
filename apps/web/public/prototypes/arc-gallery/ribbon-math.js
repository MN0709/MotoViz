export const TIMING = Object.freeze({
  enter: 1.6,
  exitStart: 6,
  ribbonEnd: 8.75,
  curtainStart: 6.5,
  end: 8.8,
});
// Restore the approved v12 travel and perspective with the side-positioned titles.
const TRAVEL_END = 10.4;
export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const smooth = (v) => {
  const x = clamp(v);
  return x * x * x * (10 + x * (-15 + 6 * x));
};

export function phaseAt(time) {
  if (time < TIMING.enter) return 'entering';
  if (time < TIMING.exitStart) return 'orbiting';
  if (time < TIMING.curtainStart) return 'leaving';
  return time < TIMING.end ? 'opening' : 'home';
}

// A single open ribbon path: low distant arc -> right-hand turn -> near right-to-left
// sweep -> left return -> distant upper-right exit. No rigid group translation.
const points = [
  [-8.8, -2.3, -4.8],
  [-5.7, -2.1, -7.3],
  [-1.3, -2.45, -8.5],
  [3.6, -3.7, -7.5],
  [6.9, -4.1, -3.6],
  [6.2, -0.45, 1.6],
  [3.4, 0.0, 3.8],
  [-1.2, 0.25, 6.3],
  [-5.2, 0.55, 1.8],
  [-6.8, 1.4, -1.7],
  [-4.2, 2.2, -6.6],
  [0.4, 2.3, -8.2],
  [5.3, 2.4, -6.8],
  [10.8, 3.0, -6.5],
  [28, 6.0, -10],
].map(([x, y, z]) => {
  // Keep the distant arc, but tilt the foreground sweep between the two titles.
  // Blend by depth so the left return and right approach remain a continuous loop.
  const tilt = (12 * Math.PI) / 180;
  const foreground = smooth((z + 5) / 8);
  return [
    1.1 * 1.05 * (x * Math.cos(tilt) - y * Math.sin(tilt)) * (1 - 0.22 * foreground),
    1.1 * (1.05 * (x * Math.sin(tilt) + y * Math.cos(tilt)) - 0.34 * x * foreground),
    z < 0 ? z * 1.08 : z,
  ];
});
// Measure the v25 centerline in final world units; depth affects perspective only.
function spline(t) {
  const k = clamp(Math.floor(t), 0, points.length - 2),
    u = clamp(t - k);
  const p1 = points[k], p2 = points[k + 1];
  const p0 = k > 0 ? points[k - 1] : p1.map((v, i) => 2 * v - p2[i]);
  const p3 = k + 2 < points.length ? points[k + 2] : p2.map((v, i) => 2 * v - p1[i]);
  // A C2 cubic B-spline rounds the control polygon instead of forcing the ribbon
  // through every corner. Continuous curvature avoids sudden bank/normal changes.
  const v = 1 - u;
  return p1.map((_, i) => (
    v * v * v * p0[i] +
    (3 * u * u * u - 6 * u * u + 4) * p1[i] +
    (-3 * u * u * u + 3 * u * u + 3 * u + 1) * p2[i] +
    u * u * u * p3[i]
  ) / 6);
}
const arc = [{ s: 0, t: 0 }];
let previous = spline(0),
  length = 0;
for (let i = 1; i <= 1400; i++) {
  const t = ((points.length - 1) * i) / 1400,
    p = spline(t);
  length += Math.hypot(...p.map((v, j) => v - previous[j]));
  arc.push({ s: length, t });
  previous = p;
}
function centerAt(distance) {
  if (distance <= 0) {
    const p = spline(0),
      q = spline(0.001),
      n = Math.hypot(...q.map((v, i) => v - p[i]));
    return p.map((v, i) => v + (distance * (q[i] - v)) / n);
  }
  if (distance >= length) {
    const p = spline(points.length - 1),
      q = spline(points.length - 1 - 0.001),
      n = Math.hypot(...p.map((v, i) => v - q[i]));
    return p.map((v, i) => v + ((distance - length) * (v - q[i])) / n);
  }
  let lo = 0,
    hi = arc.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arc[mid].s < distance) lo = mid;
    else hi = mid;
  }
  const f = (distance - arc[lo].s) / (arc[hi].s - arc[lo].s);
  return spline(arc[lo].t + (arc[hi].t - arc[lo].t) * f);
}
const CARD_WIDTH = 2.34 * 1.1,
  CARD_SPACING = CARD_WIDTH,
  BAND_HEIGHT = 2.92 * 1.1;
// Integral of quintic smootherstep: velocity, acceleration and jerk join the
// cruise without a snap. Integrating speed keeps playback independent of FPS.
const integratedEase = (x) => {
  const r = clamp(x);
  return r ** 4 * (2.5 - 3 * r + r * r);
};
// Half a second of quiet, then a smooth acceleration to continuous flow. The tail
// follows the same route offscreen; the band is never translated out as one object.
export function sceneAt(time, aspect, cardCount = 10) {
  const start = (cardCount - 1) * CARD_SPACING;
  const p = clamp((time - 0.45) / (TRAVEL_END - 0.45));
  const ramp = 0.22;
  const release = 0.25;
  const releaseAmount = 0.18;
  const arrival = p < ramp ? ramp * integratedEase(p / ramp) : p - ramp / 2;
  // Gently release 18% of cruise speed near the end; keep moving offscreen.
  const departure = releaseAmount * release * integratedEase((p - 1 + release) / release);
  const progress = (arrival - departure) / (1 - ramp / 2 - releaseAmount * release / 2);
  return {
    cameraZ: aspect < 0.8 ? 24 : aspect < 1.2 ? 20 : 17,
    distance: start + (length + CARD_SPACING * cardCount + 7 - start) * progress,
    // Spread the early separation across the whole ribbon lead-in, so lettering
    // does not arrive at the sides early and wait for the final curtain.
    titleDrift: 0.8 * smooth((time - 0.45) / (TIMING.curtainStart - 0.45)) + 0.2 * progress,
    opening: smooth((time - TIMING.curtainStart) / (TIMING.end - TIMING.curtainStart)),
    showRibbon: time < TIMING.ribbonEnd,
  };
}
function ribbonFrame(scene, index, u) {
  const centerDistance = scene.distance - index * CARD_SPACING;
  const distance = centerDistance + u * CARD_WIDTH;
  const p = centerAt(distance);
  // The reference's panels stand vertically: depth and horizontal turning form
  // the loop. Do not convert the path's vertical slope into artwork roll/twist.
  return { p, up: [0, BAND_HEIGHT, 0] };
}
export function ribbonPoint(scene, index, u, v) {
  const { p, up } = ribbonFrame(scene, index, u);
  return p.map((n, i) => n + up[i] * v);
}
// Reuse CPU storage during animation. Each column shares its frame between both
// edges; the surface is linear vertically, so its vertical derivative is exact.
export function createRibbonMesh(segments = 32) {
  return {
    segments,
    columns: new Float32Array((segments + 1) * 16),
    vertices: new Float32Array(segments * 6 * 8),
  };
}
export function ribbonVertices(scene, index, segments = 32, mesh = createRibbonMesh(segments)) {
  const { columns, vertices } = mesh;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments - 0.5;
    const frame = ribbonFrame(scene, index, u);
    const a = ribbonFrame(scene, index, u - 0.001);
    const b = ribbonFrame(scene, index, u + 0.001);
    for (let side = 0; side < 2; side++) {
      const v = side - 0.5;
      const tx = b.p[0] - a.p[0] + (b.up[0] - a.up[0]) * v;
      const ty = b.p[1] - a.p[1] + (b.up[1] - a.up[1]) * v;
      const tz = b.p[2] - a.p[2] + (b.up[2] - a.up[2]) * v;
      const [wx, wy, wz] = frame.up;
      const nx = ty * wz - tz * wy, ny = tz * wx - tx * wz, nz = tx * wy - ty * wx;
      const len = Math.hypot(nx, ny, nz);
      const offset = i * 16 + side * 8;
      for (let j = 0; j < 3; j++) columns[offset + j] = frame.p[j] + frame.up[j] * v;
      columns[offset + 3] = u + 0.5;
      columns[offset + 4] = 0.5 - v;
      columns[offset + 5] = nx / len;
      columns[offset + 6] = ny / len;
      columns[offset + 7] = nz / len;
    }
  }
  let offset = 0;
  for (let i = 0; i < segments; i++) {
    const column = i * 16;
    for (const source of [column, column + 16, column + 8, column + 8, column + 16, column + 24]) {
      for (let j = 0; j < 8; j++) vertices[offset++] = columns[source + j];
    }
  }
  return vertices;
}
export function quadVertices(x, y, z, width, height) {
  const out = [];
  for (const [u, v] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [-0.5, 0.5],
    [0.5, -0.5],
    [0.5, 0.5],
  ])
    out.push(x + u * width, y + v * height, z, u + 0.5, 0.5 - v, 0, 0, 1);
  return new Float32Array(out);
}
