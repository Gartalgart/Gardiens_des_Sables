import { WaveBase } from './waveBase.js';
import { t } from '../../i18n.js';

// "Survie" mode: endless waves that keep growing, the boss every fifth wave.
// Enemy health, speed and damage keep scaling with the wave number (see Enemies.setWave), and the
// mode itself adds more enemies, more elites and faster spawns as waves go by.
// Upgrade cards only come every fifth wave, after the boss.
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
    // the universe's roster: what a slot of the wave budget costs, and from which wave the type appears
    const roster = this.sim.world.survival.filter((r) => r.from <= n);
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

  nextWaveTitle(n) { return n % 5 === 0 ? t('sim.waveBoss', { n, boss: this.sim.world.texts.bossWave }) : t('sim.wave', { n }); }
}
