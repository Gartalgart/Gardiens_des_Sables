import { SABLES } from './sables.js';

// "Station spatiale infestée" (U2): an orbital station gone dark, over a ringed planet.
// The map is its own (blender/station/station.py): a ring of corridors round the engine room, the
// greenhouse, the hangar, the observation deck, and two airlocks on the void. Weapons, enemies and
// waves are still the desert's until the next phases.
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
    models: {},
  },
  props: null,

  texts: {
    ...SABLES.texts,
    // the map's oxygen bottles blow up when shot (the port's powder kegs)
    kegKill: 'BONBONNE',
    airlockKill: 'DANS LE VIDE',
    airlockOpen: 'Sas ouvert — dépressurisation !',
    airlockClosed: 'Sas refermé',
    airlockUse: '[E] Ouvrir le sas',
    airlockShut: '[E] Refermer le sas',
    tips: "Les tirs à la tête infligent double dégâts. Une bonbonne d'oxygène explose quand on tire dessus. La lampe torche [F] perce le noir. Un levier [E] ouvre le sas voisin : l'air qui s'échappe aspire tout ce qui est en vue vers le vide pendant quelques secondes — ne restez pas devant. La santé se régénère après quelques secondes sans blessure.",
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
