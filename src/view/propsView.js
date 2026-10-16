import * as THREE from 'three';

// Ground clutter scattered over the sand: bones, skulls, pottery shards, broken jars, fallen column
// drums and dead palms. Pure decoration (no collision): one InstancedMesh per part of each prop.
// Positions come from a seeded random walk over the navigation grid so every client gets the same
// layout, on open ground (floor 0, not under a roof) inside the city walls.
const PROPS = [
  { name: 'Prop_Bones', count: 16, clear: 1, shadow: false, scale: 1.4 },
  { name: 'Prop_Skull', count: 10, clear: 1, shadow: false, scale: 1.4 },
  { name: 'Prop_Shards', count: 16, clear: 1, shadow: false, scale: 1.5 },
  { name: 'Prop_BrokenJar', count: 12, clear: 1, shadow: true },
  { name: 'Prop_Drum', count: 8, clear: 2, shadow: true },
  { name: 'Prop_Palm', count: 10, clear: 2, shadow: true, edge: true },
];
const INSIDE = 43; // the city walls stand at ±45 m
const SPACING = 2.2;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PropsView {
  constructor(scene, propsRoot, level, seed = 7) {
    propsRoot.updateMatrixWorld(true);
    const nav = level.nav;
    const rand = rng(seed);
    const taken = [];
    const avoid = [level.playerStart, ...level.braziers];

    // a cell is free when it and its neighbours (within `clear` cells) are open flat ground
    const free = (x, z, clear) => {
      const i = nav.index(x, z);
      if (i < 0) return false;
      const ix = i % nav.n, iz = (i / nav.n) | 0;
      for (let dz = -clear; dz <= clear; dz++)
        for (let dx = -clear; dx <= clear; dx++) {
          const j = (iz + dz) * nav.n + ix + dx;
          if (!nav.open[j] || nav.floor[j] !== 0 || nav.covered[j]) return false;
        }
      return true;
    };

    for (const def of PROPS) {
      const root = propsRoot.getObjectByName(def.name);
      if (!root) continue;
      const spots = [];
      for (let tries = 0; spots.length < def.count && tries < 4000; tries++) {
        let x, z;
        if (def.edge) {
          // palms grow along the walls, where the city meets the dunes
          const side = Math.floor(rand() * 4), t = (rand() * 2 - 1) * INSIDE, d = INSIDE - rand() * 5;
          [x, z] = side === 0 ? [t, d] : side === 1 ? [t, -d] : side === 2 ? [d, t] : [-d, t];
        } else {
          x = (rand() * 2 - 1) * INSIDE;
          z = (rand() * 2 - 1) * INSIDE;
        }
        if (!free(x, z, def.clear)) continue;
        if (taken.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < SPACING * SPACING)) continue;
        if (avoid.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 9)) continue;
        const spot = { x, z, yaw: rand() * Math.PI * 2, s: (def.scale ?? 1) * (0.85 + rand() * 0.3) };
        taken.push(spot);
        spots.push(spot);
      }

      const placement = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      root.traverse((part) => {
        if (!part.isMesh) return;
        // the part's transform relative to its prop root, which sits at the origin in Blender
        const local = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(part.matrixWorld);
        part.material.flatShading = true;
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, spots.length);
        spots.forEach((s, k) => {
          q.setFromAxisAngle(up, s.yaw);
          placement.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(s.s, s.s, s.s));
          mesh.setMatrixAt(k, placement.clone().multiply(local));
        });
        mesh.castShadow = def.shadow;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        scene.add(mesh);
      });
    }
    this.spots = taken;
  }
}
