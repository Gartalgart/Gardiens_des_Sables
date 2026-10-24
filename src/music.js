// Procedural music, no audio files: a drone, percussion and a plucked melody wandering along a
// scale. Its intensity follows the game: 0 calm (menu, breaks), 1 combat, 2 the boss. Each universe
// has its theme (see THEMES): the desert, the pirates' shanty.
export const THEMES = {
  // darbuka-like percussion on the maqsum rhythm, an oud-like melody on the Hijaz scale
  desert: {
    scale: [0, 1, 4, 5, 7, 8, 10], // semitones from D: D Eb F# G A Bb C
    root: 146.83, // D3
    levels: [
      { bpm: 76, drone: 0.11, perc: 0, notes: 0.22, ghost: 0 },
      { bpm: 94, drone: 0.13, perc: 0.9, notes: 0.42, ghost: 0.2 },
      { bpm: 116, drone: 0.17, perc: 1.1, notes: 0.6, ghost: 0.6 },
    ],
    steps: 16, // sixteenth notes in a bar
    hits: { 0: 'D', 2: 'T', 6: 'T', 8: 'D', 12: 'T' }, // D = doum (low), T = tek (high)
    accent: 8, // the melody leans on every 8th step
    drone: [0.5, 0.75, 0.5025], // times the root: D2, A2 and a slightly detuned D2
  },
  // a sea shanty in 6/8: boots stomping, hands clapping, an accordion drone and a fiddle-like tune
  // on the Dorian mode
  shanty: {
    scale: [0, 2, 3, 5, 7, 9, 10], // D Dorian: D E F G A B C
    root: 146.83,
    levels: [
      { bpm: 70, drone: 0.1, perc: 0, notes: 0.3, ghost: 0 },
      { bpm: 92, drone: 0.12, perc: 1.0, notes: 0.5, ghost: 0.25 },
      { bpm: 112, drone: 0.16, perc: 1.2, notes: 0.65, ghost: 0.5 },
    ],
    steps: 12, // a 6/8 bar in sixteenths
    hits: { 0: 'D', 3: 'T', 6: 'D', 9: 'T' },
    accent: 6,
    drone: [0.5, 0.75, 1],
  },
};

export class Music {
  constructor(ctx, out, noise, theme = THEMES.desert) {
    this.theme = theme;
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
    for (const k of theme.drone) {
      const f = theme.root * k;
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
    this.droneGain.gain.setTargetAtTime(this.theme.levels[level].drone, this.ctx.currentTime, 1.5);
  }

  #schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05; // after a pause
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.#playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.theme.levels[this.level].bpm / 4; // sixteenth notes
      this.step = (this.step + 1) % this.theme.steps;
    }
  }

  #playStep(step, t) {
    const T = this.theme, L = T.levels[this.level];
    if (L.perc > 0) {
      const hit = T.hits[step];
      if (hit === 'D') this.#doum(t, L.perc);
      else if (hit === 'T') this.#tek(t, L.perc * 0.7);
      else if (step % 2 === 1 && Math.random() < L.ghost) this.#tek(t, L.perc * 0.25);
    }
    // melody on eighth notes, a random walk along the scale
    if (step % 2 === 0 && Math.random() < L.notes) {
      this.degree = Math.max(0, Math.min(13, this.degree + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
      const oct = Math.floor(this.degree / 7);
      const semis = T.scale[this.degree % 7] + 12 * oct;
      this.#pluck(t, T.root * Math.pow(2, semis / 12), step % T.accent === 0 ? 0.13 : 0.09);
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
