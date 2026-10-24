// WebAudio sound effects: recorded samples from assets/audio (ElevenLabs), each with
// a procedural version that plays while the file loads or if it fails to.
import { Music } from './music.js';

// 'weapons/pistol_fire' -> bundled url
const SAMPLE_URLS = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/audio/**/*.mp3', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.slice('../assets/audio/'.length, -'.mp3'.length), url]),
);

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// the enemies' cries, by type
const GROWLS = {
  runner: 'enemies/runner_screech',
  shooter: 'enemies/mummy_groan',
  tank: 'enemies/tank_roar',
  mummy: 'enemies/mummy_groan',
  scarab: 'enemies/scarab_skitter',
  boss: 'enemies/pharaoh_laugh',
  // the pirates' (the skeleton rattles its bones: procedural)
  crab: 'enemies/scarab_skitter',
  gunner: 'enemies/mummy_groan',
};
// played slower than recorded: the crab's clicks heavier, the ghost's moan deeper
const GROWL_RATE = { crab: 0.6, gunner: 0.7 };

export class Sound {
  constructor() {
    this.ctx = null;
    this.volumes = { master: 0.8, sfx: 1, music: 0.6 };
    this.buffers = {};
    this.lastLaugh = -Infinity;
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
    if (this.surfOn) this.setSurf(true);
    this.musicPlayer = new Music(this.ctx, this.music, this.noise);
    this.musicPlayer.start();
    this.samplesReady = this.#loadSamples();
  }

  hasSample(name) { return !!this.buffers[name]; }

  async #loadSamples() {
    await Promise.all(Object.entries(SAMPLE_URLS).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.buffers[name] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (err) {
        console.warn(`sound ${name}: could not load, the procedural one stays`, err);
      }
    }));
  }

  // plays a loaded sample; false tells the caller to fall back on its procedural sound
  #play(name, { pan = 0, vol = 1, when = 0, rate = 1 } = {}) {
    const buf = this.buffers[name];
    if (!buf) return false;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    s.connect(this.#out(pan, vol));
    s.start(this.ctx.currentTime + when);
    return true;
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
    const level = { pistol: 0.55, rifle: 0.45, shotgun: 0.7, sniper: 0.75, flintlock: 0.7, blunderbuss: 0.8, cannon: 0.9, musket: 0.8 }[kind];
    if (this.#play(`weapons/${kind}_fire`, { pan, vol: level * gain, rate: 0.97 + Math.random() * 0.06 })) return;
    const t = this.ctx.currentTime;
    const cfg = {
      pistol: { f: 1300, dec: 0.2, thump: 95, tail: 0.22, vol: 0.8 },
      rifle: { f: 1900, dec: 0.13, thump: 85, vol: 0.65 },
      shotgun: { f: 1300, dec: 0.38, thump: 70, vol: 1.0 },
      sniper: { f: 1900, dec: 0.6, thump: 55, vol: 1.1 },
      // black powder: a dull, long boom; the flintlock's lock snaps just before
      flintlock: { f: 1100, dec: 0.5, thump: 70, tail: 0.32, vol: 1.0, lock: true },
      blunderbuss: { f: 950, dec: 0.6, thump: 58, tail: 0.35, vol: 1.15, lock: true },
      musket: { f: 1300, dec: 0.7, thump: 55, tail: 0.4, vol: 1.15, lock: true },
      cannon: { f: 650, dec: 1.0, thump: 42, tail: 0.7, vol: 1.3 },
    }[kind];
    if (cfg.lock && gain === 1) this.#clack(0, 1.3, 0.5);
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
    this.#env(og, t, 0.002, 0.9, cfg.tail ?? 0.14);
    o.connect(og).connect(out);
    o.start(t); o.stop(t + (cfg.tail ?? 0.14) + 0.06);
  }

  // the sniper's bolt, worked by the view model after each shot
  bolt(when = 0) {
    if (!this.ctx) return;
    if (this.#play('weapons/sniper_bolt', { vol: 0.5, when })) return;
    this.#clack(when, 0.7, 0.6);
    this.#clack(when + 0.25, 0.5, 0.8);
  }

  // the khopesh's swing
  swoosh() {
    if (!this.ctx) return;
    if (this.#play('weapons/khopesh_swing', { vol: 0.5, rate: 0.95 + Math.random() * 0.1 })) return;
    this.#swoosh();
  }

  throw() {
    if (!this.ctx) return;
    if (this.#play('grenades/grenade_throw', { vol: 0.45 })) return;
    this.#swoosh();
  }

  #swoosh() {
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
    if (this.#play('weapons/khopesh_hit', { vol: Math.min(0.8, 0.45 + count * 0.1) })) return;
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

  // grenade or mummy blast: a deep boom under a burst of noise
  explosion(pan, vol) {
    if (!this.ctx) return;
    if (this.#play('grenades/grenade_explosion', { pan, vol: 0.9 * vol })) return;
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
    if (this.#play('enemies/pharaoh_teleport', { pan, vol: 0.6 * vol })) return;
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

  // the pharaoh rising at half health, as the storm comes (no procedural version)
  transform() {
    if (!this.ctx) return;
    this.#play('enemies/pharaoh_transform', { vol: 0.85 });
  }

  // a foot in the shallows: a short hiss of spray over a low slosh (no recording yet)
  #splash(vol) {
    const t = this.ctx.currentTime;
    const n = this.#noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400 + Math.random() * 600; f.Q.value = 0.8;
    const g = this.ctx.createGain();
    this.#env(g, t, 0.01, vol * 0.5, 0.22);
    n.connect(f).connect(g).connect(this.#out(0, 1));
    n.start(t); n.stop(t + 0.3);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    const og = this.ctx.createGain();
    this.#env(og, t, 0.005, vol * 0.35, 0.12);
    o.connect(og).connect(this.#out(0, 1));
    o.start(t); o.stop(t + 0.2);
  }

  // Surf on the beach (pirate port): low noise swelling and ebbing like waves breaking, every 7 s
  // or so. Asked for before the first click, it starts with the audio.
  setSurf(on) {
    this.surfOn = on;
    if (!this.ctx || !on || this.surf) return;
    const src = this.#noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 650;
    const g = this.ctx.createGain();
    g.gain.value = 0.07;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.14;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.06;
    lfo.connect(lg).connect(g.gain);
    const lf = this.ctx.createGain();
    lf.gain.value = 300;
    lfo.connect(lf).connect(f.frequency);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(); lfo.start();
    this.surf = g;
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

  // timed with the view model: magazine out, seated, slide or bolt racked
  reload(duration, weapon) {
    if (!this.ctx) return;
    if (['flintlock', 'blunderbuss', 'cannon', 'musket'].includes(weapon)) { this.#ram(duration, weapon); return; }
    if (weapon === 'shotgun') { this.click(0.7, 0.05); return; } // then a sound per shell
    // the sample is laid so it ends with the reload; the sniper's bolt is racked on its own
    const name = weapon === 'pistol' ? 'weapons/pistol_reload' : 'weapons/rifle_reload';
    const buf = this.buffers[name];
    const end = weapon === 'sniper' ? duration * 0.7 : duration * 0.92;
    if (buf && this.#play(name, { vol: 0.55, when: Math.max(0, end - buf.duration) })) {
      if (weapon === 'sniper') this.bolt(duration * 0.75);
      return;
    }
    this.click(0.8, duration * 0.2);
    this.#clack(duration * 0.72, 0.5, 0.9);
    this.click(0.6, duration * 0.72);
    if (weapon !== 'rifle') this.#clack(duration * 0.86, 0.8, 0.6);
  }

  // a muzzle-loader, timed with the view model: the charge goes down the mouth, the rod is drawn,
  // rams twice and goes back; the flintlock is cocked at the end
  #ram(duration, weapon) {
    const at = (k) => duration * k;
    if (weapon === 'cannon') {
      this.#scrape(at(0.3), 0.12, 300, 0.7); // the ball rolls down the barrel
      this.#clack(at(0.42), 0.25, 0.9);
      this.#clack(at(0.9), 0.5, 0.5);
      return;
    }
    this.#scrape(at(0.12), 0.08, 3200, 0.25); // the paper torn open
    this.#scrape(at(0.26), 0.1, 1400, 0.3);
    this.#scrape(at(0.36), 0.18, 2000, 0.25); // the rod drawn out
    this.#scrape(at(0.53), 0.12, 900, 0.45); // rammed twice
    this.#clack(at(0.6), 0.35, 0.5);
    this.#scrape(at(0.65), 0.12, 900, 0.45);
    this.#clack(at(0.72), 0.35, 0.5);
    this.#scrape(at(0.86), 0.12, 2000, 0.2); // back under the barrel
    if (weapon === 'flintlock') { this.click(0.9, at(0.9)); this.#clack(at(0.92), 0.8, 0.6); }
    else this.#clack(at(0.9), 0.7, 0.6);
  }

  // wood or metal sliding: a band of noise that sweeps down a little
  #scrape(when, dur, freq, vol) {
    const t = this.ctx.currentTime + when;
    const n = this.#noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(this.#out(0, 1));
    n.start(t); n.stop(t + dur + 0.05);
  }

  // a shell pushed into the shotgun's tube
  shell() {
    if (!this.ctx) return;
    if (this.#play('weapons/shotgun_shell_insert', { vol: 0.5, rate: 0.95 + Math.random() * 0.1 })) return;
    this.click(0.45); this.#clack(0.02, 0.4, 0.6);
  }

  // the shotgun's pump: a rattle back, then a heavier clack forward
  pump(when = 0) {
    if (!this.ctx) return;
    if (this.#play('weapons/shotgun_pump', { vol: 0.5, when })) return;
    this.#clack(when, 0.9, 0.7);
    this.#clack(when + 0.13, 0.55, 0.9);
  }

  #clack(when, pitch, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const n = this.#noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.value = 2600 * pitch;
    const g = this.ctx.createGain();
    this.#env(g, t, 0.001, vol, 0.05);
    n.connect(f).connect(g).connect(this.#out(0, 1));
    n.start(t); n.stop(t + 0.1);
  }

  dry() {
    if (!this.ctx) return;
    if (this.#play('weapons/dry_fire', { vol: 0.5 })) return;
    this.click(2.2);
  }

  weaponSwitch() {
    if (!this.ctx) return;
    if (this.#play('weapons/weapon_switch', { vol: 0.4 })) return;
    this.click(0.7);
  }

  hit(head) {
    if (!this.ctx) return;
    if (this.#play('enemies/enemy_hit', { vol: head ? 0.5 : 0.4, rate: head ? 1.15 : 1 })) return;
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

  // a skeleton's bones knocking together: a quick run of dry clicks
  #rattle(pan, vol, count = 7) {
    const t = this.ctx.currentTime;
    for (let i = 0; i < count; i++) {
      const at = t + i * (0.035 + Math.random() * 0.03);
      const n = this.#noiseSrc();
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 6;
      f.frequency.value = 1400 + Math.random() * 1600;
      const g = this.ctx.createGain();
      this.#env(g, at, 0.001, 0.5, 0.03);
      n.connect(f).connect(g).connect(this.#out(pan, vol));
      n.start(at); n.stop(at + 0.06);
    }
  }

  // an enemy turning to sand (a skeleton falls apart in bones); the pharaoh has his own death
  kill(pan, vol, type) {
    if (!this.ctx) return;
    if (type === 'skeleton') this.#rattle(pan, vol, 12);
    const big = type === 'tank' || type === 'boss' || type === 'crab';
    if (type === 'boss' && this.#play('enemies/pharaoh_death', { pan, vol: 0.9 })) return;
    if (this.#play('enemies/enemy_death_crumble', { pan, vol: 0.6 * vol, rate: big ? 0.8 : 0.95 + Math.random() * 0.1 })) return;
    this.crumble(pan, vol, big);
  }

  // the stone guardian's ground slam, or its charge ending in a wall
  slam(pan, vol) {
    if (!this.ctx) return;
    if (this.#play('enemies/tank_slam', { pan, vol: 0.8 * vol })) return;
    this.crumble(pan, vol, true);
  }

  enemyFire(pan, vol) {
    if (!this.ctx) return;
    if (this.#play('enemies/shooter_fire', { pan, vol: 0.5 * vol })) return;
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

  growl(pan, vol, low = false, type = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (type === 'boss') {
      if (t - this.lastLaugh < 6) return; // the laugh is long: not on every swing
      this.lastLaugh = t;
    }
    if (type === 'skeleton') { this.#rattle(pan, vol); return; }
    const name = GROWLS[type];
    if (name && this.#play(name, { pan, vol: 0.6 * vol, rate: (GROWL_RATE[type] ?? 1) * (0.93 + Math.random() * 0.14) })) return;
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
    if (victory && this.#play('medals/wave_cleared', { vol: 0.6 })) return;
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

  // a fire pot hitting stone
  thud(pan, vol) {
    if (!this.ctx) return;
    if (this.#play('grenades/grenade_bounce', { pan, vol: 0.6 * vol, rate: 0.95 + Math.random() * 0.1 })) return;
    const t = this.ctx.currentTime;
    const out = this.#out(pan, vol);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.08);
    const g = this.ctx.createGain();
    this.#env(g, t, 0.003, 0.35, 0.1);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.15);
  }

  // Call of Duty's headshot kill: a dry crack, then a bright metallic ring that dies away
  headshotKill() {
    if (!this.ctx) return;
    if (this.#play('medals/headshot', { vol: 0.6 })) return;
    const t = this.ctx.currentTime;
    const n = this.#noiseSrc();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2500;
    const ng = this.ctx.createGain();
    this.#env(ng, t, 0.001, 0.5, 0.05);
    n.connect(hp).connect(ng).connect(this.sfx);
    n.start(t); n.stop(t + 0.08);
    // inharmonic partials, like a struck piece of metal
    [[1850, 0.22, 0.45], [2960, 0.14, 0.35], [4410, 0.08, 0.22], [925, 0.12, 0.18]].forEach(([fr, peak, decay]) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(fr * 1.02, t + 0.012);
      o.frequency.exponentialRampToValueAtTime(fr, t + 0.1);
      const g = this.ctx.createGain();
      this.#env(g, t + 0.012, 0.002, peak, decay);
      o.connect(g).connect(this.sfx);
      o.start(t + 0.012); o.stop(t + 0.03 + decay);
    });
  }

  // the medal sting: a short rising brass chord, brighter for bigger medals; a spree has its fanfare
  medal(level = 1, spree = false) {
    if (!this.ctx) return;
    const name = spree ? 'medals/spree' : `medals/medal_${Math.min(3, Math.max(1, Math.floor(level) - 1))}`;
    if (this.#play(name, { vol: spree ? 0.7 : 0.6 })) return;
    const t = this.ctx.currentTime;
    const base = 196 * Math.pow(2, Math.min(level, 8) / 12);
    [1, 1.26, 1.5, 2].forEach((k, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = base * k;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(2600, t + 0.25);
      const g = this.ctx.createGain();
      const s = t + i * 0.035;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.09, s + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.9);
      o.connect(f).connect(g).connect(this.sfx);
      o.start(s); o.stop(s + 1);
    });
  }

  // land: the end of a fall; water: wading through the shallows
  step(sprint, land = false, water = false) {
    if (!this.ctx) return;
    if (water) return this.#splash(sprint ? 0.5 : 0.35);
    const name = land ? 'footsteps/sand_land'
      : sprint ? pick(['footsteps/sand_run_1', 'footsteps/sand_run_2'])
      : pick(['footsteps/sand_walk_1', 'footsteps/sand_walk_2', 'footsteps/sand_walk_3']);
    const vol = land ? 0.55 : sprint ? 0.45 : 0.35;
    if (this.#play(name, { vol, rate: 0.92 + Math.random() * 0.16 })) return;
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
