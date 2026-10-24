import { GRENADES } from '../weapons.js';

// "Exploration" mode: no waves and no end, for visiting the map and trying the weapons. Every weapon
// is in hand from the start, callTargets() (key N on the client) brings a group of enemies and
// callBoss() (key B) the universe's boss.
export class SandboxMode {
  constructor(sim) {
    this.sim = sim;
    this.id = 'sandbox';
    this.wave = 1;
    this.totalWaves = 1;
  }

  start() {
    for (const p of this.sim.players.values()) {
      const lo = p.loadout;
      for (const it of lo.items) { it.unlocked = true; it.mag = lo.magSize(it); it.reserve = it.def.reserve; }
      lo.grenades = GRENADES.max;
    }
    this.sim.emit('banner', { title: 'Exploration', sub: 'Toutes les armes en main — [N] appelle des ennemis, [B] le boss', duration: 4 });
  }

  get enemiesLeft() { return this.sim.enemies.alive; }
  update() {}

  // the boss, if none is there yet
  callBoss() {
    const sim = this.sim;
    if (sim.enemies.boss) return;
    sim.enemies.spawn('boss', sim.pickSpawn('boss'));
    sim.emit('banner', { title: '', sub: sim.world.texts.bossWakes, duration: 2.5 });
    sim.emit('horn', { victory: false });
  }

  // a group of enemies, each type from its own spawn point; ammo and grenades are refilled with it
  callTargets() {
    const sim = this.sim;
    // the universe's basic enemies, a few of each
    for (const [type, n] of sim.world.targets) {
      // a group rises together, but gunners each take their own post
      const post = sim.world.enemies[type].post;
      const at = sim.pickSpawn(type);
      for (let i = 0; i < n; i++) {
        if (post) sim.enemies.spawn(type, i ? sim.pickSpawn(type) : at);
        else sim.enemies.spawn(type, i ? sim.spreadAround(at, type, 3) : at);
      }
    }
    for (const p of sim.players.values()) {
      p.loadout.addAmmo(1);
      p.loadout.grenades = GRENADES.max;
    }
  }
}
