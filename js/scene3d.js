// ===================== 第一人称 3D 场景（渲染层） =====================
// 负责：渲染器/多 pass 水面、光照与环境贴图、第一人称鱼竿/渔轮/鱼线/浮漂、
//       鱼（上钩的鱼、接近鱼饵的鱼、背景鱼群）、水花粒子、钓获展示。
// 玩法状态由 Fishing 维护，这里每帧读取并呈现。
'use strict';

const Scene3D = {
  renderer: null, scene: null, camera: null,
  camYaw: 0, camPitch: -0.1,
  EYE: new THREE.Vector3(0, 2.45, 0),
  cfg: null, locId: null,
  env: null, envT: 99, envTex: null, pmrem: null, envScene: null,
  viewW: 800, viewH: 500,

  init(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xbfd8ea, 150, 1400);
    this.scene = scene;

    const cam = new THREE.PerspectiveCamera(60, 1, 0.05, 3000);
    cam.rotation.order = 'YXZ';
    this.camera = cam;
    scene.add(cam);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3a4a30, 0.35);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);
    this.fill = new THREE.PointLight(0xfff4e0, 0, 4, 2); // 展示鱼时的补光
    cam.add(this.fill);
    this.fill.position.set(0.3, 0.4, 0.2);

    Sky.build(scene);
    Water.build(scene, r);
    // 环境贴图用的天空场景（共享材质）
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(Sky.mesh.geometry, Sky.mat));

    this.planeAbove = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.3);
    this.planeBelow = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.5);

    this.buildRod();
    this.buildLine();
    this.buildBobber();
    this.buildParticles();
    this.buildRain();
    this.buildMarker();
    this.ambient = [];
  },

  setLocation(id) {
    if (this.locId === id) return;
    this.locId = id;
    this.cfg = World.build(this.scene, id);
    Water.setLocation(this.cfg);
    this.EYE.set(0, this.cfg.eyeY, 0.15);
    this.camera.position.copy(this.EYE);
    this.scene.fog.near = this.cfg.fog[0]; this.scene.fog.far = this.cfg.fog[1];
    this.clearFish();
    this.spawnAmbient();
    this.envT = 99;
  },

  resize(w, h) {
    this.viewW = w; this.viewH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    Water.resize(w, h, this.renderer.getPixelRatio());
  },

  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.viewW, y: (-p.y * 0.5 + 0.5) * this.viewH, vis: p.z < 1 && p.z > -1, front: p.z < 1 };
  },

  heightAt(x, z) { return World.heightAt(x, z); },
  waveH(x, z, t = this.time || 0) { return Water.waveH(x, z, t); },
  dirOf(yaw) { return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); },
  // 甲板尽头（钓手脚下水面的参考点）
  get dockEnd() { return new THREE.Vector3(0, 0, this.cfg ? this.cfg.deckEndZ : -1.4); },

  // =============== 鱼竿 ===============
  rodTexture(rod) {
    return U3.canvasTex(512, 16, (c, W, H) => {
      c.fillStyle = rod.color; c.fillRect(0, 0, W, H);
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.2)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (rod.bamboo) {
        for (let x = 30; x < W; x += 38 + Math.random() * 16) {
          c.fillStyle = 'rgba(70,45,20,0.75)'; c.fillRect(x, 0, 3, H);
          c.fillStyle = 'rgba(255,240,200,0.25)'; c.fillRect(x + 3, 0, 2, H);
        }
      }
      // 导环绑线
      this.GUIDE_U.forEach(u => {
        c.fillStyle = rod.wrap; c.fillRect(u * W - 5, 0, 10, H);
        c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(u * W - 5, 0, 1, H);
      });
      c.fillStyle = rod.wrap; c.fillRect(0, 0, 14, H);
    });
  },
  GUIDE_U: [0.16, 0.33, 0.47, 0.59, 0.7, 0.79, 0.87, 0.94],

  buildRod() {
    const R = this.rod = { rings: 30, seg: 8 };
    const group = new THREE.Group();
    this.camera.add(group);
    R.group = group;
    const n = R.rings * R.seg;
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < R.rings; i++) for (let j = 0; j < R.seg; j++) {
      uv[(i * R.seg + j) * 2] = i / (R.rings - 1);
      uv[(i * R.seg + j) * 2 + 1] = j / R.seg;
      if (i < R.rings - 1) {
        const a = i * R.seg + j, b = i * R.seg + (j + 1) % R.seg, c = a + R.seg, d = b + R.seg;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    R.geo = geo;
    R.mat = new THREE.MeshPhysicalMaterial({ roughness: 0.32, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    R.blank = new THREE.Mesh(geo, R.mat);
    R.blank.frustumCulled = false;
    group.add(R.blank);

    // 握把（软木）+ 轮座 + 尾塞
    const cork = U3.canvasTex(64, 128, (c, W, H) => {
      c.fillStyle = '#b08a5a'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 500; i++) {
        c.fillStyle = Math.random() < 0.5 ? 'rgba(90,60,30,0.45)' : 'rgba(230,200,150,0.35)';
        c.beginPath(); c.arc(Math.random() * W, Math.random() * H, Math.random() * 2.2, 0, 7); c.fill();
      }
    });
    R.handle = new THREE.Group();
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.34, 14), new THREE.MeshStandardMaterial({ map: cork, roughness: 0.95 }));
    grip.position.y = -0.2;
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.11, 14), new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.3, metalness: 0.8 }));
    seat.position.y = 0.02;
    const fgrip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.09, 14), new THREE.MeshStandardMaterial({ map: cork, roughness: 0.95 }));
    fgrip.position.y = 0.12;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.4 }));
    cap.position.y = -0.37; cap.scale.y = 0.6;
    R.handle.add(grip, seat, fgrip, cap);
    group.add(R.handle);

    // 纺车轮
    const reel = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#3a3e46', roughness: 0.28, metalness: 0.85 });
    R.accentMat = new THREE.MeshStandardMaterial({ color: '#c89a3a', roughness: 0.25, metalness: 0.9 });
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.03), metal); stem.position.set(0, -0.04, 0);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), metal); body.scale.set(0.8, 1, 1.25); body.position.set(0, -0.085, 0.012);
    const spool = new THREE.Group();
    const sp1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.035, 20), R.accentMat);
    sp1.rotation.x = Math.PI / 2;
    R.lineWound = new THREE.MeshStandardMaterial({ color: '#e8eef2', roughness: 0.6 });
    const sp2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0275, 0.0275, 0.024, 20), R.lineWound);
    sp2.rotation.x = Math.PI / 2; sp2.position.z = -0.002;
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.03, 16, 1, true), metal);
    rotor.rotation.x = Math.PI / 2; rotor.position.z = 0.03;
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0022, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: '#d8dde2', roughness: 0.2, metalness: 1 }));
    bail.rotation.y = Math.PI / 2; bail.position.z = 0.005;
    spool.add(sp1, sp2, rotor, bail);
    spool.position.set(0, -0.085, -0.035);
    R.spool = spool; R.bail = bail;
    const crank = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.07, 0.012), metal); arm.position.y = 0.03;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.028, 12), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5 }));
    knob.rotation.z = Math.PI / 2; knob.position.set(0.018, 0.064, 0);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 8), metal); shaft.rotation.z = Math.PI / 2; shaft.position.x = -0.02;
    crank.add(arm, knob, shaft);
    crank.position.set(0.045, -0.085, 0.012);
    R.crank = crank;
    reel.add(stem, body, spool, crank);
    reel.traverse(m => { if (m.isMesh) m.castShadow = true; });
    group.add(reel);
    R.reel = reel;

    // 导环
    R.guides = this.GUIDE_U.map((u, i) => {
      const s = 0.012 * (1 - u * 0.65);
      const g = new THREE.Mesh(new THREE.TorusGeometry(s, 0.0016, 6, 14), new THREE.MeshStandardMaterial({ color: '#b8c0c8', roughness: 0.2, metalness: 1 }));
      group.add(g);
      return g;
    });
    // 轮到竿尖的鱼线
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((this.GUIDE_U.length + 2) * 3), 3));
    R.inLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#eef4f8', transparent: true, opacity: 0.8 }));
    R.inLine.frustumCulled = false;
    group.add(R.inLine);

    R.tipWorld = new THREE.Vector3();
    R.curve = { B: new THREE.Vector3(), C1: new THREE.Vector3(), C2: new THREE.Vector3(), T: new THREE.Vector3() };
    R.pose = { yaw: 0.08, pitch: 0.5, bend: 0, bendDir: new THREE.Vector3(0, -1, 0) };
    R.crankAngle = 0; R.spoolAngle = 0;
    this.applyRodStyle();
  },

  applyRodStyle() {
    const rod = rodById(State.rod), line = lineById(State.line);
    if (this.rod.styleKey === rod.id + line.id) return;
    this.rod.styleKey = rod.id + line.id;
    if (this.rod.mat.map) this.rod.mat.map.dispose();
    this.rod.mat.map = this.rodTexture(rod);
    this.rod.mat.needsUpdate = true;
    this.rod.accentMat.color.set(rod.wrap);
    this.rod.lineWound.color.set(line.color);
    this.rod.inLine.material.color.set(line.color);
    if (this.lineMesh) this.lineMesh.material.color.set(line.color);
  },

  bez(c, u, out) {
    const a = 1 - u;
    return out.set(0, 0, 0)
      .addScaledVector(c.B, a * a * a).addScaledVector(c.C1, 3 * a * a * u)
      .addScaledVector(c.C2, 3 * a * u * u).addScaledVector(c.T, u * u * u);
  },

  // 根据姿态(yaw/pitch/弯曲) 更新竿形。坐标系：相机空间
  updateRod(dt, lineTargetWorld, bend) {
    const R = this.rod, P = R.pose;
    const L = 2.55;
    const B = R.curve.B.set(0.27, -0.46, -0.28);
    const cp = Math.cos(P.pitch);
    const D = new THREE.Vector3(Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp).normalize();
    const T0 = B.clone().addScaledVector(D, L);
    // 弯曲方向：朝鱼线拉力方向
    let pull = new THREE.Vector3(0, -1, 0);
    if (lineTargetWorld) {
      const tl = this.camera.worldToLocal(lineTargetWorld.clone());
      pull = tl.sub(T0).normalize();
    }
    const k = U3.clamp(bend, 0, 1.2);
    const perp = pull.clone().addScaledVector(D, -pull.dot(D));
    const T = T0.clone().addScaledVector(perp, L * 0.42 * k).addScaledVector(D, -L * 0.12 * k * k);
    R.curve.C1.copy(B).addScaledVector(D, L * 0.38);
    R.curve.C2.copy(B).addScaledVector(D, L * 0.72).addScaledVector(perp, L * 0.1 * k);
    R.curve.T.copy(T);

    // 竿身顶点
    const pos = R.geo.attributes.position;
    const p = new THREE.Vector3(), p2 = new THREE.Vector3(), tan = new THREE.Vector3();
    const n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < R.rings; i++) {
      const u = i / (R.rings - 1);
      this.bez(R.curve, u, p);
      this.bez(R.curve, Math.min(1, u + 0.01), p2);
      tan.copy(p2).sub(p);
      if (u >= 1) { this.bez(R.curve, 0.99, p2); tan.copy(p).sub(p2); }
      tan.normalize();
      n1.crossVectors(tan, up).normalize();
      n2.crossVectors(n1, tan).normalize();
      const rad = U3.lerp(0.0125, 0.0022, Math.pow(u, 0.8));
      for (let j = 0; j < R.seg; j++) {
        const th = j / R.seg * Math.PI * 2;
        const cx = Math.cos(th) * rad, cy = Math.sin(th) * rad;
        pos.setXYZ(i * R.seg + j, p.x + n1.x * cx + n2.x * cy, p.y + n1.y * cx + n2.y * cy, p.z + n1.z * cx + n2.z * cy);
      }
    }
    pos.needsUpdate = true;
    R.geo.computeVertexNormals();

    // 握把/轮座沿竿轴
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), D);
    R.handle.position.copy(B); R.handle.quaternion.copy(q);
    // 渔轮坐标系：-Z 沿竿向前，Y 为竿的上方
    const right = new THREE.Vector3().crossVectors(D, up).normalize();
    const upR = new THREE.Vector3().crossVectors(right, D).normalize();
    const m = new THREE.Matrix4().makeBasis(right, upR, D.clone().negate());
    R.reel.quaternion.setFromRotationMatrix(m);
    R.reel.position.copy(B).addScaledVector(D, 0.02);
    R.crank.rotation.x = R.crankAngle;
    R.spool.rotation.z = R.spoolAngle;

    // 导环 & 竿内鱼线
    const lp = R.inLine.geometry.attributes.position;
    const spoolW = new THREE.Vector3(0, -0.085, -0.06).applyMatrix4(new THREE.Matrix4().compose(R.reel.position, R.reel.quaternion, new THREE.Vector3(1, 1, 1)));
    lp.setXYZ(0, spoolW.x, spoolW.y, spoolW.z);
    this.GUIDE_U.forEach((u, i) => {
      this.bez(R.curve, u, p);
      this.bez(R.curve, Math.min(1, u + 0.01), p2);
      tan.copy(p2).sub(p).normalize();
      n1.crossVectors(tan, up).normalize();
      n2.crossVectors(n1, tan).normalize();
      const s = 0.012 * (1 - u * 0.65) + 0.004;
      const g = R.guides[i];
      g.position.copy(p).addScaledVector(n2, -s);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      lp.setXYZ(i + 1, g.position.x, g.position.y, g.position.z);
    });
    lp.setXYZ(this.GUIDE_U.length + 1, T.x, T.y, T.z);
    lp.needsUpdate = true;

    R.tipWorld.copy(T);
    this.camera.localToWorld(R.tipWorld);
  },

  // =============== 鱼线 / 浮漂 ===============
  buildLine() {
    const N = 40;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.lineMesh = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#e8eef2', transparent: true, opacity: 0.75 }));
    this.lineMesh.frustumCulled = false;
    this.lineN = N;
    this.scene.add(this.lineMesh);
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.leader = new THREE.Line(g2, new THREE.LineBasicMaterial({ color: '#dfe8ee', transparent: true, opacity: 0.6 }));
    this.leader.frustumCulled = false;
    this.scene.add(this.leader);
  },

  setLine(end, sag, danger) {
    const pa = this.lineMesh.geometry.attributes.position;
    const s = this.rod.tipWorld;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.lineN; i++) {
      const u = i / (this.lineN - 1);
      tmp.copy(s).lerp(end, u);
      tmp.y -= Math.sin(u * Math.PI) * sag * (1 - u * 0.3);
      pa.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    pa.needsUpdate = true;
    const lc = lineById(State.line).color;
    this.lineMesh.material.color.set(danger ? '#ff6a5a' : lc);
    this.lineMesh.material.opacity = danger ? 0.95 : 0.75;
    this.lineMesh.visible = true;
  },

  buildBobber() {
    const pts = [];
    const prof = [[0, -0.2], [0.012, -0.19], [0.03, -0.14], [0.048, -0.06], [0.052, 0.0], [0.046, 0.05], [0.03, 0.1], [0.012, 0.13], [0.006, 0.14]];
    prof.forEach(([x, y]) => pts.push(new THREE.Vector2(x, y)));
    const body = new THREE.LatheGeometry(pts, 20);
    const p = body.attributes.position, cols = [];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const c = new THREE.Color(y > 0.005 ? '#e8402e' : y > -0.005 ? '#222' : '#f4f0e6');
      cols.push(c.r, c.g, c.b);
    }
    body.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const grp = new THREE.Group();
    const bm = new THREE.Mesh(body, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, clearcoat: 1 }));
    grp.add(bm);
    // 漂尾（分段色环，夜光）
    this.bobberGlow = [];
    const segs = ['#ff3a1a', '#ffd21a', '#ff3a1a', '#20d060', '#ff3a1a'];
    segs.forEach((c, i) => {
      const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.15, roughness: 0.4 });
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 8), m);
      s.position.y = 0.17 + i * 0.06;
      grp.add(s);
      this.bobberGlow.push(m);
    });
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), this.bobberGlow[0]);
    tip.position.y = 0.17 + segs.length * 0.06 - 0.03;
    grp.add(tip);
    grp.traverse(m => { if (m.isMesh) m.castShadow = true; });
    // 沉底铅坠和钩
    this.sinker = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: '#555a60', roughness: 0.5, metalness: 0.6 }));
    this.scene.add(this.sinker);
    grp.visible = false;
    this.bobber = grp;
    this.scene.add(grp);
  },

  // 抛竿蓄力落点提示（仅空格蓄力模式）
  buildMarker() {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.renderOrder = 5;
    this.marker = m;
    this.scene.add(m);
  },

  // =============== 粒子（水花/水滴） ===============
  buildParticles() {
    const MAX = 700;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX), 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(MAX), 1));
    const tex = U3.canvasTex(64, 64, (c) => {
      const gr = c.createRadialGradient(28, 26, 2, 32, 32, 30);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(235,245,255,0.85)'); gr.addColorStop(1, 'rgba(220,235,250,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uColor: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 300 } },
      vertexShader: `
        attribute float size; attribute float alpha;
        uniform float uScale;
        varying float vA;
        void main() {
          vA = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; uniform vec3 uColor;
        varying float vA;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(uColor * t.rgb, t.a * vA);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.parts = new THREE.Points(g, mat);
    this.parts.frustumCulled = false;
    this.parts.renderOrder = 6;
    this.partData = [];
    this.partMax = MAX;
    this.scene.add(this.parts);
  },

  emit(x, y, z, n, spd, up, size = 0.06, spread = 0.2) {
    for (let i = 0; i < n && this.partData.length < this.partMax; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random() * 0.7);
      this.partData.push({
        x: x + Math.cos(a) * spread * Math.random(), y, z: z + Math.sin(a) * spread * Math.random(),
        vx: Math.cos(a) * v, vy: up * (0.5 + Math.random() * 0.8), vz: Math.sin(a) * v,
        s: size * (0.5 + Math.random()), life: 0, max: 0.6 + Math.random() * 0.8,
      });
    }
  },

  splash(x, z, scale = 1) {
    const y = this.waveH(x, z);
    this.emit(x, y + 0.05, z, Math.round(26 * scale), 1.4 * Math.min(2, scale), 2.8 * Math.min(1.8, scale), 0.07 * Math.min(2.2, scale), 0.25 * scale);
    this.emit(x, y + 0.05, z, Math.round(8 * scale), 0.6, 1.2, 0.18 * Math.min(2.5, scale), 0.3 * scale); // 水雾
    Water.addRipple(x, z, Math.min(2.2, 0.9 * scale + 0.3), this.time);
    this.scareAmbient(x, z, 6 * scale);
  },
  ripple(x, z, s = 0.6) { Water.addRipple(x, z, s, this.time); },

  updateParticles(dt) {
    const pa = this.parts.geometry.attributes;
    let alive = 0;
    for (let i = 0; i < this.partData.length; i++) {
      const d = this.partData[i];
      d.life += dt;
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.life < d.max && d.y > -0.1) {
        pa.position.setXYZ(alive, d.x, d.y, d.z);
        pa.size.setX(alive, d.s);
        pa.alpha.setX(alive, 0.9 * (1 - d.life / d.max));
        this.partData[alive++] = d;
      }
    }
    this.partData.length = alive;
    this.parts.geometry.setDrawRange(0, alive);
    pa.position.needsUpdate = true; pa.size.needsUpdate = true; pa.alpha.needsUpdate = true;
    this.parts.material.uniforms.uScale.value = this.viewH * 0.9;
    const e = this.env;
    if (e) this.parts.material.uniforms.uColor.value.setScalar(0.25 + 0.8 * e.dayF);
  },

  buildRain() {
    const N = 1400;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    this.rainData = [];
    for (let i = 0; i < N; i++) this.rainData.push({ x: (Math.random() - 0.5) * 60, y: Math.random() * 22, z: -Math.random() * 60 + 8 });
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#b8cadb', transparent: true, opacity: 0.32 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  },

  // =============== 鱼 ===============
  makeJunk(junk) {
    const g = new THREE.Group();
    const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8 }, o));
    if (junk.id === 'boot') {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.32, 12), M('#3e2e22'));
      leg.position.y = 0.16;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.3), M('#3e2e22'));
      foot.position.set(0, 0.05, 0.08);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.03, 0.32), M('#1a1410'));
      sole.position.set(0, 0, 0.08);
      g.add(leg, foot, sole);
      g.rotation.z = 0.4;
    } else if (junk.id === 'can') {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 16), M('#c62828', { metalness: 0.6, roughness: 0.35 }));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.01, 16), M('#b0b8c0', { metalness: 0.9, roughness: 0.3 }));
      top.position.y = 0.085;
      g.add(c, top);
    } else if (junk.id === 'weed') {
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07 + Math.random() * 0.06, 1), M('#3a6a2a'));
        b.position.set((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.2);
        g.add(b);
      }
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.4, 4), M('#4a7a30'));
        s.position.set((Math.random() - 0.5) * 0.15, -0.2, (Math.random() - 0.5) * 0.15);
        s.rotation.z = (Math.random() - 0.5) * 0.8;
        g.add(s);
      }
    } else {
      const wood = M('#6a4424'), gold = M('#e0b040', { metalness: 0.9, roughness: 0.3 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.24), wood); b.position.y = 0.1;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.36, 12, 1, false, 0, Math.PI), wood);
      lid.rotation.z = Math.PI / 2; lid.position.y = 0.2;
      const band1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.21, 0.25), gold); band1.position.set(-0.12, 0.1, 0);
      const band2 = band1.clone(); band2.position.x = 0.12;
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.02), gold); lock.position.set(0, 0.17, 0.125);
      g.add(b, lid, band1, band2, lock);
    }
    g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return g;
  },

  // 创建一个在场景中的鱼演员
  makeActor(f) {
    const root = new THREE.Group();
    let inst = null, len;
    if (f.junk) {
      root.add(this.makeJunk(f.junk));
      len = 0.4;
    } else {
      inst = FishModel.create(f.sp);
      len = fishLength(f.sp, f.weight);
      inst.group.scale.setScalar(len);
      root.add(inst.group);
    }
    this.scene.add(root);
    return { root, inst, len, f, heading: 0, pitch: 0, roll: 0 };
  },
  removeActor(a) {
    if (!a) return;
    this.scene.remove(a.root);
    if (a.inst) a.inst.dispose();
  },
  clearFish() {
    this.removeActor(this.hooked); this.hooked = null;
    this.removeActor(this.suitor); this.suitor = null;
    this.ambient.forEach(a => this.removeActor(a)); this.ambient = [];
    this.endShowcase();
  },

  // 背景鱼群：钓点里的普通鱼在栈桥附近游弋
  spawnAmbient() {
    const pool = FISH_DB.filter(f => f.loc === this.locId && f.rarity !== 'legend');
    const r = U3.rng(Date.now() & 0xffff);
    for (let i = 0; i < 9; i++) {
      const sp = pool[Math.floor(r() * pool.length)];
      const w = sp.minW + (sp.maxW - sp.minW) * r() * 0.5;
      const a = this.makeActor({ sp, weight: w });
      const pos = this.randomWaterPoint(r, 4, 26);
      Object.assign(a, { x: pos.x, z: pos.z, y: -1, heading: r() * 6.28, speed: 0.4, tgt: null, tT: 0, flee: 0 });
      this.ambient.push(a);
    }
  },
  randomWaterPoint(r, dmin, dmax) {
    for (let k = 0; k < 40; k++) {
      const ang = (r() - 0.5) * 2.4, d = dmin + r() * (dmax - dmin);
      const x = -Math.sin(ang) * d, z = this.cfg.deckEndZ - Math.cos(ang) * d;
      if (this.heightAt(x, z) < -1.2) return { x, z };
    }
    return { x: 0, z: -12 };
  },
  scareAmbient(x, z, rad) {
    this.ambient.forEach(a => {
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < rad) { a.flee = 1.5; a.heading = Math.atan2(a.x - x, a.z - z); }
    });
  },
  updateAmbient(dt, t) {
    const r = Math.random;
    this.ambient.forEach(a => {
      a.tT -= dt;
      if (!a.tgt || a.tT <= 0) { a.tgt = this.randomWaterPoint(r, 3, 30); a.tT = 5 + r() * 8; }
      let want = Math.atan2(a.tgt.x - a.x, a.tgt.z - a.z);
      let dh = ((want - a.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (a.flee > 0) { a.flee -= dt; dh = 0; }
      const turn = U3.clamp(dh, -1, 1);
      a.heading += turn * dt * 1.2;
      const spd = a.flee > 0 ? 3.5 : 0.35 + Math.sin(t * 0.3 + a.x) * 0.15;
      const nx = a.x + Math.sin(a.heading) * spd * dt, nz = a.z + Math.cos(a.heading) * spd * dt;
      const h = this.heightAt(nx, nz);
      if (h < -0.9 && Math.hypot(nx, nz - this.cfg.deckEndZ) > 1.8) { a.x = nx; a.z = nz; }
      else { a.heading += Math.PI * 0.7; a.tgt = null; }
      const bottom = this.heightAt(a.x, a.z);
      const ty = Math.max(bottom + 0.35, -0.7 - (Math.sin(t * 0.2 + a.z) * 0.5 + 0.5) * 1.6);
      a.y += (ty - a.y) * Math.min(1, dt);
      a.root.position.set(a.x, a.y, a.z);
      a.root.rotation.set(0, a.heading, 0);
      a.inst.tick(dt, a.flee > 0 ? 1.6 : 0.35, -turn * 0.6);
    });
  },

  // =============== 钓获展示 ===============
  startShowcase(f) {
    this.endShowcase();
    const a = this.hooked || this.makeActor(f);
    this.hooked = null;
    this.scene.remove(a.root);
    this.camera.add(a.root);
    const L = a.len;
    const dist = Math.max(0.55, L * 1.05 + 0.25);
    a.root.position.set(-dist * 0.28 * Math.min(1.6, Scene3D.camera.aspect), -0.02, -dist);
    a.root.rotation.set(0, 0, 0);
    a.baseDist = dist;
    a.t = 0;
    this.show = a;
    this.fill.intensity = 1.2;
    this.fill.distance = dist * 3;
  },
  endShowcase(mode) {
    if (!this.show) return;
    const a = this.show;
    this.camera.remove(a.root);
    if (mode === 'release' || mode === 'sell') {
      // 放回水里：在脚下溅起水花
      const p = this.dockEnd.clone(); p.z -= 1.2;
      this.splash(p.x, p.z, Math.min(2.2, 0.6 + a.len));
    }
    if (a.inst) a.inst.dispose();
    this.show = null;
    this.fill.intensity = 0;
  },
  updateShowcase(dt, t) {
    const a = this.show;
    if (!a) return;
    a.t += dt;
    const flop = Math.max(0, Math.sin(a.t * 1.3)) > 0.93 ? 1.8 : 0.25;
    if (a.inst) {
      a.inst.tick(dt, flop, Math.sin(a.t * 2.1) * 0.3);
      a.inst.group.rotation.set(0.1 + Math.sin(a.t * 0.9) * 0.08, -Math.PI / 2 + Math.sin(a.t * 0.5) * 0.4, Math.sin(a.t * 0.7) * 0.06);
      // 水滴
      if (Math.random() < dt * 14) {
        const w = new THREE.Vector3((Math.random() - 0.5) * a.len * 0.8, -a.len * 0.1, 0);
        a.root.localToWorld(w);
        this.emit(w.x, w.y, w.z, 1, 0.05, -0.2, 0.012, 0.01);
      }
    } else {
      a.root.rotation.y = Math.sin(a.t * 0.6) * 0.6;
    }
    const intro = Math.min(1, a.t / 0.5);
    a.root.position.y = -0.02 + (1 - intro) * -0.5 + Math.sin(a.t * 1.7) * 0.01;
  },

  // =============== 环境 ===============
  updateEnvironment(t, dt) {
    const env = Sky.computeEnv(State.gameHour, State.weather);
    this.env = env;
    Sky.update(env, t);
    const fog = this.scene.fog;
    fog.color.copy(env.horizon).lerp(env.top, 0.15);
    const rainy = env.rain > 0;
    fog.near = this.cfg.fog[0] * (rainy ? 0.35 : env.cover > 0.6 ? 0.7 : 1);
    fog.far = this.cfg.fog[1] * (rainy ? 0.4 : env.cover > 0.6 ? 0.75 : 1);
    const chop = rainy ? 1.7 : env.cover > 0.6 ? 1.25 : 1;
    Water.update(t, env, chop, fog);
    World.update(t, env, (x, z, tt) => Water.waveH(x, z, tt));

    const night = env.night > 0.55;
    const dir = night ? env.moonDir : env.sunDir;
    const sunUp = Math.max(0, dir.y);
    this.sun.position.copy(dir).multiplyScalar(160).add(new THREE.Vector3(0, 0, -14));
    this.sun.target.position.set(0, 0, -14);
    this.sun.color.copy(night ? new THREE.Color('#9fb2e0') : env.sun);
    this.sun.intensity = night ? 0.28 * (1 - env.cover * 0.7) : (0.2 + 2.6 * Math.max(0, env.sunInt)) * U3.smooth(0, 0.12, sunUp) * (1 - env.cover * 0.55);
    this.hemi.color.copy(env.top).lerp(env.horizon, 0.5);
    this.hemi.groundColor.set(this.locId === 'sea' ? '#3a4a5a' : '#2f3a26');
    this.hemi.intensity = 0.12 + 0.35 * env.dayF;
    this.renderer.toneMappingExposure = 0.95 + env.night * 0.5;
    this.bobberGlow.forEach(m => { m.emissiveIntensity = 0.12 + env.night * 1.6; });

    // 环境贴图（定期由天空生成）
    this.envT += dt;
    if (this.envT > 2.5) {
      this.envT = 0;
      const tm = this.renderer.toneMapping;
      this.renderer.toneMapping = THREE.NoToneMapping;
      const rt = this.pmrem.fromScene(this.envScene, 0.02);
      this.renderer.toneMapping = tm;
      if (this.envTex) this.envTex.dispose();
      this.envTex = rt;
      this.scene.environment = rt.texture;
    }

    // 雨
    this.rain.visible = rainy;
    if (rainy) {
      const rp = this.rain.geometry.attributes.position;
      for (let i = 0; i < this.rainData.length; i++) {
        const d = this.rainData[i];
        d.y -= 24 * dt; d.x += 3 * dt;
        if (d.y < 0) {
          d.y = 18 + Math.random() * 6; d.x = (Math.random() - 0.5) * 60; d.z = -Math.random() * 60 + 8;
        }
        rp.setXYZ(i * 2, d.x, d.y, d.z);
        rp.setXYZ(i * 2 + 1, d.x - 0.05, d.y - 0.45, d.z);
      }
      rp.needsUpdate = true;
      this.rain.material.color.copy(env.horizon).lerp(new THREE.Color(1, 1, 1), 0.4);
    }
  },

  // =============== 主渲染 ===============
  render(dt, t, F) {
    this.time = t;
    this.applyRodStyle();
    this.updateEnvironment(t, dt);
    this.updateCamera(dt, t, F);
    this.updateGameObjects(dt, t, F);
    this.updateAmbient(dt, t);
    this.updateShowcase(dt, t);
    this.updateParticles(dt);
    this.drawPasses();
  },

  updateCamera(dt, t, F) {
    const st = F.state;
    let ty = -F.aimX * 0.95, tp = -0.12 - F.aimY * 0.3;
    if (st === 'fight' || st === 'landing') {
      const f = F.fish;
      const dx = f.x - this.EYE.x, dz = f.z - this.EYE.z;
      const az = Math.atan2(-dx, -dz);
      const dist = Math.hypot(dx, dz);
      ty = az - F.aimX * 0.12;
      tp = -Math.atan2(this.EYE.y + 0.3, dist) * 0.85 - 0.04;
      if (st === 'landing') tp = -0.62;
    } else if (st === 'showcase') {
      ty = this.camYaw; tp = -0.08;
    } else if (st === 'windup' || st === 'casting') {
      ty = F.castYaw;
      tp = -0.08;
    }
    const k = Math.min(1, dt * (st === 'fight' ? 3.5 : 7));
    this.camYaw += (ty - this.camYaw) * k;
    this.camPitch += (tp - this.camPitch) * k;
    const cam = this.camera;
    cam.rotation.y = this.camYaw;
    cam.rotation.x = U3.clamp(this.camPitch, -0.9, 0.3);
    cam.rotation.z = st === 'fight' ? -F.rodSide * 0.03 : 0;
    const sh = F.shake || 0;
    cam.position.set(
      this.EYE.x + (Math.random() - 0.5) * sh * 0.012,
      this.EYE.y + Math.sin(t * 0.9) * 0.012 + (Math.random() - 0.5) * sh * 0.012,
      this.EYE.z + (Math.random() - 0.5) * sh * 0.008
    );
    cam.updateMatrixWorld();
  },

  // 根据玩法状态摆放鱼竿、鱼线、浮漂、鱼
  updateGameObjects(dt, t, F) {
    const R = this.rod, P = R.pose;
    const st = F.state;
    this.bobber.visible = false;
    this.sinker.visible = false;
    this.lineMesh.visible = false;
    this.leader.visible = false;
    this.marker.visible = false;
    let yaw = 0.06 + F.aimX * 0.05, pitch = 0.5, bend = 0.04;
    let lineTarget = null;
    const ease = (cur, tgt, k) => cur + (tgt - cur) * Math.min(1, dt * k);

    if (st === 'windup') {
      pitch = 0.5 + F.back * 1.55;
      yaw = 0.18 + F.back * 0.15;
      bend = 0.05 + F.back * 0.1;
      if (F.spaceMode) {
        const d = F.previewDist();
        const w = this.castPoint(F.castYaw, d);
        this.marker.visible = true;
        const s = 0.6 + d * 0.025;
        this.marker.scale.set(s, s, 1);
        this.marker.position.set(w.x, this.waveH(w.x, w.z) + 0.08, w.z);
        this.marker.material.opacity = 0.35 + Math.sin(t * 7) * 0.15;
      }
    } else if (st === 'casting') {
      const p = F.castT / F.castDur;
      const whip = Math.min(1, p * 5);
      pitch = U3.lerp(1.9, 0.18, Math.sin(whip * Math.PI / 2)) + (p > 0.2 ? U3.smooth(0.2, 1, p) * 0.2 : 0);
      bend = whip < 1 ? 0.5 * Math.sin(whip * Math.PI) : 0.05;
      yaw = 0.05;
      // 飞行中的浮漂
      const b = F.flightPos(this.rod.tipWorld);
      this.bobber.visible = true;
      this.bobber.position.copy(b);
      this.bobber.rotation.set(p * 8, 0, p * 5);
      this.bobber.scale.setScalar(1.6 + F.castDist * 0.02);
      lineTarget = b;
      this.setLine(b, 0.05 + p * 0.6, false);
    } else if (st === 'waiting' || st === 'bite' || st === 'retrieve') {
      const bx = F.bob.x, bz = F.bob.z;
      const wy = this.waveH(bx, bz);
      const dip = F.bobDip;
      this.bobber.visible = true;
      this.bobber.position.set(bx, wy - 0.03 + dip, bz);
      this.bobber.rotation.set(Math.sin(t * 1.3) * 0.08 + F.bobTilt.x, 0, Math.cos(t * 1.1) * 0.08 + F.bobTilt.z);
      this.bobber.scale.setScalar(1.6 + Math.hypot(bx, bz) * 0.02);
      const toB = new THREE.Vector3(bx, 0, bz).sub(this.EYE);
      const az = Math.atan2(-toB.x, -toB.z);
      yaw = U3.clamp(az - this.camYaw, -0.5, 0.5) * 0.8 + 0.05;
      pitch = st === 'retrieve' ? 0.35 : 0.42;
      bend = st === 'bite' ? 0.28 + Math.sin(t * 22) * 0.05 : 0.05 + (F.twitchT > 0 ? 0.2 : 0);
      if (F.strikeT > 0) { pitch += F.strikeT * 2.2; bend += F.strikeT; }
      lineTarget = this.bobber.position.clone().add(new THREE.Vector3(0, 0.2, 0));
      this.setLine(lineTarget, 0.25 + Math.hypot(bx, bz) * 0.02, false);
      // 子线 + 铅坠
      const hook = F.hookPos(this.bobber.position);
      this.sinker.visible = true;
      this.sinker.position.copy(hook);
      const lp = this.leader.geometry.attributes.position;
      lp.setXYZ(0, this.bobber.position.x, this.bobber.position.y - 0.25, this.bobber.position.z);
      lp.setXYZ(1, hook.x, hook.y, hook.z);
      lp.needsUpdate = true;
      this.leader.visible = true;
    } else if (st === 'fight' || st === 'landing') {
      const f = F.fish;
      const toF = new THREE.Vector3(f.x, 0, f.z).sub(this.EYE);
      const az = Math.atan2(-toF.x, -toF.z);
      yaw = U3.clamp(az - this.camYaw + F.rodSide * 0.75, -0.9, 0.9);
      pitch = 0.2 + F.rodLift * 0.95;
      bend = U3.clamp(F.tension / 95, 0, 1.1);
      if (st === 'landing') { pitch = 0.55 + F.liftP * 0.6; bend = 0.35 + F.liftP * 0.3; }
      const mouth = this.hookedMouth(f);
      lineTarget = mouth;
      const danger = F.tension > rodById(State.rod).safe;
      const sag = F.slack ? 0.8 + f.dist * 0.03 : Math.max(0.02, (1 - F.tension / 60)) * (0.3 + f.dist * 0.02);
      this.setLine(mouth, sag, danger);
    } else if (st === 'showcase' && this.show) {
      pitch = 0.95; yaw = 0.25; bend = 0.2;
      const m = new THREE.Vector3(0, 0, this.show.len * 0.5);
      if (this.show.inst) this.show.inst.group.localToWorld(m); else this.show.root.localToWorld(m.set(0, 0.2, 0));
      lineTarget = m;
      this.setLine(m, 0.02, false);
    }

    // 收线/放线时渔轮转动
    if (F.reeling) R.crankAngle += dt * 16;
    if (F.slipping) R.spoolAngle -= dt * 30;
    if (st === 'retrieve') R.crankAngle += dt * 14;
    R.bail.rotation.x = (st === 'windup' || st === 'casting') ? -1.2 : 0;

    P.yaw = ease(P.yaw, yaw, st === 'casting' ? 30 : 10);
    P.pitch = ease(P.pitch, pitch, st === 'casting' ? 26 : 9);
    P.bend = ease(P.bend, bend, 12);
    this.updateRod(dt, lineTarget, P.bend);

    this.updateFishActors(dt, t, F);
  },

  hookedMouth(f) {
    const a = this.hooked;
    if (a && a.inst) {
      const m = new THREE.Vector3(0, 0, 0.5);
      a.inst.group.localToWorld(m);
      return m;
    }
    return new THREE.Vector3(f.x, f.y + 0.1, f.z);
  },

  updateFishActors(dt, t, F) {
    const st = F.state;
    // 等待时游近鱼饵的鱼
    if ((st === 'waiting' || st === 'bite') && F.suitor && F.suitor.visible) {
      if (!this.suitor || this.suitor.f !== F.suitor.catchInfo) {
        this.removeActor(this.suitor);
        this.suitor = F.suitor.catchInfo.junk ? null : this.makeActor(F.suitor.catchInfo);
        if (this.suitor) this.suitor.f = F.suitor.catchInfo;
      }
      if (this.suitor) {
        const s = F.suitor;
        this.suitor.root.position.set(s.x, s.y, s.z);
        this.suitor.root.rotation.set(s.pitch || 0, s.heading, 0);
        this.suitor.inst.tick(dt, s.effort, s.turn);
      }
    } else if (this.suitor && st !== 'fight') {
      this.removeActor(this.suitor); this.suitor = null;
    }

    // 上钩的鱼
    if (st === 'fight' || st === 'landing') {
      const f = F.fish;
      if (!this.hooked || this.hooked.f !== f) {
        this.removeActor(this.hooked);
        if (this.suitor && this.suitor.f === f.catchInfo) { this.hooked = this.suitor; this.suitor = null; this.hooked.f = f; }
        else { this.hooked = this.makeActor(f); }
        this.hooked.f = f;
      }
      const a = this.hooked;
      a.root.position.set(f.x, f.y, f.z);
      a.root.rotation.set(f.pitch || 0, f.heading, f.roll || 0, 'YXZ');
      if (a.inst) a.inst.tick(dt, f.effort, f.turn);
      else a.root.rotation.x += dt * 2;
      // 水面迹象：近水面时拖出尾迹
      if (f.y > -0.6 && Math.random() < dt * (f.mode === 'run' ? 14 : 4)) this.ripple(f.x, f.z, f.mode === 'run' ? 1.0 : 0.5);
      if (f.y > -0.25 && f.mode === 'run' && Math.random() < dt * 20) this.emit(f.x, 0.05, f.z, 3, 1.2, 1.6, 0.06, 0.3);
    } else if (this.hooked && st !== 'showcase') {
      this.removeActor(this.hooked); this.hooked = null;
    }
  },

  castPoint(yaw, dist) {
    const d = this.dirOf(yaw).multiplyScalar(dist);
    return new THREE.Vector3(this.EYE.x + d.x, 0, this.EYE.z + d.z);
  },

  drawPasses() {
    const r = this.renderer, sc = this.scene, cam = this.camera;
    const tm = r.toneMapping;
    r.shadowMap.needsUpdate = true;
    // --- 反射 ---
    Water.mesh.visible = false;
    this.rod.group.visible = false;
    this.parts.visible = false;
    const lineVis = this.lineMesh.visible;
    this.lineMesh.visible = false;
    const showVis = this.show ? this.show.root.visible : false;
    if (this.show) this.show.root.visible = false;
    r.toneMapping = THREE.NoToneMapping;
    Water.updateReflCam(cam);
    r.clippingPlanes = [this.planeAbove];
    r.setRenderTarget(Water.reflRT);
    r.clear();
    r.render(sc, Water.reflCam);
    // --- 折射 ---
    this.lineMesh.visible = lineVis;
    Sky.mesh.visible = false;
    this.rain.visible = false;
    const fogC = sc.fog.color.clone();
    r.clippingPlanes = [this.planeBelow];
    r.setRenderTarget(Water.refrRT);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(sc, cam);
    // --- 主画面 ---
    r.clippingPlanes = [];
    r.toneMapping = tm;
    Sky.mesh.visible = true;
    this.rain.visible = !!(this.env && this.env.rain);
    Water.mesh.visible = true;
    this.rod.group.visible = true;
    this.parts.visible = true;
    if (this.show) this.show.root.visible = showVis || true;
    sc.fog.color.copy(fogC);
    r.setRenderTarget(null);
    r.render(sc, cam);
  },
};
