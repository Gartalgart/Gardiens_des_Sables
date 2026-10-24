import { SABLES } from './sables.js';

// "Station spatiale infestée" (U2): an orbital station gone dark, over a ringed planet.
// The map is its own (blender/station/station.py): a ring of corridors round the engine room, the
// greenhouse, the hangar, the observation deck, and two airlocks on the void. The weapons
// (blender/station/weapons.py) and the enemies (blender/station/enemies.py) are its own; the boss
// is still the desert's pharaoh until the hive queen is made.
export const STATION = {
  ...SABLES,
  id: 'station',
  name: 'Station spatiale infestée',
  title: ['Station spatiale', 'infestée'],
  lede: "La station Hélios ne répond plus. Dans ses couloirs plongés dans le rouge des secours, quelque chose s'est réveillé.",

  files: {
    level: 'models/station/level.glb',
    // computed from level.glb by scripts/level-json-from-glb.mjs
    levelData: 'models/station/level.json',
    // floors and dressing without collision: drawn with the map, not in level.json
    decor: 'models/station/decor.glb',
    models: {
      baton: 'models/station/baton.glb',
      laser: 'models/station/laser.glb',
      plasma: 'models/station/plasma.glb',
      flamer: 'models/station/flamer.glb',
      railgun: 'models/station/railgun.glb',
      grenade: 'models/station/mine.glb',
      parasite: 'models/station/parasite.glb',
      host: 'models/station/host.glb',
      brute: 'models/station/brute.glb',
    },
  },
  props: null,

  // ---------- weapons ----------
  // heat: no magazine, every shot heats the gun (per), it cools by `cool` a second, and too much
  // heat locks it for `lock` seconds; burst: shots per pull (burstGap: the pause after a burst);
  // charge: seconds before the shot leaves; flame: a cone (range in m, angle in radians) that sets
  // enemies on fire for `burn` seconds; shock: seconds an enemy stays stunned after a baton blow
  weapons: [
    {
      id: 'baton', name: 'MATRAQUE ÉLECTRIQUE', short: 'Matraque', melee: true, dmg: 70, range: 2.8, swing: 0.3, hitAt: 0.09, cooldown: 0.38,
      spread: 0, adsSpread: 0, adsFov: 75, shock: 0.9,
    },
    {
      id: 'laser', name: 'PISTOLET LASER', short: 'Laser', dmg: 27, rpm: 400, auto: false, mag: 1, reserve: Infinity, pellets: 1,
      spread: 0.01, adsSpread: 0.001, reload: 0, recoil: 0.016, adsFov: 58, heat: { per: 0.065, cool: 0.75, lock: 1.4 }, beam: 0xff3a24,
    },
    {
      id: 'plasma', name: 'FUSIL À PLASMA', short: 'Plasma', dmg: 32, rpm: 720, auto: true, mag: 1, reserve: Infinity, pellets: 1,
      spread: 0.024, adsSpread: 0.005, reload: 0, recoil: 0.026, adsFov: 50, burst: 3, burstGap: 0.3,
      heat: { per: 0.055, cool: 0.32, lock: 3 }, beam: 0x5cffb4,
    },
    {
      id: 'flamer', name: 'LANCE-FLAMMES', short: 'Lance-flammes', dmg: 6, rpm: 600, auto: true, mag: 120, reserve: 360, pellets: 1,
      spread: 0, adsSpread: 0, reload: 2.3, recoil: 0.003, adsFov: 70, flame: { range: 7.5, angle: 0.3, burn: 3, burnDps: 16 },
    },
    {
      // for the last wave: charges for a moment, then a slug that goes through every enemy on its line
      id: 'railgun', name: 'FUSIL ÉLECTROMAGNÉTIQUE', short: 'Railgun', dmg: 280, rpm: 45, auto: false, mag: 4, reserve: 16, pellets: 1,
      spread: 0.03, adsSpread: 0, reload: 2.6, recoil: 0.16, adsFov: 30, charge: 0.7, pierceAll: true, beam: 0x6cc4ff,
    },
  ],
  startUnlocked: ['baton', 'laser'],
  unlocks: { 2: 'plasma', 3: 'flamer', 5: 'railgun' },
  grenade: 'mine', // G: sticky mines (MINE in src/sim/sim.js)

  // ---------- enemies (models: blender/station/enemies.py) ----------
  enemies: {
    ...SABLES.enemies,
    // the parasite: small and fast, comes in groups; it leaps at the face and clings there (sight
    // blurred, it feeds) until a blow of the baton knocks it off — bullets cannot reach it there
    parasite: {
      hp: 28, speed: 8.2, radius: 0.32, height: 0.45, headY: 0.3, early: 0.8,
      melee: { range: 1.1, dmg: 5, windup: 0.12, cd: 0.6 },
      leap: { min: 2.5, max: 7, dur: 0.45, dmg: 6, cd: [2.5, 4] },
      latch: { dps: 9, max: 10 }, // damage per second while on a face, seconds before it lets go
      swarm: 3, load: 0.5,
    },
    // the host: a crew member the infestation took over; slow and tough, it comes in numbers, and
    // what grows inside it sometimes bursts out when it dies
    host: {
      hp: 210, speed: 2.7, radius: 0.42, height: 1.85, headY: 1.45,
      melee: { range: 1.8, dmg: 18, windup: 0.4, cd: 1.3 },
      swarm: 2,
      burst: { type: 'parasite', chance: 0.3 },
    },
    // the armoured brute: a carapace in front stops most of a blow; it charges in a straight line
    brute: {
      hp: 620, speed: 3.0, radius: 0.95, height: 2.6, headY: 2.0,
      melee: { range: 2.8, dmg: 32, windup: 0.5, cd: 1.6 },
      charge: { min: 5, max: 22, wind: 0.75, speed: 13, dur: 1.3, dmg: 30, cd: [5, 7] },
      armor: { mul: 0.25, arc: 0.5 }, // damage × mul within ±60° of its face
      big: true,
    },
    boss: { ...SABLES.enemies.boss, summon: 'parasite' },
  },
  waves: [
    { host: 6, parasite: 6 },
    { host: 8, parasite: 9, brute: 1 },
    { host: 10, parasite: 9, brute: 2 },
    { host: 12, parasite: 12, brute: 3 },
    { host: 6, parasite: 9, brute: 2, boss: 1 },
  ],
  survival: [
    { type: 'host', cost: 2, from: 1, count: 2 }, // a pair
    { type: 'parasite', cost: 1.5, from: 1, count: 3 }, // a whole group
    { type: 'brute', cost: 4, from: 2 },
  ],
  arenaGuards: ['host', 'host', 'brute'],
  targets: [['host', 2], ['parasite', 3], ['brute', 1]],
  // the creatures' cries: the desert's recordings, pitched (src/audio.js setVoices)
  voices: {
    growls: { parasite: 'enemies/scarab_skitter', host: 'enemies/mummy_groan', brute: 'enemies/tank_roar' },
    rates: { parasite: 1.5, host: 0.8, brute: 0.75 },
  },
  looks: {
    parasite: { color: [0.85, 0.72, 0.5], dot: '#e0c08a' },
    host: { color: [0.55, 0.9, 0.35], dot: '#9de070' },
    brute: { color: [1, 0.35, 0.15], dot: '#ff5a2a' },
  },

  texts: {
    ...SABLES.texts,
    // the map's oxygen bottles blow up when shot (the port's powder kegs)
    start: 'Matraque [1] et pistolet laser [2] — mines [G] — tenez la station',
    meleeName: 'matraque',
    bladeObjective: 'à la matraque',
    grenadeName: 'Mines collantes',
    grenadeHelp: "Lancer une mine collante (elle saute au passage d'un ennemi)",
    grenadeKill: 'MINE',
    kegKill: 'BONBONNE',
    airlockKill: 'DANS LE VIDE',
    latched: 'UN PARASITE VOUS AGRIPPE — MATRAQUE [1] !',
    killsLabel: 'Créatures abattues',
    airlockOpen: 'Sas ouvert — dépressurisation !',
    airlockClosed: 'Sas refermé',
    airlockUse: '[E] Ouvrir le sas',
    airlockShut: '[E] Refermer le sas',
    tips: "Les tirs à la tête infligent double dégâts. La matraque électrique paralyse ce qu'elle frappe, et sa parade renvoie les tirs. Les armes à énergie n'ont pas de chargeur mais chauffent : trop insister les bloque quelques secondes. Le lance-flammes enflamme tout ce qui est devant vous. Une bonbonne d'oxygène explose quand on tire dessus. La lampe torche [F] perce le noir. Un levier [E] ouvre le sas voisin : l'air qui s'échappe aspire tout ce qui est en vue vers le vide pendant quelques secondes — ne restez pas devant. La santé se régénère après quelques secondes sans blessure.",
    victory: 'Les lumières de la station se rallument une à une. Hélios répond de nouveau.',
  },

  ambiance: {
    // inside: a thin haze; outside the windows, black space, the stars all round and the planet
    fog: { color: 0x020304, density: 0.03 },
    sky: { zenith: [0.0, 0.0, 0.004], horizon: [0.004, 0.006, 0.014], haze: [0.03, 0.01, 0.04], glow: [0.5, 0.45, 0.35] },
    stars: 0xe8eeff,
    // the sun, high in the south-west: it comes in through the greenhouse roof and lights the planet's face
    moon: { dir: [-0.35, 0.65, 0.5], disc: '#fff6e0', light: 0xdfe8ff, intensity: 2.2 },
    hemi: { sky: 0x1c2228, ground: 0x050506, intensity: 0.22 },
    // the ceiling neons: cold white tubes, many of them dying or dead; intensity of a working one
    fire: { light: 0xbcd4ff, halo: 0xb8d0ff, glow: '#d8e6ff', neon: true, intensity: 8 },
    space: {
      planet: { dir: [0.9, -0.1, 0.25], size: 170, color: '#c98a52', band: '#7a4a2c', ring: '#d6c3a0', atmosphere: '#7fb4ff' },
    },
    // the emergency lighting: a red glow over everything that pulses slowly
    alarm: { color: 0xff1a10, intensity: 0.28, period: 3.2 },
    // rotating amber beacons and their sweeping beams (FX_Beacon_n), sparks, drips
    beacon: { color: 0xff5a10 },
    flashlight: true, // the dark: a torch on the gun, F to turn it off
    // shafts of sunlight through the greenhouse's glass roof (y: the roof, at: where they come in)
    sunShafts: { y: 6.1, at: [[-9, -31], [-3, -27], [3, -31], [9, -27], [-7, -23.5], [5, -23.5]], radius: 1.0, strength: 0.07 },
    film: true, // grain, vignette and scanlines over the picture
    // the hum of the machines instead of the wind
    hum: true,
    indoor: true, // ceilings: the minimap leaves out what is overhead
    keg: 'oxygen',
  },
  menuCamera: { orbit: [0, 0], radius: 4.4, height: 5.2, look: [0, 2.2, 0] },
};
