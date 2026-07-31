// ===================== 鱼缸场景 =====================
'use strict';

const Aquarium = {
  canvas: null, ctx: null, W: 800, H: 500,
  swimmers: [],   // {tankFish, x, y, vx, vy, len, turnT, bobPhase}
  bubbles: [],
  plants: [],
  selected: null,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.onClick(e.clientX - rect.left, e.clientY - rect.top);
    });
    for (let i = 0; i < 6; i++) {
      this.plants.push({ x: 0.05 + Math.random() * 0.9, h: 40 + Math.random() * 70, sway: Math.random() * 6, w: 8 + Math.random() * 6 });
    }
    this.resize();
    this.syncFish();
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

  // 与 State.tank 同步游动个体
  syncFish() {
    const existing = new Map(this.swimmers.map(s => [s.tf.uid, s]));
    this.swimmers = State.tank.map(tf => {
      if (existing.has(tf.uid)) return existing.get(tf.uid);
      const sp = fishById(tf.spId);
      const len = 34 + Math.min(1, tf.weight / sp.maxW) * 44;
      return {
        tf, sp, len,
        x: 60 + Math.random() * (this.W - 120),
        y: 80 + Math.random() * (this.H - 180),
        vx: (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 22),
        vy: 0, turnT: 2 + Math.random() * 4,
        bobPhase: Math.random() * 10,
      };
    });
  },

  onClick(mx, my) {
    // 点鱼查看
    let hit = null;
    for (const s of this.swimmers) {
      const dx = mx - s.x, dy = my - s.y;
      if (Math.abs(dx) < s.len * 0.7 && Math.abs(dy) < s.len * 0.4) { hit = s; break; }
    }
    if (hit) { Sound.click(); UI.showFishInfo(hit.tf); }
  },

  update(dt) {
    const W = this.W, H = this.H;
    this.swimmers.forEach(s => {
      s.turnT -= dt;
      if (s.turnT <= 0) {
        s.turnT = 2 + Math.random() * 5;
        const speed = 10 + Math.random() * 26 * (60 / (s.len + 30));
        s.vx = (Math.random() < 0.5 ? -1 : 1) * speed;
        s.vy = (Math.random() - 0.5) * 14;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt + Math.sin(performance.now() / 900 + s.bobPhase) * 0.15;
      const m = s.len * 0.8;
      if (s.x < m) { s.x = m; s.vx = Math.abs(s.vx); }
      if (s.x > W - m) { s.x = W - m; s.vx = -Math.abs(s.vx); }
      if (s.y < 60) { s.y = 60; s.vy = Math.abs(s.vy); }
      if (s.y > H - 70) { s.y = H - 70; s.vy = -Math.abs(s.vy); }
    });

    // 气泡
    if (Math.random() < dt * 3) {
      this.bubbles.push({ x: 30 + Math.random() * (W - 60), y: H - 30, r: 2 + Math.random() * 4, v: 30 + Math.random() * 40, wob: Math.random() * 10 });
    }
    this.bubbles = this.bubbles.filter(b => (b.y -= b.v * dt) > 20);
  },

  render(t) {
    const ctx = this.ctx, W = this.W, H = this.H;
    // 水体
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a6b8a');
    g.addColorStop(1, '#0b3a52');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 光柱
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const lx = W * (0.2 + i * 0.3) + Math.sin(t * 0.4 + i) * 20;
      ctx.beginPath();
      ctx.moveTo(lx - 20, 0); ctx.lineTo(lx + 50, 0);
      ctx.lineTo(lx + 130, H); ctx.lineTo(lx + 30, H);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // 沙底
    ctx.fillStyle = '#c2a878';
    ctx.beginPath();
    ctx.moveTo(0, H - 34);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, H - 34 + Math.sin(x * 0.03) * 6);
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath(); ctx.fill();
    // 石头
    ctx.fillStyle = '#8d8478';
    [[0.12, 14], [0.55, 10], [0.82, 17]].forEach(([fx, r]) => {
      ctx.beginPath(); ctx.ellipse(W * fx, H - 30, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    });

    // 水草
    this.plants.forEach(p => {
      const px = p.x * W;
      ctx.strokeStyle = '#2e7d54';
      ctx.lineWidth = p.w * 0.45;
      ctx.lineCap = 'round';
      for (let b = -1; b <= 1; b++) {
        const sway = Math.sin(t * 0.9 + p.sway + b) * 9;
        ctx.beginPath();
        ctx.moveTo(px + b * 5, H - 28);
        ctx.quadraticCurveTo(px + b * 7 + sway * 0.5, H - 28 - p.h * 0.6, px + b * 4 + sway, H - 28 - p.h);
        ctx.stroke();
      }
    });

    // 鱼
    this.swimmers.forEach(s => {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(s.vx >= 0 ? 1 : -1, 1); // drawFish 头朝右，向左游时镜像
      drawFish(ctx, s.sp.v, s.len, t + s.bobPhase);
      ctx.restore();
    });

    // 气泡
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.2;
    this.bubbles.forEach(b => {
      ctx.beginPath();
      ctx.arc(b.x + Math.sin(b.y / 20 + b.wob) * 4, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 玻璃反光
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(W * 0.03, 0); ctx.lineTo(W * 0.13, 0); ctx.lineTo(W * 0.05, H); ctx.lineTo(W * 0.0, H * 0.7);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // 空缸提示
    if (State.tank.length === 0) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText('鱼缸空空如也，去钓几条鱼回来吧！', W / 2, H / 2);
    }
  },
};
