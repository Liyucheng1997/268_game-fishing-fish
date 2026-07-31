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

  return {
    unlock() { try { ac(); } catch (e) { enabled = false; } },
    toggle() { enabled = !enabled; return enabled; },
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
