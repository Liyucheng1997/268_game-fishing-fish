// ===================== UI：面板 / 商店 / 图鉴 / 弹窗 =====================
'use strict';

const UI = {
  tab: 'fishing',

  init() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => { Sound.unlock(); Sound.click(); this.switchTab(btn.dataset.tab); });
    });
    document.getElementById('btn-collect-income').addEventListener('click', () => this.collectIncome());
    document.getElementById('btn-sound').addEventListener('click', (e) => {
      const on = Sound.toggle();
      e.currentTarget.textContent = on ? '🔊' : '🔇';
    });
    document.getElementById('loc-select').addEventListener('change', (e) => {
      State.location = e.target.value;
      Fishing.state = 'idle';
      Fishing.fish = null;
      saveGame();
      this.toast(`来到了 ${LOCATIONS[State.location].name}`);
    });
    this.refreshAll();
  },

  switchTab(tab) {
    this.tab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-page').forEach(p => p.classList.toggle('active', p.id === 'page-' + tab));
    if (tab === 'fishing') Fishing.resize();
    if (tab === 'tank') { Aquarium.resize(); Aquarium.syncFish(); this.refreshTankInfo(); }
    if (tab === 'shop') this.renderShop();
    if (tab === 'book') this.renderCollection();
  },

  modalOpen() {
    return document.querySelectorAll('.modal-mask:not(.hidden)').length > 0;
  },

  // ---------- 顶栏 ----------
  refreshHeader() {
    document.getElementById('coin-display').textContent = Math.floor(State.coins).toLocaleString();
    const wx = WEATHERS[State.weather];
    const h = Math.floor(State.gameHour);
    const m = Math.floor((State.gameHour - h) * 60);
    document.getElementById('env-display').textContent =
      `${wx.icon} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  refreshLocSelect() {
    const sel = document.getElementById('loc-select');
    sel.innerHTML = '';
    State.unlockedLocs.forEach(id => {
      const o = document.createElement('option');
      o.value = id; o.textContent = LOCATIONS[id].name;
      sel.appendChild(o);
    });
    sel.value = State.location;
  },

  // ---------- 鱼饵栏 ----------
  refreshBaitBar() {
    const bar = document.getElementById('bait-bar');
    bar.innerHTML = '';
    BAITS.forEach(b => {
      const cnt = baitCount(b.id);
      if (b.id !== 'bread' && cnt <= 0) return;
      const div = document.createElement('button');
      div.className = 'bait-chip' + (State.bait === b.id ? ' active' : '');
      div.innerHTML = `${b.name} <span class="cnt">${cnt === Infinity ? '∞' : cnt}</span>`;
      div.addEventListener('click', () => {
        Sound.click();
        State.bait = b.id;
        this.refreshBaitBar();
        saveGame();
      });
      bar.appendChild(div);
    });
    const gear = document.getElementById('gear-display');
    gear.textContent = `🎣 ${rodById(State.rod).name} · 🧵 ${lineById(State.line).name}`;
  },

  refreshAll() {
    this.refreshHeader();
    this.refreshLocSelect();
    this.refreshBaitBar();
    this.refreshTankInfo();
  },

  // ---------- 捕获结算 ----------
  showCatchResult(f) {
    const mask = document.getElementById('catch-modal');
    const box = document.getElementById('catch-content');
    mask.classList.remove('hidden');

    if (f.junk) {
      const j = f.junk;
      let coins = 0;
      let extra = '';
      if (j.treasure) {
        coins = 100 + Math.floor(Math.random() * 400);
        extra = `<div class="treasure">打开宝箱，获得 <b>💰 ${coins}</b> 金币！</div>`;
        addCoins(coins);
        Sound.coin();
      }
      box.innerHTML = `
        <div class="catch-title">钓到了…</div>
        <div class="junk-emoji">${j.emoji}</div>
        <div class="catch-name">${j.name}</div>
        ${extra}
        <div class="catch-actions"><button class="btn primary" id="btn-junk-ok">${j.treasure ? '太棒了' : '扔回去'}</button></div>`;
      document.getElementById('btn-junk-ok').addEventListener('click', () => {
        Sound.click(); mask.classList.add('hidden'); Fishing.finishCatch(); saveGame();
      });
      return;
    }

    const sp = f.sp;
    const r = RARITY[sp.rarity];
    const price = Math.round(sp.price * (0.5 + (f.weight / sp.maxW)));
    const isNew = State.collection[sp.id].count === 1;
    const isBest = State.collection[sp.id].bestW === f.weight && State.collection[sp.id].count > 1;
    const full = State.tank.length >= tankCap();
    box.innerHTML = `
      <div class="catch-title">🎉 钓到了！${isNew ? '<span class="new-badge">✨ 新图鉴</span>' : ''}${isBest ? '<span class="new-badge best">📏 新纪录</span>' : ''}</div>
      <canvas id="catch-fish-cv" width="260" height="130"></canvas>
      <div class="catch-name" style="color:${r.color}">${sp.name} <span class="rarity-chip" style="background:${r.color}">${r.name}</span></div>
      <div class="catch-meta">重量 <b>${f.weight} kg</b> · 价值 <b>💰 ${price}</b></div>
      <div class="catch-actions">
        <button class="btn primary" id="btn-keep" ${full ? 'disabled' : ''}>${full ? '鱼缸已满' : '🐠 放入鱼缸'}</button>
        <button class="btn" id="btn-sell">💰 卖出 ${price}</button>
      </div>`;
    // 画鱼
    const cv = document.getElementById('catch-fish-cv');
    const cctx = cv.getContext('2d');
    let raf;
    const drawLoop = () => {
      if (mask.classList.contains('hidden')) { cancelAnimationFrame(raf); return; }
      cctx.clearRect(0, 0, 260, 130);
      cctx.save();
      cctx.translate(130, 65);
      drawFish(cctx, sp.v, 96, performance.now() / 1000);
      cctx.restore();
      raf = requestAnimationFrame(drawLoop);
    };
    drawLoop();

    document.getElementById('btn-keep').addEventListener('click', () => {
      if (State.tank.length >= tankCap()) return;
      Sound.buy();
      State.tank.push({ uid: State.uidSeq++, spId: sp.id, weight: f.weight, caughtAt: Date.now() });
      this.refreshTankInfo();
      mask.classList.add('hidden');
      Fishing.finishCatch();
      this.toast(`${sp.name} 已放入鱼缸`);
      saveGame();
    });
    document.getElementById('btn-sell').addEventListener('click', () => {
      Sound.coin();
      addCoins(price);
      mask.classList.add('hidden');
      Fishing.finishCatch();
      this.toast(`卖出 ${sp.name}，+${price} 金币`);
      saveGame();
    });
  },

  // ---------- 鱼缸 ----------
  refreshTankInfo() {
    document.getElementById('tank-cap').textContent = `${State.tank.length} / ${tankCap()}`;
    const rate = tankIncomeRate();
    document.getElementById('tank-rate').textContent = rate > 0 ? `${rate} 金币/分钟` : '—';
    const p = pendingIncome();
    const btn = document.getElementById('btn-collect-income');
    btn.textContent = `💰 收取 ${p}`;
    btn.disabled = p <= 0;
  },

  collectIncome() {
    const p = pendingIncome();
    if (p <= 0) return;
    Sound.coin();
    addCoins(p);
    State.lastCollect = Date.now();
    this.refreshTankInfo();
    this.toast(`收取了 ${p} 金币`);
    saveGame();
  },

  showFishInfo(tf) {
    const sp = fishById(tf.spId);
    const r = RARITY[sp.rarity];
    const price = Math.round(sp.price * (0.5 + (tf.weight / sp.maxW)));
    const mask = document.getElementById('info-modal');
    const box = document.getElementById('info-content');
    mask.classList.remove('hidden');
    const days = Math.floor((Date.now() - tf.caughtAt) / 86400000);
    box.innerHTML = `
      <canvas id="info-fish-cv" width="240" height="120"></canvas>
      <div class="catch-name" style="color:${r.color}">${sp.name} <span class="rarity-chip" style="background:${r.color}">${r.name}</span></div>
      <div class="catch-meta">重量 ${tf.weight} kg · 产出 ${r.income} 金币/分钟</div>
      <div class="catch-meta dim">${days > 0 ? `已饲养 ${days} 天` : '今天刚入缸'}</div>
      <div class="catch-actions">
        <button class="btn" id="btn-info-sell">💰 卖出 ${price}</button>
        <button class="btn" id="btn-info-free">🌊 放生</button>
        <button class="btn primary" id="btn-info-close">关闭</button>
      </div>`;
    const cv = document.getElementById('info-fish-cv');
    const cctx = cv.getContext('2d');
    let raf;
    const loop = () => {
      if (mask.classList.contains('hidden')) { cancelAnimationFrame(raf); return; }
      cctx.clearRect(0, 0, 240, 120);
      cctx.save(); cctx.translate(120, 60);
      drawFish(cctx, sp.v, 86, performance.now() / 1000);
      cctx.restore();
      raf = requestAnimationFrame(loop);
    };
    loop();
    const remove = () => {
      State.tank = State.tank.filter(x => x.uid !== tf.uid);
      Aquarium.syncFish();
      this.refreshTankInfo();
      mask.classList.add('hidden');
      saveGame();
    };
    document.getElementById('btn-info-sell').addEventListener('click', () => { Sound.coin(); addCoins(price); remove(); this.toast(`卖出 ${sp.name}，+${price} 金币`); });
    document.getElementById('btn-info-free').addEventListener('click', () => { Sound.splash(); remove(); this.toast(`${sp.name} 回归大自然了`); });
    document.getElementById('btn-info-close').addEventListener('click', () => { Sound.click(); mask.classList.add('hidden'); });
  },

  // ---------- 商店 ----------
  renderShop() {
    const root = document.getElementById('shop-list');
    root.innerHTML = '';
    const section = (title) => {
      const d = document.createElement('div');
      d.className = 'shop-section';
      d.innerHTML = `<h3>${title}</h3>`;
      root.appendChild(d);
      return d;
    };
    const item = (parent, { icon, name, desc, priceHtml, btnText, disabled, equipped, onBuy }) => {
      const d = document.createElement('div');
      d.className = 'shop-item' + (equipped ? ' equipped' : '');
      d.innerHTML = `
        <div class="si-icon">${icon}</div>
        <div class="si-body"><div class="si-name">${name}</div><div class="si-desc">${desc}</div></div>
        <div class="si-right">${priceHtml || ''}<button class="btn small ${equipped ? '' : 'primary'}" ${disabled ? 'disabled' : ''}>${btnText}</button></div>`;
      d.querySelector('button').addEventListener('click', onBuy);
      parent.appendChild(d);
    };

    // 鱼竿
    const sRod = section('🎣 鱼竿');
    RODS.forEach(r => {
      const owned = State.ownedRods.includes(r.id);
      const equipped = State.rod === r.id;
      item(sRod, {
        icon: '🎣', name: r.name,
        desc: `${r.desc} · 收线 ${r.reel} · 安全张力 ${r.safe}`,
        priceHtml: owned ? '' : `<span class="price">💰 ${r.cost.toLocaleString()}</span>`,
        btnText: equipped ? '使用中' : owned ? '装备' : '购买',
        disabled: equipped || (!owned && State.coins < r.cost),
        equipped,
        onBuy: () => {
          if (!owned) {
            if (State.coins < r.cost) return;
            addCoins(-r.cost); State.ownedRods.push(r.id); Sound.buy();
          } else Sound.click();
          State.rod = r.id;
          this.refreshBaitBar(); this.renderShop(); saveGame();
        },
      });
    });

    // 鱼线
    const sLine = section('🧵 鱼线');
    LINES.forEach(l => {
      const owned = State.ownedLines.includes(l.id);
      const equipped = State.line === l.id;
      item(sLine, {
        icon: '🧵', name: l.name,
        desc: `${l.desc} · 耐久 ${l.hp}`,
        priceHtml: owned ? '' : `<span class="price">💰 ${l.cost.toLocaleString()}</span>`,
        btnText: equipped ? '使用中' : owned ? '装备' : '购买',
        disabled: equipped || (!owned && State.coins < l.cost),
        equipped,
        onBuy: () => {
          if (!owned) {
            if (State.coins < l.cost) return;
            addCoins(-l.cost); State.ownedLines.push(l.id); Sound.buy();
          } else Sound.click();
          State.line = l.id;
          this.refreshBaitBar(); this.renderShop(); saveGame();
        },
      });
    });

    // 鱼饵
    const sBait = section('🪱 鱼饵');
    BAITS.filter(b => b.id !== 'bread').forEach(b => {
      item(sBait, {
        icon: '🪱', name: `${b.name} ×${b.pack}`,
        desc: `${b.desc} · 咬钩 ×${b.biteSpd} · 稀有 ×${b.rareBoost} · 持有 ${baitCount(b.id)}`,
        priceHtml: `<span class="price">💰 ${b.cost.toLocaleString()}</span>`,
        btnText: '购买',
        disabled: State.coins < b.cost,
        onBuy: () => {
          if (State.coins < b.cost) return;
          addCoins(-b.cost);
          State.baits[b.id] = (State.baits[b.id] || 0) + b.pack;
          Sound.buy();
          this.refreshBaitBar(); this.renderShop(); saveGame();
        },
      });
    });

    // 钓点
    const sLoc = section('🗺️ 钓点');
    Object.entries(LOCATIONS).forEach(([id, loc]) => {
      const owned = State.unlockedLocs.includes(id);
      item(sLoc, {
        icon: '🗺️', name: loc.name, desc: loc.desc,
        priceHtml: owned ? '' : `<span class="price">💰 ${loc.cost.toLocaleString()}</span>`,
        btnText: owned ? '已解锁' : '解锁',
        disabled: owned || State.coins < loc.cost,
        equipped: owned,
        onBuy: () => {
          if (owned || State.coins < loc.cost) return;
          addCoins(-loc.cost);
          State.unlockedLocs.push(id);
          Sound.buy();
          this.refreshLocSelect(); this.renderShop(); saveGame();
          this.toast(`解锁了新钓点：${loc.name}！`);
        },
      });
    });

    // 鱼缸扩容
    const sTank = section('🐠 鱼缸');
    const next = TANK_UPGRADES[State.tankLevel + 1];
    if (next) {
      item(sTank, {
        icon: '🐠', name: `扩容至 ${next.cap} 格`,
        desc: `当前容量 ${tankCap()} 格`,
        priceHtml: `<span class="price">💰 ${next.cost.toLocaleString()}</span>`,
        btnText: '升级',
        disabled: State.coins < next.cost,
        onBuy: () => {
          if (State.coins < next.cost) return;
          addCoins(-next.cost);
          State.tankLevel++;
          Sound.buy();
          this.refreshTankInfo(); this.renderShop(); saveGame();
          this.toast(`鱼缸扩容到 ${tankCap()} 格！`);
        },
      });
    } else {
      item(sTank, { icon: '🐠', name: '鱼缸已满级', desc: `容量 ${tankCap()} 格`, btnText: 'MAX', disabled: true, equipped: true, onBuy: () => {} });
    }
  },

  // ---------- 图鉴 ----------
  renderCollection() {
    const root = document.getElementById('book-grid');
    root.innerHTML = '';
    const caught = Object.keys(State.collection).length;
    document.getElementById('book-progress').textContent = `${caught} / ${FISH_DB.length}`;
    Object.entries(LOCATIONS).forEach(([locId, loc]) => {
      const h = document.createElement('h3');
      h.className = 'book-loc';
      h.textContent = loc.name;
      root.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'book-cards';
      root.appendChild(grid);
      FISH_DB.filter(f => f.loc === locId).forEach(sp => {
        const rec = State.collection[sp.id];
        const r = RARITY[sp.rarity];
        const card = document.createElement('div');
        card.className = 'book-card' + (rec ? '' : ' unknown');
        card.style.borderColor = rec ? r.color : '#334155';
        const cv = document.createElement('canvas');
        cv.width = 120; cv.height = 60;
        const cctx = cv.getContext('2d');
        cctx.save(); cctx.translate(60, 30);
        drawFish(cctx, sp.v, 52, 0, !rec);
        cctx.restore();
        card.appendChild(cv);
        const info = document.createElement('div');
        info.className = 'bc-info';
        info.innerHTML = rec
          ? `<div class="bc-name" style="color:${r.color}">${sp.name}</div>
             <div class="bc-meta">×${rec.count} · 最大 ${rec.bestW}kg</div>`
          : `<div class="bc-name">？？？</div><div class="bc-meta">${r.name} · 未捕获</div>`;
        card.appendChild(info);
        grid.appendChild(card);
      });
    });
    // 统计
    const s = State.stats;
    document.getElementById('book-stats').innerHTML =
      `抛竿 ${s.casts} 次 · 捕获 ${s.caught} 条 · 跑鱼 ${s.escaped} 次 · 断线 ${s.broken} 次 · 累计赚取 💰 ${s.earned.toLocaleString()}`;
  },

  // ---------- 提示 ----------
  toast(msg) {
    const box = document.getElementById('toast-box');
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    box.appendChild(d);
    setTimeout(() => d.classList.add('show'), 10);
    setTimeout(() => { d.classList.remove('show'); setTimeout(() => d.remove(), 300); }, 2600);
  },
};
