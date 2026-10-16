import * as THREE from 'three';
import { STEP } from './constants.js';

// ---------- Navigation: floor heights on a 0.5 m grid + Dijkstra flow fields towards the player ----------
// Two layers: one for normal bodies, one for big bodies (tanks, boss) that keeps ~1 m away from walls.
export class NavGrid {
  constructor(level) {
    this.level = level;
    this.size = 0.5;
    this.half = 60;
    this.n = Math.round((this.half * 2) / this.size);
    const N = this.n * this.n;
    this.floor = new Float32Array(N);
    this.heap = new MinHeap(N);
    this.lastCell = -1;
    this.timer = 0;

    const open = new Uint8Array(N);
    // covered: something stands above the floor of the cell (a roof): climbers cannot go through it
    this.covered = new Uint8Array(N);
    const r = this.size * 0.5 + 0.2;
    for (let iz = 0; iz < this.n; iz++)
      for (let ix = 0; ix < this.n; ix++) {
        const x = this.cx(ix), z = this.cx(iz);
        const boxes = level.boxesNear(x - r, z - r, x + r, z + r)
          .filter((b) => !(x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z))
          .sort((a, b) => a.min.y - b.min.y);
        let f = 0, changed = true;
        while (changed) {
          changed = false;
          for (const b of boxes) if (b.min.y <= f + STEP && b.max.y > f + 1e-3) { f = b.max.y; changed = true; }
        }
        let ok = f < 9;
        const i = iz * this.n + ix;
        for (const b of boxes) {
          if (b.min.y > f + STEP && b.min.y < f + 1.9) ok = false;
          if (b.min.y > f + STEP) this.covered[i] = 1;
        }
        this.floor[i] = f;
        open[i] = ok ? 1 : 0;
      }

    // big bodies: no wall (floor jump > 1 m) or closed cell within 2 cells
    const openBig = new Uint8Array(N);
    const n = this.n;
    for (let iz = 2; iz < n - 2; iz++)
      for (let ix = 2; ix < n - 2; ix++) {
        const i = iz * n + ix;
        if (!open[i]) continue;
        let ok = true;
        for (let dz = -2; dz <= 2 && ok; dz++)
          for (let dx = -2; dx <= 2; dx++) {
            const j = (iz + dz) * n + ix + dx;
            if (!open[j] || Math.abs(this.floor[j] - this.floor[i]) > 1.0) { ok = false; break; }
          }
        openBig[i] = ok ? 1 : 0;
      }

    // climbers keep off the houses you can walk into (walls, roof): from up there the only way on
    // would be through the roof. A room is a roofed cell with no open sky next to it (unlike the
    // strip under a roof's overhang); seeds are the raised cells around rooms, and the flood takes
    // in the rest of the building's top (cells of about the same height).
    const room = (j) => {
      if (!this.covered[j] || this.floor[j] > STEP) return false; // houses stand on the ground (not the temple's shrine)
      for (let dz = -2; dz <= 2; dz++) // 2 cells: a nook under a brazier bowl is no room
        for (let dx = -2; dx <= 2; dx++) {
          const k = j + dz * n + dx;
          if (!this.covered[k] && this.floor[k] <= this.floor[j] + STEP) return false;
        }
      return true;
    };
    const openClimb = open.slice();
    const stack = [];
    for (let iz = 3; iz < n - 3; iz++)
      for (let ix = 3; ix < n - 3; ix++) {
        const i = iz * n + ix;
        if (this.floor[i] <= STEP) continue;
        for (let dz = -1; dz <= 1 && openClimb[i]; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const j = i + dz * n + dx;
            if (this.floor[j] < this.floor[i] - STEP && room(j)) { openClimb[i] = 0; stack.push(i); break; }
          }
      }
    while (stack.length) {
      const i = stack.pop();
      const ix = i % n, iz = (i / n) | 0;
      if (ix < 1 || iz < 1 || ix >= n - 1 || iz >= n - 1) continue;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const j = i + dz * n + dx;
          if (openClimb[j] && this.floor[j] > STEP && Math.abs(this.floor[j] - this.floor[i]) < 0.35) { openClimb[j] = 0; stack.push(j); }
        }
    }
    this.openClimb = openClimb;

    this.layers = {
      small: { open, dist: new Float32Array(N).fill(Infinity), seed: 3 },
      big: { open: openBig, dist: new Float32Array(N).fill(Infinity), seed: 6 },
      // climbers (scarabs) go up and down walls: any height difference is a passage, paid for in metres climbed
      climb: { open: openClimb, dist: new Float32Array(N).fill(Infinity), seed: 3, climb: true },
    };
    // kept for callers that only care about the normal layer
    this.open = open;
    this.dist = this.layers.small.dist;
  }

  cx(i) { return -this.half + (i + 0.5) * this.size; }
  index(x, z) {
    const ix = Math.floor((x + this.half) / this.size), iz = Math.floor((z + this.half) / this.size);
    if (ix < 0 || iz < 0 || ix >= this.n || iz >= this.n) return -1;
    return iz * this.n + ix;
  }

  // targets: positions of every living player; the field leads to whichever is nearest
  update(dt, targets, force = false) {
    this.timer -= dt;
    const cells = targets.map((t) => this.index(t.x, t.z));
    const key = cells.join(',');
    if (!force && (this.timer > 0 || key === this.lastCell)) return;
    this.timer = 0.25;
    this.lastCell = key;
    for (const layer of Object.values(this.layers)) this.#flow(layer, cells, targets);
  }

  #flow({ open, dist, seed, climb }, cells, targets) {
    const { n, floor, heap } = this;
    dist.fill(Infinity);
    heap.clear();
    cells.forEach((c, k) => {
      if (c < 0) return;
      // seed open cells around the target (at its height) so ledges and narrow spots still attract enemies
      const tx = c % n, tz = (c / n) | 0;
      for (let dz = -seed; dz <= seed; dz++)
        for (let dx = -seed; dx <= seed; dx++) {
          const x = tx + dx, z = tz + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          const i = z * n + x;
          if (!open[i] || Math.abs(floor[i] - targets[k].y) > 1.5) continue;
          const d = Math.hypot(dx, dz) * this.size;
          if (d < dist[i]) { dist[i] = d; heap.push(i, d); }
        }
    });
    const D = this.size * Math.SQRT2;
    while (heap.length) {
      const [i, d] = heap.pop();
      if (d > dist[i]) continue;
      const x = i % n, z = (i / n) | 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
          const j = nz * n + nx;
          const rise = Math.abs(floor[j] - floor[i]);
          if (!open[j] || (!climb && rise > STEP)) continue;
          // no climbing through a roof: down into a covered cell, or up out of one
          if (climb && rise > STEP && (floor[j] < floor[i] ? this.covered[j] : this.covered[i])) continue;
          if (dx && dz && (!open[z * n + nx] || !open[nz * n + x])) continue; // no corner cutting
          const nd = d + (dx && dz ? D : this.size) + (climb ? rise * 1.2 : 0);
          if (nd < dist[j]) { dist[j] = nd; heap.push(j, nd); }
        }
    }
  }

  // Direction to follow from a position (looks a few cells ahead to smooth the path).
  // The start cell is picked among nearby cells at the body's own height: cells hugging a wall
  // or the side of a staircase report the floor of that obstacle, not the ground the body stands on.
  // mode: 'small' (default), 'big' (keeps clear of walls, falls back to small) or 'climb'
  direction(pos, out, mode = 'small') {
    if (mode === 'climb') return this.#direction(this.layers.climb, pos, out, 2);
    if (mode === 'big' || mode === true) {
      const d = this.#direction(this.layers.big, pos, out, 4);
      if (d) return d;
    }
    return this.#direction(this.layers.small, pos, out, 2);
  }

  // going from cell a (standing at height y) to cell b would cross a roof: dropping into a roofed
  // cell from above, or climbing out of one
  #roofBetween(a, b, y) {
    const fb = this.floor[b];
    return (fb < y - STEP && this.covered[b] === 1) || (fb > y + STEP && this.covered[a] === 1);
  }

  // can a climber stand on this cell? (not on a roofed building)
  climbableAt(x, z) {
    const i = this.index(x, z);
    return i >= 0 && this.openClimb[i] === 1;
  }

  coveredAt(x, z) {
    const i = this.index(x, z);
    return i >= 0 && this.covered[i] === 1;
  }

  floorAt(x, z) {
    const i = this.index(x, z);
    return i < 0 ? 0 : this.floor[i];
  }

  #direction({ open, dist, climb }, pos, out, reach) {
    const { n, floor } = this;
    const i = this.index(pos.x, pos.z);
    if (i < 0) return null;
    const ix = i % n, iz = (i / n) | 0;
    let start = -1, best = Infinity;
    for (let dz = -reach; dz <= reach; dz++)
      for (let dx = -reach; dx <= reach; dx++) {
        const x = ix + dx, z = iz + dz;
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        const j = z * n + x;
        if (!open[j] || dist[j] === Infinity || (!climb && Math.abs(floor[j] - pos.y) > STEP)) continue;
        // climbers: a roofed cell only through a neighbour (never across a wall), and never through the roof
        if (climb && this.covered[j] !== this.covered[i] && (Math.abs(dx) > 1 || Math.abs(dz) > 1)) continue;
        if (climb && this.#roofBetween(i, j, pos.y)) continue;
        const score = dist[j] + Math.hypot(dx, dz) * this.size * 2;
        if (score < best) { best = score; start = j; }
      }
    if (start < 0) return null;
    let target = start;
    for (let step = 0; step < 3; step++) {
      const x = target % n, z = (target / n) | 0;
      let best = target, bd = dist[target];
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
          const j = nz * n + nx;
          if (dx && dz && (dist[z * n + nx] === Infinity || dist[nz * n + x] === Infinity)) continue; // no corner cutting
          if (dist[j] < bd && (climb ? !this.#roofBetween(target, j, floor[target]) : Math.abs(floor[j] - floor[target]) <= STEP)) { bd = dist[j]; best = j; }
        }
      if (best === target) break;
      target = best;
    }
    if (target === i) return null;
    out.set(this.cx(target % n) - pos.x, 0, this.cx((target / n) | 0) - pos.z);
    return out.lengthSq() > 1e-6 ? out.normalize() : null;
  }

  distanceAt(pos) {
    const i = this.index(pos.x, pos.z);
    return i < 0 ? Infinity : this.dist[i];
  }

  // A ground-level cell reachable by path, between minD and maxD of walking distance from the target,
  // and passing the visibility test (so enemies rise from the sand out of the player's sight).
  ambushPoint(minD, maxD, accept) {
    const { n, floor } = this;
    const dist = this.layers.big.dist; // roomy spots, so any enemy type fits
    for (let tries = 0; tries < 80; tries++) {
      const j = Math.floor(Math.random() * n * n);
      if (dist[j] < minD || dist[j] > maxD || floor[j] > 0.01) continue;
      const p = new THREE.Vector3(this.cx(j % n), 0, this.cx((j / n) | 0));
      if (Math.abs(p.x) > 44 || Math.abs(p.z) > 44) continue;
      if (this.level.occupied(p.x, p.z, 1.3)) continue;
      if (accept(p)) return p;
    }
    return null;
  }
}

class MinHeap {
  constructor(cap) { this.ids = new Int32Array(cap * 4); this.keys = new Float32Array(cap * 4); this.length = 0; }
  clear() { this.length = 0; }
  push(id, key) {
    let i = this.length++;
    const { ids, keys } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p]; i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop() {
    const { ids, keys } = this;
    const top = [ids[0], keys[0]];
    const id = ids[--this.length], key = keys[this.length];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.length) break;
      if (c + 1 < this.length && keys[c + 1] < keys[c]) c++;
      if (keys[c] >= key) break;
      ids[i] = ids[c]; keys[i] = keys[c]; i = c;
    }
    ids[i] = id; keys[i] = key;
    return top;
  }
}
