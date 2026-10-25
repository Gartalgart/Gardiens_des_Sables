// Computes a universe's level.json (collisions, spawns, lights, water, kegs) from its level.glb,
// with the same rules as blender/export_level_json.py. Needed because the Blender MCP runs in safe
// mode, which cannot write files from Python: the map is exported as a glb, and this does the rest.
// Run: node scripts/level-json-from-glb.mjs public/models/pirates/level.glb [out.json]
//
// - every mesh is a collision box (its world bounding box), except Ground, L_Deco* and Z_Water*;
// - C_* meshes are collision only (the client does not draw them);
// - Z_Water* meshes are shallow water rectangles; D_Airlock_n meshes are airlock doors (solid
//   while closed, see Level#setDoor); SPAWN_n, BRAZIER_n, KEG_n, LEVER_n, VENT_n and PLAYER_START are empties.
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/level-json-from-glb.mjs <level.glb>');
const buf = readFileSync(src);
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const root = gltf.scene;
root.updateMatrixWorld(true);

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const boxes = [], water = [], spawns = [], braziers = [], kegs = [], doors = [], levers = [], vents = [];
let start = null;
// three.js strips the dots of Blender's ".001" suffixes; names here are plain
root.traverse((o) => {
  const name = o.name;
  if (o.isMesh) {
    if (name === 'Ground' || name.startsWith('L_Deco')) return;
    const b = new THREE.Box3().setFromObject(o, true);
    const door = /^D_Airlock_(\d+)$/.exec(name);
    if (name.startsWith('Z_Water')) water.push([b.min.x, b.min.z, b.max.x, b.max.z].map(r4));
    else if (door) doors.push([Number(door[1]), [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(r4)]);
    else boxes.push([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(r4));
    return;
  }
  if (o.children.length && !/^(SPAWN|BRAZIER|KEG|LEVER|VENT)_\d+$|^PLAYER_START$/.test(name)) return;
  const p = o.getWorldPosition(new THREE.Vector3()).toArray().map(r4);
  const m = /^(SPAWN|BRAZIER|KEG|LEVER|VENT)_(\d+)$/.exec(name);
  if (m) ({ SPAWN: spawns, BRAZIER: braziers, KEG: kegs, LEVER: levers, VENT: vents })[m[1]].push([Number(m[2]), p]);
  else if (name === 'PLAYER_START') start = p;
});

const byIndex = (list) => list.sort((a, b) => a[0] - b[0]).map(([, p]) => p);
const data = { boxes, spawns: byIndex(spawns), braziers: byIndex(braziers), playerStart: start };
if (water.length) data.water = water;
if (kegs.length) data.kegs = byIndex(kegs);
// airlock n: its door's box and the lever that works it
const leverAt = byIndex(levers);
if (vents.length) data.vents = byIndex(vents);
if (doors.length) data.airlocks = byIndex(doors).map((door, i) => ({ door, lever: leverAt[i] }));
const out = process.argv[3] ?? src.replace(/\.glb$/, '.json');
writeFileSync(out, JSON.stringify(data));
console.log(`${out}: ${boxes.length} boxes, ${data.spawns.length} spawns, ${data.braziers.length} lights, ${water.length} water zones, ${kegs.length} kegs, ${doors.length} airlocks, start ${start}`);
