// ===================== 天空：大气渐变 + 体积感云层 + 日月星辰 =====================
'use strict';

const Sky = {
  mesh: null, mat: null,
  env: null, // 当前环境参数（updateEnv 计算）

  build(scene) {
    const geo = new THREE.SphereGeometry(2400, 48, 24);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
        uNight: { value: 0 }, uTime: { value: 0 }, uCover: { value: 0.4 }, uSunInt: { value: 1 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position + cameraPosition, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: `
        uniform vec3 uTop, uHorizon, uSunDir, uSunColor, uMoonDir, uCloudLit, uCloudDark;
        uniform float uNight, uTime, uCover, uSunInt;
        varying vec3 vDir;
        ${U3.GLSL.noise}
        float stars(vec3 d) {
          vec3 p = d * 260.0;
          vec3 i = floor(p); vec3 f = fract(p) - 0.5;
          float h = fract(sin(dot(i, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float b = fract(h * 97.13);
          return step(0.9972, h) * smoothstep(0.3, 0.0, length(f)) * (0.35 + b * b * 1.6);
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          float hh = max(h, 0.0);
          vec3 col = mix(uHorizon, uTop, pow(hh, 0.42));
          col = mix(col, uHorizon * 0.82, smoothstep(0.0, -0.2, h));
          float sd = max(dot(d, uSunDir), 0.0);
          // 地平线附近朝太阳一侧的暖光（晨昏）
          col += uSunColor * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.45) * uSunInt * (1.0 - hh * 0.5);
          float disk = smoothstep(0.99962, 0.99984, sd);
          // 星星（银河带更密）
          float band = exp(-pow(dot(d, normalize(vec3(0.5, 0.35, -0.8))) * 3.0, 2.0));
          float st = (stars(d) + stars(d.zxy * 1.3) * band) * uNight * smoothstep(0.02, 0.3, h);
          col += vec3(0.9, 0.95, 1.0) * st * (0.75 + 0.25 * sin(uTime * 3.0 + d.x * 300.0));
          col += vec3(0.25, 0.28, 0.4) * band * uNight * 0.05 * smoothstep(0.0, 0.4, h);
          // 月亮（带明暗面）
          float md = dot(d, uMoonDir);
          float moon = smoothstep(0.99955, 0.99972, md);
          vec3 mc = vec3(0.95, 0.93, 0.85) * (0.75 + 0.25 * vn(d.xy * 900.0));
          col += mc * moon * uNight * 1.6 + vec3(0.55, 0.6, 0.75) * pow(max(md, 0.0), 160.0) * 0.3 * uNight;
          // 云
          float cloudA = 0.0;
          if (h > -0.02) {
            float hc = max(h, 0.0);
            vec2 uv = d.xz / (hc + 0.07) * 0.75 + vec2(uTime * 0.010, uTime * 0.0035);
            float n = fbm5(uv * 1.15);
            float n2 = fbm4(uv * 3.3 + 5.0);
            float base = n * 0.82 + n2 * 0.3;
            float dens = smoothstep(1.02 - uCover, 1.3 - uCover * 0.55, base);
            vec2 ls = normalize(uSunDir.xz + 1e-4) * 0.1;
            float nl = fbm5((uv + ls) * 1.15) * 0.82 + n2 * 0.3;
            float shade = clamp((base - nl) * 4.0 + 0.55, 0.0, 1.0);
            vec3 cc = mix(uCloudDark, uCloudLit, shade);
            cc += uSunColor * pow(sd, 5.0) * 0.55 * (1.0 - dens) * uSunInt;
            float fade = smoothstep(-0.02, 0.2, h);
            cloudA = dens * fade;
            col = mix(col, cc, cloudA * 0.96);
          }
          col += uSunColor * disk * 7.0 * uSunInt * (1.0 - cloudA);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);
  },

  // 按游戏时间/天气计算环境参数
  keys: [
    // h, 天顶, 地平线, 太阳色, 太阳强度, 夜晚系数
    [0,    '#070b1c', '#111a33', '#34456e', 0.0, 1],
    [4.6,  '#0a0f24', '#1b2544', '#34456e', 0.0, 1],
    [5.6,  '#2a3a6e', '#e98a5c', '#ff8a4a', 0.35, 0.45],
    [6.8,  '#4f82c8', '#f7c08a', '#ffc27a', 0.8, 0.05],
    [8.5,  '#3f86d6', '#bfdcf2', '#fff1d6', 1.1, 0],
    [12,   '#2f7ad0', '#b8d8f2', '#fff8ea', 1.25, 0],
    [16,   '#3a82d2', '#c6def0', '#ffefcf', 1.1, 0],
    [17.8, '#4a70b8', '#f5b67a', '#ffae5a', 0.75, 0.05],
    [18.9, '#3a3f7e', '#ff8454', '#ff6a2a', 0.35, 0.3],
    [19.8, '#141a40', '#3b3c66', '#40507e', 0.02, 0.85],
    [24,   '#070b1c', '#111a33', '#34456e', 0.0, 1],
  ],

  computeEnv(hour, weather) {
    const k = this.keys;
    let a = k[0], b = k[k.length - 1];
    for (let i = 0; i < k.length - 1; i++) {
      if (hour >= k[i][0] && hour <= k[i + 1][0]) { a = k[i]; b = k[i + 1]; break; }
    }
    const t = (hour - a[0]) / Math.max(0.001, b[0] - a[0]);
    const L = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), t);
    const env = {
      top: L(a[1], b[1]), horizon: L(a[2], b[2]), sun: L(a[3], b[3]),
      sunInt: U3.lerp(a[4], b[4], t), night: U3.lerp(a[5], b[5], t),
    };
    const rainy = weather === 'rain', cloudy = weather === 'cloudy';
    env.cover = rainy ? 0.92 : cloudy ? 0.68 : 0.36;
    env.rain = rainy ? 1 : 0;
    if (rainy || cloudy) {
      const k2 = rainy ? 0.45 : 0.75;
      env.sunInt *= rainy ? 0.28 : 0.62;
      const gray = new THREE.Color(0x8a96a3).multiplyScalar(1 - env.night * 0.85);
      env.top.lerp(gray, rainy ? 0.75 : 0.35).multiplyScalar(k2 + 0.3);
      env.horizon.lerp(gray, rainy ? 0.7 : 0.3);
    }
    // 太阳/月亮方向
    const dayP = (hour - 5.5) / 13.5;
    const nightP = hour >= 19 ? (hour - 19) / 10.5 : (hour + 5) / 10.5;
    env.sunDir = new THREE.Vector3(Math.cos(dayP * Math.PI) * 0.8, Math.sin(dayP * Math.PI) * 0.75 - 0.04, -0.62).normalize();
    env.moonDir = new THREE.Vector3(-Math.cos(nightP * Math.PI) * 0.7, Math.max(0.06, Math.sin(nightP * Math.PI) * 0.7), -0.72).normalize();
    // 云的亮面/暗面
    const dayF = 1 - env.night;
    env.cloudLit = new THREE.Color(0xffffff).lerp(env.sun, 0.35).multiplyScalar(0.25 + 0.95 * dayF * (rainy ? 0.55 : 1));
    env.cloudDark = env.horizon.clone().lerp(new THREE.Color(0x505a6a), 0.5).multiplyScalar(rainy ? 0.5 : 0.8);
    if (env.night > 0.5) { env.cloudLit.lerp(new THREE.Color(0x3a4460), 0.5); }
    env.dayF = dayF;
    return env;
  },

  update(env, t) {
    const u = this.mat.uniforms;
    u.uTop.value.copy(env.top);
    u.uHorizon.value.copy(env.horizon);
    u.uSunDir.value.copy(env.sunDir);
    u.uSunColor.value.copy(env.sun);
    u.uSunInt.value = Math.max(0.05, env.sunInt);
    u.uMoonDir.value.copy(env.moonDir);
    u.uNight.value = env.night;
    u.uTime.value = t;
    u.uCover.value = env.cover;
    u.uCloudLit.value.copy(env.cloudLit);
    u.uCloudDark.value.copy(env.cloudDark);
  },
};
