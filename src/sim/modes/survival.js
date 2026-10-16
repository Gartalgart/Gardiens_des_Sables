import { WaveBase } from './waveBase.js';

// What a slot of the wave budget costs, and from which wave the type appears.
const ROSTER = [
  { type: 'runner', cost: 1, from: 1 },
  { type: 'shooter', cost: 1.5, from: 2 },
  { type: 'scarab', cost: 2.5, from: 2, count: 5 }, // a whole swarm
  { type: 'mummy', cost: 2.5, from: 3 },
  { type: 'tank', cost: 4, from: 3 },
];

// "Survie" mode: endless waves that keep growing, the pharaoh every fifth wave.
// Enemy health, speed and damage keep scaling with the wave number (see Enemies.setWave), and the
// mode itself adds more enemies, more elites and faster spawns as waves go by.
// Upgrade cards only come every fifth wave, after the pharaoh.
export class SurvivalMode extends WaveBase {
  constructor(sim) {
    super(sim);
    this.id = 'survival';
  }

  composition(n) {
    if (this.cache?.n === n) return this.cache.comp;
    const comp = {};
    const bossWave = n % 5 === 0;
    let budget = (8 + 4 * n) * (bossWave ? 0.5 : 1);
    if (bossWave) comp.boss = 1;
    const roster = ROSTER.filter((r) => r.from <= n);
    while (budget >= 1) {
      const r = roster[Math.floor(Math.random() * roster.length)];
      if (r.cost > budget) { budget -= 0.5; continue; }
      comp[r.type] = (comp[r.type] || 0) + (r.count || 1);
      budget -= r.cost;
    }
    // the composition is drawn once per wave: the banner and the wave itself must agree
    this.cache = { n, comp };
    return comp;
  }

  cardsAfter(n) { return n % 5 === 0; }
  eliteChance(n) { return n >= 3 ? Math.min(0.4, 0.05 + 0.02 * n) : 0; }
  extraAlive(n) { return Math.min(8, Math.floor(n / 2)); }
  spawnGapScale(n) { return Math.max(0.5, 1 - 0.03 * n); }

  nextWaveTitle(n) { return n % 5 === 0 ? `Vague ${n} — le pharaon` : `Vague ${n}`; }
}
