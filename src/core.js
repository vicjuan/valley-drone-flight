/* ===== Game core: world layout, terrain, wind, radio link, battery, flight model, return-to-home, mission.
   Pure functions and plain objects, no DOM. Units are metres and seconds. x = east, z = south, y = up. ===== */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = v => clamp(v, 0, 1);
const smooth = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
const wrapAng = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

const HOME = { x: 0, z: 0 };
const PILOT = { x: -11, z: 7 };
const PAD_R = 2.6, PAD_TOP = 0.22, FOOT = 0.17;
// these hold the current scene's values (see setScene)
const LAKE = { x: 95, z: -1250, level: -31, r: 105 };
const TARGET = { x: 95, z: -1250, r: 70, minAgl: 6, maxAgl: 200, need: 6 };
const INNER = { x0: -1500, x1: 1500, z0: -2150, z1: 850 };
const FENCE = { x0: -1150, x1: 1150, z0: -1820, z1: 520, top: 760 };
const MAX_H = 17, MAX_UP = 5, MAX_DN = 4.5, MAX_YAW = 1.25, DRIFT = 0.35;

/* ---------- scenes: the mountain valley, and the desert canyon with an oasis ---------- */
let SCENE_ID = 'valley';
let SOFT = false; // desert: sand is soft, nothing on the way down ends the flight
const SCENES = {
  valley: {
    lake: { x: 95, z: -1250, level: -31, r: 105 }, target: { x: 95, z: -1250, r: 70, minAgl: 6, maxAgl: 200, need: 6 },
    inner: { x0: -1500, x1: 1500, z0: -2150, z1: 850 }, fence: { x0: -1150, x1: 1150, z0: -1820, z1: 520, top: 760 },
    cp: [
      [10, 460, 3, 230, 320], [0, 130, 0, 210, 320], [30, -220, -2, 150, 260], [-30, -480, -5, 105, 170], [-150, -690, -9, 62, 115],
      [-95, -880, -13, 50, 105], [60, -1000, -18, 62, 115], [120, -1140, -23, 130, 150], [92, -1262, -26, 185, 190], [20, -1440, -20, 150, 220], [-40, -1660, -9, 110, 260],
    ],
  },
  desert: {
    lake: { x: 40, z: -1200, level: -24.5, r: 42 }, target: { x: 40, z: -1200, r: 65, minAgl: 6, maxAgl: 200, need: 6 },
    inner: { x0: -1000, x1: 1000, z0: -1600, z1: 400 }, fence: { x0: -820, x1: 820, z0: -1460, z1: 300, top: 600 },
    // canyon through a plateau of packed sand: [x, z, floor height, half width, wall width].
    // Nearly straight from the camp (the radio link reaches down it), then an S-bend hides the oasis behind a tongue of the plateau.
    cp: [
      [8, -120, 0.5, 90, 30], [10, -200, 0, 72, 24], [30, -340, -2, 58, 20], [0, -480, -4, 50, 18], [-30, -620, -7, 64, 20],
      [0, -760, -9, 40, 16], [20, -880, -12, 46, 18], [110, -975, -15, 44, 18], [150, -1080, -17, 44, 18], [40, -1200, -21, 140, 40], [10, -1320, -19, 110, 44],
    ],
  },
};
function setScene(id) {
  SCENE_ID = SCENES[id] ? id : 'valley';
  const S = SCENES[SCENE_ID];
  SOFT = SCENE_ID === 'desert';
  Object.assign(LAKE, S.lake); Object.assign(TARGET, S.target); Object.assign(INNER, S.inner); Object.assign(FENCE, S.fence);
  VALLEY_CP = S.cp; VALLEY = buildValley(); GRID = null;
  return SCENE_ID;
}

/* ---------- gradient noise ---------- */
const PERM = new Uint8Array(512), GX = new Float32Array(256), GZ = new Float32Array(256);
(function () {
  let s = 1337;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const p = []; for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) { const a = rnd() * Math.PI * 2; GX[i] = Math.cos(a); GZ[i] = Math.sin(a); }
})();
function gnoise(x, z) {
  const xf = Math.floor(x), zf = Math.floor(z), ix = xf & 255, iz = zf & 255, fx = x - xf, fz = z - zf;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = PERM[PERM[ix] + iz], b = PERM[PERM[ix + 1] + iz], c = PERM[PERM[ix] + iz + 1], d = PERM[PERM[ix + 1] + iz + 1];
  const n00 = GX[a] * fx + GZ[a] * fz, n10 = GX[b] * (fx - 1) + GZ[b] * fz;
  const n01 = GX[c] * fx + GZ[c] * (fz - 1), n11 = GX[d] * (fx - 1) + GZ[d] * (fz - 1);
  const x1 = n00 + (n10 - n00) * u, x2 = n01 + (n11 - n01) * u;
  return (x1 + (x2 - x1) * v) * 1.41;
}
function fbm(x, z, oct) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * gnoise(x, z); n += a; const nx = x * 1.6 - z * 1.2, nz = x * 1.2 + z * 1.6; x = nx + 5.3; z = nz - 2.9; a *= 0.5; }
  return s / n;
}
function ridged(x, z, oct) {
  let s = 0, a = 1, w = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    let r = 1 - Math.abs(gnoise(x, z)); r *= r;
    s += r * w * a; n += a;
    w = clamp(r * 1.9, 0, 1);
    a *= 0.53;
    const nx = x * 1.6 - z * 1.2, nz = x * 1.2 + z * 1.6; x = nx + 3.7; z = nz - 1.3;
  }
  return s / n;
}

/* ---------- valley (or canyon) spline: [x, z, floor height, half width, wall ramp width] ---------- */
let VALLEY_CP = SCENES.valley.cp;
let VALLEY = buildValley();
function buildValley() {
  const P = VALLEY_CP, out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 8; k++) {
      const t = k / 8, t2 = t * t, t3 = t2 * t;
      const cr = j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([cr(0), cr(1), cr(2), cr(3), cr(4)]);
    }
  }
  out.push(P[P.length - 1].slice());
  // river flag per node: from where the valley narrows down to the lake (the desert canyon is dry)
  for (const p of out) p[5] = SCENE_ID === 'valley' && p[1] < -440 && Math.hypot(p[0] - LAKE.x, p[1] - LAKE.z) > LAKE.r * 0.6 && p[1] > -1300 ? 1 : 0;
  return out;
}
let VI_D = 0, VI_F = 0, VI_W = 0, VI_R = 0, VI_K = 300;
function valleyInfo(x, z) {
  let best = 1e18, bf = 0, bw = 0, br = 0, bk = 300;
  for (let i = 0; i < VALLEY.length - 1; i++) {
    const a = VALLEY[i], b = VALLEY[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a[0] + dx * t - x, pz = a[1] + dz * t - z, d2 = px * px + pz * pz;
    if (d2 < best) { best = d2; bf = a[2] + (b[2] - a[2]) * t; bw = a[3] + (b[3] - a[3]) * t; bk = a[4] + (b[4] - a[4]) * t; br = a[5] && b[5] ? 1 : 0; }
  }
  VI_D = Math.sqrt(best); VI_F = bf; VI_W = bw; VI_R = br; VI_K = bk;
}

/* ---------- dirt road up the valley (used for colouring and tree spacing) ---------- */
const ROAD = [[2, 12], [-6, -26], [6, -100], [26, -190], [26, -290], [4, -380], [-22, -455]];
function roadDist(x, z) {
  let best = 1e18;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const a = ROAD[i], b = ROAD[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a[0] + dx * t - x, pz = a[1] + dz * t - z, d2 = px * px + pz * pz;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/* ---------- terrain height ---------- */
function mountains(x, z) {
  const wx = x + 190 * fbm(x * 0.0006 + 11.3, z * 0.0006 - 4.1, 3);
  const wz = z + 190 * fbm(x * 0.0006 - 7.7, z * 0.0006 + 9.2, 3);
  const r = ridged(wx * 0.0013 + 0.31, wz * 0.0013 - 0.77, 7);
  const big = 0.5 + 0.5 * fbm(x * 0.00035 + 2.2, z * 0.00035 + 5.5, 2);
  let m = 80 + 640 * Math.pow(r, 1.3) * (0.55 + 0.8 * big);
  const R = Math.hypot(x, z + 650);
  m *= 1 + 1.15 * smooth(2300, 7000, R);
  return m;
}
function heightAt(x, z) { return SCENE_ID === 'desert' ? desertHeight(x, z) : valleyHeight(x, z); }
function valleyHeight(x, z) {
  const m = mountains(x, z);
  valleyInfo(x, z);
  const rawD = VI_D, f = VI_F, w = VI_W, river = VI_R, ramp = VI_K;
  const d = rawD + 30 * gnoise(x * 0.0045 + 1.7, z * 0.0045 - 2.3);
  const wall = smooth(w, w + ramp, d);
  let h = f + 4 * fbm(x * 0.011 + 5.1, z * 0.011 + 0.7, 3) * (1 - wall) + (m - f) * Math.pow(wall, 1.3);
  const det = ridged(x * 0.0062 + 7.1, z * 0.0062 - 3.3, 5) - 0.3; // rocky knolls and gullies everywhere
  h += det * lerp(9, 28, wall);

  const dh = Math.hypot(x - HOME.x, z - HOME.z);
  const md = 1 - smooth(240, 760, dh);
  if (md > 0) {
    const mh = 2.5 * fbm(x * 0.007 + 4.4, z * 0.007 - 3.3, 3) + 24 * smooth(150, 720, dh) * (0.7 + 0.3 * gnoise(x * 0.004, z * 0.004));
    h = lerp(h, mh, md);
  }
  const pf = 1 - smooth(9, 28, dh);
  if (pf > 0) h = lerp(h, 0, pf);

  // a low rocky col on the straight sightline from the pilot to the lake: fly high and the radio link clears it
  const SX = LAKE.x - PILOT.x, SZ = LAKE.z - PILOT.z, SL = Math.hypot(SX, SZ);
  const s = ((x - PILOT.x) * SX + (z - PILOT.z) * SZ) / (SL * SL);
  if (s > 0.25 && s < 0.97) {
    const q = Math.abs((x - PILOT.x) * SZ - (z - PILOT.z) * SX) / SL;
    const k = (1 - smooth(30, 150, q)) * smooth(0.25, 0.4, s);
    if (k > 0) {
      const cap = 1.7 + s * (LAKE.level + SADDLE_AGL - 1.7) - 20 - 16 * Math.abs(gnoise(x * 0.018, z * 0.018));
      if (h > cap) h = lerp(h, cap + (h - cap) * 0.12 + det * 10, k);
    }
  }

  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r * 2.8) {
    const ang = Math.atan2(z - LAKE.z, x - LAKE.x);
    const rr = LAKE.r * (1 + 0.22 * Math.sin(ang * 3 + 0.7) + 0.12 * Math.sin(ang * 5 - 1.1));
    const prof = LAKE.level - 9 + 9 * (dl / rr) * (dl / rr);
    if (prof < h) h = prof;
  }
  if (river && rawD < 12) {
    const ch = f - 2.4 + 2.4 * (rawD / 9) * (rawD / 9);
    if (ch < h) h = ch;
  }
  return h;
}
const SADDLE_AGL = 78; // height above the lake at which the radio link just clears the col

/* ---------- desert: dune sea, a plateau of packed sand, the canyon cut into it, an oasis at its end ---------- */
const DUNE_U = { x: Math.cos(0.32), z: Math.sin(0.32) }; // dunes march downwind (same wind as WIND_DIR)
// one dune train: a long gentle windward slope, a sharp crest, a short steep slip face
function dune(x, z, scale, amp, seed) {
  const is = 1 / scale;
  const wx = x + 0.55 * scale * gnoise(x * 0.5 * is + seed, z * 0.5 * is - seed);
  const wz = z + 0.55 * scale * gnoise(x * 0.5 * is - seed * 1.7, z * 0.5 * is + seed * 0.9);
  const u = (wx * DUNE_U.x + wz * DUNE_U.z) * is, v = (-wx * DUNE_U.z + wz * DUNE_U.x) * is;
  const ph = u + 0.32 * Math.sin(v * 1.9 + seed);
  const s = ph - Math.floor(ph);
  let prof; if (s < 0.82) { const q = s / 0.82; prof = q * Math.sqrt(q); } else prof = 1 - (s - 0.82) / 0.18;
  const m = clamp01(0.5 + 1.1 * gnoise(x * 0.45 * is + seed * 3.1, z * 0.45 * is - seed));
  return amp * prof * m;
}
const GIANT = { x: -380, z: -820 };
function giantDune(x, z) { // a three-armed star dune, the tallest sand in the area
  const dx = x - GIANT.x, dz = z - GIANT.z, r = Math.hypot(dx, dz);
  if (r > 330) return 0;
  const a = Math.atan2(dz, dx);
  const arm = Math.pow(Math.max(0, Math.cos(3 * a + 0.4)), 4);
  const re = r / (1 + 0.55 * arm);
  const k = Math.max(0, 1 - re / 175);
  return 72 * Math.pow(k, 1.55);
}
const BUTTES = [[-470, 70, 62, 58], [560, -40, 70, 66], [-640, -330, 80, 70], [430, 190, 45, 40]]; // x, z, radius, height
function desertHeight(x, z) {
  valleyInfo(x, z);
  const rawD = VI_D, f = VI_F, w = VI_W, ramp = VI_K;
  // the plateau north of a wavy escarpment, the open sand sea everywhere else
  const ez = -190 + 40 * fbm(x * 0.0032 + 7.7, 0.37, 2);
  const pm = smooth(ez + 12, ez - 16, z) * (1 - smooth(1250, 1500, Math.abs(x))) * (1 - smooth(1900, 2200, -z));
  const plain = pm > 0.999 ? 0 : 1.5 + dune(x, z, 150, 9, 1.3) + dune(x, z, 46, 2, 4.1) + 5 * fbm(x * 0.0012 + 2.3, z * 0.0012 - 1.1, 2);
  const top = pm < 0.001 ? 0 : 58 + 7 * fbm(x * 0.0021 + 3.1, z * 0.0021 - 1.7, 2) + 0.8 * dune(x, z, 110, 4.5, 7.7) + giantDune(x, z);
  let h = lerp(plain, top, pm);
  // flat-topped buttes on the sand sea, and big mesas on the horizon
  for (const b of BUTTES) {
    const d0 = Math.hypot(x - b[0], z - b[1]); if (d0 > b[2] + 12) continue;
    const d = d0 + 9 * gnoise(x * 0.03 + b[0], z * 0.03 + b[1]);
    const k = 1 - smooth(b[2] * 0.82, b[2], d);
    if (k > 0) h = Math.max(h, lerp(h, b[3] + 4 * gnoise(x * 0.01, z * 0.01), k));
  }
  const R0 = Math.hypot(x, z + 600);
  if (R0 > 1900) {
    const fm = smooth(0.12, 0.2, fbm(x * 0.0006 + 9.1, z * 0.0006 - 4.4, 3)) * smooth(1900, 2700, R0);
    if (fm > 0) h = Math.max(h, lerp(h, 130 + 90 * fbm(x * 0.0004 + 1.3, z * 0.0004 + 2.2, 2), fm));
  }
  // the canyon: steep walls of layered sand, a sandy floor
  const d = rawD + 6 * gnoise(x * 0.035 + 1.7, z * 0.035 - 2.3) + 3 * gnoise(x * 0.11, z * 0.11);
  const cut = (1 - smooth(w, w + ramp, d)) * smooth(0, 0.3, pm);
  if (cut > 0) {
    const fl = f + 0.9 * dune(x, z, 58, 2.4, 2.9) + 0.8 * fbm(x * 0.02, z * 0.02, 2);
    if (fl < h) h = lerp(h, fl, cut);
  }
  // the camp: flat sand around the pad
  const dh = Math.hypot(x - HOME.x, z - HOME.z);
  const md = 1 - smooth(45, 120, dh);
  if (md > 0) h = lerp(h, 0.6 + 1.2 * fbm(x * 0.01 + 4.4, z * 0.01 - 3.3, 2), md);
  const pf = 1 - smooth(9, 28, dh);
  if (pf > 0) h = lerp(h, 0, pf);
  // the oasis pond
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r * 3) {
    const ang = Math.atan2(z - LAKE.z, x - LAKE.x);
    const rr = LAKE.r * (1 + 0.18 * Math.sin(ang * 3 + 0.7) + 0.1 * Math.sin(ang * 5 - 1.1));
    const prof = LAKE.level - 4 + 4.6 * (dl / rr) * (dl / rr);
    if (prof < h) h = prof;
  }
  return h;
}

/* ---------- height grid (what the game samples and the mesh is built from) ---------- */
let GRID = null;
function buildGrid(n) {
  const N = n + 1, h = new Float32Array(N * N);
  const dx = (INNER.x1 - INNER.x0) / n, dz = (INNER.z1 - INNER.z0) / n;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = heightAt(INNER.x0 + i * dx, INNER.z0 + j * dz);
  GRID = { n, N, dx, dz, h };
  return GRID;
}
/* exact height of the rendered triangle mesh: cells split along the (i+1,j)-(i,j+1) diagonal */
function terrainH(x, z) {
  const G = GRID;
  if (!G) return heightAt(x, z);
  const fx = (x - INNER.x0) / G.dx, fz = (z - INNER.z0) / G.dz;
  if (fx < 0 || fz < 0 || fx >= G.n || fz >= G.n) return heightAt(x, z);
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, N = G.N, k = j * N + i;
  const a = G.h[k], b = G.h[k + 1], c = G.h[k + N], d = G.h[k + N + 1];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
function slopeAt(x, z) {
  const e = 4, gx = (terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e), gz = (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}
function inLake(x, z) { return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.6 && terrainH(x, z) < LAKE.level; }
function groundAt(x, z) {
  if (Math.hypot(x - HOME.x, z - HOME.z) < PAD_R) return PAD_TOP;
  return terrainH(x, z);
}

/* ---------- trees: spruces in stands on gentle ground ---------- */
let TREES = [], TREE_CELLS = new Map();
const TREE_CELL = 24;
function buildTrees(maxN, seed) {
  let s = seed | 0 || 7;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  TREES = []; TREE_CELLS = new Map();
  if (SCENE_ID === 'desert') return buildPalms(rnd);
  for (let tries = 0; tries < maxN * 14 && TREES.length < maxN; tries++) {
    const x = lerp(-1300, 1300, rnd()), z = lerp(-1950, 650, rnd());
    const h = terrainH(x, z), sl = slopeAt(x, z);
    if (h > 330 || sl > 0.62) continue;
    const dh = Math.hypot(x - HOME.x, z - HOME.z);
    if (dh < 60) continue;
    if (roadDist(x, z) < 9) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.5 && h < LAKE.level + 4) continue;
    valleyInfo(x, z); if (VI_R && VI_D < 16) continue;
    const stand = fbm(x * 0.0042 + 1.9, z * 0.0042 - 6.1, 3) + 0.45 * gnoise(x * 0.013 + 0.5, z * 0.013 + 2.2);
    const lowBonus = 0.18 * (1 - smooth(60, 260, h));
    if (stand + lowBonus < 0.16) continue;
    const H = 11 + rnd() * 11;
    const t = { x, z, y: h - 0.4, H, r: H * 0.16, c: rnd(), yaw: rnd() * 6.283 };
    TREES.push(t);
    const key = Math.floor(x / TREE_CELL) + ',' + Math.floor(z / TREE_CELL);
    if (!TREE_CELLS.has(key)) TREE_CELLS.set(key, []);
    TREE_CELLS.get(key).push(t);
  }
  return TREES;
}
// date palms ring the oasis pond, a few stand at the camp
function buildPalms(rnd) {
  const tryAdd = (x, z, H) => {
    for (const t of TREES) if (Math.hypot(t.x - x, t.z - z) < 5.5) return false;
    const y = terrainH(x, z), lean = 0.05 + rnd() * 0.16, la = rnd() * 6.283;
    addTreeObj({ x, z, y: y - 0.3, H, r: 0.45, c: rnd(), yaw: la, palm: true, lean, cx: x + Math.cos(la) * lean * H, cz: z + Math.sin(la) * lean * H, crown: 3.4 + H * 0.12 });
    return true;
  };
  for (let k = 0, n = 0; k < 900 && n < 95; k++) {
    const a = rnd() * 6.283, r = LAKE.r * (1.08 + rnd() * rnd() * 2.1);
    const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r, h = terrainH(x, z);
    if (h < LAKE.level + 0.5 || h > LAKE.level + 7 || slopeAt(x, z) > 0.45) continue;
    if (tryAdd(x, z, 9 + rnd() * 8)) n++;
  }
  for (const [x, z] of [[-34, 22], [-42, 30], [31, 26], [40, 36], [-26, 40]]) tryAdd(x, z, 7 + rnd() * 5);
  return TREES;
}
function treeHit(x, y, z, pad) {
  const cx = Math.floor(x / TREE_CELL), cz = Math.floor(z / TREE_CELL);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const list = TREE_CELLS.get((cx + a) + ',' + (cz + b));
    if (!list) continue;
    for (const t of list) {
      const top = t.y + t.H;
      if (t.palm) { // thin trunk, a wide crown of fronds at the top
        if (y > top + 1.2) continue;
        const k = clamp((y - t.y) / t.H, 0, 1);
        if (y > top - 2.2) { if (Math.hypot(x - t.cx, z - t.cz) < t.crown + pad) return t; }
        else if (Math.hypot(x - lerp(t.x, t.cx, k), z - lerp(t.z, t.cz, k)) < t.r + pad) return t;
        continue;
      }
      if (y > top) continue;
      const rAt = t.r * clamp((top - y) / (t.H * 0.85), 0.15, 1) + pad;
      if (Math.hypot(x - t.x, z - t.z) < rAt) return t;
    }
  }
  return null;
}

function removeTreesNear(x, z, r) {
  TREES = TREES.filter(t => Math.hypot(t.x - x, t.z - z) > r);
  TREE_CELLS = new Map();
  for (const t of TREES) { const key = Math.floor(t.x / TREE_CELL) + ',' + Math.floor(t.z / TREE_CELL); if (!TREE_CELLS.has(key)) TREE_CELLS.set(key, []); TREE_CELLS.get(key).push(t); }
}
function addTreeObj(t) {
  TREES.push(t);
  const key = Math.floor(t.x / TREE_CELL) + ',' + Math.floor(t.z / TREE_CELL);
  if (!TREE_CELLS.has(key)) TREE_CELLS.set(key, []);
  TREE_CELLS.get(key).push(t);
}

/* ---------- man-made obstacles (cabin, bridge, weather station): boxes and thick segments ---------- */
let OBSTACLES = [];
function obstacleHit(x, y, z) {
  for (const o of OBSTACLES) {
    if (o.kind === 'box') {
      if (x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1 && z > o.z0 && z < o.z1) return o.why;
    } else {
      const dx = o.bx - o.ax, dy = o.by - o.ay, dz = o.bz - o.az, L2 = dx * dx + dy * dy + dz * dz;
      let t = ((x - o.ax) * dx + (y - o.ay) * dy + (z - o.az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(o.ax + dx * t - x, o.ay + dy * t - y, o.az + dz * t - z) < o.r) return o.why;
    }
  }
  return null;
}

/* ---------- wind: light near the valley floor, strong up high, with gusts ---------- */
const WIND_DIR = (function () { const a = 0.32; return { x: Math.cos(a), z: Math.sin(a) }; })(); // blowing from the west-north-west toward the east-south-east
function windAt(x, y, z, t) {
  const k = smooth(20, 320, y);
  const gust = 0.5 + 0.5 * Math.sin(t * 0.53 + x * 0.002) * Math.sin(t * 1.31 + z * 0.0017 + 1.3);
  const speed = 1.8 + 10.5 * k + 4 * k * gust;
  return { x: WIND_DIR.x * speed, z: WIND_DIR.z * speed, speed };
}

/* ---------- radio link: line of sight from the pilot's controller to the drone ---------- */
function signalAt(px, py, pz) {
  const ax = PILOT.x, az = PILOT.z, ay = terrainH(ax, az) + 1.7;
  const dx = px - ax, dy = py - ay, dz = pz - az, D = Math.hypot(dx, dy, dz);
  let worst = 1e9, wx = 0, wz = 0, wy = 0;
  const N = 48;
  for (let i = 1; i < N; i++) {
    const k = i / N;
    if (k * D < 35 || (1 - k) * D < 35) continue;
    const x = ax + dx * k, z = az + dz * k, y = ay + dy * k;
    const c = y - terrainH(x, z);
    if (c < worst) { worst = c; wx = x; wy = y; wz = z; }
  }
  const occl = worst > 1e8 ? 1 : smooth(-22, 8, worst);
  const q = occl * (1 - smooth(1900, 3300, D));
  return { q, worst, block: worst < 0 ? { x: wx, y: wy, z: wz } : null, dist: D };
}
function barsOf(q) { return q >= 0.7 ? 4 : q >= 0.5 ? 3 : q >= 0.3 ? 2 : q >= 0.1 ? 1 : 0; }

/* ---------- battery ---------- */
function drainRate(air, climb, wind) {
  return 0.14 + 0.18 * (air / MAX_H) * (air / MAX_H) + 0.26 * Math.max(0, climb) / MAX_UP + 0.012 * wind; // percent per second
}
function returnAlt(x, y, z) { // altitude the return flight must hold to clear terrain on the straight line home
  let need = 0;
  const L = Math.hypot(x - HOME.x, z - HOME.z), n = Math.max(2, Math.ceil(L / 20));
  for (let i = 0; i <= n; i++) {
    const k = i / n, px = lerp(x, HOME.x, k), pz = lerp(z, HOME.z, k);
    if (Math.hypot(px - HOME.x, pz - HOME.z) < 40) continue;
    need = Math.max(need, terrainH(px, pz) + 40);
  }
  return Math.max(need, 30);
}
function returnCost(d, t) { // estimated battery % to fly home and land from here
  const alt = returnAlt(d.x, d.y, d.z);
  const dist = Math.hypot(d.x - HOME.x, d.z - HOME.z);
  const climb = Math.max(0, alt - d.y), descend = Math.max(alt, d.y) - PAD_TOP;
  const w = windAt(d.x, Math.max(alt, d.y), d.z, t).speed;
  return (climb / MAX_UP) * (0.4 + 0.012 * w) + (dist / 14) * (0.27 + 0.012 * w) + (descend / 4) * 0.16 + 3;
}

/* ---------- drone ---------- */
function newDrone() {
  return { x: HOME.x, y: PAD_TOP + FOOT, z: HOME.z, vx: 0, vy: 0, vz: 0, ax: 0, az: 0, yaw: 0, yr: 0,
    motors: false, spin: 0, landed: true, landT: 0, powerless: false, crashed: null, battery: 100,
    pitchVis: 0, rollVis: 0, wind: { x: 0, z: 0, speed: 0 }, tumble: 0 };
}
function stepDrone(d, c, dt, t) {
  const ev = [];
  const W = windAt(d.x, d.y, d.z, t); d.wind = W;
  if (d.crashed) {
    if (!d.landed) {
      d.vy -= 9.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.tumble += dt;
      const g = groundAt(d.x, d.z), floor = inLake(d.x, d.z) ? LAKE.level - 1.2 : g + FOOT;
      if (d.y <= floor) { d.y = floor; d.vx = d.vy = d.vz = 0; d.landed = true; }
    }
    d.spin = Math.max(0, d.spin - dt * 2);
    return ev;
  }
  if (d.battery <= 0 && !d.powerless && !d.landed) { d.battery = 0; d.powerless = true; d.motors = false; ev.push('powerless'); }
  if (d.battery <= 0) d.battery = 0;

  if (d.landed) {
    d.pitchVis *= 0.8; d.rollVis *= 0.8;
    if (c.thr > 0.25 && d.battery > 0 && !d.motors) { d.motors = true; ev.push('motors'); }
    if (!d.motors) { d.spin = Math.max(0, d.spin - dt * 1.4); return ev; }
    d.spin = Math.min(1, d.spin + dt * 1.6);
    d.battery -= 0.08 * dt;
    if (d.spin < 0.9) return ev;
    if (c.thr > 0.15) { d.landed = false; d.landT = 0; d.vy = 1.2; ev.push('takeoff'); }
    else { d.landT += dt; if (d.landT > 1.6) { d.motors = false; ev.push('motorsOff'); } return ev; }
  }

  const ox = d.x, oy = d.y, oz = d.z;
  if (d.powerless) {
    d.spin = Math.max(0, d.spin - dt * 2.5);
    d.vy -= 9.8 * dt; d.vx *= Math.exp(-dt * 0.15); d.vz *= Math.exp(-dt * 0.15);
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.tumble += dt;
  } else {
    const fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw), rx = Math.cos(d.yaw), rz = -Math.sin(d.yaw);
    const tvx = (fx * c.pitch + rx * c.roll) * MAX_H + W.x * DRIFT;
    const tvz = (fz * c.pitch + rz * c.roll) * MAX_H + W.z * DRIFT;
    const kH = 1 - Math.exp(-dt * 1.9), kV = 1 - Math.exp(-dt * 3.2), kY = 1 - Math.exp(-dt * 6);
    const ovx = d.vx, ovz = d.vz;
    d.vx += (tvx - d.vx) * kH; d.vz += (tvz - d.vz) * kH;
    d.ax = (d.vx - ovx) / dt; d.az = (d.vz - ovz) / dt;
    const agl = d.y - FOOT - groundAt(d.x, d.z);
    const dnMax = lerp(1.1, MAX_DN, smooth(1, 9, agl)); // landing protection: slow descent near the ground
    const tvy = c.thr >= 0 ? c.thr * MAX_UP : c.thr * dnMax;
    d.vy += (tvy - d.vy) * kV;
    d.yr += (c.yaw * MAX_YAW - d.yr) * kY; d.yaw = wrapAng(d.yaw - d.yr * dt);
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    // geofence: soft walls and a ceiling
    if (d.x < FENCE.x0) { d.x = FENCE.x0; d.vx = Math.max(0, d.vx); ev.push('fence'); }
    if (d.x > FENCE.x1) { d.x = FENCE.x1; d.vx = Math.min(0, d.vx); ev.push('fence'); }
    if (d.z < FENCE.z0) { d.z = FENCE.z0; d.vz = Math.max(0, d.vz); ev.push('fence'); }
    if (d.z > FENCE.z1) { d.z = FENCE.z1; d.vz = Math.min(0, d.vz); ev.push('fence'); }
    if (d.y > FENCE.top) { d.y = FENCE.top; d.vy = Math.min(0, d.vy); ev.push('ceiling'); }
    const air = Math.hypot(d.vx - W.x, d.vz - W.z);
    d.battery -= drainRate(air, d.vy, W.speed) * dt;
    d.spin = 1;
    // visual tilt: lean into the air-relative velocity and the acceleration (a drone holding still in wind leans into it)
    const avx = d.vx - W.x * 0.9, avz = d.vz - W.z * 0.9;
    const tp = clamp((avx * fx + avz * fz) * 0.024 + (d.ax * fx + d.az * fz) * 0.03, -0.55, 0.55);
    const tr = clamp((avx * rx + avz * rz) * 0.024 + (d.ax * rx + d.az * rz) * 0.03, -0.55, 0.55);
    d.pitchVis += (tp - d.pitchVis) * (1 - Math.exp(-dt * 8));
    d.rollVis += (tr - d.rollVis) * (1 - Math.exp(-dt * 8));
  }

  // contact with ground, water and trees
  if (SOFT) return softContact(d, ev, ox, oy, oz);
  const g = groundAt(d.x, d.z);
  if (inLake(d.x, d.z) && d.y - FOOT <= LAKE.level) { crash(d, '掉進湖裡了', ev); d.landed = false; return ev; }
  if (d.y - FOOT <= g) {
    const hs = Math.hypot(d.vx, d.vz);
    if (d.powerless) { d.y = g + FOOT; crash(d, '電量耗盡，馬達停轉，飛機摔到地上', ev); d.landed = true; return ev; }
    if (d.vy < -3.4 || hs > 4.5) { d.y = g + FOOT; crash(d, hs > 4.5 ? '撞上山壁了' : '降落太快，摔到地上', ev); d.landed = true; return ev; }
    d.y = g + FOOT; d.vx = d.vy = d.vz = 0; d.landed = true; d.landT = 0; ev.push('landed');
  } else if (treeHit(d.x, d.y, d.z, 0.35)) {
    crash(d, '撞到樹了', ev); d.landed = false; return ev;
  } else {
    const ob = obstacleHit(d.x, d.y, d.z);
    if (ob) { crash(d, ob, ev); d.landed = false; return ev; }
  }
  return ev;
}
// desert contact rules: sand, water, palms and rocks push the drone back, they never end the flight.
// d.hit tells the game where it happened so it can blow sand, knock a sand wall down, and so on.
function softContact(d, ev, ox, oy, oz) {
  const hs = Math.hypot(d.vx, d.vz);
  if (inLake(d.x, d.z) && d.y - FOOT <= LAKE.level + 0.6) { // a cushion of air over the pond
    if (d.powerless) { d.y = LAKE.level - 0.5; crash(d, '電量耗盡，飛機掉進綠洲的水裡', ev); d.landed = true; return ev; }
    d.y = LAKE.level + 0.6 + FOOT; if (d.vy < 0) d.vy = 0;
    d.hit = { x: d.x, z: d.z, y: LAKE.level, s: hs, kind: 'water' }; ev.push('water');
    return ev;
  }
  const g = groundAt(d.x, d.z);
  if (d.y - FOOT <= g) {
    if (d.powerless) { d.y = g + FOOT; d.hit = { x: d.x, z: d.z, y: g, s: 6, kind: 'thud' }; ev.push('thud'); crash(d, '電量耗盡，飛機掉進沙堆裡', ev); d.landed = true; return ev; }
    const e = 1.2, gx = (terrainH(d.x + e, d.z) - terrainH(d.x - e, d.z)) / (2 * e), gz = (terrainH(d.x, d.z + e) - terrainH(d.x, d.z - e)) / (2 * e);
    const sl = Math.hypot(gx, gz);
    if (sl > 0.95) { // a wall of packed sand
      const nx = gx / sl, nz = gz / sl, into = d.vx * nx + d.vz * nz;
      d.hit = { x: d.x + nx * 1.5, z: d.z + nz * 1.5, y: d.y, s: Math.max(into, -d.vy, 1), kind: 'wall' };
      if (into > 0) { d.x = ox; d.z = oz; d.vx -= nx * into * 1.4; d.vz -= nz * into * 1.4; }
      d.x -= nx * 0.15; d.z -= nz * 0.15;
      const g2 = groundAt(d.x, d.z); if (d.y - FOOT < g2) d.y = g2 + FOOT;
      if (d.vy < 0.3) d.vy = 0.3;
      ev.push('wall'); return ev;
    }
    d.y = g + FOOT;
    if (d.vy < -2.2 || hs > 4.5) { // hit the sand hard: a burst of sand, keep flying
      d.hit = { x: d.x, z: d.z, y: g, s: Math.max(-d.vy, hs), kind: 'thud' };
      d.vy = Math.max(0, -d.vy * 0.15); d.vx *= 0.5; d.vz *= 0.5;
      ev.push('thud'); return ev;
    }
    d.vx = d.vy = d.vz = 0; d.landed = true; d.landT = 0; ev.push('landed');
    return ev;
  }
  const t = treeHit(d.x, d.y, d.z, 0.35), ob = t ? null : obstacleHit(d.x, d.y, d.z);
  if (t || ob) { // bounce off a palm, a rock or a tent
    d.hit = { x: d.x, z: d.z, y: d.y, s: Math.hypot(hs, d.vy), kind: t ? 'palm' : 'bump', what: ob };
    d.x = ox; d.y = oy; d.z = oz;
    d.vx *= -0.35; d.vz *= -0.35; d.vy *= -0.2;
    ev.push('bump');
  }
  return ev;
}
function crash(d, why, ev) {
  if (d.crashed) return;
  d.crashed = why; d.motors = false; ev.push('crash');
  if (!d.landed) { d.vx *= 0.3; d.vz *= 0.3; d.vy = Math.min(d.vy, 0); }
}

/* ---------- return to home autopilot (produces stick commands, so it flies the same physics) ---------- */
function newRth(reason, d, t) { return { reason, phase: 'climb', alt: Math.max(returnAlt(d.x, d.y, d.z), reason === 'lost' ? d.y + 25 : 0), recalc: 0 }; }
function rthCommand(d, R, dt, t) {
  const hx = HOME.x - d.x, hz = HOME.z - d.z, dist = Math.hypot(hx, hz);
  const c = { thr: 0, yaw: 0, pitch: 0, roll: 0 };
  if (dist > 6) {
    const want = Math.atan2(-hx, -hz);
    c.yaw = clamp(-wrapAng(want - d.yaw) * 1.6, -1, 1);
  }
  R.recalc -= dt;
  if (R.phase === 'cruise' && R.recalc <= 0) { R.recalc = 0.5; R.alt = returnAlt(d.x, d.y, d.z); }
  let vdx = 0, vdz = 0;
  if (R.phase === 'climb') {
    c.thr = 1;
    if (d.y >= R.alt - 1.5) R.phase = dist > 6 ? 'cruise' : 'descend';
  } else if (R.phase === 'cruise') {
    const sp = Math.min(15, dist * 0.35 + 0.5);
    vdx = hx / dist * sp; vdz = hz / dist * sp;
    c.thr = clamp((R.alt - d.y) * 0.25, -1, 1);
    if (d.y < R.alt - 8) c.thr = 1;
    if (dist < 4) R.phase = 'descend';
  } else {
    vdx = hx * 0.6; vdz = hz * 0.6;
    c.thr = -1;
  }
  const W = d.wind || windAt(d.x, d.y, d.z, t);
  const cx = vdx - W.x * DRIFT, cz = vdz - W.z * DRIFT;
  const fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw), rx = Math.cos(d.yaw), rz = -Math.sin(d.yaw);
  c.pitch = clamp((cx * fx + cz * fz) / MAX_H, -1, 1);
  c.roll = clamp((cx * rx + cz * rz) / MAX_H, -1, 1);
  return c;
}

/* ---------- mission ---------- */
function newMission() { return { stage: 0, rec: 0, time: 0, started: false, lostCount: 0, maxWind: 0, done: false, failed: null }; }
// stage 0 take off, 1 fly to the stream, 2 recording, 3 return and land, 4 complete
function inRecordZone(d) {
  const r = Math.hypot(d.x - TARGET.x, d.z - TARGET.z);
  const agl = d.y - Math.max(groundAt(d.x, d.z), inLake(d.x, d.z) ? LAKE.level : -1e9);
  return r < TARGET.r && agl > TARGET.minAgl && agl < TARGET.maxAgl;
}
