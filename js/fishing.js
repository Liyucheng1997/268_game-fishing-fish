// ===================== 钓鱼玩法：状态机 + 物理化溜鱼 + HUD =====================
// 参照《实况钓鱼 VR》的流程，映射到鼠标键盘：
//   抛竿：按住左键 → 鼠标下拉(后摆) → 快速上甩并松开（甩得越快抛得越远）；或按住空格蓄力
//   等待：浮漂被拉入水中时 点击/上甩鼠标 提竿刺鱼；轻点 = 逗钓；按住 = 收线
//   溜鱼：按住左键/空格 收线；鼠标左右 = 竿的侧向（与鱼游向相反施压）；鼠标上下 = 竿的高度；滚轮 = 卸力(泄力)
//   鱼跃出水面时压低鱼竿；鱼到脚下后上抬鼠标/按住左键提鱼
'use strict';

const Fishing = {
  wrap: null, hudCanvas: null, hud: null, W: 800, H: 500,
  state: 'idle', // idle | windup | casting | waiting | bite | retrieve | fight | landing | showcase

  aimX: 0, aimY: 0, samples: [],
  pressing: false, pressT: 0, spaceHeld: false, spaceMode: false,

  // 抛竿
  back: 0, startNy: 0, power: 0, chargeDir: 1,
  castYaw: 0, castDist: 0, castT: 0, castDur: 1,
  castFrom: new THREE.Vector3(), castTo: new THREE.Vector3(),
  lastCastInfo: '',

  // 浮漂/等待
  bob: { x: 0, z: -20 }, bobDip: 0, bobTilt: { x: 0, z: 0 },
  twitchT: 0, strikeT: 0, waitT: 0, biteAt: 0, nibbles: [], nibbleFx: 0,
  biteT: 0, biteWindow: 1.0, catchInfo: null, suitor: null, twitches: 0, retrieveSpd: 3,

  // 溜鱼
  fish: null, tension: 0, lineLen: 0, slack: false, slackT: 0, breakMeter: 0,
  slipping: false, reeling: false, rodSide: 0, rodLift: 0.4, liftP: 0, pumpSpike: 0,
  landingT: 0,

  shake: 0, msg: '', msgT: 0, msgColor: '#fff', helpOn: false,
  tickT: 0, dragSndT: 0, strainT: 0,

  get drag() { return State.drag || 6; },
  set drag(v) { State.drag = U3.clamp(Math.round(v), 1, 10); },

  init(wrap, glCanvas, hudCanvas) {
    this.wrap = wrap;
    this.hudCanvas = hudCanvas;
    this.hud = hudCanvas.getContext('2d');
    Scene3D.init(glCanvas);
    Scene3D.setLocation(State.location);

    wrap.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); Sound.unlock();
      this.onPress('mouse');
    });
    window.addEventListener('pointerup', (e) => { if (e.button === 0) this.onRelease('mouse'); });
    window.addEventListener('pointermove', (e) => {
      const rect = wrap.getBoundingClientRect();
      if (!rect.width) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      this.aimX = U3.clamp(nx, -1.1, 1.1);
      this.aimY = U3.clamp(ny, -1.1, 1.1);
      this.samples.push({ t: performance.now(), x: this.aimX, y: this.aimY });
      if (this.samples.length > 40) this.samples.shift();
    });
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.state === 'fight' || this.state === 'landing' || this.state === 'waiting' || this.state === 'idle') {
        const old = this.drag;
        this.drag = old + (e.deltaY < 0 ? 1 : -1);
        if (this.drag !== old) Sound.click();
      }
    }, { passive: false });
    wrap.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (UI.tab !== 'fishing' || UI.modalOpen()) return;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { Sound.unlock(); this.spaceHeld = true; this.onPress('space'); } }
      if (e.code === 'KeyR') this.startRetrieve(8);
      if (e.code === 'KeyH') this.helpOn = !this.helpOn;
      if (e.code === 'ArrowUp' || e.code === 'Equal' || e.code === 'NumpadAdd') this.drag = this.drag + 1;
      if (e.code === 'ArrowDown' || e.code === 'Minus' || e.code === 'NumpadSubtract') this.drag = this.drag - 1;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { this.spaceHeld = false; if (UI.tab === 'fishing') this.onRelease('space'); }
    });
    this.resize();
    if (window.ResizeObserver) new ResizeObserver(() => { if (UI.tab === 'fishing') this.resize(); }).observe(wrap);
  },

  resize() {
    const rect = this.wrap.getBoundingClientRect();
    this.W = Math.max(320, rect.width);
    this.H = Math.max(300, rect.height);
    Scene3D.resize(this.W, this.H);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.hudCanvas.width = this.W * dpr;
    this.hudCanvas.height = this.H * dpr;
    this.hudCanvas.style.width = this.W + 'px';
    this.hudCanvas.style.height = this.H + 'px';
    this.hud.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  setLocation(id) {
    this.fish = null; this.suitor = null;
    this.state = 'idle';
    Scene3D.setLocation(id);
  },

  // 最近一段时间鼠标向上的最大速度（屏幕高度=2 单位 / 秒）
  flickSpeed(win = 140) {
    const now = performance.now();
    const s = this.samples.filter(p => now - p.t < win + 60);
    let best = 0, bx = 0;
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      const dt = (s[j].t - s[i].t) / 1000;
      if (dt < 0.025 || dt > win / 1000) continue;
      const v = -(s[j].y - s[i].y) / dt;
      if (v > best) { best = v; bx = (s[j].x - s[i].x) / dt; }
    }
    return { up: best, x: bx };
  },

  // ---------- 输入 ----------
  onPress(src) {
    if (UI.modalOpen()) return;
    this.pressing = true;
    this.pressT = 0;
    this.pressHandled = false;
    switch (this.state) {
      case 'idle':
        this.state = 'windup';
        this.spaceMode = src === 'space';
        this.back = 0; this.power = 0; this.chargeDir = 1;
        this.startNy = this.aimY;
        this.castYaw = Scene3D.camYaw;
        break;
      case 'waiting':
        if (this.nibbleFx > 0) { this.spook(); this.pressHandled = true; }
        break;
      case 'bite':
        this.hookFish(); this.pressHandled = true;
        break;
    }
  },

  onRelease(src) {
    if (!this.pressing) return;
    if (src === 'mouse' && this.spaceHeld) return;
    const held = this.pressT;
    this.pressing = false;
    if (this.state === 'windup') this.doCast();
    else if (this.state === 'waiting' && !this.pressHandled && held < 0.28) this.twitch();
    else if (this.state === 'retrieve' && this.retrieveByHold) { this.retrieveByHold = false; this.startWaiting(false); }
  },

  // ---------- 抛竿 ----------
  previewDist() { return 6 + Math.max(0.1, this.power) * 88; },

  doCast() {
    let power;
    if (this.spaceMode) {
      power = Math.max(0.1, this.power);
    } else {
      const fl = this.flickSpeed(150);
      if (this.back < 0.12 && fl.up < 1.4) {
        this.state = 'idle';
        this.showMsg('按住左键把鼠标往下拉（后摆），再快速往上甩并松开！', '#fde68a');
        return;
      }
      power = U3.clamp(0.18 * this.back + 0.92 * Math.min(1, fl.up / 6.5), 0.08, 1);
      this.castYaw -= U3.clamp(fl.x * 0.012, -0.12, 0.12);
    }
    this.power = power;
    this.castDist = 6 + power * 88;
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    this.castTo.copy(Scene3D.castPoint(this.castYaw + (Math.random() - 0.5) * 0.02, this.castDist * jitter));
    this.castFrom.copy(Scene3D.rod.tipWorld);
    this.castDur = 0.5 + this.castDist * 0.011;
    this.castT = 0;
    this.state = 'casting';
    this.lastCastInfo = `抛出 ${Math.round(this.castDist)} 米`;
    State.stats.casts++;
    consumeBait();
    UI.refreshBaitBar();
    Sound.cast();
  },

  flightPos() {
    const p = U3.clamp(this.castT / this.castDur, 0, 1);
    const u = 1 - Math.pow(1 - p, 1.5);
    const v = this.castFrom.clone().lerp(this.castTo, u);
    v.y = U3.lerp(this.castFrom.y, 0.05, u) + Math.sin(Math.PI * p) * (1.5 + this.castDist * 0.13);
    return v;
  },

  // ---------- 等待咬钩 ----------
  pickCatch() {
    const d = this.castDist;
    const junkP = d < 30 ? 0.1 : d < 60 ? 0.06 : 0.035;
    if (Math.random() < junkP) return { junk: JUNK_DB[Math.floor(Math.random() * JUNK_DB.length)] };
    const zone = d < 30 ? 0 : d < 60 ? 1 : 2;
    const bait = baitById(State.bait);
    const wx = WEATHERS[State.weather];
    const night = isNight();
    const pool = FISH_DB.filter(f => f.loc === State.location);
    const zoneW = { common: [3, 2, 1.2], rare: [0.8, 1.4, 2], epic: [0.25, 0.7, 1.4], legend: [0.06, 0.2, 0.55] };
    let total = 0;
    const weights = pool.map(f => {
      let w = zoneW[f.rarity][zone];
      if (f.rarity !== 'common') w *= bait.rareBoost * wx.rare;
      if (f.time === 'night') w *= night ? 3 : 0.15;
      if (f.time === 'day') w *= night ? 0.15 : 1.2;
      total += w;
      return w;
    });
    let r = Math.random() * total;
    let sp = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { sp = pool[i]; break; } }
    const t = Math.pow(Math.random(), 1.7);
    return { sp, weight: +(sp.minW + (sp.maxW - sp.minW) * t).toFixed(2) };
  },

  startWaiting(fresh = true) {
    this.state = 'waiting';
    if (fresh) { this.bob.x = this.castTo.x; this.bob.z = this.castTo.z; this.twitches = 0; }
    this.waitT = 0;
    const bait = baitById(State.bait);
    const wx = WEATHERS[State.weather];
    this.biteAt = (4 + Math.random() * 9) / (bait.biteSpd * wx.bite);
    this.nibbles = [];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.nibbles.push(this.biteAt * (0.45 + 0.45 * (i + Math.random() * 0.6) / n));
    this.nibbles.sort((a, b) => a - b);
    this.nibbleFx = 0;
    this.bobDip = 0;
    this.catchInfo = this.pickCatch();
    // 接近鱼饵的鱼（从远处游来）
    const ang = Math.random() * Math.PI * 2, r0 = 7 + Math.random() * 4;
    this.suitor = {
      catchInfo: this.catchInfo, visible: !this.catchInfo.junk,
      x: this.bob.x + Math.cos(ang) * r0, z: this.bob.z + Math.sin(ang) * r0, y: -1.6,
      heading: ang + Math.PI, effort: 0.4, turn: 0, orbit: Math.random() * 6.28,
      len: this.catchInfo.junk ? 0.3 : fishLength(this.catchInfo.sp, this.catchInfo.weight),
    };
  },

  hookPos(bobberPos) {
    const depth = Math.min(0.9, Math.max(0.35, -Scene3D.heightAt(this.bob.x, this.bob.z) - 0.35));
    const v = new THREE.Vector3(bobberPos.x, bobberPos.y - depth, bobberPos.z);
    if (this.state === 'bite' && this.suitor) {
      v.x += Math.sin(this.suitor.heading) * 0.2; v.z += Math.cos(this.suitor.heading) * 0.2;
    }
    return v;
  },

  twitch() {
    const to = Scene3D.dockEnd;
    const dx = to.x - this.bob.x, dz = to.z - this.bob.z, d = Math.hypot(dx, dz);
    if (d < 4) { this.startRetrieve(4); return; }
    this.bob.x += dx / d * 0.7; this.bob.z += dz / d * 0.7;
    this.twitchT = 0.3;
    Scene3D.ripple(this.bob.x, this.bob.z, 0.6);
    Sound.reelTick();
    if (this.twitches < 3) { this.biteAt -= (this.biteAt - this.waitT) * 0.15; this.twitches++; }
  },

  spook() {
    this.showMsg('提竿太早，鱼被吓跑了！', '#fca5a5');
    Sound.escape();
    this.strikeT = 0.35;
    Scene3D.splash(this.bob.x, this.bob.z, 0.4);
    this.startWaiting(false);
  },

  startRetrieve(spd) {
    if (this.state !== 'waiting' && this.state !== 'bite') return;
    this.state = 'retrieve';
    this.retrieveSpd = spd;
    this.suitor = null;
  },

  hookFish() {
    const c = this.catchInfo || this.pickCatch();
    Sound.hook();
    this.shake = 6;
    this.strikeT = 0.4;
    const s = this.suitor;
    const fx = s && !c.junk ? s.x : this.bob.x, fz = s && !c.junk ? s.z : this.bob.z;
    const f = {
      catchInfo: c, sp: c.sp, junk: c.junk, weight: c.weight || 0,
      x: fx, z: fz, y: -0.6, heading: s ? s.heading : Math.random() * 6.28, pitch: 0, roll: 0,
      effort: 1.5, turn: 0, mode: 'run', modeT: 1.2 + Math.random(), speed: 3,
      jumpT: 0, jumpDur: 1, jumpH: 1, throwRisk: 0, lastRun: false, dist: 10,
    };
    if (c.junk) {
      Object.assign(f, { strength: 0.05, maxStamina: 1, stamina: 0, mode: 'tired', modeT: 99, len: 0.4, style: 'normal' });
    } else {
      const sp = c.sp;
      const sizeF = 0.75 + 0.5 * (c.weight / sp.maxW);
      Object.assign(f, {
        strength: Math.min(1, sp.strength * sizeF), dashRate: sp.dashRate, style: sp.style,
        maxStamina: sp.stamina * sizeF, stamina: sp.stamina * sizeF, len: fishLength(sp, c.weight),
      });
      // 首冲：刺鱼后鱼会立刻往外逃
      const tip = Scene3D.rod.tipWorld;
      f.heading = Math.atan2(f.x - tip.x, f.z - tip.z) + (Math.random() - 0.5) * 1.6;
      f.speed = 2.5 + f.strength * 4;
    }
    const tip = Scene3D.rod.tipWorld;
    this.fish = f;
    this.lineLen = Math.hypot(f.x - tip.x, f.z - tip.z) + 0.2;
    this.state = 'fight';
    this.tension = 40; this.baseT = 40; this.shock = 0;
    this.breakMeter = 0;
    this.slackT = 0;
    this.slack = false;
    this.fightT = 0;
    this.suitor = null;
    Scene3D.splash(f.x, f.z, 0.9);
  },

  // ---------- 更新 ----------
  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 12);
    if (this.msgT > 0) this.msgT -= dt;
    if (this.nibbleFx > 0) this.nibbleFx -= dt;
    if (this.twitchT > 0) this.twitchT -= dt;
    if (this.strikeT > 0) this.strikeT -= dt;
    if (this.pressing) this.pressT += dt;
    this.reeling = false;
    this.slipping = false;

    switch (this.state) {
      case 'windup': {
        if (this.spaceMode) {
          this.power += this.chargeDir * 0.95 * dt;
          if (this.power >= 1) { this.power = 1; this.chargeDir = -1; }
          if (this.power <= 0) { this.power = 0; this.chargeDir = 1; }
          this.back = 0.35 + this.power * 0.65;
        } else {
          const target = U3.clamp((this.aimY - this.startNy) / 0.55, 0, 1);
          // 上甩时竿迅速前压
          this.back += (target - this.back) * Math.min(1, dt * 14);
        }
        this.castYaw = Scene3D.camYaw;
        break;
      }
      case 'casting': {
        this.castT += dt;
        if (this.castT >= this.castDur) {
          const h = Scene3D.heightAt(this.castTo.x, this.castTo.z);
          if (h > -0.3) {
            this.showMsg('抛到岸边浅滩了，收线重来', '#fde68a');
            this.bob.x = this.castTo.x; this.bob.z = this.castTo.z;
            this.state = 'retrieve'; this.retrieveSpd = 10;
          } else {
            Sound.splash();
            Scene3D.splash(this.castTo.x, this.castTo.z, 0.8);
            this.startWaiting(true);
          }
        }
        break;
      }
      case 'waiting': this.updateWaiting(dt); break;
      case 'bite': this.updateBite(dt); break;
      case 'retrieve': {
        const to = Scene3D.dockEnd;
        const dx = to.x - this.bob.x, dz = to.z - this.bob.z, d = Math.hypot(dx, dz);
        this.bobDip = -0.05;
        this.reeling = true;
        if (d < 2.6) { this.state = 'idle'; this.showMsg('收回了鱼线', '#e2e8f0'); break; }
        const sp = Math.min(d, this.retrieveSpd * dt);
        this.bob.x += dx / d * sp; this.bob.z += dz / d * sp;
        if (Math.random() < dt * 6) Scene3D.ripple(this.bob.x, this.bob.z, 0.3);
        this.tickT -= dt;
        if (this.tickT <= 0) { Sound.reelTick(); this.tickT = 0.08; }
        break;
      }
      case 'fight': this.updateFight(dt); break;
      case 'landing': this.updateLanding(dt); break;
    }
  },

  updateWaiting(dt) {
    this.waitT += dt;
    // 按住左键 = 收线
    if (this.pressing && !this.pressHandled && this.pressT > 0.28 && !this.spaceHeld) {
      this.state = 'retrieve'; this.retrieveSpd = 3.2; this.retrieveByHold = true; return;
    }
    const flow = Water.flow;
    if (flow.x || flow.y) { this.bob.x += flow.x * 0.25 * dt; this.bob.z += flow.y * 0.25 * dt; }
    // 小口试探
    for (let i = this.nibbles.length - 1; i >= 0; i--) {
      if (this.waitT >= this.nibbles[i]) {
        this.nibbles.splice(i, 1);
        this.nibbleFx = 0.45;
        Sound.nibble();
        Scene3D.ripple(this.bob.x, this.bob.z, 0.45);
      }
    }
    this.bobDip = this.nibbleFx > 0 ? -Math.abs(Math.sin(this.nibbleFx * 18)) * 0.07 : this.bobDip * 0.9;
    this.bobTilt.x = this.nibbleFx > 0 ? Math.sin(this.nibbleFx * 30) * 0.2 : 0;
    this.updateSuitor(dt, false);
    if (this.waitT >= this.biteAt) {
      this.state = 'bite';
      this.biteT = 0;
      this.biteWindow = this.catchInfo.junk ? 1.6 : 0.85 + (this.catchInfo.sp.rarity === 'common' ? 0.25 : 0);
      Sound.bite();
      Scene3D.splash(this.bob.x, this.bob.z, 0.35);
    }
  },

  updateBite(dt) {
    this.biteT += dt;
    // 浮漂被拖入水中并走漂
    this.bobDip += (-0.42 - this.bobDip) * Math.min(1, dt * 10);
    this.bobTilt.x = Math.sin(this.biteT * 20) * 0.25;
    this.bobTilt.z = 0.4;
    const s = this.suitor;
    if (s && !this.catchInfo.junk) {
      this.bob.x += Math.sin(s.heading) * 0.5 * dt;
      this.bob.z += Math.cos(s.heading) * 0.5 * dt;
    }
    if (Math.random() < dt * 8) Scene3D.ripple(this.bob.x, this.bob.z, 0.5);
    this.updateSuitor(dt, true);
    // 快速上甩鼠标 = 提竿
    if (this.flickSpeed(120).up > 4.2) { this.hookFish(); return; }
    if (this.biteT > this.biteWindow) {
      this.bobDip = 0; this.bobTilt.z = 0;
      if (Math.random() < 0.3) {
        this.showMsg('鱼饵被偷吃了！重新抛竿吧', '#fca5a5');
        Sound.escape();
        this.state = 'retrieve'; this.retrieveSpd = 12;
      } else {
        this.showMsg('慢了一步，鱼跑了…', '#fca5a5');
        Sound.escape();
        this.startWaiting(false);
      }
    }
  },

  // 接近鱼饵的鱼：绕饵盘旋 → 试探 → 咬钩后往外拖
  updateSuitor(dt, biting) {
    const s = this.suitor;
    if (!s || !s.visible) return;
    const hook = this.hookPos(new THREE.Vector3(this.bob.x, 0, this.bob.z));
    const prog = U3.clamp(this.waitT / Math.max(0.1, this.biteAt), 0, 1);
    let tx, tz, ty = hook.y - 0.05, spd;
    s.orbit += dt * 0.6;
    if (biting) {
      tx = hook.x + Math.sin(s.heading) * 3; tz = hook.z + Math.cos(s.heading) * 3; spd = 1.4;
    } else if (this.nibbleFx > 0) {
      // 试探：嘴贴近鱼饵
      tx = hook.x - Math.sin(s.heading) * s.len * 0.45; tz = hook.z - Math.cos(s.heading) * s.len * 0.45; spd = 1.2;
    } else {
      const rad = U3.lerp(5, 0.5 + s.len * 0.6, U3.smooth(0, 0.55, prog));
      tx = hook.x + Math.cos(s.orbit) * rad; tz = hook.z + Math.sin(s.orbit) * rad; spd = 0.45 + prog * 0.3;
      ty = hook.y - 0.6 + prog * 0.5;
    }
    const want = Math.atan2(tx - s.x, tz - s.z);
    const dh = ((want - s.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    s.turn = U3.clamp(dh, -1, 1);
    s.heading += s.turn * dt * 2.2;
    const d = Math.hypot(tx - s.x, tz - s.z);
    const v = Math.min(spd, d * 2);
    const nx = s.x + Math.sin(s.heading) * v * dt, nz = s.z + Math.cos(s.heading) * v * dt;
    if (Scene3D.heightAt(nx, nz) < -0.6) { s.x = nx; s.z = nz; }
    const bottom = Scene3D.heightAt(s.x, s.z) + 0.25;
    s.y += (Math.max(bottom, ty) - s.y) * Math.min(1, dt * 1.5);
    s.effort = biting ? 1.6 : 0.3 + v * 0.6;
  },

  // ---------- 溜鱼 ----------
  updateFight(dt) {
    const f = this.fish;
    const rod = rodById(State.rod), line = lineById(State.line);
    this.fightT += dt;
    this.reeling = (this.pressing || this.spaceHeld);
    this.rodSide = U3.clamp(this.aimX * 1.2, -1, 1);
    const newLift = U3.clamp(0.42 - this.aimY * 0.72, 0, 1);
    const liftV = (newLift - this.rodLift) / Math.max(dt, 1e-3);
    this.rodLift = newLift;
    const tip = Scene3D.rod.tipWorld;
    const s = f.strength;

    // ---- 鱼的行为 ----
    f.modeT -= dt;
    const stR = f.junk ? 0 : f.stamina / f.maxStamina;
    if (!f.junk && f.mode !== 'jump') {
      if (stR < 0.18 && f.mode !== 'tired') { f.mode = 'tired'; f.modeT = 99; this.showMsg('鱼没力气了，稳稳收线！', '#86efac'); }
      if (f.mode === 'tired' && stR > 0.3) f.modeT = 0;
      if (f.modeT <= 0 && f.mode !== 'tired') this.pickFishMode(f, stR, tip);
    }
    // 跳跃
    if (f.mode === 'jump') {
      f.jumpT += dt;
      const p = f.jumpT / f.jumpDur;
      f.y = -0.15 + Math.sin(Math.PI * Math.min(1, p)) * f.jumpH;
      f.pitch = (0.5 - p) * 1.4;
      f.roll = Math.sin(p * 9) * 0.5;
      f.effort = 2.2;
      if (this.rodLift > 0.6 && this.tension > 25) f.throwRisk += dt * 1.8;
      if (p > 0.45 && p < 0.6 && !f.jumpJudged) {
        f.jumpJudged = true;
        if (this.rodLift < 0.42) this.showMsg('压竿及时，漂亮！', '#86efac');
      }
      if (p >= 1) {
        Scene3D.splash(f.x, f.z, 0.6 + f.len * 1.2);
        Sound.splash();
        f.pitch = 0; f.roll = 0;
        if (f.throwRisk > 0.5 && Math.random() < 0.65) { this.fightFail('throw'); return; }
        f.mode = 'calm'; f.modeT = 1 + Math.random();
      }
    }

    // ---- 侧向施压 ----
    const rx = f.x - tip.x, rz = f.z - tip.z;
    const df = Math.hypot(rx, rz) || 0.01;
    const ox = rx / df, oz = rz / df;            // 远离钓手的方向
    const rightX = -oz, rightZ = ox;              // 从钓手看去的右侧
    let hx = Math.sin(f.heading), hz = Math.cos(f.heading);
    const lat = hx * rightX + hz * rightZ;        // >0：鱼往右游
    const outward = hx * ox + hz * oz;
    const good = -this.rodSide * lat;
    this.sideGood = good;
    this.fishLat = lat;
    const sideF = 1 + 1.5 * Math.max(0, good) - 0.5 * Math.max(0, -good);
    if (!f.junk && good > 0.25 && f.mode !== 'jump') {
      // 侧压把鱼头扳向钓手
      const want = Math.atan2(-ox, -oz);
      const dh = ((want - f.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      f.heading += Math.sign(dh) * Math.min(Math.abs(dh), good * 0.9 * dt);
    }

    // ---- 张力 ----
    const force = { calm: 12 + 26 * s, run: 36 + 52 * s, dive: 32 + 42 * s, tired: 4 + 7 * s, jump: 24 + 32 * s }[f.mode];
    const taut = df >= this.lineLen - 0.3;
    this.pumpSpike = Math.max(0, this.pumpSpike - dt * 60);
    if (liftV > 2.2 && taut && f.mode !== 'jump') { this.pumpSpike = Math.min(22, liftV * 3); }
    let target;
    if (taut) {
      target = force * U3.clamp(0.25 + 0.75 * outward, 0.12, 1)
        + (this.reeling ? 14 + s * 18 : 0) + this.rodLift * 14 + this.pumpSpike;
      if (f.mode === 'jump') target += 8;
    } else target = this.rodLift * 3;
    // 甩头冲击：来得太快，卸力来不及出线
    if (!f.junk && taut && Math.random() < dt * (f.mode === 'run' ? 1.6 : 0.7) && f.mode !== 'tired') this.shock = 5 + s * 22;
    this.shock = Math.max(0, (this.shock || 0) - dt * 70);
    this.baseT = (this.baseT || 0) + (target - (this.baseT || 0)) * Math.min(1, dt * 7);
    let tv = this.baseT;
    const dragLim = 18 + this.drag * 8.2;
    this.slipping = taut && tv > dragLim;
    if (this.slipping) {
      tv = dragLim + (tv - dragLim) * 0.25;
      if (this.reeling) tv += 10 + s * 16; // 出线时还硬摇轮：线和轮都在发烫
    }
    this.tension = U3.clamp(tv + this.shock + (Math.random() - 0.5) * 1.5, 0, 120);

    // ---- 鱼线长度 ----
    let spd = f.junk ? 0 : { calm: 0.5 + 0.8 * s, run: f.speed, dive: 1.6, tired: 0.35, jump: 2.2 }[f.mode];
    if (this.slipping) this.lineLen += Math.max(0.2, spd * outward) * dt;
    if (this.reeling && !this.slipping) {
      const k = f.mode === 'run' ? 0.3 : f.mode === 'tired' ? 1.35 : f.mode === 'jump' ? 0.2 : 1 - s * 0.35;
      this.lineLen -= rod.reel * k * dt;
      this.tickT -= dt;
      if (this.tickT <= 0) { Sound.reelTick(); this.tickT = 0.075; }
    }
    if (this.pumpSpike > 5 && !this.slipping) this.lineLen -= this.pumpSpike * 0.02 * dt * 10;
    if (this.slipping) {
      this.dragSndT -= dt;
      if (this.dragSndT <= 0) { Sound.drag(); this.dragSndT = 0.05; }
    }
    this.lineLen = Math.max(1.2, this.lineLen);

    // ---- 鱼的移动 ----
    let nx = f.x + hx * spd * dt, nz = f.z + hz * spd * dt;
    if (Water.flow.x || Water.flow.y) { nx += Water.flow.x * 0.35 * dt; nz += Water.flow.y * 0.35 * dt; }
    const endZ = Scene3D.dockEnd.z;
    const nearDock = Math.hypot(nx, nz - endZ) < 4;
    if (!nearDock && Scene3D.heightAt(nx, nz) > -0.8) {
      f.heading += Math.PI * (0.6 + Math.random() * 0.5);
      nx = f.x; nz = f.z;
    }
    let ndx = nx - tip.x, ndz = nz - tip.z;
    const nd = Math.hypot(ndx, ndz);
    if (nd > this.lineLen) { nx = tip.x + ndx / nd * this.lineLen; nz = tip.z + ndz / nd * this.lineLen; }
    const prevH = f.heading;
    f.x = nx; f.z = nz;
    f.dist = Math.hypot(nx - tip.x, nz - tip.z);
    f.turn = U3.clamp((f.heading - prevH) / Math.max(dt, 1e-3) * 0.3, -1, 1);

    // 深度
    if (f.mode !== 'jump') {
      const bottom = Scene3D.heightAt(f.x, f.z) + 0.3;
      const ty = { calm: -1.1, run: -0.45, dive: bottom, tired: -0.12 }[f.mode];
      f.y += (Math.max(bottom, ty) - f.y) * Math.min(1, dt * 1.6);
      f.pitch += (0 - f.pitch) * Math.min(1, dt * 3);
      f.roll += ((f.mode === 'tired' ? 1.1 + Math.sin(this.fightT * 1.4) * 0.3 : 0) - f.roll) * Math.min(1, dt * 2);
      f.effort = { calm: 0.7, run: 1.9, dive: 1.3, tired: 0.3 }[f.mode];
    }
    if (f.junk) { f.y = Math.min(f.y, -0.2); f.effort = 0; }

    // ---- 体力 ----
    if (!f.junk) {
      if (this.tension > 12) f.stamina -= (this.tension / 100) * (f.mode === 'run' ? 8 : 5) * sideF * (this.slipping ? 1.25 : 1) * dt;
      else f.stamina += 3 * dt;
      f.stamina = U3.clamp(f.stamina, 0, f.maxStamina);
    }

    // ---- 失败判定 ----
    if (this.tension > rod.safe) {
      this.breakMeter += ((this.tension - rod.safe) / 28) * dt;
      this.strainT -= dt;
      if (this.strainT <= 0) { Sound.strain(); this.strainT = 0.22; }
      this.shake = Math.max(this.shake, 2.5);
      if (this.breakMeter >= line.hp) { this.fightFail('break'); return; }
    } else this.breakMeter = Math.max(0, this.breakMeter - 0.4 * dt);
    this.slack = df < this.lineLen - 0.9 && !f.junk;
    if (this.slack) {
      this.slackT += dt;
      if (this.slackT > 2.8) { this.fightFail('slack'); return; }
    } else this.slackT = Math.max(0, this.slackT - dt * 2);
    if (this.lineLen > 150) { this.fightFail('spool'); return; }

    // ---- 拉到脚下 ----
    if (f.dist < 3.4 && this.lineLen < 3.6) {
      if (f.junk || stR < 0.35) {
        this.state = 'landing'; this.liftP = 0; this.landingT = 0;
        Sound.splash();
      } else if (!f.lastRun || f.modeT < -3) {
        f.lastRun = true;
        f.mode = 'run'; f.modeT = 1.2 + Math.random();
        f.heading = Math.atan2(ox, oz) + (Math.random() - 0.5) * 1.2;
        f.speed = 2.5 + s * 4;
        Sound.dash(); this.shake = 5;
        this.showMsg('鱼看到你，又冲出去了！', '#fbbf24');
      }
    }
  },

  pickFishMode(f, stR, tip) {
    const r = Math.random();
    const away = Math.atan2(f.x - tip.x, f.z - tip.z);
    const jumpP = f.style === 'jumper' ? 0.24 : 0.03;
    const runP = 0.22 + f.dashRate * 0.5 + (f.style === 'runner' ? 0.12 : 0);
    const diveP = f.style === 'diver' ? 0.28 : 0.04;
    if (r < jumpP && stR > 0.2) {
      f.mode = 'jump'; f.jumpT = 0; f.jumpDur = 0.8 + Math.random() * 0.5; f.jumpH = 0.7 + Math.random() * 0.9 + f.strength * 0.4;
      f.throwRisk = 0; f.jumpJudged = false;
      Scene3D.splash(f.x, f.z, 0.6 + f.len);
      Sound.jump(); this.shake = 4;
      this.showMsg('鱼跃出水面！快把鱼竿压低（鼠标下移）', '#fbbf24');
    } else if (r < jumpP + runP) {
      f.mode = 'run'; f.modeT = 0.8 + Math.random() * 1.5;
      f.heading = away + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 1.1);
      f.speed = 2.2 + f.strength * 4.5;
      Sound.dash(); this.shake = 3.5;
    } else if (r < jumpP + runP + diveP) {
      f.mode = 'dive'; f.modeT = 1.5 + Math.random() * 1.5;
      f.heading = away + (Math.random() - 0.5) * 0.8;
    } else {
      f.mode = 'calm'; f.modeT = 1 + Math.random() * 1.8;
      f.heading += (Math.random() - 0.5) * 1.8;
    }
  },

  updateLanding(dt) {
    const f = this.fish;
    this.landingT += dt;
    this.rodLift = U3.clamp(0.42 - this.aimY * 0.72, 0, 1);
    const lifting = this.pressing || this.spaceHeld || this.rodLift > 0.78;
    this.liftP = U3.clamp(this.liftP + (lifting ? dt * 1.1 : -dt * 0.6), 0, 1);
    this.reeling = lifting;
    this.tension = 30 + this.liftP * 25 + Math.random() * 3;
    const end = Scene3D.dockEnd;
    const tx = end.x + 0.1, tz = end.z - 1.5 + this.liftP * 0.8;
    f.x += (tx - f.x) * Math.min(1, dt * 3);
    f.z += (tz - f.z) * Math.min(1, dt * 3);
    f.y = -0.1 + this.liftP * this.liftP * 1.8;
    f.heading = Math.PI * 0.5 + Math.sin(this.landingT * 7) * 0.5;
    f.pitch = -this.liftP * 1.2;
    f.roll = Math.sin(this.landingT * 5) * 0.4;
    f.effort = 1.4;
    f.turn = Math.sin(this.landingT * 7);
    f.dist = 1.5;
    if (Math.random() < dt * 5 && this.liftP < 0.4) Scene3D.splash(f.x, f.z, 0.3 + f.len * 0.4);
    if (this.liftP >= 1) this.landFish();
    else if (this.landingT > 7 && !f.junk) {
      this.state = 'fight';
      f.mode = 'run'; f.modeT = 1.5; f.stamina = f.maxStamina * 0.4;
      f.heading = Math.PI + (Math.random() - 0.5);
      this.lineLen += 3;
      this.showMsg('犹豫太久，鱼又挣脱着游开了！', '#fbbf24');
    }
  },

  fightFail(reason) {
    const msgs = {
      break: ['啪！鱼线断了！（卸力调低一点）', '#f87171'],
      slack: ['线太松，鱼脱钩跑了…', '#fca5a5'],
      spool: ['鱼把线全拉走了！', '#f87171'],
      throw: ['鱼在空中甩掉了鱼钩！跳跃时要压低鱼竿', '#fca5a5'],
    };
    const [m, c] = msgs[reason];
    this.showMsg(m, c);
    if (reason === 'break') { Sound.snap(); State.stats.broken++; }
    else Sound.escape();
    State.stats.escaped++;
    if (this.fish) Scene3D.splash(this.fish.x, this.fish.z, 0.8);
    this.fish = null;
    this.state = 'idle';
    this.shake = 6;
    saveGame();
  },

  landFish() {
    const f = this.fish;
    this.state = 'showcase';
    Scene3D.splash(f.x, f.z, 0.8);
    Scene3D.startShowcase(f);
    if (f.junk) Sound.splash();
    else {
      recordCatch(f.sp.id, f.weight);
      if (f.sp.rarity === 'legend') Sound.legend(); else Sound.catch_();
    }
    UI.showCatchResult(f);
    saveGame();
  },

  finishCatch(mode = 'release') {
    Scene3D.endShowcase(mode);
    this.fish = null;
    this.state = 'idle';
  },

  showMsg(m, color = '#fff') { this.msg = m; this.msgColor = color; this.msgT = 2.6; },

  // ---------- 渲染 ----------
  render(t, dt) {
    Scene3D.render(dt, t, this);
    const ctx = this.hud;
    ctx.clearRect(0, 0, this.W, this.H);
    this.drawHUD(ctx, t);
  },

  panel(ctx, x, y, w, h, r = 10, a = 0.42) {
    ctx.fillStyle = `rgba(8,16,28,${a})`;
    roundRect(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
  },

  hint(ctx, text, y) {
    const W = this.W;
    ctx.textAlign = 'center';
    let size = 14;
    ctx.font = `${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
    // 太宽时按「·」分成多行
    let lines = [text];
    if (ctx.measureText(text).width > W - 40) {
      size = 13;
      ctx.font = `${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
      const parts = text.split('·').map(s => s.trim());
      lines = [];
      let cur = '';
      parts.forEach(p => {
        const cand = cur ? cur + '  ·  ' + p : p;
        if (ctx.measureText(cand).width > W - 60 && cur) { lines.push(cur); cur = p; } else cur = cand;
      });
      if (cur) lines.push(cur);
    }
    const lh = size + 8;
    const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
    const top = y - 20 - (lines.length - 1) * lh;
    this.panel(ctx, W / 2 - tw / 2 - 14, top, tw + 28, 30 + (lines.length - 1) * lh, 14, 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y - (lines.length - 1 - i) * lh));
  },

  drawHUD(ctx, t) {
    const W = this.W, H = this.H;
    ctx.textAlign = 'center';
    const st = this.state;

    // 顶部消息
    if (this.msgT > 0) {
      ctx.globalAlpha = Math.min(1, this.msgT * 2);
      ctx.font = 'bold 19px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(this.msg).width;
      this.panel(ctx, W / 2 - tw / 2 - 18, st === 'fight' ? 104 : 18, tw + 36, 38, 19, 0.5);
      ctx.fillStyle = this.msgColor;
      ctx.fillText(this.msg, W / 2, st === 'fight' ? 130 : 44);
      ctx.globalAlpha = 1;
    }

    if (st === 'idle') {
      this.hint(ctx, '按住左键 → 鼠标往下拉(后摆) → 快速上甩并松开 = 抛竿   ·   空格：蓄力抛竿   ·   H：操作说明', H - 22);
      this.crosshair(ctx);
    } else if (st === 'windup') {
      this.drawWindup(ctx, t);
    } else if (st === 'casting') {
      ctx.font = 'bold 22px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(this.lastCastInfo, W / 2, H * 0.3);
    } else if (st === 'waiting' || st === 'bite' || st === 'retrieve') {
      const p = Scene3D.project(new THREE.Vector3(this.bob.x, 0.25, this.bob.z));
      if (p.vis) {
        if (st === 'bite') {
          const bob = Math.sin(t * 16) * 4;
          ctx.strokeStyle = 'rgba(255,90,70,0.95)'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, 15 + Math.sin(t * 14) * 4, 0, Math.PI * 2); ctx.stroke();
          ctx.font = 'bold 22px "PingFang SC","Microsoft YaHei",sans-serif';
          ctx.fillStyle = '#ff5a46';
          ctx.fillText('提竿！', p.x, p.y - 26 + bob);
        } else if (st === 'waiting') {
          ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 11 + Math.sin(t * 2.2) * 1.5, 0, Math.PI * 2); ctx.stroke();
        }
      }
      if (st === 'waiting') this.hint(ctx, '等鱼咬钩…浮漂被拉入水中时 点击 / 快速上甩鼠标 提竿   ·   轻点=逗钓   ·   按住=收线   ·   R 快速收线', H - 22);
      if (st === 'bite') this.hint(ctx, '就是现在！点击左键 或 快速向上甩鼠标！', H - 22);
      this.drawDragChip(ctx, 16, H - 70);
    } else if (st === 'fight') {
      this.drawFightHUD(ctx, t);
    } else if (st === 'landing') {
      const cx = W / 2, cy = H * 0.62;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#4ade80';
      ctx.beginPath(); ctx.arc(cx, cy, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.liftP); ctx.stroke();
      ctx.font = 'bold 26px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('⬆', cx, cy + 9);
      this.hint(ctx, '鱼到脚下了！按住左键 或 把鼠标移到上方 → 提鱼出水', H - 22);
    }

    if (this.helpOn) this.drawHelp(ctx);
  },

  crosshair(ctx) {
    const W = this.W, H = this.H;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2); ctx.stroke();
  },

  drawWindup(ctx, t) {
    const W = this.W, H = this.H;
    const cx = W / 2, cy = H - 120;
    if (this.spaceMode) {
      const bw = Math.min(360, W * 0.55), bh = 16;
      const bx = cx - bw / 2, by = H - 64;
      this.panel(ctx, bx - 8, by - 34, bw + 16, bh + 44, 10, 0.45);
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#4ade80'); g.addColorStop(0.6, '#facc15'); g.addColorStop(1, '#f87171');
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, bx, by, bw, bh, 8); ctx.fill();
      ctx.fillStyle = g; roundRect(ctx, bx, by, bw * this.power, bh, 8); ctx.fill();
      ctx.font = 'bold 14px "PingFang SC","Microsoft YaHei",sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(`力度 ${Math.round(this.power * 100)}% · 预计 ${Math.round(this.previewDist())} 米 · 松开空格抛出`, cx, by - 12);
      return;
    }
    // 后摆弧形表
    const R = 54;
    ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.strokeStyle = this.back > 0.35 ? '#facc15' : '#93c5fd';
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.1, Math.PI * 1.1 + Math.PI * 0.8 * this.back); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.font = 'bold 16px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(this.back < 0.3 ? '⬇ 往下拉鼠标，把竿后摆' : '⬆ 快速往上甩并松开！', cx, cy + 6);
    ctx.font = '12px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('甩得越快抛得越远 · 越远越容易遇到稀有鱼', cx, cy + 26);
  },

  drawDragChip(ctx, x, y) {
    this.panel(ctx, x, y, 132, 50, 10, 0.4);
    ctx.textAlign = 'left';
    ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('卸力 (滚轮调节)', x + 10, y + 18);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i < this.drag ? (i >= 8 ? '#f87171' : i >= 6 ? '#facc15' : '#4ade80') : 'rgba(255,255,255,0.15)';
      ctx.fillRect(x + 10 + i * 11, y + 28, 8, 12);
    }
    ctx.textAlign = 'center';
  },

  drawFightHUD(ctx, t) {
    const W = this.W, H = this.H;
    const f = this.fish;
    const rod = rodById(State.rod), line = lineById(State.line);

    // --- 张力计（右侧） ---
    const gh = Math.min(260, H * 0.5), gw = 22;
    const gx = W - 64, gy = H / 2 - gh / 2;
    this.panel(ctx, gx - 14, gy - 34, gw + 28, gh + 74, 12, 0.45);
    ctx.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('张力', gx + gw / 2, gy - 14);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(ctx, gx, gy, gw, gh, 6); ctx.fill();
    const Y = (v) => gy + gh * (1 - v / 120);
    // 断线区
    ctx.fillStyle = 'rgba(239,68,68,0.3)';
    ctx.fillRect(gx, gy, gw, Y(rod.safe) - gy);
    const tv = this.tension;
    const danger = tv > rod.safe;
    ctx.fillStyle = danger ? '#ef4444' : tv < 10 ? '#94a3b8' : tv > rod.safe * 0.8 ? '#facc15' : '#4ade80';
    roundRect(ctx, gx + 3, Y(tv), gw - 6, gy + gh - Y(tv), 4); ctx.fill();
    // 卸力标记
    const dragLim = 18 + this.drag * 8.2;
    const dy = Y(dragLim);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(gx - 3, dy); ctx.lineTo(gx - 11, dy - 6); ctx.lineTo(gx - 11, dy + 6); ctx.fill();
    ctx.fillRect(gx, dy - 1, gw, 2);
    ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`卸力${this.drag}`, gx - 13, dy + 4);
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('断线', gx - 13, Y(rod.safe) + 4);
    ctx.textAlign = 'center';
    if (this.slipping) {
      ctx.fillStyle = '#fde68a'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText('出线中', gx + gw / 2, gy + gh + 18);
    }
    // 线的耐久
    if (this.breakMeter > 0.05) {
      const bp = Math.min(1, this.breakMeter / line.hp);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(ctx, gx - 4, gy + gh + 26, gw + 8, 7, 3); ctx.fill();
      ctx.fillStyle = bp > 0.6 ? '#ef4444' : '#f97316'; roundRect(ctx, gx - 4, gy + gh + 26, (gw + 8) * (1 - bp), 7, 3); ctx.fill();
      if (bp > 0.5 && Math.sin(t * 20) > 0) {
        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 15px sans-serif';
        ctx.fillText('要断线了！', W / 2, H * 0.36);
      }
    }

    // --- 顶部：鱼 ---
    const pw = Math.min(400, W * 0.6), px = W / 2 - pw / 2, py = 14;
    this.panel(ctx, px - 14, py - 4, pw + 28, 80, 14, 0.45);
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#fff';
    const known = !f.junk && State.collection[f.sp.id];
    const name = f.junk ? '？？？' : known ? f.sp.name : '？？？';
    const modeTxt = { run: '💨 冲刺中', dive: '⤵ 往深处钻', tired: '😮‍💨 没力气了', jump: '🐟 跃出水面！', calm: '' }[f.mode] || '';
    ctx.fillText(`${name}   ${modeTxt}`, px, py + 14);
    ctx.textAlign = 'right';
    ctx.font = '12px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`出线 ${this.lineLen.toFixed(1)} m`, px + pw, py + 14);
    ctx.textAlign = 'left';
    const stR = f.junk ? 0 : f.stamina / f.maxStamina;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, px, py + 24, pw, 10, 5); ctx.fill();
    ctx.fillStyle = stR > 0.5 ? '#f87171' : stR > 0.18 ? '#facc15' : '#4ade80';
    if (stR > 0) { roundRect(ctx, px, py + 24, pw * stR, 10, 5); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '11px sans-serif';
    ctx.fillText('鱼的体力', px, py + 48);
    // 侧向施压指示
    const sx = px + pw / 2, sy = py + 58, sw = pw * 0.5;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(sx - sw / 2, sy - 1, sw, 3);
    ctx.fillStyle = '#93c5fd';
    ctx.beginPath(); ctx.arc(sx + this.rodSide * sw / 2, sy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center';
    if (!f.junk && Math.abs(this.fishLat) > 0.35 && f.mode !== 'tired') {
      const fishRight = this.fishLat > 0;
      ctx.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif';
      const ok = this.sideGood > 0.25;
      ctx.fillStyle = ok ? '#86efac' : '#fde68a';
      ctx.fillText(ok ? '✔ 侧压到位，鱼在消耗体力' : (fishRight ? '鱼往右游 → 鼠标往左 压竿 ◀' : '▶ 鼠标往右 压竿 ← 鱼往左游'), sx, sy + 18);
    } else {
      ctx.font = '11px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('竿的侧向', sx, sy + 16);
    }

    // --- 鱼的位置标记 ---
    const mp = Scene3D.project(new THREE.Vector3(f.x, 0.2, f.z));
    if (mp.front) {
      const x = U3.clamp(mp.x, 30, W - 90), y = U3.clamp(mp.y, 110, H - 60);
      const run = f.mode === 'run' || f.mode === 'jump';
      ctx.strokeStyle = run ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = run ? 2.5 : 1.5;
      ctx.beginPath(); ctx.arc(x, y, run ? 18 + Math.sin(t * 14) * 4 : 13, 0, Math.PI * 2); ctx.stroke();
    }

    // --- 左下：渔轮信息 ---
    this.drawDragChip(ctx, 16, H - 70);

    // --- 提示 ---
    let tip = '按住左键/空格 收线 · 鼠标左右 侧压 · 鼠标上下 竿高 · 滚轮 卸力';
    if (this.slack) tip = '⚠ 线松了！快按住左键收线！';
    else if (f.mode === 'jump') tip = '⚠ 鱼跃出水面！鼠标下移 压低鱼竿，别让它甩钩！';
    else if (this.slipping && this.reeling) tip = '卸力在出线，此时收线无效 —— 等鱼冲完，或滚轮调高卸力';
    else if (f.mode === 'tired') tip = '鱼没力气了！持续收线把它拉到脚下';
    else if (f.mode === 'run') tip = '鱼在冲刺，让卸力出线消耗它，别硬拉';
    ctx.textAlign = 'center';
    this.hint(ctx, tip, H - 22);
  },

  drawHelp(ctx) {
    const W = this.W, H = this.H;
    const lines = [
      ['🎯 瞄准', '移动鼠标环视水面'],
      ['🎣 抛竿', '按住左键 → 鼠标下拉后摆 → 快速上甩并松开（甩得越快越远）'],
      ['', '或按住空格蓄力，松开抛出（显示落点）'],
      ['⏳ 等待', '轻点左键=逗钓（诱鱼）· 按住左键/R=收线 · 滚轮调卸力'],
      ['❗ 提竿', '浮漂被拉入水中时：点击左键 或 快速向上甩鼠标'],
      ['🌀 收线', '按住左键 / 空格；卸力出线时收线无效'],
      ['↔ 侧压', '鼠标往鱼游动的反方向移动，鱼消耗体力更快'],
      ['↕ 竿高', '鼠标上移=抬竿加压（快速上抬=泵竿）；鱼跳出水面时要压低'],
      ['⚙ 卸力', '滚轮 / ↑↓：张力超过卸力值会自动出线，高于红线会断线'],
      ['⬆ 提鱼', '鱼到脚下后按住左键或把鼠标移到上方'],
    ];
    const bw = Math.min(620, W - 40), bh = 44 + lines.length * 26;
    const bx = W / 2 - bw / 2, by = H / 2 - bh / 2;
    this.panel(ctx, bx, by, bw, bh, 14, 0.82);
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('操作说明（H 关闭）', bx + 20, by + 28);
    ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif';
    lines.forEach(([a, b], i) => {
      ctx.fillStyle = '#93c5fd'; ctx.fillText(a, bx + 20, by + 56 + i * 26);
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillText(b, bx + 92, by + 56 + i * 26);
    });
    ctx.textAlign = 'center';
  },
};

// 工具
function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
