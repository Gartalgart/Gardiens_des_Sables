import * as THREE from 'three';

// "Vagues" mode: five waves, weapons unlocked between them, the pharaoh in the last one.
// A mode drives spawning and decides when the game ends; the Sim stays mode-agnostic.
export const WAVES = [
  { runner: 8 },
  { runner: 9, shooter: 4, scarab: 5 },
  { runner: 8, shooter: 6, tank: 2, mummy: 2, scarab: 5 },
  { runner: 9, shooter: 7, tank: 4, mummy: 3, scarab: 10 },
  { runner: 6, shooter: 6, tank: 2, mummy: 2, scarab: 5, boss: 1 },
];
const SWARM = 5; // scarabs come out of the sand together
const ELITE_FROM_WAVE = 3;
const ELITE_CHANCE = 0.1;
// weapon unlocked when a wave is cleared, ready for the next one
export const UNLOCKS = { 2: 'rifle', 3: 'shotgun' };

export class WaveMode {
  constructor(sim) {
    this.sim = sim;
    this.id = 'waves';
    this.totalWaves = WAVES.length;
    this.wave = 0;
    this.waveActive = false;
    this.queue = [];
    this.spawnTimer = 0;
    this.breakTimer = 2.5;
  }

  start() {
    this.sim.emit('banner', { title: 'Vague 1', sub: 'Khépesh [1] et pistolet [2] — survivez aux gardiens', duration: 3 });
    this.sim.emit('horn', { victory: false });
  }

  get enemiesLeft() { return this.queue.length + this.sim.enemies.alive; }

  #beginWave(n) {
    this.wave = n;
    this.sim.enemies.setWave(n);
    const q = [];
    let scarabs = 0;
    for (const [type, count] of Object.entries(WAVES[n - 1])) {
      if (type === 'scarab') { scarabs = count; continue; }
      for (let i = 0; i < count; i++) q.push(type);
    }
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    // scarabs are inserted as blocks: a swarm rises together
    while (scarabs > 0) {
      const k = Math.min(SWARM, scarabs);
      q.splice(1 + Math.floor(Math.random() * q.length), 0, ...Array(k).fill('scarab'));
      scarabs -= k;
    }
    // the boss arrives first so the fight is about him
    const bi = q.indexOf('boss');
    if (bi > 0) { q.splice(bi, 1); q.unshift('boss'); }
    this.queue = q;
    this.waveActive = true;
    this.spawnTimer = 0.5;
  }

  update(dt) {
    const sim = this.sim;
    if (!sim.alivePlayers().length) return sim.end(false);
    if (!this.waveActive) {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) this.#beginWave(this.wave + 1);
      return;
    }
    const D = sim.difficulty;
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0 && sim.enemies.load < D.maxAlive) {
      const type = this.queue.shift();
      const at = sim.pickSpawn(type);
      if (type === 'scarab') {
        sim.enemies.spawn(type, at);
        while (this.queue[0] === 'scarab') {
          this.queue.shift();
          sim.enemies.spawn('scarab', at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 0, (Math.random() - 0.5) * 2.5)));
        }
      } else {
        const elite = this.wave >= ELITE_FROM_WAVE && type !== 'boss' && Math.random() < ELITE_CHANCE;
        sim.enemies.spawn(type, at, { elite });
      }
      const gap = D.spawnGap;
      this.spawnTimer = this.wave >= 4 ? gap[2] : this.wave >= 2 ? gap[1] : gap[0];
    }
    if (!this.queue.length && sim.enemies.alive === 0) {
      this.waveActive = false;
      if (this.wave === WAVES.length) return sim.end(true);
      this.breakTimer = 7;
      const next = this.wave + 1;
      let unlocked = null;
      for (const p of sim.players.values()) {
        const u = UNLOCKS[next] && p.loadout.unlock(UNLOCKS[next]);
        unlocked = unlocked || u;
        p.loadout.addAmmo(0.5);
      }
      const sub = unlocked ? `Nouvelle arme : ${unlocked.def.name} [${unlocked.slot}]`
        : next === WAVES.length ? 'Le pharaon s\'éveille…' : 'Munitions réapprovisionnées';
      sim.emit('banner', { title: `Vague ${next}`, sub, duration: 4.5 });
      if (unlocked) sim.emit('unlock', { weapon: unlocked.def.id });
      sim.emit('horn', { victory: false });
    }
  }
}
