(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const app = $('app'), host = $('gl');
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const small = coarse || Math.min(window.innerWidth, window.innerHeight) < 640;
  app.classList.add('sticks'); // the two on-screen sticks show on every device: fingers on phones, the mouse on computers
  if (coarse) { app.classList.add('touch'); $('helpKeys').hidden = true; }
  $('ctrlHelp2').innerHTML = $('ctrlHelp').innerHTML.replace(/ id="help(Keys|Touch)"/g, '');
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  function fail(msg) {
    $('loading').innerHTML = '<div class="card"><p>' + msg + '</p></div>';
  }
  setTimeout(init, 40);

  function init() {
    if (!window.THREE) { fail('3D 引擎沒有載入成功，請重新整理頁面再試一次。'); return; }
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
    catch (e) { fail('這台裝置的瀏覽器無法顯示 3D 畫面，請換用電腦或較新的手機瀏覽器開啟。'); return; }
    let pixelRatio = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      $('loading').innerHTML = '<div class="card"><p>3D 畫面被系統暫停了（可能是記憶體不足或切換到背景太久）。請重新整理頁面再玩一次。</p></div>';
      $('loading').hidden = false;
    });
    host.appendChild(renderer.domElement);
    const V3 = THREE.Vector3;

    /* ================= world data ================= */
    const G = buildGrid(small ? 320 : 512);
    buildTrees(small ? 1700 : 3300, 11);

    /* ================= photo spots ================= */
    const SPOTS = [];
    const vNear = (x, z) => { let b = 0, bd = 1e18; VALLEY.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
    const vTan = i => { const a = VALLEY[Math.max(0, i - 1)], b = VALLEY[Math.min(VALLEY.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    const reach = (c, nn, sd, need) => { let k = 8; for (; k < 200; k += 2) if (terrainH(c[0] + nn[0] * sd * k, c[1] + nn[1] * sd * k) >= c[2] + need) break; return k; };
    function flatSpot(x, z, r) {
      let best = [x, z], bs = 1e9;
      for (let a = 0; a < 6.28; a += 0.5) for (let d = 0; d <= r; d += 6) {
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, sl = slopeAt(px, pz);
        if (sl < bs && roadDist(px, pz) > 12) { bs = sl; best = [px, pz]; }
      }
      return best;
    }
    { const [x, z] = flatSpot(58, -238, 24), y = terrainH(x, z);
      SPOTS.push({ id: 'cabin', name: '登山山屋', desc: '林道旁的登山小屋，登山客在這裡休息過夜。', x, z, y, fy: y + 3, range: 190 }); removeTreesNear(x, z, 32); }
    { const [x, z] = flatSpot(-58, -395, 20), y = terrainH(x, z);
      SPOTS.push({ id: 'tree', name: '千年神木', desc: '樹齡上千年的紅檜，比旁邊的杉樹高出一倍。', x, z, y, fy: y + 20, range: 260 });
      removeTreesNear(x, z, 16); addTreeObj({ x, z, y: y - 0.5, H: 40, r: 8, c: 0, yaw: 0, giant: true }); }
    { const i = vNear(-145, -735), c = VALLEY[i], t = vTan(i), nn = [-t[1], t[0]], need = 28;
      const kA = reach(c, nn, 1, need), kB = reach(c, nn, -1, need), y = c[2] + need;
      const A = [c[0] + nn[0] * kA, c[1] + nn[1] * kA], B = [c[0] - nn[0] * kB, c[1] - nn[1] * kB];
      SPOTS.push({ id: 'bridge', name: '峽谷吊橋', desc: '橫跨峽谷的吊橋，橋下就是溪流。', x: (A[0] + B[0]) / 2, z: (A[1] + B[1]) / 2, y, fy: y - 2, range: 270, A, B, deckY: y }); }
    { const i = vNear(-60, -930), c = VALLEY[i], t = vTan(i), nn = [-t[1], t[0]], need = 78;
      const k1 = reach(c, nn, 1, need), k2 = reach(c, nn, -1, need), sd = k1 <= k2 ? 1 : -1, k = Math.min(k1, k2);
      let foot = k; while (foot > 6 && terrainH(c[0] + nn[0] * sd * foot, c[1] + nn[1] * sd * foot) > c[2] + 3) foot -= 1;
      const pts = [];
      for (let j = 0; j <= 28; j++) { const d = k - (k - foot) * j / 28, px = c[0] + nn[0] * sd * d, pz = c[1] + nn[1] * sd * d; pts.push([px, terrainH(px, pz), pz]); }
      const midY = (pts[0][1] + pts[28][1]) / 2; let mid = pts[14]; for (const pp of pts) if (Math.abs(pp[1] - midY) < Math.abs(mid[1] - midY)) mid = pp;
      SPOTS.push({ id: 'fall', name: '峽谷瀑布', desc: '從峽谷岩壁一路沖下來的瀑布，靠近就聽得到水聲。', x: mid[0], z: mid[2], y: mid[1], fy: mid[1] + 2, range: 270, pts, t });
      for (const pp of pts) removeTreesNear(pp[0], pp[2], 10); }
    { // a pavilion on flat ground at the lake shore, on the side you fly in from
      let best = null, bsc = -1e9;
      for (let a = 0; a < 6.283; a += 0.05) for (let r = LAKE.r * 0.9; r <= LAKE.r * 2.6; r += 4) {
        const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r, h = terrainH(x, z);
        if (h < LAKE.level + 1.2 || h > LAKE.level + 7) continue;
        const sl = slopeAt(x, z); if (sl > 0.25) continue;
        valleyInfo(x, z); if (VI_R && VI_D < 26) continue;
        const sc = Math.sin(a) * 2 - sl * 4 - (h - LAKE.level) * 0.15;
        if (sc > bsc) { bsc = sc; best = { x, z, h }; }
      }
      if (!best) { const x = LAKE.x, z = LAKE.z + LAKE.r * 1.4; best = { x, z, h: terrainH(x, z) }; }
      SPOTS.push({ id: 'pavilion', name: '湖畔涼亭', desc: '湖邊的六角涼亭和木棧道，是看湖景最好的地方。', x: best.x, z: best.z, y: best.h, fy: best.h + 3.5, range: 230 });
      removeTreesNear(best.x, best.z, 18); }
    SPOTS.push({ id: 'lake', name: '山中湖', desc: '藏在山谷深處的高山湖泊，湖水倒映著藍天和山壁，也是這次要錄影的地方。', x: LAKE.x, z: LAKE.z, y: LAKE.level, fy: LAKE.level + 1, range: 360 });
    { let best = -1e9, bp = [-414, -764];
      for (let x = -460; x <= -100; x += 6) for (let z = -820; z <= -360; z += 6) { const h = terrainH(x, z); if (h > best) { best = h; bp = [x, z]; } }
      SPOTS.push({ id: 'station', name: '山頂氣象站', desc: '山頂上的無人氣象站，量風速和雨量。上面風很大。', x: bp[0], z: bp[1], y: best, fy: best + 5, range: 290 }); }
    SPOTS.forEach(sp => { sp.got = false; });
    const SUN = new V3(-0.72, 0.56, 0.41).normalize();

    // bake sun visibility and crevice darkening on the height grid
    const N = G.N, n = G.n, H = G.h;
    const vis = new Float32Array(N * N), ao = new Float32Array(N * N);
    (function bake() {
      let maxH = -1e9; for (let i = 0; i < H.length; i++) if (H[i] > maxH) maxH = H[i];
      const L = Math.hypot(SUN.x, SUN.z), ux = SUN.x / L, uz = SUN.z / L, rise = SUN.y / L;
      const step0 = Math.min(G.dx, G.dz) * 1.4;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i, h0 = H[k] + 0.6, x0 = i * G.dx, z0 = j * G.dz;
        let v = 1;
        for (let s = step0; ; s += s > 260 ? step0 * 2 : step0) {
          const rh = h0 + s * rise; if (rh > maxH) break;
          const fi = (x0 + ux * s) / G.dx, fj = (z0 + uz * s) / G.dz;
          if (fi < 0 || fj < 0 || fi >= n || fj >= n) break;
          const th = H[(fj | 0) * N + (fi | 0)];
          const o = (th - rh + 1.5) / (s * 0.05 + 3);
          if (o > 0) { v = Math.min(v, 1 - o); if (v <= 0) { v = 0; break; } }
        }
        vis[k] = v;
      }
      const avg = (i, j, r) => {
        let s = 0, c = 0;
        for (const [a, b] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
          const ii = Math.min(n, Math.max(0, i + a)), jj = Math.min(n, Math.max(0, j + b)); s += H[jj * N + ii]; c++;
        }
        return s / c;
      };
      const r1 = Math.max(1, Math.round(12 / G.dx)), r2 = Math.max(2, Math.round(40 / G.dx));
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i, h = H[k];
        ao[k] = clamp(0.97 + (h - avg(i, j, r1)) / 10 + (h - avg(i, j, r2)) / 50, 0.5, 1.12);
      }
    })();

    /* ================= rock texture (tileable, grey-white with dark cracks) ================= */
    const rockCanvas = (function () {
      const S = small ? 256 : 512, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
      const hh = (ix, iy, sd) => { let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(sd, 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
      const vn = (x, y, px, py, sd) => {
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const L = (i, j) => hh(((i % px) + px) % px, ((j % py) + py) % py, sd);
        const A = L(x0, y0), B = L(x0 + 1, y0), C = L(x0, y0 + 1), D = L(x0 + 1, y0 + 1);
        return A + (B - A) * sx + (C - A) * sy + (A - B - C + D) * sx * sy;
      };
      const fbmT = (u, v, bx, by, oct, sd) => { let s = 0, a = 0.5, nn = 0, fx = bx, fy = by; for (let o = 0; o < oct; o++, fx *= 2, fy *= 2, a *= 0.5) { s += a * vn(u * fx, v * fy, fx, fy, sd + o); nn += a; } return s / nn; };
      const vor = (u, v, cells, sd) => { // distance to the nearest cell edge (F2 - F1), tileable
        const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y);
        let f1 = 9, f2 = 9;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const cx = xi + a, cy = yi + b, wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
          const px = cx + hh(wx, wy, sd), py = cy + hh(wx, wy, sd + 7);
          const dd = Math.hypot(px - x, py - y);
          if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
        }
        return f2 - f1;
      };
      const wrap1 = t => t - Math.floor(t);
      const ridgedT = (u, v, base, oct, sd) => { let s = 0, a = 1, nn = 0, f = base, w = 1; for (let o = 0; o < oct; o++, f *= 2, a *= 0.55) { let r = 1 - Math.abs(2 * vn(u * f, v * f, f, f, sd + o) - 1); r *= r; s += a * r * w; nn += a; w = Math.min(1, r * 1.6); } return s / nn; };
      // a small rocky height field, lit from the upper left: reads as rough rock at any angle
      const hf = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const wu = wrap1(u + 0.09 * (fbmT(u, v, 5, 5, 3, 5) - 0.5)), wv = wrap1(v + 0.09 * (fbmT(u, v, 5, 5, 3, 9) - 0.5));
        hf[y * S + x] = 0.6 * ridgedT(wu, wv, 7, 6, 20) + 0.4 * fbmT(wu, wv, 11, 11, 4, 1);
      }
      const lx = -0.5, ly = -0.55, lz = 0.67, bump = S / 9;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S, k = y * S + x;
        const hx = hf[y * S + ((x + 1) % S)] - hf[y * S + ((x - 1 + S) % S)], hy = hf[((y + 1) % S) * S + x] - hf[((y - 1 + S) % S) * S + x];
        let nx = -hx * bump, ny = -hy * bump, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const lit = 0.42 + 0.68 * Math.max(0, nx * lx + ny * ly + nz * lz);
        const cav = smooth(0.12, 0.55, hf[k]);
        let val = lit * (0.42 + 0.62 * cav);
        val *= 1 - 0.32 * smooth(0.56, 0.8, fbmT(u, v, 6, 6, 4, 60));
        val *= 1 - 0.18 * smooth(0.6, 0.85, fbmT(u, v, 28, 4, 3, 90));
        val += (hh(x, y, 99) - 0.5) * 0.07;
        val = clamp(val, 0.08, 1);
        const warm = (fbmT(u, v, 3, 3, 2, 80) - 0.5) * 0.07;
        const i = k * 4;
        d[i] = clamp(val + warm, 0, 1) * 255; d[i + 1] = clamp(val + warm * 0.4, 0, 1) * 255; d[i + 2] = clamp(val - warm * 0.2 + 0.015, 0, 1) * 255; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    })();
    const rockTex = new THREE.CanvasTexture(rockCanvas);
    rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
    rockTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    rockTex.generateMipmaps = true; rockTex.minFilter = THREE.LinearMipmapLinearFilter;

    /* ================= scene ================= */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.15, 17000);
    const FOG = new THREE.Color(0.83, 0.865, 0.9), FOG_D = 0.00024;
    const SKY_TOP = new THREE.Color(0.55, 0.69, 0.84), SUN_COL = new THREE.Color(1.0, 0.975, 0.93);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(15000, 32, 16), new THREE.ShaderMaterial({
      uniforms: { top: { value: SKY_TOP }, bot: { value: FOG }, sunDir: { value: SUN } },
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; varying vec3 vDir;' +
        'void main(){ float h = clamp(vDir.y * 2.2 + 0.02, 0.0, 1.0); vec3 c = mix(bot, top, pow(h, 0.7));' +
        'float s = max(dot(normalize(vDir), sunDir), 0.0); c += vec3(1.0,0.96,0.88) * (pow(s, 1200.0) * 1.2 + pow(s, 18.0) * 0.12);' +
        'gl_FragColor = vec4(c, 1.0); }',
    }));
    sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

    scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x8d8b7c, 0.78));
    const dirLight = new THREE.DirectionalLight(0xfff8ee, 0.78); dirLight.position.copy(SUN).multiplyScalar(100); scene.add(dirLight);

    /* ---------- terrain shader ---------- */
    const terrainUniforms = {
      uRock: { value: rockTex }, uSun: { value: SUN }, uSunCol: { value: SUN_COL },
      uSky: { value: new THREE.Color(0.66, 0.71, 0.78) }, uGround: { value: new THREE.Color(0.42, 0.41, 0.38) },
      uFog: { value: FOG }, uFogD: { value: FOG_D }, uCam: { value: new V3() }, uDrone: { value: new THREE.Vector4(0, -999, 0, 0) },
      uRoad: { value: ROAD.map(p => new THREE.Vector2(p[0], p[1])) }, uRoadS: { value: [] },
    };
    { let s = 0; terrainUniforms.uRoadS.value.push(0); for (let i = 1; i < ROAD.length; i++) { s += Math.hypot(ROAD[i][0] - ROAD[i - 1][0], ROAD[i][1] - ROAD[i - 1][1]); terrainUniforms.uRoadS.value.push(s); } }
    const NR = ROAD.length;
    const terrainMat = new THREE.ShaderMaterial({
      uniforms: terrainUniforms,
      vertexShader: `
        attribute vec3 aTint; attribute vec2 aShade;
        varying vec3 vPos; varying vec3 vNor; varying vec3 vTint; varying vec2 vShade;
        void main(){ vPos = position; vNor = normal; vTint = aTint; vShade = aShade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D uRock; uniform vec3 uSun, uSunCol, uSky, uGround, uFog, uCam; uniform float uFogD; uniform vec4 uDrone;
        uniform vec2 uRoad[${NR}]; uniform float uRoadS[${NR}];
        varying vec3 vPos; varying vec3 vNor; varying vec3 vTint; varying vec2 vShade;
        vec3 tri(float s, vec3 w){
          return texture2D(uRock, vPos.zy * s).rgb * w.x + texture2D(uRock, vPos.xz * s).rgb * w.y + texture2D(uRock, vPos.xy * s).rgb * w.z;
        }
        void main(){
          vec3 n = normalize(vNor);
          vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
          float dist = length(vPos - uCam);
          vec3 t1 = tri(1.0 / 23.0, w);
          vec3 t2 = tri(1.0 / 160.0, w);
          vec3 t3 = tri(1.0 / 900.0, w);
          float far = smoothstep(220.0, 1500.0, dist);
          vec3 tex = mix(t1, t2, far * 0.75) * (0.55 + 0.55 * t2.g) * (0.72 + 0.4 * t3.r);
          float steep = 1.0 - n.y;
          float band = texture2D(uRock, vec2(vPos.y / 7.0, (vPos.x + vPos.z) / 650.0)).r;
          tex *= mix(1.0, 0.7 + 0.42 * band, smoothstep(0.3, 0.75, steep));
          vec3 alb = vTint * tex;
          // dirt road with pale edge markers
          float rd = 1e9, rs = 0.0;
          if (vPos.x > ${Math.min(...ROAD.map(p => p[0])) - 12}.0 && vPos.x < ${Math.max(...ROAD.map(p => p[0])) + 12}.0 && vPos.z > ${Math.min(...ROAD.map(p => p[1])) - 12}.0 && vPos.z < ${Math.max(...ROAD.map(p => p[1])) + 12}.0)
          for (int i = 0; i < ${NR - 1}; i++) {
            vec2 a = uRoad[i], b = uRoad[i + 1], ab = b - a; float L = length(ab);
            float t = clamp(dot(vPos.xz - a, ab) / (L * L), 0.0, 1.0);
            float d = length(vPos.xz - (a + ab * t));
            if (d < rd) { rd = d; rs = uRoadS[i] + t * L; }
          }
          if (rd < 6.0) {
            float road = 1.0 - smoothstep(2.4, 3.4, rd);
            float rut = 1.0 - 0.18 * (1.0 - smoothstep(0.2, 0.55, abs(rd - 1.2)));
            vec3 dirt = vec3(0.86, 0.79, 0.66) * (0.8 + 0.35 * t1.r) * rut;
            alb = mix(alb, dirt, road);
            float mark = step(fract(rs / 7.0), 0.4) * (1.0 - smoothstep(0.15, 0.35, abs(rd - 2.9)));
            alb = mix(alb, vec3(1.05), mark * 0.85);
          }
          float diff = max(dot(n, uSun), 0.0) * vShade.x;
          vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5) * vShade.y;
          vec3 col = alb * (uSunCol * diff * 1.05 + amb);
          // drone shadow under the aircraft
          vec2 dd = vPos.xz - uDrone.xz; float hg = uDrone.y - vPos.y;
          float rr = 0.75 + max(hg, 0.0) * 0.025;
          float sh = (1.0 - smoothstep(rr * 0.35, rr, length(dd))) * (1.0 - smoothstep(1.5, 50.0, hg)) * step(-0.6, hg) * uDrone.w;
          col *= 1.0 - 0.5 * sh;
          float f = 1.0 - exp(-pow(dist * uFogD, 2.0));
          col = mix(col, uFog, f);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });

    function tintAt(x, z, h, sl, out) {
      const stand = fbm(x * 0.0042 + 1.9, z * 0.0042 - 6.1, 3) + 0.45 * gnoise(x * 0.013 + 0.5, z * 0.013 + 2.2);
      const flat = 1 - smooth(0.18, 0.55, sl), low = 1 - smooth(180, 330, h);
      const grass = clamp01(flat * low * (0.25 + 0.75 * smooth(0.0, 0.45, stand)));
      let r = lerp(1.0, 0.9, grass), g = lerp(1.0, 0.9, grass), b = lerp(1.0, 0.66, grass);
      const snow = smooth(380, 540, h + 45 * gnoise(x * 0.008, z * 0.008)) * (1 - smooth(0.6, 1.1, sl));
      r = lerp(r, 1.14, snow); g = lerp(g, 1.16, snow); b = lerp(b, 1.2, snow);
      const lk = Math.hypot(x - LAKE.x, z - LAKE.z);
      const shore = (1 - smooth(LAKE.r * 1.1, LAKE.r * 2.0, lk)) * (1 - smooth(LAKE.level + 2, LAKE.level + 14, h));
      r = lerp(r, 0.95, shore); g = lerp(g, 0.92, shore); b = lerp(b, 0.84, shore);
      out[0] = r; out[1] = g; out[2] = b;
    }

    function buildInner() {
      const pos = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3), tint = new Float32Array(N * N * 3), shade = new Float32Array(N * N * 2);
      const tmp = [0, 0, 0];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i, x = INNER.x0 + i * G.dx, z = INNER.z0 + j * G.dz, h = H[k];
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        const hl = H[j * N + Math.max(0, i - 1)], hr = H[j * N + Math.min(n, i + 1)], hu = H[Math.max(0, j - 1) * N + i], hd = H[Math.min(n, j + 1) * N + i];
        let nx = -(hr - hl) / (2 * G.dx), nz = -(hd - hu) / (2 * G.dz), ny = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
        tintAt(x, z, h, Math.sqrt(nx * nx + nz * nz) / ny, tmp);
        tint[k * 3] = tmp[0]; tint[k * 3 + 1] = tmp[1]; tint[k * 3 + 2] = tmp[2];
        shade[k * 2] = vis[k]; shade[k * 2 + 1] = ao[k];
      }
      const idx = new Uint32Array(n * n * 6); let p = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
      geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      return new THREE.Mesh(geo, terrainMat);
    }
    function buildOuter() {
      const M = small ? 110 : 150, X0 = -9500, X1 = 9500, Z0 = -10150, Z1 = 8850, MN = M + 1;
      const dx = (X1 - X0) / M, dz = (Z1 - Z0) / M;
      const hs = new Float32Array(MN * MN);
      const inside = (x, z) => x > INNER.x0 + 1 && x < INNER.x1 - 1 && z > INNER.z0 + 1 && z < INNER.z1 - 1;
      for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
        const x = X0 + i * dx, z = Z0 + j * dz;
        hs[j * MN + i] = heightAt(x, z) - (inside(x, z) ? 6 : 0);
      }
      const pos = new Float32Array(MN * MN * 3), nor = new Float32Array(MN * MN * 3), tint = new Float32Array(MN * MN * 3), shade = new Float32Array(MN * MN * 2), tmp = [0, 0, 0];
      for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
        const k = j * MN + i, x = X0 + i * dx, z = Z0 + j * dz, h = hs[k];
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        const hl = hs[j * MN + Math.max(0, i - 1)], hr = hs[j * MN + Math.min(M, i + 1)], hu = hs[Math.max(0, j - 1) * MN + i], hd = hs[Math.min(M, j + 1) * MN + i];
        let nx = -(hr - hl) / (2 * dx), nz = -(hd - hu) / (2 * dz), ny = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
        tintAt(x, z, h, Math.sqrt(nx * nx + nz * nz) / ny, tmp);
        tint[k * 3] = tmp[0]; tint[k * 3 + 1] = tmp[1]; tint[k * 3 + 2] = tmp[2];
        shade[k * 2] = 1; shade[k * 2 + 1] = 0.95;
      }
      const idx = [];
      for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
        const xa = X0 + i * dx, xb = xa + dx, za = Z0 + j * dz, zb = za + dz;
        if (inside(xa, za) && inside(xb, za) && inside(xa, zb) && inside(xb, zb)) continue;
        const a = j * MN + i, b = a + 1, c = a + MN, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
      geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      return new THREE.Mesh(geo, terrainMat);
    }
    scene.add(buildInner());
    scene.add(buildOuter());

    /* ---------- water: lake and stream ---------- */
    const waterMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: terrainUniforms.uCam, uSun: { value: SUN }, uFog: { value: FOG }, uFogD: { value: FOG_D }, uSkyC: { value: new THREE.Color(0.8, 0.85, 0.9) } },
      vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uTime; uniform vec3 uCam, uSun, uFog, uSkyC; uniform float uFogD; varying vec3 vPos;
        void main(){
          vec2 p = vPos.xz;
          vec3 n = normalize(vec3(0.07 * (sin(p.x * 0.31 + uTime * 1.3) + sin(p.y * 0.47 - uTime * 0.9) * 0.6 + sin((p.x + p.y) * 1.1 + uTime * 2.1) * 0.3), 1.0,
                                  0.07 * (cos(p.y * 0.29 + uTime * 1.1) + sin(p.x * 0.53 + uTime * 0.7) * 0.6 + cos((p.x - p.y) * 0.9 - uTime * 1.7) * 0.3)));
          vec3 v = normalize(uCam - vPos); float dist = length(uCam - vPos);
          float fres = 0.05 + 0.95 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          vec3 col = mix(vec3(0.2, 0.33, 0.35), uSkyC, fres);
          vec3 h = normalize(uSun + v); col += vec3(1.0, 0.97, 0.9) * pow(max(dot(n, h), 0.0), 140.0) * 0.9;
          col = mix(col, uFog, 1.0 - exp(-pow(dist * uFogD, 2.0)));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const lakeMesh = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r * 2.2, 64), waterMat);
    lakeMesh.rotation.x = -Math.PI / 2; lakeMesh.position.set(LAKE.x, LAKE.level, LAKE.z); scene.add(lakeMesh);
    (function river() {
      const pts = VALLEY.filter(p => p[5]);
      if (pts.length < 2) return;
      const dense = [];
      for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 4; k++) { const t = k / 4; dense.push([lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t), lerp(pts[i][2], pts[i + 1][2], t)]); }
      dense.push(pts[pts.length - 1]);
      const pos = [], idx = [];
      dense.forEach((p, i) => {
        const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const y = Math.max(p[2] - 0.9, LAKE.level);
        pos.push(p[0] - tz * 7.5, y, p[1] + tx * 7.5, p[0] + tz * 7.5, y, p[1] - tx * 7.5);
        if (i > 0) { const q = i * 2; idx.push(q - 2, q, q - 1, q - 1, q, q + 1); }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
      const m = new THREE.Mesh(geo, waterMat); m.material.side = THREE.DoubleSide; scene.add(m);
    })();

    /* ---------- spruces: trunk and four drooping tiers, instanced ---------- */
    const TL = TREES.filter(t => !t.giant), T = TL.length;
    const tierGeo = (r, h, y) => { const g = new THREE.ConeGeometry(r, h, 7, 1); g.translate(0, y + h / 2, 0); return g; };
    const parts = [
      { g: (function () { const g = new THREE.CylinderGeometry(0.022, 0.035, 0.22, 5); g.translate(0, 0.11, 0); return g; })(), m: new THREE.MeshLambertMaterial({ color: 0x5b4733 }), shade: 0.9 },
      { g: tierGeo(0.2, 0.36, 0.12), m: null, shade: 0.82 },
      { g: tierGeo(0.17, 0.34, 0.33), m: null, shade: 0.9 },
      { g: tierGeo(0.13, 0.3, 0.54), m: null, shade: 0.97 },
      { g: tierGeo(0.08, 0.26, 0.74), m: null, shade: 1.05 },
    ];
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const leafA = new THREE.Color(0x63781f), leafB = new THREE.Color(0xa6b23c), tc = new THREE.Color();
    const dummy = new THREE.Object3D();
    const treeMeshes = parts.map(p => { const m = new THREE.InstancedMesh(p.g, p.m || leafMat, T); scene.add(m); return m; });
    TL.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z); dummy.rotation.set(0, t.yaw, 0); dummy.scale.set(t.H * 0.9, t.H, t.H * 0.9); dummy.updateMatrix();
      const fi = clamp((t.x - INNER.x0) / G.dx, 0, n) | 0, fj = clamp((t.z - INNER.z0) / G.dz, 0, n) | 0;
      const lit = 0.62 + 0.38 * vis[fj * N + fi];
      treeMeshes.forEach((m, pi) => {
        m.setMatrixAt(i, dummy.matrix);
        if (pi === 0) m.setColorAt(i, tc.setRGB(lit, lit, lit));
        else m.setColorAt(i, tc.copy(leafA).lerp(leafB, clamp01(t.c * 0.85 + pi * 0.04)).multiplyScalar(lit * parts[pi].shade));
      });
    });
    treeMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });

    /* ---------- home pad, pilot ---------- */
    const std = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const add = (geo, mat, x, y, z, parent) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); (parent || scene).add(o); return o; };
    add(new THREE.CylinderGeometry(PAD_R + 0.15, PAD_R + 0.3, PAD_TOP, 40), std(0xd3d8dc, 0.85), HOME.x, PAD_TOP / 2, HOME.z);
    add(new THREE.CylinderGeometry(PAD_R - 0.25, PAD_R - 0.25, PAD_TOP + 0.02, 40), std(0x34404a, 0.85), HOME.x, PAD_TOP / 2 + 0.005, HOME.z);
    const hm = std(0xf3f6f8, 0.6);
    add(new THREE.BoxGeometry(0.26, 0.03, 1.5), hm, HOME.x - 0.55, PAD_TOP + 0.02, HOME.z);
    add(new THREE.BoxGeometry(0.26, 0.03, 1.5), hm, HOME.x + 0.55, PAD_TOP + 0.02, HOME.z);
    add(new THREE.BoxGeometry(1.1, 0.03, 0.26), hm, HOME.x, PAD_TOP + 0.02, HOME.z);
    const pilot = new THREE.Group(); pilot.position.set(PILOT.x, terrainH(PILOT.x, PILOT.z), PILOT.z); pilot.rotation.y = 0.5; scene.add(pilot);
    const jacket = std(0xe0873a, 0.7), pants = std(0x2a333c, 0.8), skin = std(0xe3b48f, 0.7), dk = std(0x2b3640, 0.7);
    add(new THREE.BoxGeometry(0.2, 0.85, 0.2), pants, 0, 0.43, 0.13, pilot); add(new THREE.BoxGeometry(0.2, 0.85, 0.2), pants, 0, 0.43, -0.13, pilot);
    add(new THREE.BoxGeometry(0.36, 0.68, 0.5), jacket, 0, 1.18, 0, pilot);
    add(new THREE.SphereGeometry(0.2, 14, 10), skin, 0, 1.68, 0, pilot);
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14), dk, 0, 1.82, 0, pilot);
    add(new THREE.BoxGeometry(0.22, 0.12, 0.4), std(0xe7ebee, 0.5), -0.36, 1.2, 0, pilot);
    for (const s of [0.16, -0.16]) { const a = add(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 5), std(0xcfd6dc), -0.36, 1.4, s, pilot); a.rotation.z = -0.25; }
    add(new THREE.BoxGeometry(0.7, 0.32, 0.45), std(0x3b4650, 0.7), 0.7, 0.16, 0.6, pilot);

    /* ---------- photo-spot landmarks ---------- */
    const SPOT_COLOR = 0x46d3c5;
    let fallMat = null;
    (function buildLandmarks() {
      const rng = (function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(77);
      const prism = (w, h, d, mat) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.lineTo(-w / 2, 0); const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return new THREE.Mesh(g, mat); };
      for (const sp of SPOTS) {
        if (sp.id === 'cabin') {
          const g = new THREE.Group(); g.position.set(sp.x, 0, sp.z); g.rotation.y = 0.4; g.scale.set(1.35, 1.35, 1.35); scene.add(g);
          const hs = [[-6, -5], [6, -5], [-6, 5], [6, 5]].map(([a, b]) => terrainH(sp.x + a, sp.z + b));
          const base = (Math.max(...hs) + 0.3) / 1.35, low = (Math.min(...hs) - 0.5) / 1.35;
          const wood = std(0x8a5a36, 0.85), roof = std(0x7a2f26, 0.7), glass = std(0x9fc4d8, 0.2, 0.3), dark = std(0x3a2a20, 0.8);
          add(new THREE.BoxGeometry(8.8, base - low, 6.8), std(0x8e8b84, 0.95), 0, (base + low) / 2, 0, g);
          add(new THREE.BoxGeometry(8, 3.2, 6), wood, 0, base + 1.6, 0, g);
          const gab = prism(6.2, 2.2, 8, wood); gab.rotation.y = Math.PI / 2; gab.position.set(0, base + 3.2, 0); g.add(gab);
          for (const sd of [-1, 1]) { const r = add(new THREE.BoxGeometry(9, 0.25, 4.1), roof, 0, base + 3.2 + 1.12, sd * 1.6, g); r.rotation.x = -sd * 0.62; }
          add(new THREE.BoxGeometry(0.8, 2.5, 0.8), std(0x6e6a64, 0.9), 2.4, base + 4.6, -1.2, g);
          add(new THREE.BoxGeometry(1.2, 2.1, 0.1), dark, 0, base + 1.05, 3.02, g);
          for (const sx of [-2.6, 2.6]) add(new THREE.BoxGeometry(1.3, 0.9, 0.1), glass, sx, base + 1.9, 3.02, g);
          add(new THREE.BoxGeometry(3.2, 0.15, 1.6), wood, 0, base + 0.05, 3.9, g);
          sp.fy = base * 1.35 + 3.2;
          OBSTACLES.push({ kind: 'box', x0: sp.x - 7.4, x1: sp.x + 7.4, y0: low * 1.35 - 1, y1: base * 1.35 + 7.8, z0: sp.z - 7.4, z1: sp.z + 7.4, why: '撞到山屋了' });
        } else if (sp.id === 'tree') {
          const g = new THREE.Group(); g.position.set(sp.x, sp.y - 0.6, sp.z); scene.add(g);
          const bark = std(0x6b4a33, 0.95);
          add(new THREE.CylinderGeometry(1.3, 2.7, 24, 12), bark, 0, 12, 0, g);
          for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, r = add(new THREE.CylinderGeometry(0.35, 1.1, 5, 6), bark, Math.cos(a) * 2.3, 1.4, Math.sin(a) * 2.3, g); r.rotation.z = Math.cos(a) * 0.7; r.rotation.x = -Math.sin(a) * 0.7; }
          for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + 0.4, br = add(new THREE.CylinderGeometry(0.25, 0.55, 9, 6), bark, Math.cos(a) * 3.2, 20 + k * 1.6, Math.sin(a) * 3.2, g); br.rotation.z = -Math.cos(a) * 1.0; br.rotation.x = Math.sin(a) * 1.0; }
          const leafA = new THREE.MeshLambertMaterial({ color: 0x3f6b2a }), leafB = new THREE.MeshLambertMaterial({ color: 0x5a8a3a });
          [[0, 27, 0, 9.5], [6, 22, 3, 6.5], [-6, 23, -2, 7], [3, 31, -5, 6.5], [-4, 32, 4, 6], [0, 37, 0, 5.5], [7, 28, -5, 5.5], [-7, 28, 6, 5.5], [2, 21, -7, 5]].forEach(([x, y, z, r], i) => {
            const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), i % 2 ? leafA : leafB); m.position.set(x, y, z); m.scale.y = 0.78; g.add(m); });
          const rope = add(new THREE.TorusGeometry(2.25, 0.12, 6, 24), std(0xe8dcc0, 0.8), 0, 4.2, 0, g); rope.rotation.x = Math.PI / 2;
          add(new THREE.BoxGeometry(1.6, 1.0, 0.12), std(0x7b5a3c, 0.8), 0, 1.6, 4.4, g);
          add(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 5), std(0x5b4733, 0.8), 0, 0.8, 4.4, g);
        } else if (sp.id === 'bridge') {
          const A = new V3(sp.A[0], sp.deckY, sp.A[1]), B = new V3(sp.B[0], sp.deckY, sp.B[1]);
          const len = A.distanceTo(B), dir = B.clone().sub(A).normalize(), side = new V3(-dir.z, 0, dir.x);
          const N = Math.max(24, Math.round(len / 2)), sag = Math.min(6, len * 0.035);
          const deckAt = t => { const p = A.clone().lerp(B, t); p.y -= sag * 4 * t * (1 - t); return p; };
          const plankMat = std(0x8b6a48, 0.9), cableMat = std(0x30353a, 0.5, 0.6), towerMat = std(0xb8473a, 0.6);
          const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(3.0, 0.3, 1), plankMat, N);
          const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.1, 1), std(0xd9dde0, 0.6, 0.2), N * 2);
          const o = new THREE.Object3D();
          for (let i = 0; i < N; i++) {
            const p0 = deckAt(i / N), p1 = deckAt((i + 1) / N);
            o.position.copy(p0).lerp(p1, 0.5); o.lookAt(p1); o.scale.set(1, 1, p0.distanceTo(p1) * 0.92); o.updateMatrix(); planks.setMatrixAt(i, o.matrix);
            for (const sdv of [-1, 1]) {
              o.position.copy(p0).lerp(p1, 0.5).add(side.clone().multiplyScalar(sdv * 1.5)).add(new V3(0, 0.7, 0)); o.lookAt(p1.clone().add(side.clone().multiplyScalar(sdv * 1.5)).add(new V3(0, 0.7, 0))); o.scale.set(1, 1, p0.distanceTo(p1) * 1.02); o.updateMatrix();
              rails.setMatrixAt(i * 2 + (sdv > 0 ? 1 : 0), o.matrix);
            }
          }
          scene.add(planks); scene.add(rails);
          const tube = (pts, r) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, r, 5, false), cableMat); scene.add(m); return m; };
          const towerH = 12;
          for (const end of [A, B]) { // portal beam joining the two red posts
            const beam = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 0.6), towerMat); beam.position.copy(end).add(new V3(0, towerH - 0.3, 0)); beam.lookAt(end.clone().add(dir).add(new V3(0, towerH - 0.3, 0))); scene.add(beam);
          }
          for (const sdv of [-1, 1]) {
            const off = side.clone().multiplyScalar(sdv * 1.6);
            tube(Array.from({ length: 25 }, (_, k) => deckAt(k / 24).add(off).add(new V3(0, 1.25, 0))), 0.09);
            const topA = A.clone().add(off).add(new V3(0, towerH, 0)), topB = B.clone().add(off).add(new V3(0, towerH, 0));
            const main = Array.from({ length: 33 }, (_, k) => { const t = k / 32, p = topA.clone().lerp(topB, t); p.y -= (towerH - 1.3 + sag) * 4 * t * (1 - t) * 0.98; return p; });
            tube(main, 0.24);
            for (let k = 2; k < 31; k += 2) {
              const t = k / 32, top = main[k], bot = deckAt(t).add(off).add(new V3(0, 0.1, 0)), h = top.y - bot.y;
              if (h < 0.4) continue;
              const hg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 4), cableMat); hg.position.copy(bot).add(new V3(0, h / 2, 0)); scene.add(hg);
            }
            for (const end of [A, B]) {
              const base = end.clone().add(off); const gy = terrainH(base.x, base.z);
              const post = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, towerH + (base.y - gy) + 1, 10), towerMat); post.position.set(base.x, (gy - 1 + base.y + towerH) / 2, base.z); scene.add(post);
              OBSTACLES.push({ kind: 'seg', ax: base.x, ay: gy, az: base.z, bx: base.x, by: base.y + towerH, bz: base.z, r: 0.9, why: '撞到吊橋了' });
            }
          }
          for (let i = 0; i < N; i += 3) { const a = deckAt(i / N), b = deckAt(Math.min(1, (i + 3) / N)); OBSTACLES.push({ kind: 'seg', ax: a.x, ay: a.y + 0.4, az: a.z, bx: b.x, by: b.y + 0.4, bz: b.z, r: 1.7, why: '撞到吊橋了' }); }
          sp.fy = deckAt(0.5).y;
        } else if (sp.id === 'fall') {
          const pts = sp.pts, t = sp.t, W = 4.2, pos = [], uv = [], idx = [];
          let acc = 0;
          pts.forEach((p, j) => {
            if (j) acc += Math.hypot(p[0] - pts[j - 1][0], p[1] - pts[j - 1][1], p[2] - pts[j - 1][2]);
            const y = p[1] + 1.0, w = W * (0.75 + 0.5 * j / pts.length);
            pos.push(p[0] + t[0] * w, y, p[2] + t[1] * w, p[0] - t[0] * w, y, p[2] - t[1] * w);
            uv.push(0, acc / 18, 1, acc / 18);
            if (j) { const q = j * 2; idx.push(q - 2, q, q - 1, q - 1, q, q + 1); }
          });
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
          fallMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: 'uniform float uTime; varying vec2 vUv;' +
              'float h(float n){ return fract(sin(n) * 43758.5453); }' +
              'void main(){ float col = floor(vUv.x * 14.0); float sp = 1.6 + h(col) * 0.9; float s = fract(vUv.y * 2.0 - uTime * sp + h(col + 3.0));' +
              'float streak = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.55, 1.0, s));' +
              'float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);' +
              'vec3 c = mix(vec3(0.78, 0.88, 0.93), vec3(1.0), streak);' +
              'gl_FragColor = vec4(c, edge * (0.62 + 0.3 * streak)); }',
          });
          const m = new THREE.Mesh(geo, fallMat); m.renderOrder = 4; scene.add(m);
          const bottom = pts[pts.length - 1];
          const mist = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
          for (let k = 0; k < 7; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(2.5 + rng() * 2.5, 10, 8), mist); b.position.set(bottom[0] + (rng() - 0.5) * 8, bottom[1] + 1.5 + rng() * 3, bottom[2] + (rng() - 0.5) * 8); scene.add(b); }
          const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: 0xe6f2f6, transparent: true, opacity: 0.55, depthWrite: false }));
          pool.rotation.x = -Math.PI / 2; pool.position.set(bottom[0], bottom[1] + 0.25, bottom[2]); scene.add(pool);
        } else if (sp.id === 'pavilion') {
          const g = new THREE.Group(); g.position.set(sp.x, sp.y, sp.z); scene.add(g);
          const toLake = Math.atan2(LAKE.x - sp.x, LAKE.z - sp.z); g.rotation.y = toLake;
          const stone = std(0xb9b5ad, 0.95), red = std(0xa8382c, 0.6), tile = std(0x2f5d52, 0.55), gold = std(0xd8b04a, 0.4, 0.5), wood = std(0x8b6a48, 0.9);
          add(new THREE.CylinderGeometry(4.3, 4.8, 1.4, 6), stone, 0, 0.0, 0, g);
          for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; add(new THREE.CylinderGeometry(0.2, 0.22, 3.4, 10), red, Math.cos(a) * 3.4, 2.4, Math.sin(a) * 3.4, g); }
          add(new THREE.CylinderGeometry(3.75, 3.75, 0.4, 6, 1, true), red, 0, 4.0, 0, g);
          for (let k = 0; k < 6; k++) { if (k === 1) continue; const a = k / 6 * Math.PI * 2 + Math.PI / 2, b = add(new THREE.BoxGeometry(3.1, 0.45, 0.35), wood, Math.cos(a) * 2.95, 1.0, Math.sin(a) * 2.95, g); b.rotation.y = -a + Math.PI / 2; }
          const roof1 = add(new THREE.ConeGeometry(5.6, 2.1, 6), tile, 0, 5.2, 0, g); roof1.rotation.y = Math.PI / 6;
          const roof2 = add(new THREE.ConeGeometry(2.6, 1.8, 6), tile, 0, 6.6, 0, g); roof2.rotation.y = Math.PI / 6;
          add(new THREE.SphereGeometry(0.32, 10, 8), gold, 0, 7.65, 0, g);
          // a wooden boardwalk out over the water
          const bw = new THREE.Group(); bw.position.set(sp.x, 0, sp.z); bw.rotation.y = toLake; scene.add(bw);
          const deckY = Math.max(sp.y, LAKE.level) + 0.6;
          for (let d = 4.5; d < 44; d += 1.3) {
            const wx = sp.x + Math.sin(toLake) * d, wz = sp.z + Math.cos(toLake) * d;
            add(new THREE.BoxGeometry(2.2, 0.16, 1.1), wood, 0, deckY, d, bw);
            if (Math.round(d / 1.3) % 4 === 0) for (const sx of [-1.05, 1.05]) { const gy = Math.min(terrainH(wx, wz), LAKE.level - 1.5); add(new THREE.CylinderGeometry(0.1, 0.1, deckY - gy, 6), wood, sx, (deckY + gy) / 2, d, bw); }
          }
          OBSTACLES.push({ kind: 'box', x0: sp.x - 5, x1: sp.x + 5, y0: sp.y - 2, y1: sp.y + 7.9, z0: sp.z - 5, z1: sp.z + 5, why: '撞到涼亭了' });
          sp.fy = sp.y + 4;
        } else if (sp.id === 'station') {
          const g = new THREE.Group(); g.position.set(sp.x, sp.y, sp.z); scene.add(g);
          const conc = std(0xd9d9d3, 0.9), red = std(0xc8402f, 0.6), wht = std(0xf2f2f2, 0.6), metal = std(0x9aa3ab, 0.4, 0.6);
          add(new THREE.BoxGeometry(4, 3.4, 3.4), conc, 0, 0.9, 0, g);
          add(new THREE.BoxGeometry(4.5, 0.25, 3.9), std(0x55606a, 0.7), 0, 2.7, 0, g);
          add(new THREE.BoxGeometry(0.9, 1.8, 0.1), std(0x4a5560, 0.6), 0, 0.5, 1.72, g);
          add(new THREE.SphereGeometry(1.0, 16, 12), wht, -1.1, 3.4, 0.4, g);
          for (let k = 0; k < 6; k++) add(new THREE.CylinderGeometry(0.16, 0.16, 2.3, 8), k % 2 ? wht : red, 3.3, 0.2 + 1.15 + k * 2.3, 0, g);
          add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), metal, 3.3, 14.8, 0, g).rotation.z = Math.PI / 2;
          for (const sx of [-0.8, 0.8]) add(new THREE.SphereGeometry(0.16, 8, 6), metal, 3.3 + sx, 14.8, 0, g);
          const panel = add(new THREE.BoxGeometry(2.4, 0.08, 1.5), std(0x1f3550, 0.3, 0.4), -0.6, 3.1, -1.0, g); panel.rotation.x = -0.5;
          OBSTACLES.push({ kind: 'box', x0: sp.x - 2.6, x1: sp.x + 2.6, y0: sp.y - 2, y1: sp.y + 4.5, z0: sp.z - 2.2, z1: sp.z + 2.2, why: '撞到氣象站了' });
          OBSTACLES.push({ kind: 'seg', ax: sp.x + 3.3, ay: sp.y, az: sp.z, bx: sp.x + 3.3, by: sp.y + 15, bz: sp.z, r: 0.7, why: '撞到氣象站的天線了' });
          sp.fy = sp.y + 3;
        }
      }
    })();

    /* ---------- the white drone ---------- */
    const drone3 = new THREE.Group(), body = new THREE.Group(), model = new THREE.Group();
    drone3.add(body); body.add(model); model.scale.setScalar(0.15); scene.add(drone3);
    const white = std(0xf4f6f8, 0.34, 0.03), white2 = std(0xffffff, 0.24, 0.03), grey = std(0x8a929a, 0.45, 0.25), dark = std(0x1f252b, 0.3, 0.4);
    const sph = new THREE.SphereGeometry(1, 24, 16);
    const part = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = add(geo, mat, x, y, z, model); o.scale.set(sx, sy, sz); return o; };
    // model axes: +x forward
    part(sph, white, 0.2, 0, 0, 2.2, 0.6, 0.78);
    part(sph, white2, -0.3, 0.3, 0, 1.6, 0.34, 0.62);
    part(sph, white, -1.75, -0.02, 0, 1.15, 0.5, 0.66);
    part(new THREE.BoxGeometry(0.06, 0.26, 1.0), grey, -1.0, 0.08, 0);
    part(sph, dark, 2.25, -0.14, 0, 0.42, 0.42, 0.42);
    const lens = part(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16), std(0x6f8ea6, 0.1, 0.6), 2.62, -0.14, 0); lens.rotation.z = Math.PI / 2;
    const armG = new THREE.BoxGeometry(1, 0.2, 0.26);
    const props = [];
    const discMat = new THREE.MeshBasicMaterial({ color: 0xf2f5f7, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    const bladeMat = std(0xe3e8ec, 0.4, 0.05);
    const MOTORS = [[2.0, 2.9], [2.0, -2.9], [-2.3, 2.9], [-2.3, -2.9]];
    for (const [mx, mz] of MOTORS) {
      const sx = mx > 0 ? 0.6 : -0.6, sz = Math.sign(mz) * 0.35, dx = mx - sx, dz = mz - sz, len = Math.hypot(dx, dz);
      const arm = part(armG, white, sx + dx / 2, 0.08, sz + dz / 2, len, 1, 1); arm.rotation.y = -Math.atan2(dz, dx);
      part(new THREE.CylinderGeometry(0.3, 0.34, 0.5, 14), white2, mx, 0.2, mz);
      part(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), grey, mx, 0.5, mz);
      props.push(part(new THREE.BoxGeometry(2.8, 0.04, 0.22), bladeMat, mx, 0.58, mz));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 28), discMat); disc.rotation.x = -Math.PI / 2; disc.position.set(mx, 0.6, mz); model.add(disc);
      part(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), grey, mx, -0.4, mz);
      part(sph, grey, mx, -0.82, mz, 0.09, 0.09, 0.09);
    }
    const ledF = new THREE.MeshBasicMaterial({ color: 0x3ddc84 }), ledB = new THREE.MeshBasicMaterial({ color: 0xff4d4d });
    const ledG = new THREE.SphereGeometry(0.14, 8, 6);
    for (const [mx, mz] of MOTORS) part(ledG, mx > 0 ? ledF : ledB, mx, 0.02, mz + Math.sign(mz) * 0.33);
    model.rotation.y = Math.PI / 2; // model faces +x; the game's forward is -z at yaw 0
    model.position.y = 0.13;

    /* ---------- recording-zone beacon and home beacon ---------- */
    const beaconMat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(1.0, 0.6, 0.24) }, uTime: { value: 0 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uCol; uniform float uTime; varying vec2 vUv;' +
        'void main(){ float a = (1.0 - vUv.y) * 0.1 + 0.025; a *= 0.7 + 0.3 * step(0.5, fract(vUv.y * 14.0 - uTime * 0.6));' +
        'a += smoothstep(0.985, 1.0, vUv.y) * 0.45 + (1.0 - smoothstep(0.0, 0.015, vUv.y)) * 0.55; gl_FragColor = vec4(uCol, a); }',
    });
    const zoneTop = LAKE.level + TARGET.maxAgl, zoneBot = LAKE.level + 1;
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(TARGET.r, TARGET.r, zoneTop - zoneBot, 64, 1, true), beaconMat);
    beacon.position.set(TARGET.x, (zoneTop + zoneBot) / 2, TARGET.z); beacon.renderOrder = 5; scene.add(beacon);
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.55, depthWrite: false });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 900, 8, 1, true), pillarMat);
    pillar.position.set(TARGET.x, LAKE.level + 450, TARGET.z); scene.add(pillar);
    const homePillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 600, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x5fd396, transparent: true, opacity: 0.5, depthWrite: false }));
    homePillar.position.set(HOME.x, 300, HOME.z); homePillar.visible = false; scene.add(homePillar);

    /* ---------- wind streaks and splash ---------- */
    const NS = small ? 120 : 220;
    const streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 0.05), streakMat, NS); streaks.frustumCulled = false; scene.add(streaks);
    const SD = []; for (let i = 0; i < NS; i++) SD.push({ u: Math.random(), v: Math.random(), w: Math.random(), sp: 0.7 + Math.random() * 0.6, len: 2 + Math.random() * 5 });
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xf2f7fa, transparent: true, opacity: 0.9, depthWrite: false }), 50);
    drops.frustumCulled = false; drops.visible = false; scene.add(drops);
    const DROPS = []; for (let i = 0; i < 50; i++) { const a = Math.random() * 6.283, s = 1 + Math.random() * 3.5; DROPS.push({ vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 3 + Math.random() * 6, r: 0.08 + Math.random() * 0.12 }); }

    /* ================= minimap background ================= */
    const MAPV = { x0: -800, x1: 800, z0: -1650, z1: 250 }; // what the map shows
    const mapBg = (function () {
      const S = 336, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
      const span = Math.max(MAPV.x1 - MAPV.x0, MAPV.z1 - MAPV.z0), cx = (MAPV.x0 + MAPV.x1) / 2, cz = (MAPV.z0 + MAPV.z1) / 2;
      MAPV.span = span; MAPV.cx = cx; MAPV.cz = cz;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const wx = cx + (x / S - 0.5) * span, wz = cz + (y / S - 0.5) * span;
        const h = terrainH(wx, wz), e = 6;
        const gx = (terrainH(wx + e, wz) - terrainH(wx - e, wz)) / (2 * e), gz = (terrainH(wx, wz + e) - terrainH(wx, wz - e)) / (2 * e);
        const l = Math.hypot(gx, 1, gz), sh = clamp((-gx * SUN.x + SUN.y - gz * SUN.z) / l, 0, 1);
        let v = 0.25 + 0.6 * sh + 0.15 * clamp(h / 600, 0, 1);
        let r = v, gg = v, b = v;
        if (h < LAKE.level + 0.5 && Math.hypot(wx - LAKE.x, wz - LAKE.z) < LAKE.r * 2) { r = 0.3; gg = 0.48; b = 0.58; }
        const i = (y * S + x) * 4; d[i] = r * 235; d[i + 1] = gg * 238; d[i + 2] = b * 240; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      g.fillStyle = 'rgba(140,165,55,0.85)';
      for (const t of TREES) {
        const px = ((t.x - cx) / span + 0.5) * S, py = ((t.z - cz) / span + 0.5) * S;
        if (px >= 0 && py >= 0 && px < S && py < S) g.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
      }
      return c;
    })();
    const toMap = (x, z, S) => [((x - MAPV.cx) / MAPV.span + 0.5) * S, ((z - MAPV.cz) / MAPV.span + 0.5) * S];

    /* ================= photos from the drone's camera ================= */
    const photoCam = new THREE.PerspectiveCamera(68, 16 / 9, 0.15, 17000);
    const PH_W = small ? 768 : 1024, PH_H = Math.round(PH_W * 9 / 16);
    const photoRT = new THREE.WebGLRenderTarget(PH_W, PH_H);
    const photoBuf = new Uint8Array(PH_W * PH_H * 4);
    const phCanvas = document.createElement('canvas'); phCanvas.width = PH_W; phCanvas.height = PH_H; const phCtx = phCanvas.getContext('2d');
    const outCanvas = document.createElement('canvas'); outCanvas.width = 640; outCanvas.height = 360; const outCtx = outCanvas.getContext('2d');
    const photos = [];
    let gimbal = -0.16, lastShot = 0, readyT = 0, readySpots = [];
    const gotCount = () => SPOTS.filter(sp => sp.got).length;
    function aimPhotoCam() {
      const fx = -Math.sin(drone.yaw), fz = -Math.cos(drone.yaw), c = Math.cos(gimbal);
      photoCam.position.set(drone.x + fx * 0.32, drone.y + 0.02, drone.z + fz * 0.32);
      photoCam.lookAt(photoCam.position.x + fx * c * 10, photoCam.position.y + Math.sin(gimbal) * 10, photoCam.position.z + fz * c * 10);
      photoCam.updateMatrixWorld(); photoCam.updateProjectionMatrix();
    }
    // the gimbal tilts by itself toward a landmark in front of the drone, so you only have to turn the nose
    function updateGimbal(dt) {
      let want = -0.16, bestS = 1e9;
      const fx = -Math.sin(drone.yaw), fz = -Math.cos(drone.yaw);
      for (const sp of SPOTS) {
        const dx = sp.x - drone.x, dz = sp.z - drone.z, hd = Math.hypot(dx, dz);
        if (hd < 1 || hd > Math.min(560, sp.range * 1.7)) continue;
        if ((dx * fx + dz * fz) / hd < 0.64) continue;
        const sc = hd * (sp.got ? 1.6 : 1);
        if (sc < bestS) { bestS = sc; want = clamp(Math.atan2(sp.fy - drone.y, hd), -1.35, 0.22); }
      }
      gimbal += (want - gimbal) * (1 - Math.exp(-dt * 2.5));
    }
    const pv = new V3();
    function spotView(sp) { // why a landmark is or is not in the shot
      const cp = photoCam.position, d = Math.hypot(sp.x - cp.x, sp.fy - cp.y, sp.z - cp.z);
      if (d > sp.range) return { ok: false, why: 'far', d };
      pv.set(sp.x, sp.fy, sp.z).project(photoCam);
      if (pv.z > 1 || pv.z < -1 || Math.abs(pv.x) > 0.82 || Math.abs(pv.y) > 0.82) return { ok: false, why: 'aim', d };
      for (let k = 1; k < 24; k++) { const t = k / 24 * 0.94; if (terrainH(lerp(cp.x, sp.x, t), lerp(cp.z, sp.z, t)) > lerp(cp.y, sp.fy, t) + 1.5) return { ok: false, why: 'hidden', d }; }
      return { ok: true, d };
    }
    function spotsInFrame() { aimPhotoCam(); return SPOTS.map(sp => ({ sp, v: spotView(sp) })).filter(o => o.v.ok).sort((a, b) => a.v.d - b.v.d); }
    function photoHint() {
      aimPhotoCam();
      let best = null, bd = 1e9;
      for (const sp of SPOTS) { if (sp.got) continue; const d = Math.hypot(sp.x - drone.x, sp.z - drone.z); if (d < bd) { bd = d; best = sp; } }
      if (!best) return '七個景點都拍到了！';
      const v = spotView(best);
      if (v.why === 'far') return `最近的景點「${best.name}」還有 ${Math.round(bd / 10) * 10} 公尺，再靠近一點（${best.range} 公尺內）。`;
      if (v.why === 'aim') return `沒有對準「${best.name}」：把機頭轉向它再拍。按 C 可以看相機畫面。`;
      return `「${best.name}」被山擋住了，飛高一點或換個角度再拍。`;
    }
    function takePhoto() {
      if (state !== 'play' || drone.crashed) return;
      const now = performance.now(); if (now - lastShot < 700) return; lastShot = now;
      aimPhotoCam();
      const hide = [drone3, beacon, pillar, homePillar, streaks].map(o => [o, o.visible]); hide.forEach(([o]) => { o.visible = false; });
      const camSave = terrainUniforms.uCam.value.clone(), skySave = sky.position.clone();
      terrainUniforms.uCam.value.copy(photoCam.position); sky.position.copy(photoCam.position);
      let okRead = true;
      try { renderer.setRenderTarget(photoRT); renderer.render(scene, photoCam); renderer.readRenderTargetPixels(photoRT, 0, 0, PH_W, PH_H, photoBuf); }
      catch (e) { okRead = false; }
      renderer.setRenderTarget(null);
      hide.forEach(([o, v]) => { o.visible = v; }); terrainUniforms.uCam.value.copy(camSave); sky.position.copy(skySave);
      let url = '';
      if (okRead) {
        const img = phCtx.createImageData(PH_W, PH_H), row = PH_W * 4;
        for (let y = 0; y < PH_H; y++) img.data.set(photoBuf.subarray((PH_H - 1 - y) * row, (PH_H - y) * row), y * row);
        phCtx.putImageData(img, 0, 0);
        outCtx.drawImage(phCanvas, 0, 0, 640, 360);
        const agl = Math.max(0, drone.y - FOOT - groundAt(drone.x, drone.z));
        outCtx.font = '600 15px "Azeret Mono", ui-monospace, monospace'; outCtx.textAlign = 'right'; outCtx.fillStyle = 'rgba(0,0,0,.45)'; outCtx.fillText(`ALT ${Math.round(agl)}m  ${fmtT(mission.time)}`, 629, 351);
        outCtx.fillStyle = 'rgba(255,255,255,.9)'; outCtx.fillText(`ALT ${Math.round(agl)}m  ${fmtT(mission.time)}`, 628, 350);
        try { url = outCanvas.toDataURL('image/jpeg', 0.84); } catch (e) { url = ''; }
      }
      const seen = spotsInFrame(), fresh = seen.filter(o => !o.sp.got);
      fresh.forEach(o => { o.sp.got = true; o.sp.photo = url; });
      if (url) { photos.push({ url, names: seen.map(o => o.sp.name), fresh: fresh.length > 0, t: mission.time }); if (photos.length > 40) photos.shift(); }
      flashOnce(); SFX.shutter();
      const cap = fresh.length ? `新景點：${fresh.map(o => o.sp.name).join('、')}` : seen.length ? `${seen.map(o => o.sp.name).join('、')}（拍過了）` : '風景照';
      showShot(url, cap, fresh.length > 0);
      if (fresh.length) { setTimeout(() => SFX.spot(), 180); say('拍到' + fresh[0].sp.name); toast(`拍到「${fresh.map(o => o.sp.name).join('、')}」了！景點照片 ${gotCount()}/${SPOTS.length}`, 3); if (gotCount() === SPOTS.length) setTimeout(() => { toast('七個景點全部拍到了，太厲害了！', 4); say('全部景點都拍到了'); }, 1600); }
      else if (!seen.length) toast(photoHint(), 4);
      updatePhotoUI();
    }
    let shotT = 0;
    function flashOnce() { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = '0.85'; requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = '0'; }); }
    function showShot(url, cap, fresh) {
      const el = $('shot');
      if (url) $('shotImg').src = url;
      $('shotImg').hidden = !url;
      $('shotCap').textContent = cap; el.classList.toggle('fresh', !!fresh);
      el.hidden = false; shotT = 3;
    }
    function updatePhotoUI() {
      $('albumN').textContent = photos.length;
      $('mPhotos').innerHTML = `拍照景點 <b>${gotCount()} / ${SPOTS.length}</b>`;
    }
    function renderAlbum() {
      $('spotList').innerHTML = SPOTS.map(sp => `<li class="${sp.got ? 'got' : ''}">${sp.got && sp.photo ? `<img src="${sp.photo}" alt="${sp.name}">` : '<span class="ph" aria-hidden="true"></span>'}<div><b>${sp.name}</b><span>${sp.desc}</span></div></li>`).join('');
      $('albumCount').textContent = `${gotCount()} / ${SPOTS.length} 個景點・共 ${photos.length} 張照片`;
      const th = $('thumbs');
      th.innerHTML = photos.slice().reverse().map((ph, i) => `<button type="button" class="thumb" data-i="${photos.length - 1 - i}"><img src="${ph.url}" alt=""><span>${ph.names.length ? ph.names.join('、') : '風景照'}・${fmtT(ph.t)}</span></button>`).join('');
      $('albumEmpty').hidden = photos.length > 0;
    }
    let albumFrom = null;
    function openAlbum() {
      if (state === 'loading') return;
      renderAlbum();
      if (state === 'play') { albumFrom = 'play'; state = 'paused'; showSticks(false); keys.clear(); if (audio) audio.ac.suspend().catch(() => {}); }
      else albumFrom = state === 'paused' ? 'pausedMenu' : state;
      $('paused').hidden = true;
      $('album').hidden = false; $('bAlbumClose').focus();
    }
    function closeAlbum() {
      $('album').hidden = true; $('viewer').hidden = true;
      if (albumFrom === 'play') { state = 'play'; showSticks(true); if (audio && !muted) audio.ac.resume().catch(() => {}); lastTs = null; }
      else if (albumFrom === 'pausedMenu') $('paused').hidden = false;
      albumFrom = null;
    }
    $('thumbs').addEventListener('click', e => {
      const b = e.target.closest('.thumb'); if (!b) return;
      const ph = photos[+b.dataset.i]; if (!ph) return;
      $('viewerImg').src = ph.url; $('viewerCap').textContent = (ph.names.length ? ph.names.join('、') : '風景照') + '・飛行時間 ' + fmtT(ph.t);
      $('viewer').hidden = false; $('bViewerClose').focus();
    });
    $('bViewerClose').addEventListener('click', () => { $('viewer').hidden = true; });
    $('viewer').addEventListener('click', e => { if (e.target === $('viewer')) $('viewer').hidden = true; });
    $('bAlbumClose').addEventListener('click', closeAlbum);
    $('bAlbum').addEventListener('click', openAlbum);
    $('bShot').addEventListener('pointerdown', e => { e.preventDefault(); startAudio(); takePhoto(); });
    $('bShot').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); takePhoto(); } });
    $('bPauseAlbum').addEventListener('click', openAlbum);
    $('bEndAlbum').addEventListener('click', openAlbum);

    /* ================= game state ================= */
    let drone = newDrone(), mission = newMission(), rth = null, simT = 0, lostT = 0, sig = { q: 1, worst: 99, block: null, dist: 0 };
    let state = 'loading'; // loading, title, play, paused, ended
    let camMode = 0; const CAM_NAMES = ['追蹤視角', '機載鏡頭', '操作員視角'];
    const flags = {};
    let endTimer = -1, retCost = 0, retTimer = 0, splashT = -1;
    // the two big buttons: hold "up" to climb (a tap on the ground takes off to a hover), tap "land" to come straight down
    const ud = { up: false, upT: 0, autoUp: null, autoLand: false };

    function resetGame() {
      drone = newDrone(); mission = newMission(); rth = null; simT = 0; lostT = 0; endTimer = -1; splashT = -1;
      for (const k in flags) delete flags[k];
      ud.up = false; ud.autoUp = null; ud.autoLand = false;
      camSnap = true; beaconMat.uniforms.uCol.value.setRGB(1.0, 0.6, 0.24); pillarMat.color.setHex(0xff9a3c); homePillar.visible = false;
      $('lblTarget').classList.remove('done'); $('lblTarget').textContent = '錄影點';
      setAlert(null); toast('');
    }

    /* ================= input ================= */
    const keys = new Set();
    const stick = { thr: 0, yaw: 0, pitch: 0, roll: 0 };
    const touch = { L: { x: 0, y: 0, id: null }, R: { x: 0, y: 0, id: null } };
    let pad = { thr: 0, yaw: 0, pitch: 0, roll: 0, active: false };
    const KEYMAP = { KeyW: 1, KeyS: 1, KeyA: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
    window.addEventListener('keydown', e => {
      if (KEYMAP[e.code] || e.code === 'Space') e.preventDefault();
      if (e.repeat) { keys.add(e.code); return; }
      keys.add(e.code);
      if (state === 'title' && (e.code === 'Enter' || e.code === 'Space')) startGame();
      else if (state === 'ended' && (e.code === 'KeyR' || e.code === 'Enter')) restart();
      else if (state === 'play') {
        if (e.code === 'KeyH') toggleRth();
        else if (e.code === 'KeyC') cycleCam();
        else if (e.code === 'KeyP' || e.code === 'Escape') setPaused(true);
        else if (e.code === 'KeyM') toggleSound();
        else if (e.code === 'KeyN') toggleMusic();
        else if (e.code === 'KeyT') autoTakeoff();
        else if (e.code === 'KeyL') autoLand();
        else if (e.code === 'KeyF') takePhoto();
        else if (e.code === 'KeyG') openAlbum();
      } else if (!$('album').hidden && (e.code === 'Escape' || e.code === 'KeyG')) { if (!$('viewer').hidden) $('viewer').hidden = true; else closeAlbum(); }
      else if (state === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) setPaused(false);
    });
    window.addEventListener('keyup', e => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); if (state === 'play') setPaused(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setPaused(true); });

    function setupStick(side) {
      const zone = $('stick' + side), base = $('base' + side), knob = $('knob' + side), S = touch[side];
      const home = () => { const r = zone.getBoundingClientRect(), fy = r.height > r.width * 1.2 ? 0.8 : r.height < 260 ? 0.74 : 0.64; return side === 'L' ? [Math.max(80, r.width * 0.34), r.height * fy] : [Math.min(r.width - 80, r.width * 0.66), r.height * fy]; };
      let cx = 0, cy = 0;
      const place = (x, y) => { cx = x; cy = y; base.style.left = x + 'px'; base.style.top = y + 'px'; };
      const reset = () => { const [x, y] = home(); place(x, y); knob.style.transform = ''; S.x = 0; S.y = 0; S.id = null; };
      zone.addEventListener('pointerdown', e => {
        if (S.id !== null) return;
        e.preventDefault();
        S.id = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch (_) {}
        const r = zone.getBoundingClientRect(); place(e.clientX - r.left, e.clientY - r.top);
        if (state === 'title') startGame();
      });
      zone.addEventListener('pointermove', e => {
        if (e.pointerId !== S.id) return;
        const r = zone.getBoundingClientRect(); let dx = e.clientX - r.left - cx, dy = e.clientY - r.top - cy;
        const R = 52, l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        S.x = dx / R; S.y = -dy / R;
      });
      const end = e => { if (e.pointerId === S.id) reset(); };
      zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
      new ResizeObserver(() => { if (S.id === null) reset(); }).observe(zone);
      reset();
    }
    function showSticks(on) { $('stickL').hidden = !on; $('stickR').hidden = !on; }
    setupStick('L'); setupStick('R');
    window.addEventListener('touchstart', () => app.classList.add('touch'), { once: true, passive: true });

    function pollPad() {
      pad.active = false;
      let pads = null;
      try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { pads = null; }
      if (!pads) return;
      for (const gp of pads) {
        if (!gp || !gp.axes || gp.axes.length < 4) continue;
        const dz = v => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
        pad = { yaw: dz(gp.axes[0]), thr: -dz(gp.axes[1]), roll: dz(gp.axes[2]), pitch: -dz(gp.axes[3]), active: true };
        const b = i => gp.buttons[i] && gp.buttons[i].pressed;
        const edge = (i, fn) => { const k = 'gp' + i; if (b(i) && !flags[k]) { flags[k] = 1; fn(); } else if (!b(i)) flags[k] = 0; };
        edge(9, () => { if (state === 'play') setPaused(true); else if (state === 'paused') setPaused(false); else if (state === 'title') startGame(); else if (state === 'ended') restart(); });
        if (state === 'play') { edge(3, toggleRth); edge(2, cycleCam); edge(0, takePhoto); }
        break;
      }
    }
    function readSticks(dt) {
      const k = c => (keys.has(c) ? 1 : 0);
      const target = {
        thr: k('KeyW') - k('KeyS'), yaw: k('KeyD') - k('KeyA'),
        pitch: k('ArrowUp') - k('ArrowDown'), roll: k('ArrowRight') - k('ArrowLeft'),
      };
      const rate = 1 - Math.exp(-dt * 7);
      for (const a in target) stick[a] += (target[a] - stick[a]) * rate;
      const out = { thr: stick.thr, yaw: stick.yaw, pitch: stick.pitch, roll: stick.roll };
      if (touch.L.id !== null || touch.R.id !== null) {
        const lx = Math.abs(touch.L.x) < 0.4 ? 0 : (touch.L.x - Math.sign(touch.L.x) * 0.4) / 0.6;
        const ly = Math.abs(touch.L.y) < 0.08 ? 0 : touch.L.y;
        out.thr = clamp(out.thr + ly, -1, 1); out.yaw = clamp(out.yaw + lx, -1, 1);
        out.pitch = clamp(out.pitch + touch.R.y, -1, 1); out.roll = clamp(out.roll + touch.R.x, -1, 1);
      }
      if (pad.active) { out.thr = clamp(out.thr + pad.thr, -1, 1); out.yaw = clamp(out.yaw + pad.yaw, -1, 1); out.pitch = clamp(out.pitch + pad.pitch, -1, 1); out.roll = clamp(out.roll + pad.roll, -1, 1); }
      // gentle expo on yaw and moves for finer control near centre
      out.yaw = Math.sign(out.yaw) * Math.pow(Math.abs(out.yaw), 1.4);
      return out;
    }

    /* ================= sound: motors, wind, water, alarms and spoken prompts ================= */
    const MUSIC_BPM = 92;
    const volNum = (k, d) => { const v = Number(store.get(k)); return Number.isFinite(v) && store.get(k) !== null ? clamp(v, 0, 100) / 100 : d; };
    let musicVol = volNum('drone-vol-music', 0.8), droneVol = volNum('drone-vol-drone', 0.35);
    let audio = null, muted = store.get('drone-muted') === '1', alarmKind = null, nextAlarm = 0, waterT = 0, waterLvl = 0;
    const ICON_ON = 'M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12';
    const ICON_OFF = 'M4 9h4l5-4v14l-5-4H4zM16 9l6 6M22 9l-6 6';
    function setSoundIcon() {
      $('bSound').classList.toggle('on', !muted);
      $('bSound').setAttribute('aria-label', muted ? '打開聲音' : '關掉聲音');
      $('icoSound').setAttribute('d', muted ? ICON_OFF : ICON_ON);
      const lab = $('bSound').querySelector('.bl'); if (lab) lab.textContent = muted ? '聲音關' : '聲音開';
    }
    setSoundIcon();
    function startAudio() {
      if (audio) { if (audio.ac.state === 'suspended' && state !== 'paused') audio.ac.resume().catch(() => {}); return; }
      if (muted) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
        const ac = new Ctx();
        const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.connect(ac.destination);
        const master = ac.createGain(); master.gain.value = 0.95; master.connect(comp);
        const white = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), wd = white.getChannelData(0);
        for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
        const brown = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), bd = brown.getChannelData(0);
        let lastB = 0; for (let i = 0; i < bd.length; i++) { lastB = (lastB + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = lastB * 3.5; }
        const loop = buf => { const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.start(); return src; };
        const filt = (type, f, q) => { const n = ac.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
        // four propellers: slightly detuned buzzing saws, a blade "flutter" and a high whine
        const motorBus = ac.createGain(); motorBus.gain.value = 0;
        const flutter = ac.createGain(); flutter.gain.value = 1;
        const body = filt('peaking', 520, 1.1); body.gain.value = 7;
        const tame = filt('lowpass', 2800, 0.7);
        motorBus.connect(flutter); flutter.connect(body); body.connect(tame); tame.connect(master);
        const oscs = [1, 1.013, 0.988, 1.024].map(m => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 170 * m; const g = ac.createGain(); g.gain.value = 0.25; o.connect(g); g.connect(motorBus); o.start(); return { o, m }; });
        const whine = ac.createOscillator(); whine.type = 'triangle'; whine.frequency.value = 700; const wg = ac.createGain(); wg.gain.value = 0.06; whine.connect(wg); wg.connect(motorBus); whine.start();
        const lfo = ac.createOscillator(); lfo.frequency.value = 42; const lfoG = ac.createGain(); lfoG.gain.value = 0.24; lfo.connect(lfoG); lfoG.connect(flutter.gain); lfo.start();
        const wash = ac.createGain(); wash.gain.value = 0; const washF = filt('bandpass', 1100, 0.6); loop(white).connect(washF); washF.connect(wash); wash.connect(master);
        const wind = ac.createGain(); wind.gain.value = 0; const windF = filt('lowpass', 500, 0.5); loop(brown).connect(windF); windF.connect(wind); wind.connect(master);
        const gust = ac.createOscillator(); gust.frequency.value = 0.23; const gustG = ac.createGain(); gustG.gain.value = 180; gust.connect(gustG); gustG.connect(windF.frequency); gust.start();
        const water = ac.createGain(); water.gain.value = 0; const waterF = filt('bandpass', 2300, 0.45); loop(white).connect(waterF); waterF.connect(water); water.connect(master);
        const ripple = ac.createOscillator(); ripple.frequency.value = 5.3; const rippleG = ac.createGain(); rippleG.gain.value = 600; ripple.connect(rippleG); rippleG.connect(waterF.frequency); ripple.start();
        // music bus: dry + a small generated reverb + an echo for the plucks and the tune
        const musicOut = ac.createGain(); musicOut.gain.value = 0; musicOut.connect(master);
        const bus = ac.createGain(); bus.gain.value = 1;
        const dry = ac.createGain(); dry.gain.value = 0.8; bus.connect(dry); dry.connect(musicOut);
        const irLen = Math.floor(ac.sampleRate * 2.6), ir = ac.createBuffer(2, irLen, ac.sampleRate);
        for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2); }
        const verb = ac.createConvolver(); verb.buffer = ir; const wet = ac.createGain(); wet.gain.value = 0.5; bus.connect(verb); verb.connect(wet); wet.connect(musicOut);
        const echo = ac.createDelay(1.5); echo.delayTime.value = 60 / MUSIC_BPM * 0.75; const fb = ac.createGain(); fb.gain.value = 0.32; const echoF = filt('lowpass', 2400, 0.5);
        echo.connect(echoF); echoF.connect(fb); fb.connect(echo); echoF.connect(bus);
        const padF = filt('lowpass', 1200, 0.6); padF.connect(bus);
        const meter = ac.createAnalyser(); meter.fftSize = 2048; musicOut.connect(meter);
        const meterAll = ac.createAnalyser(); meterAll.fftSize = 2048; comp.connect(meterAll);
        audio = { ac, master, motorBus, oscs, whine, lfo, wash, wind, windF, water, white, music: { out: musicOut, bus, echo, padF, meter }, meterAll };
        musicNext = ac.currentTime + 0.1;
      } catch (e) { audio = null; }
    }
    function tone(freq, dur, o) {
      if (!audio || muted) return;
      o = o || {};
      try {
        const ac = audio.ac, t0 = ac.currentTime + (o.delay || 0);
        const osc = ac.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(freq, t0);
        if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.vol || 0.22, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g); g.connect(audio.master); osc.start(t0); osc.stop(t0 + dur + 0.05);
      } catch (e) { /* ignore */ }
    }
    function noiseHit(dur, freq, vol, type) {
      if (!audio || muted) return;
      try {
        const ac = audio.ac, t0 = ac.currentTime;
        const src = ac.createBufferSource(); src.buffer = audio.white;
        const f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = 0.8;
        const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f); f.connect(g); g.connect(audio.master); src.start(t0); src.stop(t0 + dur + 0.05);
      } catch (e) { /* ignore */ }
    }
    const SFX = {
      takeoff: () => { tone(660, 0.12, { vol: 0.18 }); tone(990, 0.16, { vol: 0.18, delay: 0.13 }); },
      landed: () => { tone(990, 0.1, { vol: 0.16 }); tone(660, 0.16, { vol: 0.16, delay: 0.11 }); },
      lowBatt: () => { tone(880, 0.13, { type: 'square', vol: 0.14 }); tone(880, 0.13, { type: 'square', vol: 0.14, delay: 0.22 }); },
      critBatt: () => { [0, 0.18, 0.36].forEach(d => tone(1046, 0.12, { type: 'square', vol: 0.15, delay: d })); },
      lost: () => { tone(988, 0.24, { type: 'sawtooth', vol: 0.12, to: 494 }); tone(988, 0.24, { type: 'sawtooth', vol: 0.12, to: 494, delay: 0.34 }); },
      weak: () => tone(660, 0.2, { type: 'triangle', vol: 0.2 }),
      restored: () => { tone(523, 0.12, { vol: 0.2 }); tone(784, 0.2, { vol: 0.2, delay: 0.12 }); },
      rth: () => { tone(784, 0.15, { vol: 0.2 }); tone(523, 0.24, { vol: 0.2, delay: 0.16 }); },
      recStart: () => { tone(1318, 0.12, { vol: 0.2 }); tone(1318, 0.12, { vol: 0.2, delay: 0.16 }); },
      recTick: () => tone(1760, 0.05, { vol: 0.08 }),
      recDone: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, { vol: 0.2, delay: i * 0.1, type: 'triangle' })); },
      crash: () => { noiseHit(0.7, 280, 0.9, 'lowpass'); tone(150, 0.45, { type: 'square', vol: 0.2, to: 45 }); noiseHit(0.3, 3200, 0.3, 'bandpass'); },
      splash: () => { noiseHit(1.2, 1300, 0.7, 'bandpass'); noiseHit(0.5, 400, 0.5, 'lowpass'); },
      win: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.28, { vol: 0.2, delay: i * 0.11, type: 'triangle' })); },
      fail: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.32, { vol: 0.2, delay: i * 0.2, type: 'triangle' })); },
      blip: () => tone(440, 0.09, { vol: 0.13 }),
      click: () => tone(1200, 0.035, { vol: 0.08 }),
      shutter: () => { noiseHit(0.05, 4000, 0.5, 'highpass'); tone(2200, 0.03, { vol: 0.12, type: 'square' }); setTimeout(() => noiseHit(0.06, 2500, 0.35, 'bandpass'), 70); },
      spot: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, { vol: 0.17, delay: i * 0.08, type: 'sine' })); },
    };
    /* ---------- background music: an original, generated piece that follows the flight ---------- */
    let musicOn = store.get('drone-music') !== '0';
    let musicNext = 0, musicStep = 0, musicMode = 'calm', musicLevel = 0;
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    // calm, open D major for flying; a darker B minor turn while something is going wrong
    const SONG = [
      { pad: [50, 57, 61, 64], bass: 38 }, { pad: [47, 54, 57, 62], bass: 35 }, { pad: [55, 59, 62, 66], bass: 43 }, { pad: [52, 57, 62, 64], bass: 45 },
      { pad: [50, 57, 62, 66], bass: 38 }, { pad: [54, 57, 61, 64], bass: 42 }, { pad: [55, 59, 62, 67], bass: 43 }, { pad: [52, 57, 61, 64], bass: 45 },
    ];
    const TENSE = [
      { pad: [47, 54, 59, 62], bass: 35 }, { pad: [43, 55, 59, 62], bass: 43 }, { pad: [52, 55, 59, 64], bass: 40 }, { pad: [54, 58, 61, 66], bass: 42 },
    ];
    const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81]; // D major pentatonic
    const RHYTHMS = [
      [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0], [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0],
    ];
    let phrase = null, melIdx = 4;
    function mrand(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function makePhrase(n, chordA, chordB) {
      const rnd = mrand(n * 7919 + 13), rh = RHYTHMS[Math.floor(rnd() * RHYTHMS.length)], notes = [];
      const starts = []; rh.forEach((v, i) => { if (v) starts.push(i); });
      starts.forEach((st, k) => {
        const last = k === starts.length - 1;
        if (last) { // land on a chord tone
          const tones = (st < 8 ? chordA : chordB).map(m => { let x = m; while (x < 62) x += 12; return x; });
          let best = SCALE[melIdx], bd = 99; for (const t of tones) { const d = Math.abs(t - SCALE[melIdx]); if (d < bd && t <= 81) { bd = d; best = t; } }
          notes.push({ st, m: best, len: Math.min(4, 16 - st) });
        } else {
          melIdx = clamp(melIdx + [-2, -1, -1, 1, 1, 2, 0][Math.floor(rnd() * 7)], 1, SCALE.length - 2);
          notes.push({ st, m: SCALE[melIdx], len: Math.max(1, Math.min(3, starts[k + 1] - st)) });
        }
      });
      return notes;
    }
    function mNote(m, t, dur, o) {
      const ac = audio.ac, f = mtof(m), v = o.vol || 0.08, a = o.attack || 0.01, r = o.release || 0.3;
      const osc = ac.createOscillator(); osc.type = o.type || 'triangle'; osc.frequency.setValueAtTime(f * (o.down ? 2.2 : 1), t);
      if (o.down) osc.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      if (o.detune) osc.detune.value = o.detune;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a);
      g.gain.setTargetAtTime(v * (o.sustain == null ? 0.55 : o.sustain), t + a, Math.max(0.05, dur * 0.35));
      g.gain.setTargetAtTime(0.0001, t + dur, r / 3);
      osc.connect(g); g.connect(o.dest || audio.music.bus); if (o.echo) g.connect(audio.music.echo);
      if (o.vib) { const l = ac.createOscillator(); l.frequency.value = 5.2; const lg = ac.createGain(); lg.gain.value = f * 0.007; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + r + 0.2); }
      osc.start(t); osc.stop(t + dur + r + 0.2);
    }
    function mHit(t, kind, vol) {
      const ac = audio.ac;
      if (kind === 'kick') {
        const o = ac.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g); g.connect(audio.music.bus); o.start(t); o.stop(t + 0.35);
      } else {
        const src = ac.createBufferSource(); src.buffer = audio.white; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = kind === 'shaker' ? 5000 : 7500;
        const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'shaker' ? 0.08 : 0.04));
        src.connect(f); f.connect(g); g.connect(audio.music.bus); src.start(t, Math.random()); src.stop(t + 0.12);
      }
    }
    const MUSIC_STEP = 60 / MUSIC_BPM / 2; // eighth notes
    function scheduleStep(n, t) {
      const mode = musicMode, tense = mode === 'tense', moving = mode !== 'calm';
      const bar = Math.floor(n / 8), st = n % 8, BARLEN = MUSIC_STEP * 8;
      const ch = tense ? TENSE[bar % TENSE.length] : SONG[bar % SONG.length];
      const nextCh = tense ? TENSE[(bar + 1) % TENSE.length] : SONG[(bar + 1) % SONG.length];
      audio.music.padF.frequency.setTargetAtTime(tense ? 650 : moving ? 1400 : 1000, t, 0.8);
      if (st === 0) { // pad chord for the whole bar
        ch.pad.forEach(m => [-7, 7].forEach(dt => mNote(m, t, BARLEN * 0.95, { type: 'sawtooth', vol: 0.022, attack: 0.5, sustain: 1, release: 0.9, detune: dt, dest: audio.music.padF })));
      }
      // bass
      if (moving && (tense ? true : st === 0 || st === 4 || st === 7)) mNote(ch.bass, t, tense ? MUSIC_STEP * 0.8 : MUSIC_STEP * (st === 7 ? 0.9 : 3.4), { type: 'triangle', vol: tense ? 0.13 : 0.16, attack: 0.01, sustain: 0.7, release: 0.15 });
      if (!moving && st === 0) mNote(ch.bass, t, BARLEN * 0.9, { type: 'sine', vol: 0.1, attack: 0.3, sustain: 0.8, release: 0.6 });
      // plucked arpeggio with an echo
      const arpOrder = [0, 1, 2, 3, 2, 1, 2, 3];
      if (moving || st % 2 === 0) mNote(ch.pad[arpOrder[st]] + 12, t, MUSIC_STEP * 0.9, { type: 'triangle', vol: moving ? 0.06 : 0.045, attack: 0.004, sustain: 0.15, release: 0.25, echo: true });
      // drums while flying
      if (moving) {
        if (st === 0 || st === 4 || (tense && st === 6)) mHit(t, 'kick', tense ? 0.22 : 0.18);
        if (tense || st % 2 === 1) mHit(t, 'hat', tense ? 0.05 : 0.03);
        if (!tense && (st === 3 || st === 7)) mHit(t, 'shaker', 0.02);
      }
      // the tune: two-bar phrases, resting every fourth phrase
      if (!tense) {
        const ph = Math.floor(n / 16), ps = n % 16;
        if (ps === 0) phrase = ph % 4 === 3 || mode === 'calm' && ph % 2 === 1 ? null : makePhrase(ph, ch.pad, nextCh.pad);
        if (phrase) for (const nt of phrase) if (nt.st === ps) mNote(nt.m, t, nt.len * MUSIC_STEP * 0.95, { type: 'sine', vol: 0.11, attack: 0.03, sustain: 0.6, release: 0.35, vib: true, echo: true });
      }
      // little bells while the camera is recording
      if (mode === 'rec' && st % 2 === 0) mNote(ch.pad[(st / 2) % 4] + 24, t, MUSIC_STEP, { type: 'sine', vol: 0.03, attack: 0.003, sustain: 0.1, release: 0.4, echo: true });
    }
    function musicTarget() {
      if (!musicOn || muted) return 0;
      if (state === 'ended') return 0;
      return state === 'title' ? 0.85 : 0.75;
    }
    setInterval(() => {
      if (!audio || audio.ac.state !== 'running') return;
      const ac = audio.ac, want = musicTarget();
      const wantGain = want * 2.4 * musicVol;
      if (Math.abs(wantGain - musicLevel) > 0.001) { musicLevel = wantGain; audio.music.out.gain.setTargetAtTime(wantGain, ac.currentTime, want > 0 ? (wantGain > 0 && musicLevel > 0 ? 0.25 : 1.2) : 0.4); }
      if (wantGain === 0) { musicNext = Math.max(musicNext, ac.currentTime); return; }
      musicMode = state === 'title' || drone.landed ? 'calm' : alarmKind ? 'tense' : mission.stage === 2 && inRecordZone(drone) ? 'rec' : 'fly';
      if (musicNext < ac.currentTime) musicNext = ac.currentTime + 0.05;
      while (musicNext < ac.currentTime + 0.35) { scheduleStep(musicStep, musicNext); musicNext += MUSIC_STEP; musicStep++; }
    }, 30);
    function toggleMusic() {
      musicOn = !musicOn; store.set('drone-music', musicOn ? '1' : '0'); setMusicIcon();
      if (musicOn) startAudio();
      toast(musicOn ? '背景音樂：開' : '背景音樂：關', 1.4);
    }
    function setupVolume(id, get, setv, key) {
      const el = $(id), out = $(id + 'V');
      el.value = Math.round(get() * 100); out.textContent = el.value;
      el.addEventListener('input', () => { setv(el.value / 100); out.textContent = el.value; store.set(key, el.value); startAudio(); });
    }
    setupVolume('volMusic', () => musicVol, v => { musicVol = v; if (v > 0 && !musicOn) { musicOn = true; setMusicIcon(); } }, 'drone-vol-music');
    setupVolume('volDrone', () => droneVol, v => { droneVol = v; }, 'drone-vol-drone');
    function setMusicIcon() { $('bMusic').classList.toggle('on', musicOn); $('bMusic').setAttribute('aria-label', musicOn ? '關掉背景音樂' : '打開背景音樂'); const l = $('bMusic').querySelector('.bl'); if (l) l.textContent = musicOn ? '音樂開' : '音樂關'; }
    setMusicIcon();
    updatePhotoUI();

    // spoken prompts in Chinese, only when the device has a Chinese voice
    let zhVoice = null;
    function pickVoice() {
      try {
        const vs = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
        zhVoice = vs.find(v => /zh[-_](TW|Hant)/i.test(v.lang)) || vs.find(v => /zh[-_]HK/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
      } catch (e) { zhVoice = null; }
    }
    try { if (window.speechSynthesis) { pickVoice(); window.speechSynthesis.addEventListener('voiceschanged', pickVoice); } } catch (e) { /* no speech */ }
    function say(text) {
      if (muted || !zhVoice) return;
      try { const ss = window.speechSynthesis; ss.cancel(); const u = new SpeechSynthesisUtterance(text); u.voice = zhVoice; u.lang = zhVoice.lang; u.rate = 1.08; u.volume = 1; ss.speak(u); } catch (e) { /* ignore */ }
    }
    function toggleSound() {
      muted = !muted; store.set('drone-muted', muted ? '1' : '0'); setSoundIcon();
      if (!muted) { startAudio(); SFX.click(); say('聲音開啟'); }
      else { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
      if (audio) audio.master.gain.setTargetAtTime(muted ? 0 : 0.95, audio.ac.currentTime, 0.05);
    }
    // browsers only allow sound after the viewer interacts, so wake it on the first touch, click or key
    const wake = () => startAudio();
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake);
    function updateAudio(cmd, dt) {
      if (!audio) return;
      const t = audio.ac.currentTime, playing = state === 'play' || state === 'ended';
      const hs = Math.hypot(drone.vx, drone.vz), ws = drone.wind.speed || 0;
      const thrust = clamp(0.55 + 0.35 * Math.max(0, cmd ? cmd.thr : 0) - 0.12 * Math.max(0, cmd ? -cmd.thr : 0) + 0.28 * hs / MAX_H + 0.08 * ws / 14, 0.3, 1.3);
      const sp = drone.spin;
      // in the pilot's view the drone is far away, so it sounds quieter
      const far = camMode === 2 && state === 'play' ? clamp(25 / Math.max(1, Math.hypot(drone.x - PILOT.x, drone.y - terrainH(PILOT.x, PILOT.z) - 1.7, drone.z - PILOT.z)), 0.03, 1) : 1;
      const f = (95 + 150 * thrust) * (0.35 + 0.65 * sp);
      audio.oscs.forEach(o => o.o.frequency.setTargetAtTime(f * o.m, t, 0.08));
      audio.whine.frequency.setTargetAtTime(f * 4.1, t, 0.08);
      audio.lfo.frequency.setTargetAtTime(Math.max(6, f / 4), t, 0.1);
      audio.motorBus.gain.setTargetAtTime((playing ? 0.26 : 0.1) * sp * far * droneVol, t, 0.08);
      audio.wash.gain.setTargetAtTime(0.09 * sp * thrust * far * droneVol, t, 0.1);
      const windAmt = (state === 'play' ? clamp((ws - 1.5) / 12, 0, 1) * 0.5 + 0.18 * hs / MAX_H : 0.07) * (0.3 + 0.9 * droneVol);
      audio.wind.gain.setTargetAtTime(windAmt, t, 0.25);
      audio.windF.frequency.setTargetAtTime(320 + 55 * ws + 20 * hs, t, 0.3);
      // running water when the camera is near the stream or the lake
      waterT -= dt;
      if (waterT <= 0) {
        waterT = 0.3;
        const lx = camera.position.x, lz = camera.position.z;
        valleyInfo(lx, lz);
        const dRiver = VI_R ? VI_D : 1e9, dLake = Math.max(0, Math.hypot(lx - LAKE.x, lz - LAKE.z) - LAKE.r);
        const near = 1 - smooth(15, 240, Math.min(dRiver, dLake + 20));
        const high = 1 - smooth(10, 180, camera.position.y - terrainH(lx, lz));
        waterLvl = near * high * 0.16;
        const wf = SPOTS.find(sp => sp.id === 'fall');
        if (wf) waterLvl = Math.max(waterLvl, (1 - smooth(20, 260, Math.hypot(lx - wf.x, lz - wf.z))) * 0.3);
      }
      audio.water.gain.setTargetAtTime(state === 'paused' ? 0 : waterLvl, t, 0.4);
      // repeating alarm while something critical is going on
      if (alarmKind && state === 'play' && performance.now() / 1000 >= nextAlarm) {
        nextAlarm = performance.now() / 1000 + (alarmKind === 'lost' ? 1.5 : 1.8);
        if (alarmKind === 'lost') SFX.lost(); else SFX.critBatt();
      }
    }

    /* ================= UI helpers ================= */
    let toastT = 0;
    function toast(msg, secs) {
      const el = $('toast');
      if (!msg) { el.style.opacity = 0; toastT = 0; return; }
      el.textContent = msg; el.style.opacity = 1; toastT = secs || 4;
    }
    function once(key, msg, secs) { if (flags[key]) return; flags[key] = 1; toast(msg, secs); }
    let alertKey = null;
    function setAlert(a) { // [text, level]
      const key = a ? a[0] + a[1] : null;
      if (key === alertKey) return; alertKey = key;
      const el = $('alert'); el.hidden = !a;
      if (a) { el.textContent = a[0]; el.className = a[1]; }
      $('vignette').className = 'ov' + (a && a[1] === 'crit' ? ' crit' : '');
    }
    const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const last = {};
    const set = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };

    function autoTakeoff() {
      if (state !== 'play' || drone.crashed || drone.powerless) return;
      ud.autoLand = false;
      if (drone.landed) { ud.autoUp = { target: groundAt(drone.x, drone.z) + FOOT + 8 }; toast('起飛中：飛機會升到離地大約 8 公尺停住。', 3); }
    }
    function autoLand() {
      if (state !== 'play' || drone.crashed || drone.powerless) return;
      if (drone.landed) { toast('飛機已經在地上了。', 2); return; }
      if (inLake(drone.x, drone.z) || (Math.hypot(drone.x - LAKE.x, drone.z - LAKE.z) < LAKE.r * 1.3 && terrainH(drone.x, drone.z) < LAKE.level + 1)) { toast('下面是湖，不能降落。先飛到岸上再按「降落」。', 3); SFX.blip(); return; }
      if (rth && rth.reason === 'lost') { toast('斷訊返航中，要等訊號恢復才能改成降落。', 3); SFX.blip(); return; }
      rth = null; ud.autoUp = null; ud.autoLand = true;
      toast('自動降落：飛機會在原地慢慢降下來。推搖桿可以取消。', 3); say('降落中');
    }
    function setupUpDown() {
      const up = $('bUp'), dn = $('bDown');
      const release = () => { if (!ud.up) return; ud.up = false; up.classList.remove('held'); if (performance.now() - ud.upT < 260 && drone.landed) autoTakeoff(); };
      up.addEventListener('pointerdown', e => { e.preventDefault(); startAudio(); if (state !== 'play') return; ud.up = true; ud.upT = performance.now(); ud.autoLand = false; up.classList.add('held'); try { up.setPointerCapture(e.pointerId); } catch (_) {} });
      up.addEventListener('pointerup', release); up.addEventListener('pointercancel', release); up.addEventListener('lostpointercapture', release);
      up.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); autoTakeoff(); } });
      dn.addEventListener('pointerdown', e => { e.preventDefault(); startAudio(); dn.classList.add('held'); autoLand(); });
      const dnUp = () => dn.classList.remove('held');
      dn.addEventListener('pointerup', dnUp); dn.addEventListener('pointercancel', dnUp);
      dn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); autoLand(); } });
    }
    setupUpDown();
    function toggleRth() {
      if (state !== 'play' || drone.landed || drone.crashed || drone.powerless) return;
      if (rth) { if (rth.reason === 'lost') { toast('訊號中斷時無法取消返航，飛機要先回到看得到你的地方。', 3); SFX.blip(); return; } rth = null; toast('已取消返航，改回手動操作。', 2.5); SFX.blip(); say('取消返航'); }
      else { rth = newRth('user', drone, simT); toast('自動返航：先爬升到安全高度，再直線飛回起飛點降落。按 H 或推動搖桿可以取消。', 4); SFX.rth(); say('開始自動返航'); }
    }
    function cycleCam() { SFX.click(); camMode = (camMode + 1) % 3; camSnap = true; $('viewName').textContent = CAM_NAMES[camMode] + '（按 C 切換）'; toast(CAM_NAMES[camMode], 1.4); }
    function setPaused(p) {
      if (p && state === 'play') { state = 'paused'; $('paused').hidden = false; showSticks(false); keys.clear(); if (audio) audio.ac.suspend().catch(() => {}); $('bResume').focus(); }
      else if (!p && state === 'paused') { state = 'play'; $('paused').hidden = true; showSticks(true); if (audio && !muted) audio.ac.resume().catch(() => {}); lastTs = null; }
    }
    function startGame() {
      if (state !== 'title') return;
      state = 'play'; $('start').hidden = true; showSticks(true);
      startAudio(); SFX.click();
      try { if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } } catch (e) { /* no speech */ }
      camSnap = true;
      toast('按右上角的「上升」飛機就會升起來，按「降落」就會降下來；右邊搖桿控制前後左右。', 5);
      try { app.focus({ preventScroll: true }); } catch (_) {}
    }
    function restart() { musicStep = 0; $('ended').hidden = true; $('paused').hidden = true; resetGame(); state = 'title'; startGame(); }
    $('bStart').addEventListener('click', startGame);
    $('bResume').addEventListener('click', () => setPaused(false));
    $('bRestart').addEventListener('click', restart);
    $('bAgain').addEventListener('click', restart);
    $('bRth').addEventListener('click', toggleRth);
    $('bCam').addEventListener('click', cycleCam);
    $('bPause').addEventListener('click', () => setPaused(state === 'play'));
    $('bSound').addEventListener('click', toggleSound);
    $('bMusic').addEventListener('click', toggleMusic);
    app.tabIndex = -1;

    function endGame(success, why) {
      state = 'ended'; showSticks(false);
      $('ended').hidden = false;
      $('endEyebrow').textContent = success ? '任務完成' : '任務失敗';
      $('endTitle').textContent = success ? '平安回家，影片到手！' : (why.indexOf('電量') >= 0 ? '電量用完了' : why.indexOf('湖') >= 0 ? '飛機掉進湖裡' : '墜機了');
      $('endWhy').textContent = success
        ? '你錄到了山中湖的空拍影片，也把飛機帶回起飛點。' + (mission.lostCount ? '途中斷訊過，飛高一點、讓山不要擋在你和飛機中間，就不會被迫返航。' : '')
        : why + '。' + (why.indexOf('電量') >= 0 ? '電量條上的白線是飛回家需要的電，電量快碰到白線就要返航。' : why.indexOf('樹') >= 0 || why.indexOf('山') >= 0 ? '飛低的時候放慢速度，或拉高一點再飛。' : why.indexOf('湖') >= 0 ? '在湖面上空要保持高度，錄影建議離水面 100 公尺以上。' : '接近地面時放慢下降速度。');
      $('sTime').textContent = fmtT(mission.time);
      $('sBatt').textContent = Math.max(0, Math.round(drone.battery)) + '%';
      $('sLost').textContent = String(mission.lostCount);
      $('sWind').textContent = mission.maxWind.toFixed(1) + ' m/s';
      const got = [success, success && drone.battery >= 25, success && mission.lostCount === 0];
      [...$('stars').children].forEach((li, i) => li.classList.toggle('got', got[i]));
      $('sPhotos').textContent = `${gotCount()} / ${SPOTS.length}`;
      $('endStrip').innerHTML = SPOTS.filter(sp => sp.got && sp.photo).map(sp => `<figure><img src="${sp.photo}" alt="${sp.name}"><figcaption>${sp.name}</figcaption></figure>`).join('');
      $('endPhotos').hidden = photos.length === 0 && gotCount() === 0;
      setAlert(null); toast('');
      if (success) { SFX.win(); say('任務完成，平安回家'); } else SFX.fail();
      $('bAgain').focus();
    }

    /* ================= simulation ================= */
    let lastCmd = { thr: 0, yaw: 0, pitch: 0, roll: 0 };
    function simulate(dt) {
      const sticks = readSticks(dt);
      const stickMag = Math.max(Math.abs(sticks.thr), Math.abs(sticks.yaw), Math.abs(sticks.pitch), Math.abs(sticks.roll));
      sig = signalAt(drone.x, drone.y, drone.z);
      const airborne = !drone.landed && !drone.crashed;

      // radio link loss → automatic return
      if (airborne && !drone.powerless) {
        if (sig.q < 0.1) lostT += dt; else if (sig.q >= 0.3) lostT = 0;
        if (lostT > 2.5 && (!rth || rth.reason !== 'lost')) { rth = newRth('lost', drone, simT); mission.lostCount++; toast('訊號斷了超過 2.5 秒，飛機自己開始返航：先往上爬，等看得到你再飛回來。', 5); say('訊號中斷，自動返航'); }
        if (rth && rth.reason === 'lost' && sig.q >= 0.3) { rth.reason = 'restored'; toast('訊號恢復了！推動搖桿或按 H 就能取消返航。', 4); SFX.restored(); say('訊號恢復'); }
      }
      if (rth && stickMag < 0.2) rth.armed = true; // sticks must come back to centre once before a push cancels the return
      if (rth && rth.reason !== 'lost' && rth.armed && stickMag > 0.35) { rth = null; toast('已取消返航，改回手動操作。', 2.5); SFX.blip(); say('取消返航'); }
      if (rth && rth.reason === 'lost' && stickMag > 0.35) once('lostNoCtl', '斷訊中，搖桿暫時沒有作用。', 2.5);
      // the up / land buttons
      if (ud.autoLand && (stickMag > 0.35 || drone.crashed)) { ud.autoLand = false; if (!drone.crashed) toast('已取消降落，改回手動操作。', 2); }
      if (ud.autoUp && (stickMag > 0.35 || drone.crashed || (!drone.landed && drone.y >= ud.autoUp.target - 0.3))) ud.autoUp = null;
      const manual = { thr: sticks.thr, yaw: sticks.yaw, pitch: sticks.pitch, roll: sticks.roll };
      if (ud.up) manual.thr = 1;
      else if (ud.autoUp) manual.thr = 1;
      else if (ud.autoLand) { manual.thr = -1; manual.pitch = 0; manual.roll = 0; }

      // step the physics in small fixed steps
      let rem = dt;
      while (rem > 1e-6) {
        const h = Math.min(rem, 1 / 120); rem -= h;
        const cmd = rth ? rthCommand(drone, rth, h, simT) : manual;
        lastCmd = cmd;
        const ev = stepDrone(drone, cmd, h, simT); simT += h;
        if (ev.length) handleEvents(ev);
        if (drone.crashed) break;
      }

      if (mission.started && !mission.done && !drone.crashed) mission.time += dt;
      mission.maxWind = Math.max(mission.maxWind, airborne ? drone.wind.speed : 0);

      // recording
      if (mission.stage >= 1 && mission.stage <= 2 && airborne) {
        const inZone = inRecordZone(drone);
        if (inZone && !rth) {
          const before = mission.rec;
          mission.stage = 2; mission.rec = Math.min(TARGET.need, mission.rec + dt);
          if (!flags.zone) { SFX.recStart(); say('開始錄影'); }
          once('zone', '進入錄影區！保持在橘色圈圈裡，錄滿 6 秒。', 3);
          if (Math.floor(mission.rec) > Math.floor(before) && mission.rec < TARGET.need) SFX.recTick();
          if (mission.rec >= TARGET.need) {
            mission.stage = 3; homePillar.visible = true;
            beaconMat.uniforms.uCol.value.setRGB(0.37, 0.83, 0.59); pillarMat.color.setHex(0x5fd396);
            $('lblTarget').classList.add('done'); $('lblTarget').textContent = '已錄影 ✓';
            toast('錄影完成！跟著綠色光柱飛回起飛點降落。', 4); SFX.recDone(); say('錄影完成，請飛回起飛點');
          }
        }
      }
      // contextual tips
      if (airborne) {
        if (sig.q < 0.5 && sig.q > 0.02 && !flags.weak) { SFX.weak(); say('訊號變弱，請飛高一點'); }
        if (sig.q < 0.5 && sig.q > 0.02) once('weak', '訊號變弱了：山擋在你和飛機中間。飛高一點，訊號就會回來。', 4.5);
        if (drone.wind.speed > 9 && !flags.wind) say('強風警告');
        if (drone.wind.speed > 9) once('wind', '高處風很大：飛機會被吹偏，也更耗電。降低一點高度會比較穩。', 4.5);
        if (drone.battery < 30 && !flags.b30) { SFX.lowBatt(); say('電量剩百分之三十'); }
        if (drone.battery < 30) once('b30', '電量剩 30%，該準備回家了。', 3.5);
        const homeD = Math.hypot(drone.x - HOME.x, drone.z - HOME.z);
        if (homeD > 30 && retCost > 0 && drone.battery < retCost + 6 && !flags.needret) { flags.needret = 1; say('電量不足，請立即返航'); }
      }
      if (drone.landed && !drone.crashed && mission.stage === 3 && Math.hypot(drone.x - HOME.x, drone.z - HOME.z) < PAD_R + 1.5) {
        mission.stage = 4; mission.done = true; rth = null; endTimer = 1.4;
      }
      if (drone.crashed && endTimer < 0) endTimer = 2.4;
    }
    function handleEvents(ev) {
      for (const e of ev) {
        if (e === 'takeoff') {
          if (!mission.started) { mission.started = true; mission.stage = Math.max(mission.stage, 1); }
          SFX.takeoff(); if (!flags.tk) say('起飛');
          once('tk', '起飛了！往北邊的山谷飛，跟著羅盤上的橘色記號。', 4);
        } else if (e === 'landed') {
          if (ud.autoLand) { ud.autoLand = false; toast('已降落。', 1.8); }
          if (rth && rth.phase === 'descend') rth = null;
          SFX.landed();
          if (mission.stage < 3 && Math.hypot(drone.x - HOME.x, drone.z - HOME.z) > PAD_R + 2) toast('已降落。推上升就能再起飛。', 2.5);
        } else if (e === 'powerless') {
          rth = null; toast('電量 0%！馬達停轉，飛機直接掉下去了⋯⋯', 4); say('電量耗盡');
        } else if (e === 'crash') {
          rth = null;
          if (inLake(drone.x, drone.z)) { splashT = 0; SFX.splash(); } else SFX.crash();
        } else if (e === 'fence') { if (!flags.fence) SFX.blip(); once('fence', '已經到飛行範圍的邊界了。', 2.5); }
        else if (e === 'ceiling') { if (!flags.ceil) SFX.blip(); once('ceil', '已經到高度上限了。', 2.5); }
      }
    }

    /* ================= camera ================= */
    let camSnap = true;
    const camPos = new V3(), camLook = new V3(), tPos = new V3(), tLook = new V3();
    let camYaw = 0, orbitA = 0;
    function updateCamera(dt) {
      const dp = new V3(drone.x, drone.y, drone.z);
      const fx = -Math.sin(drone.yaw), fz = -Math.cos(drone.yaw);
      if (state === 'title' || state === 'loading') {
        orbitA += dt * 0.05;
        const a = Math.sin(orbitA) * 0.5;
        tPos.set(HOME.x + Math.sin(a) * 7, 2.2, HOME.z + Math.cos(a) * 7);
        tLook.set(HOME.x - Math.sin(a) * 40, 9, HOME.z - 60);
        camera.fov = 58;
      } else if (camMode === 1) { // camera on the drone's gimbal
        tPos.set(drone.x + fx * 0.32, drone.y + 0.02, drone.z + fz * 0.32);
        tLook.set(tPos.x + fx * Math.cos(gimbal) * 10, tPos.y + Math.sin(gimbal) * 10, tPos.z + fz * Math.cos(gimbal) * 10);
        camera.fov = 72;
        camPos.copy(tPos); camLook.copy(tLook); camSnap = false;
      } else if (camMode === 2) { // the pilot's eyes on the ground
        tPos.set(PILOT.x, terrainH(PILOT.x, PILOT.z) + 1.75, PILOT.z);
        tLook.copy(dp);
        const d = tPos.distanceTo(dp);
        camera.fov = clamp(2 * Math.atan(18 / Math.max(d, 1)) * 180 / Math.PI, 3, 60);
        camPos.copy(tPos); camLook.copy(tLook); camSnap = false;
      } else {
        let dy = wrapAng(drone.yaw - camYaw);
        camYaw = camSnap ? drone.yaw : wrapAng(camYaw + dy * (1 - Math.exp(-dt * 3.2)));
        const cfx = -Math.sin(camYaw), cfz = -Math.cos(camYaw);
        const back = drone.landed ? 4.6 : 4.8, up = drone.landed ? 1.6 : 1.6;
        tPos.set(drone.x - cfx * back, drone.y + up, drone.z - cfz * back);
        tLook.set(drone.x + cfx * 3.5, drone.y + 0.35, drone.z + cfz * 3.5);
        camera.fov = 62 + clamp(Math.hypot(drone.vx, drone.vz) - 8, 0, 9) * 0.6;
      }
      if (camMode === 0 || state !== 'play') {
        const g = terrainH(tPos.x, tPos.z) + 1.2; if (tPos.y < g) tPos.y = g;
        if (camSnap) { camPos.copy(tPos); camLook.copy(tLook); camSnap = false; }
        else { const k = 1 - Math.exp(-dt * 6), k2 = 1 - Math.exp(-dt * 9); camPos.lerp(tPos, k); camLook.lerp(tLook, k2); }
        const g2 = terrainH(camPos.x, camPos.z) + 0.8; if (camPos.y < g2) camPos.y = g2;
      }
      camera.position.copy(camPos); camera.lookAt(camLook);
      camera.updateProjectionMatrix();
      sky.position.copy(camPos);
      terrainUniforms.uCam.value.copy(camPos);
    }

    /* ================= visuals per frame ================= */
    const sM = new THREE.Matrix4(), sQ = new THREE.Quaternion(), sS = new V3(), sP = new V3(), windQ = new THREE.Quaternion();
    function updateVisuals(dt, now) {
      drone3.position.set(drone.x, drone.y - FOOT, drone.z);
      drone3.rotation.set(0, drone.yaw, 0);
      if (drone.crashed || drone.powerless) {
        const tu = drone.tumble;
        body.rotation.set(Math.min(tu * 3.1, drone.landed ? 0.5 : 99), 0, Math.min(tu * 2.3, drone.landed ? 0.35 : 99));
      } else body.rotation.set(-drone.pitchVis, 0, -drone.rollVis); // nose down when moving forward, right side down when sliding right
      drone3.visible = camMode !== 1 || state !== 'play';
      const spin = drone.spin;
      props.forEach((b, i) => { b.rotation.y += dt * 90 * spin * (i % 2 ? 1 : -1); });
      discMat.opacity = 0.32 * spin;
      const sev = sig.q < 0.1 || drone.battery < 15 ? 4 : sig.q < 0.5 || drone.battery < 30 ? 2 : 1;
      ledF.color.setHex(Math.sin(now * Math.PI * 2 * sev) > -0.2 ? (sev === 4 ? 0xff4a40 : sev === 2 ? 0xffb020 : 0x3ddc84) : 0x2a3036);
      terrainUniforms.uDrone.value.set(drone.x, drone.y - FOOT, drone.z, drone3.visible ? 1 : 0.6);
      waterMat.uniforms.uTime.value = now;
      if (fallMat) fallMat.uniforms.uTime.value = now;
      beaconMat.uniforms.uTime.value = now;

      // wind streaks around the drone
      const ws = drone.wind.speed || 0, sa = clamp((ws - 4.5) / 9, 0, 1) * 0.5;
      streakMat.opacity = sa; streaks.visible = sa > 0.01 && state !== 'title';
      if (streaks.visible) {
        const dir = new V3(WIND_DIR.x, 0, WIND_DIR.z);
        windQ.setFromUnitVectors(new V3(1, 0, 0), dir);
        const SPAN = 60;
        for (let i = 0; i < NS; i++) {
          const d = SD[i];
          const u = ((d.u * SPAN + now * ws * 1.8 * d.sp) % SPAN) - SPAN / 2;
          sP.set(drone.x + dir.x * u + (d.w - 0.5) * 40 * -dir.z, drone.y - 8 + d.v * 22, drone.z + dir.z * u + (d.w - 0.5) * 40 * dir.x);
          sS.set(d.len * (0.6 + ws / 16), 1, 1); sM.compose(sP, windQ, sS); streaks.setMatrixAt(i, sM);
        }
        streaks.instanceMatrix.needsUpdate = true;
      }
      // splash
      if (splashT >= 0 && splashT < 2.4) {
        splashT += dt; let c = 0;
        for (const d of DROPS) {
          const y = LAKE.level + d.vy * splashT - 9.8 * splashT * splashT * 0.5;
          if (y < LAKE.level - 0.2) continue;
          sM.compose(sP.set(drone.x + d.vx * splashT, y, drone.z + d.vz * splashT), sQ, sS.setScalar(d.r)); drops.setMatrixAt(c++, sM);
        }
        drops.count = c; drops.instanceMatrix.needsUpdate = true; drops.visible = c > 0;
      } else drops.visible = false;
    }

    /* ================= HUD ================= */
    const compass = $('compass'), cctx = compass.getContext('2d');
    const map = $('map'), mctx = map.getContext('2d');
    const staticC = $('static'), sctx = staticC.getContext('2d'), sImg = sctx.createImageData(160, 90);
    const projV = new V3();
    for (const sp of SPOTS) {
      const el = document.createElement('div'); el.className = 'ov label spotlbl'; el.hidden = true;
      el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg><span></span>';
      app.insertBefore(el, $('mission')); sp.el = el;
    }
    function project(x, y, z) {
      projV.set(x, y, z).project(camera);
      const r = app.getBoundingClientRect();
      return { x: (projV.x + 1) / 2 * r.width, y: (1 - projV.y) / 2 * r.height, ok: projV.z < 1 && projV.z > -1 && Math.abs(projV.x) < 1.1 && Math.abs(projV.y) < 1.1 };
    }
    function bearing(x, z) { return Math.atan2(x - drone.x, -(z - drone.z)); } // 0 = north, clockwise
    function drawCompass() {
      const W = compass.width, Hh = compass.height, c = cctx;
      c.clearRect(0, 0, W, Hh);
      const head = wrapAng(-camYawForHud()); // heading, clockwise from north
      const pxPerRad = W / (Math.PI * 0.9);
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let deg = 0; deg < 360; deg += 15) {
        const a = wrapAng(deg * Math.PI / 180 - head), x = W / 2 + a * pxPerRad;
        if (x < -20 || x > W + 20) continue;
        const major = deg % 90 === 0;
        c.strokeStyle = 'rgba(255,255,255,' + (major ? 0.9 : 0.4) + ')'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x, Hh - 4); c.lineTo(x, Hh - (major ? 16 : 9)); c.stroke();
        if (major) { c.fillStyle = 'rgba(255,255,255,.95)'; c.font = '700 21px "Noto Sans TC", system-ui, sans-serif'; c.fillText(['北', '東', '南', '西'][deg / 90], x, Hh - 32); }
      }
      const mark = (wx, wz, col, txt) => {
        const a = wrapAng(bearing(wx, wz) - head), off = Math.abs(W / 2 + a * pxPerRad - W / 2) > W / 2 - 24;
        const x = clamp(W / 2 + a * pxPerRad, 24, W - 24);
        c.fillStyle = col;
        if (off) { // target is behind or to the side: draw an edge arrow
          const dir = a > 0 ? 1 : -1; c.beginPath(); c.moveTo(x + dir * 12, 26); c.lineTo(x - dir * 4, 14); c.lineTo(x - dir * 4, 38); c.closePath(); c.fill();
        } else { c.beginPath(); c.moveTo(x, 34); c.lineTo(x - 10, 18); c.lineTo(x + 10, 18); c.closePath(); c.fill(); }
        c.font = '700 17px "Noto Sans TC", system-ui, sans-serif'; c.fillText(txt, clamp(x, 40, W - 40) + (off ? (a > 0 ? -34 : 34) : 0), 9 + 1);
      };
      { let ns = null, nd = 1e9; for (const sp of SPOTS) { if (sp.got) continue; const d = Math.hypot(sp.x - drone.x, sp.z - drone.z); if (d < nd) { nd = d; ns = sp; } }
        if (ns && nd < 1400) mark(ns.x, ns.z, '#46d3c5', ns.name); }
      if (mission.stage < 3) mark(TARGET.x, TARGET.z, '#ff9a3c', '錄影點');
      mark(HOME.x, HOME.z, mission.stage >= 3 ? '#5fd396' : '#ffffff', 'H');
      c.fillStyle = '#fff'; c.fillRect(W / 2 - 1.5, Hh - 20, 3, 18);
      c.restore();
    }
    function camYawForHud() { return camMode === 2 ? Math.atan2(-(drone.x - PILOT.x), -(drone.z - PILOT.z)) : camMode === 0 ? camYaw : drone.yaw; }
    function drawMap() {
      const S = map.width, c = mctx;
      c.clearRect(0, 0, S, S);
      c.save(); c.beginPath(); c.roundRect ? c.roundRect(0, 0, S, S, 18) : c.rect(0, 0, S, S); c.clip();
      c.globalAlpha = 0.92; c.drawImage(mapBg, 0, 0, S, S); c.globalAlpha = 1;
      const [px, pz] = toMap(PILOT.x, PILOT.z, S), [dx, dz] = toMap(drone.x, drone.z, S), [tx, tz] = toMap(TARGET.x, TARGET.z, S), [hx, hz] = toMap(HOME.x, HOME.z, S);
      // radio line
      c.setLineDash([8, 7]); c.lineWidth = 3;
      c.strokeStyle = sig.q < 0.1 ? 'rgba(255,90,80,.95)' : sig.q < 0.5 ? 'rgba(255,190,80,.95)' : 'rgba(110,230,160,.9)';
      c.beginPath(); c.moveTo(px, pz); c.lineTo(dx, dz); c.stroke(); c.setLineDash([]);
      // target zone
      const tr = TARGET.r / MAPV.span * S;
      c.fillStyle = mission.stage >= 3 ? 'rgba(95,211,150,.35)' : 'rgba(255,154,60,.35)'; c.strokeStyle = mission.stage >= 3 ? '#5fd396' : '#ff9a3c'; c.lineWidth = 3;
      c.beginPath(); c.arc(tx, tz, Math.max(tr, 8), 0, Math.PI * 2); c.fill(); c.stroke();
      // photo spots
      for (const sp of SPOTS) {
        const [sx, sz] = toMap(sp.x, sp.z, S);
        c.fillStyle = sp.got ? '#5fd396' : '#46d3c5'; c.strokeStyle = '#0b1015'; c.lineWidth = 3;
        c.beginPath(); c.arc(sx, sz, 9, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#0b1015'; c.fillRect(sx - 4.5, sz - 2.5, 9, 6); c.beginPath(); c.arc(sx, sz + 0.5, 1.8, 0, Math.PI * 2); c.fillStyle = sp.got ? '#5fd396' : '#46d3c5'; c.fill();
      }
      // home
      c.fillStyle = '#fff'; c.font = '800 22px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', hx, hz);
      // drone arrow
      c.save(); c.translate(dx, dz); c.rotate(-drone.yaw);
      c.fillStyle = '#fff'; c.strokeStyle = '#0b1015'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, -15); c.lineTo(10, 11); c.lineTo(0, 5); c.lineTo(-10, 11); c.closePath(); c.stroke(); c.fill();
      c.restore();
      c.restore();
    }
    function drawStatic(level) {
      const el = staticC;
      if (level < 0.03) { if (el.style.opacity !== '0') el.style.opacity = 0; return; }
      const d = sImg.data;
      for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      sctx.putImageData(sImg, 0, 0);
      el.style.opacity = (level * (camMode === 1 ? 0.85 : 0.42)).toFixed(2);
    }
    function updateHud(dt) {
      if (state === 'play') updateGimbal(dt);
      const g = groundAt(drone.x, drone.z);
      const surf = inLake(drone.x, drone.z) ? Math.max(g, LAKE.level) : g;
      const agl = Math.max(0, drone.y - FOOT - surf);
      set('alt', Math.round(agl), v => $('tAlt').textContent = v);
      set('spd', Math.round(Math.hypot(drone.vx, drone.vz)), v => $('tSpd').textContent = v);
      const dist = Math.hypot(drone.x - HOME.x, drone.z - HOME.z);
      set('dist', Math.round(dist), v => $('tDist').textContent = v);
      set('wind', drone.wind.speed.toFixed(1), v => $('tWind').textContent = v);
      const windToward = Math.atan2(WIND_DIR.x, -WIND_DIR.z); // bearing the wind blows toward
      set('warrow', Math.round((wrapAng(windToward + camYawForHud())) * 30), () => $('tWindArrow').style.transform = `rotate(${wrapAng(windToward + camYawForHud())}rad)`);
      const b = Math.max(0, drone.battery);
      retTimer -= dt; if (retTimer <= 0) { retTimer = 0.5; retCost = drone.landed && dist < 20 ? 0 : returnCost(drone, simT); }
      const lvl = b < 15 || (b < retCost && dist > 30) ? 'crit' : b < 30 || b < retCost + 8 ? 'warn' : '';
      set('batt', Math.ceil(b) + lvl, () => {
        $('tBatt').textContent = Math.ceil(b); $('tBattFill').style.width = b + '%'; $('tBattWrap').className = 't ' + lvl;
      });
      set('need', Math.round(clamp(retCost, 0, 100)), v => { $('tBattNeed').style.left = v + '%'; $('tBattNeed').hidden = v <= 0; });
      const bars = drone.landed && dist < 20 ? 4 : barsOf(sig.q);
      set('bars', bars, v => {
        [...$('tBars').children].forEach((el, i) => el.classList.toggle('on', i < v));
        $('tBars').className = 'bars' + (v <= 2 ? ' weak' : ''); $('tSigTxt').hidden = v !== 0;
      });
      set('time', Math.floor(mission.time), v => $('tTime').textContent = fmtT(v));

      // mission panel
      const stage = mission.stage;
      set('stage', stage, s => { [...$('steps').children].forEach((li, i) => { li.className = i < s ? 'done' : i === s ? 'now' : ''; }); });
      let sub;
      const touchUI = app.classList.contains('touch');
      if (stage === 0) sub = touchUI ? '按右上角的「上升」，或把左邊搖桿往上推起飛' : '按右上角的「上升」（或按住 <b>W</b>）起飛';
      else if (stage === 1) {
        const dt2 = Math.hypot(drone.x - TARGET.x, drone.z - TARGET.z);
        sub = `錄影點還有 <b>${Math.round(dt2)} m</b>，建議離水面 <b>100–200 m</b>`;
      } else if (stage === 2) {
        const inZ = inRecordZone(drone);
        sub = inZ ? `錄影中 <b>${mission.rec.toFixed(1)} / ${TARGET.need} 秒</b>` : `回到橘色圈圈裡繼續錄影（已錄 <b>${mission.rec.toFixed(1)} 秒</b>）`;
      } else if (stage === 3) sub = `飛回起飛點降落，還有 <b>${Math.round(dist)} m</b>`;
      else sub = '任務完成！';
      set('sub', sub, v => $('mSub').innerHTML = v);

      // recording strip
      const recOn = stage === 2 && inRecordZone(drone) && !rth;
      set('recOn', recOn, v => $('rec').hidden = !v);
      if (recOn) { $('recFill').style.width = (mission.rec / TARGET.need * 100) + '%'; set('recTxt', mission.rec.toFixed(1), v => $('recTxt').textContent = `${v} / ${TARGET.need} 秒`); }

      // alert banner, most urgent first
      let a = null;
      if (drone.powerless) a = ['電量 0%：馬達停轉', 'crit'];
      else if (rth && rth.reason === 'lost') a = ['訊號中斷：自動返航中', 'crit'];
      else if (airborne() && sig.q < 0.1 && lostT > 0) a = [`訊號中斷 ${Math.max(0, 2.5 - lostT).toFixed(1)} 秒後自動返航`, 'crit'];
      else if (airborne() && b < retCost && dist > 30) a = ['電量不夠飛回家了！立刻返航（H）', 'crit'];
      else if (ud.autoLand) a = ['自動降落中（推搖桿可取消）', 'ok'];
      else if (rth) a = [rth.reason === 'restored' ? '訊號恢復・自動返航中（推搖桿取消）' : '自動返航中（推搖桿或按 H 取消）', 'ok'];
      else if (airborne() && b < retCost + 8 && dist > 30) a = ['電量快不夠回家，該返航了', 'warn'];
      else if (airborne() && sig.q < 0.5) a = ['訊號微弱：飛高一點', 'warn'];
      else if (airborne() && drone.wind.speed > 10) a = ['強風：飛機會被吹偏', 'warn'];
      setAlert(state === 'play' ? a : null);
      alarmKind = state !== 'play' || !a || a[1] !== 'crit' ? null : (rth && rth.reason === 'lost') || (airborne() && sig.q < 0.1) ? 'lost' : 'batt';

      // world labels
      const lt = $('lblTarget'), lh = $('lblHome');
      const tp = project(TARGET.x, LAKE.level + TARGET.maxAgl + 12, TARGET.z);
      const showT = state === 'play' && camMode !== 2 && tp.ok && mission.stage < 4;
      set('lt', showT, v => lt.hidden = !v);
      if (showT) { lt.style.transform = `translate(${tp.x.toFixed(0)}px,${tp.y.toFixed(0)}px) translate(-50%,-50%)`; set('ltTxt', mission.stage >= 3 ? 'done' : Math.round(Math.hypot(drone.x - TARGET.x, drone.z - TARGET.z) / 10) * 10, v => lt.textContent = v === 'done' ? '已錄影 ✓' : `錄影點 ${v} m`); }
      const hp = project(HOME.x, 6, HOME.z);
      const showH = state === 'play' && camMode === 0 && hp.ok && mission.stage >= 3 && dist > 25;
      set('lh', showH, v => lh.hidden = !v);
      if (showH) lh.style.transform = `translate(${hp.x.toFixed(0)}px,${hp.y.toFixed(0)}px) translate(-50%,-50%)`;

      // landmark labels
      let nearestOpen = null, nOD = 1e9;
      for (const sp of SPOTS) { if (sp.got) continue; const d = Math.hypot(sp.x - drone.x, sp.z - drone.z); if (d < nOD) { nOD = d; nearestOpen = sp; } }
      for (const sp of SPOTS) {
        const el = sp.el; if (!el) continue;
        const d = Math.hypot(sp.x - drone.x, sp.fy - drone.y, sp.z - drone.z);
        const lp = project(sp.x, sp.fy + 10 + Math.min(40, d * 0.03), sp.z);
        const show = state === 'play' && camMode !== 2 && lp.ok && d > 6 && (d < 820 || sp === nearestOpen); // far labels only for the next spot, so they don't pile up
        if (el.hidden === show) el.hidden = !show;
        if (show) {
          el.style.transform = `translate(${lp.x.toFixed(0)}px,${lp.y.toFixed(0)}px) translate(-50%,-100%)`;
          const txt = sp.got ? `${sp.name} ✓` : `${sp.name}・${d < 1000 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(1) + ' km'}`;
          if (sp.lastTxt !== txt) { sp.lastTxt = txt; el.querySelector('span').textContent = txt; el.classList.toggle('got', sp.got); }
          el.style.opacity = d < 900 ? 1 : 0.75;
        }
      }
      readyT -= dt;
      if (readyT <= 0 && state === 'play') {
        readyT = 0.25;
        readySpots = airborne() || drone.landed ? spotsInFrame().filter(o => !o.sp.got) : [];
        const r = readySpots.length > 0;
        $('bShot').classList.toggle('ready', r);
        set('readyTxt', r ? readySpots[0].sp.name : '', v => { $('shotReady').hidden = !v; $('shotReady').textContent = v ? `可以拍：${v}` : ''; });
      }
      set('vf', state === 'play' && camMode === 1, v => { $('viewfinder').hidden = !v; });
      if (shotT > 0) { shotT -= dt; if (shotT <= 0) $('shot').hidden = true; }
      drawCompass(); drawMap();
      const st = airborne() ? clamp(1 - sig.q / 0.45, 0, 1) : 0;
      drawStatic(state === 'play' ? st : 0);
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = 0; }
    }
    const airborne = () => !drone.landed && !drone.crashed;

    /* ================= main loop ================= */
    function resize() {
      const r = app.getBoundingClientRect();
      if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(app); resize();

    let lastTs = null, clock = 0, perfT = 0, perfN = 0;
    function frame(ts) {
      const raw = lastTs == null ? 1 / 60 : (ts - lastTs) / 1000;
      const dt = Math.min(0.05, raw);
      lastTs = ts; clock += dt;
      // keep the frame rate up on slower devices by rendering fewer pixels
      if (state === 'play' && raw < 0.5) { perfT += raw; perfN++; if (perfT > 2.5) { if (perfT / perfN > 0.036 && pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); } perfT = 0; perfN = 0; } }
      pollPad();
      if (state === 'play') simulate(dt);
      if (endTimer >= 0 && state === 'play') { endTimer -= dt; if (endTimer < 0) endGame(mission.done, drone.crashed || ''); }
      if (state !== 'paused') {
        updateCamera(dt);
        updateVisuals(dt, clock);
        updateHud(dt);
        updateAudio(lastCmd, dt);
        renderer.render(scene, camera);
      }
      requestAnimationFrame(frame);
    }
    $('loading').hidden = true;
    state = 'title'; $('start').hidden = false;
    $('bStart').focus();
    requestAnimationFrame(frame);
  }
})();
