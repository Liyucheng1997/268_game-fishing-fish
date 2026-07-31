// ===================== 钓鱼玩法：状态机 + HUD（渲染由 Scene3D 负责） =====================
'use strict';

const Fishing = {
  wrap: null, hudCanvas: null, hud: null, W: 800, H: 500,
  state: 'idle', // idle | charging | casting | waiting | bite | fight | landed
  pressing: false,

  // 抛竿
  power: 0, chargeDir: 1,
  castT: 0, castDur: 0.85, castDist: 0, castYaw: 0,

  // 等待咬钩
  waitT: 0, biteAt: 0, nibbles: [], nibbleFx: 0,
  biteT: 0, biteWindow: 0.85,

  // 战斗
  fish: null, // {sp|junk, weight, strength, stamina, maxStamina, dist, az, mode, modeT, dashDir}
  tension: 30, breakMeter: 0, slackT: 0, fightT: 0,
  reelTickT: 0, strainT: 0,

  shake: 0, msg: '', msgT: 0, msgColor: '#fff',

  init(wrap, glCanvas, hudCanvas) {
    this.wrap = wrap;
    this.hudCanvas = hudCanvas;
    this.hud = hudCanvas.getContext('2d');
    Scene3D.init(glCanvas);

    const down = (e) => { e.preventDefault(); Sound.unlock(); this.onDown(); };
    const up = (e) => { e.preventDefault(); this.onUp(); };
    wrap.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    wrap.addEventListener('pointermove', (e) => {
      const rect = wrap.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      Scene3D.setAim(Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, ny)));
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && UI.tab === 'fishing' && !UI.modalOpen()) { e.preventDefault(); Sound.unlock(); this.onDown(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && UI.tab === 'fishing' && !UI.modalOpen()) { e.preventDefault(); this.onUp(); }
    });
    this.resize();
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
    this.castDist = 6 + p * 0.88;
    this.castYaw = Scene3D.camYaw;
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
    this.nibbles = [];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.nibbles.push(this.biteAt * (0.25 + 0.6 * (i + Math.random() * 0.7) / n));
    }
    this.nibbleFx = 0;
  },

  tryHook() {
    const nearNibble = this.nibbles.some(t => Math.abs(this.waitT - t) < 0.45) || this.nibbleFx > 0;
    if (nearNibble) {
      this.showMsg('提竿太早，鱼被吓跑了！', '#fca5a5');
      Sound.escape();
      this.startWaiting();
    } else {
      this.state = 'idle';
      this.showMsg('收竿了', '#e2e8f0');
    }
  },

  // ---------- 选鱼 ----------
  pickCatch() {
    const junkP = this.castDist < 35 ? 0.12 : this.castDist < 70 ? 0.07 : 0.04;
    if (Math.random() < junkP) {
      return { junk: JUNK_DB[Math.floor(Math.random() * JUNK_DB.length)] };
    }
    const zone = this.castDist < 35 ? 0 : this.castDist < 70 ? 1 : 2;
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
        stamina: 8, maxStamina: 8, dist: this.castDist, az: this.castYaw,
        mode: 'tired', modeT: 99, dashDir: 0,
      };
    } else {
      const sp = pick.sp;
      const t = Math.pow(Math.random(), 1.7);
      const weight = +(sp.minW + (sp.maxW - sp.minW) * t).toFixed(2);
      const sizeF = 0.75 + 0.5 * (weight / sp.maxW);
      this.fish = {
        sp, weight,
        strength: Math.min(1, sp.strength * sizeF),
        dashRate: sp.dashRate,
        maxStamina: sp.stamina * sizeF,
        stamina: sp.stamina * sizeF,
        dist: this.castDist, az: this.castYaw,
        mode: 'calm', modeT: 0, dashDir: 0,
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
    if (this.nibbleFx > 0) this.nibbleFx -= dt;

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
          Scene3D.splash(this.castDist, this.castYaw, 1);
          this.startWaiting();
        }
        break;
      }
      case 'waiting': {
        this.waitT += dt;
        for (let i = this.nibbles.length - 1; i >= 0; i--) {
          if (this.waitT >= this.nibbles[i]) {
            this.nibbles.splice(i, 1);
            this.nibbleFx = 0.5;
            Sound.nibble();
            Scene3D.ripple(this.castDist, this.castYaw, 0.7);
          }
        }
        if (this.waitT >= this.biteAt) {
          this.state = 'bite';
          this.biteT = 0;
          Sound.bite();
          Scene3D.splash(this.castDist, this.castYaw, 0.8);
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
            f.dashDir = Math.random() < 0.5 ? -1 : 1;
            Sound.dash(); this.shake = 4;
          } else f.modeT = 0.5 + Math.random() * 0.8;
        }
      }
    }

    // 鱼左右游动（冲刺时大幅横移）
    if (!f.junk) {
      if (f.mode === 'dash') f.az += f.dashDir * 0.5 * dt;
      else if (f.mode === 'calm') f.az += (Math.random() - 0.5) * 0.5 * dt;
      f.az = Math.max(-0.62, Math.min(0.62, f.az));
    }

    // 拉力
    const s = f.strength;
    let pull;
    if (f.mode === 'dash') pull = 52 + s * 40;
    else if (f.mode === 'tired') pull = 8 + s * 8;
    else pull = 17 + s * 22;

    // 竿尖没对准鱼 → 额外张力（跟着鱼的方向压竿）
    const misalign = Math.max(0, Math.abs(f.az - Scene3D.camYaw) - 0.07);
    const misPenalty = Math.min(15, misalign * 34);

    // 张力趋近目标
    const target = this.pressing ? pull + 26 + s * 24 + misPenalty : pull - 38 + misPenalty * 0.4;
    const rate = this.pressing ? 90 : 120;
    this.tension += Math.sign(target - this.tension) * Math.min(Math.abs(target - this.tension), rate * dt);
    this.tension += (Math.random() - 0.5) * 1.2;
    this.tension = Math.max(0, Math.min(110, this.tension));

    // 距离（竿尖没对准鱼时收线效率大减）
    if (this.pressing) {
      let reel;
      if (f.mode === 'dash') reel = rod.reel * 0.1;
      else if (f.mode === 'tired') reel = rod.reel * 1.5;
      else reel = rod.reel * (1 - s * 0.55);
      reel *= 1 - Math.min(0.5, misalign * 1.1);
      f.dist -= reel * dt;
      this.reelTickT -= dt;
      if (this.reelTickT <= 0) { Sound.reelTick(); this.reelTickT = 0.09; }
    } else {
      if (f.mode === 'dash') f.dist += (3.2 + s * 3) * dt;
      else if (f.mode === 'calm') f.dist += 0.6 * dt;
    }

    // 体力
    if (!f.junk) {
      if (this.tension > 30) {
        f.stamina -= (this.tension / 100) * (f.mode === 'dash' ? 16 : 7.5) * dt;
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

    if (f.dist > this.castDist + 22) { this.fightFail('spool'); return; }
    if (f.dist <= 0.5) { this.landFish(); return; }

    // 水花
    if (Math.random() < (f.mode === 'dash' ? 0.5 : 0.1)) {
      Scene3D.ripple(f.dist, f.az, 0.8);
      if (f.mode === 'dash' && Math.random() < 0.5) Scene3D.splash(f.dist, f.az, 0.6);
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
    Scene3D.splash(2, f.az, 1.4);
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

  finishCatch() {
    this.fish = null;
    this.state = 'idle';
  },

  showMsg(m, color = '#fff') { this.msg = m; this.msgColor = color; this.msgT = 2.2; },

  // ---------- 渲染（3D + HUD 叠加） ----------
  render(t, dt) {
    Scene3D.render(dt, t, this);
    const ctx = this.hud;
    ctx.clearRect(0, 0, this.W, this.H);
    this.drawHUD(ctx, t);
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

    // 浮漂 / 鱼位置的屏幕标记
    if (this.state === 'waiting' || this.state === 'bite') {
      const w = Scene3D.bobberWorld(this.castDist, this.castYaw);
      w.y = 0.3;
      const p = Scene3D.project(w);
      if (p.vis) {
        if (this.state === 'bite') {
          const bob = Math.sin(t * 14) * 5;
          ctx.font = 'bold 34px sans-serif';
          ctx.fillStyle = '#ff5252';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.strokeText('❗', p.x, p.y - 34 + bob);
          ctx.fillText('❗', p.x, p.y - 34 + bob);
          ctx.strokeStyle = 'rgba(255,82,82,0.9)';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, 16 + Math.sin(t * 12) * 4, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, 13 + Math.sin(t * 2.5) * 2, 0, Math.PI * 2); ctx.stroke();
        }
      }
    } else if (this.state === 'fight' && this.fish) {
      const f = this.fish;
      const w = Scene3D.bobberWorld(f.dist, f.az);
      w.y = 0.2;
      const p = Scene3D.project(w);
      if (p.vis) {
        const dash = f.mode === 'dash';
        ctx.strokeStyle = dash ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.4)';
        ctx.lineWidth = dash ? 2.5 : 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, dash ? 20 + Math.sin(t * 14) * 5 : 15, 0, Math.PI * 2); ctx.stroke();
        if (dash) {
          ctx.font = 'bold 15px sans-serif';
          ctx.fillStyle = '#fbbf24';
          ctx.fillText('💨 松手！', p.x, p.y - 28);
        }
      }
    }

    // 状态提示
    let hint = '';
    if (this.state === 'idle') hint = '移动鼠标瞄准 · 按住 左键/空格 蓄力，松开抛竿';
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
      const d = Math.round(6 + Math.max(12, this.power) * 0.88);
      ctx.fillText(`力度 ${Math.round(this.power)}% · 预计 ${d}m — 越远越容易钓到稀有鱼`, W / 2, by - 12);
    }

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
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, bx, by, bw, bh, 6); ctx.fill();
    const safeY = by + bh * (1 - rod.safe / 110);
    ctx.fillStyle = 'rgba(248,113,113,0.28)';
    roundRect(ctx, bx, by, bw, safeY - by, 6); ctx.fill();
    ctx.fillStyle = 'rgba(74,222,128,0.2)';
    ctx.fillRect(bx, by + bh * (1 - 80 / 110), bw, bh * ((80 - 15) / 110));
    const tenH = bh * (this.tension / 110);
    const danger = this.tension > rod.safe;
    const low = this.tension < 11;
    ctx.fillStyle = danger ? '#ef4444' : low ? '#94a3b8' : this.tension > 65 ? '#facc15' : '#4ade80';
    roundRect(ctx, bx + 3, by + bh - tenH, bw - 6, tenH, 4); ctx.fill();
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
    ctx.fillText(`${name}  ${f.mode === 'dash' ? '💨 冲刺！松手！' : f.mode === 'tired' ? '😮‍💨 没力气了' : '🐟'}`, px, py + 10);
    ctx.fillStyle = '#334155';
    roundRect(ctx, px, py + 18, pw, 12, 6); ctx.fill();
    const stR = f.stamina / f.maxStamina;
    ctx.fillStyle = stR > 0.5 ? '#f87171' : stR > 0.18 ? '#facc15' : '#4ade80';
    if (stR > 0) { roundRect(ctx, px, py + 18, pw * stR, 12, 6); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '11px sans-serif';
    ctx.fillText('鱼的体力', px + 4, py + 28);
    ctx.fillStyle = '#334155';
    roundRect(ctx, px, py + 40, pw, 12, 6); ctx.fill();
    const dR = 1 - Math.min(1, f.dist / Math.max(this.castDist, 1));
    ctx.fillStyle = '#38bdf8';
    if (dR > 0) { roundRect(ctx, px, py + 40, pw * Math.max(0.02, dR), 12, 6); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`距离 ${f.dist.toFixed(1)}m`, px + 4, py + 50);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('按住收线 · 冲刺时松手 · 鼠标跟住鱼的方向减小张力', px, py + 68);

    // --- 鱼方向指示箭头 ---
    const diff = f.az - Scene3D.camYaw;
    if (Math.abs(diff) > 0.1) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = Math.abs(diff) > 0.25 ? '#fbbf24' : 'rgba(255,255,255,0.8)';
      const arrow = diff > 0 ? '◀' : '▶';
      const ax = diff > 0 ? W * 0.18 : W * 0.82;
      ctx.fillText(`${arrow} 鱼在这边`, ax, H * 0.45);
    }
  },
};

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
