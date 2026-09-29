// ===================== 游戏静态数据 =====================
'use strict';

const RARITY = {
  common: { name: '普通', color: '#9ca3af', income: 1 },
  rare:   { name: '稀有', color: '#38bdf8', income: 4 },
  epic:   { name: '史诗', color: '#c084fc', income: 12 },
  legend: { name: '传说', color: '#fbbf24', income: 30 },
};

// zones: [近岸, 中距, 远投] 权重; time: 'any'|'day'|'night'
// strength 0~1 拉力, stamina 体力, dashRate 冲刺频率加成
// style: normal 普通 | runner 爱冲刺 | jumper 会跃出水面 | diver 往深处钻
// v: 3D 外观参数（shape 体型 / pattern 花纹 / tail 尾型 / dorsal 背鳍 / 各种附件）
const FISH_DB = [
  // ---- 池塘 ----
  { id:'crucian',  name:'鲫鱼',   loc:'pond', rarity:'common', minW:0.1, maxW:0.8,  price:8,    strength:0.18, stamina:28,  dashRate:0.1, time:'any', style:'normal',
    v:{ body:'#8c8a66', belly:'#ece6cf', fin:'#77704e', shape:'round', pattern:'none', iris:'#d9b54a' } },
  { id:'carp',     name:'鲤鱼',   loc:'pond', rarity:'common', minW:0.8, maxW:5,    price:20,   strength:0.45, stamina:55,  dashRate:0.15, time:'any', style:'runner',
    v:{ body:'#9a7a3a', belly:'#f2dfae', fin:'#a4552c', shape:'round', pattern:'none', whiskers:true, iris:'#e0b040' } },
  { id:'grass',    name:'草鱼',   loc:'pond', rarity:'common', minW:1,   maxW:8,    price:25,   strength:0.5,  stamina:65,  dashRate:0.15, time:'day', style:'runner',
    v:{ body:'#6c7456', belly:'#e8e4cf', fin:'#5b5a44', shape:'slim', pattern:'none', iris:'#c9a642' } },
  { id:'loach',    name:'泥鳅',   loc:'pond', rarity:'common', minW:0.03,maxW:0.15, price:5,    strength:0.08, stamina:15,  dashRate:0.3, time:'any', style:'diver',
    v:{ body:'#8a7550', belly:'#cdbb92', fin:'#6d5a3a', shape:'long', pattern:'spots', patternColor:'#3e3020', whiskers:true, tail:'round', dorsal:'small', iris:'#222' } },
  { id:'goldfish', name:'金鱼',   loc:'pond', rarity:'rare',   minW:0.05,maxW:0.4,  price:60,   strength:0.12, stamina:20,  dashRate:0.2, time:'day', style:'normal',
    v:{ body:'#ff6a1a', belly:'#ffc98a', fin:'#ff7d33', shape:'round', pattern:'none', fancyTail:true, tail:'fancy', iris:'#222' } },
  { id:'koi',      name:'锦鲤',   loc:'pond', rarity:'rare',   minW:1,   maxW:6,    price:160,  strength:0.4,  stamina:50,  dashRate:0.2, time:'any', style:'runner',
    v:{ body:'#f7f4ee', belly:'#ffffff', fin:'#f3e6e0', shape:'round', pattern:'koi', patternColor:'#e0301e', whiskers:true, iris:'#333' } },
  { id:'blackcarp',name:'大青鱼', loc:'pond', rarity:'epic',   minW:5,   maxW:20,   price:420,  strength:0.72, stamina:105, dashRate:0.25, time:'any', style:'runner',
    v:{ body:'#2f3a40', belly:'#8b979c', fin:'#1f262a', shape:'slim', pattern:'none', iris:'#b89a40' } },
  { id:'dragoncarp',name:'龙鲤',  loc:'pond', rarity:'legend', minW:8,   maxW:25,   price:1600, strength:0.88, stamina:150, dashRate:0.35, time:'night', style:'jumper',
    v:{ body:'#ffc93a', belly:'#fff4d0', fin:'#ff7a00', shape:'slim', pattern:'stripes', patternColor:'#e05a00', whiskers:true, glow:true, iris:'#c62828' } },
  // ---- 河流 ----
  { id:'bass',     name:'鲈鱼',   loc:'river', rarity:'common', minW:0.5, maxW:3.5, price:30,   strength:0.42, stamina:45,  dashRate:0.35, time:'any', style:'jumper',
    v:{ body:'#6b8a3a', belly:'#e6ecc8', fin:'#5d6f35', shape:'round', pattern:'band', patternColor:'#2c3a18', dorsal:'spiny', iris:'#c45a1a' } },
  { id:'trout',    name:'虹鳟',   loc:'river', rarity:'common', minW:0.4, maxW:2.5, price:35,   strength:0.35, stamina:42,  dashRate:0.45, time:'day', style:'jumper',
    v:{ body:'#7b8a5e', belly:'#f1f1ea', fin:'#8b8466', shape:'slim', pattern:'spots', patternColor:'#2b2b22', band:'#e0718e', iris:'#d4b04a', iridescent:true } },
  { id:'catfish',  name:'鲶鱼',   loc:'river', rarity:'rare',   minW:2,   maxW:12,  price:95,   strength:0.6,  stamina:85,  dashRate:0.1, time:'night', style:'diver',
    v:{ body:'#4a5058', belly:'#b9bcb8', fin:'#3a3f45', shape:'long', pattern:'none', whiskers:true, tail:'round', dorsal:'small', iris:'#555' } },
  { id:'mandarin', name:'鳜鱼',   loc:'river', rarity:'rare',   minW:0.5, maxW:4,   price:120,  strength:0.5,  stamina:55,  dashRate:0.3, time:'any', style:'normal',
    v:{ body:'#b89a5a', belly:'#efe3c2', fin:'#8d6e3f', shape:'round', pattern:'spots', patternColor:'#3d2e14', dorsal:'spiny', iris:'#c8a030' } },
  { id:'salamander',name:'娃娃鱼',loc:'river', rarity:'epic',   minW:3,   maxW:15,  price:520,  strength:0.55, stamina:95,  dashRate:0.1, time:'night', style:'diver',
    v:{ body:'#5e4a3a', belly:'#a89480', fin:'#4e3c2e', shape:'long', pattern:'spots', patternColor:'#2e2218', tail:'round', dorsal:'fold', legs:true, iris:'#222' } },
  { id:'sturgeon', name:'中华鲟', loc:'river', rarity:'legend', minW:10,  maxW:45,  price:2200, strength:0.95, stamina:170, dashRate:0.2, time:'any', style:'diver',
    v:{ body:'#56666f', belly:'#c9d0d2', fin:'#46545c', shape:'slim', pattern:'scutes', patternColor:'#e6e6dc', bill:'snout', tail:'hetero', whiskers:true, iris:'#333' } },
  // ---- 海洋 ----
  { id:'sardine',  name:'沙丁鱼', loc:'sea', rarity:'common',  minW:0.05,maxW:0.3,  price:10,   strength:0.1,  stamina:15,  dashRate:0.4, time:'any', style:'normal',
    v:{ body:'#3b6f9e', belly:'#eef4f8', fin:'#9fb4c4', shape:'slim', pattern:'dots', patternColor:'#1a2a3a', iridescent:true, silver:true, iris:'#ddd' } },
  { id:'seabream', name:'真鲷',   loc:'sea', rarity:'common',  minW:0.5, maxW:3.5,  price:42,   strength:0.4,  stamina:48,  dashRate:0.3, time:'day', style:'runner',
    v:{ body:'#e0707a', belly:'#fbe3e0', fin:'#e07a80', shape:'round', pattern:'dots', patternColor:'#5ec8f0', dorsal:'spiny', iris:'#e8b040' } },
  { id:'flounder', name:'比目鱼', loc:'sea', rarity:'common',  minW:1,   maxW:5,    price:48,   strength:0.38, stamina:50,  dashRate:0.1, time:'any', style:'diver',
    v:{ body:'#8d7560', belly:'#efe8dc', fin:'#7d6552', shape:'flat', pattern:'spots', patternColor:'#4e3a2a', tail:'round', iris:'#c8a040' } },
  { id:'puffer',   name:'河豚',   loc:'sea', rarity:'rare',    minW:0.5, maxW:2.5,  price:140,  strength:0.25, stamina:35,  dashRate:0.2, time:'any', style:'normal',
    v:{ body:'#d9b46a', belly:'#fff6e4', fin:'#e0a64a', shape:'puffer', pattern:'spots', patternColor:'#5b4630', tail:'round', dorsal:'small', spines:true, iris:'#2a8a5a' } },
  { id:'lantern',  name:'灯笼鱼', loc:'sea', rarity:'rare',    minW:0.2, maxW:1,    price:110,  strength:0.2,  stamina:28,  dashRate:0.3, time:'night', style:'normal',
    v:{ body:'#2a2350', belly:'#5b4c8e', fin:'#231c46', shape:'round', pattern:'photophores', patternColor:'#7ff6ff', glow:true, iris:'#9ff' } },
  { id:'tuna',     name:'金枪鱼', loc:'sea', rarity:'epic',    minW:20,  maxW:80,   price:850,  strength:0.85, stamina:140, dashRate:0.5, time:'any', style:'runner',
    v:{ body:'#16325e', belly:'#dfe8ee', fin:'#e8c030', shape:'slim', pattern:'none', tail:'lunate', silver:true, iris:'#333' } },
  { id:'swordfish',name:'旗鱼',   loc:'sea', rarity:'epic',    minW:15,  maxW:60,   price:950,  strength:0.8,  stamina:120, dashRate:0.7, time:'day', style:'jumper',
    v:{ body:'#15457a', belly:'#dcecf6', fin:'#1d3b6a', shape:'slim', pattern:'bars', patternColor:'#7ec8f0', bill:'sword', sail:true, dorsal:'sail', tail:'lunate', silver:true, iris:'#222' } },
  { id:'shark',    name:'鲨鱼',   loc:'sea', rarity:'legend',  minW:50,  maxW:200,  price:3200, strength:1.0,  stamina:190, dashRate:0.4, time:'any', style:'runner',
    v:{ body:'#6f7f8a', belly:'#eef0f0', fin:'#5d6c76', shape:'slim', pattern:'gills', sharkFin:true, dorsal:'shark', tail:'hetero', nose:'point', iris:'#111' } },
  { id:'seadragon',name:'深海龙鱼',loc:'sea',rarity:'legend',  minW:10,  maxW:35,   price:2600, strength:0.9,  stamina:160, dashRate:0.45, time:'night', style:'jumper',
    v:{ body:'#0f6a5e', belly:'#6fd0c0', fin:'#0a4a42', shape:'long', pattern:'scales', patternColor:'#9ff5e0', glow:true, whiskers:true, tail:'round', dorsal:'fold', iris:'#f0c040' } },
];

const JUNK_DB = [
  { id:'boot',  name:'破旧靴子', emoji:'🥾', price:1 },
  { id:'can',   name:'易拉罐',   emoji:'🥫', price:1 },
  { id:'weed',  name:'一团水草', emoji:'🌿', price:0 },
  { id:'chest', name:'神秘宝箱', emoji:'📦', price:0, treasure:true }, // 开出金币
];

const LOCATIONS = {
  pond:  { name:'宁静池塘', cost:0,    desc:'新手的起点，鲫鱼鲤鱼的家园' },
  river: { name:'激流河谷', cost:1500, desc:'水流湍急，鱼儿更有劲儿' },
  sea:   { name:'碧海深滩', cost:8000, desc:'深海大物出没，小心断线！' },
};

// reel 收线速度(m/s), safe 断线张力阈值, color 竿身颜色
const RODS = [
  { id:'bamboo', name:'竹竿',     cost:0,     reel:3.2, safe:82, desc:'爷爷传下来的竹竿', color:'#b8925a', wrap:'#6b3d1e', bamboo:true },
  { id:'glass',  name:'玻璃钢竿', cost:800,   reel:4.0, safe:86, desc:'收线更快，更结实', color:'#e8e2d0', wrap:'#2e7d32' },
  { id:'carbon', name:'碳素竿',   cost:3200,  reel:5.0, safe:90, desc:'轻量高强度，钓大鱼利器', color:'#1c1d22', wrap:'#c62828' },
  { id:'master', name:'大师之竿', cost:12000, reel:6.2, safe:94, desc:'传说钓手的最终选择', color:'#14213d', wrap:'#e0b040' },
];

const LINES = [
  { id:'nylon',  name:'尼龙线',  cost:0,    hp:1.0, desc:'普通的尼龙钓线', color:'#e8eef2' },
  { id:'strong', name:'强力线',  cost:600,  hp:1.8, desc:'更耐拉扯，不易断', color:'#d8f0c8' },
  { id:'braid',  name:'编织线',  cost:2400, hp:3.0, desc:'高强度编织，钓大鱼稳', color:'#ffd060' },
  { id:'steel',  name:'钢丝线',  cost:9000, hp:5.0, desc:'几乎拉不断的钢丝', color:'#c8d0d8' },
];

// biteSpd 咬钩速度倍率, rareBoost 稀有度权重倍率(作用于稀有以上)
const BAITS = [
  { id:'bread',  name:'面包糠', cost:0,  pack:0,  biteSpd:1.0, rareBoost:1.0, desc:'免费无限，聊胜于无' },
  { id:'worm',   name:'蚯蚓',   cost:40, pack:10, biteSpd:1.35, rareBoost:1.3, desc:'经典鱼饵，咬钩更快' },
  { id:'redworm',name:'红虫',   cost:100,pack:10, biteSpd:1.55, rareBoost:1.7, desc:'鱼儿的最爱' },
  { id:'shrimp', name:'虾肉',   cost:240,pack:10, biteSpd:1.45, rareBoost:2.3, desc:'大鱼闻着就来' },
  { id:'lumina', name:'发光饵', cost:600,pack:10, biteSpd:1.25, rareBoost:3.2, desc:'夜光诱惑，稀有鱼克星' },
];

const TANK_UPGRADES = [
  { cap:6,  cost:0 },
  { cap:10, cost:1200 },
  { cap:16, cost:5000 },
  { cap:24, cost:18000 },
];

const WEATHERS = {
  sunny:  { name:'晴朗', icon:'☀️', bite:1.0,  rare:1.0 },
  cloudy: { name:'多云', icon:'⛅', bite:1.15, rare:1.1 },
  rain:   { name:'下雨', icon:'🌧️', bite:1.45, rare:1.35 },
};

function fishById(id){ return FISH_DB.find(f => f.id === id); }
function rodById(id){ return RODS.find(r => r.id === id); }
function lineById(id){ return LINES.find(l => l.id === id); }
function baitById(id){ return BAITS.find(b => b.id === id); }

// 由重量估算鱼体长(米)：W(g) ≈ 0.012·L(cm)³，按体型修正
function fishLength(sp, weight) {
  const base = Math.cbrt(Math.max(0.01, weight) * 1000 / 0.012) / 100;
  const k = { round: 0.92, slim: 1.08, long: 1.35, flat: 0.9, puffer: 0.8 }[sp.v.shape] || 1;
  return Math.max(0.12, base * k);
}
