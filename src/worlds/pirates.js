import { SABLES } from './sables.js';

// "L'Île des pirates maudits" (U1): a ruined pirate port on a misty night.
// For now only the map stub and the night are its own: until its weapons and enemies are made
// (phases 3 to 6 of the U1 plan), it borrows the desert's, so the universe is already playable.
export const PIRATES = {
  ...SABLES,
  id: 'pirates',
  name: "L'Île des pirates maudits",
  title: ["L'Île des", 'pirates maudits'],
  lede: 'Un port pirate en ruine, noyé dans la brume. Sous la lune maudite, les morts reprennent leur poste.',

  files: {
    // placeholder until the port is modelled in Blender (phase 2): the client builds the
    // map from the collision boxes themselves
    level: null,
    levelData: 'models/pirates/level.json',
    props: null,
  },

  texts: {
    ...SABLES.texts,
    victory: "La brume se lève sur le port. L'équipage maudit retourne au fond de la baie.",
  },

  ambiance: {
    fog: { color: 0x0d1a1c, density: 0.024 },
    sky: { zenith: [0.006, 0.016, 0.02], horizon: [0.06, 0.1, 0.1], haze: [0.04, 0.09, 0.07], glow: [0.2, 0.4, 0.3] },
    stars: 0xd2f0e4,
    moon: { dir: [0.5, 0.45, 0.75], disc: '#d9f5c8', light: 0x9fd8b8, intensity: 1.3 },
    hemi: { sky: 0x3d6a66, ground: 0x10181a, intensity: 1.0 },
    fire: { light: 0xffa54a, halo: 0xffb050, glow: '#ffc06a' }, // ship lanterns
  },
  menuCamera: { orbit: [0, -4], radius: 30, height: 11, look: [0, 2, 6] },
};
