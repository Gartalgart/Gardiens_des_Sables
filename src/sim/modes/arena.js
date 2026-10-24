import * as THREE from 'three';
import { GRENADES } from '../weapons.js';

// "Arène" mode: every player for themselves. A kill is worth a point; the first to the score
// limit wins, or the best score when the clock runs out. A few guardians prowl and attack
// everyone; they drop health or ammo but are worth no point.
export const ARENA_DEFAULTS = { scoreLimit: 15, timeLimit: 8 * 60 };
export const ARENA_SCORES = [10, 15, 25];
export const ARENA_TIMES = [5 * 60, 8 * 60, 12 * 60];

const RESPAWN_TIME = 4;
const SPAWN_PROTECT = 2;
const GUARD_GAP = 9; // seconds between two guardians rising

export class ArenaMode {
  constructor(sim, opts = {}) {
    this.sim = sim;
    this.id = 'arena';
    this.pvp = true;
    this.alwaysDrop = true; // guardians always leave health or ammo behind
    this.wave = 1;
    this.totalWaves = 1;
    this.waveActive = true;
    this.objective = null;
    this.scoreLimit = ARENA_SCORES.includes(opts.scoreLimit) ? opts.scoreLimit : ARENA_DEFAULTS.scoreLimit;
    this.timeLimit = ARENA_TIMES.includes(opts.timeLimit) ? opts.timeLimit : ARENA_DEFAULTS.timeLimit;
    this.timeLeft = this.timeLimit;
    this.guardTimer = 5;
    this.winner = null;
  }

  get enemiesLeft() { return this.sim.enemies.alive; }
  // more players, a few more guardians
  get maxGuards() { return 1 + this.sim.players.size; }

  start() {
    const sim = this.sim;
    // everyone starts at a different gate, with every weapon and full ammo
    const gates = [...sim.level.spawns].sort(() => Math.random() - 0.5);
    [...sim.players.values()].forEach((p, i) => {
      this.#arm(p);
      this.#place(p, gates[i % gates.length]);
    });
    sim.emit('banner', { title: 'Arène', sub: `Premier à ${this.scoreLimit} éliminations — chacun pour soi`, duration: 3.5 });
    sim.emit('horn', { victory: false });
  }

  #arm(p) {
    const lo = p.loadout;
    for (const it of lo.items) { it.unlocked = true; it.mag = lo.magSize(it); it.reserve = it.def.reserve; }
    lo.index = 1;
    lo.grenades = GRENADES.start;
    lo.reloading = 0;
    lo.shells = 0;
    lo.swingT = -1;
  }

  #place(p, at) {
    p.pos.copy(at);
    p.pos.y = this.sim.level.groundAt(at.x, at.z, 0.4, at.y + 1);
    p.vel.set(0, 0, 0);
    p.push.set(0, 0, 0);
    // face the middle of the city
    p.yaw = Math.atan2(p.pos.x, p.pos.z);
    p.pitch = 0;
  }

  // Far from every other player and out of their sight; the gates when no such spot turns up.
  #respawnPoint(p) {
    const sim = this.sim;
    const others = [...sim.players.values()].filter((o) => o !== p && !o.dead);
    if (!others.length) return sim.level.spawns[Math.floor(Math.random() * sim.level.spawns.length)];
    const spot = sim.level.nav.ambushPoint(16, 70, (c) => others.every((o) =>
      c.distanceTo(o.pos) > 18 && !sim.level.lineOfSight(c.clone().setY(1.6), o.eye)));
    if (spot) return spot;
    const far = (s) => Math.min(...others.map((o) => s.distanceTo(o.pos)));
    return [...sim.level.spawns].sort((a, b) => far(b) - far(a))[0];
  }

  // a player was killed: by another player (a point for them), a guardian, or themselves
  onKill(victim, killer, weapon, head) {
    const sim = this.sim;
    victim.stats.deaths = (victim.stats.deaths ?? 0) + 1;
    victim.respawn = RESPAWN_TIME;
    victim.killedBy = killer && killer !== victim ? killer.id : null;
    victim.spree = 0;
    victim.multi = 0;
    if (killer && killer !== victim) {
      killer.stats.frags = (killer.stats.frags ?? 0) + 1;
      killer.score = killer.stats.frags;
      // points on screen only: the arena's score is the number of kills
      sim.emit('points', { pid: killer.id, amount: 100, label: 'ÉLIMINATION' });
      if (head) {
        sim.emit('points', { pid: killer.id, amount: 50, label: 'TIR À LA TÊTE' });
        sim.emit('headshotKill', { pid: killer.id });
      }
      if (weapon === 'sword') sim.emit('points', { pid: killer.id, amount: 50, label: 'KHÉPESH' });
      if (weapon === 'grenade') sim.emit('points', { pid: killer.id, amount: 50, label: 'GRENADE' });
      sim.registerKill(killer, true);
    }
    sim.emit('frag', { pid: victim.id, by: victim.killedBy, weapon, head: !!head });
    if (killer && killer !== victim && killer.stats.frags >= this.scoreLimit) this.#finish(killer);
  }

  update(dt) {
    const sim = this.sim;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    for (const p of sim.players.values()) {
      if (p.protect > 0) p.protect = Math.max(0, p.protect - dt);
      if (!p.dead) continue;
      p.respawn -= dt;
      if (p.respawn <= 0) this.#respawn(p);
    }
    // the guardians
    this.guardTimer -= dt;
    if (this.guardTimer <= 0) {
      this.guardTimer = GUARD_GAP;
      if (sim.enemies.alive < this.maxGuards) {
        const guards = this.sim.world.arenaGuards;
        const type = guards[Math.floor(Math.random() * guards.length)];
        sim.enemies.spawn(type, sim.pickSpawn(type));
      }
    }
    if (this.timeLeft <= 0) {
      const ranked = this.ranking();
      this.#finish(ranked[0]);
    }
  }

  #respawn(p) {
    const sim = this.sim;
    this.#place(p, this.#respawnPoint(p));
    this.#arm(p);
    sim.raise(p, 1);
    p.protect = SPAWN_PROTECT;
    p.killedBy = null;
    sim.emit('respawn', { pid: p.id, pos: p.pos.clone(), yaw: p.yaw });
  }

  // best first: more kills, then fewer deaths
  ranking() {
    return [...this.sim.players.values()].sort((a, b) =>
      (b.stats.frags ?? 0) - (a.stats.frags ?? 0) || (a.stats.deaths ?? 0) - (b.stats.deaths ?? 0));
  }

  #finish(winner) {
    if (this.sim.over) return;
    this.winner = winner?.id ?? null;
    this.sim.end(true, this.winner);
  }
}
