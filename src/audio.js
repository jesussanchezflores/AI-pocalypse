// Audio 100% sintetizado con WebAudio (disparos, reverberación, drones, ambiente).
export class AudioSys {
  constructor() { this.ctx = null; this.musicLevel = 0; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = c.createGain(); this.master.gain.value = 0.7;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5;
    this.master.connect(comp); comp.connect(c.destination);
    // reverberación de sala grande de hormigón
    const len = Math.floor(c.sampleRate * 2.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < 400 ? i / 400 : 1); }
    this.rev = c.createConvolver(); this.rev.buffer = ir;
    const rg = c.createGain(); rg.gain.value = 0.42; this.rev.connect(rg); rg.connect(this.master);
    // ruido
    const nl = c.sampleRate * 2; this.noise = c.createBuffer(1, nl, c.sampleRate);
    const nd = this.noise.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    // ambiente
    const amb = c.createBufferSource(); amb.buffer = this.noise; amb.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110;
    const ag = c.createGain(); ag.gain.value = 0.55; amb.connect(lp); lp.connect(ag); ag.connect(this.master); amb.start();
    const fan = c.createBufferSource(); fan.buffer = this.noise; fan.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 240; bp.Q.value = 0.6;
    const fg = c.createGain(); fg.gain.value = 0.05; const lfo = c.createOscillator(); lfo.frequency.value = 0.72 * 5 / 6.28 * 2;
    const lg = c.createGain(); lg.gain.value = 0.02; lfo.connect(lg); lg.connect(fg.gain); lfo.start();
    fan.connect(bp); bp.connect(fg); fg.connect(this.master); fan.start();
    const hum = c.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 50; const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 160;
    const hg = c.createGain(); hg.gain.value = 0.018; hum.connect(hf); hf.connect(hg); hg.connect(this.master); hum.start();
    this._startMusic();
  }

  // ---------- música adaptativa (0 = exploración, 1-3 = oleadas) ----------
  setMusic(level) {
    this.musicLevel = level;
    if (!this.ctx || !this.pad) return;
    const t = this.ctx.currentTime, L = level;
    this.pad.filter.frequency.setTargetAtTime([300, 430, 680, 950][L], t, 1.2);
    this.pad.gain.gain.setTargetAtTime([0.05, 0.075, 0.085, 0.09][L], t, 1.2);
    this.pad.tension.gain.setTargetAtTime([0, 0.004, 0.014, 0.03][L], t, 1.5);
    this.pad.trem.gain.setTargetAtTime(L === 3 ? 0.02 : 0, t, 1);
  }

  _startMusic() {
    const c = this.ctx;
    this.musicOut = c.createGain(); this.musicOut.gain.value = 0.9; this.musicOut.connect(this.master);
    const send = c.createGain(); send.gain.value = 0.35; this.musicOut.connect(send); send.connect(this.rev);
    // colchón grave permanente (Re menor) + voz disonante que entra con el peligro
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 300; filter.Q.value = 0.7;
    const gain = c.createGain(); gain.gain.value = 0; filter.connect(gain); gain.connect(this.musicOut);
    for (const [f, type, det] of [[73.42, 'sawtooth', -6], [73.42, 'sawtooth', 7], [110, 'sawtooth', 4], [146.83, 'sine', 0], [220.0, 'sine', -3]]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; o.connect(filter); o.start();
    }
    const tension = c.createGain(); tension.gain.value = 0;
    const tf = c.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 1500; tf.connect(tension); tension.connect(this.musicOut);
    for (const f of [293.66, 311.13, 622.25]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = Math.random() * 14 - 7; o.connect(tf); o.start(); }
    const lfo = c.createOscillator(); lfo.frequency.value = 7; const trem = c.createGain(); trem.gain.value = 0; lfo.connect(trem); trem.connect(tension.gain); lfo.start();
    this.pad = { filter, gain, tension, trem };
    this.mStep = 0; this.nextT = c.currentTime + 0.1;
    this.setMusic(this.musicLevel || 0);
    setInterval(() => this._schedule(), 40);
  }

  _schedule() {
    const c = this.ctx; if (c.state !== 'running') return;
    const now = c.currentTime; if (this.nextT < now) this.nextT = now + 0.05;
    while (this.nextT < now + 0.16) {
      const L = this.musicLevel || 0, bpm = [56, 84, 108, 132][L];
      this._musicStep(L, this.mStep, this.nextT);
      this.nextT += 60 / bpm / 4; this.mStep++;
    }
  }

  _mNote(t, freq, { type = 'sawtooth', dur = 0.2, peak = 0.2, cut = 800, attack = 0.005 } = {}) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(cut * 2.2, t); f.frequency.exponentialRampToValueAtTime(cut * 0.5, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicOut); o.start(t); o.stop(t + dur + 0.05);
  }
  _mKick(t, peak) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); g.connect(this.musicOut); o.start(t); o.stop(t + 0.3);
  }
  _mNoise(t, { type = 'highpass', f = 6000, q = 0.8, peak = 0.1, dur = 0.05 }) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.musicOut); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  _musicStep(L, step, t) {
    const s = step % 16, bar = Math.floor(step / 16);
    const D2 = 73.42, hz = (semi) => D2 * Math.pow(2, semi / 12);
    if (L === 0) {
      // exploración: campanas lejanas y espaciadas sobre el colchón
      if (s % 8 === 0 && Math.random() < 0.55) { const n = [24, 27, 31, 34, 36, 39][Math.floor(Math.random() * 6)]; this._mNote(t, hz(n), { type: 'sine', dur: 2.6, peak: 0.045, cut: 3000, attack: 0.03 }); }
      return;
    }
    const root = [0, 0, -2, 1][bar % 4];              // el Mib (+1) frigio aporta la amenaza
    if (L === 1) {
      // peligro leve: latido grave y lento
      if (s === 0 || s === 3) this._mKick(t, s === 0 ? 0.5 : 0.3);
      if (s === 0 || s === 10) this._mNote(t, hz(root), { dur: 0.7, peak: 0.16, cut: 260 });
      if (s === 8 && bar % 2 === 1) this._mNote(t, hz(24 + [3, 1][(bar >> 1) % 2]), { type: 'triangle', dur: 1.6, peak: 0.035, cut: 2000, attack: 0.05 });
      return;
    }
    if (L === 2) {
      // más peligro: ostinato en corcheas, bombo y charles
      const pat = [0, null, 0, null, 0, null, 3, null, 0, null, 0, null, 1, null, 0, 12];
      if (pat[s] !== null) this._mNote(t, hz(root + pat[s]), { dur: 0.22, peak: 0.17, cut: 480 });
      if (s === 0 || s === 8 || s === 11) this._mKick(t, 0.6);
      if (s % 4 === 2) this._mNoise(t, { peak: 0.05, dur: 0.04 });
      if (s === 12) this._mNoise(t, { type: 'bandpass', f: 1800, q: 0.9, peak: 0.12, dur: 0.12 });
      if (s === 0 && bar % 2 === 0) this._mNote(t, hz(24 + root + 7), { type: 'triangle', dur: 1.8, peak: 0.04, cut: 2400, attack: 0.04 });
      return;
    }
    // peligro máximo: semicorcheas, bombo a negras, caja, arpegio y golpes
    const pat = [0, 0, 12, 0, 0, 0, 3, 0, 0, 0, 12, 0, 1, 1, 5, 3];
    this._mNote(t, hz(root + pat[s]), { dur: 0.13, peak: s % 4 === 0 ? 0.2 : 0.14, cut: 750 });
    if (s % 4 === 0) this._mKick(t, 0.7);
    if (s === 4 || s === 12) { this._mNoise(t, { type: 'bandpass', f: 1900, q: 0.8, peak: 0.2, dur: 0.14 }); this._mNote(t, 190, { type: 'triangle', dur: 0.1, peak: 0.1, cut: 900 }); }
    if (s % 2 === 1) this._mNoise(t, { peak: s % 4 === 3 ? 0.07 : 0.04, dur: 0.035 });
    if (s % 2 === 0) { const arp = [24, 27, 31, 36, 31, 27, 25, 31]; this._mNote(t, hz(root + arp[(s / 2) % 8]), { type: 'square', dur: 0.14, peak: 0.035, cut: 2600 }); }
    if (s === 0 && bar % 4 === 0) { this._mNote(t, hz(root - 12), { dur: 1.4, peak: 0.3, cut: 300 }); this._mNoise(t, { type: 'lowpass', f: 500, peak: 0.25, dur: 0.6 }); }
  }

  _out(pos, rev = 0.3) {
    const c = this.ctx, g = c.createGain();
    let node = g;
    if (pos) {
      const p = c.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 3; p.rolloffFactor = 1.1;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; g.connect(p); node = p;
    }
    node.connect(this.master);
    if (rev > 0) { const s = c.createGain(); s.gain.value = rev; node.connect(s); s.connect(this.rev); }
    return g;
  }

  _noise(out, { type = 'lowpass', f0 = 2000, f1 = f0, q = 0.8, peak = 0.5, attack = 0.002, decay = 0.2, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + attack + decay + 0.05);
  }

  _tone(out, { type = 'sine', f0 = 200, f1 = f0, peak = 0.5, attack = 0.002, decay = 0.2, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + attack + decay + 0.05);
  }

  shot() {
    if (!this.ctx) return; const o = this._out(null, 0.55);
    this._noise(o, { type: 'highpass', f0: 1800, peak: 0.5, decay: 0.045 });
    this._noise(o, { f0: 4200 + Math.random() * 600, f1: 350, peak: 1.0, decay: 0.17 });
    this._tone(o, { f0: 170, f1: 42, peak: 0.95, decay: 0.13 });
    this._tone(o, { type: 'square', f0: 900, f1: 200, peak: 0.12, decay: 0.03 });
  }
  dry() { if (!this.ctx) return; this._noise(this._out(null, 0.1), { type: 'bandpass', f0: 3200, q: 4, peak: 0.25, decay: 0.03 }); }
  click(delay = 0, f = 2400, peak = 0.3) {
    if (!this.ctx) return; const o = this._out(null, 0.15);
    this._noise(o, { type: 'bandpass', f0: f, q: 3, peak, decay: 0.04, delay });
    this._tone(o, { type: 'triangle', f0: f * 0.35, f1: f * 0.2, peak: peak * 0.5, decay: 0.05, delay });
  }
  reload() { this.click(0.25, 1800, 0.3); this.click(0.38, 900, 0.22); this.click(1.12, 1500, 0.34); this.click(1.2, 2600, 0.2); this.click(1.62, 2100, 0.4); this.click(1.7, 3000, 0.3); }
  drink() { if (!this.ctx) return; const o = this._out(null, 0.4); for (let i = 0; i < 3; i++) this._tone(o, { f0: 240 + i * 40, f1: 130, peak: 0.25, decay: 0.12, delay: 0.62 + i * 0.22 }); this._tone(o, { type: 'triangle', f0: 520, f1: 1560, peak: 0.12, attack: 0.5, decay: 0.6, delay: 1.35 }); }
  step() { if (!this.ctx) return; this._noise(this._out(null, 0.25), { f0: 500 + Math.random() * 250, f1: 120, peak: 0.16, decay: 0.09 }); }
  land() { if (!this.ctx) return; this._noise(this._out(null, 0.3), { f0: 400, f1: 80, peak: 0.4, decay: 0.16 }); }
  hit() { if (!this.ctx) return; this._tone(this._out(null, 0), { type: 'triangle', f0: 1900, f1: 1500, peak: 0.16, decay: 0.05 }); }
  kill() { if (!this.ctx) return; const o = this._out(null, 0); this._tone(o, { type: 'triangle', f0: 1300, f1: 1250, peak: 0.2, decay: 0.07 }); this._tone(o, { type: 'triangle', f0: 1950, f1: 1900, peak: 0.2, decay: 0.12, delay: 0.07 }); }
  hurt() { if (!this.ctx) return; const o = this._out(null, 0.2); this._tone(o, { f0: 110, f1: 45, peak: 0.8, decay: 0.22 }); this._noise(o, { f0: 900, f1: 150, peak: 0.4, decay: 0.15 }); }
  impact(pos) { if (!this.ctx) return; this._noise(this._out(pos, 0.3), { type: 'bandpass', f0: 2600 + Math.random() * 2500, f1: 800, q: 2, peak: 0.5, decay: 0.07 }); }
  metal(pos) { if (!this.ctx) return; const o = this._out(pos, 0.4); this._tone(o, { type: 'triangle', f0: 2200 + Math.random() * 1800, peak: 0.3, decay: 0.12 }); this._noise(o, { type: 'bandpass', f0: 5000, q: 3, peak: 0.4, decay: 0.05 }); }
  shellTink(pos) { if (!this.ctx) return; this._tone(this._out(pos, 0.3), { type: 'sine', f0: 5200 + Math.random() * 1800, peak: 0.07, decay: 0.07 }); }
  droneCharge(pos) { if (!this.ctx) return; this._tone(this._out(pos, 0.3), { type: 'sawtooth', f0: 220, f1: 1300, peak: 0.16, attack: 0.5, decay: 0.12 }); }
  droneShot(pos) { if (!this.ctx) return; const o = this._out(pos, 0.5); this._tone(o, { type: 'sawtooth', f0: 1500, f1: 180, peak: 0.5, decay: 0.22 }); this._noise(o, { type: 'bandpass', f0: 2500, f1: 500, q: 1.5, peak: 0.4, decay: 0.15 }); }
  explosion(pos) {
    if (!this.ctx) return; const o = this._out(pos, 0.8);
    this._noise(o, { f0: 3000, f1: 60, peak: 1.6, decay: 0.9 }); this._tone(o, { f0: 120, f1: 28, peak: 1.6, decay: 0.6 });
    this._noise(o, { type: 'highpass', f0: 2500, peak: 0.5, decay: 0.12 });
  }
  alarm() { if (!this.ctx) return; const o = this._out(null, 0.5); for (let i = 0; i < 3; i++) this._tone(o, { type: 'square', f0: 620, f1: 610, peak: 0.07, attack: 0.02, decay: 0.22, delay: i * 0.36 }); }

  droneHum() {
    if (!this.ctx) return null; const c = this.ctx;
    const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square';
    const base = 85 + Math.random() * 30; o1.frequency.value = base; o2.frequency.value = base * 2.02;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = c.createGain(); g.gain.value = 0.11;
    const p = c.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 2; p.rolloffFactor = 1.6;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(p); p.connect(this.master); o1.start(); o2.start();
    return {
      set(pos) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; },
      stop() { try { o1.stop(); o2.stop(); p.disconnect(); } catch (e) { /* noop */ } },
    };
  }

  listener(pos, fwd) {
    if (!this.ctx) return; const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }
  suspend() { if (this.ctx) this.ctx.suspend(); }
}
