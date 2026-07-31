// ===================== 启动 & 主循环 =====================
'use strict';

(function () {
  loadGame();

  Fishing.init(
    document.getElementById('fishing-wrap'),
    document.getElementById('gl-canvas'),
    document.getElementById('hud-canvas')
  );
  Aquarium.init(document.getElementById('tank-canvas'));
  UI.init();

  // 调试用：?demo=1 填充演示鱼（不存档），?tab=xxx 直接切页
  const params = new URLSearchParams(location.search);
  if (params.get('demo')) {
    ['koi', 'crucian', 'carp', 'goldfish', 'blackcarp', 'loach'].forEach(id => {
      const sp = fishById(id);
      State.tank.push({ uid: State.uidSeq++, spId: id, weight: +(sp.minW + (sp.maxW - sp.minW) * 0.6).toFixed(2), caughtAt: Date.now() });
      State.collection[id] = { count: 1, bestW: sp.maxW };
    });
  }
  if (params.get('tab')) UI.switchTab(params.get('tab'));
  // 截图/调试用姿态
  const pose = params.get('pose');
  if (pose === 'waiting') {
    Fishing.castDist = 45; Fishing.castYaw = 0.1;
    Fishing.startWaiting();
    Fishing.biteAt = 999; Fishing.nibbles = [];
  } else if (pose === 'fight') {
    Fishing.castDist = 45; Fishing.castYaw = 0;
    Fishing.state = 'bite';
    const sp = fishById(params.get('fish') || 'blackcarp');
    Fishing.pickCatch = () => ({ sp });
    Fishing.hookFish();
    Fishing.fish.az = 0.25;
    Fishing.tension = 72;
  } else if (pose === 'charging') {
    Fishing.state = 'charging'; Fishing.power = 65;
  }
  if (params.get('hour')) State.gameHour = parseFloat(params.get('hour'));
  if (params.get('wx')) State.weather = params.get('wx');

  window.addEventListener('resize', () => {
    Fishing.resize();
    Aquarium.resize();
  });

  let last = performance.now();
  let saveT = 0;
  let tankUiT = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    // 游戏内时间：4 分钟 = 一天
    State.gameHour += dt * (24 / 240);
    if (State.gameHour >= 24) State.gameHour -= 24;

    // 天气轮换
    State.weatherTimer -= dt;
    if (State.weatherTimer <= 0) {
      State.weatherTimer = 70 + Math.random() * 80;
      const keys = Object.keys(WEATHERS);
      const next = keys[Math.floor(Math.random() * keys.length)];
      if (next !== State.weather) {
        State.weather = next;
        UI.toast(`天气变了：${WEATHERS[next].icon} ${WEATHERS[next].name}`);
      }
    }
    UI.refreshHeader();

    if (UI.tab === 'fishing') {
      Fishing.update(dt);
      Fishing.render(t, dt);
    } else if (UI.tab === 'tank') {
      Aquarium.update(dt);
      Aquarium.render(t);
      tankUiT += dt;
      if (tankUiT > 1) { tankUiT = 0; UI.refreshTankInfo(); }
    }

    saveT += dt;
    if (saveT > 10) { saveT = 0; saveGame(); }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
