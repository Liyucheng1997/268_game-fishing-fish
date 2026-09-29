// ===================== 3D 鱼缸 =====================
// 玻璃缸 + 沙底焦散 + 水草/沉木/石头 + 气泡 + 光束，鱼使用与钓鱼场景相同的程序化模型。
'use strict';

const Aquarium = {
  canvas: null, renderer: null, scene: null, camera: null,
  W: 800, H: 500,
  swimmers: [], bubbles: [], tankGroup: null, level: -1,
  dims: { w: 3, h: 1.6, d: 1.2 },
  U: { uTime: { value: 0 } },
  mouse: { x: 0, y: 0, px: -1, py: -1 },
  hover: null,

  init(canvas) {
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a1512');
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);

    // 环境光照（柔和室内）
    const pm = new THREE.PMREMGenerator(r);
    const es = new THREE.Scene();
    const eg = new THREE.SphereGeometry(10, 32, 16);
    const cols = [];
    const p = eg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 10;
      const c = new THREE.Color('#3a2e26').lerp(new THREE.Color('#f4efe6'), U3.smooth(-0.4, 0.9, y));
      cols.push(c.r, c.g, c.b);
    }
    eg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    es.add(new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    this.scene.environment = pm.fromScene(es, 0.04).texture;
    pm.dispose();

    this.scene.add(new THREE.HemisphereLight('#fff4e6', '#3a2e24', 0.35));
    const room = new THREE.PointLight('#ffd9a8', 0.8, 18, 2);
    room.position.set(-3, 3.5, 4);
    this.scene.add(room);
    this.topLight = new THREE.SpotLight('#e8f6ff', 3.2, 8, 0.9, 0.6, 1.5);
    this.topLight.castShadow = true;
    this.topLight.shadow.mapSize.set(1024, 1024);
    this.topLight.shadow.bias = -0.0005;
    this.scene.add(this.topLight, this.topLight.target);

    this.buildRoom();

    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.px = e.clientX - rect.left; this.mouse.py = e.clientY - rect.top;
      this.mouse.x = (this.mouse.px / rect.width) * 2 - 1;
      this.mouse.y = (this.mouse.py / rect.height) * 2 - 1;
    });
    canvas.addEventListener('pointerleave', () => { this.mouse.px = -1; });
    canvas.addEventListener('pointerdown', () => {
      const hit = this.pick();
      if (hit) { Sound.click(); UI.showFishInfo(hit.tf); }
    });
    // 悬停标签 & 空缸提示
    const wrap = canvas.parentElement;
    this.label = document.createElement('div');
    this.label.className = 'tank-label';
    wrap.appendChild(this.label);
    this.empty = document.createElement('div');
    this.empty.className = 'tank-empty';
    this.empty.textContent = '鱼缸空空如也，去钓几条鱼回来吧！';
    wrap.appendChild(this.empty);

    this.resize();
    if (window.ResizeObserver) new ResizeObserver(() => { if (UI.tab === 'tank') this.resize(); }).observe(wrap);
  },

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.W = Math.max(320, rect.width);
    this.H = Math.max(300, rect.height);
    this.renderer.setSize(this.W, this.H, false);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
  },

  // ---------- 房间 ----------
  buildRoom() {
    const wallTex = U3.canvasTex(512, 512, (c, W, H) => {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#5a4a3e'); g.addColorStop(1, '#3a2f28');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,240,220,0.05)'; c.lineWidth = 2;
      for (let x = 0; x < W; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    }, { repeat: true });
    wallTex.repeat.set(4, 1);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }));
    wall.position.set(0, 3, -2.2);
    wall.receiveShadow = true;
    const floorTex = U3.canvasTex(512, 512, (c, W, H) => {
      c.fillStyle = '#6a4a32'; c.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 64) {
        c.fillStyle = `rgba(${60 + Math.random() * 40 | 0},${35 + Math.random() * 20 | 0},20,0.5)`;
        c.fillRect(0, y, W, 62);
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(0, y + 62, W, 2);
        for (let i = 0; i < 12; i++) {
          c.strokeStyle = 'rgba(30,18,8,0.2)'; c.beginPath();
          const yy = y + Math.random() * 60; c.moveTo(0, yy); c.bezierCurveTo(W * 0.3, yy + 4, W * 0.6, yy - 4, W, yy); c.stroke();
        }
      }
    }, { repeat: true });
    floorTex.repeat.set(4, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.0;
    floor.receiveShadow = true;
    this.scene.add(wall, floor);
    // 墙角绿植
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.5, 16), new THREE.MeshStandardMaterial({ color: '#c8b8a0', roughness: 0.7 }));
    pot.position.set(-4.2, -0.75, -1.2);
    const leaves = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const lg = new THREE.SphereGeometry(0.22, 8, 6);
      lg.scale(0.35, 0.08, 1);
      const m = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f6a2a').multiplyScalar(0.8 + Math.random() * 0.4), roughness: 0.6 }));
      const a = i / 14 * Math.PI * 2;
      m.position.set(Math.cos(a) * 0.2, 0.3 + Math.random() * 0.6, Math.sin(a) * 0.2);
      m.rotation.set(-0.6 - Math.random() * 0.5, -a + Math.PI / 2, 0);
      leaves.add(m);
    }
    leaves.position.copy(pot.position);
    this.scene.add(pot, leaves);
  },

  // ---------- 鱼缸本体（随容量升级变大） ----------
  buildTank() {
    if (this.tankGroup) {
      this.scene.remove(this.tankGroup);
      this.tankGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    const lvl = State.tankLevel;
    this.level = lvl;
    const w = [2.6, 3.2, 3.9, 4.8][lvl], h = 1.45 + lvl * 0.08, d = 1.1 + lvl * 0.12;
    this.dims = { w, h, d };
    const g = new THREE.Group();
    this.tankGroup = g;

    // 底柜
    const cab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 1.0, d + 0.3), new THREE.MeshStandardMaterial({ color: '#2a1f18', roughness: 0.45, metalness: 0.1 }));
    cab.position.y = -0.5;
    cab.receiveShadow = true;
    g.add(cab);
    const doorM = new THREE.MeshStandardMaterial({ color: '#35281f', roughness: 0.4 });
    for (let i = 0; i < 2; i++) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.1, 0.8, 0.02), doorM);
      door.position.set((i - 0.5) * (w / 2), -0.5, d / 2 + 0.16);
      g.add(door);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: '#c8a060', metalness: 0.9, roughness: 0.3 }));
      knob.position.set((i - 0.5) * 0.25, -0.45, d / 2 + 0.18);
      g.add(knob);
    }

    // 背景板（水下渐变）
    const bgTex = U3.canvasTex(256, 512, (c, W, H) => {
      const gr = c.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#2d7f96'); gr.addColorStop(0.5, '#155a72'); gr.addColorStop(1, '#0b3346');
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) {
        c.fillStyle = `rgba(20,60,50,${Math.random() * 0.25})`;
        const x = Math.random() * W;
        c.beginPath(); c.moveTo(x, H); c.quadraticCurveTo(x + (Math.random() - 0.5) * 60, H * 0.6, x + (Math.random() - 0.5) * 40, H * (0.4 + Math.random() * 0.4)); c.lineTo(x + 8, H); c.fill();
      }
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: bgTex }));
    back.position.set(0, h / 2, -d / 2 + 0.005);
    g.add(back);
    [-1, 1].forEach(s => {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(d, h), new THREE.MeshBasicMaterial({ map: bgTex, color: '#8ab' }));
      side.position.set(s * (w / 2 - 0.005), h / 2, 0);
      side.rotation.y = -s * Math.PI / 2;
      g.add(side);
    });

    // 沙底（带焦散）
    const sandTex = U3.canvasTex(256, 256, (c, W, H) => {
      c.fillStyle = '#a8946c'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 6000; i++) {
        const v = 150 + Math.random() * 90;
        c.fillStyle = `rgba(${v | 0},${v * 0.9 | 0},${v * 0.7 | 0},0.6)`;
        c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
    }, { repeat: true });
    sandTex.repeat.set(w, d);
    const sg = new THREE.PlaneGeometry(w - 0.01, d - 0.01, 60, 24);
    sg.rotateX(-Math.PI / 2);
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), z = sp.getZ(i);
      sp.setY(i, 0.08 + U3.fbm(x * 1.2, z * 1.2, 3, 5) * 0.05 + (-z / d + 0.5) * 0.1);
    }
    sg.computeVertexNormals();
    const sandM = this.causticMat(new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95 }));
    const sand = new THREE.Mesh(sg, sandM);
    sand.receiveShadow = true;
    g.add(sand);

    // 石头 & 沉木
    const rockM = this.causticMat(new THREE.MeshStandardMaterial({ color: '#8a8278', roughness: 0.85, flatShading: true }));
    const r = U3.rng(7 + lvl);
    for (let i = 0; i < 5 + lvl * 2; i++) {
      const rg = new THREE.IcosahedronGeometry(0.1 + r() * 0.16, 1);
      U3.jitter(rg, 0.3, 4, i);
      rg.scale(1.3, 0.7, 1);
      const m = new THREE.Mesh(rg, rockM);
      m.position.set((r() - 0.5) * (w - 0.4), 0.12, (r() - 0.5) * (d - 0.35) - 0.1);
      m.rotation.y = r() * 6;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }
    const woodM = this.causticMat(new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.9 }));
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-w * 0.35, 0.1, -d * 0.2), new THREE.Vector3(-w * 0.15, 0.3, -d * 0.25),
      new THREE.Vector3(0, 0.55, -d * 0.3), new THREE.Vector3(w * 0.08, 0.75, -d * 0.35),
    ]);
    const wood = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.05, 7), woodM);
    const branch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-w * 0.15, 0.3, -d * 0.25), new THREE.Vector3(-w * 0.22, 0.55, -d * 0.18), new THREE.Vector3(-w * 0.2, 0.8, -d * 0.1),
    ]), 12, 0.025, 6), woodM);
    wood.castShadow = true; branch.castShadow = true;
    g.add(wood, branch);

    // 水草：苦草（长带）+ 皇冠草（宽叶）
    const blade = [];
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      blade.push(new THREE.Vector2(0.018 * (1 - t * 0.7), t));
    }
    const bladeG = new THREE.PlaneGeometry(0.035, 1, 1, 8);
    bladeG.translate(0, 0.5, 0);
    const plantM = new THREE.MeshStandardMaterial({ color: '#3f8a3a', roughness: 0.6, side: THREE.DoubleSide });
    this.swayPatch(plantM, 0.12);
    const list = [];
    [[-0.42, -0.3], [0.38, -0.32], [0.05, -0.36], [-0.2, -0.33], [0.46, 0.1]].forEach(([fx, fz], ci) => {
      const n = 14 + Math.floor(r() * 10);
      for (let i = 0; i < n; i++) {
        list.push({ x: fx * w + (r() - 0.5) * 0.35, z: fz * d + (r() - 0.5) * 0.2, h: (0.35 + r() * 0.45) * h, ry: r() * 6, lean: (r() - 0.5) * 0.3, c: 0.7 + r() * 0.5 });
      }
    });
    const blades = new THREE.InstancedMesh(bladeG, plantM, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    list.forEach((b, i) => {
      q.setFromEuler(new THREE.Euler(b.lean, b.ry, b.lean * 0.5));
      m4.compose(new THREE.Vector3(b.x, 0.1, b.z), q, new THREE.Vector3(1, b.h, 1));
      blades.setMatrixAt(i, m4);
      blades.setColorAt(i, c.setRGB(b.c * 0.8, b.c, b.c * 0.7));
    });
    blades.castShadow = true;
    g.add(blades);
    // 宽叶水草
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.07, 0.2, 0, 0.42); leafShape.quadraticCurveTo(-0.07, 0.2, 0, 0);
    const leafG = new THREE.ShapeGeometry(leafShape, 8);
    const leafM = new THREE.MeshStandardMaterial({ color: '#4a9a3a', roughness: 0.55, side: THREE.DoubleSide });
    this.swayPatch(leafM, 0.05);
    [[w * 0.3, -d * 0.1], [-w * 0.38, d * 0.05]].forEach(([x, z]) => {
      const n = 12;
      const im = new THREE.InstancedMesh(leafG, leafM, n);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        q.setFromEuler(new THREE.Euler(-0.3 - r() * 0.5, a, 0, 'YXZ'));
        m4.compose(new THREE.Vector3(x, 0.12, z), q, new THREE.Vector3(1, 0.9 + r() * 0.6, 1));
        im.setMatrixAt(i, m4);
        im.setColorAt(i, c.setRGB(0.75 + r() * 0.3, 0.9 + r() * 0.2, 0.7));
      }
      im.castShadow = true;
      g.add(im);
    });
    // 水藻球
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 2), new THREE.MeshStandardMaterial({ color: '#2e5a24', roughness: 1 }));
      U3.jitter(b.geometry, 0.15, 30, i);
      b.position.set((r() - 0.5) * w * 0.6, 0.15, d * 0.3 - r() * 0.2);
      g.add(b);
    }

    // 水面（从下往上看的波光）
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 1), new THREE.MeshStandardMaterial({
      color: '#bfe8f0', roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55,
      normalMap: Water.mat.uniforms.uNormal.value, normalScale: new THREE.Vector2(1.2, 1.2), side: THREE.DoubleSide, depthWrite: false,
    }));
    surf.rotation.x = -Math.PI / 2;
    surf.position.y = h - 0.1;
    this.surface = surf;
    g.add(surf);

    // 光束
    const rayTex = U3.canvasTex(64, 256, (cc, W, H) => {
      const gr = cc.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      cc.fillStyle = gr; cc.fillRect(0, 0, W, H);
      const gx = cc.createLinearGradient(0, 0, W, 0);
      gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
      cc.globalCompositeOperation = 'destination-out'; cc.fillStyle = gx; cc.fillRect(0, 0, W, H);
    });
    this.rays = [];
    for (let i = 0; i < 5; i++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.25 + r() * 0.3, h * 1.1), new THREE.MeshBasicMaterial({
        map: rayTex, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, color: '#cfefff',
      }));
      ray.position.set((i / 4 - 0.5) * w * 0.8, h * 0.45, -d * 0.1 + (r() - 0.5) * 0.3);
      ray.rotation.z = 0.25;
      ray.userData.ph = r() * 6;
      g.add(ray);
      this.rays.push(ray);
    }

    // 玻璃 + 边框
    const glassM = new THREE.MeshPhysicalMaterial({ color: '#dff4f6', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 1.5, clearcoat: 1, depthWrite: false });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassM);
    front.position.set(0, h / 2, d / 2);
    front.renderOrder = 10;
    g.add(front);
    const trimM = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4, metalness: 0.5 });
    const T = 0.035;
    [[w + T, T, T, 0, h, d / 2], [w + T, T, T, 0, 0, d / 2], [w + T, T, T, 0, h, -d / 2], [T, h, T, -w / 2, h / 2, d / 2], [T, h, T, w / 2, h / 2, d / 2],
     [T, T, d, -w / 2, h, 0], [T, T, d, w / 2, h, 0]].forEach(([a, b, cc, x, y, z]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, cc), trimM);
      m.position.set(x, y, z);
      g.add(m);
    });
    // 顶灯
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.05, 0.25), new THREE.MeshStandardMaterial({ color: '#222', emissive: '#bfefff', emissiveIntensity: 0.4 }));
    lamp.position.set(0, h + 0.05, 0);
    g.add(lamp);
    this.topLight.position.set(0, h + 1.2, 0.2);
    this.topLight.target.position.set(0, 0, 0);
    this.topLight.distance = h + 4;

    // 气泡
    this.bubbleSrc = new THREE.Vector3(w / 2 - 0.25, 0.12, -d / 2 + 0.2);
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12), new THREE.MeshStandardMaterial({ color: '#555', roughness: 1 }));
    stone.position.copy(this.bubbleSrc);
    g.add(stone);
    const bubG = new THREE.SphereGeometry(1, 10, 8);
    this.bubbleMesh = new THREE.InstancedMesh(bubG, new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0, metalness: 0.1, transparent: true, opacity: 0.45, clearcoat: 1, envMapIntensity: 2 }), 90);
    this.bubbleMesh.count = 0;
    g.add(this.bubbleMesh);
    this.bubbles = [];

    this.scene.add(g);
  },

  causticMat(mat) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.U.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWP;\nuniform float uTime;\n${U3.GLSL.caustic}`)
        .replace('#include <fog_fragment>', `gl_FragColor.rgb += gl_FragColor.rgb * caustic(vWP.xz * 2.2, uTime * 0.7) * 0.9 * smoothstep(-0.2, 0.4, vWP.y);\n#include <fog_fragment>`);
    };
    mat.customProgramCacheKey = () => 'tankCaustic';
    return mat;
  },
  swayPatch(mat, k) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.U.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = 0.0;
          #ifdef USE_INSTANCING
            ph = instanceMatrix[3].x * 3.0 + instanceMatrix[3].z * 5.0;
          #endif
          float yy = max(position.y, 0.0);
          transformed.x += sin(uTime * 1.1 + ph + yy * 2.0) * ${k.toFixed(3)} * yy * yy;
          transformed.z += cos(uTime * 0.8 + ph) * ${(k * 0.5).toFixed(3)} * yy * yy;`);
    };
    mat.customProgramCacheKey = () => 'tankSway' + k;
  },

  // ---------- 鱼 ----------
  syncFish() {
    if (this.level !== State.tankLevel) this.buildTank();
    const existing = new Map(this.swimmers.map(s => [s.tf.uid, s]));
    const keep = new Set();
    this.swimmers = State.tank.map(tf => {
      keep.add(tf.uid);
      if (existing.has(tf.uid)) return existing.get(tf.uid);
      const sp = fishById(tf.spId);
      const inst = FishModel.create(sp);
      const real = fishLength(sp, tf.weight);
      const len = U3.clamp(0.14 + 0.42 * Math.sqrt(real), 0.18, this.dims.w * 0.24);
      inst.group.scale.setScalar(len);
      const root = new THREE.Group();
      root.add(inst.group);
      this.scene.add(root);
      const bottom = sp.style === 'diver' || sp.v.shape === 'flat';
      const s = {
        tf, sp, inst, root, len, bottom,
        pos: this.randPoint(bottom), vel: new THREE.Vector3(), tgt: null, tT: 0,
        yaw: Math.random() * 6.28, pitch: 0, speed: 0.12 + Math.random() * 0.1, pause: 0,
      };
      s.tgt = this.randPoint(bottom);
      root.position.copy(s.pos);
      return s;
    });
    existing.forEach((s, uid) => {
      if (!keep.has(uid)) { this.scene.remove(s.root); s.inst.dispose(); }
    });
    this.empty.style.display = State.tank.length ? 'none' : 'block';
  },

  randPoint(bottom) {
    const { w, h, d } = this.dims;
    const m = 0.3;
    return new THREE.Vector3(
      (Math.random() - 0.5) * (w - m * 2),
      bottom ? 0.2 + Math.random() * 0.15 : 0.35 + Math.random() * (h - 0.75),
      (Math.random() - 0.5) * (d - 0.5)
    );
  },

  pick() {
    if (this.mouse.px < 0) return null;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(this.mouse.x, -this.mouse.y), this.camera);
    let best = null, bd = 1e9;
    this.swimmers.forEach(s => {
      const sph = new THREE.Sphere(s.root.position, s.len * 0.45);
      const p = rc.ray.intersectSphere(sph, new THREE.Vector3());
      if (p) { const d = p.distanceTo(rc.ray.origin); if (d < bd) { bd = d; best = s; } }
    });
    return best;
  },

  update(dt) {
    if (this.level !== State.tankLevel) this.syncFish();
    const { w, h, d } = this.dims;
    const t = performance.now() / 1000;
    this.swimmers.forEach((s, i) => {
      s.tT -= dt;
      if (s.pause > 0) s.pause -= dt;
      if (s.pos.distanceTo(s.tgt) < 0.15 || s.tT <= 0) {
        s.tgt = this.randPoint(s.bottom); s.tT = 4 + Math.random() * 6;
        s.speed = (0.08 + Math.random() * 0.16) * (0.6 + s.len);
        if (Math.random() < 0.25) s.pause = 1 + Math.random() * 2.5;
      }
      // 期望方向 + 与其他鱼分离
      const want = s.tgt.clone().sub(s.pos);
      this.swimmers.forEach((o, j) => {
        if (i === j) return;
        const dv = s.pos.clone().sub(o.pos);
        const dd = dv.length();
        const minD = (s.len + o.len) * 0.55;
        if (dd < minD && dd > 1e-3) want.addScaledVector(dv.normalize(), (minD - dd) * 4);
      });
      const wantYaw = Math.atan2(want.x, want.z);
      const flat = Math.hypot(want.x, want.z);
      const wantPitch = U3.clamp(-Math.atan2(want.y, flat), -0.5, 0.5);
      let dy = ((wantYaw - s.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const turn = U3.clamp(dy, -1, 1);
      s.yaw += turn * dt * 1.3;
      s.pitch += (wantPitch - s.pitch) * Math.min(1, dt * 1.5);
      const spd = s.pause > 0 ? 0.015 : s.speed;
      const dir = new THREE.Vector3(Math.sin(s.yaw) * Math.cos(s.pitch), -Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch));
      s.pos.addScaledVector(dir, spd * dt);
      const m = s.len * 0.45;
      s.pos.x = U3.clamp(s.pos.x, -w / 2 + m, w / 2 - m);
      s.pos.y = U3.clamp(s.pos.y, 0.16 + s.len * 0.15, h - 0.2);
      s.pos.z = U3.clamp(s.pos.z, -d / 2 + m * 0.7, d / 2 - m * 0.7);
      s.root.position.copy(s.pos);
      s.root.position.y += Math.sin(t * 0.8 + i) * 0.004;
      s.root.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
      s.inst.tick(dt, s.pause > 0 ? 0.12 : 0.25 + spd * 3, -turn * 0.8);
      s.inst.setGlow(0.4 + Math.sin(t * 2 + i) * 0.2);
    });

    // 气泡
    if (this.bubbleMesh) {
      if (Math.random() < dt * 22 && this.bubbles.length < 90) {
        this.bubbles.push({ p: this.bubbleSrc.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.03, (Math.random() - 0.5) * 0.04)), r: 0.006 + Math.random() * 0.012, v: 0.25 + Math.random() * 0.2, ph: Math.random() * 6 });
      }
      const m4 = new THREE.Matrix4();
      this.bubbles = this.bubbles.filter(b => {
        b.p.y += b.v * dt;
        b.p.x += Math.sin(t * 6 + b.ph) * 0.02 * dt;
        return b.p.y < h - 0.11;
      });
      this.bubbles.forEach((b, i) => {
        const sc = b.r * (1 + b.p.y * 0.3);
        m4.makeScale(sc, sc * 0.85, sc).setPosition(b.p);
        this.bubbleMesh.setMatrixAt(i, m4);
      });
      this.bubbleMesh.count = this.bubbles.length;
      this.bubbleMesh.instanceMatrix.needsUpdate = true;
    }
  },

  render(t) {
    this.U.uTime.value = t;
    const { w, h } = this.dims;
    // 鼠标视差
    const cam = this.camera;
    const fitDist = Math.max(w / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / cam.aspect, h * 0.9 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.02 + 0.8;
    const yaw = this.mouse.px >= 0 ? this.mouse.x * 0.18 : Math.sin(t * 0.1) * 0.05;
    const pitch = this.mouse.px >= 0 ? this.mouse.y * 0.06 : 0;
    this.camYaw = U3.lerp(this.camYaw || 0, yaw, 0.05);
    this.camPitch = U3.lerp(this.camPitch || 0, pitch, 0.05);
    cam.position.set(Math.sin(this.camYaw) * fitDist, h * 0.52 + this.camPitch * fitDist, Math.cos(this.camYaw) * fitDist);
    cam.lookAt(0, h * 0.46, 0);
    if (this.surface) {
      const nm = this.surface.material;
      nm.normalMap.offset.set(t * 0.02, t * 0.013);
    }
    if (this.rays) this.rays.forEach(r => { r.material.opacity = 0.08 + Math.sin(t * 0.7 + r.userData.ph) * 0.04; r.rotation.z = 0.22 + Math.sin(t * 0.3 + r.userData.ph) * 0.05; });

    // 悬停
    const hit = this.pick();
    this.canvas.style.cursor = hit ? 'pointer' : 'default';
    if (hit) {
      const p = hit.root.position.clone().add(new THREE.Vector3(0, hit.len * 0.35, 0)).project(cam);
      this.label.style.display = 'block';
      this.label.style.left = ((p.x * 0.5 + 0.5) * this.W) + 'px';
      this.label.style.top = ((-p.y * 0.5 + 0.5) * this.H) + 'px';
      const r = RARITY[hit.sp.rarity];
      this.label.innerHTML = `<b style="color:${r.color}">${hit.sp.name}</b> ${hit.tf.weight}kg`;
    } else this.label.style.display = 'none';

    this.renderer.render(this.scene, cam);
  },
};
