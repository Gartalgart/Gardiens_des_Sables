import { SABLES } from './sables.js';

// "L'Île des pirates maudits" (U1): a ruined pirate port on a misty night.
// The map (blender/pirates/port.py), the weapons (blender/pirates/weapons.py) and the enemies
// (blender/pirates/enemies.py) are its own; the pharaoh stands in for its boss until phase 6.
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
      musket: 'models/pirates/musket.glb',
      grenade: 'models/pirates/bomb.glb',
      skeleton: 'models/pirates/skeleton.glb',
      siren: 'models/pirates/siren.glb',
      bats: 'models/pirates/bat.glb', // one bat: the client draws a swarm of them
      crab: 'models/pirates/crab.glb',
      gunner: 'models/pirates/gunner.glb',
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
    {
      // for the last wave: a long musket with a spyglass; one ball that goes on through a first
      // target, wild from the hip, dead on through the glass, then a long reload
      id: 'musket', name: 'MOUSQUET À LONGUE-VUE', dmg: 160, rpm: 40, auto: false, mag: 1, reserve: 20, pellets: 1,
      spread: 0.07, adsSpread: 0, reload: 2.4, recoil: 0.1, adsFov: 18, pierce: true, scope: true,
    },
  ],
  startUnlocked: ['cutlass', 'flintlock'],
  unlocks: { 2: 'blunderbuss', 3: 'cannon', 5: 'musket' },

  // ---------- enemies (models: blender/pirates/enemies.py) ----------
  enemies: {
    // the cursed sailor: comes in threes, cutlass in hand, and lunges
    skeleton: {
      hp: 75, speed: 6.8, radius: 0.4, height: 1.85, headY: 1.45, early: 0.75, weave: true,
      melee: { range: 1.8, dmg: 12, windup: 0.22, cd: 0.8 },
      leap: { min: 3.5, max: 7, dur: 0.5, dmg: 14, cd: [3, 5] },
      swarm: 3,
    },
    // the giant crab: comes out of the sea; its shell stops most of a blow from the front, but it
    // charges sideways, its flank turned toward its target
    crab: {
      hp: 520, speed: 3.0, radius: 1.0, height: 1.3, headY: 1.0,
      melee: { range: 2.9, dmg: 28, windup: 0.45, cd: 1.5 },
      charge: { min: 5, max: 20, wind: 0.65, speed: 12, dur: 1.3, dmg: 26, cd: [5, 7], side: true },
      armor: { mul: 0.3, arc: 0.5 }, // damage × mul within ±60° of its face
      big: true,
      // rises from the shallows off the west beach: the quay along the rest of the shore is a 1 m step
      // it cannot climb, and behind the galleon it would get caught on the ship
      fromWater: { minX: -42, minZ: 18.5, maxX: -32, maxZ: 27 },
    },
    // the ghost gunner: keeps its post on the galleon's deck and lobs balls over the walls (not
    // under a roof); a shadow on the ground shows where each one falls
    gunner: {
      hp: 110, speed: 1.6, radius: 0.45, height: 2.0, headY: 1.6, hover: 0.35,
      melee: { range: 1.8, dmg: 10, windup: 0.3, cd: 1.1 },
      ranged: { lob: true, min: 0, max: 50, cd: 3.4, windup: 0.9, speed: 20, dmg: 24, radius: 2.6 },
      muzzle: [0.31, 1.9, 0.75], // the swivel gun's mouth, raised to fire, hover included
      post: true,
    },
    // the siren: rises in the shallows and stays there; while she sees you she sings for a few
    // seconds, and the song (charm, blurred screen) pulls you toward her; cover or her death breaks it
    siren: {
      hp: 170, speed: 0, radius: 0.5, height: 1.7, headY: 1.35,
      melee: { range: 2.3, dmg: 18, windup: 0.4, cd: 1.2 },
      song: { range: 34, dur: 5, rest: [3, 5], rise: 2.5, pull: 2.8 }, // rise: seconds to full charm, pull: m/s at full charm
      stay: true,
      fromWater: { minX: -40, minZ: 19.5, maxX: 12, maxZ: 28 },
    },
    // a swarm of bats: one flying body that heads straight for you and nibbles; a blast scatters it
    bats: {
      hp: 45, speed: 7.5, radius: 0.7, height: 1.0, headY: 99,
      melee: { range: 1.4, dmg: 4, windup: 0, cd: 0.35 },
      fly: { height: 1.6, reach: 1.5 }, // cruising height over the ground, distance it bites from
      blastMul: 5, load: 0.5,
    },
    // the pharaoh stands in for the Kraken until phase 6
    boss: { ...SABLES.enemies.boss, summon: 'skeleton' },
  },
  // where gunners stand: the main deck and the sterncastle of the galleon (x, y, z)
  posts: [[24, 4, 21.5], [25.5, 4, 17.5], [18, 4, 22.3], [34.5, 6.6, 18], [34.5, 6.6, 22]],
  waves: [
    { skeleton: 9 },
    { skeleton: 9, gunner: 3, bats: 2 },
    { skeleton: 9, gunner: 3, crab: 2, siren: 1, bats: 2 },
    { skeleton: 12, gunner: 4, crab: 3, siren: 2, bats: 3 },
    { skeleton: 6, gunner: 3, crab: 2, siren: 1, bats: 2, boss: 1 },
  ],
  survival: [
    { type: 'skeleton', cost: 2.5, from: 1, count: 3 }, // a whole group
    { type: 'gunner', cost: 2, from: 2 },
    { type: 'crab', cost: 4, from: 3 },
    { type: 'bats', cost: 1.5, from: 2 },
    { type: 'siren', cost: 4, from: 3 },
  ],
  arenaGuards: ['skeleton', 'skeleton', 'gunner'],
  targets: [['skeleton', 3], ['gunner', 2], ['crab', 1], ['siren', 1], ['bats', 1]],
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
