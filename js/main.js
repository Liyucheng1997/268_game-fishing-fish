// ===================== 启动 & 主循环 =====================
'use strict';

(function () {
  loadGame();
  const params = new URLSearchParams(location.search);
  if (params.get('hour')) State.gameHour = parseFloat(params.get('hour'));
  if (params.get('wx')) { State.weather = params.get('wx'); State.weatherTimer = 9999; }
  if (params.get('loc')) State.location = params.get('loc');

  Fishing.init(
    document.getElementById('fishing-wrap'),
    document.getElementById('gl-canvas'),
    document.getElementById('hud-canvas')
  );
  Aquarium.init(document.getElementById('tank-canvas'));
  UI.init();

  // 调试用：?demo=1 填充演示鱼（不存档），?tab=xxx 直接切页
  if (params.get('demo')) {
    const ids = (params.get('demo').length > 2 ? params.get('demo').split(',') : ['koi', 'crucian', 'carp', 'goldfish', 'blackcarp', 'loach']);
    ids.forEach(id => {
      const sp = fishById(id);
      State.tank.push({ uid: State.uidSeq++, spId: id, weight: +(sp.minW + (sp.maxW - sp.minW) * 0.6).toFixed(2), caughtAt: Date.now() });
      State.collection[id] = { count: 1, bestW: sp.maxW };
    });
  }
  if (params.get('tab')) UI.switchTab(params.get('tab'));
  const freeze = !!params.get('freeze');

  // 截图/调试用姿态：?pose=waiting|bite|fight|landing|showcase&fish=id&yaw=0.2&dist=30
  const pose = params.get('pose');
  if (pose) {
    const F = Fishing;
    const sp = fishById(params.get('fish') || 'carp');
    F.castDist = parseFloat(params.get('dist') || '26');
    F.castYaw = parseFloat(params.get('yaw') || '0.1');
    Scene3D.render(0.016, 0, F);
    F.castTo.copy(Scene3D.castPoint(F.castYaw, F.castDist));
    F.startWaiting(true);
    F.catchInfo = { sp, weight: +(sp.minW + (sp.maxW - sp.minW) * 0.7).toFixed(2) };
    F.suitor.catchInfo = F.catchInfo; F.suitor.visible = true;
    F.suitor.len = fishLength(sp, F.catchInfo.weight);
    if (pose === 'waiting') { F.biteAt = 999; F.waitT = 0; }
    if (pose === 'bite') { F.waitT = 20; F.biteAt = 20.01; F.biteWindow = 999; }
    if (pose === 'fight' || pose === 'landing' || pose === 'showcase') {
      F.hookFish();
      F.fish.mode = params.get('mode') || 'calm'; F.fish.modeT = 999;
      if (pose === 'landing') { F.fish.stamina = 0; F.state = 'landing'; F.liftP = 0; F.landingT = 0; F.fish.x = 0; F.fish.z = Scene3D.dockEnd.z - 1.5; }
      if (pose === 'showcase') { recordCatch(sp.id, F.fish.weight); F.landFish(); }
    }
  }

  window.addEventListener('resize', () => {
    Fishing.resize();
    Aquarium.resize();
  });

  let last = performance.now();
  let saveT = 0;
  let tankUiT = 0;

  function step(dt, t) {
    // 游戏内时间：4 分钟 = 一天
    if (!freeze) {
      State.gameHour += dt * (24 / 240);
      if (State.gameHour >= 24) State.gameHour -= 24;
    }

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
    Sound.ambient(dt, UI.tab === 'fishing', State.weather === 'rain', isNight(), State.location);

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
  }

  let simT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    simT += dt;
    step(dt, simT);
    requestAnimationFrame(frame);
  }
  // 调试：在页面不可见时手动推进模拟
  if (params.get('debug')) window.__step = (sec, fps = 30) => { for (let i = 0; i < sec * fps; i++) { simT += 1 / fps; step(1 / fps, simT); } return 'ok'; };
  requestAnimationFrame(frame);
})();
