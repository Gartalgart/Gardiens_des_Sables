// Progression shared by the wave modes: upgrade cards, secondary objectives and score.
import { t } from '../i18n.js';

// Upgrade cards, offered between waves (3 to choose from, 4 after a completed objective).
// max: how many times a card can be taken; mods: what one copy adds to the player's modifiers.
// Their names and descriptions: up.<id> and up.<id>.desc in src/strings.js.
export const UPGRADES = [
  { id: 'sharpBlade', max: 2, apply: (m) => { m.swordDmg += 0.25; } },
  { id: 'wideArc', max: 2, apply: (m) => { m.swordReach += 0.25; } },
  { id: 'bigMags', max: 2, apply: (m) => { m.mag += 0.5; } },
  { id: 'quickHands', max: 2, apply: (m) => { m.reload *= 0.7; } },
  { id: 'piercing', max: 1, apply: (m) => { m.pierce = 1; } },
  { id: 'hawkEye', max: 2, apply: (m) => { m.headMul += 0.5; } },
  { id: 'vitality', max: 2, apply: (m, p) => { p.maxHealth += 25; p.health = p.maxHealth; } },
  { id: 'bloodthirst', max: 2, apply: (m) => { m.lifesteal += 5; } },
  { id: 'secondWind', max: 2, apply: (m) => { m.regenDelayCut += 1.5; m.regenMul *= 1.5; } },
  { id: 'bronzeGuard', max: 1, apply: (m) => { m.blockFactor = 0; m.parryWindow += 0.1; } },
  { id: 'lightFeet', max: 2, apply: (m) => { m.speed *= 1.12; } },
  { id: 'scavenger', max: 2, apply: (m) => { m.drops *= 1.5; m.ammo *= 1.5; } },
];
const BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function baseMods() {
  return {
    swordDmg: 1, swordReach: 1, mag: 1, reload: 1, pierce: 0, headMul: 2, lifesteal: 0,
    regenDelayCut: 0, regenMul: 1, blockFactor: 0.25, parryWindow: 0.25, speed: 1, drops: 1, ammo: 1,
  };
}

// k distinct cards the player can still take
export function drawCards(player, k) {
  const pool = UPGRADES.filter((u) => (player.upgrades[u.id] || 0) < u.max).map((u) => u.id);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, k);
}

export function applyUpgrade(player, id) {
  const u = BY_ID[id];
  if (!u || (player.upgrades[id] || 0) >= u.max) return false;
  player.upgrades[id] = (player.upgrades[id] || 0) + 1;
  u.apply(player.mods, player);
  return true;
}

export function upgradeInfo(id) { return { ...BY_ID[id], name: t(`up.${id}`), desc: t(`up.${id}.desc`) }; }

// Secondary objective of a wave. progress(stats) -> number, done when it reaches target.
// "under" objectives (damage, time) succeed when the value stays below the limit until the wave is cleared.
export const OBJECTIVES = [
  { id: 'blade', make: (w, world) => ({ text: t('obj.blade', { n: 6 + w, how: world?.texts.bladeObjective ?? t('obj.bladeHow') }), target: 6 + w, stat: 'meleeKills' }) },
  { id: 'heads', make: (w) => ({ text: t('obj.heads', { n: 3 + w }), target: 3 + w, stat: 'headshots' }) },
  { id: 'parry', make: (w) => ({ text: t('obj.parry', { n: 2 + Math.floor(w / 2) }), target: 2 + Math.floor(w / 2), stat: 'perfectParries' }) },
  { id: 'untouched', make: () => ({ text: t('obj.untouched'), target: 40, stat: 'damageTaken', under: true }) },
  { id: 'fast', make: (w) => ({ text: t('obj.fast', { n: 45 + 15 * Math.min(w, 6) }), target: 45 + 15 * Math.min(w, 6), stat: 'time', under: true }) },
];

// objectives a universe can add to the common ones (world.objectives lists their ids)
export const WORLD_OBJECTIVES = {
  // the pirate port: enemies caught in a powder keg's blast
  kegs: { id: 'kegs', make: (w) => ({ text: t('obj.kegs', { n: 2 + Math.floor(w / 2) }), target: 2 + Math.floor(w / 2), stat: 'kegKills' }) },
  // the pirate port: looters go for the chest in the cave (see Enemies#loot); keep more than half its gold
  chest: { id: 'chest', make: () => ({ text: t('obj.chest'), target: 50, stat: 'chestLoss', under: true, chest: true }) },
  // the station: infected crew go and sabotage the reactor (the chest's looting, see Enemies#loot);
  // not in the Hive Queen's wave, when she sits on it
  reactor: {
    id: 'reactor', ok: (w, world) => !world?.waves?.[w - 1]?.boss,
    make: () => ({ text: t('obj.reactor'), target: 50, stat: 'chestLoss', under: true, chest: true, unit: t('obj.reactorUnit') }),
  },
  // the station: an airlock blows now and then during the wave (Sim#updateBreaches); shut each one
  // with its lever in time (breachLate: the airlocks left open too long)
  breaches: { id: 'breaches', ok: (w, world) => !world?.waves?.[w - 1]?.boss, make: () => ({ text: t('obj.breaches'), target: 1, stat: 'breachLate', under: true, breaches: true }) },
};

export function pickObjective(wave, world = null) {
  const pool = [...OBJECTIVES, ...(world?.objectives ?? []).map((id) => WORLD_OBJECTIVES[id])].filter((o) => o.ok?.(wave, world) !== false);
  const o = pool[Math.floor(Math.random() * pool.length)];
  return { id: o.id, ...o.make(wave, world) };
}

export function freshWaveStats() {
  return { meleeKills: 0, headshots: 0, perfectParries: 0, damageTaken: 0, time: 0, kegKills: 0, chestLoss: 0, breachLate: 0, breachLeft: null };
}

export function objectiveDone(obj, stats) {
  const v = stats[obj.stat];
  return obj.under ? v < obj.target : v >= obj.target;
}

// Score: points per kill, scaled by difficulty; bonuses for style and progress.
export const KILL_POINTS = {
  runner: 100, shooter: 150, scarab: 40, mummy: 200, tank: 400, boss: 3000, skeleton: 100, gunner: 200, crab: 400, siren: 300, bats: 80,
  host: 100, parasite: 60, brute: 400, drone: 200, crawler: 150, eggsac: 120,
};
export const DIFFICULTY_SCORE = { easy: 0.75, normal: 1, hard: 1.5 };
export const BONUS = { headshotKill: 50, meleeKill: 25, grenadeKill: 25, perfectParry: 100, objective: 1000, wavePerLevel: 500, victory: 5000, revive: 200 };
