// ===================== 水面：平面反射 + 屏幕空间折射 + 深度吸收 + 泡沫/涟漪/雨点 =====================
// 渲染流程（由 Scene3D 调度）：
//   1) 反射 pass：镜像相机渲染水面以上 → reflRT
//   2) 折射 pass：主相机渲染水面以下（带深度图）→ refrRT
//   3) 主 pass：水面着色器混合反射/折射，按水体厚度做吸收散射与岸边泡沫
'use strict';

const Water = {
  mesh: null, mat: null,
  reflRT: null, refrRT: null, reflCam: null,
  ripples: [], MAX_RIP: 14,
  amp: 0.1, freq: 1, flow: new THREE.Vector2(),

  // CPU 端波高（与着色器 waveH 一致），用于浮漂/涟漪/船
  waveH(x, z, t) {
    const f = this.freq, fx = this.flow.x * t, fz = this.flow.y * t;
    const px = (x - fx) * f, pz = (z - fz) * f;
    return (Math.sin(px * 0.12 + pz * 0.05 + t * 0.9) * 0.30 +
            Math.sin(-px * 0.07 + pz * 0.11 + t * 0.75) * 0.25 +
            Math.sin(px * 0.19 - pz * 0.13 + t * 1.3) * 0.12 +
            Math.sin(-px * 0.29 - pz * 0.21 + t * 1.7) * 0.07) * this.amp;
  },

  normalTexture() {
    // 可平铺的法线贴图：整数频率正弦叠加得到周期高度场
    const N = 256;
    const r = U3.rng(7);
    const waves = [];
    for (let i = 0; i < 48; i++) {
      const kx = Math.round((r() - 0.5) * 2 * (2 + i * 0.5)), ky = Math.round((r() - 0.5) * 2 * (2 + i * 0.5));
      if (!kx && !ky) continue;
      waves.push([kx, ky, r() * Math.PI * 2, 1 / Math.pow(Math.hypot(kx, ky), 1.25)]);
    }
    const hgt = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let h = 0;
      for (const [kx, ky, ph, a] of waves) h += Math.sin(Math.PI * 2 * (kx * x + ky * y) / N + ph) * a;
      hgt[y * N + x] = h;
    }
    const data = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x - 1 + N) % N];
      const hy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x];
      const v = new THREE.Vector3(-hx * 1.4, -hy * 1.4, 1).normalize();
      const i = (y * N + x) * 4;
      data[i] = (v.x * 0.5 + 0.5) * 255; data[i + 1] = (v.y * 0.5 + 0.5) * 255; data[i + 2] = (v.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  },

  // 以玩家为中心的极坐标网格：近处致密、远处稀疏
  buildGeo() {
    const RINGS = 150, SEG = 180;
    const pos = [], idx = [];
    pos.push(0, 0, 0);
    let r = 0.35;
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEG; j++) {
        const a = j / SEG * Math.PI * 2;
        pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
      r = r * 1.052 + 0.12;
    }
    for (let j = 0; j < SEG; j++) idx.push(0, 1 + (j + 1) % SEG, 1 + j);
    for (let i = 0; i < RINGS - 1; i++) {
      for (let j = 0; j < SEG; j++) {
        const a = 1 + i * SEG + j, b = 1 + i * SEG + (j + 1) % SEG;
        const c = a + SEG, d = b + SEG;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  },

  build(scene, renderer) {
    const ripU = [];
    for (let i = 0; i < this.MAX_RIP; i++) ripU.push(new THREE.Vector4(0, 0, -99, 0));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uAmp: { value: 0.1 }, uFreq: { value: 1 }, uFlow: { value: new THREE.Vector2() },
        uNormal: { value: this.normalTexture() }, uNormStr: { value: 1 },
        uRefl: { value: null }, uRefr: { value: null }, uDepth: { value: null },
        uTexMat: { value: new THREE.Matrix4() },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 }, uFar: { value: 3000 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uSunInt: { value: 1 },
        uSkyCol: { value: new THREE.Color() },
        uScatter: { value: new THREE.Color() }, uAbsorb: { value: new THREE.Vector3(0.4, 0.2, 0.2) },
        uFoamAmt: { value: 1 }, uCrestFoam: { value: 0 },
        uFogColor: { value: new THREE.Color() }, uFogNear: { value: 100 }, uFogFar: { value: 1000 },
        uRain: { value: 0 }, uRip: { value: ripU },
        uAmbient: { value: 1 },
      },
      vertexShader: `
        uniform float uTime, uAmp, uFreq;
        uniform vec2 uFlow;
        uniform mat4 uTexMat;
        varying vec3 vWorld;
        varying vec3 vWaveN;
        varying vec4 vReflCoord;
        varying float vH;
        float waveH(vec2 p, float t) {
          p = (p - uFlow * t) * uFreq;
          return (sin(p.x * 0.12 + p.y * 0.05 + t * 0.9) * 0.30 +
                  sin(-p.x * 0.07 + p.y * 0.11 + t * 0.75) * 0.25 +
                  sin(p.x * 0.19 - p.y * 0.13 + t * 1.3) * 0.12 +
                  sin(-p.x * 0.29 - p.y * 0.21 + t * 1.7) * 0.07) * uAmp;
        }
        void main() {
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          float e = 0.6;
          float h = waveH(wp.xz, uTime);
          float hx = waveH(wp.xz + vec2(e, 0.0), uTime);
          float hz = waveH(wp.xz + vec2(0.0, e), uTime);
          wp.y += h;
          vH = h / max(uAmp, 0.001);
          vWaveN = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
          vWorld = wp;
          vReflCoord = uTexMat * vec4(wp.x, 0.0, wp.z, 1.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        #include <packing>
        uniform float uTime, uNormStr, uNear, uFar, uSunInt, uFoamAmt, uCrestFoam, uFogNear, uFogFar, uRain, uAmbient;
        uniform vec2 uFlow, uRes;
        uniform sampler2D uNormal, uRefl, uRefr, uDepth;
        uniform vec3 uSunDir, uSunColor, uSkyCol, uScatter, uAbsorb, uFogColor;
        uniform vec4 uRip[${this.MAX_RIP}];
        varying vec3 vWorld;
        varying vec3 vWaveN;
        varying vec4 vReflCoord;
        varying float vH;
        ${U3.GLSL.noise}

        float linDepth(float d) { return -perspectiveDepthToViewZ(d, uNear, uFar); }

        vec2 rainRipples(vec2 p, float t) {
          vec2 cell = floor(p);
          vec2 g = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 c = cell + vec2(float(i), float(j));
            float h = h21(c);
            vec2 ctr = c + 0.5 + (vec2(h21(c + 3.1), h21(c + 7.7)) - 0.5) * 0.8;
            float tt = fract(t * 1.1 + h);
            vec2 dv = p - ctr;
            float d = length(dv);
            float r = tt * 0.75;
            float w = sin((d - r) * 40.0) * smoothstep(0.1, 0.0, abs(d - r)) * (1.0 - tt) * (1.0 - tt);
            g += dv / max(d, 1e-3) * w;
          }
          return g;
        }

        void main() {
          vec3 V = cameraPosition - vWorld;
          float dist = length(V);
          V /= dist;
          vec2 p = vWorld.xz;
          vec2 fp = p - uFlow * uTime;

          // ---- 法线：几何大浪 + 两层滚动法线贴图 + 近处细纹 ----
          float detailFade = 1.0 - smoothstep(60.0, 420.0, dist);
          vec3 n1 = texture2D(uNormal, fp * 0.045 + vec2(uTime * 0.011, uTime * 0.006)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uNormal, fp * 0.11 + vec2(-uTime * 0.017, uTime * 0.021)).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(uNormal, fp * 0.37 + vec2(uTime * 0.035, -uTime * 0.03)).xyz * 2.0 - 1.0;
          vec2 slope = (n1.xy * 0.6 + n2.xy * 0.45 + n3.xy * 0.25 * (1.0 - smoothstep(10.0, 60.0, dist))) * uNormStr * (0.35 + 0.65 * detailFade);
          // 交互涟漪
          for (int i = 0; i < ${this.MAX_RIP}; i++) {
            vec4 R = uRip[i];
            float age = uTime - R.z;
            if (age < 0.0 || age > 3.2) continue;
            vec2 dv = p - R.xy;
            float d = length(dv);
            float rr = age * 1.5 + 0.1;
            float fall = (1.0 - age / 3.2);
            float w = sin((d - rr) * 10.0) * exp(-pow((d - rr) * 2.0, 2.0)) * fall * fall * R.w;
            // 次级波
            float rr2 = age * 1.0;
            w += sin((d - rr2) * 14.0) * exp(-pow((d - rr2) * 3.0, 2.0)) * fall * fall * fall * R.w * 0.6;
            slope += dv / max(d, 1e-3) * w * 0.55;
          }
          // 雨点
          if (uRain > 0.0 && dist < 45.0) {
            vec2 rg = rainRipples(p * 2.2, uTime) + rainRipples(p * 2.2 * 1.37 + 13.0, uTime * 1.13) * 0.8;
            slope += rg * 0.35 * uRain * (1.0 - smoothstep(15.0, 45.0, dist));
          }
          vec3 N = normalize(vec3(vWaveN.x + slope.x, 1.0, vWaveN.z + slope.y));

          // ---- 菲涅尔 ----
          float NoV = max(dot(N, V), 0.0);
          float fres = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
          fres = clamp(fres, 0.0, 1.0);

          // ---- 反射 ----
          vec2 ruv = vReflCoord.xy / vReflCoord.w + N.xz * 0.028 / (1.0 + dist * 0.004);
          vec3 refl = texture2D(uRefl, ruv).rgb;

          // ---- 折射 + 水体吸收 ----
          vec2 suv = gl_FragCoord.xy / uRes;
          float waterD = linDepth(gl_FragCoord.z);
          vec2 off = N.xz * 0.035 / (1.0 + dist * 0.06);
          vec2 tuv = suv + off;
          float sceneD = linDepth(texture2D(uDepth, tuv).r);
          if (sceneD < waterD) { tuv = suv; sceneD = linDepth(texture2D(uDepth, suv).r); }
          float thick = max(sceneD - waterD, 0.0);
          vec3 refr = texture2D(uRefr, tuv).rgb;
          vec3 trans = exp(-uAbsorb * thick);
          float lightK = uAmbient;
          vec3 body = uScatter * lightK;
          // 波峰透光（次表面散射）
          float sss = pow(max(dot(V, -uSunDir), 0.0), 3.0) * max(vH, 0.0);
          body += uScatter * 2.4 * sss * uSunInt;
          vec3 under = refr * trans + body * (1.0 - trans);

          vec3 col = mix(under, refl, fres);

          // ---- 高光（太阳/月亮闪烁） ----
          vec3 H = normalize(uSunDir + V);
          float NoH = max(dot(N, H), 0.0);
          float spec = pow(NoH, 900.0) * 7.0 + pow(NoH, 140.0) * 0.8 + pow(NoH, 24.0) * 0.06;
          col += uSunColor * spec * uSunInt * (0.4 + 0.6 * fres) * (uSunDir.y > 0.0 ? 1.0 : 0.0);

          // ---- 泡沫：岸边/物体交界 + 大浪浪尖 ----
          float fn = vn(p * 3.0 + uTime * 0.3) * 0.6 + vn(p * 9.0 - uTime * 0.5) * 0.4;
          float edge = 1.0 - smoothstep(0.0, 0.55, thick);
          float foam = smoothstep(0.35, 0.75, edge * (0.6 + fn * 0.8)) * uFoamAmt;
          foam += smoothstep(0.55, 1.0, vH * 0.9 + fn * 0.45) * uCrestFoam;
          // 涟漪白沫
          for (int i = 0; i < ${this.MAX_RIP}; i++) {
            vec4 R = uRip[i];
            float age = uTime - R.z;
            if (age < 0.0 || age > 1.2 || R.w < 0.8) continue;
            float d = length(p - R.xy);
            foam += smoothstep(0.35 * R.w, 0.0, d - age * 0.6) * (1.0 - age / 1.2) * 0.8 * fn;
          }
          foam = clamp(foam, 0.0, 1.0) * detailFade;
          vec3 foamCol = uSkyCol * 0.55 + uSunColor * uSunInt * 0.45;
          col = mix(col, foamCol, foam * 0.85);

          // ---- 雾 ----
          float fogF = smoothstep(uFogNear, uFogFar, dist);
          col = mix(col, uFogColor, fogF);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(this.buildGeo(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);

    // 渲染目标
    const o = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.reflRT = new THREE.WebGLRenderTarget(512, 512, o);
    this.refrRT = new THREE.WebGLRenderTarget(512, 512, o);
    this.refrRT.depthTexture = new THREE.DepthTexture(512, 512);
    this.refrRT.depthTexture.type = THREE.UnsignedIntType;
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflCam.matrixAutoUpdate = true;
    const u = this.mat.uniforms;
    u.uRefl.value = this.reflRT.texture;
    u.uRefr.value = this.refrRT.texture;
    u.uDepth.value = this.refrRT.depthTexture;
  },

  resize(w, h, pr) {
    const s = 0.5;
    this.reflRT.setSize(Math.max(64, w * pr * s | 0), Math.max(64, h * pr * s | 0));
    this.refrRT.setSize(Math.max(64, w * pr * 0.6 | 0), Math.max(64, h * pr * 0.6 | 0));
    this.mat.uniforms.uRes.value.set(w * pr, h * pr);
  },

  setLocation(cfg) {
    const w = cfg.water;
    this.amp = w.amp; this.freq = w.freq;
    this.flow.set(w.flow ? w.flow[0] : 0, w.flow ? w.flow[1] : 0);
    const u = this.mat.uniforms;
    u.uFreq.value = w.freq;
    u.uFlow.value.copy(this.flow);
    u.uScatter.value.set(w.scatter);
    u.uAbsorb.value.set(...w.absorb);
    u.uNormStr.value = w.normStr;
    u.uCrestFoam.value = w.crestFoam || 0;
    this.baseAmp = w.amp;
    this.ripples = [];
  },

  addRipple(x, z, strength = 1, t) {
    this.ripples.push({ x, z, t, s: strength });
    if (this.ripples.length > this.MAX_RIP) this.ripples.shift();
  },

  update(t, env, chop, fog) {
    this.amp = this.baseAmp * chop;
    const u = this.mat.uniforms;
    u.uTime.value = t;
    u.uAmp.value = this.amp;
    u.uRain.value = env.rain;
    const night = env.night > 0.6;
    u.uSunDir.value.copy(night ? env.moonDir : env.sunDir);
    u.uSunColor.value.copy(night ? new THREE.Color(0xb8c4e0) : env.sun);
    u.uSunInt.value = night ? 0.5 * (1 - env.cover * 0.8) : Math.max(0, env.sunInt) * (1 - env.cover * 0.5);
    u.uSkyCol.value.copy(env.horizon);
    u.uAmbient.value = 0.12 + env.dayF * 0.95 * (1 - env.cover * 0.35);
    u.uFogColor.value.copy(fog.color);
    u.uFogNear.value = fog.near; u.uFogFar.value = fog.far;
    for (let i = 0; i < this.MAX_RIP; i++) {
      const r = this.ripples[i];
      if (r) u.uRip.value[i].set(r.x, r.z, r.t, r.s);
      else u.uRip.value[i].set(0, 0, -99, 0);
    }
  },

  // 计算镜像相机与投影纹理矩阵
  updateReflCam(cam) {
    const rc = this.reflCam;
    rc.fov = cam.fov; rc.aspect = cam.aspect; rc.near = cam.near; rc.far = cam.far;
    rc.updateProjectionMatrix();
    const pos = cam.getWorldPosition(new THREE.Vector3());
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    rc.position.set(pos.x, -pos.y, pos.z);
    rc.up.set(up.x, -up.y, up.z);
    rc.lookAt(pos.x + dir.x, -pos.y - dir.y, pos.z + dir.z);
    rc.updateMatrixWorld();
    const m = this.mat.uniforms.uTexMat.value;
    m.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    m.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
  },
};
