import { SABLES } from './sables.js';

// "L'Île des pirates maudits" (U1): a ruined pirate port on a misty night.
// The map is its own (blender/pirates/port.py); until its weapons and enemies are made (phases 3
// to 6 of the U1 plan), it borrows the desert's, so the universe is already playable.
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
  },
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
