// Sonido: música synthwave generada, motor, sirena y efectos
import { G } from './core.js';

export const sfx = (() => {
  let ctx = null, master, sfxG, musG, eng1, eng2, engF, engG, sir, sirG, heli, heliG, noise, muted = false, step = 0, nextT = 0;
  const ensure = () => {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination); master.connect(comp);
    sfxG = ctx.createGain(); sfxG.connect(master); musG = ctx.createGain(); musG.gain.value = 0.3; musG.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    eng1 = ctx.createOscillator(); eng1.type = 'sawtooth'; eng2 = ctx.createOscillator(); eng2.type = 'square';
    engF = ctx.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 500; engG = ctx.createGain(); engG.gain.value = 0;
    eng1.connect(engF); eng2.connect(engF); engF.connect(engG); engG.connect(sfxG); eng1.start(); eng2.start();
    sir = ctx.createOscillator(); sir.type = 'square'; const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1800;
    sirG = ctx.createGain(); sirG.gain.value = 0; sir.connect(sf); sf.connect(sirG); sirG.connect(sfxG); sir.start();
    // rotor del helicóptero: ruido modulado
    heli = ctx.createBufferSource(); heli.buffer = noise; heli.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 260;
    heliG = ctx.createGain(); heliG.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 11; const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
    const am = ctx.createGain(); am.gain.value = 0.5; lfo.connect(lfoG); lfoG.connect(am.gain);
    heli.connect(hf); hf.connect(am); am.connect(heliG); heliG.connect(sfxG); heli.start(); lfo.start();
    nextT = ctx.currentTime + 0.1; setInterval(schedule, 25);
  };
  const tone = (type, f0, f1, t, dur, vol, dest = sfxG) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  };
  const noiseHit = (t, dur, vol, freq, type = 'lowpass', dest = sfxG) => {
    const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  };
  const roots = [55, 43.65, 65.41, 49], chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
  function schedule() {
    if (!ctx || muted) { if (ctx) nextT = ctx.currentTime + 0.05; return; }
    const st = G.state || {};
    const intense = st.race ? 3 : Math.max(1, st.wanted || 0);
    const sixteenth = 60 / (intense >= 3 ? 128 : 118) / 4;
    while (nextT < ctx.currentTime + 0.12) {
      const bar = Math.floor(step / 16) % 4, s = step % 16, t = nextT;
      if (s % 4 === 0) tone('sine', 150, 42, t, 0.28, 0.9, musG);
      if (s === 4 || s === 12) noiseHit(t, 0.18, 0.45, 1800, 'bandpass', musG);
      if (s % 2 === 1 || intense >= 3) noiseHit(t, 0.04, s % 4 === 2 ? 0.18 : 0.08, 8000, 'highpass', musG);
      if (s % 2 === 0) {
        const r = roots[bar] * (s % 4 === 2 ? 2 : 1), o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = r; f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.2);
        g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(f); f.connect(g); g.connect(musG); o.start(t); o.stop(t + 0.25);
      }
      if (intense >= 2 || bar % 2 === 1) { const c = chords[bar]; tone('square', c[s % 3] * (s % 6 < 3 ? 1 : 2), 0, t, 0.12, 0.045, musG); }
      nextT += sixteenth; step++;
    }
  }
  const T = () => ctx.currentTime;
  return {
    ensure,
    update(speed, boost, sirenVol, heliVol, active) {
      if (!ctx) return; const now = ctx.currentTime;
      const f = 40 + speed * 2.2 + (boost ? 35 : 0);
      eng1.frequency.setTargetAtTime(f, now, 0.06); eng2.frequency.setTargetAtTime(f * 0.501, now, 0.06);
      engF.frequency.setTargetAtTime(350 + speed * 28 + (boost ? 900 : 0), now, 0.1);
      engG.gain.setTargetAtTime(active ? 0.045 + speed * 0.0012 : 0, now, 0.12);
      const ph = (G.t % 1.8) / 1.8, tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
      sir.frequency.setTargetAtTime(620 + tri * 520, now, 0.02);
      sirG.gain.setTargetAtTime(active ? sirenVol * 0.045 : 0, now, 0.1);
      heliG.gain.setTargetAtTime(active ? heliVol * 0.5 : 0, now, 0.2);
    },
    pickup(gold) { if (!ctx) return; const t = T(); const ns = gold ? [880, 1108, 1318, 1760] : [988, 1318, 1976]; ns.forEach((n, i) => tone('square', n, 0, t + i * 0.06, 0.16, 0.12)); tone('sine', 2637, 0, t + 0.2, 0.3, 0.08); },
    crash(k) { if (!ctx) return; const t = T(); noiseHit(t, 0.35 + k * 0.3, 0.5 + k * 0.4, 900); tone('square', 120, 40, t, 0.2, 0.25 * k); },
    explode() { if (!ctx) return; const t = T(); noiseHit(t, 1.3, 1.2, 600); tone('sine', 90, 25, t, 1, 0.8); },
    level() { if (!ctx) return; const t = T(); [523, 659, 784, 1046].forEach((n, i) => tone('sawtooth', n, 0, t + i * 0.08, 0.2, 0.09)); },
    escape() { if (!ctx) return; const t = T(); [392, 523, 659, 784, 1046].forEach((n, i) => tone('triangle', n, 0, t + i * 0.09, 0.3, 0.12)); },
    boost() { if (!ctx) return; const t = T(); noiseHit(t, 0.6, 0.35, 2500, 'bandpass'); tone('sawtooth', 200, 900, t, 0.4, 0.08); },
    busted() { if (!ctx) return; const t = T(); [440, 392, 349, 262].forEach((n, i) => tone('square', n, 0, t + i * 0.22, 0.3, 0.14)); },
    cash() { if (!ctx) return; const t = T(); noiseHit(t, 0.08, 0.4, 5000, 'highpass'); [1318, 1568, 2093, 2637].forEach((n, i) => tone('triangle', n, 0, t + 0.05 + i * 0.07, 0.35, 0.14)); tone('sine', 3136, 0, t + 0.35, 0.6, 0.1); },
    beep(hi) { if (!ctx) return; tone('square', hi ? 1320 : 660, 0, T(), hi ? 0.5 : 0.22, 0.14); },
    buy() { if (!ctx) return; const t = T(); [660, 990, 1320].forEach((n, i) => tone('square', n, 0, t + i * 0.05, 0.12, 0.1)); },
    deny() { if (!ctx) return; const t = T(); tone('square', 180, 120, t, 0.25, 0.12); },
    horn() { if (!ctx) return; const t = T(); tone('square', 392, 0, t, 0.3, 0.06); tone('square', 494, 0, t, 0.3, 0.05); },
    alarm() { if (!ctx) return; const t = T(); tone('square', 980, 760, t, 0.18, 0.08); },
    checkpoint() { if (!ctx) return; const t = T(); tone('triangle', 1046, 1568, t, 0.15, 0.13); },
    toggleMute() { if (!ctx) return false; muted = !muted; master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05); return muted; },
  };
})();
