// ===================== 第一人称 3D 场景 (Three.js) =====================
// 提供给 fishing.js 的接口：
//   init(canvas) / resize() / setAim(nx,ny) / render(dt,t,F)
//   splash(dist,az,scale) / ripple(dist,az,scale) / bobberWorld(dist,az)
'use strict';

const Scene3D = {
  renderer: null, scene: null, camera: null,
  camYaw: 0, camPitch: -0.05, aimX: 0, aimY: 0,
  shake: 0,

  water: null, sky: null, sunLight: null, hemiLight: null,
  dock: null, hills: [], clouds: [], stars: null, moon: null,
  rod: null, rodGeo: null, lineMesh: null, bobber: null,
  fishShadow: null, castMarker: null,
  ripples: [], splashPts: null, splashData: [],
  rain: null, rainData: null,

  EYE: new THREE.Vector3(0, 2.3, 0),

  // ---------- 波浪高度（与顶点着色器保持一致） ----------
  waveH(x, z, t, chop = 1) {
    const p2 = -z;
    return (Math.sin(x * 0.11 + t * 0.9) * 0.35 +
            Math.sin(p2 * 0.13 + t * 0.7) * 0.30 +
            Math.sin((x + p2) * 0.07 + t * 1.3) * 0.25 +
            Math.sin(Math.sqrt(x * x + p2 * p2) * 0.2 - t * 1.1) * 0.10) * chop * 0.55;
  },

  init(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    this.renderer = r;

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog(0xbfe3f8, 80, 280);

    const cam = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
    cam.rotation.order = 'YXZ';
    cam.position.copy(this.EYE);
    this.camera = cam;
    scene.add(cam);

    // 光照
    this.hemiLight = new THREE.HemisphereLight(0xcfe8ff, 0x3a5a4a, 0.7);
    scene.add(this.hemiLight);
    this.sunLight = new THREE.DirectionalLight(0xfff2d0, 1.0);
    this.sunLight.position.set(40, 60, -30);
    scene.add(this.sunLight);

    this.buildSky();
    this.buildWater();
    this.buildDock();
    this.buildHills();
    this.buildClouds();
    this.buildStars();
    this.buildRod();
    this.buildLine();
    this.buildBobber();
    this.buildFishShadow();
    this.buildMarkers();
    this.buildSplash();
    this.buildRain();
    this.buildRipples();
  },

  resize(w, h) {
    this.viewW = w; this.viewH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  // 世界坐标 → 屏幕像素
  project(v) {
    const p = v.clone().project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.viewW,
      y: (-p.y * 0.5 + 0.5) * this.viewH,
      vis: p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15,
    };
  },

  setAim(nx, ny) { this.aimX = nx; this.aimY = ny; },

  // 世界坐标：以相机为原点，yaw=0 朝 -Z
  dirOf(az) { return new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az)); },
  bobberWorld(dist, az) {
    const d = this.dirOf(az).multiplyScalar(3.5 + dist);
    return new THREE.Vector3(this.EYE.x + d.x, 0, this.EYE.z + d.z);
  },

  // ---------- 天空 ----------
  buildSky() {
    const geo = new THREE.SphereGeometry(420, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x3f8fd0) },
        uHorizon: { value: new THREE.Color(0xbfe3f8) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(0xfff2cc) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uNight: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop, uHorizon, uSunColor;
        uniform vec3 uSunDir, uMoonDir;
        uniform float uNight;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float t = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(t, 0.55));
          float sunAmt = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(sunAmt, 900.0) * 1.6 + pow(sunAmt, 40.0) * 0.22 + pow(sunAmt, 6.0) * 0.06);
          float moonAmt = max(dot(d, normalize(uMoonDir)), 0.0);
          col += vec3(0.92, 0.93, 0.85) * pow(moonAmt, 1800.0) * 1.2 * uNight;
          col += vec3(0.75, 0.78, 0.7) * pow(moonAmt, 90.0) * 0.10 * uNight;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);
  },

  // ---------- 水面 ----------
  buildWater() {
    const geo = new THREE.PlaneGeometry(420, 420, 170, 170);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uChop: { value: 1 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(0xfff2cc) },
        uDeep: { value: new THREE.Color(0x2c5f6f) },
        uShallow: { value: new THREE.Color(0x4a90a4) },
        uHorizon: { value: new THREE.Color(0xbfe3f8) },
        uSunInt: { value: 1 },
      },
      vertexShader: `
        uniform float uTime, uChop;
        varying vec3 vWorld;
        varying vec3 vNorm;
        float waveH(vec2 p, float t) {
          return (sin(p.x*0.11 + t*0.9)*0.35 +
                  sin(p.y*0.13 + t*0.7)*0.30 +
                  sin((p.x+p.y)*0.07 + t*1.3)*0.25 +
                  sin(length(p)*0.2 - t*1.1)*0.10) * uChop * 0.55;
        }
        void main() {
          float e = 0.9;
          float h  = waveH(position.xy, uTime);
          float hx = waveH(position.xy + vec2(e, 0.0), uTime);
          float hy = waveH(position.xy + vec2(0.0, e), uTime);
          vec3 disp = vec3(position.x, position.y, h);
          vNorm = normalize(vec3(-(hx-h)/e, -(hy-h)/e, 1.0));
          vWorld = (modelMatrix * vec4(disp, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(disp, 1.0);
        }`,
      fragmentShader: `
        uniform float uTime, uChop, uSunInt;
        uniform vec3 uSunDir, uSunColor, uDeep, uShallow, uHorizon;
        varying vec3 vWorld;
        varying vec3 vNorm;
        void main() {
          // 平面局部法线 → 世界（平面绕X轴-90度）
          vec3 n = normalize(vec3(vNorm.x, vNorm.z, -vNorm.y));
          // 高频细波纹
          n.x += (sin(vWorld.x*1.35 + uTime*2.1) + sin(vWorld.z*1.7 + uTime*1.7) + sin((vWorld.x+vWorld.z)*2.3 - uTime*2.6)) * 0.035 * uChop;
          n.z += (sin(vWorld.z*1.45 + uTime*1.9) + sin(vWorld.x*2.1 - uTime*2.2)) * 0.035 * uChop;
          n = normalize(n);
          vec3 viewDir = normalize(cameraPosition - vWorld);
          float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
          vec3 base = mix(uDeep, uShallow, clamp(0.25 + n.y*0.35, 0.0, 1.0));
          vec3 col = mix(base, uHorizon, fresnel * 0.72);
          vec3 rdir = reflect(-normalize(uSunDir), n);
          float spec = pow(max(dot(rdir, viewDir), 0.0), 260.0);
          float spec2 = pow(max(dot(rdir, viewDir), 0.0), 26.0);
          col += uSunColor * (spec * 1.4 + spec2 * 0.10) * uSunInt;
          float dist = length(vWorld.xz - cameraPosition.xz);
          col = mix(col, uHorizon, smoothstep(65.0, 225.0, dist));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0, -140);
    this.scene.add(this.water);
  },

  // ---------- 木质栈桥 ----------
  woodTexture() {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = '#503522'; c.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 32) {
      c.fillStyle = `rgb(${74 + Math.random() * 26 | 0},${50 + Math.random() * 18 | 0},${30 + Math.random() * 12 | 0})`;
      c.fillRect(0, y, 128, 30);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, y + 30, 128, 2);
      // 木纹
      c.strokeStyle = 'rgba(0,0,0,0.12)';
      c.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        const yy = y + 4 + Math.random() * 24;
        c.moveTo(0, yy);
        c.bezierCurveTo(40, yy + (Math.random() - 0.5) * 6, 90, yy + (Math.random() - 0.5) * 6, 128, yy);
        c.stroke();
      }
      // 钉子
      c.fillStyle = 'rgba(30,25,20,0.7)';
      c.beginPath(); c.arc(14, y + 15, 2, 0, 7); c.fill();
      c.beginPath(); c.arc(114, y + 15, 2, 0, 7); c.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  },

  buildDock() {
    const g = new THREE.Group();
    const tex = this.woodTexture();
    tex.repeat.set(1, 3);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.14, 9),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
    );
    deck.position.set(0, 0.82, 2.0);
    g.add(deck);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.95 });
    g.add(this.dockPost(-0.95, -2.2, postMat));
    g.add(this.dockPost(0.95, -2.2, postMat));
    g.add(this.dockPost(-0.95, 2.8, postMat));
    g.add(this.dockPost(0.95, 2.8, postMat));
    this.dock = g;
    this.scene.add(g);
  },

  dockPost(x, z, mat) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.2, 8), mat);
    post.position.set(x, -0.2, z);
    return post;
  },

  // ---------- 远山 ----------
  buildHills() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x5a7a6a });
    const positions = [[-150, -250, 90, 13], [-30, -265, 120, 18], [95, -255, 100, 14], [200, -240, 80, 9]];
    positions.forEach(([x, z, rad, h]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 20, 12), mat.clone());
      m.scale.set(1, h / rad, 1);
      m.position.set(x, 0, z);
      this.hills.push(m);
      this.scene.add(m);
    });
  },

  // ---------- 云 ----------
  cloudTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    const blob = (x, y, r) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    };
    blob(50, 70, 40); blob(80, 62, 34); blob(64, 78, 42); blob(38, 60, 26);
    return new THREE.CanvasTexture(cv);
  },

  buildClouds() {
    const tex = this.cloudTexture();
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }));
      const s = 30 + Math.random() * 34;
      sp.scale.set(s, s * 0.5, 1);
      sp.position.set(-180 + Math.random() * 360, 42 + Math.random() * 30, -90 - Math.random() * 120);
      sp.userData.speed = 0.4 + Math.random() * 0.5;
      this.clouds.push(sp);
      this.scene.add(sp);
    }
  },

  // ---------- 星星 ----------
  buildStars() {
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const az = Math.random() * Math.PI * 2;
      const el = 0.08 + Math.random() * 1.35;
      const rr = 400;
      pos[i * 3] = Math.cos(el) * Math.cos(az) * rr;
      pos[i * 3 + 1] = Math.sin(el) * rr;
      pos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * rr;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.scene.add(this.stars);

    // 月亮
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(28, 28, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(250,248,225,1)');
    g.addColorStop(0.7, 'rgba(235,232,205,0.9)');
    g.addColorStop(1, 'rgba(235,232,205,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(32, 32, 30, 0, 7); c.fill();
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.moon.scale.set(26, 26, 1);
    this.scene.add(this.moon);
  },

  // ---------- 鱼竿（第一人称，锥形管） ----------
  buildRod() {
    const group = new THREE.Group();
    group.position.set(0.42, -0.56, -0.2);
    this.camera.add(group);

    const RINGS = 16, SEG = 8;
    const count = RINGS * SEG;
    const pos = new Float32Array(count * 3);
    const idx = [];
    for (let i = 0; i < RINGS - 1; i++) {
      for (let j = 0; j < SEG; j++) {
        const a = i * SEG + j, b = i * SEG + (j + 1) % SEG;
        const c2 = (i + 1) * SEG + j, d = (i + 1) * SEG + (j + 1) % SEG;
        idx.push(a, c2, b, b, c2, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.rodGeo = { geo, RINGS, SEG };
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x453a2e, roughness: 0.55, metalness: 0.2 }));
    mesh.frustumCulled = false;
    group.add(mesh);

    // 握把 + 渔轮
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.023, 0.34, 10), new THREE.MeshStandardMaterial({ color: 0x2e2018, roughness: 0.95 }));
    grip.position.set(0, 0.08, 0.1);
    grip.rotation.x = 0.42;
    group.add(grip);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 14), new THREE.MeshStandardMaterial({ color: 0x33383e, roughness: 0.4, metalness: 0.65 }));
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0, 0.2, 0.02);
    group.add(reel);
    this.reel = reel;
    this.rod = group;
    this.rodTipWorld = new THREE.Vector3();
  },

  // 每帧根据状态更新竿形
  updateRod(F, t, dt) {
    const g = this.rodGeo;
    const st = F.state;
    let lift = 0, whip = 0, bend = 0, lat = 0;
    if (st === 'charging') lift = F.power / 100;
    else if (st === 'casting') {
      const p = Math.min(1, F.castT / F.castDur);
      whip = Math.sin(Math.min(p * 2.6, 1) * Math.PI);
    } else if (st === 'fight' && F.fish) {
      bend = F.tension / 110;
      const diff = Math.max(-0.6, Math.min(0.6, F.fish.az - this.camYaw));
      lat = diff;
    } else if (st === 'waiting' || st === 'bite') {
      bend = 0.06 + (st === 'bite' ? 0.18 + Math.sin(t * 26) * 0.05 : Math.sin(t * 1.7) * 0.02);
    }

    const base = new THREE.Vector3(0, 0, 0.15);
    const tip = new THREE.Vector3(
      -0.24 - lat * 0.55,
      1.02 + lift * 0.55 - bend * 1.05 - whip * 0.42,
      -2.15 + lift * 0.85 - whip * 0.75 - bend * 0.1
    );
    const ctrl = base.clone().lerp(tip, 0.55);
    ctrl.y += 0.34 - bend * 0.05;
    ctrl.z += 0.1;

    const posAttr = g.geo.attributes.position;
    const tmp = new THREE.Vector3(), tan = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
    for (let i = 0; i < g.RINGS; i++) {
      const u = i / (g.RINGS - 1);
      // 二次贝塞尔
      const a = base.clone().lerp(ctrl, u), b = ctrl.clone().lerp(tip, u);
      tmp.copy(a).lerp(b, u);
      tan.copy(b).sub(a).normalize();
      n1.crossVectors(tan, up).normalize();
      if (n1.lengthSq() < 0.01) n1.set(1, 0, 0);
      n2.crossVectors(tan, n1).normalize();
      const rad = 0.011 * (1 - u) + 0.0022;
      for (let j = 0; j < g.SEG; j++) {
        const th = j / g.SEG * Math.PI * 2;
        const px = tmp.x + (n1.x * Math.cos(th) + n2.x * Math.sin(th)) * rad;
        const py = tmp.y + (n1.y * Math.cos(th) + n2.y * Math.sin(th)) * rad;
        const pz = tmp.z + (n1.z * Math.cos(th) + n2.z * Math.sin(th)) * rad;
        posAttr.setXYZ(i * g.SEG + j, px, py, pz);
      }
    }
    posAttr.needsUpdate = true;
    g.geo.computeVertexNormals();

    // 收线时渔轮转动
    if (F.state === 'fight' && F.pressing) this.reel.rotation.x += dt * 14;

    this.rodTipWorld.copy(tip);
    this.rod.localToWorld(this.rodTipWorld);
  },

  // ---------- 鱼线 ----------
  buildLine() {
    const N = 26;
    const pos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lineMesh = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xdde8f0, transparent: true, opacity: 0.55 }));
    this.lineMesh.frustumCulled = false;
    this.scene.add(this.lineMesh);
    this.lineN = N;
  },

  updateLine(endWorld, sag, danger) {
    const posAttr = this.lineMesh.geometry.attributes.position;
    const s = this.rodTipWorld, e = endWorld;
    const mid = s.clone().lerp(e, 0.5);
    mid.y -= sag;
    for (let i = 0; i < this.lineN; i++) {
      const u = i / (this.lineN - 1);
      const a = s.clone().lerp(mid, u), b = mid.clone().lerp(e, u);
      const p = a.lerp(b, u);
      posAttr.setXYZ(i, p.x, p.y, p.z);
    }
    posAttr.needsUpdate = true;
    this.lineMesh.material.color.set(danger ? 0xff7a6a : 0xdde8f0);
    this.lineMesh.material.opacity = danger ? 0.95 : 0.55;
    this.lineMesh.visible = true;
  },

  // ---------- 浮漂 ----------
  buildBobber() {
    const grp = new THREE.Group();
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0xd33a2c, roughness: 0.4 }));
    top.position.y = 0.1;
    const bot = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.4 }));
    bot.rotation.x = Math.PI;
    bot.position.y = -0.1;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xf7b32b, roughness: 0.5 }));
    stick.position.y = 0.3;
    grp.add(top, bot, stick);
    grp.visible = false;
    this.bobber = grp;
    this.scene.add(grp);
  },

  // ---------- 鱼影 ----------
  buildFishShadow() {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0x06121c, transparent: true, opacity: 0.42, depthWrite: false })
    );
    m.scale.set(1.4, 0.3, 0.55);
    m.visible = false;
    this.fishShadow = m;
    this.scene.add(m);
  },

  // ---------- 蓄力落点标记 ----------
  buildMarkers() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1, 36),
      new THREE.MeshBasicMaterial({ color: 0xffe07a, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    this.castMarker = ring;
    this.scene.add(ring);
  },

  // ---------- 水花粒子 ----------
  buildSplash() {
    const MAX = 420;
    const pos = new Float32Array(MAX * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xe8f5ff, size: 0.13, transparent: true, opacity: 0.9, depthWrite: false });
    this.splashPts = new THREE.Points(geo, mat);
    this.splashPts.frustumCulled = false;
    this.scene.add(this.splashPts);
    this.splashData = [];
    this.splashMax = MAX;
  },

  splash(dist, az, scale = 1) {
    const w = this.bobberWorld(dist, az);
    const n = Math.round(14 * scale);
    for (let i = 0; i < n && this.splashData.length < this.splashMax; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (1 + Math.random() * 2.4) * Math.min(1.6, scale);
      this.splashData.push({
        x: w.x, y: 0.1, z: w.z,
        vx: Math.cos(a) * v * 0.5, vy: 2 + Math.random() * 3 * scale, vz: Math.sin(a) * v * 0.5,
      });
    }
    this.ripple(dist, az, scale);
  },

  // ---------- 涟漪 ----------
  buildRipples() {
    this.ripplePool = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.scene.add(m);
      this.ripplePool.push({ mesh: m, t: 99, dur: 1.2, scale: 1 });
    }
  },

  ripple(dist, az, scale = 1) {
    const w = this.bobberWorld(dist, az);
    const r = this.ripplePool.find(r => r.t >= r.dur);
    if (!r) return;
    r.t = 0;
    r.scale = scale;
    r.mesh.position.set(w.x, 0.05, w.z);
    r.mesh.visible = true;
  },

  // ---------- 雨 ----------
  buildRain() {
    const N = 420;
    const pos = new Float32Array(N * 2 * 3);
    this.rainData = [];
    for (let i = 0; i < N; i++) {
      this.rainData.push({ x: (Math.random() - 0.5) * 50, y: Math.random() * 26, z: (Math.random() - 0.5) * 50 - 10 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaac8e0, transparent: true, opacity: 0.35 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  },

  // ---------- 时间/天气环境 ----------
  envColors(hour) {
    // [h, 天顶, 地平线, 阳光色, 阳光强度, 夜晚系数]
    const keys = [
      [0,   0x0b1026, 0x1a2547, 0x223355, 0.05, 1],
      [4.5, 0x0b1026, 0x1a2547, 0x223355, 0.05, 1],
      [6.5, 0x5a6ea8, 0xf6a05c, 0xff9a3c, 0.55, 0.25],
      [8,   0x4a9fd8, 0xcdeafc, 0xfff2cc, 1.0, 0],
      [12,  0x3f8fd0, 0xbfe3f8, 0xfff7e0, 1.15, 0],
      [16.5,0x4a9fd8, 0xcdeafc, 0xffedb8, 1.0, 0],
      [18.5,0x574a86, 0xff8a4b, 0xff7a2a, 0.5, 0.2],
      [20.5,0x131b3d, 0x2a355e, 0x223355, 0.07, 0.9],
      [24,  0x0b1026, 0x1a2547, 0x223355, 0.05, 1],
    ];
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (hour >= keys[i][0] && hour <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    }
    const t = (hour - a[0]) / Math.max(0.001, b[0] - a[0]);
    const lerpC = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), t);
    return {
      top: lerpC(a[1], b[1]), horizon: lerpC(a[2], b[2]), sun: lerpC(a[3], b[3]),
      sunInt: a[4] + (b[4] - a[4]) * t, night: a[5] + (b[5] - a[5]) * t,
    };
  },

  updateEnvironment(t) {
    const hour = State.gameHour;
    const env = this.envColors(hour);
    const wx = State.weather;
    const rainy = wx === 'rain';
    const cloudy = wx === 'cloudy' || rainy;

    if (cloudy) {
      env.sunInt *= rainy ? 0.35 : 0.65;
      env.top.multiplyScalar(rainy ? 0.62 : 0.85);
      env.horizon.multiplyScalar(rainy ? 0.66 : 0.88);
    }

    // 太阳/月亮方向
    const dayP = (hour - 5) / 15;
    const nightP = hour >= 20 ? (hour - 20) / 9 : (hour + 4) / 9;
    const sunDir = new THREE.Vector3(Math.cos(dayP * Math.PI) * 0.85, Math.max(0.03, Math.sin(dayP * Math.PI)) * 0.9, -0.55).normalize();
    const moonDir = new THREE.Vector3(Math.cos(nightP * Math.PI) * 0.85, Math.max(0.05, Math.sin(nightP * Math.PI)) * 0.85, -0.6).normalize();

    // 天空
    const sm = this.sky.material.uniforms;
    sm.uTop.value.copy(env.top);
    sm.uHorizon.value.copy(env.horizon);
    sm.uSunDir.value.copy(sunDir);
    sm.uSunColor.value.copy(env.sun).multiplyScalar(Math.max(0.05, env.sunInt));
    sm.uMoonDir.value.copy(moonDir);
    sm.uNight.value = env.night;

    // 水
    const loc = LOCATIONS[State.location];
    const dayF = 1 - env.night * 0.72;
    const wm = this.water.material.uniforms;
    wm.uTime.value = t;
    wm.uChop.value = rainy ? 1.7 : wx === 'cloudy' ? 1.25 : 1;
    wm.uSunDir.value.copy(env.night > 0.6 ? moonDir : sunDir);
    wm.uSunColor.value.copy(env.night > 0.6 ? new THREE.Color(0xcfd6c0) : env.sun).multiplyScalar(env.night > 0.6 ? 0.5 : env.sunInt);
    wm.uSunInt.value = 1;
    wm.uDeep.value.set(loc.water[1]).multiplyScalar(dayF);
    wm.uShallow.value.set(loc.water[0]).multiplyScalar(dayF);
    wm.uHorizon.value.copy(env.horizon);

    // 雾 & 光照
    this.scene.fog.color.copy(env.horizon);
    this.sunLight.position.copy(sunDir).multiplyScalar(100);
    this.sunLight.intensity = 0.25 + env.sunInt * 0.9;
    this.sunLight.color.copy(env.sun);
    this.hemiLight.intensity = 0.25 + (1 - env.night) * 0.5;
    this.hemiLight.color.copy(env.horizon);

    // 星月
    this.stars.material.opacity = env.night * 0.9;
    this.moon.material.opacity = env.night;
    this.moon.position.copy(moonDir).multiplyScalar(380);

    // 云
    this.clouds.forEach(c => {
      c.material.opacity = rainy ? 0.92 : cloudy ? 0.8 : 0.5;
      c.material.color.setScalar((rainy ? 0.5 : cloudy ? 0.78 : 1) * (1 - env.night * 0.75));
    });

    // 远山（海边隐藏）
    const showHills = State.location !== 'sea';
    this.hills.forEach(h => {
      h.visible = showHills;
      const base = State.location === 'pond' ? new THREE.Color(0x55755f) : new THREE.Color(0x5f6f7a);
      h.material.color.copy(base).multiplyScalar(dayF * (cloudy ? 0.8 : 1));
    });

    this.rain.visible = rainy;
  },

  // ---------- 主渲染 ----------
  render(dt, t, F) {
    // 相机瞄准（鼠标视差）
    const targetYaw = -this.aimX * 0.42;
    const targetPitch = -0.06 - this.aimY * 0.16;
    this.camYaw += (targetYaw - this.camYaw) * Math.min(1, dt * 9);
    this.camPitch += (targetPitch - this.camPitch) * Math.min(1, dt * 9);
    this.camera.rotation.y = this.camYaw;
    this.camera.rotation.x = Math.max(-0.35, Math.min(0.12, this.camPitch));
    // 呼吸感 + 震屏
    const sh = F.shake || 0;
    this.camera.position.set(
      this.EYE.x + (Math.random() - 0.5) * sh * 0.02,
      this.EYE.y + Math.sin(t * 0.9) * 0.02 + (Math.random() - 0.5) * sh * 0.02,
      this.EYE.z + (Math.random() - 0.5) * sh * 0.012
    );

    this.updateEnvironment(t);
    this.updateRod(F, t, dt);

    // ------- 各状态的浮漂/鱼线/鱼影 -------
    const chop = State.weather === 'rain' ? 1.7 : State.weather === 'cloudy' ? 1.25 : 1;
    this.bobber.visible = false;
    this.fishShadow.visible = false;
    this.castMarker.visible = false;
    this.lineMesh.visible = false;

    const st = F.state;
    if (st === 'charging') {
      // 预计落点
      const d = 6 + Math.max(12, F.power) * 0.88;
      const w = this.bobberWorld(d, this.camYaw);
      this.castMarker.visible = true;
      const ms = 1 + d * 0.03;
      this.castMarker.scale.set(ms, ms, 1);
      this.castMarker.position.set(w.x, this.waveH(w.x, w.z, t, chop) + 0.1, w.z);
      this.castMarker.material.opacity = 0.4 + Math.sin(t * 6) * 0.15;
    } else if (st === 'casting') {
      const p = Math.min(1, F.castT / F.castDur);
      const target = this.bobberWorld(F.castDist, F.castYaw);
      const sx = this.rodTipWorld.x + (target.x - this.rodTipWorld.x) * p;
      const sz = this.rodTipWorld.z + (target.z - this.rodTipWorld.z) * p;
      const arc = Math.sin(p * Math.PI) * (2 + F.castDist * 0.09);
      const sy = this.rodTipWorld.y * (1 - p) + arc;
      this.bobber.visible = true;
      this.bobber.position.set(sx, sy, sz);
      this.bobber.scale.setScalar(1 + F.castDist * 0.032);
      this.updateLine(new THREE.Vector3(sx, sy + 0.25, sz), 0.2, false);
    } else if (st === 'waiting' || st === 'bite') {
      const w = this.bobberWorld(F.castDist, F.castYaw);
      let dip = 0;
      if (F.nibbleFx > 0) dip = -(Math.sin(F.nibbleFx * 25) * 0.12 + 0.12);
      if (st === 'bite') dip = -0.42 - Math.sin(t * 30) * 0.05;
      const wy = this.waveH(w.x, w.z, t, chop);
      this.bobber.visible = true;
      this.bobber.position.set(w.x, wy + dip, w.z);
      this.bobber.rotation.set(Math.sin(t * 1.4) * 0.12, 0, Math.cos(t * 1.1) * 0.12);
      this.bobber.scale.setScalar(1 + F.castDist * 0.032);
      this.updateLine(new THREE.Vector3(w.x, wy + dip + 0.3, w.z), 0.5 + F.castDist * 0.05, false);
    } else if (st === 'fight' && F.fish) {
      const f = F.fish;
      const w = this.bobberWorld(f.dist, f.az);
      const wy = this.waveH(w.x, w.z, t, chop);
      this.fishShadow.visible = true;
      this.fishShadow.position.set(w.x, wy + 0.05, w.z);
      const len = f.junk ? 0.7 : 0.7 + Math.min(1, f.weight / (f.sp ? f.sp.maxW : 1)) * 1.6 + (f.sp && f.sp.rarity === 'legend' ? 0.5 : 0);
      this.fishShadow.scale.set(len * 1.5, len * 0.14, len * 0.6);
      this.fishShadow.rotation.y = -f.az + Math.sin(t * (f.mode === 'dash' ? 10 : 3.5)) * 0.5;
      const danger = F.tension > rodById(State.rod).safe;
      const sag = Math.max(0.05, (1 - F.tension / 110)) * (1 + f.dist * 0.04);
      this.updateLine(new THREE.Vector3(w.x, wy + 0.05, w.z), sag, danger);
    }

    // ------- 涟漪 -------
    this.ripplePool.forEach(r => {
      if (r.t >= r.dur) { r.mesh.visible = false; return; }
      r.t += dt;
      const p = r.t / r.dur;
      const s = (0.5 + p * 4.5) * r.scale;
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = 0.45 * (1 - p);
      r.mesh.position.y = this.waveH(r.mesh.position.x, r.mesh.position.z, t, chop) + 0.06;
    });

    // ------- 水花 -------
    const sp = this.splashPts.geometry.attributes.position;
    let alive = 0;
    for (let i = 0; i < this.splashData.length; i++) {
      const d = this.splashData[i];
      d.vy -= 7.5 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y > -0.2) {
        sp.setXYZ(alive, d.x, d.y, d.z);
        this.splashData[alive] = d;
        alive++;
      }
    }
    this.splashData.length = alive;
    this.splashPts.geometry.setDrawRange(0, alive);
    sp.needsUpdate = true;

    // ------- 雨 -------
    if (this.rain.visible) {
      const rp = this.rain.geometry.attributes.position;
      for (let i = 0; i < this.rainData.length; i++) {
        const d = this.rainData[i];
        d.y -= 22 * dt;
        d.x += 3.5 * dt;
        if (d.y < 0) { d.y = 24 + Math.random() * 4; d.x = (Math.random() - 0.5) * 50; d.z = (Math.random() - 0.5) * 50 - 10; }
        rp.setXYZ(i * 2, d.x, d.y, d.z);
        rp.setXYZ(i * 2 + 1, d.x - 0.06, d.y - 0.42, d.z);
      }
      rp.needsUpdate = true;
    }

    // ------- 云飘动 -------
    this.clouds.forEach(c => {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 220) c.position.x = -220;
    });

    this.renderer.render(this.scene, this.camera);
  },
};
