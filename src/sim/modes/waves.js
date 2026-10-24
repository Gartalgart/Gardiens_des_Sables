import { WaveBase } from './waveBase.js';

// "Vagues" mode: the universe's fixed waves, weapons unlocked between them, the boss in the last one.
export class WaveMode extends WaveBase {
  constructor(sim) {
    super(sim);
    this.id = 'waves';
  }

  get waves() { return this.sim.world.waves; }
  composition(n) { return this.waves[n - 1] ?? {}; }
  isFinal(n) { return n === this.waves.length; }
  get totalWaves() { return this.waves.length; }
}
