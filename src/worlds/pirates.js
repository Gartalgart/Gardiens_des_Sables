import { SABLES } from './sables.js';

// "L'Île des pirates maudits" (U1): a ruined pirate port on a misty night.
// The map (blender/pirates/port.py) and the weapons (blender/pirates/weapons.py) are its own; until
// its enemies are made (phases 4 to 6 of the U1 plan), it borrows the desert's.
export const PIRATES = {
  ...SABLES,
  id: 'pirates',
  name: "L'Île des pirates maudits",
  title: ["L'Île des", 'pirates maudits'],
  lede: 'Un port pirate en ruine, noyé dans la brume. Sous la lune maudite, les morts reprennent leur poste.',

  files: {
    level: 'models/pirates/level.glb',
    // computed from level.glb by scripts/level-json-from-glb.mjs
    levelData: 'models/pirates/level.json',
    props: 'models/pirates/props.glb',
    // models of this universe that replace or add to the shared ones (src/assets.js), by key
    models: {
      cutlass: 'models/pirates/cutlass.glb',
      flintlock: 'models/pirates/flintlock.glb',
      blunderbuss: 'models/pirates/blunderbuss.glb',
      cannon: 'models/pirates/cannon.glb',
      grenade: 'models/pirates/bomb.glb',
    },
  },

  // ---------- weapons: all muzzle-loaders but the sabre, loaded by the mouth with a ramrod ----------
  weapons: [
    {
      id: 'cutlass', name: 'SABRE', melee: true, dmg: 80, range: 3.0, swing: 0.32, hitAt: 0.1, cooldown: 0.4,
      spread: 0, adsSpread: 0, adsFov: 75,
    },
    {
      // one heavy ball, then a long reload
      id: 'flintlock', name: 'PISTOLET À SILEX', dmg: 130, rpm: 100, auto: false, mag: 1, reserve: Infinity, pellets: 1,
      spread: 0.012, adsSpread: 0.001, reload: 1.7, recoil: 0.06, adsFov: 56,
    },
    {
      // two bell-mouthed barrels: a wide cone of shot each, then both are reloaded
      id: 'blunderbuss', name: 'TROMBLON', dmg: 13, rpm: 150, auto: false, mag: 2, reserve: 36, pellets: 12,
      spread: 0.12, adsSpread: 0.09, reload: 2.6, recoil: 0.08, adsFov: 64,
    },
    {
      // a ball that flies in an arc and blows up where it lands; the shot shoves the gunner back
      id: 'cannon', name: 'CANON PORTATIF', dmg: 0, rpm: 50, auto: false, mag: 1, reserve: 10, pellets: 1,
      spread: 0.008, adsSpread: 0.002, reload: 2.3, recoil: 0.12, adsFov: 60, knockback: 7,
      ball: { speed: 42, gravity: 9, radius: 4.5, dmg: 230, playerDmg: 40, hit: 120 },
    },
  ],
  startUnlocked: ['cutlass', 'flintlock'],
  unlocks: { 2: 'blunderbuss', 3: 'cannon' },
  props: {
    inside: 40, // the cliffs stand at ±42 m
    list: [
      { name: 'Prop_Rope', count: 8, clear: 1, shadow: true },
      { name: 'Prop_Bottle', count: 14, clear: 1, shadow: false, scale: 1.2 },
      { name: 'Prop_Planks', count: 10, clear: 1, shadow: true },
      { name: 'Prop_Skull', count: 10, clear: 1, shadow: false, scale: 1.3 },
      { name: 'Prop_Crab', count: 12, clear: 1, shadow: false },
      { name: 'Prop_Palm', count: 12, clear: 2, shadow: true, edge: true },
    ],
  },

  texts: {
    ...SABLES.texts,
    start: 'Sabre [1] et pistolet à silex [2] — bombes [G] — tenez le port',
    grenadeKill: 'BOMBE',
    victory: "La brume se lève sur le port. L'équipage maudit retourne au fond de la baie.",
  },

  ambiance: {
    fog: { color: 0x0d1a1c, density: 0.024 },
    sky: { zenith: [0.006, 0.016, 0.02], horizon: [0.06, 0.1, 0.1], haze: [0.04, 0.09, 0.07], glow: [0.2, 0.4, 0.3] },
    stars: 0xd2f0e4,
    moon: { dir: [0.5, 0.45, 0.75], disc: '#d9f5c8', light: 0x9fd8b8, intensity: 1.3 },
    hemi: { sky: 0x3d6a66, ground: 0x10181a, intensity: 1.0 },
    fire: { light: 0xffa54a, halo: 0xffb050, glow: '#ffc06a' }, // ship lanterns
    // the sea: its surface height, where the shore starts (Z) and its colour; surf on the beach
    sea: { level: 0.35, shore: 18, color: 0x1f5552 },
    surf: true,
  },
  menuCamera: { orbit: [0, -4], radius: 30, height: 11, look: [0, 2, 6] },
};
