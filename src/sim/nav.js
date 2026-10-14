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
        for (const b of boxes) if (b.min.y > f + STEP && b.min.y < f + 1.9) ok = false;
        const i = iz * this.n + ix;
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

    this.layers = {
      small: { open, dist: new Float32Array(N).fill(Infinity), seed: 3 },
      big: { open: openBig, dist: new Float32Array(N).fill(Infinity), seed: 6 },
      // climbers (scarabs) go up and down walls: any height difference is a passage, paid for in metres climbed
      climb: { open, dist: new Float32Array(N).fill(Infinity), seed: 3, climb: true },
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
          if (dist[j] < bd && (climb || Math.abs(floor[j] - floor[target]) <= STEP)) { bd = dist[j]; best = j; }
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
