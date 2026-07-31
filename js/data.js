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
const FISH_DB = [
  // ---- 池塘 ----
  { id:'crucian',  name:'鲫鱼',   loc:'pond', rarity:'common', minW:0.1, maxW:0.8,  price:8,    strength:0.18, stamina:28,  dashRate:0.1, time:'any',
    v:{ body:'#b0bec5', belly:'#eceff1', fin:'#90a4ae', shape:'round', pattern:'none' } },
  { id:'carp',     name:'鲤鱼',   loc:'pond', rarity:'common', minW:0.8, maxW:5,    price:20,   strength:0.45, stamina:55,  dashRate:0.15, time:'any',
    v:{ body:'#8d6e63', belly:'#d7ccc8', fin:'#6d4c41', shape:'round', pattern:'none', whiskers:true } },
  { id:'grass',    name:'草鱼',   loc:'pond', rarity:'common', minW:1,   maxW:8,    price:25,   strength:0.5,  stamina:65,  dashRate:0.15, time:'day',
    v:{ body:'#78909c', belly:'#cfd8dc', fin:'#546e7a', shape:'slim', pattern:'none' } },
  { id:'loach',    name:'泥鳅',   loc:'pond', rarity:'common', minW:0.03,maxW:0.15, price:5,    strength:0.08, stamina:15,  dashRate:0.3, time:'any',
    v:{ body:'#795548', belly:'#a1887f', fin:'#5d4037', shape:'long', pattern:'spots', patternColor:'#4e342e', whiskers:true } },
  { id:'goldfish', name:'金鱼',   loc:'pond', rarity:'rare',   minW:0.05,maxW:0.4,  price:60,   strength:0.12, stamina:20,  dashRate:0.2, time:'day',
    v:{ body:'#ff7043', belly:'#ffccbc', fin:'#ff5722', shape:'round', pattern:'none', fancyTail:true } },
  { id:'koi',      name:'锦鲤',   loc:'pond', rarity:'rare',   minW:1,   maxW:6,    price:160,  strength:0.4,  stamina:50,  dashRate:0.2, time:'any',
    v:{ body:'#fafafa', belly:'#ffffff', fin:'#ef9a9a', shape:'round', pattern:'koi', patternColor:'#e53935' } },
  { id:'blackcarp',name:'大青鱼', loc:'pond', rarity:'epic',   minW:5,   maxW:20,   price:420,  strength:0.72, stamina:105, dashRate:0.25, time:'any',
    v:{ body:'#37474f', belly:'#78909c', fin:'#263238', shape:'slim', pattern:'none' } },
  { id:'dragoncarp',name:'龙鲤',  loc:'pond', rarity:'legend', minW:8,   maxW:25,   price:1600, strength:0.88, stamina:150, dashRate:0.35, time:'night',
    v:{ body:'#ffd54f', belly:'#fff8e1', fin:'#ff8f00', shape:'slim', pattern:'stripes', patternColor:'#ff6f00', whiskers:true, glow:true } },
  // ---- 河流 ----
  { id:'bass',     name:'鲈鱼',   loc:'river', rarity:'common', minW:0.5, maxW:3.5, price:30,   strength:0.42, stamina:45,  dashRate:0.35, time:'any',
    v:{ body:'#8bc34a', belly:'#dcedc8', fin:'#689f38', shape:'round', pattern:'stripes', patternColor:'#33691e' } },
  { id:'trout',    name:'虹鳟',   loc:'river', rarity:'common', minW:0.4, maxW:2.5, price:35,   strength:0.35, stamina:42,  dashRate:0.45, time:'day',
    v:{ body:'#f48fb1', belly:'#fce4ec', fin:'#ad1457', shape:'slim', pattern:'spots', patternColor:'#880e4f' } },
  { id:'catfish',  name:'鲶鱼',   loc:'river', rarity:'rare',   minW:2,   maxW:12,  price:95,   strength:0.6,  stamina:85,  dashRate:0.1, time:'night',
    v:{ body:'#455a64', belly:'#90a4ae', fin:'#37474f', shape:'long', pattern:'none', whiskers:true } },
  { id:'mandarin', name:'鳜鱼',   loc:'river', rarity:'rare',   minW:0.5, maxW:4,   price:120,  strength:0.5,  stamina:55,  dashRate:0.3, time:'any',
    v:{ body:'#c8a86b', belly:'#efe3c2', fin:'#8d6e3f', shape:'round', pattern:'spots', patternColor:'#5d4a24' } },
  { id:'salamander',name:'娃娃鱼',loc:'river', rarity:'epic',   minW:3,   maxW:15,  price:520,  strength:0.55, stamina:95,  dashRate:0.1, time:'night',
    v:{ body:'#6d4c41', belly:'#bcaaa4', fin:'#4e342e', shape:'long', pattern:'spots', patternColor:'#3e2723' } },
  { id:'sturgeon', name:'中华鲟', loc:'river', rarity:'legend', minW:10,  maxW:45,  price:2200, strength:0.95, stamina:170, dashRate:0.2, time:'any',
    v:{ body:'#607d8b', belly:'#b0bec5', fin:'#455a64', shape:'long', pattern:'stripes', patternColor:'#37474f', bill:true } },
  // ---- 海洋 ----
  { id:'sardine',  name:'沙丁鱼', loc:'sea', rarity:'common',  minW:0.05,maxW:0.3,  price:10,   strength:0.1,  stamina:15,  dashRate:0.4, time:'any',
    v:{ body:'#90caf9', belly:'#e3f2fd', fin:'#64b5f6', shape:'slim', pattern:'none' } },
  { id:'seabream', name:'真鲷',   loc:'sea', rarity:'common',  minW:0.5, maxW:3.5,  price:42,   strength:0.4,  stamina:48,  dashRate:0.3, time:'day',
    v:{ body:'#ef9a9a', belly:'#ffebee', fin:'#e57373', shape:'round', pattern:'none' } },
  { id:'flounder', name:'比目鱼', loc:'sea', rarity:'common',  minW:1,   maxW:5,    price:48,   strength:0.38, stamina:50,  dashRate:0.1, time:'any',
    v:{ body:'#a1887f', belly:'#d7ccc8', fin:'#8d6e63', shape:'flat', pattern:'spots', patternColor:'#6d4c41' } },
  { id:'puffer',   name:'河豚',   loc:'sea', rarity:'rare',    minW:0.5, maxW:2.5,  price:140,  strength:0.25, stamina:35,  dashRate:0.2, time:'any',
    v:{ body:'#ffcc80', belly:'#fff3e0', fin:'#ffa726', shape:'puffer', pattern:'spots', patternColor:'#8d6e63' } },
  { id:'lantern',  name:'灯笼鱼', loc:'sea', rarity:'rare',    minW:0.2, maxW:1,    price:110,  strength:0.2,  stamina:28,  dashRate:0.3, time:'night',
    v:{ body:'#4527a0', belly:'#7e57c2', fin:'#311b92', shape:'round', pattern:'none', glow:true } },
  { id:'tuna',     name:'金枪鱼', loc:'sea', rarity:'epic',    minW:20,  maxW:80,   price:850,  strength:0.85, stamina:140, dashRate:0.5, time:'any',
    v:{ body:'#1565c0', belly:'#bbdefb', fin:'#0d47a1', shape:'slim', pattern:'none' } },
  { id:'swordfish',name:'旗鱼',   loc:'sea', rarity:'epic',    minW:15,  maxW:60,   price:950,  strength:0.8,  stamina:120, dashRate:0.7, time:'day',
    v:{ body:'#0288d1', belly:'#b3e5fc', fin:'#01579b', shape:'slim', pattern:'none', bill:true, sail:true } },
  { id:'shark',    name:'鲨鱼',   loc:'sea', rarity:'legend',  minW:50,  maxW:200,  price:3200, strength:1.0,  stamina:190, dashRate:0.4, time:'any',
    v:{ body:'#78909c', belly:'#eceff1', fin:'#546e7a', shape:'slim', pattern:'none', sharkFin:true } },
  { id:'seadragon',name:'深海龙鱼',loc:'sea',rarity:'legend',  minW:10,  maxW:35,   price:2600, strength:0.9,  stamina:160, dashRate:0.45, time:'night',
    v:{ body:'#00695c', belly:'#4db6ac', fin:'#004d40', shape:'long', pattern:'stripes', patternColor:'#00332c', glow:true, whiskers:true } },
];

const JUNK_DB = [
  { id:'boot',  name:'破旧靴子', emoji:'🥾', price:1 },
  { id:'can',   name:'易拉罐',   emoji:'🥫', price:1 },
  { id:'weed',  name:'一团水草', emoji:'🌿', price:0 },
  { id:'chest', name:'神秘宝箱', emoji:'📦', price:0, treasure:true }, // 开出金币
];

const LOCATIONS = {
  pond:  { name:'宁静池塘', cost:0,    desc:'新手的起点，鲫鱼鲤鱼的家园',
           sky:['#87ceeb','#b3e5fc'], water:['#4a90a4','#2c5f6f'] },
  river: { name:'激流河谷', cost:1500, desc:'水流湍急，鱼儿更有劲儿',
           sky:['#a5d6a7','#e8f5e9'], water:['#3d7a5f','#1f4a38'] },
  sea:   { name:'碧海深滩', cost:8000, desc:'深海大物出没，小心断线！',
           sky:['#64b5f6','#bbdefb'], water:['#1a5276','#0b2e45'] },
};

const RODS = [
  { id:'bamboo', name:'竹竿',     cost:0,     reel:3.2, safe:82, desc:'爷爷传下来的竹竿' },
  { id:'glass',  name:'玻璃钢竿', cost:800,   reel:4.0, safe:86, desc:'收线更快，更结实' },
  { id:'carbon', name:'碳素竿',   cost:3200,  reel:5.0, safe:90, desc:'轻量高强度，钓大鱼利器' },
  { id:'master', name:'大师之竿', cost:12000, reel:6.2, safe:94, desc:'传说钓手的最终选择' },
];

const LINES = [
  { id:'nylon',  name:'尼龙线',  cost:0,    hp:1.0, desc:'普通的尼龙钓线' },
  { id:'strong', name:'强力线',  cost:600,  hp:1.8, desc:'更耐拉扯，不易断' },
  { id:'braid',  name:'编织线',  cost:2400, hp:3.0, desc:'高强度编织，钓大鱼稳' },
  { id:'steel',  name:'钢丝线',  cost:9000, hp:5.0, desc:'几乎拉不断的钢丝' },
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
