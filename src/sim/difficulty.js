// Difficulty presets. "hard" is the tuning of the first aggressive version.
export const DIFFICULTIES = {
  easy: {
    label: 'Facile',
    dmg: 0.5, dmgPerWave: 0.05, hpPerWave: 0.06, speed: 0.9, speedPerWave: 0.03,
    maxMelee: (w) => 2, attackCd: 1.5, leapCd: 1.8, chargeCd: 1.6, fireCd: 1.5, shooterBurstWave: 99,
    maxAlive: 10, spawnGap: [1.4, 1.1, 0.9], ambush: 0.3, ambushMin: 24,
    regenDelay: 2.5, regenRate: 35,
  },
  normal: {
    label: 'Normal',
    dmg: 0.7, dmgPerWave: 0.06, hpPerWave: 0.08, speed: 0.95, speedPerWave: 0.04,
    maxMelee: (w) => 2 + Math.floor(w / 3), attackCd: 1.25, leapCd: 1.4, chargeCd: 1.3, fireCd: 1.25, shooterBurstWave: 4,
    maxAlive: 12, spawnGap: [1.2, 0.95, 0.75], ambush: 0.4, ambushMin: 20,
    regenDelay: 3, regenRate: 30,
  },
  hard: {
    label: 'Difficile',
    dmg: 1, dmgPerWave: 0.1, hpPerWave: 0.12, speed: 1, speedPerWave: 0.06,
    maxMelee: (w) => 2 + Math.ceil(w / 2.5), attackCd: 1, leapCd: 1, chargeCd: 1, fireCd: 1, shooterBurstWave: 3,
    maxAlive: 16, spawnGap: [1.0, 0.8, 0.55], ambush: 0.6, ambushMin: 16,
    regenDelay: 4, regenRate: 22,
  },
};

// Settings of one game: a copy of a preset, so a running game never sees the picker change.
export function makeDifficulty(key) {
  const k = DIFFICULTIES[key] ? key : 'normal';
  return { key: k, ...DIFFICULTIES[k] };
}
