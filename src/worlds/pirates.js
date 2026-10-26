import { SABLES } from './sables.js';

// "L'Île des pirates maudits" (U1): a ruined pirate port on a misty night.
// The map (blender/pirates/port.py), the weapons (blender/pirates/weapons.py) and the enemies
// (blender/pirates/enemies.py) are its own, the Kraken (blender/pirates/kraken.py) too.
export const PIRATES = {
  ...SABLES,
  id: 'pirates',
  name: { en: 'Isle of the Cursed Pirates', fr: "L'Île des pirates maudits" },
  title: { en: ['Isle of the', 'Cursed Pirates'], fr: ["L'Île des", 'pirates maudits'] },
  lede: {
    en: 'A ruined pirate port, drowned in mist. Under the cursed moon, the dead return to their posts.',
    fr: 'Un port pirate en ruine, noyé dans la brume. Sous la lune maudite, les morts reprennent leur poste.',
  },
  // old print and verdigris, like a sea chart left out in the mist; round black bombs
  hud: {
    font: '"IM Fell English SC", serif',
    accent: '#7fd8b8', accentDim: '#3f8a75', accentHi: '#b8ffe2',
    ink: '#ece6cf', inkDim: '#a3b4a6',
    line: 'rgba(127, 216, 184, 0.32)', panel: 'rgba(6, 16, 16, 0.8)',
    button: ['#a6ecd2', '#4fa88c', '#06140f'],
    health: ['#a8302a', '#d8b46a'],
    grenade: ['#1d1d1f', '50%'],
    map: { ground: 'rgba(30, 62, 58, 0.4)', wall: [0.85, 1, 0.92] },
  },

  files: {
    level: 'models/pirates/level.glb',
    // computed from level.glb by scripts/level-json-from-glb.mjs
    levelData: 'models/pirates/level.json',
    props: 'models/pirates/props.glb',
    // dressing without collision (blender/pirates/decor.py): drawn with the map, not in level.json
    decor: 'models/pirates/decor.glb',
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
      boss: 'models/pirates/kraken.glb',
      tentacle: 'models/pirates/tentacle.glb',
      crab: 'models/pirates/crab.glb',
      gunner: 'models/pirates/gunner.glb',
    },
  },

  // ---------- weapons: all muzzle-loaders but the sabre, loaded by the mouth with a ramrod ----------
  weapons: [
    {
      id: 'cutlass', name: { en: 'CUTLASS', fr: 'SABRE' }, short: { en: 'Cutlass', fr: 'Sabre' }, melee: true, dmg: 80, range: 3.0, swing: 0.32, hitAt: 0.1, cooldown: 0.4,
      spread: 0, adsSpread: 0, adsFov: 75,
    },
    {
      // one heavy ball, then a long reload
      id: 'flintlock', name: { en: 'FLINTLOCK PISTOL', fr: 'PISTOLET À SILEX' }, short: { en: 'Flintlock', fr: 'Silex' }, dmg: 130, rpm: 100, auto: false, mag: 1, reserve: Infinity, pellets: 1,
      spread: 0.012, adsSpread: 0.001, reload: 1.7, recoil: 0.06, adsFov: 56,
    },
    {
      // two bell-mouthed barrels: a wide cone of shot each, then both are reloaded
      id: 'blunderbuss', name: { en: 'BLUNDERBUSS', fr: 'TROMBLON' }, short: { en: 'Blunderbuss', fr: 'Tromblon' }, dmg: 13, rpm: 150, auto: false, mag: 2, reserve: 36, pellets: 12,
      spread: 0.12, adsSpread: 0.09, reload: 2.6, recoil: 0.08, adsFov: 64,
    },
    {
      // a ball that flies in an arc and blows up where it lands; the shot shoves the gunner back
      id: 'cannon', name: { en: 'HAND CANNON', fr: 'CANON PORTATIF' }, short: { en: 'Cannon', fr: 'Canon' }, dmg: 0, rpm: 50, auto: false, mag: 1, reserve: 10, pellets: 1,
      spread: 0.008, adsSpread: 0.002, reload: 2.3, recoil: 0.12, adsFov: 60, knockback: 7,
      ball: { speed: 42, gravity: 9, radius: 4.5, dmg: 230, playerDmg: 40, hit: 120 },
    },
    {
      // for the last wave: a long musket with a spyglass; one ball that goes on through a first
      // target, wild from the hip, dead on through the glass, then a long reload
      id: 'musket', name: { en: 'SPYGLASS MUSKET', fr: 'MOUSQUET À LONGUE-VUE' }, short: { en: 'Musket', fr: 'Mousquet' }, dmg: 160, rpm: 40, auto: false, mag: 1, reserve: 20, pellets: 1,
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
      swarm: 3, loot: true,
    },
    // the giant crab: comes out of the sea; its shell stops most of a blow from the front, but it
    // charges sideways, its flank turned toward its target
    crab: {
      hp: 520, speed: 3.0, radius: 1.0, height: 1.3, headY: 1.0,
      melee: { range: 2.9, dmg: 28, windup: 0.45, cd: 1.5 },
      charge: { min: 5, max: 20, wind: 0.65, speed: 12, dur: 1.3, dmg: 26, cd: [5, 7], side: true },
      armor: { mul: 0.3, arc: 0.5 }, // damage × mul within ±60° of its face
      big: true, loot: true,
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
      hp: 60, speed: 7.5, radius: 0.7, height: 1.0, headY: 99,
      melee: { range: 1.4, dmg: 4, windup: 0, cd: 0.35 },
      fly: { height: 1.6, reach: 1.5 }, // cruising height over the ground, distance it bites from
      flock: 6, // bats in the swarm, sharing its health: a shot or a blow downs one at most
      blastMul: 5, load: 0.5,
    },
    // the Kraken: its body waits out in the deep water between the piers, its tentacles rise along
    // the shore; cutting them hurts it (see Enemies#kraken). At half health its head comes up, spits
    // ink and calls the crew; at a third it smashes a pier and its tentacles start grabbing.
    boss: {
      hp: 3600, speed: 0, radius: 2.4, height: 6.5, headY: 4.0, big: true, boss: true, stay: true,
      melee: { range: 0.01, dmg: 0, windup: 1, cd: 99 },
      // ink lobbed over the barrier of the deep water: seconds of blindness for the player it lands on
      ranged: { lob: true, min: 0, max: 70, cd: 2.6, windup: 0.6, speed: 22, dmg: 12, radius: 2.4, ink: 4 },
      muzzle: [0, 2.4, 2.0], // the beak
      summon: 'skeleton',
      kraken: {
        anchor: [-8.5, 0, 35],
        tentacle: 'tentacle', tentacles: 4,
        cut: 0.08, // share of its health a cut tentacle costs it
        dive: [4, 6], // seconds under water before a cut tentacle comes up elsewhere
        summonEvery: 22,
        piers: [[-24, -21], [4, 7]], // x ranges of the piers it can smash (z 18 to 38)
        // where tentacles rise: off the quay, along the piers, off the west beach (x, y, z)
        spots: [
          [-37, 0, 19], [-31, 0, 19.5], [-27.5, 0, 19.5], [-16, 0, 19.5], [-10, 0, 19.5], [-4, 0, 19.5], [0.5, 0, 19.5],
          [10, 0, 19.5], [13, 0, 19.5],
          [-25.6, 0, 24], [-19.4, 0, 24], [2.4, 0, 24], [8.6, 0, 24],
          [-25.6, 0, 29], [-19.4, 0, 29], [2.4, 0, 29], [8.6, 0, 29],
          [-25.6, 0, 34], [-19.4, 0, 34], [2.4, 0, 34], [8.6, 0, 34],
        ],
      },
    },
    // one of the Kraken's tentacles (a part of the boss, not counted as an enemy left)
    tentacle: {
      hp: 150, speed: 0, radius: 0.7, height: 5.4, headY: 99, stay: true, part: true, tentacle: true, load: 0,
      melee: { range: 0.01, dmg: 0, windup: 1, cd: 99 },
      // strikes where the player stands, after a red circle has warned them
      strike: { reach: 7.5, radius: 2.3, windup: 1.1, dmg: 28, cd: [2.5, 4] },
      // last phase: grabs a player within range; free: damage that makes it let go; hold: seconds before it throws them
      grab: { range: 3.2, windup: 0.6, dps: 9, free: 70, hold: 6, cd: 8 },
    },
  },
  // the port's own wave objectives (src/sim/progression.js WORLD_OBJECTIVES), and the chest in the
  // treasure cave that looters go for (looters: share of the skeletons and crabs that do)
  objectives: ['kegs', 'chest'],
  chest: { pos: [-36, 0, -39.2], looters: 0.35 },
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
    maxZ: 11, // the quay and the sea beyond it
    list: [
      { name: 'Prop_Rope', count: 8, clear: 1, shadow: true },
      { name: 'Prop_Bottle', count: 14, clear: 1, shadow: false, scale: 1.2 },
      { name: 'Prop_Planks', count: 10, clear: 1, shadow: true },
      { name: 'Prop_Skull', count: 10, clear: 1, shadow: false, scale: 1.3 },
      { name: 'Prop_Crab', count: 12, clear: 1, shadow: false },
      { name: 'Prop_Palm', count: 12, clear: 2, shadow: true, edge: true },
      { name: 'Prop_Bush', count: 16, clear: 1, shadow: true, edge: true },
      { name: 'Prop_Grass', count: 70, clear: 0, shadow: false, scale: 1.2 },
      { name: 'Prop_Shells', count: 24, clear: 0, shadow: false },
      { name: 'Prop_Driftwood', count: 8, clear: 1, shadow: true },
      { name: 'Prop_Cannonballs', count: 6, clear: 1, shadow: true },
      { name: 'Prop_BrokenBarrel', count: 6, clear: 1, shadow: true },
    ],
  },

  texts: {
    ...SABLES.texts,
    start: { en: "Cutlass [1] and flintlock [2] — bombs [G] — hold the port", fr: "Sabre [1] et pistolet à silex [2] — bombes [G] — tenez le port" },
    grenadeKill: { en: "BOMB", fr: "BOMBE" },
    meleeName: { en: "cutlass", fr: "sabre" },
    bladeObjective: { en: "with the cutlass", fr: "au sabre" },
    grenadeName: { en: "Fuse bombs", fr: "Bombes à mèche" },
    grenadeHelp: { en: "Throw a fuse bomb", fr: "Lancer une bombe à mèche" },
    killsLabel: { en: "Enemies slain", fr: "Ennemis abattus" },
    guards: { en: "Crew", fr: "Équipage" },
    tips: {
      en: 'Headshots deal double damage. The cutlass cuts through everything in front of you, and its parry sends enemy shots back. Firearms load through the muzzle: one shot, then the ramrod. A shot at a powder keg blows it up. Only enemies killed in melee drop health. Health regenerates after a few seconds without a wound.',
      fr: "Les tirs à la tête infligent double dégâts. Le sabre tranche tout ce qui est devant vous, et sa parade renvoie les tirs ennemis. Les armes à feu se rechargent par la bouche : un coup, puis la baguette. Un tir sur un baril de poudre le fait sauter. Seuls les ennemis tués au corps à corps lâchent de la santé. La santé se régénère après quelques secondes sans blessure.",
    },
    bossName: { en: "THE KRAKEN", fr: "LE KRAKEN" },
    bossKill: { en: "KRAKEN SLAIN", fr: "KRAKEN TERRASSÉ" },
    bossWave: { en: "the Kraken", fr: "le Kraken" },
    bossWakes: { en: "The Kraken rises from the deep…", fr: "Le Kraken remonte des profondeurs…" },
    bossSummon: { en: "The Kraken calls the cursed crew!", fr: "Le Kraken appelle l'équipage maudit !" },
    bossRise: { en: "The Kraken lifts its head out of the water!", fr: "Le Kraken sort la tête de l'eau !" },
    bossPier: { en: "The Kraken smashes the pier!", fr: "Le Kraken brise le ponton !" },
    modes: {
      ...SABLES.texts.modes,
      waves: { en: 'Five waves of the cursed crew to drive back, the Kraken in the last.', fr: "Cinq vagues de l'équipage maudit à repousser, le Kraken à la dernière." },
      survival: { en: 'Endless waves, the Kraken every fifth wave.', fr: 'Des vagues sans fin, le Kraken toutes les cinq vagues.' },
    },
    victory: {
      en: 'The mist lifts over the port. The cursed crew sinks back to the bottom of the bay.',
      fr: "La brume se lève sur le port. L'équipage maudit retourne au fond de la baie.",
    },
  },

  // the Kraken's roar and death: the colossus's recordings, slowed right down (src/audio.js setVoices)
  voices: {
    growls: {
      skeleton: 'enemies/skeleton_rattle', crab: 'enemies/crab_clack', gunner: 'enemies/gunner_moan', bats: 'enemies/bats_screech',
      siren: 'enemies/gunner_moan', boss: 'enemies/kraken_roar', tentacle: 'enemies/kraken_roar',
    },
    rates: { crab: 1, gunner: 1, bats: 1, siren: 1.6, boss: 1, tentacle: 1.4 },
    bossDeath: 'enemies/kraken_death',
    music: 'shanty',
    samples: {
      swing: 'weapons/cutlass_swing', throw: 'grenades/bomb_fuse', slam: 'enemies/tentacle_slam',
      kill: { skeleton: 'enemies/skeleton_death' },
      highSteps: ['footsteps/wood_step_1', 'footsteps/wood_step_2'], waterStep: 'footsteps/water_step',
    },
  },
  // colours of this universe's own types where the desert has the same key (the boss)
  looks: { boss: { color: [0.75, 0.25, 0.9], dot: '#c060ff' } },

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
