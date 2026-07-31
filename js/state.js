// ===================== 玩家存档与全局状态 =====================
'use strict';

const SAVE_KEY = 'fishing_game_save_v1';

const State = {
  coins: 50,
  rod: 'bamboo',
  line: 'nylon',
  bait: 'bread',
  ownedRods: ['bamboo'],
  ownedLines: ['nylon'],
  baits: {},                 // {baitId: count}
  location: 'pond',
  unlockedLocs: ['pond'],
  tankLevel: 0,
  tank: [],                  // [{uid, spId, weight, caughtAt}]
  lastCollect: Date.now(),
  collection: {},            // {spId: {count, bestW}}
  stats: { casts: 0, caught: 0, escaped: 0, broken: 0, earned: 0 },
  // 环境（存档保留）
  gameHour: 8,               // 0-24 游戏内时间
  weather: 'sunny',
  weatherTimer: 90,
  uidSeq: 1,
};

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(State)); } catch (e) {}
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(State, data);
  } catch (e) {}
}

function tankCap() { return TANK_UPGRADES[State.tankLevel].cap; }

function addCoins(n) {
  State.coins += n;
  if (n > 0) State.stats.earned += n;
  UI.refreshHeader();
}

function baitCount(id) {
  if (id === 'bread') return Infinity;
  return State.baits[id] || 0;
}

function consumeBait() {
  const id = State.bait;
  if (id === 'bread') return true;
  if ((State.baits[id] || 0) <= 0) { State.bait = 'bread'; return true; }
  State.baits[id]--;
  if (State.baits[id] <= 0) State.bait = 'bread';
  return true;
}

function recordCatch(spId, weight) {
  const c = State.collection[spId] || { count: 0, bestW: 0 };
  c.count++;
  c.bestW = Math.max(c.bestW, weight);
  State.collection[spId] = c;
  State.stats.caught++;
}

function isNight() { return State.gameHour >= 20 || State.gameHour < 5; }

function timePhase() {
  const h = State.gameHour;
  if (h < 5) return 'night';
  if (h < 8) return 'dawn';
  if (h < 17) return 'day';
  if (h < 20) return 'dusk';
  return 'night';
}

// 鱼缸收益：每条鱼按稀有度每分钟产币
function tankIncomeRate() {
  return State.tank.reduce((s, f) => {
    const sp = fishById(f.spId);
    return s + (sp ? RARITY[sp.rarity].income : 0);
  }, 0);
}

function pendingIncome() {
  const mins = (Date.now() - State.lastCollect) / 60000;
  const capped = Math.min(mins, 120); // 最多累计2小时
  return Math.floor(tankIncomeRate() * capped);
}
