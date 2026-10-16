import { WaveBase } from './waveBase.js';

// "Vagues" mode: five waves, weapons unlocked between them, the pharaoh in the last one.
export const WAVES = [
  { runner: 8 },
  { runner: 9, shooter: 4, scarab: 5 },
  { runner: 8, shooter: 6, tank: 2, mummy: 2, scarab: 5 },
  { runner: 9, shooter: 7, tank: 4, mummy: 3, scarab: 10 },
  { runner: 6, shooter: 6, tank: 2, mummy: 2, scarab: 5, boss: 1 },
];

export class WaveMode extends WaveBase {
  constructor(sim) {
    super(sim);
    this.id = 'waves';
  }

  composition(n) { return WAVES[n - 1] ?? {}; }
  isFinal(n) { return n === WAVES.length; }
  get totalWaves() { return WAVES.length; }
}
