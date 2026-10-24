// "Gardiens des Sables": the desert temple city at night. Everything that belongs to this universe
// rather than to the engine: map files, weapons, enemies, waves, texts and the look of the night.
// Pure data, read by the simulation (also in Node) and by the client.
export const SABLES = {
  id: 'sables',
  name: 'Gardiens des Sables',
  title: ['Gardiens', 'des Sables'], // the title screen's two lines
  lede: "La cité-temple s'est réveillée. Ses gardiens de pierre se lèvent à la tombée de la nuit.",

  files: {
    level: 'models/level.glb',
    levelData: 'models/level.json',
    props: 'models/props.glb',
  },

  // ---------- weapons (rules; poses and models live in src/view/weaponView.js) ----------
  weapons: [
    {
      id: 'sword', name: 'KHÉPESH', melee: true, dmg: 85, range: 3.0, swing: 0.34, hitAt: 0.1, cooldown: 0.42,
      spread: 0, adsSpread: 0, adsFov: 75,
    },
    {
      id: 'pistol', name: 'PISTOLET', dmg: 34, rpm: 330, auto: false, mag: 12, reserve: Infinity, pellets: 1,
      spread: 0.014, adsSpread: 0.002, reload: 1.25, recoil: 0.028, adsFov: 58,
    },
    {
      id: 'rifle', name: "FUSIL D'ASSAUT", dmg: 23, rpm: 640, auto: true, mag: 30, reserve: 210, pellets: 1,
      spread: 0.034, adsSpread: 0.004, reload: 2.1, recoil: 0.013, adsFov: 50,
    },
    {
      id: 'shotgun', name: 'FUSIL À POMPE', dmg: 14, rpm: 78, auto: false, mag: 6, reserve: 42, pellets: 9,
      spread: 0.085, adsSpread: 0.055, reload: 2.4, recoil: 0.07, adsFov: 62,
      // loaded one shell at a time (open, a shell each, then the pump); firing stops the reload
      shells: { open: 0.35, each: 0.34, close: 0.4 },
    },
    {
      // unlocked for the last wave: a bolt-action with a scope; wild from the hip, dead on when aiming,
      // and its bullet goes on through a first target
      id: 'sniper', name: 'FUSIL DE PRÉCISION', dmg: 150, rpm: 46, auto: false, mag: 5, reserve: 25, pellets: 1,
      spread: 0.07, adsSpread: 0, reload: 2.7, recoil: 0.09, adsFov: 16, pierce: true, scope: true,
    },
  ],
  startUnlocked: ['sword', 'pistol'],
  // weapon unlocked when a wave is cleared, ready for the next one
  unlocks: { 2: 'rifle', 3: 'shotgun', 5: 'sniper' },

  // ---------- enemies (rules; colours and models live in src/view/enemyView.js) ----------
  // What an enemy does comes from the fields it has (melee, ranged, leap, charge, prime, climber,
  // slam, boss), so a new universe dresses the same behaviours in its own models and numbers.
  enemies: {
    runner: {
      hp: 70, speed: 7.2, radius: 0.4, height: 1.75, headY: 1.3,
      early: 0.75, // speed factor in waves 1-2, so a new player has time to learn
      melee: { range: 1.7, dmg: 11, windup: 0.18, cd: 0.75 },
      leap: { min: 3.5, max: 8, dur: 0.5, dmg: 15, cd: [2.2, 3.8] },
    },
    shooter: {
      hp: 95, speed: 4.2, radius: 0.45, height: 1.95, headY: 1.55,
      melee: { range: 1.7, dmg: 9, windup: 0.25, cd: 1.0 },
      ranged: { min: 8, max: 28, cd: 1.7, windup: 0.35, speed: 22, dmg: 13, count: 1, spread: 0 },
      muzzle: [0.36, 2.2, 0.3], // staff orb, in model space (model faces +Z)
    },
    tank: {
      hp: 480, speed: 2.9, radius: 0.95, height: 2.75, headY: 2.25,
      melee: { range: 2.8, dmg: 30, windup: 0.45, cd: 1.5 },
      charge: { min: 6, max: 22, wind: 0.65, speed: 11, dur: 1.4, dmg: 26, cd: [5, 7] },
      big: true,
    },
    mummy: {
      hp: 110, speed: 4.6, radius: 0.42, height: 1.8, headY: 1.38,
      melee: { range: 1.6, dmg: 8, windup: 0.3, cd: 1.2 },
      // kamikaze: primes near a player, then blows up; it also blows up however it dies
      prime: { range: 3.2, dur: 1.0 },
      explode: { radius: 4.5, dmg: 42, enemyDmg: 160 },
    },
    scarab: {
      hp: 18, speed: 7.8, radius: 0.3, height: 0.5, headY: 0.35,
      melee: { range: 1.1, dmg: 4, windup: 0.12, cd: 0.55 },
      climber: true, // goes over walls and roofs
      load: 0.25, // a swarm of four counts as one enemy for the spawn limit
      swarm: 5, // they come out of the sand together, this many at once
    },
    boss: {
      hp: 3400, speed: 2.7, radius: 1.3, height: 4.5, headY: 3.4,
      melee: { range: 3.8, dmg: 38, windup: 0.55, cd: 1.8 },
      ranged: { min: 0, max: 50, cd: 1.9, windup: 0.55, speed: 18, dmg: 15, count: 5, spread: 0.16 },
      slam: { range: 7, dmg: 30, windup: 0.8, cd: 5 },
      muzzle: [1.0, 4.6, 0.15], // scepter orb, including the boss's hover
      big: true, boss: true,
      summon: 'runner', // four of them around him at 66 % and 33 % of his health
    },
  },

  // "Vagues" mode: five waves, the boss in the last one
  waves: [
    { runner: 8 },
    { runner: 9, shooter: 4, scarab: 5 },
    { runner: 8, shooter: 6, tank: 2, mummy: 2, scarab: 5 },
    { runner: 9, shooter: 7, tank: 4, mummy: 3, scarab: 10 },
    { runner: 6, shooter: 6, tank: 2, mummy: 2, scarab: 5, boss: 1 },
  ],
  // "Survie" mode: what a slot of the wave budget costs, and from which wave the type appears
  survival: [
    { type: 'runner', cost: 1, from: 1 },
    { type: 'shooter', cost: 1.5, from: 2 },
    { type: 'scarab', cost: 2.5, from: 2, count: 5 }, // a whole swarm
    { type: 'mummy', cost: 2.5, from: 3 },
    { type: 'tank', cost: 4, from: 3 },
  ],
  // the arena's few wandering guardians
  arenaGuards: ['runner', 'runner', 'shooter'],

  texts: {
    start: 'Khépesh [1] et pistolet [2] — survivez aux gardiens',
    victory: 'La cité-temple retrouve son silence. Les gardiens sont retournés au sable.',
    bossName: 'LE PHARAON ÉVEILLÉ', // over the boss health bar
    bossKill: 'PHARAON ABATTU',
    bossWave: 'le pharaon', // survival: "Vague 10 — le pharaon"
    bossWakes: "Le pharaon s'éveille…",
    bossSummon: 'Le pharaon appelle ses chacals !',
    bossStorm: 'Le pharaon déchaîne la tempête !',
    modes: {
      waves: 'Cinq vagues de gardiens à repousser ensemble.',
      survival: 'Des vagues sans fin, le pharaon toutes les cinq vagues.',
      arena: 'Chacun pour soi, avec quelques gardiens qui rôdent. La difficulté règle les gardiens.',
    },
  },

  // ---------- the look of the night (src/view/worldView.js) ----------
  ambiance: {
    fog: { color: 0x0c1124, density: 0.016 },
    sky: { zenith: [0.008, 0.012, 0.035], horizon: [0.07, 0.085, 0.16], haze: [0.16, 0.06, 0.02], glow: [0.25, 0.3, 0.45] },
    stars: 0xcfd8ff,
    moon: { dir: [-0.45, 0.55, -0.7], disc: '#f4f1e6', light: 0xa8bcff, intensity: 1.5 },
    hemi: { sky: 0x4a5c9a, ground: 0x161420, intensity: 1.1 },
    fire: { light: 0xff8a3a, halo: 0xff9a40, glow: '#ffb35a' },
  },
  // slow fly-around behind the title screen
  menuCamera: { orbit: [0, -4], radius: 34, height: 13, look: [0, 3, 12] },
};
