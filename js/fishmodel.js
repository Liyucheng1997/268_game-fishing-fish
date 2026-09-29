// ===================== 程序化 3D 鱼模型 =====================
// 鱼体局部坐标：头朝 +Z，体长归一化为 1（吻端 z≈+0.5，尾鳍末端 z≈-0.5），背朝 +Y
// 身体由截面放样生成，贴图（体色渐变/鳞片/侧线/花纹）程序化绘制，鳍为带鳍条纹理的半透明网格，
// 游动由顶点着色器中的行波（鱼体摆动）实现。
'use strict';

const FishModel = (() => {
  // 体型预设
  // H/W 最大体高/体宽（相对体长），ped 尾柄粗细比例，m 最粗处位置，a 吻部钝度，b 尾部收缩
  const SHAPES = {
    round:  { H: 0.34, W: 0.15, ped: 0.17, m: 0.38, a: 0.72, b: 1.25, body: 0.76, topF: 1.0, botF: 0.94, nTop: 2.0, nBot: 2.5,
              eyeU: 0.105, eyeTh: 0.29, eyeR: 0.033, tail: 'fork', tailLen: 0.25, tailSpan: 0.2,
              dorsal: [0.27, 0.62, 0.11], anal: [0.66, 0.82, 0.08], pec: 0.12, scaleN: 20,
              swim: { k: 6.2, amp: 0.085, head: 0.1 } },
    slim:   { H: 0.23, W: 0.13, ped: 0.2, m: 0.36, a: 0.78, b: 1.2, body: 0.79, topF: 1.0, botF: 0.95, nTop: 2.1, nBot: 2.4,
              eyeU: 0.085, eyeTh: 0.27, eyeR: 0.025, tail: 'fork', tailLen: 0.22, tailSpan: 0.16,
              dorsal: [0.32, 0.55, 0.095], anal: [0.66, 0.8, 0.065], pec: 0.11, scaleN: 26,
              swim: { k: 6.6, amp: 0.08, head: 0.08 } },
    long:   { H: 0.125, W: 0.11, ped: 0.45, m: 0.16, a: 0.55, b: 1.05, body: 0.9, topF: 1.0, botF: 0.9, nTop: 2.3, nBot: 2.6,
              eyeU: 0.05, eyeTh: 0.2, eyeR: 0.014, tail: 'round', tailLen: 0.11, tailSpan: 0.075,
              dorsal: [0.42, 0.72, 0.04], anal: [0.6, 0.95, 0.035], pec: 0.06, scaleN: 0,
              swim: { k: 12, amp: 0.065, head: 0.35 } },
    flat:   { H: 0.085, W: 0.5, ped: 0.22, m: 0.42, a: 0.6, b: 1.15, body: 0.84, topF: 1.0, botF: 0.8, nTop: 2.4, nBot: 2.4,
              eyeU: 0.12, eyeTh: 0.1, eyeR: 0.028, tail: 'round', tailLen: 0.16, tailSpan: 0.13,
              dorsal: null, anal: null, pec: 0.06, scaleN: 30,
              swim: { k: 5.5, amp: 0.05, head: 0.15 } },
    puffer: { H: 0.46, W: 0.44, ped: 0.14, m: 0.46, a: 0.5, b: 1.0, body: 0.82, topF: 1.0, botF: 1.02, nTop: 2.1, nBot: 2.1,
              eyeU: 0.16, eyeTh: 0.29, eyeR: 0.05, tail: 'round', tailLen: 0.17, tailSpan: 0.13,
              dorsal: [0.64, 0.76, 0.08], anal: [0.66, 0.78, 0.07], pec: 0.08, scaleN: 0,
              swim: { k: 3, amp: 0.035, head: 0.05 } },
  };

  const cache = {}; // spId -> {geos, tex}
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

  function shapeOf(v) {
    const S = Object.assign({}, SHAPES[v.shape] || SHAPES.round);
    if (v.nose === 'point') { S.a = 0.95; S.m = 0.4; S.eyeU = 0.1; S.H = 0.19; S.W = 0.16; S.scaleN = 0; }
    if (v.pattern === 'scutes') S.scaleN = 0;
    if (v.legs) { S.H = 0.11; S.W = 0.16; S.a = 0.4; S.nTop = 2.8; S.nBot = 3.2; S.eyeTh = 0.12; }
    return S;
  }

  // ---------- 身形 ----------
  function thick(u, S) {
    let t;
    if (u < S.m) t = Math.pow(Math.sin(Math.PI / 2 * u / S.m), S.a);
    else t = Math.pow(Math.max(0, Math.cos(Math.PI / 2 * (u - S.m) / (1 - S.m))), S.b);
    const p = S.ped * Math.pow(u, 4);
    return Math.sqrt(t * t + p * p);
  }
  function surf(S, u, th, out) {
    const t = thick(u, S);
    const h = S.H * t * 0.5, w = S.W * Math.pow(t, 0.85) * 0.5;
    const cy = Math.cos(th), sx = Math.sin(th);
    const top = cy >= 0;
    const n = top ? S.nTop : S.nBot;
    const ey = Math.sign(cy) * Math.pow(Math.abs(cy), 2 / n) * (top ? S.topF : S.botF);
    const ex = Math.sign(sx) * Math.pow(Math.abs(sx), 2 / n);
    const yc = S.H * (0.05 * Math.sin(Math.PI * u) - 0.05 * Math.pow(1 - u, 5));
    return out.set(ex * w, yc + ey * h, 0.5 - u * S.body);
  }
  function surfNormal(S, u, th, out) {
    const p = surf(S, u, th, new THREE.Vector3());
    const a = surf(S, Math.min(1, u + 0.01), th, new THREE.Vector3()).sub(p);
    const b = surf(S, u, th + 0.02, new THREE.Vector3()).sub(p);
    return out.crossVectors(a, b).normalize().negate();
  }

  function bodyGeo(S) {
    const NU = 60, NV = 40;
    const pos = [], uv = [], idx = [];
    const p = new THREE.Vector3();
    for (let i = 0; i <= NU; i++) {
      const s = i / NU;
      const u = 0.5 - 0.5 * Math.cos(Math.PI * s);
      for (let j = 0; j <= NV; j++) {
        const th = j / NV * Math.PI * 2;
        surf(S, u, th, p);
        pos.push(p.x, p.y, p.z);
        uv.push(u, 1 - j / NV);
      }
    }
    const row = NV + 1;
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    // 尾端封口
    const tailC = pos.length / 3;
    surf(S, 1, 0, p);
    const zT = p.z;
    pos.push(0, S.H * 0.0, zT - 0.004);
    uv.push(1, 0.5);
    for (let j = 0; j < NV; j++) {
      const a = NU * row + j;
      idx.push(a, tailC, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 修正接缝与吻端法线
    const n = g.attributes.normal;
    for (let i = 0; i <= NU; i++) {
      const a = i * row, b = i * row + NV;
      tmpV.fromBufferAttribute(n, a).add(tmpV2.fromBufferAttribute(n, b)).normalize();
      n.setXYZ(a, tmpV.x, tmpV.y, tmpV.z); n.setXYZ(b, tmpV.x, tmpV.y, tmpV.z);
    }
    for (let j = 0; j <= NV; j++) n.setXYZ(j, 0, 0, 1);
    return g;
  }

  // 鳍：沿基线 base[] 到外缘 tip[] 的网格，uv=(沿基线, 向外)
  function finGeo(base, tip, rows = 6, bulge = 0) {
    const n = base.length;
    const pos = [], uv = [], idx = [];
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      for (let r = 0; r <= rows; r++) {
        const t = r / rows;
        p.copy(base[i]).lerp(tip[i], t);
        if (bulge) p.x += Math.sin(t * Math.PI) * bulge * Math.sin(i / (n - 1) * Math.PI);
        pos.push(p.x, p.y, p.z);
        uv.push(i / (n - 1), t);
      }
    }
    const rr = rows + 1;
    for (let i = 0; i < n - 1; i++) {
      for (let r = 0; r < rows; r++) {
        const a = i * rr + r, b = a + 1, c = a + rr, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function mirrorX(g) {
    const m = g.clone();
    m.scale(-1, 1, 1);
    // 翻转绕序
    const id = m.index.array;
    for (let i = 0; i < id.length; i += 3) { const t = id[i + 1]; id[i + 1] = id[i + 2]; id[i + 2] = t; }
    m.computeVertexNormals();
    return m;
  }

  function dorsalFin(S, v) {
    let [a, b, hgt] = S.dorsal;
    let type = v.dorsal || 'normal';
    if (type === 'sail') { a = 0.1; b = 0.72; hgt = 0.3; }
    if (type === 'shark') { a = 0.3; b = 0.46; hgt = 0.2; }
    if (type === 'small') { hgt *= 0.8; const c = (a + b) / 2; a = c - 0.07; b = c + 0.07; }
    if (type === 'fold') { a = 0.4; b = 0.995; hgt = S.H * 0.35; }
    if (type === 'spiny') { a -= 0.04; b += 0.03; hgt *= 1.05; }
    const n = type === 'spiny' ? 21 : 12;
    const base = [], tip = [];
    const endP = surf(S, b, 0, new THREE.Vector3());
    const apex = surf(S, a + 0.07, 0, new THREE.Vector3()).add(new THREE.Vector3(0, hgt, -hgt * 0.75));
    for (let k = 0; k < n; k++) {
      const s = k / (n - 1);
      const u = a + (b - a) * s;
      const bp = surf(S, u, 0, new THREE.Vector3());
      bp.y -= 0.006;
      base.push(bp);
      let hp, sweep = 0.5;
      if (type === 'shark') { tip.push(apex.clone().lerp(endP, Math.pow(s, 1.4))); continue; }
      if (type === 'sail') hp = hgt * U3.smooth(0, 0.12, s) * (1 - 0.55 * s) * (1 - Math.pow(s, 6));
      else if (type === 'fold') hp = hgt * U3.smooth(0, 0.15, s) * (1 - 0.2 * s);
      else {
        hp = hgt * Math.pow(1 - s, 0.55) * (0.3 + 0.7 * U3.smooth(0, 0.1, s));
        if (type === 'spiny' && s < 0.55) hp *= 0.78 + 0.22 * (k % 2 === 0 ? 1 : 0.55);
        if (type === 'spiny' && s >= 0.55) hp *= 1.1;
      }
      tip.push(bp.clone().add(new THREE.Vector3(0, hp, -hp * sweep)));
    }
    return finGeo(base, tip, 6);
  }

  function analFin(S, v) {
    let [a, b, hgt] = S.anal;
    if (v.dorsal === 'fold') { a = 0.55; b = 0.995; hgt = S.H * 0.3; }
    if (v.dorsal === 'shark') { a = 0.72; b = 0.8; hgt = 0.05; }
    const n = 10, base = [], tip = [];
    for (let k = 0; k < n; k++) {
      const s = k / (n - 1);
      const bp = surf(S, a + (b - a) * s, Math.PI, new THREE.Vector3());
      bp.y += 0.005;
      base.push(bp);
      const hp = v.dorsal === 'fold' ? hgt * U3.smooth(0, 0.2, s) : hgt * Math.pow(1 - s, 0.6) * (0.35 + 0.65 * U3.smooth(0, 0.12, s));
      tip.push(bp.clone().add(new THREE.Vector3(0, -hp, -hp * 0.5)));
    }
    return finGeo(base, tip, 5);
  }

  function tailFin(S, v) {
    const type = v.tail || S.tail;
    const top = surf(S, 1, 0, new THREE.Vector3()), bot = surf(S, 1, Math.PI, new THREE.Vector3());
    const zT = top.z + 0.025;
    let len = S.tailLen, span = S.tailSpan;
    const n = 15, base = [], tip = [];
    if (type === 'fancy') { len *= 1.7; span *= 1.5; }
    if (type === 'lunate') { span *= 1.45; len *= 1.05; }
    if (type === 'hetero') { span *= 1.15; len *= 1.15; }
    for (let k = 0; k < n; k++) {
      const s = k / (n - 1);
      const by = U3.lerp(top.y * 0.9, bot.y * 0.9, s);
      const bz = zT;
      let ty, zl;
      const e = Math.abs(2 * s - 1);
      switch (type) {
        case 'round':  ty = U3.lerp(span, -span, s); zl = len * (0.7 + 0.3 * Math.sin(Math.PI * s)); break;
        case 'fancy':  ty = U3.lerp(span, -span, s) * (1 + 0.15 * Math.sin(s * Math.PI)); zl = len * (0.62 + 0.38 * Math.sin(Math.PI * s)) * (1 + 0.1 * Math.sin(s * Math.PI * 4)); break;
        case 'lunate': ty = U3.lerp(span, -span, s); zl = len * (0.22 + 0.78 * Math.pow(e, 0.75)); break;
        case 'hetero':
          if (s < 0.55) { const q = s / 0.55; ty = U3.lerp(span * 1.3, span * 0.05, q); zl = len * (0.32 + 0.85 * Math.pow(1 - q, 0.75)); }
          else { const q = (s - 0.55) / 0.45; ty = U3.lerp(span * 0.05, -span * 0.65, q); zl = len * (0.32 + 0.3 * Math.sin(Math.PI * Math.pow(q, 0.8))); }
          break;
        default:       ty = U3.lerp(span, -span, s); zl = len * (1 - 0.46 * Math.pow(1 - e, 1.3));
      }
      base.push(new THREE.Vector3(0, by, bz));
      tip.push(new THREE.Vector3(0, ty + (type === 'hetero' ? 0.02 : 0), zT - zl));
    }
    const g = finGeo(base, tip, 8);
    if (type === 'fancy') {
      const g1 = g.clone(); g1.rotateZ(0.32);
      const g2 = g.clone(); g2.rotateZ(-0.32);
      return [g1, g2];
    }
    return [g];
  }

  function sideFin(S, u0, u1, th, dir, len, n = 6) {
    const base = [], tip = [];
    const d = dir.clone().normalize();
    // 扇面：在 d 与体轴(-Z)张成的平面内展开
    const perp = new THREE.Vector3(0, 0, -1).addScaledVector(d, d.z).normalize();
    for (let k = 0; k < n; k++) {
      const s = k / (n - 1);
      const bp = surf(S, U3.lerp(u0, u1, s), th, new THREE.Vector3());
      base.push(bp);
      const phi = U3.lerp(-0.45, 0.6, s);
      const l = len * (0.62 + 0.38 * Math.sin(Math.PI * (0.15 + s * 0.7)));
      const td = d.clone().multiplyScalar(Math.cos(phi)).addScaledVector(perp, Math.sin(phi));
      tip.push(bp.clone().addScaledVector(td, l));
    }
    const g = finGeo(base, tip, 5, 0.006);
    return [g, mirrorX(g)];
  }

  // 平鱼（比目鱼）一圈裙边鳍
  function fringeFins(S) {
    const out = [];
    [Math.PI / 2].forEach(th => {
      const base = [], tip = [];
      const n = 16;
      for (let k = 0; k < n; k++) {
        const s = k / (n - 1);
        const u = 0.12 + s * 0.84;
        const bp = surf(S, u, th, new THREE.Vector3());
        bp.x -= 0.004;
        base.push(bp);
        const w = 0.055 * Math.sin(Math.PI * Math.pow(s, 0.8)) + 0.006;
        tip.push(bp.clone().add(new THREE.Vector3(w, -0.004, -w * 0.3)));
      }
      const g = finGeo(base, tip, 4);
      out.push(g, mirrorX(g));
    });
    return out;
  }

  function eyeGeo(S, v) {
    const eyes = [];
    const R = S.eyeR;
    const positions = v.shape === 'flat'
      ? [[S.eyeU, 0.12], [S.eyeU + 0.06, -0.14]]
      : [[S.eyeU, S.eyeTh * Math.PI], [S.eyeU, Math.PI * 2 - S.eyeTh * Math.PI]];
    positions.forEach(([u, th]) => {
      const g = new THREE.SphereGeometry(R, 20, 14);
      g.rotateX(Math.PI / 2); // 北极(瞳孔)朝 +Z
      g.scale(1, 1, 0.62);
      const nrm = surfNormal(S, u, th < 0 ? th + Math.PI * 2 : th, new THREE.Vector3());
      nrm.z += 0.25; nrm.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
      g.applyQuaternion(q);
      const p = surf(S, u, th < 0 ? th + Math.PI * 2 : th, new THREE.Vector3()).addScaledVector(nrm, -R * 0.3);
      g.translate(p.x, p.y, p.z);
      eyes.push(g);
    });
    return U3.merge(eyes);
  }

  function tube(points, r) {
    const curve = new THREE.CatmullRomCurve3(points);
    const g = new THREE.TubeGeometry(curve, 14, r, 5, false);
    // uv 设为体侧颜色区域
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.5);
    return g;
  }

  function whiskerGeos(S, v, id) {
    const out = [];
    const mouth = surf(S, 0.015, Math.PI * 0.55, new THREE.Vector3());
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const pair = (len, droop, spread, r, y0 = 0, zBack = 0.6, curl = 0) => {
      [1, -1].forEach(sd => {
        const m = mouth.clone(); m.x *= sd; m.y += y0;
        const pts = [m];
        for (let i = 1; i <= 5; i++) {
          const t = i / 5;
          pts.push(V(m.x + sd * spread * len * t, m.y - droop * len * t * t + Math.sin(t * 5) * curl * len,
                     m.z - zBack * len * t));
        }
        out.push(tube(pts, r));
      });
    };
    if (id === 'catfish') { pair(0.42, 0.5, 0.55, 0.0045, 0.01); pair(0.1, 1.2, 0.2, 0.003, -0.012); pair(0.08, 1.2, 0.1, 0.003, -0.018); }
    else if (id === 'dragoncarp' || id === 'seadragon') pair(0.4, 0.3, 0.45, 0.004, 0.005, 0.7, 0.1);
    else if (id === 'loach') { pair(0.07, 0.6, 0.4, 0.0028); pair(0.05, 0.9, 0.3, 0.0025, -0.006); pair(0.05, 0.9, 0.5, 0.0025, 0.004); }
    else if (id === 'sturgeon') {
      const sn = V(0, surf(S, 0.05, Math.PI, new THREE.Vector3()).y + 0.004, 0.5 + 0.03);
      [-0.018, -0.006, 0.006, 0.018].forEach(x => {
        out.push(tube([V(x, sn.y, sn.z), V(x * 1.2, sn.y - 0.02, sn.z - 0.01), V(x * 1.3, sn.y - 0.04, sn.z - 0.025)], 0.0025));
      });
    }
    else pair(0.06, 0.8, 0.3, 0.003);
    return out;
  }

  function extrasGeo(S, v, id) {
    const out = [];
    if (v.bill === 'sword') {
      const g = new THREE.ConeGeometry(0.02, 0.36, 10);
      g.rotateX(Math.PI / 2); g.scale(1, 0.7, 1);
      const nose = surf(S, 0.0, 0, new THREE.Vector3());
      g.translate(0, nose.y + 0.004, 0.5 + 0.17);
      out.push(g);
    } else if (v.bill === 'snout') {
      const g = new THREE.ConeGeometry(0.045, 0.16, 12);
      g.rotateX(Math.PI / 2); g.scale(1, 0.55, 1);
      g.rotateX(-0.12);
      const nose = surf(S, 0.0, 0, new THREE.Vector3());
      g.translate(0, nose.y + 0.01, 0.5 + 0.06);
      out.push(g);
    }
    if (v.legs) {
      [[0.2, 1], [0.2, -1], [0.6, 1], [0.6, -1]].forEach(([u, sd]) => {
        const g = new THREE.CapsuleGeometry(0.017, 0.06, 4, 8);
        g.rotateZ(Math.PI / 2);          // 沿 X 横向伸出
        g.scale(1, 0.75, 1);
        g.rotateZ(-sd * 0.55);           // 向下撇
        g.rotateY(sd * (u < 0.4 ? 0.35 : -0.35));
        const p = surf(S, u, Math.PI * 0.6, new THREE.Vector3());
        g.translate(sd * (Math.abs(p.x) + 0.028), p.y - 0.018, p.z);
        out.push(g);
      });
    }
    if (v.spines) {
      const r = U3.rng(99);
      for (let i = 0; i < 70; i++) {
        const u = 0.15 + r() * 0.7, th = r() * Math.PI * 2;
        const p = surf(S, u, th, new THREE.Vector3());
        const nrm = surfNormal(S, u, th, new THREE.Vector3());
        const g = new THREE.ConeGeometry(0.007, 0.035, 5);
        g.rotateX(Math.PI / 2);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm.clone().add(new THREE.Vector3(0, 0, -0.6)).normalize()));
        g.translate(p.x, p.y, p.z);
        out.push(g);
      }
    }
    out.forEach(g => {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.3, 0.9);
    });
    return out;
  }

  // ---------- 贴图 ----------
  function col(hex) { return new THREE.Color(hex); }
  function css(c) { return c.getStyle(); }

  function bodyTextures(sp) {
    const v = sp.v, S = shapeOf(v);
    const W = 1024, H = 512;
    const r = U3.rng(sp.id.length * 131 + sp.id.charCodeAt(0));
    const body = col(v.body), belly = col(v.belly || v.body);
    const dark = body.clone().multiplyScalar(0.58);
    const pc = v.patternColor || '#000';

    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const bump = document.createElement('canvas'); bump.width = W; bump.height = H;
    const b = bump.getContext('2d');
    b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
    const glow = v.glow ? document.createElement('canvas') : null;
    let g = null;
    if (glow) { glow.width = W; glow.height = H; g = glow.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }

    // 背深腹浅的体色渐变（y=0/1 背脊，0.5 腹部）
    for (let y = 0; y < H; y++) {
      const d = Math.abs(y / H - 0.5) * 2;
      const cc = belly.clone().lerp(body, U3.smooth(0.1, 0.62, d)).lerp(dark, U3.smooth(0.72, 1.0, d) * 0.9);
      c.fillStyle = css(cc);
      c.fillRect(0, y, W, 1);
    }
    // 头部略深、吻部
    let gr = c.createLinearGradient(0, 0, W * 0.22, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr; c.fillRect(0, 0, W * 0.22, H);

    const sides = [0.25, 0.75]; // 两侧中线
    const Y = (d, side) => side === 0 ? (0.5 - d / 2) * H : (0.5 + d / 2) * H; // d: 0 腹 → 1 背

    // 彩虹带
    if (v.band) {
      sides.forEach((_, si) => {
        const y = Y(0.5, si);
        const gg = c.createLinearGradient(0, y - H * 0.07, 0, y + H * 0.07);
        gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(0.5, v.band); gg.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = 0.75; c.fillStyle = gg; c.fillRect(W * 0.12, y - H * 0.07, W * 0.88, H * 0.14); c.globalAlpha = 1;
      });
    }

    // 花纹
    const pat = v.pattern;
    const blob = (ctx, x, y, rx, ry, color, alpha) => {
      ctx.globalAlpha = alpha; ctx.fillStyle = color;
      ctx.beginPath();
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = i / n * Math.PI * 2;
        const k = 0.75 + r() * 0.5;
        const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    };
    if (pat === 'spots') {
      for (let i = 0; i < 260; i++) {
        const d = 0.35 + Math.pow(r(), 0.7) * 0.65, si = r() < 0.5 ? 0 : 1;
        const x = W * (0.08 + r() * 0.92), y = Y(d, si);
        const rr = 3 + r() * 7;
        blob(c, x, y, rr, rr * 0.9, pc, 0.55 + r() * 0.35);
      }
    } else if (pat === 'stripes') {
      for (let i = 0; i < 11; i++) {
        const x = W * (0.2 + i * 0.075 + (r() - 0.5) * 0.02);
        const gg = c.createLinearGradient(x - 14, 0, x + 14, 0);
        gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(0.5, pc); gg.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = 0.55; c.fillStyle = gg;
        c.fillRect(x - 14, 0, 28, H * 0.3); c.fillRect(x - 14, H * 0.7, 28, H * 0.3);
        c.globalAlpha = 1;
      }
    } else if (pat === 'bars') {
      for (let i = 0; i < 14; i++) {
        const x = W * (0.22 + i * 0.055);
        for (let y = 0; y < H; y += 9) {
          const d = Math.abs(y / H - 0.5) * 2;
          if (d < 0.3 || d > 0.85) continue;
          c.globalAlpha = 0.7; c.fillStyle = pc;
          c.beginPath(); c.arc(x + Math.sin(y) * 2, y, 3, 0, 7); c.fill();
        }
      }
      c.globalAlpha = 1;
    } else if (pat === 'band') {
      sides.forEach((_, si) => {
        for (let x = W * 0.16; x < W * 0.98; x += 7) {
          const y = Y(0.5 + Math.sin(x * 0.03) * 0.05, si);
          blob(c, x, y, 9 + r() * 6, 12 + r() * 10, pc, 0.45);
        }
      });
    } else if (pat === 'koi') {
      for (let i = 0; i < 7; i++) {
        const x = W * (0.12 + r() * 0.8), si = r() < 0.5 ? 0 : 1;
        const y = Y(0.55 + r() * 0.45, si);
        for (let j = 0; j < 6; j++) blob(c, x + (r() - 0.5) * 60, y + (r() - 0.5) * 40, 28 + r() * 40, 22 + r() * 30, pc, 0.9);
      }
      // 头顶红斑（丹顶）
      blob(c, W * 0.05, 0, 40, 30, pc, 0.95); blob(c, W * 0.05, H, 40, 30, pc, 0.95);
      for (let i = 0; i < 5; i++) blob(c, W * (0.3 + r() * 0.6), Y(0.9, r() < 0.5 ? 0 : 1), 10 + r() * 14, 8 + r() * 10, '#1a1a1a', 0.8);
    } else if (pat === 'dots') {
      sides.forEach((_, si) => {
        for (let i = 0; i < 90; i++) {
          const x = W * (0.12 + r() * 0.85), d = sp.id === 'sardine' ? 0.62 + (r() - 0.5) * 0.06 : 0.45 + r() * 0.5;
          if (sp.id === 'sardine' && i > 14) continue;
          c.globalAlpha = 0.85; c.fillStyle = pc;
          c.beginPath(); c.arc(sp.id === 'sardine' ? W * (0.2 + i * 0.05) : x, Y(d, si), sp.id === 'sardine' ? 5 : 2.5 + r() * 2, 0, 7); c.fill();
        }
      });
      c.globalAlpha = 1;
    } else if (pat === 'photophores') {
      sides.forEach((_, si) => {
        [0.18, 0.3, 0.42].forEach(d => {
          for (let x = W * 0.12; x < W * 0.95; x += 26) {
            const y = Y(d, si);
            c.fillStyle = pc; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill();
            if (g) {
              const rg = g.createRadialGradient(x, y, 0, x, y, 10);
              rg.addColorStop(0, pc); rg.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = rg; g.fillRect(x - 10, y - 10, 20, 20);
            }
          }
        });
      });
    } else if (pat === 'scutes') {
      sides.forEach((_, si) => {
        [0.98, 0.56, 0.22].forEach(d => {
          for (let x = W * 0.12; x < W * 0.95; x += 34) {
            const y = Y(d, si);
            c.globalAlpha = 0.85; c.fillStyle = pc;
            c.beginPath(); c.moveTo(x - 12, y); c.lineTo(x, y - 8); c.lineTo(x + 12, y); c.lineTo(x, y + 8); c.closePath(); c.fill();
            b.fillStyle = '#e0e0e0'; b.beginPath(); b.moveTo(x - 12, y); b.lineTo(x, y - 8); b.lineTo(x + 12, y); b.lineTo(x, y + 8); b.closePath(); b.fill();
          }
        });
      });
      c.globalAlpha = 1;
    } else if (pat === 'gills') {
      sides.forEach((_, si) => {
        for (let i = 0; i < 5; i++) {
          const x = W * (0.19 + i * 0.022);
          c.strokeStyle = 'rgba(40,50,56,0.6)'; c.lineWidth = 3;
          c.beginPath(); c.moveTo(x, Y(0.35, si)); c.quadraticCurveTo(x - 6, Y(0.5, si), x, Y(0.65, si)); c.stroke();
          b.strokeStyle = '#303030'; b.lineWidth = 4;
          b.beginPath(); b.moveTo(x, Y(0.35, si)); b.quadraticCurveTo(x - 6, Y(0.5, si), x, Y(0.65, si)); b.stroke();
        }
      });
    }

    // 鳞片
    const scaleN = v.pattern === 'scales' ? 14 : S.scaleN;
    if (scaleN > 0) {
      const sw = W / scaleN * 0.9, shh = sw * 1.05;
      const strong = v.pattern === 'scales';
      for (let yy = -shh; yy < H + shh; yy += shh * 0.55) {
        const rowI = Math.round(yy / (shh * 0.55));
        for (let xx = W * 0.18; xx < W * 1.02; xx += sw * 0.62) {
          const x = xx + (rowI % 2) * sw * 0.31;
          const d = Math.abs(yy / H - 0.5) * 2;
          // 鳞片边缘（开口朝头）
          c.globalAlpha = strong ? 0.55 : 0.09 + d * 0.07;
          c.strokeStyle = strong ? pc : 'rgba(0,0,0,0.9)';
          c.lineWidth = strong ? 2.5 : 1.4;
          c.beginPath(); c.arc(x, yy, shh * 0.52, -Math.PI / 2, Math.PI / 2); c.stroke();
          c.globalAlpha = strong ? 0.35 : 0.07;
          c.strokeStyle = '#ffffff'; c.lineWidth = 1;
          c.beginPath(); c.arc(x - 2, yy, shh * 0.46, -Math.PI / 2.4, Math.PI / 2.4); c.stroke();
          const bg = b.createRadialGradient(x - sw * 0.2, yy, 1, x, yy, shh * 0.55);
          bg.addColorStop(0, '#9a9a9a'); bg.addColorStop(1, '#6a6a6a');
          b.fillStyle = bg;
          b.beginPath(); b.arc(x, yy, shh * 0.52, -Math.PI / 2, Math.PI / 2); b.fill();
          if (strong && g) {
            g.globalAlpha = 0.45; g.strokeStyle = pc; g.lineWidth = 2;
            g.beginPath(); g.arc(x, yy, shh * 0.52, -Math.PI / 2, Math.PI / 2); g.stroke(); g.globalAlpha = 1;
          }
        }
      }
      c.globalAlpha = 1;
    } else {
      // 无鳞鱼：细腻斑驳
      for (let i = 0; i < 1400; i++) {
        const x = r() * W, y = r() * H;
        c.globalAlpha = 0.05 + r() * 0.06;
        c.fillStyle = r() < 0.5 ? '#000' : '#fff';
        c.beginPath(); c.arc(x, y, 2 + r() * 6, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    }

    // 侧线
    if (v.shape !== 'puffer') {
      sides.forEach((_, si) => {
        c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 2;
        c.beginPath();
        for (let x = W * 0.2; x <= W; x += 8) {
          const y = Y(0.56 - (x / W - 0.2) * 0.06, si);
          x === W * 0.2 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.stroke();
        b.strokeStyle = '#5a5a5a'; b.lineWidth = 2; b.stroke();
      });
    }

    // 鳃盖
    if (v.pattern !== 'gills') {
      sides.forEach((_, si) => {
        const x = W * (v.shape === 'long' ? 0.12 : 0.2);
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x - 8, Y(0.92, si)); c.quadraticCurveTo(x + 10, Y(0.5, si), x - 18, Y(0.1, si)); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x - 14, Y(0.9, si)); c.quadraticCurveTo(x + 2, Y(0.5, si), x - 22, Y(0.12, si)); c.stroke();
        b.strokeStyle = '#303030'; b.lineWidth = 4;
        b.beginPath(); b.moveTo(x - 8, Y(0.92, si)); b.quadraticCurveTo(x + 10, Y(0.5, si), x - 18, Y(0.1, si)); b.stroke();
      });
    }
    // 嘴
    c.strokeStyle = 'rgba(20,10,10,0.7)'; c.lineWidth = 3;
    sides.forEach((_, si) => { c.beginPath(); c.moveTo(0, Y(0.42, si)); c.lineTo(W * 0.03, Y(0.4, si)); c.stroke(); });

    const map = new THREE.CanvasTexture(cv);
    map.encoding = THREE.sRGBEncoding; map.anisotropy = 8;
    const bumpT = new THREE.CanvasTexture(bump);
    let glowT = null;
    if (glow) {
      if (v.pattern !== 'photophores' && v.pattern !== 'scales') { g.globalAlpha = 0.5; g.drawImage(cv, 0, 0); g.globalAlpha = 1; }
      glowT = new THREE.CanvasTexture(glow); glowT.encoding = THREE.sRGBEncoding;
    }
    return { map, bump: bumpT, glow: glowT };
  }

  function finTexture(v) {
    return U3.canvasTex(256, 128, (c, W, H) => {
      const fc = col(v.fin || v.body);
      // canvas 顶部 = 鳍外缘 (uv.y=1)
      for (let y = 0; y < H; y++) {
        const t = 1 - y / H; // 0 基部 → 1 外缘
        const a = v.tail === 'fancy' ? 0.85 - t * 0.45 : 0.95 - t * 0.35;
        const cc = fc.clone().lerp(new THREE.Color(1, 1, 1), t * 0.18);
        c.fillStyle = cc.getStyle().replace('rgb(', 'rgba(').replace(')', `,${a})`);
        c.fillRect(0, y, W, 1);
      }
      // 鳍条
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5;
      for (let x = 3; x < W; x += 9) {
        c.beginPath(); c.moveTo(x, H); c.quadraticCurveTo(x + 2, H * 0.5, x + 1, 0); c.stroke();
      }
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1;
      for (let x = 7; x < W; x += 9) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + 1, 0); c.stroke(); }
      // 外缘
      const eg = c.createLinearGradient(0, 0, 0, 12);
      eg.addColorStop(0, 'rgba(255,255,255,0.0)'); eg.addColorStop(1, 'rgba(255,255,255,0)');
      c.clearRect(0, 0, W, 2);
      if (v.pattern === 'koi') { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(224,48,30,0.35)'; c.fillRect(0, H * 0.6, W, H * 0.4); }
    });
  }

  function eyeTexture(v) {
    return U3.canvasTex(128, 64, (c, W, H) => {
      c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, W, H);
      const iris = col(v.iris || '#c9a642');
      for (let y = 0; y < H; y++) {
        const t = y / H;
        if (t < 0.2) continue; // 瞳孔
        const k = t < 0.5 ? 1 - (t - 0.2) * 0.8 : 0.35;
        c.fillStyle = css(iris.clone().multiplyScalar(k));
        c.fillRect(0, y, W, 1);
      }
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, H * 0.19, W, 2);
    });
  }

  function getAssets(sp) {
    if (cache[sp.id]) return cache[sp.id];
    const v = sp.v, S = shapeOf(v);
    const body = bodyGeo(S);
    const fins = [];
    if (S.dorsal) fins.push(dorsalFin(S, v));
    if (S.anal && !v.sharkFin) fins.push(analFin(S, v));
    if (v.sharkFin) fins.push(analFin(S, v));
    fins.push(...tailFin(S, v));
    if (v.shape === 'flat') fins.push(...fringeFins(S));
    if (!v.legs) {
      const pecLen = v.sharkFin ? 0.2 : S.pec;
      const th = v.shape === 'flat' ? Math.PI * 0.5 : Math.PI * 0.64;
      fins.push(...sideFin(S, 0.2, 0.25, th, new THREE.Vector3(0.45, -0.25, -0.9), pecLen));
      if (v.shape !== 'flat' && v.shape !== 'puffer') fins.push(...sideFin(S, 0.44, 0.48, Math.PI * 0.9, new THREE.Vector3(0.3, -0.6, -0.9), pecLen * 0.6, 5));
    }
    const finG = U3.merge(fins);
    const extras = extrasGeo(S, v, sp.id);
    if (v.whiskers) extras.push(...whiskerGeos(S, v, sp.id));
    const extraG = extras.length ? U3.merge(extras) : null;
    const eyes = eyeGeo(S, v);
    const tex = bodyTextures(sp);
    tex.fin = finTexture(v);
    tex.eye = eyeTexture(v);
    cache[sp.id] = { S, body, finG, extraG, eyes, tex };
    return cache[sp.id];
  }

  // ---------- 游动着色器注入 ----------
  function patch(mat, U) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSwim = U.uSwim;
      sh.uniforms.uSwimAx = U.uSwimAx;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uSwim; uniform vec3 uSwimAx;')
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          {
            float fz0 = position.z;
            float env0 = mix(uSwimAx.z, 1.0, smoothstep(0.35, -0.5, fz0));
            float slope = -cos(uSwim.x - fz0 * uSwim.z) * uSwim.y * uSwim.z * env0 + 2.0 * uSwim.w * fz0;
            objectNormal.z -= slope * (objectNormal.x * uSwimAx.x + objectNormal.y * uSwimAx.y);
            objectNormal = normalize(objectNormal);
          }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            float fz = position.z;
            float env = mix(uSwimAx.z, 1.0, smoothstep(0.35, -0.5, fz));
            float d = sin(uSwim.x - fz * uSwim.z) * uSwim.y * env + uSwim.w * fz * fz;
            transformed.x += d * uSwimAx.x;
            transformed.y += d * uSwimAx.y;
          }`);
    };
    mat.customProgramCacheKey = () => 'fishswim1';
  }

  // ---------- 创建实例 ----------
  function create(sp, opts = {}) {
    const A = getAssets(sp);
    const v = sp.v;
    const U = {
      uSwim: { value: new THREE.Vector4(Math.random() * 6, A.S.swim.amp * 0.5, A.S.swim.k, 0) },
      uSwimAx: { value: new THREE.Vector3(v.shape === 'flat' ? 0 : 1, v.shape === 'flat' ? 1 : 0, A.S.swim.head) },
    };
    let bodyM, finM, eyeM;
    if (opts.silhouette) {
      bodyM = new THREE.MeshBasicMaterial({ color: 0x0b1220 });
      finM = new THREE.MeshBasicMaterial({ color: 0x0b1220, side: THREE.DoubleSide });
      eyeM = bodyM;
    } else {
      bodyM = new THREE.MeshPhysicalMaterial({
        map: A.tex.map, bumpMap: A.tex.bump, bumpScale: 0.35,
        roughness: v.silver ? 0.26 : 0.4, metalness: v.silver ? 0.38 : 0.1,
        clearcoat: 0.85, clearcoatRoughness: 0.2,
        envMapIntensity: 1.0,
      });
      if (v.iridescent || v.silver) { bodyM.iridescence = 0.55; bodyM.iridescenceIOR = 1.35; bodyM.iridescenceThicknessRange = [200, 600]; }
      if (v.glow) {
        bodyM.emissive = new THREE.Color(0xffffff);
        bodyM.emissiveMap = A.tex.glow;
        bodyM.emissiveIntensity = 0.6;
      }
      finM = new THREE.MeshStandardMaterial({
        map: A.tex.fin, transparent: true, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.0, depthWrite: false,
      });
      if (v.glow) { finM.emissive = new THREE.Color(v.fin); finM.emissiveIntensity = 0.3; }
      eyeM = new THREE.MeshPhysicalMaterial({ map: A.tex.eye, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02 });
      [bodyM, finM, eyeM].forEach(m => patch(m, U));
    }
    const group = new THREE.Group();
    const bodyMesh = new THREE.Mesh(A.body, bodyM);
    const finMesh = new THREE.Mesh(A.finG, finM);
    const eyeMesh = new THREE.Mesh(A.eyes, eyeM);
    finMesh.renderOrder = 2;
    group.add(bodyMesh, finMesh, eyeMesh);
    if (A.extraG) group.add(new THREE.Mesh(A.extraG, bodyM));
    group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const mats = [bodyM, finM, eyeM];

    const inst = {
      sp, group, U, S: A.S, mats,
      phase: U.uSwim.value.x, bend: 0,
      // effort 0~2（游动力度），turn -1~1（转弯）
      tick(dt, effort = 0.5, turn = 0) {
        const sw = A.S.swim;
        this.phase += dt * (2.5 + effort * 9);
        const amp = sw.amp * (0.3 + effort * 0.75);
        this.bend += (turn * 0.35 - this.bend) * Math.min(1, dt * 4);
        U.uSwim.value.set(this.phase, amp, sw.k, this.bend);
      },
      setGlow(k) { if (v.glow && !opts.silhouette) bodyM.emissiveIntensity = k; },
      dispose() { mats.forEach(m => m.dispose && m.dispose()); },
    };
    return inst;
  }

  // ---------- 静态截图（图鉴 / 弹窗用） ----------
  let snapR = null, snapScene = null, snapCam = null;
  const snapCache = {};
  function initSnap() {
    snapR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    snapR.outputEncoding = THREE.sRGBEncoding;
    snapR.toneMapping = THREE.ACESFilmicToneMapping;
    snapR.toneMappingExposure = 1.1;
    snapScene = new THREE.Scene();
    snapScene.add(new THREE.HemisphereLight(0xeaf4ff, 0x404040, 0.9));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(-2, 4, 3); snapScene.add(d);
    const d2 = new THREE.DirectionalLight(0x9ac8ff, 0.6); d2.position.set(-3, -1, -3); snapScene.add(d2);
    snapScene.environment = studioEnv(snapR);
    snapCam = new THREE.PerspectiveCamera(22, 2, 0.1, 20);
  }
  function studioEnv(renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    const sc = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const cols = [];
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 10;
      const c = new THREE.Color(0x2a3440).lerp(new THREE.Color(0xf4f8ff), U3.smooth(-0.3, 0.8, y));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    panel.position.set(-3, 6, 4); panel.lookAt(0, 0, 0); sc.add(panel);
    const tex = pm.fromScene(sc, 0.03).texture;
    pm.dispose();
    return tex;
  }

  function snapshot(sp, w = 240, h = 120, silhouette = false) {
    const key = sp.id + (silhouette ? '_s' : '') + w + 'x' + h;
    if (snapCache[key]) return snapCache[key];
    if (!snapR) initSnap();
    snapR.setPixelRatio(1);
    snapR.setSize(w * 2, h * 2, false);
    const inst = create(sp, { silhouette });
    inst.tick(0, 0.3, 0);
    inst.U.uSwim.value.x = 1.2;
    const g = inst.group;
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    if (sp.v.shape === 'flat') { g.rotation.z = Math.PI / 2 - 0.35; box.setFromObject(g); box.getSize(size); box.getCenter(ctr); }
    g.position.sub(ctr);
    snapScene.add(g);
    snapCam.aspect = w / h;
    const fitH = Math.max(size.y * 1.25, size.z / snapCam.aspect * 1.12);
    const dist = fitH / 2 / Math.tan(THREE.MathUtils.degToRad(snapCam.fov / 2));
    snapCam.position.set(-dist * 0.96, dist * 0.18, dist * 0.2);
    snapCam.lookAt(0, 0, 0);
    snapCam.updateProjectionMatrix();
    snapR.setClearColor(0x000000, 0);
    snapR.render(snapScene, snapCam);
    const url = snapR.domElement.toDataURL('image/png');
    snapScene.remove(g);
    inst.dispose();
    snapCache[key] = url;
    return url;
  }

  return { create, snapshot, shapeOf, surf };
})();
