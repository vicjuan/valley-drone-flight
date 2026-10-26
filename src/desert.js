/* ===== Desert scene: palms and shrubs, the camp, the landmarks, blowing sand under the drone,
   sand walls that slump when the drone hits them, and mud-brick ruins that topple.
   Created by game.js after the terrain grid exists; uses the core's terrain functions. ===== */
function DesertWorld(ctx) {
  'use strict';
  const { scene, add, std, small, SUN, SPOTS, sfx } = ctx;
  const V3 = THREE.Vector3;
  const rng = (function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(4242);
  const G = GRID, N = G.N, n = G.n, H = G.h, cdx = G.dx, cdz = G.dz;
  const H0 = new Float32Array(H);
  let maxH = -1e9; for (let i = 0; i < H.length; i++) if (H[i] > maxH) maxH = H[i];

  /* ================= photo spots ================= */
  function flatNear(x, z, r) {
    let best = [x, z], bs = 1e9;
    for (let a = 0; a < 6.283; a += 0.35) for (let d = 0; d <= r; d += 4) {
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, sc = slopeAt(px, pz) + d * 0.0015;
      if (sc < bs) { bs = sc; best = [px, pz]; }
    }
    return best;
  }
  function canyonAt(x, z) { // nearest point on the canyon line and the canyon's direction there
    let bi = 0, bd = 1e18;
    VALLEY.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; bi = i; } });
    const a = VALLEY[Math.max(0, bi - 1)], b = VALLEY[Math.min(VALLEY.length - 1, bi + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1;
    return { x: VALLEY[bi][0], z: VALLEY[bi][1], tx: tx / l, tz: tz / l, w: VALLEY[bi][3] };
  }
  function placeSpots() {
    const put = (id, name, desc, x, z, up, range, extra) => { const y = terrainH(x, z); const sp = Object.assign({ id, name, desc, x, z, y, fy: y + up, range }, extra || {}); SPOTS.push(sp); return sp; };
    { const [x, z] = flatNear(235, -55, 40); put('plane', '老飛機殘骸', '幾十年前迫降在沙漠裡的螺旋槳飛機，一半已經被沙埋住了。', x, z, 2.5, 210); }
    { const [x, z] = flatNear(-235, -25, 40); put('caravan', '駱駝商隊', '正要出發穿越沙漠的駱駝商隊，駝峰上綁滿了貨物。', x, z, 2.4, 210); }
    { // the ruins stand on the open sand at the foot of the cliffs, where the radio link still reaches
      let best = null, bs = 1e9;
      for (let x = -185; x <= -75; x += 5) for (let z = -170; z <= -95; z += 5) {
        const h = terrainH(x, z); if (h > 16) continue;
        let sl = 0, ok = true;
        for (const [a, b] of [[16, 0], [-16, 0], [0, 14], [0, -14], [12, 12], [-12, -12], [12, -12], [-12, 12]]) { const hh = terrainH(x + a, z + b); if (hh > 20) ok = false; sl += Math.abs(hh - h); }
        if (ok && sl < bs) { bs = sl; best = [x, z]; }
      }
      const [x, z] = best || [-120, -130]; put('ruins', '古城遺跡', '懸崖下的古城，牆是用沙土磚砌的，撞到就會倒。', x, z, 3.5, 230); }
    { const c = canyonAt(30, -340), x = c.x - c.tz * 24, z = c.z + c.tx * 24; put('hoodoo', '蘑菇岩', '被風沙吹了幾千年的岩石，下面細上面粗，長得像一朵朵蘑菇。', x, z, 7, 240); }
    { const c = canyonAt(-30, -620); put('arch', '沙岩拱門', '峽谷裡天然形成的石拱門，可以從底下飛過去。', c.x, c.z, 15, 270, { tx: c.tx, tz: c.tz }); }
    { let bh = -1e9, bp = [GIANT.x, GIANT.z];
      for (let x = GIANT.x - 70; x <= GIANT.x + 70; x += 3) for (let z = GIANT.z - 70; z <= GIANT.z + 70; z += 3) { const h = terrainH(x, z); if (h > bh) { bh = h; bp = [x, z]; } }
      put('dune', '鳴沙山', '這一帶最高的沙丘，風吹過的時候，沙子會發出嗡嗡的聲音。', bp[0], bp[1], 3, 430); }
    SPOTS.push({ id: 'oasis', name: '綠洲', desc: '藏在峽谷盡頭的綠洲，棕櫚樹圍著一池清水，也是這次要錄影的地方。', x: LAKE.x, z: LAKE.z, y: LAKE.level, fy: LAKE.level + 1, range: 360 });
    SPOTS.forEach(sp => { sp.got = false; });
  }

  /* ================= terrain look: sand with wind ripples, walls of layered packed sand ================= */
  function material(U) {
    return new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: `
        attribute vec3 aTint; attribute vec2 aShade;
        varying vec3 vPos; varying vec3 vNor; varying vec3 vTint; varying vec2 vShade;
        void main(){ vPos = position; vNor = normal; vTint = aTint; vShade = aShade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D uRock; uniform vec3 uSun, uSunCol, uSky, uGround, uFog, uCam; uniform float uFogD; uniform vec4 uDrone;
        varying vec3 vPos; varying vec3 vNor; varying vec3 vTint; varying vec2 vShade;
        float hash(float n){ return fract(sin(n) * 43758.5453); }
        vec3 tri(float s, vec3 w){
          return texture2D(uRock, vPos.zy * s).rgb * w.x + texture2D(uRock, vPos.xz * s).rgb * w.y + texture2D(uRock, vPos.xy * s).rgb * w.z;
        }
        void main(){
          vec3 n = normalize(vNor);
          vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
          float dist = length(vPos - uCam);
          float steep = 1.0 - n.y;
          // sand: fine grain, large soft colour patches, wind ripples on the gentle slopes
          float g1 = texture2D(uRock, vPos.xz / 6.0).r, g2 = texture2D(uRock, vPos.xz / 57.0).g, g3 = texture2D(uRock, vPos.xz / 430.0).r;
          float warp = (texture2D(uRock, vPos.xz / 210.0).r - 0.5) * 22.0;
          float ph = dot(vPos.xz, vec2(0.951, 0.309)) * 1.45 + warp;
          float r = fract(ph / 6.2832);
          float rip = smoothstep(0.0, 0.72, r) * (1.0 - smoothstep(0.72, 1.0, r)) - 0.45;
          float ripK = (1.0 - smoothstep(18.0, 120.0, dist)) * (1.0 - smoothstep(0.06, 0.28, steep));
          vec3 sand = mix(vec3(0.8, 0.6, 0.39), vec3(0.9, 0.74, 0.52), clamp(0.3 + 0.55 * g3 + 0.3 * (g2 - 0.5), 0.0, 1.0));
          sand *= (0.93 + 0.1 * g1) * (1.0 + 0.16 * rip * ripK);
          // walls: horizontal layers of packed sand, each a slightly different colour, with thin darker seams
          float yy = vPos.y + (texture2D(uRock, vec2((vPos.x + vPos.z) / 560.0, 0.37)).r - 0.5) * 10.0;
          float layer = floor(yy / 3.3), f = fract(yy / 3.3);
          vec3 wcol = mix(vec3(0.80, 0.50, 0.30), vec3(0.95, 0.75, 0.52), hash(layer * 1.37 + 3.1));
          wcol = mix(wcol, vec3(0.66, 0.37, 0.23), step(0.8, hash(layer * 2.71 + 0.3)) * 0.75);
          wcol *= 0.84 + 0.16 * smoothstep(0.0, 0.1, f) * (1.0 - smoothstep(0.9, 1.0, f));
          vec3 rt = tri(1.0 / 17.0, w), rt2 = tri(1.0 / 95.0, w);
          wcol *= (0.62 + 0.5 * rt.r) * (0.85 + 0.25 * rt2.g);
          float wallK = smoothstep(0.34, 0.6, steep);
          vec3 alb = mix(sand, wcol, wallK) * vTint;
          float diff = max(dot(n, uSun), 0.0) * vShade.x;
          vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5) * vShade.y;
          vec3 col = alb * (uSunCol * diff * 1.08 + amb);
          vec2 dd = vPos.xz - uDrone.xz; float hg = uDrone.y - vPos.y;
          float rr = 0.75 + max(hg, 0.0) * 0.025;
          float sh = (1.0 - smoothstep(rr * 0.35, rr, length(dd))) * (1.0 - smoothstep(1.5, 50.0, hg)) * step(-0.6, hg) * uDrone.w;
          col *= 1.0 - 0.5 * sh;
          col = mix(col, uFog, 1.0 - exp(-pow(dist * uFogD, 2.0)));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
  }
  function tint(x, z, h, sl, out) {
    let r = 1, g = 1, b = 1;
    const lk = Math.hypot(x - LAKE.x, z - LAKE.z);
    const wet = (1 - smooth(LAKE.r * 0.95, LAKE.r * 1.45, lk)) * (1 - smooth(LAKE.level + 0.4, LAKE.level + 3.5, h));
    r = lerp(r, 0.62, wet); g = lerp(g, 0.56, wet); b = lerp(b, 0.48, wet);
    const grass = (1 - smooth(LAKE.r * 1.2, LAKE.r * 2.7, lk)) * (1 - smooth(0.15, 0.4, sl)) * smooth(0.0, 0.5, 0.5 + fbm(x * 0.03, z * 0.03, 2));
    r = lerp(r, 0.6, grass * 0.85); g = lerp(g, 0.82, grass * 0.85); b = lerp(b, 0.4, grass * 0.85);
    out[0] = r; out[1] = g; out[2] = b;
  }
  function mapColor(x, z, h, sl, lit, out) { // the minimap
    let r = 0.97, g = 0.8, b = 0.56;
    const wall = smooth(0.5, 1.2, sl); r = lerp(r, 0.78, wall); g = lerp(g, 0.5, wall); b = lerp(b, 0.33, wall);
    const lk = Math.hypot(x - LAKE.x, z - LAKE.z);
    const grass = 1 - smooth(LAKE.r * 1.2, LAKE.r * 2.4, lk); r = lerp(r, 0.55, grass * 0.7); g = lerp(g, 0.72, grass * 0.7); b = lerp(b, 0.4, grass * 0.7);
    const v = 0.45 + 0.6 * lit;
    out[0] = r * v; out[1] = g * v; out[2] = b * v;
    if (h < LAKE.level + 0.4 && lk < LAKE.r * 2) { out[0] = 0.3; out[1] = 0.55; out[2] = 0.62; }
  }

  /* ================= small helpers for models ================= */
  const gAdd = (geo, mat, x, y, z, parent, sx, sy, sz) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); if (sx) o.scale.set(sx, sy, sz); parent.add(o); return o; };
  const prism = (w, h, d, mat) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.lineTo(-w / 2, 0); const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return new THREE.Mesh(g, mat); };
  function roughen(geo, amt, seed, sc) { // bumpy rock: the same position always moves the same way, so seams stay closed
    const p = geo.attributes.position, v = new V3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      p.setXYZ(i, v.x + gnoise(v.x * sc + seed, v.y * sc + v.z * sc * 0.7) * amt, v.y + gnoise(v.y * sc - seed, v.z * sc + 2.1) * amt * 0.6, v.z + gnoise(v.z * sc + 4.4, v.x * sc - seed) * amt);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const rock = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0, flatShading: true });
  // a world box obstacle around a rotated local box
  function boxObstacle(cx, cz, yaw, hx, hz, y0, y1, why) {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), ex = hx * c + hz * s, ez = hx * s + hz * c;
    OBSTACLES.push({ kind: 'box', x0: cx - ex, x1: cx + ex, y0, y1, z0: cz - ez, z1: cz + ez, why });
  }
  const segObstacle = (a, b, r, why) => OBSTACLES.push({ kind: 'seg', ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r, why });

  const camelG = { body: new THREE.SphereGeometry(1, 12, 9), leg: new THREE.CylinderGeometry(0.08, 0.11, 1.5, 6), neck: new THREE.CylinderGeometry(0.14, 0.22, 1.3, 7), head: new THREE.BoxGeometry(0.62, 0.3, 0.28), box: new THREE.BoxGeometry(1, 1, 1) };
  function camel(parent, x, y, z, yaw, coat, load) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; parent.add(g);
    const m = std(coat, 0.9);
    const part = (geo, mat, px, py, pz, sx, sy, sz, rz) => { const o = gAdd(geo, mat, px, py, pz, g, sx || 1, sy || 1, sz || 1); if (rz) o.rotation.z = rz; return o; };
    part(camelG.body, m, 0, 1.78, 0, 1.4, 0.62, 0.55);
    part(camelG.body, m, -0.1, 2.3, 0, 0.62, 0.5, 0.45);
    for (const [lx, lz, a] of [[0.85, 0.28, 0.12], [0.85, -0.28, -0.1], [-0.9, 0.28, -0.08], [-0.9, -0.28, 0.1]]) part(camelG.leg, m, lx, 0.76, lz, 1, 1, 1, a);
    part(camelG.neck, m, 1.55, 2.05, 0, 1, 1, 1, -0.75);
    part(camelG.head, m, 2.12, 2.55, 0);
    part(camelG.box, std(0x5a4632, 0.9), 2.42, 2.5, 0, 0.16, 0.16, 0.2);
    part(camelG.leg, m, -1.42, 1.55, 0, 0.5, 0.45, 0.5, 0.5);
    if (load) {
      part(camelG.box, std(load, 0.8), -0.1, 2.72, 0, 1.1, 0.16, 1.3);
      part(camelG.box, std(0xd8c39a, 0.9), -0.1, 2.2, 0.72, 0.8, 0.7, 0.35);
      part(camelG.box, std(0xd8c39a, 0.9), -0.1, 2.2, -0.72, 0.8, 0.7, 0.35);
    }
    return g;
  }
  const robeG = new THREE.CylinderGeometry(0.2, 0.36, 1.55, 9), headG = new THREE.SphereGeometry(0.16, 10, 8), wrapG = new THREE.CylinderGeometry(0.19, 0.19, 0.16, 10);
  function person(x, z, robe, wrap) {
    const y = terrainH(x, z), g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    gAdd(robeG, std(robe, 0.9), 0, 0.78, 0, g); gAdd(headG, std(0xb88660, 0.7), 0, 1.72, 0, g); gAdd(wrapG, std(wrap, 0.8), 0, 1.83, 0, g);
  }
  function tent(x, z, yaw, col) {
    const y = terrainH(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; scene.add(g);
    const roof = prism(5.2, 2.7, 4.4, std(col, 0.95)); g.add(roof);
    const stripe = prism(5.3, 0.5, 4.5, std(0x9c3b2a, 0.9)); stripe.position.y = 1.0; stripe.scale.set(0.62, 1, 1); g.add(stripe);
    gAdd(new THREE.BoxGeometry(1.8, 0.04, 1.3), std(0xa33a2c, 0.9), 0, 0.03, 2.9, g);
    gAdd(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 5), std(0x6b4a2c, 0.8), 0, 1.45, 2.25, g);
    boxObstacle(x, z, yaw, 2.8, 2.4, y - 1, y + 2.8, '帳篷');
  }

  /* ================= palms and shrubs ================= */
  const SHR = [];
  let shrubs = null;
  function frondGeometry() {
    const pos = [], idx = [], NF = 12, SEG = 7;
    for (let f = 0; f < NF; f++) {
      const yaw = f / NF * Math.PI * 2 + (f % 2) * 0.22, up = f % 3 === 0 ? 0.42 : f % 3 === 1 ? 0.12 : -0.15;
      const c = Math.cos(yaw), s = Math.sin(yaw), base = pos.length / 3, len = 0.85 + (f % 4) * 0.06;
      for (let k = 0; k <= SEG; k++) {
        const t = k / SEG, h = up * t - 0.6 * t * t, w = 0.15 * Math.sin(Math.PI * Math.min(1, t * 1.12)) + 0.012;
        const cx = t * len * c, cz = t * len * s;
        // left edge, centre rib, right edge: the leaflets hang down from the rib
        pos.push(cx - s * w, h - w * 0.55, cz + c * w, cx, h, cz, cx + s * w, h - w * 0.55, cz - c * w);
        if (k) { const a = base + (k - 1) * 3, b = base + k * 3; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function buildPlants(keep) {
    const P = TREES.filter(t => t.palm && keep(t));
    const tg = new THREE.CylinderGeometry(0.62, 1, 1, 8, 6); tg.translate(0, 0.5, 0);
    { const p = tg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + 0.12 * Math.sin(y * 38); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } tg.computeVertexNormals(); }
    const trunks = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ color: 0xffffff }), P.length);
    const crowns = new THREE.InstancedMesh(frondGeometry(), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), P.length);
    const m = new THREE.Matrix4(), sh = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    P.forEach((t, i) => {
      const kx = t.lean * Math.cos(t.yaw), kz = t.lean * Math.sin(t.yaw), rad = 0.24 + t.H * 0.006;
      m.makeScale(rad, t.H, rad); sh.set(1, kx, 0, 0, 0, 1, 0, 0, 0, kz, 1, 0, 0, 0, 0, 1); m.premultiply(sh); m.setPosition(t.x, t.y, t.z);
      trunks.setMatrixAt(i, m); trunks.setColorAt(i, c.setHex(0x8a6a48).multiplyScalar(0.85 + t.c * 0.3));
      q.setFromAxisAngle(new V3(0, 1, 0), t.yaw * 3.1);
      m.compose(new V3(t.cx, t.y + t.H, t.cz), q, new V3(t.crown * 1.05, t.crown * 0.95, t.crown * 1.05));
      crowns.setMatrixAt(i, m); crowns.setColorAt(i, c.setHex(0x4f7426).lerp(new THREE.Color(0x8a9a3a), t.c * 0.7));
    });
    [trunks, crowns].forEach(o => { o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; scene.add(o); });
    // dry desert shrubs, greener near the water
    const NSH = small ? 300 : 620;
    shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), NSH);
    for (let k = 0; k < NSH * 10 && SHR.length < NSH; k++) {
      const nearO = k % 3 === 0;
      const x = nearO ? LAKE.x + (rng() - 0.5) * 380 : lerp(-950, 950, rng()), z = nearO ? LAKE.z + (rng() - 0.5) * 380 : lerp(-1500, 380, rng());
      if (Math.hypot(x - HOME.x, z - HOME.z) < 35) continue;
      const lk = Math.hypot(x - LAKE.x, z - LAKE.z); if (lk < LAKE.r * 1.15) continue;
      if (slopeAt(x, z) > 0.3) continue;
      if (SPOTS.some(sp => sp.id !== 'oasis' && sp.id !== 'dune' && Math.hypot(sp.x - x, sp.z - z) < 30)) continue;
      const s = 0.45 + rng() * 0.9;
      SHR.push({ x, z, s, sy: s * (0.45 + rng() * 0.35), yaw: rng() * 6.28, green: 1 - smooth(LAKE.r * 1.5, LAKE.r * 4, lk), c: rng() });
    }
    SHR.forEach((o, i) => setShrub(o, i));
    shrubs.count = SHR.length; shrubs.instanceMatrix.needsUpdate = true; if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true; scene.add(shrubs);
  }
  const shM = new THREE.Matrix4(), shQ = new THREE.Quaternion(), shC = new THREE.Color(), UPV = new V3(0, 1, 0);
  function setShrub(o, i) {
    shQ.setFromAxisAngle(UPV, o.yaw);
    shM.compose(new V3(o.x, terrainH(o.x, o.z) + o.sy * 0.25, o.z), shQ, new V3(o.s, o.sy, o.s * 0.9));
    shrubs.setMatrixAt(i, shM);
    shrubs.setColorAt(i, shC.setHex(0x8d7c4c).lerp(new THREE.Color(0x5d7a33), o.green).multiplyScalar(0.8 + o.c * 0.35));
  }

  /* ================= the camp, the landmarks ================= */
  let ruins = null;
  function buildCamp() {
    tent(-21, 17, 0.35, 0xe9dcc3); tent(18, 21, -0.4, 0xd9c7a2); tent(-3, 34, 0.08, 0xefe4cf);
    for (const [x, z, s] of [[7, 13, 0.9], [8.2, 13.6, 0.6], [-27, 9, 0.8], [24, 12, 0.7]]) { const y = terrainH(x, z); add(new THREE.BoxGeometry(s, s * 0.75, s), std(0x9b7448, 0.9), x, y + s * 0.37, z); }
    // a windsock shows which way the wind blows
    const wy = terrainH(13, 6);
    add(new THREE.CylinderGeometry(0.05, 0.06, 5.5, 6), std(0xd9dde0, 0.5, 0.4), 13, wy + 2.75, 6);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.18, 2.1, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.8, side: THREE.DoubleSide }));
    sock.position.set(13 + WIND_DIR.x * 1.05, wy + 5.3, 6 + WIND_DIR.z * 1.05); sock.rotation.set(0, Math.atan2(-WIND_DIR.z, WIND_DIR.x), -Math.PI / 2 + 0.12); scene.add(sock);
    person(-23, 12, 0x2f4a6a, 0xf2efe6);
  }
  function buildLandmarks() {
    for (const sp of SPOTS) {
      if (sp.id === 'plane') {
        const g = new THREE.Group(); g.position.set(sp.x, sp.y - 0.9, sp.z); g.rotation.set(0.04, 0.8, -0.07); scene.add(g);
        const alu = std(0xc9c3b6, 0.55, 0.35), rust = std(0x8d5a3b, 0.9), red = std(0xa7493a, 0.7), glass = std(0x2c3d48, 0.2, 0.5), dark = std(0x3a3632, 0.8);
        const fus = gAdd(new THREE.CylinderGeometry(1.35, 0.7, 15, 18), alu, 0, 1.6, 0, g); fus.rotation.z = Math.PI / 2; // nose toward -x
        gAdd(new THREE.SphereGeometry(1.35, 16, 12), alu, -7.5, 1.6, 0, g, 0.85, 1, 1);
        gAdd(new THREE.BoxGeometry(2.3, 0.8, 1.7), glass, -5.8, 2.6, 0, g);
        for (const sd of [-1, 1]) gAdd(new THREE.BoxGeometry(12.5, 0.32, 0.06), red, 0.4, 1.65, sd * 1.22, g);
        gAdd(new THREE.BoxGeometry(2.8, 0.32, 9), alu, -2, 1.25, 5.6, g);
        const brk = gAdd(new THREE.BoxGeometry(2.8, 0.32, 5), alu, -2, 0.75, -3.4, g); brk.rotation.x = -0.2;
        const piece = gAdd(new THREE.BoxGeometry(2.4, 0.3, 3.4), alu, 3.5, 0.3, -9.5, g); piece.rotation.set(0.12, 0.7, 0.05);
        for (const sd of [-1, 1]) {
          const eng = gAdd(new THREE.CylinderGeometry(0.62, 0.55, 2.3, 12), alu, -3.4, 1.15, sd * 3.4, g); eng.rotation.z = Math.PI / 2;
          for (let k = 0; k < 3; k++) { const b = gAdd(new THREE.BoxGeometry(0.1, 1.9, 0.26), dark, -4.65, 1.15, sd * 3.4, g); b.rotation.x = k * 2.094 + (sd > 0 ? 0.3 : 0); if (sd < 0 && k === 1) b.rotation.z = 0.5; }
        }
        const fin = gAdd(new THREE.BoxGeometry(2.3, 2.8, 0.22), alu, 7.1, 3.1, 0, g); fin.rotation.z = -0.25;
        gAdd(new THREE.BoxGeometry(1.9, 0.2, 5.2), alu, 7.3, 2.0, 0, g);
        for (const [x, y, z, sx, sz] of [[1, 2.9, 0.4, 2.2, 1.3], [-3.5, 2.1, 1.3, 1.4, 0.06], [4, 1.5, -1.2, 1.6, 0.06]]) gAdd(new THREE.BoxGeometry(sx, 0.05, sz), rust, x, y, z, g);
        gAdd(new THREE.SphereGeometry(3, 14, 8), std(0xe0b984, 1), 1.2, 0.2, 2.6, g, 1.7, 0.33, 0.9);
        g.updateMatrixWorld(true);
        const w = (x, y, z) => g.localToWorld(new V3(x, y, z));
        segObstacle(w(-8.5, 1.6, 0), w(7.8, 1.9, 0), 1.6, '老飛機');
        segObstacle(w(-2, 1.25, 10), w(-2, 1.0, -5.5), 1.0, '老飛機');
        segObstacle(w(7, 2.0, 0), w(7.4, 4.4, 0), 1.2, '老飛機');
        sp.fy = sp.y + 2;
      } else if (sp.id === 'caravan') {
        const dir = 0.95, cs = Math.cos(dir), sn = Math.sin(dir), loads = [0xa83a2c, 0x2f5f8a, 0xc79a2e, 0x6a8a3a, 0xa83a2c];
        let first = null, lastP = null;
        for (let i = 0; i < 5; i++) {
          const along = i * 5.2 - 10, x = sp.x + cs * along, z = sp.z - sn * along, y = terrainH(x, z);
          camel(scene, x, y - 0.05, z, dir + (rng() - 0.5) * 0.15, i % 2 ? 0xc7995f : 0xb9894f, loads[i]);
          const p = new V3(x, y + 1.7, z); if (!first) first = p; lastP = p;
        }
        person(sp.x + cs * 15.5, sp.z - sn * 15.5, 0x324a6e, 0x2c3c78); person(sp.x - cs * 13, sp.z + sn * 13 + 1.6, 0xe8e2d4, 0xf3efe4);
        segObstacle(first.clone().add(new V3(-cs * 2.5, 0, sn * 2.5)), lastP.clone().add(new V3(cs * 3, 0, -sn * 3)), 2.1, '駱駝');
        sp.fy = sp.y + 2.3;
      } else if (sp.id === 'hoodoo') {
        const stem = rock(0xc88a5a), cap = rock(0x86543a);
        for (const [dx, dz, h, cr] of [[0, 0, 9, 3.8], [9, 7, 6.5, 2.8], [-8, 9, 7.6, 3.2], [6, -10, 5.2, 2.4], [-10, -5, 4.2, 2.0]]) {
          const x = sp.x + dx, z = sp.z + dz, y = terrainH(x, z) - 0.6;
          add(roughen(new THREE.CylinderGeometry(cr * 0.42, cr * 0.62, h, 9, 4), 0.35, dx, 0.6), stem, x, y + h / 2, z);
          add(roughen(new THREE.CylinderGeometry(cr * 0.75, cr * 1.0, 1.6, 9, 1), 0.3, dz, 0.7), stem, x, y + 0.6, z);
          const c = add(roughen(new THREE.DodecahedronGeometry(cr, 1), cr * 0.12, dx + dz, 0.5), cap, x, y + h + cr * 0.3, z); c.scale.y = 0.55;
          segObstacle(new V3(x, y, z), new V3(x, y + h, z), cr * 0.62 + 0.2, '蘑菇岩');
          OBSTACLES.push({ kind: 'box', x0: x - cr, x1: x + cr, y0: y + h - cr * 0.3, y1: y + h + cr * 0.85, z0: z - cr, z1: z + cr, why: '蘑菇岩' });
        }
        sp.fy = terrainH(sp.x, sp.z) + 7.5;
      } else if (sp.id === 'arch') {
        const nx = -sp.tz, nz = sp.tx, y = Math.min(terrainH(sp.x + nx * 15, sp.z + nz * 15), terrainH(sp.x - nx * 15, sp.z - nz * 15), terrainH(sp.x, sp.z));
        const R = 15, T = 3.6, leg = 6;
        const g = new THREE.Group(); g.position.set(sp.x, y, sp.z); g.rotation.y = Math.atan2(-nz, nx); scene.add(g);
        const mat = rock(0xc0714a);
        const arc = gAdd(roughen(new THREE.TorusGeometry(R, T, 10, 34, Math.PI), 0.7, 3.3, 0.22), mat, 0, leg, 0, g); arc.scale.z = 1.5;
        for (const sd of [-1, 1]) {
          gAdd(roughen(new THREE.CylinderGeometry(T * 1.05, T * 1.35, leg + 2.5, 10, 3), 0.55, sd * 7, 0.3), mat, sd * R, leg / 2 - 1, 0, g, 1, 1, 1.45);
          for (let k = 0; k < 4; k++) gAdd(roughen(new THREE.DodecahedronGeometry(0.8 + rng() * 1.1, 0), 0.25, k + sd, 0.8), rock(0x9a5a3a), sd * (R + 3 + rng() * 5), 0.3, (rng() - 0.5) * 9, g);
        }
        g.updateMatrixWorld(true);
        const w = (x, yy, z) => g.localToWorld(new V3(x, yy, z));
        for (let k = 0; k < 12; k++) {
          const a0 = k / 12 * Math.PI, a1 = (k + 1) / 12 * Math.PI;
          segObstacle(w(R * Math.cos(a0), leg + R * Math.sin(a0), 0), w(R * Math.cos(a1), leg + R * Math.sin(a1), 0), T * 1.25, '石拱門');
        }
        for (const sd of [-1, 1]) segObstacle(w(sd * R, -2, 0), w(sd * R, leg, 0), T * 1.4, '石拱門');
        sp.y = y; sp.fy = y + leg + R * 0.55;
      } else if (sp.id === 'ruins') {
        buildRuins(sp);
      } else if (sp.id === 'oasis') {
        const ring = (a, r) => [LAKE.x + Math.cos(a) * LAKE.r * r, LAKE.z + Math.sin(a) * LAKE.r * r];
        { const [x, z] = ring(2.6, 1.55), y = terrainH(x, z); // a stone well
          const stone = rock(0x9e9384);
          add(roughen(new THREE.CylinderGeometry(1.5, 1.6, 1.1, 14, 1, true), 0.08, 1, 2), stone, x, y + 0.5, z).material.side = THREE.DoubleSide;
          for (const sd of [-1, 1]) add(new THREE.CylinderGeometry(0.09, 0.1, 2.6, 6), std(0x6b4a2c, 0.8), x + sd * 1.3, y + 1.3, z);
          add(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), std(0x6b4a2c, 0.8), x, y + 2.55, z).rotation.z = Math.PI / 2;
          add(new THREE.CylinderGeometry(0.25, 0.2, 0.35, 8), std(0x6d6f72, 0.5, 0.5), x, y + 1.7, z);
          OBSTACLES.push({ kind: 'box', x0: x - 1.8, x1: x + 1.8, y0: y - 1, y1: y + 2.8, z0: z - 1.8, z1: z + 1.8, why: '水井' });
          removeTreesNear(x, z, 6); }
        { const [x, z] = ring(3.3, 1.7), y = terrainH(x, z), a = Math.atan2(LAKE.z - z, LAKE.x - x); // a mud-brick hut
          const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = -a - Math.PI / 2; scene.add(g);
          const mud = std(0xc49466, 0.95);
          gAdd(new THREE.BoxGeometry(5, 3.2, 4), mud, 0, 1.5, 0, g); gAdd(new THREE.BoxGeometry(5.4, 0.35, 4.4), std(0x9b7448, 0.9), 0, 3.2, 0, g);
          gAdd(new THREE.BoxGeometry(1.1, 2, 0.08), std(0x5b3a24, 0.8), 0, 1, 2.02, g);
          for (const sx of [-1.6, 1.6]) gAdd(new THREE.BoxGeometry(0.6, 0.6, 0.08), std(0x2b2520, 0.9), sx, 2, 2.02, g);
          boxObstacle(x, z, a, 3.1, 3.1, y - 1, y + 3.6, '小屋');
          removeTreesNear(x, z, 8); }
        tent(...ring(4.1, 1.75), 0.9, 0xe2d2b5);
        { const [x, z] = ring(4.1, 1.75); removeTreesNear(x, z, 6); }
        { const [x, z] = ring(5.0, 1.65), y = terrainH(x, z); camel(scene, x, y - 0.9, z, 1.2, 0xc7995f, 0xa83a2c); }
      }
    }
  }

  /* ================= mud-brick ruins: walls of bricks that topple when hit ================= */
  function buildRuins(sp) {
    const yaw = 0.35, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const toW = (lx, lz) => [sp.x + lx * cs + lz * sn, sp.z - lx * sn + lz * cs];
    const L = 1.25, Hb = 0.62, T = 0.95;
    const walls = [[-12, -9, 12, -9], [12, -9, 12, 9], [12, 9, 2.6, 9], [-2.6, 9, -12, 9], [-12, 9, -12, -9], [-12, 0, -3.5, 0], [3, -17, 13, -15]];
    const bricks = [];
    walls.forEach((wl, wi) => {
      const len = Math.hypot(wl[2] - wl[0], wl[3] - wl[1]), ncol = Math.max(1, Math.round(len / L));
      const [ax, az] = toW(wl[0], wl[1]), [bx, bz] = toW(wl[2], wl[3]), ang = Math.atan2(-(bz - az), bx - ax);
      for (let c = 0; c < ncol; c++) {
        const t = (c + 0.5) / ncol, x = lerp(ax, bx, t), z = lerp(az, bz, t), gb = terrainH(x, z);
        const rows = 6 - Math.floor(3.2 * clamp01(0.5 + 0.9 * gnoise(c * 0.35 + wi * 3.1, wi * 1.7))) - (wi === 6 ? 2 : 0);
        for (let r = 0; r < rows; r++) {
          const y = gb - 0.2 + Hb * (r + 0.5);
          bricks.push({ x0: x, y0: y, z0: z, yaw: ang, x, y, z, ax: 0, ay: ang, az: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, state: 0, wall: wi, col: c, row: r, c: rng() });
        }
      }
    });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(L * 0.97, Hb * 0.94, T), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), bricks.length);
    const col = new THREE.Color();
    bricks.forEach((b, i) => mesh.setColorAt(i, col.setHex(0xc49466).multiplyScalar(0.82 + b.c * 0.24)));
    scene.add(mesh);
    // a round watchtower at one corner (solid, it does not fall)
    const [tx, tz] = toW(12, -9), ty = terrainH(tx, tz), mud = std(0xbf8f60, 0.95);
    add(roughen(new THREE.CylinderGeometry(2.6, 3.0, 7.5, 14, 3), 0.12, 5, 1), mud, tx, ty + 3.4, tz);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; add(new THREE.BoxGeometry(0.9, 0.8, 0.9), mud, tx + Math.cos(a) * 2.3, ty + 7.5, tz + Math.sin(a) * 2.3); }
    segObstacle(new V3(tx, ty - 1, tz), new V3(tx, ty + 8, tz), 3.2, '古城的塔');
    ruins = { bricks, mesh, cx: sp.x, cz: sp.z, L, Hb, T, top: sp.y + 6, moving: 0, cool: 0 };
    syncBricks(true);
    sp.fy = sp.y + 3;
  }
  const bM = new THREE.Matrix4(), bQ = new THREE.Quaternion(), bE = new THREE.Euler(), bP = new V3(), bS = new V3(1, 1, 1);
  function syncBricks(all) {
    if (!ruins) return;
    ruins.bricks.forEach((b, i) => { if (!all && b.state !== 1 && !b.dirty) return; b.dirty = false; bE.set(b.ax, b.ay, b.az, 'YXZ'); bQ.setFromEuler(bE); bM.compose(bP.set(b.x, b.y, b.z), bQ, bS); ruins.mesh.setMatrixAt(i, bM); });
    ruins.mesh.instanceMatrix.needsUpdate = true;
  }
  function knock(hitB, dvx, dvz) {
    let cnt = 0;
    const hl = Math.hypot(dvx, dvz) || 1;
    for (const q of ruins.bricks) {
      if (q.state !== 0 || q.wall !== hitB.wall) continue;
      const dc = Math.abs(q.col - hitB.col);
      if ((dc <= 2 && q.row >= hitB.row - 1) || (dc === 3 && q.row >= hitB.row + 1 && rng() < 0.6) || (dc <= 1 && rng() < 0.35)) {
        q.state = 1; cnt++;
        const sp = 1.4 + rng() * 2.6;
        q.vx = dvx / hl * sp + (rng() - 0.5) * 1.6; q.vz = dvz / hl * sp + (rng() - 0.5) * 1.6; q.vy = 0.4 + rng() * 2 + Math.max(0, q.row - hitB.row) * 0.25;
        q.wx = (rng() - 0.5) * 7; q.wy = (rng() - 0.5) * 3; q.wz = (rng() - 0.5) * 7;
      }
    }
    ruins.moving += cnt;
    return cnt;
  }
  function updateRuins(dt, d, airborne) {
    if (!ruins) return;
    ruins.cool -= dt;
    // the drone against standing bricks
    if (airborne && ruins.cool <= 0 && Math.hypot(d.x - ruins.cx, d.z - ruins.cz) < 30 && d.y < ruins.top + 2) {
      const ex = ruins.L / 2 + 0.38, ey = ruins.Hb / 2 + 0.3, ez = ruins.T / 2 + 0.38;
      for (const q of ruins.bricks) {
        if (q.state !== 0 || Math.abs(d.y - q.y) > ey) continue;
        const dx = d.x - q.x, dz = d.z - q.z, c = Math.cos(q.ay), s = Math.sin(q.ay);
        if (Math.abs(dx * c - dz * s) < ex && Math.abs(dx * s + dz * c) < ez) {
          const vx = d.vx, vz = d.vz, n0 = knock(q, Math.abs(vx) + Math.abs(vz) > 0.5 ? vx : -dx, Math.abs(vx) + Math.abs(vz) > 0.5 ? vz : -dz);
          d.vx = -vx * 0.3 + (dx > 0 ? 0.6 : -0.6); d.vz = -vz * 0.3 + (dz > 0 ? 0.6 : -0.6);
          d.x += d.vx * 0.06; d.z += d.vz * 0.06;
          ruins.cool = 0.35;
          burst(q.x, q.y, q.z, 10 + n0, 'brick'); burst(q.x, q.y - 0.5, q.z, 6, 'cloud');
          sfx.bricks(n0); if (ctx.onBricks) ctx.onBricks(n0);
          break;
        }
      }
    }
    if (!ruins.moving) return;
    let moving = 0;
    for (const q of ruins.bricks) {
      if (q.state !== 1) continue;
      q.vy -= 9.8 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.ax += q.wx * dt; q.ay += q.wy * dt; q.az += q.wz * dt;
      const g = terrainH(q.x, q.z);
      if (q.y - ruins.Hb * 0.45 < g) {
        q.y = g + ruins.Hb * 0.45;
        if (q.vy < -1.5) burst(q.x, g, q.z, 2, 'brick');
        if (q.vy < 0) q.vy = -q.vy * 0.25;
        q.vx *= 0.55; q.vz *= 0.55; q.wx *= 0.5; q.wy *= 0.5; q.wz *= 0.5;
        if (Math.abs(q.vy) < 0.7 && Math.hypot(q.vx, q.vz) < 0.6) { // settle lying on a face
          q.state = 2; q.dirty = true;
          const snap = a => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
          q.ax = snap(q.ax); q.az = snap(q.az);
          bE.set(q.ax, q.ay, q.az, 'YXZ'); bM.makeRotationFromEuler(bE); const e = bM.elements;
          q.y = g + Math.abs(e[1]) * ruins.L / 2 + Math.abs(e[5]) * ruins.Hb / 2 + Math.abs(e[9]) * ruins.T / 2 - 0.08;
          continue;
        }
      }
      moving++;
    }
    syncBricks(false);
    ruins.moving = moving;
  }

  /* ================= particles: blowing sand, dust clouds, spray, leaves ================= */
  const PN = small ? 1100 : 2200;
  const px = new Float32Array(PN), py = new Float32Array(PN), pz = new Float32Array(PN), pvx = new Float32Array(PN), pvy = new Float32Array(PN), pvz = new Float32Array(PN);
  const age = new Float32Array(PN).fill(9), life = new Float32Array(PN).fill(1), s0 = new Float32Array(PN), s1 = new Float32Array(PN), a0 = new Float32Array(PN), drag = new Float32Array(PN), grav = new Float32Array(PN);
  const posA = new Float32Array(PN * 3), sizeA = new Float32Array(PN), alphaA = new Float32Array(PN), colA = new Float32Array(PN * 3);
  let head = 0, liveN = 0;
  const pgeo = new THREE.BufferGeometry();
  const mkAttr = (arr, k) => { const a = new THREE.BufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); return a; };
  pgeo.setAttribute('position', mkAttr(posA, 3)); pgeo.setAttribute('aSize', mkAttr(sizeA, 1)); pgeo.setAttribute('aAlpha', mkAttr(alphaA, 1)); pgeo.setAttribute('aCol', mkAttr(colA, 3));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 }, uFog: { value: ctx.FOG }, uFogD: { value: ctx.FOG_D } },
    transparent: true, depthWrite: false,
    vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aCol; uniform float uScale; varying float vA; varying vec3 vC; varying float vD;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(0.25, -mv.z);
        gl_PointSize = clamp(aSize * uScale / d, 0.0, 480.0); vA = aAlpha * smoothstep(0.25, 1.4, d); vC = aCol; vD = d; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uFog; uniform float uFogD; varying float vA; varying vec3 vC; varying float vD;
      void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r = dot(p, p); if (r > 1.0 || vA < 0.004) discard;
        float a = vA * (1.0 - r) * (1.0 - 0.5 * r);
        vec3 c = mix(vC, uFog, 1.0 - exp(-pow(vD * uFogD, 2.0))); gl_FragColor = vec4(c, a); }`,
  });
  const points = new THREE.Points(pgeo, pmat); points.frustumCulled = false; points.renderOrder = 6; scene.add(points);
  const PCOL = { sand: [0.8, 0.69, 0.55], grain: [0.6, 0.44, 0.29], cloud: [0.86, 0.75, 0.6], spray: [0.9, 0.95, 1.0], leaf: [0.38, 0.52, 0.2], brick: [0.78, 0.58, 0.42] };
  function emit(x, y, z, vx, vy, vz, lf, sa, sb, al, dr, gr, col, shade) {
    const i = head; head = (head + 1) % PN;
    px[i] = x; py[i] = y; pz[i] = z; pvx[i] = vx; pvy[i] = vy; pvz[i] = vz; age[i] = 0; life[i] = lf; s0[i] = sa; s1[i] = sb; a0[i] = al; drag[i] = dr; grav[i] = gr;
    const k = shade || 1; colA[i * 3] = col[0] * k; colA[i * 3 + 1] = col[1] * k; colA[i * 3 + 2] = col[2] * k;
  }
  function burst(x, y, z, cnt, kind) {
    for (let i = 0; i < cnt; i++) {
      const a = rng() * 6.283, r = rng(), ca = Math.cos(a), sa = Math.sin(a);
      if (kind === 'sand') emit(x + ca * r, y + 0.2, z + sa * r, ca * (3 + 6 * r), 1.5 + 4 * rng(), sa * (3 + 6 * r), 1.1 + rng(), 0.4 + 0.4 * rng(), 2.2 + 2.5 * rng(), 0.5, 1.5, 1.6, PCOL.sand, 0.85 + 0.25 * rng());
      else if (kind === 'cloud') emit(x + ca * r * 5, y + rng() * 4, z + sa * r * 5, ca * (0.6 + r), 0.5 + 1.3 * rng(), sa * (0.6 + r), 3 + 1.6 * rng(), 2.5 + 2 * rng(), 6 + 5 * rng(), 0.24, 0.6, -0.12, PCOL.cloud, 0.85 + 0.2 * rng());
      else if (kind === 'grain') emit(x, y, z, ca * 1.5 * r, -0.5 - rng(), sa * 1.5 * r, 1 + 0.6 * rng(), 0.5 + 0.5 * rng(), 0.9 + 0.8 * rng(), 0.75, 0.3, 9.8, PCOL.grain, 0.8 + 0.3 * rng());
      else if (kind === 'spray') emit(x + ca * r * 1.5, y + 0.1, z + sa * r * 1.5, ca * (2 + 4 * r), 1.5 + 3 * rng(), sa * (2 + 4 * r), 0.7 + 0.4 * rng(), 0.18 + 0.15 * rng(), 0.6 + 0.6 * rng(), 0.55, 0.8, 7, PCOL.spray, 1);
      else if (kind === 'leaf') emit(x + ca * r * 2, y + rng(), z + sa * r * 2, ca * 2, 0.5 + rng(), sa * 2, 1.4 + rng(), 0.25, 0.3, 0.9, 1.2, 2.5, PCOL.leaf, 0.8 + 0.4 * rng());
      else if (kind === 'brick') emit(x + ca * r, y, z + sa * r, ca * (1 + 3 * r), 0.8 + 2 * rng(), sa * (1 + 3 * r), 1.2 + rng(), 0.6 + 0.5 * rng(), 2.6 + 2 * rng(), 0.45, 1.2, 0.8, PCOL.brick, 0.85 + 0.25 * rng());
    }
  }
  function updateParticles(dt, cam) {
    liveN = 0;
    for (let i = 0; i < PN; i++) {
      if (age[i] >= life[i]) { if (alphaA[i] !== 0) { alphaA[i] = 0; sizeA[i] = 0; } continue; }
      age[i] += dt; liveN++;
      const k = Math.exp(-drag[i] * dt);
      pvx[i] *= k; pvz[i] *= k; pvy[i] = pvy[i] * k - grav[i] * dt;
      px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pz[i] += pvz[i] * dt;
      if (grav[i] > 3) { const g = terrainH(px[i], pz[i]); if (py[i] < g) { py[i] = g; pvy[i] = 0; pvx[i] *= 0.5; pvz[i] *= 0.5; } }
      const t = Math.min(1, age[i] / life[i]);
      posA[i * 3] = px[i]; posA[i * 3 + 1] = py[i]; posA[i * 3 + 2] = pz[i];
      sizeA[i] = lerp(s0[i], s1[i], Math.sqrt(t));
      alphaA[i] = a0[i] * Math.pow(1 - t, 1.6) * Math.min(1, age[i] * 10);
    }
    for (const nm of ['position', 'aSize', 'aAlpha', 'aCol']) pgeo.attributes[nm].needsUpdate = true;
    const fov = cam.fov * Math.PI / 180, hpx = ctx.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    pmat.uniforms.uScale.value = hpx / (2 * Math.tan(fov / 2));
  }

  /* ================= sand walls that slump: the height grid relaxes to the angle of repose ================= */
  let terr = null;
  function attachTerrain(geo, vis, ao) {
    terr = { geo, vis, ao, pos0: geo.attributes.position.array.slice(), nor0: geo.attributes.normal.array.slice(), sh0: geo.attributes.aShade.array.slice(), vis0: vis.slice(), ao0: ao.slice() };
  }
  const TANR = 0.66, LIM = TANR * cdx, LIMD = TANR * cdx * Math.SQRT2;
  const jobs = [];
  let changed = false;
  const dirty = { r0: 1e9, r1: -1 };
  function collapseAt(x, z, y, power) {
    if (!terr) return false;
    for (const j of jobs) if (Math.hypot(j.x - x, j.z - z) < 9 && j.age < 1.6) { j.left = Math.max(j.left, 160); return false; }
    if (jobs.length > 5) return false;
    const R = 8 + 6 * clamp(power / 8, 0, 1.4);
    const ci = Math.round((x - INNER.x0) / cdx), cj = Math.round((z - INNER.z0) / cdz), rc = Math.ceil((R + 3) / cdx) + 1;
    const i0 = Math.max(1, ci - rc), i1 = Math.min(n - 1, ci + rc), j0 = Math.max(1, cj - rc), j1 = Math.min(n - 1, cj + rc);
    if (i0 >= i1 || j0 >= j1) return false;
    const W = i1 - i0 + 1, Hh = j1 - j0 + 1, w = new Float32Array(W * Hh), prev = new Float32Array(W * Hh);
    let steepN = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const wx = INNER.x0 + i * cdx, wz = INNER.z0 + j * cdz, k = j * N + i;
      const d = Math.hypot(wx - x, wz - z) + 2.2 * gnoise(wx * 0.25 + 3.3, wz * 0.25 - 1.1);
      const wk = 1 - smooth(R * 0.45, R, d);
      w[(j - j0) * W + (i - i0)] = wk; prev[(j - j0) * W + (i - i0)] = H[k];
      if (wk > 0.3 && (Math.abs(H[k + 1] - H[k - 1]) > LIM * 2.4 || Math.abs(H[k + N] - H[k - N]) > LIM * 2.4)) steepN++;
    }
    if (steepN < 2) return false; // nothing steep enough here to fall
    jobs.push({ x, z, y, R, i0, i1, j0, j1, W, w, prev, left: 420, age: 0 });
    changed = true;
    sfx.collapse(clamp(power / 6, 0.5, 1.3));
    burst(x, y, z, 14, 'cloud');
    return true;
  }
  function relax(job) {
    const { i0, i1, j0, j1, W, w } = job;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const wk = w[(j - j0) * W + (i - i0)]; if (wk <= 0) continue;
      const k = j * N + i; let hk = H[k];
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        if (!a && !b) continue;
        const nk = k + b * N + a, diff = hk - H[nk] - (a && b ? LIMD : LIM);
        if (diff > 0) { const m = diff * 0.22 * wk; hk -= m; H[nk] += m; }
      }
      H[k] = hk;
    }
  }
  function syncCells(r0, r1, c0, c1) {
    const pos = terr.geo.attributes.position.array, nor = terr.geo.attributes.normal.array;
    r0 = Math.max(0, r0); r1 = Math.min(n, r1); c0 = Math.max(0, c0); c1 = Math.min(n, c1);
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) {
      const k = j * N + i; pos[k * 3 + 1] = H[k];
      const hl = H[j * N + Math.max(0, i - 1)], hr = H[j * N + Math.min(n, i + 1)], hu = H[Math.max(0, j - 1) * N + i], hd = H[Math.min(n, j + 1) * N + i];
      let nx = -(hr - hl) / (2 * cdx), nz = -(hd - hu) / (2 * cdz), ny = 1; const l = Math.hypot(nx, ny, nz);
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    }
    dirty.r0 = Math.min(dirty.r0, r0); dirty.r1 = Math.max(dirty.r1, r1);
  }
  function flush() {
    if (dirty.r1 < 0 || !terr) return;
    const geo = terr.geo, off = dirty.r0 * N, cnt = (dirty.r1 - dirty.r0 + 1) * N;
    for (const [nm, sz] of [['position', 3], ['normal', 3], ['aShade', 2]]) { const a = geo.attributes[nm]; a.updateRange.offset = off * sz; a.updateRange.count = cnt * sz; a.needsUpdate = true; }
    dirty.r0 = 1e9; dirty.r1 = -1;
  }
  // light and crevice shading for the cells around a finished collapse (same method as the bake in game.js)
  function reshade(i0, i1, j0, j1) {
    const L = Math.hypot(SUN.x, SUN.z), ux = SUN.x / L, uz = SUN.z / L, rise = SUN.y / L, step0 = Math.min(cdx, cdz) * 1.4;
    const vis = terr.vis, ao = terr.ao, shade = terr.geo.attributes.aShade.array;
    const shadowLen = Math.ceil(80 / rise / cdx); // the changed cells can now cast or stop casting shadow downsun
    const vi0 = Math.max(0, Math.min(i0, i0 - Math.round(ux * shadowLen))), vi1 = Math.min(n, Math.max(i1, i1 - Math.round(ux * shadowLen)));
    const vj0 = Math.max(0, Math.min(j0, j0 - Math.round(uz * shadowLen))), vj1 = Math.min(n, Math.max(j1, j1 - Math.round(uz * shadowLen)));
    for (let j = vj0; j <= vj1; j++) for (let i = vi0; i <= vi1; i++) {
      const k = j * N + i, h0 = H[k] + 0.6, x0 = i * cdx, z0 = j * cdz;
      let v = 1;
      for (let s = step0; ; s += s > 260 ? step0 * 2 : step0) {
        const rh = h0 + s * rise; if (rh > maxH) break;
        const fi = (x0 + ux * s) / cdx, fj = (z0 + uz * s) / cdz;
        if (fi < 0 || fj < 0 || fi >= n || fj >= n) break;
        const o = (H[(fj | 0) * N + (fi | 0)] - rh + 1.5) / (s * 0.05 + 3);
        if (o > 0) { v = Math.min(v, 1 - o); if (v <= 0) { v = 0; break; } }
      }
      vis[k] = v; shade[k * 2] = v;
    }
    const r1 = Math.max(1, Math.round(12 / cdx)), r2 = Math.max(2, Math.round(40 / cdx));
    const avg = (i, j, r) => { let s = 0; for (const [a, b] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) s += H[Math.min(n, Math.max(0, j + b)) * N + Math.min(n, Math.max(0, i + a))]; return s / 8; };
    const ai0 = Math.max(0, i0 - r2), ai1 = Math.min(n, i1 + r2), aj0 = Math.max(0, j0 - r2), aj1 = Math.min(n, j1 + r2);
    for (let j = aj0; j <= aj1; j++) for (let i = ai0; i <= ai1; i++) {
      const k = j * N + i, h = H[k];
      ao[k] = clamp(0.97 + (h - avg(i, j, r1)) / 10 + (h - avg(i, j, r2)) / 50, 0.5, 1.12); shade[k * 2 + 1] = ao[k];
    }
    dirty.r0 = Math.min(dirty.r0, Math.min(vj0, aj0)); dirty.r1 = Math.max(dirty.r1, Math.max(vj1, aj1));
  }
  function updateJobs(dt) {
    for (let q = jobs.length - 1; q >= 0; q--) {
      const job = jobs[q];
      job.age += dt;
      const it = Math.min(job.left, Math.ceil(dt * 230));
      for (let k = 0; k < it; k++) relax(job);
      job.left -= it;
      syncCells(job.j0 - 1, job.j1 + 1, job.i0 - 1, job.i1 + 1);
      // sand pouring down the face, dust billowing at the foot
      let spawned = 0;
      for (let tries = 0; tries < 40 && spawned < 9; tries++) {
        const a = (rng() * job.W) | 0, b = (rng() * (job.j1 - job.j0 + 1)) | 0, k = (job.j0 + b) * N + job.i0 + a, idx = b * job.W + a;
        const drop = job.prev[idx] - H[k];
        if (drop > 0.06) {
          const wx = INNER.x0 + (job.i0 + a) * cdx, wz = INNER.z0 + (job.j0 + b) * cdz;
          burst(wx + (rng() - 0.5) * cdx, H[k] + 0.6, wz + (rng() - 0.5) * cdz, 1, 'grain');
          if (rng() < 0.25) burst(wx, H[k], wz, 1, 'cloud');
          spawned++;
        }
        job.prev[idx] = H[k];
      }
      if (job.left <= 0) {
        reshade(job.i0 - 1, job.i1 + 1, job.j0 - 1, job.j1 + 1);
        for (let i = 0; i < SHR.length; i++) { const o = SHR[i]; if (Math.abs(o.x - job.x) < job.R + 6 && Math.abs(o.z - job.z) < job.R + 6) setShrub(o, i); }
        if (shrubs) shrubs.instanceMatrix.needsUpdate = true;
        jobs.splice(q, 1);
      }
    }
  }

  /* ================= per frame ================= */
  let wash = 0, nearT = 0, nearCool = 0, washAcc = 0, cool = {};
  const st = { wash: 0, dust: 0 };
  function update(dt, now, d, o) { // o: { playing, airborne, thrust, camera, camMode }
    // the propellers blow sand (or water) up from below the drone
    const overW = inLake(d.x, d.z), surf = overW ? LAKE.level : groundAt(d.x, d.z);
    const agl = d.y - FOOT - surf;
    let I = d.crashed ? 0 : (1 - smooth(1.2, 8.5, agl)) * d.spin * (0.55 + 0.45 * clamp(o.thrust, 0, 1.3));
    if (Math.hypot(d.x - HOME.x, d.z - HOME.z) < PAD_R + 1.2) I *= 0.25;
    wash += (I - wash) * (1 - Math.exp(-dt * 6));
    if (I > 0.02) {
      washAcc += I * (small ? 130 : 230) * dt;
      while (washAcc >= 1) {
        washAcc -= 1;
        const a = rng() * 6.283, r0 = 0.4 + rng() * 1.8, ca = Math.cos(a), sa = Math.sin(a), sp = (3 + 5 * rng()) * (0.55 + 0.45 * I);
        if (overW) { emit(d.x + ca * r0, surf + 0.1, d.z + sa * r0, ca * sp + d.vx * 0.3, 0.5 + 2.5 * rng() * I, sa * sp + d.vz * 0.3, 0.6 + 0.4 * rng(), 0.15 + 0.15 * rng(), 0.5 + 0.6 * rng(), 0.5, 0.8, 6, PCOL.spray, 1); continue; }
        if (rng() < 0.6) // grains thrown up and out, falling back in an arc
          emit(d.x + ca * r0, surf + 0.12 + rng() * 0.3, d.z + sa * r0, ca * sp * 1.4 + d.vx * 0.3, 1.0 + 3.2 * rng() * I, sa * sp * 1.4 + d.vz * 0.3, 0.6 + 0.6 * rng(), 0.18 + 0.18 * rng(), 0.35 + 0.35 * rng(), 0.9, 1.0, 5, PCOL.grain, 0.95 + 0.25 * rng());
        else // puffs of fine dust rolling up and out
          emit(d.x + ca * r0 * 1.3, surf + 0.3, d.z + sa * r0 * 1.3, ca * sp + d.vx * 0.3, 1.2 + 3.2 * rng() * I, sa * sp + d.vz * 0.3, 1.3 + 1.2 * rng(), 0.8 + 0.5 * rng(), 2.8 + 2.4 * rng(), 0.6, 1.3, 0.3, PCOL.sand, 0.9 + 0.15 * rng());
      }
    }
    // hovering right next to a sand wall: the downwash brings it down
    nearCool -= dt;
    if (o.airborne && !d.crashed && nearCool <= 0) {
      let hitP = null;
      for (let k = 0; k < 8 && !hitP; k++) {
        const a = k / 8 * 6.283, qx = d.x + Math.cos(a) * 2.6, qz = d.z + Math.sin(a) * 2.6, th = terrainH(qx, qz);
        if (th > d.y - FOOT - 0.4 && slopeAt(qx, qz) > 0.95) hitP = [qx, qz];
      }
      if (hitP) { nearT += dt; if (nearT > 0.7) { nearT = 0; nearCool = 1.4; collapseAt(hitP[0], hitP[1], d.y, 3 + 3 * wash); } }
      else nearT = Math.max(0, nearT - dt * 2);
    }
    updateRuins(dt, d, o.airborne);
    updateJobs(dt);
    flush();
    if (jobs.length && d.landed) { const g = groundAt(d.x, d.z); if (d.y - FOOT < g) d.y = g + FOOT; }
    updateParticles(dt, o.camera);
    // how much dust is between the camera and the scene
    const cam = o.camera.position;
    const camNear = o.camMode === 2 ? 0 : 1 - smooth(3, 14, Math.hypot(cam.x - d.x, cam.y - (surf + 1.5), cam.z - d.z));
    let dust = wash * camNear * (overW ? 0.25 : 0.6);
    for (const j of jobs) dust += 0.22 * (1 - smooth(10, 45, Math.hypot(cam.x - j.x, cam.y - j.y, cam.z - j.z))) * (1 - smooth(1.5, 3.5, j.age));
    st.wash = overW ? 0 : wash; st.spray = overW ? wash : 0; st.dust = clamp(dust, 0, 0.5);
    return st;
  }
  function onHit(h) {
    if (!h) return;
    const now = performance.now() / 1000;
    const ok = (k, gap) => { if (cool[k] && now - cool[k] < gap) return false; cool[k] = now; return true; };
    if (h.kind === 'wall') {
      collapseAt(h.x, h.z, h.y, h.s + 2);
      if (ok('wall', 0.3)) burst(h.x, h.y, h.z, 18, 'sand');
    } else if (h.kind === 'thud') {
      if (ok('thud', 0.25)) { burst(h.x, h.y, h.z, Math.round(18 + 6 * h.s), 'sand'); burst(h.x, h.y, h.z, 4, 'cloud'); sfx.thud(clamp(h.s / 8, 0.3, 1)); }
    } else if (h.kind === 'water') {
      if (h.s > 3 && ok('water', 0.4)) { burst(h.x, h.y, h.z, 24, 'spray'); sfx.splash(); }
    } else if (h.kind === 'palm') {
      if (ok('palm', 0.35)) { burst(h.x, h.y, h.z, 14, 'leaf'); sfx.bump(0.6); }
    } else if (ok('bump', 0.3)) { burst(h.x, h.y, h.z, 8, 'brick'); sfx.bump(1); }
  }
  function reset() {
    jobs.length = 0; nearT = 0; wash = 0;
    if (changed && terr) {
      H.set(H0); terr.vis.set(terr.vis0); terr.ao.set(terr.ao0);
      const at = terr.geo.attributes;
      at.position.array.set(terr.pos0); at.normal.array.set(terr.nor0); at.aShade.array.set(terr.sh0);
      for (const nm of ['position', 'normal', 'aShade']) { at[nm].updateRange.count = -1; at[nm].needsUpdate = true; }
      SHR.forEach((o, i) => setShrub(o, i)); if (shrubs) shrubs.instanceMatrix.needsUpdate = true;
      changed = false;
    }
    if (ruins) { ruins.bricks.forEach(b => { b.state = 0; b.x = b.x0; b.y = b.y0; b.z = b.z0; b.ax = 0; b.ay = b.yaw; b.az = 0; }); ruins.moving = 0; syncBricks(true); }
    age.fill(9);
  }
  function buildAll() { buildLandmarks(); buildCamp(); buildPlants(() => true); } // landmarks first: they clear palms out of their way
  return { placeSpots, material, tint, mapColor, buildAll, attachTerrain, update, onHit, reset, collapseAt,
    get jobs() { return jobs.length; }, get live() { return liveN; }, get ruins() { return ruins; } };
}
