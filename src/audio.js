// Procedural WebAudio sound effects: no audio files needed.
import { Music } from './music.js';

export class Sound {
  constructor() {
    this.ctx = null;
    this.volumes = { master: 0.8, sfx: 1, music: 0.6 };
  }

  // master scales everything; sfx and music are separate buses
  setVolumes(master, sfx, music) {
    this.volumes = { master, sfx, music };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master * 0.7, t, 0.05);
    this.sfx.gain.setTargetAtTime(sfx, t, 0.05);
    this.music.gain.setTargetAtTime(music, t, 0.05);
  }

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.connect(this.master);
    const v = this.volumes;
    this.master.gain.value = v.master * 0.7;
    this.sfx.gain.value = v.sfx;
    this.music.gain.value = v.music;
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.#wind();
    this.musicPlayer = new Music(this.ctx, this.music, this.noise);
    this.musicPlayer.start();
  }

  // 0 calm, 1 combat, 2 the pharaoh
  setMusicIntensity(level) { this.musicPlayer?.setIntensity(level); }

  resume() { this.ctx?.resume(); }
  suspend() { this.ctx?.suspend(); }

  #noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  #env(node, t, a, peak, decay) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  // pan: -1..1, vol: 0..1 (distance attenuation done by the caller)
  #out(pan = 0, vol = 1) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.sfx);
    return g;
  }

  #wind() {
    const src = this.#noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    this.windGain = g;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain();
    lg.gain.value = 250;
    lfo.connect(lg).connect(f.frequency);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(); lfo.start();
  }

  // pan / gain: a teammate's shot is placed in space and quieter
  shot(kind, pan = 0, gain = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const cfg = {
      pistol: { f: 2200, dec: 0.16, thump: 140, vol: 0.7 },
      rifle: { f: 2600, dec: 0.12, thump: 110, vol: 0.6 },
      shotgun: { f: 1300, dec: 0.38, thump: 70, vol: 1.0 },
    }[kind];
    const out = this.#out(pan, cfg.vol * gain);
    const n = this.#noiseSrc();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cfg.f * 2.5, t);
    lp.frequency.exponentialRampToValueAtTime(cfg.f * 0.2, t + cfg.dec);
    const g = this.ctx.createGain();
    this.#env(g, t, 0.002, 1, cfg.dec);
    n.connect(lp).connect(g).connect(out);
    n.start(t); n.stop(t + cfg.dec + 0.05);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(cfg.thump, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.12);
    const og = this.ctx.createGain();
    this.#env(og, t, 0.002, 0.9, 0.14);
    o.connect(og).connect(out);
    o.start(t); o.stop(t + 0.2);
  }

  swoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.#noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.12);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    const g = this.ctx.createGain();
    this.#env(g, t, 0.06, 0.6, 0.18);
    n.connect(f).connect(g).connect(this.#out(0, 1));
    n.start(t); n.stop(t + 0.3);
  }

  slash(count) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    const g = this.ctx.createGain();
    this.#env(g, t, 0.002, Math.min(1, 0.5 + count * 0.15), 0.16);
    o.connect(f).connect(g).connect(this.#out(0, 1));
    o.start(t); o.stop(t + 0.2);
    this.crumble(0, 0.35);
  }

  clang() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [1250, 1870, 2630].forEach((fr, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = fr;
      const g = this.ctx.createGain();
      this.#env(g, t, 0.001, 0.22 / (i + 1), 0.4);
      o.connect(g).connect(this.#out(0, 1));
      o.start(t); o.stop(t + 0.45);
    });
  }

  // mummy blast: a deep boom under a burst of noise
  explosion(pan, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.#out(pan, vol);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const og = this.ctx.createGain();
    this.#env(og, t, 0.005, 1, 0.7);
    o.connect(og).connect(out);
    o.start(t); o.stop(t + 0.8);
    const n = this.#noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2500, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.9);
    const ng = this.ctx.createGain();
    this.#env(ng, t, 0.003, 0.9, 0.9);
    n.connect(f).connect(ng).connect(out);
    n.start(t); n.stop(t + 1);
  }

  // short beep of a priming mummy
  beep(pan, vol, pitch = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 880 * pitch;
    const g = this.ctx.createGain();
    this.#env(g, t, 0.002, 0.12, 0.06);
    o.connect(g).connect(this.#out(pan, vol));
    o.start(t); o.stop(t + 0.1);
  }

  // the pharaoh vanishing / appearing
  warp(pan, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(1200, t + 0.35);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3;
    const g = this.ctx.createGain();
    this.#env(g, t, 0.02, 0.35, 0.35);
    o.connect(f).connect(g).connect(this.#out(pan, vol));
    o.start(t); o.stop(t + 0.45);
  }

  // stronger wind during the sandstorm (k: 0..1)
  setStorm(k) {
    if (!this.windGain) return;
    this.windGain.gain.setTargetAtTime(0.05 + 0.28 * k, this.ctx.currentTime, 0.8);
  }

  // perfect parry: a bright ringing chime over the clang
  perfect() {
    if (!this.ctx) return;
    this.clang();
    const t = this.ctx.currentTime;
    [2400, 3600].forEach((fr, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = fr;
      const g = this.ctx.createGain();
      this.#env(g, t + i * 0.04, 0.002, 0.18 / (i + 1), 0.9);
      o.connect(g).connect(this.#out(0, 1));
      o.start(t + i * 0.04); o.stop(t + 1.1);
    });
  }

  click(pitch = 1, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1800 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(400 * pitch, t + 0.03);
    const g = this.ctx.createGain();
    this.#env(g, t, 0.001, 0.15, 0.04);
    o.connect(g).connect(this.#out(0, 1));
    o.start(t); o.stop(t + 0.08);
  }

  reload(duration) {
    this.click(0.8, 0.05);
    this.click(0.6, duration * 0.45);
    this.click(1.1, duration * 0.9);
  }

  dry() { this.click(2.2); }

  hit(head) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(head ? 1400 : 900, t);
    o.frequency.exponentialRampToValueAtTime(head ? 900 : 500, t + 0.06);
    const g = this.ctx.createGain();
    this.#env(g, t, 0.001, head ? 0.35 : 0.2, 0.07);
    o.connect(g).connect(this.#out(0, 1));
    o.start(t); o.stop(t + 0.1);
  }

  crumble(pan, vol, big = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.#noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = big ? 500 : 900;
    const g = this.ctx.createGain();
    const dec = big ? 1.6 : 0.6;
    this.#env(g, t, 0.01, 0.9, dec);
    n.connect(f).connect(g).connect(this.#out(pan, vol));
    n.start(t); n.stop(t + dec + 0.1);
  }

  enemyFire(pan, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.35);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1200;
    const g = this.ctx.createGain();
    this.#env(g, t, 0.01, 0.35, 0.35);
    o.connect(f).connect(g).connect(this.#out(pan, vol));
    o.start(t); o.stop(t + 0.4);
  }

  growl(pan, vol, low = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const base = low ? 55 : 110;
    o.frequency.setValueAtTime(base * 1.3, t);
    o.frequency.linearRampToValueAtTime(base, t + 0.4);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = low ? 300 : 700; f.Q.value = 2;
    const g = this.ctx.createGain();
    this.#env(g, t, 0.05, 0.4, 0.45);
    o.connect(f).connect(g).connect(this.#out(pan, vol));
    o.start(t); o.stop(t + 0.55);
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.#noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 260;
    const g = this.ctx.createGain();
    this.#env(g, t, 0.005, 1.0, 0.25);
    n.connect(f).connect(g).connect(this.#out(0, 1));
    n.start(t); n.stop(t + 0.3);
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [660, 990].forEach((fr, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = fr;
      const g = this.ctx.createGain();
      this.#env(g, t + i * 0.08, 0.005, 0.25, 0.15);
      o.connect(g).connect(this.#out(0, 1));
      o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.25);
    });
  }

  horn(victory = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = victory ? [220, 277, 330, 440] : [110, 165, 220];
    notes.forEach((fr) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = fr;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1400, t + 0.8);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + 2.2);
      o.connect(f).connect(g).connect(this.sfx);
      o.start(t); o.stop(t + 2.3);
    });
  }

  step(sprint) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.#noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 350 + Math.random() * 150; f.Q.value = 1.2;
    const g = this.ctx.createGain();
    this.#env(g, t, 0.005, sprint ? 0.22 : 0.14, 0.09);
    n.connect(f).connect(g).connect(this.#out(0, 1));
    n.start(t); n.stop(t + 0.15);
  }
}
