import * as THREE from 'three';
import { STEP, WORLD_LIMIT } from './constants.js';
import { NavGrid } from './nav.js';

// Collision side of the level: axis-aligned boxes exported from Blender (public/models/level.json),
// queries for bodies and rays, and the enemy navigation grid. No rendering, runs in Node too.
export class Level {
  constructor(data) {
    this.boxes = data.boxes.map(([a, b, c, d, e, f]) => new THREE.Box3(new THREE.Vector3(a, b, c), new THREE.Vector3(d, e, f)));
    this.spawns = data.spawns.map((p) => new THREE.Vector3(...p));
    this.braziers = data.braziers.map((p) => new THREE.Vector3(...p));
    this.playerStart = new THREE.Vector3(...data.playerStart);
    this.#buildBoxGrid();
    this.nav = new NavGrid(this);
  }

  #buildBoxGrid() {
    this.cell = 4;
    this.grid = new Map();
    this.stamps = new Uint32Array(this.boxes.length);
    this.boxes.forEach((b, i) => {
      for (let x = Math.floor(b.min.x / this.cell); x <= Math.floor(b.max.x / this.cell); x++)
        for (let z = Math.floor(b.min.z / this.cell); z <= Math.floor(b.max.z / this.cell); z++) {
          const k = x * 1000 + z;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(i);
        }
    });
    this.stamp = 0;
    this.query = [];
  }

  boxesNear(minX, minZ, maxX, maxZ) {
    const out = this.query;
    out.length = 0;
    this.stamp++;
    for (let x = Math.floor(minX / this.cell); x <= Math.floor(maxX / this.cell); x++)
      for (let z = Math.floor(minZ / this.cell); z <= Math.floor(maxZ / this.cell); z++) {
        const list = this.grid.get(x * 1000 + z);
        if (!list) continue;
        for (const i of list) {
          if (this.stamps[i] === this.stamp) continue;
          this.stamps[i] = this.stamp;
          out.push(this.boxes[i]);
        }
      }
    return out;
  }

  // Highest walkable surface under a square footprint, reachable from height y.
  groundAt(x, z, r, y) {
    let g = 0;
    for (const b of this.boxesNear(x - r, z - r, x + r, z + r)) {
      if (x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z) continue;
      if (b.max.y <= y + STEP && b.max.y > g) g = b.max.y;
    }
    return g;
  }

  // True when any box overlaps the square footprint.
  occupied(x, z, r) {
    for (const b of this.boxesNear(x - r, z - r, x + r, z + r))
      if (!(x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z)) return true;
    return false;
  }

  // Move a body (feet position) horizontally with axis-separated box resolution.
  // blocked.xBox / zBox: the box that stopped the move on that axis
  moveBody(pos, dx, dz, r, h) {
    const blocked = { x: false, z: false, xBox: null, zBox: null };
    for (const axis of ['x', 'z']) {
      const d = axis === 'x' ? dx : dz;
      if (d === 0) continue;
      pos[axis] += d;
      for (const b of this.boxesNear(pos.x - r, pos.z - r, pos.x + r, pos.z + r)) {
        if (b.max.y <= pos.y + STEP || b.min.y >= pos.y + h) continue;
        if (pos.x + r <= b.min.x || pos.x - r >= b.max.x || pos.z + r <= b.min.z || pos.z - r >= b.max.z) continue;
        pos[axis] = d > 0 ? b.min[axis] - r - 1e-4 : b.max[axis] + r + 1e-4;
        blocked[axis] = true;
        blocked[axis + 'Box'] = b;
      }
    }
    pos.x = THREE.MathUtils.clamp(pos.x, -WORLD_LIMIT, WORLD_LIMIT);
    pos.z = THREE.MathUtils.clamp(pos.z, -WORLD_LIMIT, WORLD_LIMIT);
    return blocked;
  }

  // Ray against the level boxes and the ground plane. dir must be normalized.
  raycast(origin, dir, maxDist) {
    let best = maxDist;
    let normal = null;
    if (dir.y < -1e-6) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < best) { best = t; normal = new THREE.Vector3(0, 1, 0); }
    }
    const inv = new THREE.Vector3(1 / (dir.x || 1e-9), 1 / (dir.y || 1e-9), 1 / (dir.z || 1e-9));
    for (const b of this.boxes) {
      let tmin = -Infinity, tmax = Infinity, axisHit = 0;
      for (let a = 0; a < 3; a++) {
        const o = origin.getComponent(a), id = inv.getComponent(a);
        let t1 = (b.min.getComponent(a) - o) * id;
        let t2 = (b.max.getComponent(a) - o) * id;
        if (t1 > t2) [t1, t2] = [t2, t1];
        if (t1 > tmin) { tmin = t1; axisHit = a; }
        if (t2 < tmax) tmax = t2;
      }
      if (tmax < Math.max(tmin, 0) || tmin < 0 || tmin >= best) continue;
      best = tmin;
      normal = new THREE.Vector3();
      normal.setComponent(axisHit, -Math.sign(dir.getComponent(axisHit)));
    }
    if (!normal) return null;
    return { dist: best, point: origin.clone().addScaledVector(dir, best), normal };
  }

  lineOfSight(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    d.divideScalar(len);
    return !this.raycast(a, d, len);
  }
}
