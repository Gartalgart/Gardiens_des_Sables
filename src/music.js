// Procedural music, no audio files: a drone, darbuka-like percussion and a plucked, oud-like melody
// on the Hijaz scale. Its intensity follows the game: 0 calm (menu, breaks), 1 combat, 2 the pharaoh.
const HIJAZ = [0, 1, 4, 5, 7, 8, 10]; // semitones from D: D Eb F# G A Bb C
const ROOT = 146.83; // D3
const LEVELS = [
  { bpm: 76, drone: 0.11, perc: 0, notes: 0.22, ghost: 0 },
  { bpm: 94, drone: 0.13, perc: 0.9, notes: 0.42, ghost: 0.2 },
  { bpm: 116, drone: 0.17, perc: 1.1, notes: 0.6, ghost: 0.6 },
];
// maqsum rhythm on a 16-step bar: D = doum (low), T = tek (high)
const MAQSUM = { 0: 'D', 2: 'T', 6: 'T', 8: 'D', 12: 'T' };

export class Music {
  constructor(ctx, out, noise) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
    this.level = 0;
    this.step = 0;
    this.degree = 4;
    this.nextTime = 0;

    // echo for the melody
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.32;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(out);

    // drone: D and A, slowly breathing through a lowpass
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(lp.frequency);
    for (const f of [ROOT / 2, ROOT * 0.75, ROOT / 2 * 1.005]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    lp.connect(this.droneGain).connect(out);
    lfo.start();
  }

  start() {
    this.nextTime = this.ctx.currentTime + 0.1;
    this.setIntensity(0);
    // schedule a little ahead of the audio clock, independently of the frame rate
    this.timer = setInterval(() => this.#schedule(), 50);
  }

  setIntensity(level) {
    if (level === this.level && this.started) return;
    this.started = true;
    this.level = level;
    this.droneGain.gain.setTargetAtTime(LEVELS[level].drone, this.ctx.currentTime, 1.5);
  }

  #schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05; // after a pause
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.#playStep(this.step, this.nextTime);
      this.nextTime += 60 / LEVELS[this.level].bpm / 4; // sixteenth notes
      this.step = (this.step + 1) % 16;
    }
  }

  #playStep(step, t) {
    const L = LEVELS[this.level];
    if (L.perc > 0) {
      const hit = MAQSUM[step];
      if (hit === 'D') this.#doum(t, L.perc);
      else if (hit === 'T') this.#tek(t, L.perc * 0.7);
      else if (step % 2 === 1 && Math.random() < L.ghost) this.#tek(t, L.perc * 0.25);
    }
    // melody on eighth notes, a random walk along the scale
    if (step % 2 === 0 && Math.random() < L.notes) {
      this.degree = Math.max(0, Math.min(13, this.degree + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
      const oct = Math.floor(this.degree / 7);
      const semis = HIJAZ[this.degree % 7] + 12 * oct;
      this.#pluck(t, ROOT * Math.pow(2, semis / 12), step % 8 === 0 ? 0.13 : 0.09);
    }
  }

  #doum(t, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + 0.35);
  }

  #tek(t, vol) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(f).connect(g).connect(this.out);
    n.start(t, Math.random()); n.stop(t + 0.1);
  }

  #pluck(t, freq, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 8, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.2, t + 0.35);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(f).connect(g);
    g.connect(this.out);
    g.connect(this.delay);
    o.start(t); o.stop(t + 0.75);
  }
}
