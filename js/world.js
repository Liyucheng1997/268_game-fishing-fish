// ===================== 钓点世界：地形 / 远山 / 植被 / 栈桥与道具 =====================
'use strict';

const World = (() => {
  const U = { uTime: { value: 0 }, uCaust: { value: 1 }, uWind: { value: 1 } };

  // ---------- 各钓点配置 ----------
  const LOC = {
    pond: {
      eyeY: 2.45, deckY: 0.85, deckEndZ: -1.4,
      water: { amp: 0.07, freq: 1.8, scatter: '#2c5a48', absorb: [0.42, 0.17, 0.24], normStr: 0.75 },
      fog: [120, 1300],
      bed: '#7a6c4c', bed2: '#5e7040', shore: '#9a8a64', grass: ['#4f7a2c', '#6b8f36'], rock: '#7d786e',
      mountains: { r0: 620, r1: 1100, h: 150, col: '#5f7d74' },
    },
    river: {
      eyeY: 2.6, deckY: 1.0, deckEndZ: -1.6,
      water: { amp: 0.12, freq: 1.5, scatter: '#1d5a58', absorb: [0.3, 0.09, 0.11], normStr: 1.0, flow: [1.3, 0] },
      fog: [140, 1400],
      bed: '#8a8272', bed2: '#6a7a5e', shore: '#9d9686', grass: ['#3f6a2a', '#5a7a30'], rock: '#88847c',
      mountains: { r0: 520, r1: 1100, h: 330, col: '#56676e' },
    },
    sea: {
      eyeY: 3.75, deckY: 2.1, deckEndZ: -1.6,
      water: { amp: 0.42, freq: 0.75, scatter: '#0f5478', absorb: [0.3, 0.06, 0.04], normStr: 1.15, crestFoam: 0.55 },
      fog: [200, 1900],
      bed: '#c9b48a', bed2: '#b9a47a', shore: '#e0cc9c', grass: ['#6d8a3a', '#8a9a4a'], rock: '#6f6a64',
      mountains: null,
    },
  };

  // ---------- 高度函数 ----------
  const HEIGHT = {
    pond(x, z) {
      const cz = -104, rx = 150, rz = 108, R = 129;
      const qx = x / rx, qz = (z - cz) / rz;
      const ang = Math.atan2(qz, qx);
      const nearPlayer = U3.smooth(0.15, 0.7, Math.abs(ang - Math.PI / 2));
      const rn = 1 + 0.13 * U3.fbm(Math.cos(ang) * 1.6 + 3, Math.sin(ang) * 1.6 + 7, 3, 11) * nearPlayer;
      const r = Math.hypot(qx, qz) / rn;
      const sd = (r - 1) * R;
      let h;
      if (sd < 0) {
        h = -6.5 * (1 - Math.exp(sd / 16)) + U3.fbm(x * 0.05, z * 0.05, 3, 3) * 0.8 * (1 - Math.exp(sd / 5));
      } else {
        h = 1.6 * (1 - Math.exp(-sd / 7)) + sd * 0.035;
        h += U3.smooth(12, 140, sd) * (U3.fbm(x * 0.007, z * 0.007, 4, 21) * 0.5 + 0.55) * 55;
        h += U3.fbm(x * 0.06, z * 0.06, 3, 5) * 0.8 * U3.smooth(0, 12, sd);
      }
      return h;
    },
    river(x, z) {
      const zc = -60 + 6 * Math.sin(x * 0.012) + 5 * (U3.fbm(x * 0.008, 3, 2, 4) - U3.fbm(0, 3, 2, 4));
      const half = 62;
      const sd = Math.abs(z - zc) - half;
      let h;
      if (sd < 0) {
        h = -4.8 * (1 - Math.exp(sd / 9)) + U3.fbm(x * 0.08, z * 0.08, 3, 8) * 0.5 * (1 - Math.exp(sd / 3));
      } else if (z > zc) {
        h = 1.4 * (1 - Math.exp(-sd / 4)) + sd * 0.06;
        h += U3.smooth(15, 160, sd) * (U3.fbm(x * 0.008, z * 0.008, 4, 31) * 0.5 + 0.6) * 45;
        h += U3.fbm(x * 0.09, z * 0.09, 3, 9) * 0.7 * U3.smooth(0, 8, sd);
      } else {
        h = 1.2 * (1 - Math.exp(-sd / 2.5)) + U3.smooth(2, 26, sd) * (26 + U3.fbm(x * 0.02, z * 0.02, 3, 12) * 16);
        h += U3.smooth(30, 220, sd) * (U3.fbm(x * 0.006, z * 0.006, 4, 41) * 0.5 + 0.6) * 90;
        h += U3.fbm(x * 0.05, z * 0.05, 3, 13) * 3 * U3.smooth(0, 10, sd);
      }
      return h;
    },
    sea(x, z) {
      const zs = 12 + 7 * (U3.fbm(x * 0.008, 1, 3, 2) - U3.fbm(0, 1, 3, 2)) + Math.max(0, -x - 60) * 0.35;
      const sd = z - zs;
      let h;
      if (sd < 0) {
        h = -15 * (1 - Math.exp(sd / 42)) + Math.sin(z * 0.15 + x * 0.02) * 0.25 * Math.exp(sd / 30);
      } else {
        h = 1.1 * (1 - Math.exp(-sd / 7)) + sd * 0.05 + U3.fbm(x * 0.03, z * 0.03, 3, 7) * 1.5 * U3.smooth(5, 30, sd);
      }
      // 左侧海岬
      const ax = -175, az = 40, bx = -120, bz = -95;
      const t = U3.clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2), 0, 1);
      const dc = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
      const cape = (20 + U3.fbm(x * 0.03, z * 0.03, 3, 17) * 10) * U3.smooth(46, 8, dc) - 9 + (1 - t) * 8;
      h = Math.max(h, cape);
      // 远处海岛
      [[240, -620, 90, 55], [-380, -820, 140, 90], [560, -1050, 170, 120], [-60, -1350, 200, 70]].forEach(([ix, iz, r, ih]) => {
        const d = Math.hypot(x - ix, z - iz);
        if (d < r * 1.3) h = Math.max(h, ih * Math.pow(U3.smooth(r * 1.25, 0, d), 1.5) * (0.8 + U3.fbm(x * 0.02, z * 0.02, 3, 19) * 0.5) - 8);
      });
      return h;
    },
  };

  let group = null, cfg = null, locId = null, hfn = null;
  const anim = [];
  let lanternLight = null, lanternMats = [], lilies = null, lilyData = [], boat = null, fireflies = null, beam = null;

  function heightAt(x, z) { return hfn ? hfn(x, z) : -5; }
  function slopeAt(x, z) {
    const e = 1.5;
    return Math.hypot(hfn(x + e, z) - hfn(x - e, z), hfn(x, z + e) - hfn(x, z - e)) / (2 * e);
  }

  // ---------- 材质补丁：焦散/湿润 & 风 ----------
  // 可叠加的着色器补丁
  function chain(mat, key, fn) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => { prev.call(mat, sh, r); fn(sh); };
    mat.userData.pk = (mat.userData.pk || '') + key;
    mat.customProgramCacheKey = () => mat.userData.pk;
    return mat;
  }
  function causticPatch(mat) {
    return chain(mat, 'caustic|', (sh) => {
      sh.uniforms.uTime = U.uTime; sh.uniforms.uCaust = U.uCaust;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 wpp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wpp = instanceMatrix * wpp;
          #endif
          vWPos = (modelMatrix * wpp).xyz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform float uTime, uCaust;\n${U3.GLSL.caustic}`)
        .replace('#include <fog_fragment>', `
          {
            float wd = -vWPos.y;
            if (wd > 0.0) {
              float c = caustic(vWPos.xz * 0.55, uTime * 0.55);
              gl_FragColor.rgb *= mix(1.0, 0.72, smoothstep(0.0, 1.5, wd));
              gl_FragColor.rgb += gl_FragColor.rgb * c * uCaust * exp(-wd * 0.28) * 2.2;
            } else if (wd > -0.3) {
              gl_FragColor.rgb *= 0.78 + 0.22 * smoothstep(0.0, -0.3, wd);
            }
          }
          #include <fog_fragment>`);
    });
  }
  function windPatch(mat, k = 1, key = 'wind') {
    return chain(mat, key + k + '|', (sh) => {
      sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime, uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            float ph = 0.0;
            #ifdef USE_INSTANCING
              ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
            #endif
            float hy = max(position.y, 0.0);
            float sw = (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25) * uWind;
            transformed.x += sw * hy * hy * ${(0.012 * k).toFixed(4)};
            transformed.z += sw * hy * hy * ${(0.006 * k).toFixed(4)};
          }`);
    });
  }

  // ---------- 纹理 ----------
  let detailTex = null, woodTex = null;
  function getDetailTex() {
    if (detailTex) return detailTex;
    detailTex = U3.canvasTex(256, 256, (c, W, H) => {
      const img = c.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        // 可平铺噪声
        const fx = x / W * Math.PI * 2, fy = y / H * Math.PI * 2;
        const n = U3.fbm(Math.cos(fx) * 3 + 10, Math.sin(fx) * 3 + Math.cos(fy) * 3 + Math.sin(fy) * 3, 5, 2);
        const v = 205 + n * 70 + (Math.random() - 0.5) * 18;
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = U3.clamp(v, 0, 255); img.data[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    }, { repeat: true });
    return detailTex;
  }
  function getWoodTex() {
    if (woodTex) return woodTex;
    woodTex = U3.canvasTex(256, 512, (c, W, H) => {
      c.fillStyle = '#8a6a48'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 90; i++) {
        c.strokeStyle = `rgba(${40 + Math.random() * 30 | 0},${25 + Math.random() * 20 | 0},10,${0.12 + Math.random() * 0.2})`;
        c.lineWidth = 1 + Math.random() * 2.5;
        const x = Math.random() * W;
        c.beginPath(); c.moveTo(x, 0);
        c.bezierCurveTo(x + (Math.random() - 0.5) * 20, H * 0.3, x + (Math.random() - 0.5) * 20, H * 0.7, x + (Math.random() - 0.5) * 10, H);
        c.stroke();
      }
      for (let i = 0; i < 6; i++) { // 木节
        const x = Math.random() * W, y = Math.random() * H;
        const g = c.createRadialGradient(x, y, 1, x, y, 10);
        g.addColorStop(0, 'rgba(40,24,10,0.8)'); g.addColorStop(1, 'rgba(40,24,10,0)');
        c.fillStyle = g; c.beginPath(); c.ellipse(x, y, 7, 14, 0, 0, 7); c.fill();
      }
    }, { repeat: true });
    return woodTex;
  }

  // ---------- 地形 ----------
  function buildTerrain() {
    const SEG = 240, S = 1500;
    const pos = [], col = [], uv = [], idx = [];
    const warp = (u) => Math.sign(u) * Math.pow(Math.abs(u), 1.8);
    const cBed = new THREE.Color(cfg.bed), cBed2 = new THREE.Color(cfg.bed2), cShore = new THREE.Color(cfg.shore);
    const cG1 = new THREE.Color(cfg.grass[0]), cG2 = new THREE.Color(cfg.grass[1]), cRock = new THREE.Color(cfg.rock);
    const cDirt = new THREE.Color('#6b5a3e'), cSnow = new THREE.Color('#e8eef2');
    const c = new THREE.Color();
    for (let j = 0; j <= SEG; j++) {
      for (let i = 0; i <= SEG; i++) {
        const x = warp(i / SEG * 2 - 1) * S, z = warp(j / SEG * 2 - 1) * S;
        const h = hfn(x, z);
        pos.push(x, h, z);
        uv.push(x / 6, z / 6);
        const sl = slopeAt(x, z);
        const n = U3.fbm(x * 0.03, z * 0.03, 3, 77);
        if (h < -0.25) {
          c.copy(cBed).lerp(cBed2, U3.smooth(-0.3, 0.4, n));
          c.lerp(cShore, U3.smooth(-1.2, -0.25, h) * 0.5);
        } else if (h < 0.7) {
          c.copy(cShore).multiplyScalar(0.85 + n * 0.2);
        } else {
          c.copy(cG1).lerp(cG2, U3.smooth(-0.4, 0.5, n));
          c.lerp(cDirt, U3.smooth(0.25, 0.6, U3.fbm(x * 0.012, z * 0.012, 3, 91)) * 0.45);
          c.lerp(cShore, U3.smooth(1.4, 0.7, h));
          // 岩壁：带岩层纹理与冷暖变化
          const rockK = U3.smooth(0.45, 0.85, sl);
          if (rockK > 0) {
            const band = 0.72 + 0.3 * Math.sin(h * 0.9 + U3.fbm(x * 0.02, z * 0.02, 3, 55) * 4) + n * 0.15;
            const rc = cRock.clone().lerp(new THREE.Color('#8a7258'), U3.smooth(-0.3, 0.5, U3.fbm(x * 0.01, h * 0.05, 3, 56))).multiplyScalar(band);
            c.lerp(rc, rockK);
            // 岩缝里的苔藓
            c.lerp(cG1, rockK * U3.smooth(0.2, 0.6, U3.fbm(x * 0.05, h * 0.2, 3, 57)) * 0.5);
          }
          if (h > 150) c.lerp(cRock, U3.smooth(150, 200, h));
          if (h > 240) c.lerp(cSnow, U3.smooth(240, 290, h) * 0.8);
        }
        col.push(c.r, c.g, c.b);
      }
    }
    const row = SEG + 1;
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const a = j * row + i, b = a + 1, cc = a + row, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = causticPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: getDetailTex() }));
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    group.add(m);
  }

  function buildMountains() {
    const M = cfg.mountains;
    if (!M) return;
    const SEG = 260, RINGS = 14;
    const pos = [], col = [], idx = [];
    const base = new THREE.Color(M.col), snow = new THREE.Color('#dfe6ea'), dark = base.clone().multiplyScalar(0.7);
    for (let j = 0; j <= RINGS; j++) {
      const t = j / RINGS;
      const r = U3.lerp(M.r0, M.r1, t);
      for (let i = 0; i <= SEG; i++) {
        const a = i / SEG * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        let n = U3.fbm(Math.cos(a) * 4 + 50, Math.sin(a) * 4 + t * 2, 5, 61);
        const ridge = 1 - Math.abs(U3.vnoise(Math.cos(a) * 9, Math.sin(a) * 9 + t * 3, 62));
        let h = (n * 0.5 + 0.5) * M.h * Math.sin(t * Math.PI) * (0.6 + ridge * 0.6);
        h = Math.max(h, 0) - 10;
        pos.push(x, h, z);
        const c = dark.clone().lerp(base, U3.smooth(0, M.h * 0.6, h));
        if (h > M.h * 0.72) c.lerp(snow, U3.smooth(M.h * 0.72, M.h * 0.9, h));
        col.push(c.r, c.g, c.b);
      }
    }
    const row = SEG + 1;
    for (let j = 0; j < RINGS; j++) for (let i = 0; i < SEG; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    group.add(m);
  }

  // ---------- 植被几何 ----------
  function broadleafGeo(seed) {
    const r = U3.rng(seed);
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.16, 0.3, 4.2, 7, 3);
    trunk.translate(0, 2.1, 0);
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + Math.sin(y * 0.8 + seed) * 0.15); }
    trunk.computeVertexNormals();
    parts.push(U3.paint(trunk, '#4a3a2a'));
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const s = 1.5 + r() * 1.1;
      const b = new THREE.IcosahedronGeometry(s, 2);
      U3.jitter(b, 0.22, 0.9, seed + i);
      const a = r() * Math.PI * 2, rr = i === 0 ? 0 : 1.2 + r() * 0.9;
      const y = 4.6 + (i === 0 ? 1.3 : r() * 1.8);
      b.translate(Math.cos(a) * rr, y, Math.sin(a) * rr);
      const p = b.attributes.position, cols = [];
      for (let k = 0; k < p.count; k++) {
        const yy = (p.getY(k) - 3) / 5;
        const c = new THREE.Color('#1f3d14').lerp(new THREE.Color('#5d8a2c'), U3.clamp(yy, 0, 1));
        c.multiplyScalar(0.85 + r() * 0.3);
        cols.push(c.r, c.g, c.b);
      }
      b.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      parts.push(b);
    }
    return U3.merge(parts);
  }
  function pineGeo(seed) {
    const r = U3.rng(seed);
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.1, 0.24, 7, 6);
    trunk.translate(0, 3.5, 0);
    parts.push(U3.paint(trunk, '#3e2e22'));
    const layers = 5 + Math.floor(r() * 2);
    for (let i = 0; i < layers; i++) {
      const t = i / layers;
      const rad = U3.lerp(2.3, 0.6, t) * (0.9 + r() * 0.2);
      const cone = new THREE.ConeGeometry(rad, 2.6, 9, 2);
      U3.jitter(cone, 0.12, 1.4, seed + i * 3);
      cone.translate(0, 2.4 + t * 5.8, 0);
      const p = cone.attributes.position, cols = [];
      for (let k = 0; k < p.count; k++) {
        const c = new THREE.Color('#10281a').lerp(new THREE.Color('#2f5a2c'), U3.clamp((p.getY(k) - 2) / 8, 0, 1) * 0.8 + r() * 0.2);
        cols.push(c.r, c.g, c.b);
      }
      cone.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      parts.push(cone);
    }
    return U3.merge(parts);
  }
  function bushGeo(seed) {
    const r = U3.rng(seed);
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const b = new THREE.IcosahedronGeometry(0.7 + r() * 0.5, 1);
      U3.jitter(b, 0.25, 1.5, seed + i);
      b.translate((r() - 0.5) * 1.2, 0.5 + r() * 0.3, (r() - 0.5) * 1.2);
      const p = b.attributes.position, cols = [];
      for (let k = 0; k < p.count; k++) {
        const c = new THREE.Color('#29451a').lerp(new THREE.Color('#6a8f34'), U3.clamp(p.getY(k) / 1.4, 0, 1));
        cols.push(c.r, c.g, c.b);
      }
      b.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      parts.push(b);
    }
    return U3.merge(parts);
  }
  function rockGeo(seed) {
    const b = new THREE.IcosahedronGeometry(1, 1);
    U3.jitter(b, 0.35, 0.9, seed);
    b.scale(1, 0.65, 1);
    return b;
  }
  function reedGeo(seed, cattail = true) {
    const r = U3.rng(seed);
    const parts = [];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const h = 1.2 + r() * 1.3, w = 0.035 + r() * 0.02;
      const a = r() * Math.PI * 2, rr = r() * 0.5;
      const lean = (r() - 0.5) * 0.5, dir = r() * Math.PI * 2;
      const pos = [], cols = [], idx = [];
      const SEG = 5;
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG;
        const bx = Math.cos(a) * rr + Math.cos(dir) * lean * t * t * h, bz = Math.sin(a) * rr + Math.sin(dir) * lean * t * t * h;
        const ww = w * (1 - t * 0.9);
        const px = -Math.sin(dir) * ww, pz = Math.cos(dir) * ww;
        pos.push(bx - px, t * h, bz - pz, bx + px, t * h, bz + pz);
        const c = new THREE.Color('#3d5a22').lerp(new THREE.Color('#b8b060'), t * t * 0.7);
        cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
      for (let s = 0; s < SEG; s++) { const k = s * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      parts.push(g);
    }
    if (cattail) {
      for (let i = 0; i < 3; i++) {
        const h = 1.6 + r() * 0.8, x = (r() - 0.5) * 0.6, z = (r() - 0.5) * 0.6;
        const stem = new THREE.CylinderGeometry(0.012, 0.016, h, 4);
        stem.translate(x, h / 2, z);
        parts.push(U3.paint(stem, '#4a6a2a'));
        const head = new THREE.CapsuleGeometry(0.045, 0.22, 3, 6);
        head.translate(x, h - 0.05, z);
        parts.push(U3.paint(head, '#5a3a22'));
      }
    }
    return U3.merge(parts);
  }

  function scatter(count, test, seed, maxTry = 30) {
    const r = U3.rng(seed);
    const out = [];
    for (let i = 0; i < count * maxTry && out.length < count; i++) {
      const p = test(r);
      if (p) out.push(p);
    }
    return out;
  }
  function instanced(geo, mat, list, shadow = true) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color();
    list.forEach((it, i) => {
      q.setFromEuler(new THREE.Euler(it.rx || 0, it.ry || 0, it.rz || 0));
      s.set(it.sx || it.s, it.sy || it.s, it.sz || it.s);
      p.set(it.x, it.y, it.z);
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
      c.setRGB(it.c || 1, it.c2 || it.c || 1, it.c3 || it.c || 1);
      im.setColorAt(i, c);
    });
    im.castShadow = shadow; im.receiveShadow = true;
    group.add(im);
    return im;
  }

  function buildVegetation() {
    const inDock = (x, z) => Math.abs(x) < 4 && z > -4 && z < 45;
    const leafMat = windPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 0.35, 'leaf');
    const pineMat = windPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 0.2, 'pine');
    const counts = locId === 'pond' ? [520, 260, 300] : locId === 'river' ? [160, 900, 220] : [0, 150, 160];
    const treeTest = (minH, maxH, maxSlope, rMin = 18) => (r) => {
      const a = r() * Math.PI * 2, d = rMin + Math.pow(r(), 0.65) * 520;
      const x = Math.cos(a) * d, z = Math.sin(a) * d - 60;
      const h = hfn(x, z);
      if (h < minH || h > maxH || inDock(x, z)) return null;
      if (slopeAt(x, z) > maxSlope) return null;
      return { x, y: h - 0.3, z, ry: r() * 6.28, s: 0.75 + r() * 0.6, c: 0.8 + r() * 0.4 };
    };
    // 阔叶树（多个变体）
    for (let v = 0; v < 3; v++) {
      const list = scatter(counts[0] / 3 | 0, treeTest(0.9, 90, 0.55), 100 + v);
      instanced(broadleafGeo(10 + v), leafMat, list);
    }
    for (let v = 0; v < 3; v++) {
      const list = scatter(counts[1] / 3 | 0, treeTest(locId === 'sea' ? 3 : 0.9, 260, 0.9), 200 + v);
      list.forEach(p => { p.s *= 1.1; });
      instanced(pineGeo(20 + v), pineMat, list);
    }
    const bushes = scatter(counts[2], treeTest(0.5, 60, 0.6, 8), 300);
    bushes.forEach(b => { b.s *= 0.9; b.y += 0.2; });
    instanced(bushGeo(5), leafMat, bushes);

    // 岸边石头 & 水中石头
    const rockMat = causticPatch(new THREE.MeshStandardMaterial({ color: cfg.rock, roughness: 0.92, flatShading: true, map: getDetailTex() }));
    const rocks = scatter(locId === 'river' ? 220 : 110, (r) => {
      const a = r() * Math.PI * 2, d = 6 + Math.pow(r(), 0.8) * 260;
      const x = Math.cos(a) * d, z = Math.sin(a) * d - 60;
      const h = hfn(x, z);
      const inRiver = locId === 'river' && h < -0.4 && h > -4.2;
      if (!(inRiver || (h > -1.5 && h < 3)) || inDock(x, z) || Math.hypot(x, z) < 5) return null;
      const s = inRiver ? 0.5 + r() * 1.3 : 0.4 + r() * 1.4;
      return { x, y: h - s * 0.2, z, ry: r() * 6.28, rx: (r() - 0.5) * 0.3, s, c: 0.75 + r() * 0.4 };
    }, 400);
    instanced(rockGeo(3), rockMat, rocks);
    if (locId !== 'sea') {
      // 芦苇丛：沿岸浅水
      const reedMat = causticPatch(windPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), 1.4, 'reed'));
      const reeds = scatter(locId === 'pond' ? 420 : 200, (r) => {
        const a = r() * Math.PI * 2, d = 5 + Math.pow(r(), 0.9) * 230;
        const x = Math.cos(a) * d, z = Math.sin(a) * d - 60;
        const h = hfn(x, z);
        if (h < -0.9 || h > 0.8 || inDock(x, z)) return null;
        return { x, y: h - 0.05, z, ry: r() * 6.28, s: 0.8 + r() * 0.6, c: 0.85 + r() * 0.3 };
      }, 500);
      // 栈桥两侧手动加几丛
      [[-3.2, -2.5], [3.6, -4.5], [-4.8, 1.5], [4.2, 2.8], [-7, -6], [6.5, -1]].forEach(([x, z], i) => {
        if (hfn(x, z) < 0.5 && hfn(x, z) > -2.4) reeds.push({ x, y: hfn(x, z), z, ry: i, s: 0.9 + (i % 3) * 0.15, c: 1 });
      });
      instanced(reedGeo(7), reedMat, reeds, false);
    }
  }

  // ---------- 睡莲 ----------
  function buildLilies() {
    if (locId !== 'pond') return;
    const pad = new THREE.CircleGeometry(0.42, 18, 0.25, Math.PI * 2 - 0.5);
    pad.rotateX(-Math.PI / 2);
    const p = pad.attributes.position, cols = [];
    for (let i = 0; i < p.count; i++) {
      const d = Math.hypot(p.getX(i), p.getZ(i)) / 0.42;
      const c = new THREE.Color('#2e5a1c').lerp(new THREE.Color('#5a8a2a'), d * 0.8);
      cols.push(c.r, c.g, c.b);
      p.setY(i, d * 0.02);
    }
    pad.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    pad.computeVertexNormals();
    const clusters = [[-11, -12, 7], [9, -20, 5], [-26, -40, 9], [30, -34, 7], [-5, -52, 5], [45, -70, 8], [-50, -65, 10]];
    const r = U3.rng(55);
    lilyData = [];
    clusters.forEach(([cx, cz, rad]) => {
      for (let i = 0; i < rad * 3.2; i++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * rad;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (hfn(x, z) > -0.3) continue;
        lilyData.push({ x, z, ry: r() * 6.28, s: 0.7 + r() * 0.9, flower: r() < 0.12 });
      }
    });
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
    lilies = new THREE.InstancedMesh(pad, mat, lilyData.length);
    lilies.receiveShadow = true;
    group.add(lilies);
    // 荷花
    const petals = [];
    for (let i = 0; i < 8; i++) {
      const pg = new THREE.SphereGeometry(0.09, 8, 6);
      pg.scale(0.5, 0.35, 1.2);
      pg.translate(0, 0.06, 0.1);
      pg.rotateX(-0.6 - (i % 2) * 0.35);
      pg.rotateY(i / 8 * Math.PI * 2);
      const pp = pg.attributes.position, cc = [];
      for (let k = 0; k < pp.count; k++) {
        const c = new THREE.Color('#fff4f6').lerp(new THREE.Color('#f07aa0'), U3.clamp(pp.getY(k) / 0.15, 0, 1));
        cc.push(c.r, c.g, c.b);
      }
      pg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      petals.push(pg);
    }
    const ctr = U3.paint(new THREE.SphereGeometry(0.04, 8, 6).translate(0, 0.07, 0), '#ffd24a');
    petals.push(ctr);
    const flowerG = U3.merge(petals);
    const fl = lilyData.filter(l => l.flower);
    const flowers = new THREE.InstancedMesh(flowerG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), Math.max(1, fl.length));
    flowers.count = fl.length;
    group.add(flowers);
    lilies.userData.flowers = flowers;
  }

  // ---------- 栈桥与道具 ----------
  function woodMat(color = '#ffffff') {
    return causticPatch(new THREE.MeshStandardMaterial({ map: getWoodTex(), color, roughness: 0.85, vertexColors: true }));
  }
  function postGeo(x, z, top, bottom, r) {
    const g = new THREE.CylinderGeometry(r, r * 1.1, top - bottom, 8, 6);
    g.translate(x, (top + bottom) / 2, z);
    const p = g.attributes.position, cols = [];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      let c = new THREE.Color('#9a7a58');
      if (y < 0.25) c = new THREE.Color('#3a3a26').lerp(new THREE.Color('#2a3a1e'), U3.smooth(0, -1, y));
      else if (y < 0.5) c.lerp(new THREE.Color('#4a4030'), U3.smooth(0.5, 0.25, y));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }
  function plankRow(parts, x0, x1, z0, z1, y, alongX, seed) {
    const r = U3.rng(seed);
    const W = 0.2, gap = 0.025;
    if (alongX) {
      for (let z = z0; z > z1; z -= W + gap) {
        const g = new THREE.BoxGeometry(x1 - x0 + (r() - 0.5) * 0.1, 0.055, W);
        g.rotateZ((r() - 0.5) * 0.015);
        g.translate((x0 + x1) / 2 + (r() - 0.5) * 0.05, y + (r() - 0.5) * 0.012, z - W / 2);
        const uv = g.attributes.uv; const o = r();
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.3 + o, uv.getY(i) * 2 + o);
        U3.paint(g, new THREE.Color('#ffffff').multiplyScalar(0.75 + r() * 0.3));
        parts.push(g);
      }
    }
  }

  function buildDock() {
    const parts = [];
    const dy = cfg.deckY;
    if (locId === 'pond') {
      plankRow(parts, -1.2, 1.2, 14, cfg.deckEndZ, dy, true, 3);
      [-1.0, 1.0].forEach(x => {
        const s = new THREE.BoxGeometry(0.12, 0.18, 15.6); s.translate(x, dy - 0.12, 6.3);
        parts.push(U3.paint(s, '#6a4e34'));
      });
      for (let z = cfg.deckEndZ + 0.1; z < 14; z += 2.6) {
        [-1.12, 1.12].forEach(x => parts.push(postGeo(x, z, dy + (z < 0 ? 0.55 : -0.02), -4, 0.1)));
      }
    } else if (locId === 'river') {
      plankRow(parts, -1.6, 1.6, 6, cfg.deckEndZ, dy, true, 5);
      [-1.4, 0, 1.4].forEach(x => { const s = new THREE.BoxGeometry(0.14, 0.2, 7.8); s.translate(x, dy - 0.13, 2.2); parts.push(U3.paint(s, '#5e4630')); });
      for (let z = cfg.deckEndZ + 0.15; z < 6; z += 2.2) [-1.5, 1.5].forEach(x => parts.push(postGeo(x, z, dy - 0.02, -5, 0.12)));
      // 护栏
      [-1.55, 1.55].forEach(x => {
        for (let z = cfg.deckEndZ + 0.2; z < 6; z += 1.9) { const g = new THREE.BoxGeometry(0.08, 0.95, 0.08); g.translate(x, dy + 0.47, z); parts.push(U3.paint(g, '#7a5a3c')); }
        const rail = new THREE.BoxGeometry(0.09, 0.07, 7.6); rail.translate(x, dy + 0.95, 2.2); parts.push(U3.paint(rail, '#8a6a48'));
      });
    } else {
      plankRow(parts, -1.5, 1.5, 44, cfg.deckEndZ, dy, true, 9);
      [-1.3, 0, 1.3].forEach(x => { const s = new THREE.BoxGeometry(0.16, 0.24, 46); s.translate(x, dy - 0.15, 21); parts.push(U3.paint(s, '#5e4a36')); });
      for (let z = cfg.deckEndZ + 0.2; z < 44; z += 3.2) [-1.55, 1.55].forEach(x => parts.push(postGeo(x, z, dy - 0.02, -8, 0.16)));
      [-1.5, 1.5].forEach(x => {
        for (let z = cfg.deckEndZ + 0.4; z < 44; z += 2.4) { const g = new THREE.BoxGeometry(0.09, 1.05, 0.09); g.translate(x, dy + 0.52, z); parts.push(U3.paint(g, '#8a7050')); }
        const rail = new THREE.BoxGeometry(0.1, 0.08, 45.5); rail.translate(x, dy + 1.06, 21); parts.push(U3.paint(rail, '#9a7a58'));
        const rail2 = new THREE.BoxGeometry(0.06, 0.06, 45.5); rail2.translate(x, dy + 0.6, 21); parts.push(U3.paint(rail2, '#9a7a58'));
      });
      // 系缆桩
      [[-1.2, cfg.deckEndZ + 0.4], [1.2, cfg.deckEndZ + 0.4]].forEach(([x, z]) => {
        const b = new THREE.CylinderGeometry(0.12, 0.15, 0.4, 10); b.translate(x, dy + 0.2, z); parts.push(U3.paint(b, '#2a2a2e'));
      });
    }
    const dock = new THREE.Mesh(U3.merge(parts), woodMat());
    dock.castShadow = true; dock.receiveShadow = true;
    group.add(dock);

    buildProps();
  }

  function buildProps() {
    const dy = cfg.deckY;
    const metal = new THREE.MeshStandardMaterial({ color: '#8a949c', roughness: 0.45, metalness: 0.7 });
    // 水桶
    const bucket = new THREE.Group();
    const bb = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#4a78a8', roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
    bb.position.y = 0.15;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), metal); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.01;
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshStandardMaterial({ color: '#1d3a4a', roughness: 0.1, metalness: 0.2 }));
    inner.rotation.x = -Math.PI / 2; inner.position.y = 0.2;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 20, Math.PI), metal); handle.position.y = 0.3; handle.rotation.y = 0.4;
    bucket.add(bb, bottom, inner, handle);
    bucket.position.set(0.72, dy + 0.03, 0.55);
    // 钓箱
    const box = new THREE.Group();
    const boxM = new THREE.MeshStandardMaterial({ color: '#2f6b3a', roughness: 0.55 });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.28), boxM); b1.position.y = 0.1;
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.06, 0.29), new THREE.MeshStandardMaterial({ color: '#27583a', roughness: 0.5 })); b2.position.y = 0.23;
    const hdl = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.6 })); hdl.position.y = 0.26;
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.01), metal); latch.position.set(0, 0.2, 0.146);
    box.add(b1, b2, hdl, latch);
    box.position.set(-0.7, dy + 0.03, 0.8); box.rotation.y = 0.25;
    // 缆绳
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 24), new THREE.MeshStandardMaterial({ color: '#b89a68', roughness: 1 }));
    rope.rotation.x = -Math.PI / 2; rope.position.set(-0.85, dy + 0.06, -0.6);
    [bucket, box, rope].forEach(o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); group.add(o); });

    // 灯（夜晚点亮）
    const lampX = locId === 'sea' ? -1.5 : -1.12, lampZ = 1.1;
    const lampTop = dy + (locId === 'pond' ? 1.25 : 1.6);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, lampTop - dy + 0.2, 8), new THREE.MeshStandardMaterial({ color: '#3a3026', roughness: 0.8 }));
    pole.position.set(lampX, (lampTop + dy) / 2 - 0.1, lampZ);
    const glassM = new THREE.MeshStandardMaterial({ color: '#ffe6a8', emissive: '#ffb84a', emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.9 });
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.24, 6), glassM);
    cage.position.set(lampX, lampTop + 0.12, lampZ);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 6), new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.5, metalness: 0.5 }));
    cap.position.set(lampX, lampTop + 0.3, lampZ);
    group.add(pole, cage, cap);
    lanternMats = [glassM];
    lanternLight = new THREE.PointLight('#ffb35a', 0, 22, 1.6);
    lanternLight.position.set(lampX, lampTop + 0.12, lampZ);
    group.add(lanternLight);
    if (locId === 'sea') {
      for (let z = 12; z < 44; z += 12) {
        const p2 = pole.clone(); p2.position.z = z; group.add(p2);
        const c2 = cage.clone(); c2.position.z = z; group.add(c2);
      }
    }

    // 小木船（池塘）
    if (locId === 'pond') {
      boat = new THREE.Group();
      const hullG = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      hullG.scale(0.72, 0.42, 1.9);
      const hull = new THREE.Mesh(hullG, new THREE.MeshStandardMaterial({ map: getWoodTex(), color: '#b08058', roughness: 0.8, side: THREE.DoubleSide }));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 32), new THREE.MeshStandardMaterial({ color: '#5a3e28', roughness: 0.8 }));
      rim.rotation.x = Math.PI / 2; rim.scale.set(0.72, 1.9, 1);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.3), new THREE.MeshStandardMaterial({ map: getWoodTex(), color: '#c09068' }));
      seat.position.y = -0.1;
      const seat2 = seat.clone(); seat2.position.z = 0.9; seat2.scale.x = 0.8;
      const oar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 2.2), new THREE.MeshStandardMaterial({ color: '#9a7050' }));
      oar.position.set(0.45, 0.02, -0.2); oar.rotation.y = 0.15;
      boat.add(hull, rim, seat, seat2, oar);
      boat.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      boat.position.set(-2.7, 0.05, 3.2);
      boat.rotation.y = 0.12;
      group.add(boat);
      const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 4), new THREE.MeshStandardMaterial({ color: '#b89a68' }));
      tie.position.set(-1.85, dy - 0.3, 4.2); tie.rotation.z = 1.1;
      group.add(tie);
    }

    // 灯塔（海边）
    if (locId === 'sea') {
      const lx = -128, lz = -82, ly = hfn(lx, lz);
      const lh = new THREE.Group();
      const towerG = new THREE.CylinderGeometry(2.2, 3.4, 22, 20, 8);
      const p = towerG.attributes.position, cols = [];
      for (let i = 0; i < p.count; i++) {
        const band = Math.floor((p.getY(i) + 11) / 4.4) % 2;
        const c = new THREE.Color(band ? '#c83a32' : '#f2eee6');
        cols.push(c.r, c.g, c.b);
      }
      towerG.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const tower = new THREE.Mesh(towerG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
      tower.position.y = 11;
      const room = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 2.4, 12), new THREE.MeshStandardMaterial({ color: '#fff3c0', emissive: '#ffd070', emissiveIntensity: 0, transparent: true, opacity: 0.85 }));
      room.position.y = 23.2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 2.2, 12), new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.4, metalness: 0.4 }));
      roof.position.y = 25.5;
      const house = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 5), new THREE.MeshStandardMaterial({ color: '#efe8dc', roughness: 0.8 }));
      house.position.set(5, 1.75, 2);
      const hroof = new THREE.Mesh(new THREE.ConeGeometry(4.5, 2.4, 4), new THREE.MeshStandardMaterial({ color: '#8a3a2a', roughness: 0.7 }));
      hroof.position.set(5, 4.7, 2); hroof.rotation.y = Math.PI / 4; hroof.scale.set(1, 1, 0.8);
      lh.add(tower, room, roof, house);
      lh.position.set(lx, ly - 0.5, lz);
      lh.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
      group.add(lh);
      lanternMats.push(room.material);
      // 光束
      const bg = new THREE.ConeGeometry(9, 140, 24, 1, true);
      bg.translate(0, -70, 0); bg.rotateZ(Math.PI / 2);
      beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: '#fff0c0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.position.set(lx, ly + 22.7, lz);
      group.add(beam);
    }
  }

  // ---------- 萤火虫 ----------
  function buildFireflies() {
    if (locId === 'sea') return;
    const N = 90;
    const pos = new Float32Array(N * 3);
    const base = [];
    const r = U3.rng(33);
    for (let i = 0; i < N; i++) {
      let x, z, tries = 0;
      do { x = (r() - 0.5) * 70; z = -r() * 40 + 8; tries++; } while (tries < 20 && Math.abs(hfn(x, z)) > 1.6);
      base.push([x, 0.6 + r() * 1.8, z, r() * 10]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = U3.canvasTex(32, 32, (c) => {
      const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.25, 'rgba(210,255,120,0.8)'); gr.addColorStop(1, 'rgba(160,255,80,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 32, 32);
    });
    fireflies = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    fireflies.userData.base = base;
    fireflies.frustumCulled = false;
    group.add(fireflies);
  }

  // ---------- 对外 ----------
  function build(scene, id) {
    if (group) {
      scene.remove(group);
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    }
    locId = id; cfg = LOC[id]; hfn = HEIGHT[id];
    group = new THREE.Group();
    lanternLight = null; lilies = null; boat = null; fireflies = null; beam = null; lanternMats = [];
    buildTerrain();
    buildMountains();
    buildVegetation();
    buildLilies();
    buildDock();
    buildFireflies();
    scene.add(group);
    return cfg;
  }

  function update(t, env, waveH) {
    U.uTime.value = t;
    U.uCaust.value = Math.max(0, env.sunInt) * (1 - env.cover * 0.6) + env.night * 0.08;
    U.uWind.value = env.rain ? 2.2 : env.cover > 0.6 ? 1.4 : 1;
    const night = U3.smooth(0.3, 0.8, env.night);
    if (lanternLight) lanternLight.intensity = night * 2.4 * (0.92 + Math.sin(t * 13) * 0.04 + Math.sin(t * 7.3) * 0.04);
    lanternMats.forEach(m => { m.emissiveIntensity = 0.1 + night * 2.2; });
    if (beam) {
      beam.material.opacity = night * 0.16;
      beam.rotation.y = t * 0.5;
    }
    // 睡莲随波起伏
    if (lilies) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
      const fl = lilies.userData.flowers;
      let fi = 0;
      lilyData.forEach((l, i) => {
        const y = waveH(l.x, l.z, t);
        const tx = (waveH(l.x + 0.5, l.z, t) - y) * 1.2, tz = (waveH(l.x, l.z + 0.5, t) - y) * 1.2;
        e.set(tz, l.ry, -tx);
        q.setFromEuler(e); s.setScalar(l.s); p.set(l.x, y + 0.015, l.z);
        m.compose(p, q, s);
        lilies.setMatrixAt(i, m);
        if (l.flower && fl) { p.y += 0.01; m.compose(p, q, s.setScalar(l.s * 1.1)); fl.setMatrixAt(fi++, m); }
      });
      lilies.instanceMatrix.needsUpdate = true;
      if (fl) fl.instanceMatrix.needsUpdate = true;
    }
    if (boat) {
      const y = waveH(boat.position.x, boat.position.z, t);
      boat.position.y = y + 0.12;
      boat.rotation.z = Math.sin(t * 1.1) * 0.03;
      boat.rotation.x = Math.sin(t * 0.8 + 1) * 0.02;
    }
    if (fireflies) {
      const on = U3.smooth(0.4, 0.9, env.night) * (env.rain ? 0.2 : 1);
      fireflies.material.opacity = on;
      fireflies.visible = on > 0.01;
      if (fireflies.visible) {
        const pa = fireflies.geometry.attributes.position;
        fireflies.userData.base.forEach(([x, y, z, ph], i) => {
          pa.setXYZ(i, x + Math.sin(t * 0.3 + ph) * 1.5, y + Math.sin(t * 0.7 + ph * 2) * 0.35, z + Math.cos(t * 0.25 + ph) * 1.5);
        });
        pa.needsUpdate = true;
        fireflies.material.size = 0.25 + 0.12 * Math.sin(t * 2);
      }
    }
  }

  return { build, update, heightAt, U, LOC, get cfg() { return cfg; }, get locId() { return locId; } };
})();
