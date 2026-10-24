// Writes public/models/pirates/level.json: a stand-in map for the pirate universe until the port is
// modelled in Blender (phase 2 of the U1 plan). Same format as blender/export_level_json.py.
// Run: node scripts/pirates-stub-level.mjs
import { writeFileSync } from 'node:fs';

const boxes = [];
// a box from its floor corner, size and height: x, z = min corner
const box = (x, z, w, d, h, y = 0) => boxes.push([x, y, z, x + w, y + h, z + d]);

// sea wall around the cove, the open sea beyond it to the north
box(-46, -46, 92, 2, 5); // south cliff
box(-46, -44, 2, 70, 5); // west cliff
box(44, -44, 2, 70, 5); // east cliff
box(-44, 24, 88, 2, 1.6); // quay edge over the water

// raised quay of planks (0.5 m: walkable from the sand)
box(-12, 10, 24, 12, 0.5);
// warehouse with a door on its east side
box(-30, -10, 12, 0.4, 4); // north wall
box(-30, 3.6, 12, 0.4, 4); // south wall
box(-30, -10, 0.4, 14, 4); // west wall
box(-18.4, -10, 0.4, 6, 4); // east wall, north of the door
box(-18.4, -1, 0.4, 5, 4); // east wall, south of the door
box(-30, -10, 12, 14, 0.3, 4); // roof
// crates, one of them stacked
box(4.6, -5.6, 1.2, 1.2, 1.2);
box(5.8, -5.6, 1.2, 1.2, 1.2);
box(5.2, -5.6, 1.2, 1.2, 1.2, 1.2);
box(-6.7, 7.3, 1.4, 1.4, 1.4);
box(14.3, -12.7, 1.4, 1.4, 1.4);
box(-10.7, -20.7, 1.4, 1.4, 1.4);
box(19.3, 4.3, 1.4, 1.4, 1.4);
box(-2, -14, 1.4, 1.4, 1.4);
// barrels
box(7.6, 3.6, 0.8, 0.8, 1.1);
box(8.6, 4.2, 0.8, 0.8, 1.1);
box(-14.4, 12.6, 0.8, 0.8, 1.1, 0.5);
// low cover walls
box(8, -20, 6, 0.4, 1.2);
box(-4, -30, 0.4, 8, 1.2);
box(26, -6, 0.4, 8, 1.2);
// lookout tower
box(22, -28, 6, 6, 3);

const out = {
  boxes: boxes.map((b) => b.map((v) => Math.round(v * 1000) / 1000)),
  spawns: [[-38, 0, -38], [38, 0, -38], [38, 0, 18], [-38, 0, 18], [0, 0, -40], [40, 0, -10]],
  // ship lanterns (the fire lights)
  braziers: [[-8, 3, 12], [8, 3, 12], [-17.6, 3, -2.5], [10, 2.5, -8], [-12, 2.5, -24], [25, 4, -22], [30, 2.5, 16], [-32, 2.5, 18]],
  playerStart: [0, 0, 2],
};
writeFileSync(new URL('../public/models/pirates/level.json', import.meta.url), JSON.stringify(out));
console.log(`${boxes.length} boxes`);
