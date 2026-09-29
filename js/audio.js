// ===================== 简易合成音效 =====================
'use strict';

const Sound = (() => {
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, when = 0) {
    if (!enabled) return;
    const c = ac();
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.2, filterFreq = 1000, when = 0) {
    if (!enabled) return;
    const c = ac();
    const t0 = c.currentTime + when;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
  }

  // 环境声：水声/风声（滤波噪声循环）+ 随机鸟鸣/蟋蟀
  let amb = null;
  function startAmbient() {
    if (amb || !enabled) return;
    const c = ac();
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(c.destination);
    src.start();
    amb = { g, f, t: 0 };
  }
  function chirp(night) {
    if (!enabled) return;
    if (night) { for (let i = 0; i < 3; i++) tone(4200 + Math.random() * 300, 0.04, 'sine', 0.012, null, i * 0.07); }
    else {
      const base = 2200 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) tone(base * (1 + Math.random() * 0.2), 0.07, 'sine', 0.018, base * 1.3, i * 0.11);
    }
  }

  return {
    unlock() { try { ac(); startAmbient(); } catch (e) { enabled = false; } },
    toggle() { enabled = !enabled; if (amb) amb.g.gain.value = 0; return enabled; },
    // 每帧：按场景调整环境音
    ambient(dt, active, rain, night, loc) {
      if (!amb) return;
      const target = enabled && active ? (rain ? 0.09 : loc === 'sea' ? 0.07 : 0.035) : 0;
      amb.g.gain.value += (target - amb.g.gain.value) * Math.min(1, dt * 2);
      amb.f.frequency.value = rain ? 2400 : loc === 'sea' ? 900 : 600;
      amb.t -= dt;
      if (active && enabled && amb.t <= 0 && !rain) {
        amb.t = night ? 0.8 + Math.random() * 2 : 3 + Math.random() * 7;
        if (loc !== 'sea' || night) chirp(night);
      }
    },
    drag()    { noise(0.05, 0.05, 5000); tone(2600 + Math.random() * 400, 0.03, 'square', 0.02); },
    jump()    { noise(0.5, 0.3, 1200); tone(200, 0.3, 'sine', 0.08, 90); },
    get enabled() { return enabled; },
    click()   { tone(600, 0.06, 'square', 0.06); },
    cast()    { noise(0.35, 0.12, 3000); tone(300, 0.3, 'sine', 0.05, 900); },
    splash()  { noise(0.4, 0.25, 800); },
    nibble()  { tone(300, 0.08, 'sine', 0.1, 240); },
    bite()    { tone(880, 0.1, 'square', 0.18); tone(1100, 0.12, 'square', 0.18, null, 0.09); },
    hook()    { tone(500, 0.15, 'sawtooth', 0.12, 200); },
    reelTick(){ tone(1400, 0.025, 'square', 0.035); },
    strain()  { tone(180, 0.12, 'sawtooth', 0.07, 160); },
    snap()    { tone(1200, 0.08, 'square', 0.25, 100); noise(0.2, 0.2, 4000); },
    escape()  { tone(400, 0.25, 'sine', 0.12, 150); },
    dash()    { noise(0.25, 0.18, 1500); },
    catch_()  { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, null, i * 0.09)); },
    coin()    { tone(988, 0.07, 'square', 0.1); tone(1319, 0.15, 'square', 0.1, null, 0.07); },
    buy()     { tone(660, 0.08, 'triangle', 0.12); tone(880, 0.12, 'triangle', 0.12, null, 0.08); },
    error()   { tone(220, 0.15, 'square', 0.1, 180); },
    legend()  { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.25, 'triangle', 0.13, null, i * 0.1)); },
  };
})();
