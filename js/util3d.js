// ===================== 3D 通用工具：噪声 / 随机 / 几何合并 / GLSL 片段 =====================
'use strict';

// 颜色统一在线性空间计算（十六进制/CSS 颜色自动从 sRGB 转换）
THREE.ColorManagement.legacyMode = false;

const U3 = (() => {
  // ---------- 可复现随机 ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 值噪声 ----------
  function hash2(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
    const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function fbm(x, y, oct = 4, s = 0) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += vnoise(x * f, y * f, s + i * 17) * amp;
      norm += amp; amp *= 0.5; f *= 2.03;
    }
    return sum / norm;
  }
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- 几何合并（均为 indexed，属性 position/normal/uv[/color]） ----------
  function merge(geos) {
    const list = geos.map(g => (g.index ? g : indexify(g)));
    const hasColor = list.every(g => g.attributes.color);
    let vCount = 0, iCount = 0;
    list.forEach(g => { vCount += g.attributes.position.count; iCount += g.index.count; });
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
    const col = hasColor ? new Float32Array(vCount * 3) : null;
    const idx = new Uint32Array(iCount);
    let vo = 0, io = 0;
    list.forEach(g => {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, n * 3), vo * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array.subarray(0, n * 3), vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), vo * 2);
      if (col) col.set(g.attributes.color.array.subarray(0, n * 3), vo * 3);
      const gi = g.index.array;
      for (let i = 0; i < g.index.count; i++) idx[io + i] = gi[i] + vo;
      vo += n; io += g.index.count;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }
  function indexify(g) {
    const n = g.attributes.position.count;
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    g.setIndex(idx);
    return g;
  }
  // 给几何体刷一个统一的顶点色
  function paint(g, color) {
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }
  // 按噪声扰动顶点（让石头/树冠更自然）
  function jitter(g, amt, freq, seed) {
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = vnoise(v.x * freq + seed, v.y * freq + v.z * freq * 0.7, seed | 0) +
                vnoise(v.z * freq * 1.9, v.x * freq * 1.9 - v.y, (seed | 0) + 5) * 0.5;
      v.multiplyScalar(1 + n * amt);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  function canvasTex(w, h, draw, opts = {}) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    if (opts.srgb !== false) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  // ---------- GLSL 片段 ----------
  const GLSL = {
    noise: `
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
      float fbm4(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=vn(p)*a; p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      float fbm5(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=vn(p)*a; p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
    `,
    // 经典水下焦散（迭代扭曲），返回 0~1
    caustic: `
      float caustic(vec2 p, float t){
        vec2 q = mod(p, 6.28318) - 250.0;
        vec2 i = q; float c = 1.0; float inten = 0.005;
        for (int n = 0; n < 4; n++) {
          float tt = t * (1.0 - (3.5 / float(n+1)));
          i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
          c += 1.0/length(vec2(q.x / (sin(i.x+tt)/inten), q.y / (cos(i.y+tt)/inten)));
        }
        c /= 4.0;
        c = 1.17 - pow(c, 1.4);
        return clamp(pow(abs(c), 8.0), 0.0, 1.0);
      }
    `,
  };

  return { rng, hash2, vnoise, fbm, smooth, clamp, lerp, merge, paint, jitter, canvasTex, GLSL };
})();
