// ===================== 钓鱼场景：状态机 + 渲染 =====================
'use strict';

const Fishing = {
  canvas: null, ctx: null, W: 800, H: 500,
  state: 'idle', // idle | charging | casting | waiting | bite | fight | landed
  pressing: false,

  // 抛竿
  power: 0, chargeDir: 1,
  castT: 0, castDur: 0.8, castDist: 0,

  // 等待咬钩
  waitT: 0, biteAt: 0, nibbles: [], nibbleFx: 0,
  biteT: 0, biteWindow: 0.85,

  // 战斗
  fish: null,       // {sp|junk, weight, strength, stamina, maxStamina, dist, mode, modeT, junk}
  tension: 30, breakMeter: 0, slackT: 0, fightT: 0,
  reelTickT: 0, strainT: 0,

  // 视觉
  bobberY: 0, splashes: [], ripples: [], rainDrops: [], clouds: [],
  shake: 0, msg: '', msgT: 0, msgColor: '#fff',
  birds: [],

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    for (let i = 0; i < 4; i++) {
      this.clouds.push({ x: Math.random(), y: 0.06 + Math.random() * 0.15, s: 0.5 + Math.random(), spd: 0.004 + Math.random() * 0.006 });
    }
    const down = (e) => { e.preventDefault(); Sound.unlock(); this.onDown(); };
    const up = (e) => { e.preventDefault(); this.onUp(); };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && UI.tab === 'fishing' && !UI.modalOpen()) { e.preventDefault(); Sound.unlock(); this.onDown(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && UI.tab === 'fishing' && !UI.modalOpen()) { e.preventDefault(); this.onUp(); }
    });
    this.resize();
  },

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(320, rect.width);
    this.H = Math.max(300, rect.height);
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  // ---------- 输入 ----------
  onDown() {
    if (UI.modalOpen()) return;
    switch (this.state) {
      case 'idle':
        this.state = 'charging'; this.power = 0; this.chargeDir = 1;
        break;
      case 'waiting': this.tryHook(); break;
      case 'bite': this.hookFish(); break;
      case 'fight': this.pressing = true; break;
    }
  },

  onUp() {
    if (this.state === 'charging') this.doCast();
    this.pressing = false;
  },

  doCast() {
    const p = Math.max(12, this.power);
    this.castDist = 6 + p * 0.88; // 6 ~ 94 m
    this.state = 'casting';
    this.castT = 0;
    State.stats.casts++;
    consumeBait();
    UI.refreshBaitBar();
    Sound.cast();
  },

  startWaiting() {
    this.state = 'waiting';
    this.waitT = 0;
    const bait = baitById(State.bait);
    const wx = WEATHERS[State.weather];
    const base = 3.5 + Math.random() * 9;
    this.biteAt = base / (bait.biteSpd * wx.bite);
    // 咬钩前的试探
    this.nibbles = [];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = this.biteAt * (0.25 + 0.6 * (i + Math.random() * 0.7) / n);
      this.nibbles.push(t);
    }
    this.nibbleFx = 0;
  },

  tryHook() {
    // 等待中提竿：靠近试探期算吓跑鱼，否则收竿
    const nearNibble = this.nibbles.some(t => Math.abs(this.waitT - t) < 0.45) || this.nibbleFx > 0;
    if (nearNibble) {
      this.showMsg('提竿太早，鱼被吓跑了！', '#fca5a5');
      Sound.escape();
      this.startWaiting(); // 重新等待（不耗饵）
    } else {
      this.state = 'idle';
      this.showMsg('收竿了', '#e2e8f0');
    }
  },

  // ---------- 选鱼 ----------
  pickCatch() {
    // 垃圾概率随距离降低
    const junkP = this.castDist < 35 ? 0.12 : this.castDist < 70 ? 0.07 : 0.04;
    if (Math.random() < junkP) {
      const j = JUNK_DB[Math.floor(Math.random() * JUNK_DB.length)];
      return { junk: j };
    }
    const zone = this.castDist < 35 ? 0 : this.castDist < 70 ? 1 : 2;
    const bait = baitById(State.bait);
    const wx = WEATHERS[State.weather];
    const night = isNight();
    const pool = FISH_DB.filter(f => f.loc === State.location);
    // 区域权重（远投更容易出好鱼）
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
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return { sp: pool[i] };
    }
    return { sp: pool[0] };
  },

  hookFish() {
    const pick = this.pickCatch();
    Sound.hook();
    this.shake = 5;
    if (pick.junk) {
      this.fish = {
        junk: pick.junk, weight: 0, strength: 0.06, dashRate: 0,
        stamina: 8, maxStamina: 8, dist: this.castDist, mode: 'tired', modeT: 99,
      };
    } else {
      const sp = pick.sp;
      const t = Math.pow(Math.random(), 1.7); // 偏小
      const weight = +(sp.minW + (sp.maxW - sp.minW) * t).toFixed(2);
      const sizeF = 0.75 + 0.5 * (weight / sp.maxW);
      this.fish = {
        sp, weight,
        strength: Math.min(1, sp.strength * sizeF),
        dashRate: sp.dashRate,
        maxStamina: sp.stamina * sizeF,
        stamina: sp.stamina * sizeF,
        dist: this.castDist,
        mode: 'calm', modeT: 0,
      };
    }
    this.state = 'fight';
    this.fightT = 0;
    this.tension = 35;
    this.breakMeter = 0;
    this.slackT = 0;
    this.pressing = false;
  },

  // ---------- 更新 ----------
  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 12);
    if (this.msgT > 0) this.msgT -= dt;
    this.splashes = this.splashes.filter(s => (s.t += dt) < s.dur);
    this.ripples = this.ripples.filter(r => (r.t += dt) < r.dur);
    this.clouds.forEach(c => { c.x += c.spd * dt; if (c.x > 1.2) c.x = -0.2; });
    if (this.nibbleFx > 0) this.nibbleFx -= dt;

    // 雨滴
    if (State.weather === 'rain') {
      for (let i = 0; i < 3; i++) this.rainDrops.push({ x: Math.random() * this.W, y: -10, v: 500 + Math.random() * 250 });
    }
    this.rainDrops = this.rainDrops.filter(d => (d.y += d.v * ((dt < 0.1) ? dt : 0.016)) < this.H + 10);

    switch (this.state) {
      case 'charging': {
        this.power += this.chargeDir * 130 * dt;
        if (this.power >= 100) { this.power = 100; this.chargeDir = -1; }
        if (this.power <= 0) { this.power = 0; this.chargeDir = 1; }
        break;
      }
      case 'casting': {
        this.castT += dt;
        if (this.castT >= this.castDur) {
          Sound.splash();
          const bp = this.bobberPos(this.castDist);
          this.addSplash(bp.x, bp.y, bp.scale);
          this.startWaiting();
        }
        break;
      }
      case 'waiting': {
        this.waitT += dt;
        // 试探
        for (let i = this.nibbles.length - 1; i >= 0; i--) {
          if (this.waitT >= this.nibbles[i]) {
            this.nibbles.splice(i, 1);
            this.nibbleFx = 0.5;
            Sound.nibble();
            const bp = this.bobberPos(this.castDist);
            this.addRipple(bp.x, bp.y, bp.scale * 0.7);
          }
        }
        if (this.waitT >= this.biteAt) {
          this.state = 'bite';
          this.biteT = 0;
          Sound.bite();
          const bp = this.bobberPos(this.castDist);
          this.addSplash(bp.x, bp.y, bp.scale * 0.8);
        }
        break;
      }
      case 'bite': {
        this.biteT += dt;
        if (this.biteT > this.biteWindow) {
          this.showMsg('慢了一步，鱼跑了…', '#fca5a5');
          Sound.escape();
          this.startWaiting();
        }
        break;
      }
      case 'fight': this.updateFight(dt); break;
    }
  },

  updateFight(dt) {
    const f = this.fish;
    this.fightT += dt;
    const rod = rodById(State.rod);
    const line = lineById(State.line);

    // 鱼状态机
    f.modeT -= dt;
    if (!f.junk) {
      const tired = f.stamina <= f.maxStamina * 0.18;
      if (tired && f.mode !== 'tired') { f.mode = 'tired'; this.showMsg('鱼没劲了，快收线！', '#86efac'); }
      if (!tired && f.modeT <= 0) {
        if (f.mode === 'dash') { f.mode = 'calm'; f.modeT = 1.2 + Math.random() * 2.2; }
        else {
          const p = (0.3 + f.dashRate) * 0.55;
          if (Math.random() < p) {
            f.mode = 'dash'; f.modeT = 0.7 + Math.random() * 1.1;
            Sound.dash(); this.shake = 4;
          } else f.modeT = 0.5 + Math.random() * 0.8;
        }
      }
    }

    // 拉力
    const s = f.strength;
    let pull;
    if (f.mode === 'dash') pull = 52 + s * 40;
    else if (f.mode === 'tired') pull = 8 + s * 8;
    else pull = 17 + s * 22;

    // 张力趋近目标（鱼越有劲，收线时张力越高，低级竿要收收停停）
    const target = this.pressing ? pull + 26 + s * 24 : pull - 38;
    const rate = this.pressing ? 90 : 120;
    this.tension += Math.sign(target - this.tension) * Math.min(Math.abs(target - this.tension), rate * dt);
    this.tension += (Math.random() - 0.5) * 6 * dt * 10 * 0.2; // 抖动
    this.tension = Math.max(0, Math.min(110, this.tension));

    // 距离
    if (this.pressing) {
      let reel;
      if (f.mode === 'dash') reel = rod.reel * 0.1;
      else if (f.mode === 'tired') reel = rod.reel * 1.5;
      else reel = rod.reel * (1 - s * 0.55);
      f.dist -= reel * dt;
      this.reelTickT -= dt;
      if (this.reelTickT <= 0) { Sound.reelTick(); this.reelTickT = 0.09; }
    } else {
      if (f.mode === 'dash') f.dist += (3.2 + s * 3) * dt;
      else if (f.mode === 'calm') f.dist += 0.6 * dt;
    }

    // 体力消耗 / 恢复
    if (!f.junk) {
      if (this.tension > 30) {
        const drain = (this.tension / 100) * (f.mode === 'dash' ? 16 : 7.5);
        f.stamina -= drain * dt;
      } else if (this.tension < 15) {
        f.stamina += 2.5 * dt;
      }
      f.stamina = Math.max(0, Math.min(f.maxStamina, f.stamina));
    }

    // 断线
    if (this.tension > rod.safe) {
      this.breakMeter += ((this.tension - rod.safe) / 12) * dt;
      this.strainT -= dt;
      if (this.strainT <= 0) { Sound.strain(); this.strainT = 0.25; }
      this.shake = Math.max(this.shake, 2.5);
      if (this.breakMeter >= line.hp) { this.fightFail('break'); return; }
    } else {
      this.breakMeter = Math.max(0, this.breakMeter - 0.45 * dt);
    }

    // 松线脱钩
    if (this.tension < 11 && f.dist > 3) {
      this.slackT += dt;
      if (this.slackT > 2.6) { this.fightFail('slack'); return; }
    } else this.slackT = Math.max(0, this.slackT - dt * 2);

    // 线放光
    if (f.dist > 97) { this.fightFail('spool'); return; }

    // 上岸
    if (f.dist <= 0.5) { this.landFish(); return; }

    // 战斗中的水花
    if (Math.random() < (f.mode === 'dash' ? 0.35 : 0.08)) {
      const bp = this.bobberPos(f.dist);
      this.addRipple(bp.x, bp.y, bp.scale * 0.8);
    }
  },

  fightFail(reason) {
    const msgs = {
      break: ['啪！鱼线断了！', '#f87171'],
      slack: ['线太松，鱼脱钩跑了…', '#fca5a5'],
      spool: ['鱼把线全拉走了！', '#f87171'],
    };
    const [m, c] = msgs[reason];
    this.showMsg(m, c);
    if (reason === 'break') { Sound.snap(); State.stats.broken++; }
    else Sound.escape();
    State.stats.escaped++;
    this.fish = null;
    this.state = 'idle';
    this.shake = 6;
    saveGame();
  },

  landFish() {
    const f = this.fish;
    this.state = 'landed';
    const bp = this.bobberPos(2);
    this.addSplash(bp.x, bp.y, 1.2);
    if (f.junk) {
      Sound.splash();
      UI.showCatchResult(f);
    } else {
      recordCatch(f.sp.id, f.weight);
      if (f.sp.rarity === 'legend') Sound.legend(); else Sound.catch_();
      UI.showCatchResult(f);
    }
    saveGame();
  },

  finishCatch() { // 结算面板关闭后
    this.fish = null;
    this.state = 'idle';
  },

  // ---------- 视觉辅助 ----------
  horizonY() { return this.H * 0.38; },

  // 距离(m) → 屏幕位置
  bobberPos(dist) {
    const t = Math.min(1, dist / 100);
    const tt = Math.pow(t, 0.75); // 近处拉开距离
    const x = 175 + (this.W - 255) * tt;
    const y = this.H * 0.82 - (this.H * 0.82 - (this.horizonY() + 14)) * tt;
    const scale = 1 - 0.55 * tt;
    return { x, y, scale };
  },

  rodTip() {
    // 竿尖位置（受张力弯曲）
    const bend = this.state === 'fight' ? this.tension / 110 : (this.state === 'charging' ? -this.power / 250 : 0);
    const baseX = 148, baseY = this.H * 0.62;
    const tipX = baseX + 66 - bend * 34;
    const tipY = baseY - 108 + bend * 60;
    return { baseX, baseY, tipX, tipY, bend };
  },

  addSplash(x, y, scale) {
    const drops = [];
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const v = 60 + Math.random() * 90;
      drops.push({ dx: Math.cos(a) * v, dy: Math.sin(a) * v });
    }
    this.splashes.push({ x, y, scale, t: 0, dur: 0.6, drops });
    this.addRipple(x, y, scale);
  },

  addRipple(x, y, scale) {
    this.ripples.push({ x, y, scale, t: 0, dur: 1.1 });
  },

  showMsg(m, color = '#fff') { this.msg = m; this.msgColor = color; this.msgT = 2.2; },

  // ---------- 渲染 ----------
  skyColors() {
    const h = State.gameHour;
    // 关键帧: [hour, top, bottom]
    const keys = [
      [0, '#0b1026', '#1a2547'], [4.5, '#0b1026', '#1a2547'],
      [6.5, '#f6a05c', '#ffd9a0'], [8, '#78c4e8', '#cdeafc'],
      [12, '#5fb3e6', '#bfe3f8'], [16.5, '#78c4e8', '#cdeafc'],
      [18.5, '#f08a4b', '#ffcf90'], [20.5, '#1c2951', '#31406e'],
      [24, '#0b1026', '#1a2547'],
    ];
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (h >= keys[i][0] && h <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    }
    const t = (h - a[0]) / Math.max(0.001, b[0] - a[0]);
    return [lerpColor(a[1], b[1], t), lerpColor(a[2], b[2], t)];
  },

  render(t) {
    const ctx = this.ctx, W = this.W, H = this.H;
    const hy = this.horizonY();
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake * 2, (Math.random() - 0.5) * this.shake * 2);

    // --- 天空 ---
    const [skyTop, skyBot] = this.skyColors();
    const sg = ctx.createLinearGradient(0, 0, 0, hy);
    sg.addColorStop(0, skyTop); sg.addColorStop(1, skyBot);
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, hy);

    const night = isNight();
    // 星星
    if (night) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 97.3) % W, sy = ((i * 53.7) % (hy * 0.85));
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i));
        ctx.globalAlpha = tw * 0.8;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    // 日月
    const h = State.gameHour;
    const dayT = (h - 5) / 15; // 5点升起 20点落下
    if (dayT > 0 && dayT < 1) {
      const sx = W * (0.15 + 0.7 * dayT);
      const sy = hy - Math.sin(dayT * Math.PI) * hy * 0.75;
      ctx.fillStyle = '#fff3b0';
      ctx.shadowColor = '#ffe082'; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.arc(sx, sy, 22, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      const nt = h >= 20 ? (h - 20) / 9 : (h + 4) / 9;
      const mx = W * (0.15 + 0.7 * nt);
      const my = hy - Math.sin(nt * Math.PI) * hy * 0.75;
      ctx.fillStyle = '#f5f3ce';
      ctx.shadowColor = '#f5f3ce'; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(mx, my, 16, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = skyTop;
      ctx.beginPath(); ctx.arc(mx + 7, my - 4, 13, 0, Math.PI * 2); ctx.fill();
    }
    // 云
    ctx.fillStyle = night ? 'rgba(200,210,235,0.18)' : 'rgba(255,255,255,0.85)';
    this.clouds.forEach(c => {
      const cx = c.x * W, cy = c.y * H, s = c.s;
      ctx.beginPath();
      ctx.arc(cx, cy, 18 * s, 0, Math.PI * 2);
      ctx.arc(cx + 20 * s, cy - 6 * s, 14 * s, 0, Math.PI * 2);
      ctx.arc(cx + 38 * s, cy, 15 * s, 0, Math.PI * 2);
      ctx.arc(cx + 18 * s, cy + 6 * s, 15 * s, 0, Math.PI * 2);
      ctx.fill();
    });

    // 远山
    const loc = LOCATIONS[State.location];
    ctx.fillStyle = night ? 'rgba(30,40,70,0.9)' : 'rgba(90,120,140,0.45)';
    ctx.beginPath();
    ctx.moveTo(0, hy);
    for (let x = 0; x <= W; x += 30) {
      ctx.lineTo(x, hy - 12 - Math.abs(Math.sin(x * 0.011 + 2)) * 34);
    }
    ctx.lineTo(W, hy);
    ctx.closePath(); ctx.fill();

    // --- 水面 ---
    const wTop = night ? shadeColor(loc.water[0], -0.45) : loc.water[0];
    const wBot = night ? shadeColor(loc.water[1], -0.45) : loc.water[1];
    const wg = ctx.createLinearGradient(0, hy, 0, H);
    wg.addColorStop(0, wTop); wg.addColorStop(1, wBot);
    ctx.fillStyle = wg;
    ctx.fillRect(0, hy, W, H - hy);

    // 波纹线
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const wy = hy + 14 + i * ((H - hy) / 7.5);
      const amp = 1.5 + i * 0.9;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const yy = wy + Math.sin(x * 0.025 + t * (1.1 + i * 0.12) + i * 2) * amp;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    // 涟漪
    this.ripples.forEach(r => {
      const p = r.t / r.dur;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - p)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, (8 + p * 42) * r.scale, (3 + p * 15) * r.scale, 0, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 水花
    this.splashes.forEach(s => {
      const p = s.t / s.dur;
      ctx.fillStyle = `rgba(230,245,255,${0.9 * (1 - p)})`;
      s.drops.forEach(d => {
        const dx = s.x + d.dx * s.t * s.scale;
        const dy = s.y + (d.dy * s.t + 200 * s.t * s.t) * s.scale;
        ctx.beginPath(); ctx.arc(dx, dy, 2.5 * s.scale * (1 - p * 0.5), 0, Math.PI * 2); ctx.fill();
      });
    });

    // --- 码头与钓手 ---
    this.drawDockAndAngler(ctx, t, night);

    // --- 鱼线 / 浮漂 / 战斗 ---
    this.drawTackle(ctx, t);

    // --- 雨 ---
    if (State.weather === 'rain') {
      ctx.strokeStyle = 'rgba(180,210,240,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      this.rainDrops.forEach(d => { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + 9); });
      ctx.stroke();
    }

    // --- 夜色遮罩 ---
    if (night) {
      ctx.fillStyle = 'rgba(8,12,40,0.18)';
      ctx.fillRect(0, 0, W, H);
    }

    // --- HUD ---
    this.drawHUD(ctx, t);

    ctx.restore();
  },

  drawDockAndAngler(ctx, t, night) {
    const H = this.H;
    const dockY = H * 0.66;
    // 码头
    ctx.fillStyle = night ? '#3a2d22' : '#6d4c33';
    ctx.fillRect(0, dockY, 168, 14);
    ctx.fillStyle = night ? '#2c2119' : '#5a3d27';
    ctx.fillRect(14, dockY + 14, 10, H - dockY);
    ctx.fillRect(130, dockY + 14, 10, H - dockY);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let x = 8; x < 160; x += 26) ctx.fillRect(x, dockY, 2, 14);

    // 钓手（简笔小人）
    const px = 96, py = dockY;
    const rt = this.rodTip();
    ctx.strokeStyle = '#2d3748';
    ctx.fillStyle = '#2d3748';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    // 腿
    ctx.beginPath();
    ctx.moveTo(px, py - 32); ctx.lineTo(px - 8, py);
    ctx.moveTo(px, py - 32); ctx.lineTo(px + 9, py);
    ctx.stroke();
    // 身体（战斗时后仰）
    const lean = this.state === 'fight' ? -this.tension * 0.1 : 0;
    const shx = px + 4 + lean * 0.4, shy = py - 58;
    ctx.beginPath(); ctx.moveTo(px, py - 32); ctx.lineTo(shx, shy); ctx.stroke();
    // 头 + 帽子
    ctx.beginPath(); ctx.arc(shx + 1, shy - 10, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d97706';
    ctx.beginPath(); ctx.arc(shx + 1, shy - 13, 10, Math.PI, 0); ctx.fill();
    ctx.fillRect(shx - 13, shy - 14, 28, 3);
    // 手臂 → 竿柄
    ctx.strokeStyle = '#2d3748';
    ctx.beginPath(); ctx.moveTo(shx, shy + 4); ctx.lineTo(rt.baseX, rt.baseY); ctx.stroke();

    // 鱼竿（弯曲）
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(rt.baseX, rt.baseY);
    const cpx = rt.baseX + 40, cpy = rt.baseY - 70 + rt.bend * 25;
    ctx.quadraticCurveTo(cpx, cpy, rt.tipX, rt.tipY);
    ctx.stroke();
  },

  drawTackle(ctx, t) {
    const rt = this.rodTip();
    const st = this.state;

    if (st === 'idle' || st === 'charging') {
      // 线垂下
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rt.tipX, rt.tipY);
      ctx.quadraticCurveTo(rt.tipX + 4, rt.tipY + 24, rt.tipX - 2, rt.tipY + 44);
      ctx.stroke();
      this.drawBobber(ctx, rt.tipX - 2, rt.tipY + 50, 1);
      return;
    }

    if (st === 'casting') {
      const p = this.castT / this.castDur;
      const target = this.bobberPos(this.castDist);
      const bx = rt.tipX + (target.x - rt.tipX) * p;
      const arc = Math.sin(p * Math.PI) * this.H * 0.28;
      const by = rt.tipY + (target.y - rt.tipY) * p - arc;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rt.tipX, rt.tipY);
      ctx.quadraticCurveTo((rt.tipX + bx) / 2, Math.min(rt.tipY, by) - 25, bx, by);
      ctx.stroke();
      this.drawBobber(ctx, bx, by, 1 - 0.4 * p);
      return;
    }

    if (st === 'waiting' || st === 'bite') {
      const bp = this.bobberPos(this.castDist);
      let dipY = Math.sin(t * 2.2) * 2.5; // 漂浮
      if (this.nibbleFx > 0) dipY += Math.sin(this.nibbleFx * 25) * 5 + 4;
      if (st === 'bite') dipY += 13 + Math.sin(t * 30) * 2.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rt.tipX, rt.tipY);
      const sag = 30 + this.castDist * 0.2;
      ctx.quadraticCurveTo((rt.tipX + bp.x) / 2, Math.max(rt.tipY, bp.y) + sag * 0.4, bp.x, bp.y + dipY - 6 * bp.scale);
      ctx.stroke();
      this.drawBobber(ctx, bp.x, bp.y + dipY, bp.scale);

      if (st === 'bite') {
        // 提示 ❗
        const bob = Math.sin(t * 14) * 4;
        ctx.font = `bold ${Math.round(34 * bp.scale + 12)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff5252';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeText('❗', bp.x, bp.y - 38 * bp.scale + bob);
        ctx.fillText('❗', bp.x, bp.y - 38 * bp.scale + bob);
      }
      return;
    }

    if (st === 'fight' && this.fish) {
      const f = this.fish;
      const bp = this.bobberPos(f.dist);
      // 鱼的位置左右摆
      const sway = Math.sin(t * (f.mode === 'dash' ? 9 : 3)) * (f.mode === 'dash' ? 22 : 9) * bp.scale;
      const fx = bp.x + sway, fy = bp.y;
      // 线（紧绷程度影响垂度）
      const tightness = this.tension / 110;
      ctx.strokeStyle = this.tension > rodById(State.rod).safe ? 'rgba(255,120,120,0.9)' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = this.tension > rodById(State.rod).safe ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.moveTo(rt.tipX, rt.tipY);
      const sag = (1 - tightness) * 55;
      ctx.quadraticCurveTo((rt.tipX + fx) / 2, Math.max(rt.tipY, fy) + sag, fx, fy);
      ctx.stroke();

      // 水下鱼影
      ctx.save();
      ctx.translate(fx, fy + 8 * bp.scale);
      ctx.globalAlpha = 0.45;
      ctx.scale(sway >= 0 ? -1 : 1, 1); // 朝远离方向
      const len = f.junk ? 30 : Math.min(90, 30 + (f.weight / (f.sp ? f.sp.maxW : 1)) * 55) * bp.scale + 14;
      if (f.junk) {
        ctx.globalAlpha = 0.7;
        ctx.font = `${Math.round(24 * bp.scale + 8)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('❓', 0, 8);
      } else {
        ctx.fillStyle = '#0a1520';
        drawFishShadow(ctx, len, t);
      }
      ctx.restore();

      if (f.mode === 'dash') {
        ctx.font = `bold ${Math.round(16 + 10 * bp.scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd54f';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        const dashTxt = '💨 冲刺！松手！';
        ctx.strokeText(dashTxt, fx, fy - 34 * bp.scale);
        ctx.fillText(dashTxt, fx, fy - 34 * bp.scale);
      }
    }
  },

  drawBobber(ctx, x, y, scale) {
    const r = 7 * scale;
    ctx.save();
    // 下半白
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI); ctx.fill();
    // 上半红
    ctx.fillStyle = '#e53935';
    ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.fill();
    // 顶杆
    ctx.strokeStyle = '#ffca28';
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y - r - 8 * scale); ctx.stroke();
    ctx.restore();
  },

  drawHUD(ctx, t) {
    const W = this.W, H = this.H;
    ctx.textAlign = 'center';

    // 顶部消息
    if (this.msgT > 0) {
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const tw = ctx.measureText(this.msg).width;
      roundRect(ctx, W / 2 - tw / 2 - 16, 18, tw + 32, 38, 10); ctx.fill();
      ctx.fillStyle = this.msgColor;
      ctx.fillText(this.msg, W / 2, 44);
    }

    // 状态提示
    let hint = '';
    if (this.state === 'idle') hint = '按住 屏幕/空格 蓄力，松开抛竿';
    else if (this.state === 'waiting') hint = '等鱼上钩… 浮漂猛沉时快点击提竿！';
    ctx.font = '14px sans-serif';
    if (hint) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      const tw = ctx.measureText(hint).width;
      roundRect(ctx, W / 2 - tw / 2 - 12, H - 40, tw + 24, 28, 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(hint, W / 2, H - 21);
    }

    // 蓄力条
    if (this.state === 'charging') {
      const bw = Math.min(340, W * 0.55), bh = 22;
      const bx = W / 2 - bw / 2, by = H - 74;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(ctx, bx - 4, by - 4, bw + 8, bh + 8, 8); ctx.fill();
      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0, '#4ade80'); grad.addColorStop(0.6, '#facc15'); grad.addColorStop(1, '#f87171');
      ctx.fillStyle = grad;
      roundRect(ctx, bx, by, bw * this.power / 100, bh, 6); ctx.fill();
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`力度 ${Math.round(this.power)}% — 越远越容易钓到稀有鱼`, W / 2, by - 12);
    }

    // 战斗面板
    if (this.state === 'fight' && this.fish) this.drawFightHUD(ctx);
  },

  drawFightHUD(ctx) {
    const W = this.W, H = this.H;
    const f = this.fish;
    const rod = rodById(State.rod);
    const line = lineById(State.line);

    // --- 右侧张力条 ---
    const bh = Math.min(240, H * 0.5), bw = 26;
    const bx = W - 58, by = H / 2 - bh / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, bx - 8, by - 30, bw + 16, bh + 66, 10); ctx.fill();
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('张力', bx + bw / 2, by - 12);
    // 底
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, bx, by, bw, bh, 6); ctx.fill();
    // 安全/危险区
    const safeY = by + bh * (1 - rod.safe / 110);
    ctx.fillStyle = 'rgba(248,113,113,0.28)';
    roundRect(ctx, bx, by, bw, safeY - by, 6); ctx.fill();
    ctx.fillStyle = 'rgba(74,222,128,0.2)';
    ctx.fillRect(bx, by + bh * (1 - 80 / 110), bw, bh * ((80 - 15) / 110));
    // 当前张力
    const tenH = bh * (this.tension / 110);
    const danger = this.tension > rod.safe;
    const low = this.tension < 11;
    ctx.fillStyle = danger ? '#ef4444' : low ? '#94a3b8' : this.tension > 65 ? '#facc15' : '#4ade80';
    roundRect(ctx, bx + 3, by + bh - tenH, bw - 6, tenH, 4); ctx.fill();
    // 断线积累
    if (this.breakMeter > 0.05) {
      const bp = Math.min(1, this.breakMeter / line.hp);
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.fillText('线', bx + bw / 2, by + bh + 16);
      ctx.fillStyle = '#334155';
      roundRect(ctx, bx - 2, by + bh + 22, bw + 4, 8, 4); ctx.fill();
      ctx.fillStyle = bp > 0.6 ? '#ef4444' : '#f97316';
      roundRect(ctx, bx - 2, by + bh + 22, (bw + 4) * (1 - bp), 8, 4); ctx.fill();
      if (bp > 0.5 && Math.sin(performance.now() / 80) > 0) {
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('要断线了!', bx + bw / 2 - 40, by + bh + 30);
      }
    }
    if (low && this.slackT > 1.0) {
      ctx.fillStyle = '#fca5a5';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('线太松!', bx + bw / 2, by + bh + 44);
    }

    // --- 顶部：鱼体力 + 距离 ---
    const pw = Math.min(380, W * 0.6);
    const px = W / 2 - pw / 2, py = 16;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, px - 12, py - 6, pw + 24, 78, 12); ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#fff';
    const name = f.junk ? '？？？' : (State.collection[f.sp.id] ? f.sp.name : '？？？');
    ctx.fillText(`${name}  ${f.mode === 'dash' ? '💨' : f.mode === 'tired' ? '😮‍💨' : '🐟'}`, px, py + 10);
    // 体力
    ctx.fillStyle = '#334155';
    roundRect(ctx, px, py + 18, pw, 12, 6); ctx.fill();
    const stR = f.stamina / f.maxStamina;
    ctx.fillStyle = stR > 0.5 ? '#f87171' : stR > 0.18 ? '#facc15' : '#4ade80';
    if (stR > 0) { roundRect(ctx, px, py + 18, pw * stR, 12, 6); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '11px sans-serif';
    ctx.fillText('鱼的体力', px + 4, py + 28);
    // 距离
    ctx.fillStyle = '#334155';
    roundRect(ctx, px, py + 40, pw, 12, 6); ctx.fill();
    const dR = 1 - Math.min(1, f.dist / Math.max(this.castDist, 1));
    ctx.fillStyle = '#38bdf8';
    if (dR > 0) { roundRect(ctx, px, py + 40, pw * Math.max(0.02, dR), 12, 6); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`距离 ${f.dist.toFixed(1)}m`, px + 4, py + 50);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('按住＝收线 · 鱼冲刺时松手，等它没力气', px, py + 68);
  },
};

// 战斗时水下鱼影（简化形状）
function drawFishShadow(ctx, len, t) {
  const wag = Math.sin(t * 8) * len * 0.08;
  ctx.beginPath();
  ctx.ellipse(0, 0, len / 2, len / 4, 0, 0, Math.PI * 2);
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(-len * 0.72, -len * 0.18 + wag);
  ctx.lineTo(-len * 0.72, len * 0.18 + wag);
  ctx.closePath();
  ctx.fill();
}

// 工具
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  if (r < 0) r = 0;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lerpColor(a, b, t) {
  const pa = hexRgb(a), pb = hexRgb(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function hexRgb(hex) {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
function shadeColor(hex, amt) {
  const [r, g, b] = hexRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
