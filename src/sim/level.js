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
    // optional (the pirate port): shallow water rectangles and powder kegs
    this.water = (data.water ?? []).map(([minX, minZ, maxX, maxZ]) => ({ minX, minZ, maxX, maxZ }));
    this.kegs = (data.kegs ?? []).map((p) => new THREE.Vector3(...p));
    // optional (the space station): airlocks, a door on the void and the lever that works it; a
    // closed door is one of the boxes (the nav grid is worked out with every door closed)
    this.airlocks = (data.airlocks ?? []).map(({ door: [a, b, c, d, e, f], lever }) => ({
      door: new THREE.Box3(new THREE.Vector3(a, b, c), new THREE.Vector3(d, e, f)),
      lever: new THREE.Vector3(...lever),
      open: false,
    }));
    for (const a of this.airlocks) this.boxes.push(a.door);
    this.#buildBoxGrid();
    // optional (the station): air vents, where duct crawlers come out and go back in; `out` is the
    // floor in front of a vent in a wall, or under one in a ceiling
    this.vents = (data.vents ?? []).map((p) => {
      const pos = new THREE.Vector3(...p);
      let hit = null;
      for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
        const h = this.raycast(pos, new THREE.Vector3(...d), 0.45); // a wall vent sits 0.3 m off its wall
        if (h && (!hit || h.dist < hit.dist)) hit = h;
      }
      const out = hit ? pos.clone().addScaledVector(hit.normal, 0.7) : pos.clone();
      out.y = this.groundAt(out.x, out.z, 0.3, 0.3);
      return { pos, out };
    });
    this.navOptions = {};
    this.nav = new NavGrid(this, this.navOptions);
    this.original = null; // the boxes before a part of the map was broken (see breakArea)
  }

  // A part of the map breaks (the Kraken smashes a pier): the boxes inside the rectangle and below
  // maxY go, the ones in `add` appear (a barrier closing the gap), and the nav grid is worked out again.
  breakArea({ minX, maxX, minZ, maxZ, maxY }, add = []) {
    this.original ??= this.boxes;
    this.boxes = this.boxes.filter((b) => !(b.min.x >= minX && b.max.x <= maxX && b.min.z >= minZ && b.max.z <= maxZ && b.max.y <= maxY));
    for (const [a, b, c, d, e, f] of add) this.boxes.push(new THREE.Box3(new THREE.Vector3(a, b, c), new THREE.Vector3(d, e, f)));
    this.#buildBoxGrid();
    this.nav = new NavGrid(this, this.navOptions);
  }

  // An airlock's door opens (its box goes) or closes; the nav grid stays as it is: a door gives on
  // the void, where no path leads.
  setDoor(i, open) {
    const a = this.airlocks[i];
    if (a.open === open) return;
    a.open = open;
    if (open) this.boxes = this.boxes.filter((b) => b !== a.door);
    else this.boxes.push(a.door);
    if (this.original) this.original = open ? this.original.filter((b) => b !== a.door) : [...this.original, a.door];
    this.#buildBoxGrid();
  }

  // the universe's own nav settings (NavGrid's options); the grid is worked out again if they change
  setNavOptions(options = {}) {
    if (JSON.stringify(options) === JSON.stringify(this.navOptions)) return;
    this.navOptions = options;
    this.nav = new NavGrid(this, options);
  }

  // back as exported, for a new game
  restore() {
    this.airlocks.forEach((a, i) => this.setDoor(i, false));
    if (!this.original) return;
    this.boxes = this.original;
    this.original = null;
    this.#buildBoxGrid();
    this.nav = new NavGrid(this, this.navOptions);
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

  // Feet in shallow water: inside a water zone and down at the sea floor (a quay or a deck is dry).
  inWater(x, z, y) {
    if (y > 0.3) return false;
    for (const w of this.water) if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ) return true;
    return false;
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
