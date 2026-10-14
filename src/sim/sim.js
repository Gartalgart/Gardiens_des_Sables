import * as THREE from 'three';
import { makeDifficulty } from './difficulty.js';
import { PlayerSim, emptyCommand } from './player.js';
import { Enemies } from './enemies.js';
import { WaveMode } from './modes/waves.js';
import { SandboxMode } from './modes/sandbox.js';

const MODES = { waves: WaveMode, sandbox: SandboxMode };

// The whole game rules, with no rendering, audio or DOM: it runs the same in the browser
// (solo) and in a Node server (multiplayer). Input: one command per player per step.
// Output: state that clients read, plus a list of events (sounds, effects, HUD messages).
export class Sim {
  constructor(level, { difficulty = 'normal', mode = 'waves' } = {}) {
    this.level = level;
    this.difficulty = makeDifficulty(difficulty);
    this.players = new Map();
    this.enemies = new Enemies(this);
    this.time = 0;
    this.hitStop = 0;
    this.slowMo = 0;
    this.events = [];
    this.lastId = 0;
    this.over = false;
    this.victory = null;
    this.lastCommands = new Map();
    this.weather = 'clear'; // 'sandstorm' once the pharaoh enters his second phase
    this.strikes = []; // orb rain about to land: { id, pos, radius, dmg, t }
    // the nav grid belongs to the shared Level: forget the previous game's targets
    level.nav.lastCell = null;
    level.nav.timer = 0;
    this.mode = new MODES[mode](this);
  }

  nextId() { return ++this.lastId; }
  // the event type is written last so a data field can never overwrite it
  emit(type, data = {}) { this.events.push({ ...data, type }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  addPlayer(id) {
    const p = new PlayerSim(id, this);
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) { this.players.delete(id); this.lastCommands.delete(id); }
  alivePlayers() { return [...this.players.values()].filter((p) => !p.dead); }

  start() { this.mode.start(); }

  // commands: Map of player id -> command (see emptyCommand). Missing players repeat their last command.
  step(dt, commands = new Map()) {
    if (this.over) return;
    this.time += dt;
    for (const p of this.players.values()) {
      const cmd = commands.get(p.id) || this.lastCommands.get(p.id) || emptyCommand();
      this.lastCommands.set(p.id, { ...cmd, jump: false, reload: false, slot: null, cycle: 0 });
      if (p.dead) continue;
      p.move(dt, cmd, p.loadout.adsT > 0.5);
      p.loadout.update(dt, cmd);
    }
    this.hitStop = Math.max(0, this.hitStop - dt);
    this.slowMo = Math.max(0, this.slowMo - dt);
    this.enemies.update(dt * this.timeScale);
    this.#updateStrikes(dt * this.timeScale);
    if (!this.over) this.mode.update(dt);
  }

  // Sword hit-stop and perfect-parry slow motion slow the enemies down. Solo only: in multiplayer
  // they would slow the world shared with the other players.
  get timeScale() {
    if (this.players.size !== 1) return 1;
    if (this.hitStop > 0) return 0.15;
    if (this.slowMo > 0) return 0.3;
    return 1;
  }

  end(victory) {
    if (this.over) return;
    this.over = true;
    this.victory = victory;
    this.emit('gameOver', { victory });
    this.emit('horn', { victory });
  }

  // ---------- player attacks ----------
  fireWeapon(player, def, spread) {
    const origin = player.eye;
    const q = player.aimQuaternion();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const points = [];
    let hitAny = false;
    for (let i = 0; i < def.pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const res = this.#shoot(player, origin, dir, def);
      if (res.enemy) hitAny = true;
      points.push(res.point);
    }
    if (hitAny) player.stats.shotsHit++;
    this.emit('playerShot', { pid: player.id, weapon: def.id, origin, points });
  }

  #shoot(player, origin, dir, def) {
    const wh = this.level.raycast(origin, dir, 250);
    const maxD = wh ? wh.dist : 250;
    const eh = this.enemies.raycast(origin, dir, maxD);
    if (eh) {
      const falloff = def.id === 'shotgun' ? THREE.MathUtils.clamp(1 - (eh.dist - 7) / 25, 0.25, 1) : eh.dist > 45 ? 0.75 : 1;
      const dmg = def.dmg * (eh.head ? 2 : 1) * falloff;
      this.emit('impactEnemy', { point: eh.point, normal: dir.clone().negate(), enemyType: eh.enemy.type });
      this.enemies.damage(eh.enemy, dmg, dir, player);
      if (eh.enemy.hp <= 0 && eh.head) player.stats.headshots++;
      this.emit('hitConfirm', { pid: player.id, head: eh.head });
      return { point: eh.point, enemy: eh.enemy };
    }
    if (wh) {
      this.emit('impactWall', { point: wh.point, normal: wh.normal });
      return { point: wh.point };
    }
    return { point: origin.clone().addScaledVector(dir, 250) };
  }

  // A mummy blowing up: hurts the players and the other enemies around, with knockback.
  explode(pos, cfg, killer) {
    this.emit('explosion', { pos: pos.clone(), radius: cfg.radius });
    for (const p of this.alivePlayers()) {
      const d = p.center.distanceTo(pos);
      if (d > cfg.radius) continue;
      const k = 1 - (d / cfg.radius) * 0.5;
      this.hitPlayer(p, cfg.dmg * k * this.enemies.dmgMul, pos, 'explosion');
      p.impulse(p.pos.clone().sub(pos).setY(0).normalize().multiplyScalar(9 * k).add(new THREE.Vector3(0, 4 * k, 0)));
    }
    for (const e of [...this.enemies.list]) {
      const d = e.pos.clone().setY(e.pos.y + 1).distanceTo(pos);
      if (d > cfg.radius || e.rise > 0.5) continue;
      const k = 1 - (d / cfg.radius) * 0.5;
      e.knock.copy(e.pos).sub(pos).setY(0).normalize().multiplyScalar(e.T.big ? 3 : 10);
      this.enemies.damage(e, cfg.enemyDmg * k, e.pos.clone().sub(pos).normalize(), killer);
    }
  }

  // The pharaoh's second phase: the storm rises.
  bossPhase2(boss) {
    this.weather = 'sandstorm';
    this.emit('bossPhase2', { id: boss.id, pos: boss.pos.clone() });
    this.emit('weather', { kind: 'sandstorm' });
    this.emit('banner', { title: '', sub: 'Le pharaon déchaîne la tempête !', duration: 2.5 });
    this.emit('horn', { victory: false });
  }

  // Orbs fall from the sky on circles marked around each player, one of them where the player is heading.
  orbRain(boss) {
    const dmg = 20 * this.enemies.dmgMul;
    for (const p of this.alivePlayers()) {
      const spots = [p.pos.clone().addScaledVector(p.vel, 1.0)];
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5;
        spots.push(p.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)));
      }
      for (const s of spots) {
        s.y = this.level.groundAt(s.x, s.z, 0.5, p.pos.y + 0.6);
        const strike = { id: this.nextId(), pos: s, radius: 2.2, dmg, t: 1.3 };
        this.strikes.push(strike);
        this.emit('rainMark', { id: strike.id, pos: s.clone(), radius: strike.radius, delay: strike.t });
      }
    }
  }

  #updateStrikes(dt) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      if (s.t > 0) continue;
      this.strikes.splice(i, 1);
      this.emit('rainStrike', { id: s.id, pos: s.pos.clone(), radius: s.radius });
      for (const p of this.alivePlayers()) {
        const d = Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z);
        if (d < s.radius && Math.abs(p.pos.y - s.pos.y) < 2.5) this.hitPlayer(p, s.dmg, s.pos, 'explosion');
      }
    }
  }

  // Sword: hits every enemy in a wide arc in front, and bats incoming orbs back.
  meleeAttack(player, def) {
    const fwd = player.flatForward();
    const eye = player.eye;
    let hits = 0;
    for (const e of [...this.enemies.list]) {
      if (e.rise > 0.5) continue;
      const to = new THREE.Vector3(e.pos.x - player.pos.x, 0, e.pos.z - player.pos.z);
      const reach = to.length() - e.T.radius;
      if (reach > def.range) continue;
      const base = e.pos.y + e.lift;
      if (eye.y < base - 0.8 || eye.y > base + e.T.height + 1.2) continue;
      to.normalize();
      if (fwd.dot(to) < 0.3 && reach > 0.5) continue;
      this.emit('meleeImpact', { point: e.pos.clone().setY(base + e.T.height * 0.55), normal: to.clone().negate(), fwd: fwd.clone(), enemyType: e.type });
      this.enemies.meleeHit(e, def.dmg, to, player);
      hits++;
    }
    for (const p of this.enemies.projectiles) {
      if (p.reflected) continue;
      const to = p.pos.clone().sub(eye);
      if (to.length() < def.range + 1 && fwd.dot(to.setY(0).normalize()) > 0.2) this.enemies.reflect(p, player);
    }
    if (hits) {
      this.emit('slash', { pid: player.id, hits });
      this.hitStop = 0.06;
      player.kick(-0.012, (Math.random() - 0.5) * 0.02);
    }
    return hits;
  }

  // Enemy attacks land here; a raised khépesh parries what comes from the front.
  // A parry raised at the last moment (Loadout.perfectParry) is perfect: no damage at all, the attacker
  // is staggered and the world slows down for an instant.
  // Returns 'hit', 'blocked', 'reflect' or 'perfect' (the last two: projectiles bounced back).
  hitPlayer(player, dmg, from, kind, attacker = null) {
    if (player.dead) return 'hit';
    // explosions and orb rain cannot be parried
    if (player.loadout.blocking && kind !== 'explosion') {
      const to = new THREE.Vector3(from.x - player.pos.x, 0, from.z - player.pos.z).normalize();
      if (player.flatForward().dot(to) > 0.3) {
        const perfect = player.loadout.perfectParry;
        if (perfect) {
          this.emit('perfectParry', { pid: player.id, pos: from.clone() });
          this.slowMo = 0.45;
          if (attacker) {
            attacker.stun = attacker.T.boss ? 0.6 : 1.4;
            attacker.act = null;
            attacker.knock.copy(to).negate().multiplyScalar(attacker.T.boss ? 1 : attacker.T.big ? 4 : 8);
          }
          return kind === 'projectile' ? 'perfect' : 'blocked';
        }
        if (kind === 'projectile') return 'reflect';
        this.emit('blocked', { pid: player.id });
        this.#hurt(player, dmg * 0.25, from);
        return 'blocked';
      }
    }
    this.#hurt(player, dmg, from);
    return 'hit';
  }

  #hurt(player, dmg, from) {
    if (player.dead) return;
    player.damage(dmg);
    player.stats.damageTaken += dmg;
    this.emit('playerHurt', { pid: player.id, amount: dmg, from: from.clone() });
    if (player.dead) this.emit('playerDown', { pid: player.id });
  }

  // returns false when the player cannot use it (full health, ammo maxed): the pickup stays
  pickup(player, kind) {
    if (kind === 'ammo') {
      if (!player.loadout.addAmmo(0.25)) return false;
    } else {
      if (player.health >= player.maxHealth) return false;
      player.health = Math.min(player.maxHealth, player.health + 35);
    }
    this.emit('pickup', { pid: player.id, kind });
    return true;
  }

  // the boss calls four jackals around him
  summon(boss) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const p = boss.pos.clone().add(new THREE.Vector3(Math.cos(a) * 3.5, 0, Math.sin(a) * 3.5));
      p.y = this.level.groundAt(p.x, p.z, 0.4, boss.pos.y + 0.5);
      this.enemies.spawn('runner', p);
    }
    this.emit('banner', { title: '', sub: 'Le pharaon appelle ses chacals !', duration: 2 });
    this.emit('horn', { victory: false });
  }

  // Most enemies rise from the sand inside the city, out of every player's sight; the rest come through the gates.
  pickSpawn(type) {
    const D = this.difficulty;
    const players = this.alivePlayers();
    if (type !== 'boss' && Math.random() < D.ambush) {
      const p = this.level.nav.ambushPoint(D.ambushMin, 44, (c) => players.every((pl) =>
        c.distanceTo(pl.pos) > 14 && !this.level.lineOfSight(c.clone().setY(1.6), pl.eye)));
      if (p) return p;
    }
    const minDist = (s) => Math.min(...players.map((pl) => s.distanceTo(pl.pos)));
    const far = this.level.spawns.filter((s) => minDist(s) > 25);
    const pool = far.length ? far : this.level.spawns;
    const s = pool[Math.floor(Math.random() * pool.length)].clone();
    s.x += (Math.random() - 0.5) * 3;
    s.z += (Math.random() - 0.5) * 3;
    return s;
  }
}
