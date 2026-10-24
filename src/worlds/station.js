import { SABLES } from './sables.js';

// "Station spatiale infestée" (U2): an orbital station gone dark, over a ringed planet.
// The map is its own (blender/station/station.py): a ring of corridors round the engine room, the
// greenhouse, the hangar, the observation deck, and two airlocks on the void. The weapons
// (blender/station/weapons.py) are its own; enemies and waves are still the desert's.
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
