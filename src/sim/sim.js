import * as THREE from 'three';
import { makeDifficulty } from './difficulty.js';
import { PlayerSim, emptyCommand } from './player.js';
import { Enemies, rayCylinder } from './enemies.js';
import { PLAYER_RADIUS, PLAYER_HEIGHT } from './constants.js';
import { WaveMode } from './modes/waves.js';
import { SandboxMode } from './modes/sandbox.js';
import { SurvivalMode } from './modes/survival.js';
import { ArenaMode } from './modes/arena.js';
import { applyUpgrade, KILL_POINTS, DIFFICULTY_SCORE, BONUS } from './progression.js';
import { getWorld } from '../worlds/index.js';

const MODES = { waves: WaveMode, survival: SurvivalMode, sandbox: SandboxMode, arena: ArenaMode };
// weapon damage against players (arena), as a share of the damage against guardians:
// two khépesh strikes, two point-blank shotgun blasts, four pistol shots to the body
const PVP_DMG = { sword: 0.6, pistol: 0.8, rifle: 0.7, shotgun: 0.6, sniper: 0.6 };
const REVIVE_RANGE = 2.2;
// fire pots: thrown in an arc, they bounce and blow up after a fuse
const GRAVITY_GRENADE = 18;
const GRENADE = { speed: 15, lift: 3.5, fuse: 2, radius: 5, dmg: 170, playerDmg: 95, size: 0.12 };
// powder kegs of the map (pirate port): a standing cylinder; a shot or a blast nearby sets one off
export const KEG = { radius: 0.42, height: 1.0, blast: 5.5, dmg: 220, playerDmg: 70, chain: [0.12, 0.3] };
// Halo: kills less than 4 s apart chain into a multi-kill
export const MULTI_WINDOW = 4;
const REVIVE_TIME = 3;

// The whole game rules, with no rendering, audio or DOM: it runs the same in the browser
// (solo) and in a Node server (multiplayer). Input: one command per player per step.
// Output: state that clients read, plus a list of events (sounds, effects, HUD messages).
export class Sim {
  // world: the universe's id (src/worlds/); the level given must be that universe's map
  constructor(level, { difficulty = 'normal', mode = 'waves', arena = {}, world } = {}) {
    this.level = level;
    this.world = getWorld(world);
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
    this.grenades = []; // fire pots in flight: { id, pos, vel, fuse, owner }
    // the map's powder kegs; fuse: seconds before a keg caught in a blast goes off too
    this.kegs = level.kegs.map((pos, id) => ({ id, pos: pos.clone(), alive: true, fuse: null, by: null }));
    // the nav grid belongs to the shared Level: forget the previous game's targets
    level.nav.lastCell = null;
    level.nav.timer = 0;
    this.mode = new MODES[mode](this, arena);
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
  // arena: players' weapons hurt each other
  get pvp() { return !!this.mode.pvp; }

  start() { this.mode.start(); }

  // commands: Map of player id -> command (see emptyCommand). Missing players repeat their last command.
  step(dt, commands = new Map()) {
    if (this.over) return;
    for (const p of this.players.values()) {
      const cmd = commands.get(p.id) || this.lastCommands.get(p.id) || emptyCommand();
      this.lastCommands.set(p.id, { ...cmd, jump: false, reload: false, grenade: false, slot: null, cycle: 0, pickCard: null });
      this.stepPlayer(p, cmd, dt);
    }
    this.stepWorld(dt);
  }

  // One command of one player. The server calls it for every command a client sent (each with
  // its own dt), so the client can replay the same commands to predict its own movement.
  stepPlayer(p, cmd, dt) {
    if (this.over || p.dead) return;
    if (cmd.pickCard != null && p.cardOffer) this.pickCard(p, cmd.pickCard);
    p.move(dt, cmd, p.loadout.adsT > 0.5);
    p.loadout.update(dt, cmd);
    this.#revive(p, cmd, dt);
  }

  // Everything but the players: enemies, orb rain, the game mode.
  stepWorld(dt) {
    if (this.over) return;
    this.time += dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    this.slowMo = Math.max(0, this.slowMo - dt);
    for (const p of this.players.values()) {
      // a teammate who lets go of the key loses the progress little by little
      if (p.dead && p.reviveBy === null) p.revive = Math.max(0, p.revive - dt * 0.5);
      p.reviveBy = null;
    }
    this.enemies.update(dt * this.timeScale);
    this.#updateStrikes(dt * this.timeScale);
    this.#updateGrenades(dt * this.timeScale);
    this.#updateKegs(dt * this.timeScale);
    if (!this.over) this.mode.update(dt);
  }

  // ---------- co-op: a downed player is picked up by a teammate holding the use key for 3 s ----------
  #revive(p, cmd, dt) {
    if (!cmd.use || this.pvp) return;
    let best = null, bd = REVIVE_RANGE;
    for (const o of this.players.values()) {
      if (!o.dead || o === p) continue;
      const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      if (d < bd && Math.abs(o.pos.y - p.pos.y) < 1.5) { bd = d; best = o; }
    }
    if (!best) return;
    best.reviveBy = p.id;
    best.revive += dt / REVIVE_TIME;
    if (best.revive >= 1) {
      this.raise(best, 0.4);
      this.addScore(p, BONUS.revive, 'RÉANIMATION');
      this.emit('playerRevived', { pid: best.id, by: p.id });
    }
  }

  // back on their feet with part of their health
  raise(p, healthFraction) {
    if (!p.dead) return;
    p.dead = false;
    p.revive = 0;
    p.health = Math.max(1, p.maxHealth * healthFraction);
    p.lastHit = this.time;
    p.vel.set(0, 0, 0);
  }

  // more players, more enemies (see WaveBase) and a tougher pharaoh
  get playerScale() { return 1 + 0.6 * (Math.max(1, this.players.size) - 1); }

  // Sword hit-stop and perfect-parry slow motion slow the enemies down. Solo only: in multiplayer
  // they would slow the world shared with the other players.
  get timeScale() {
    if (this.players.size !== 1) return 1;
    if (this.hitStop > 0) return 0.15;
    if (this.slowMo > 0) return 0.3;
    return 1;
  }

  // ---------- progression ----------
  pickCard(player, index) {
    const id = player.cardOffer?.[index];
    if (!id) return;
    applyUpgrade(player, id);
    player.cardOffer = null;
    this.emit('cardPicked', { pid: player.id, card: id, count: player.upgrades[id] });
  }

  // label: what the points are for, shown next to the crosshair (Call of Duty style)
  addScore(player, points, label = null) {
    const amount = Math.round(points * (DIFFICULTY_SCORE[this.difficulty.key] ?? 1));
    player.score += amount;
    if (label) this.emit('points', { pid: player.id, amount, label });
  }

  scoreKill(killer, enemy, cause) {
    this.addScore(killer, (KILL_POINTS[enemy.type] ?? 100) * (enemy.elite ? 2 : 1), enemy.T.boss ? this.world.texts.bossKill : enemy.elite ? 'ÉLITE ABATTU' : 'ÉLIMINATION');
    if (cause === 'melee') this.addScore(killer, BONUS.meleeKill, 'KHÉPESH');
    if (cause === 'grenade') this.addScore(killer, BONUS.grenadeKill, 'GRENADE');
    if (cause === 'keg') this.addScore(killer, BONUS.grenadeKill, 'BARIL');
  }

  // Every kill goes through here for the medals: multi-kills (kills less than MULTI_WINDOW apart)
  // and, in the arena, sprees (kills without dying). In the arena only kills of players count.
  registerKill(killer, ofPlayer) {
    if (this.pvp !== ofPlayer) return;
    killer.multi = this.time - killer.lastKillAt <= MULTI_WINDOW ? killer.multi + 1 : 1;
    killer.lastKillAt = this.time;
    if (killer.multi >= 2) this.emit('multikill', { pid: killer.id, count: killer.multi });
    if (!this.pvp) return;
    killer.spree++;
    if (killer.spree % 5 === 0 && killer.spree <= 30) this.emit('spree', { pid: killer.id, count: killer.spree });
  }

  // winner: the arena's best player (each client tells victory from defeat itself)
  end(victory, winner = null) {
    if (this.over) return;
    this.over = true;
    this.victory = victory;
    this.winner = winner;
    this.emit('gameOver', { victory, winner });
    this.emit('horn', { victory });
  }

  // ---------- player attacks ----------
  fireWeapon(player, def, spread) {
    player.protect = 0; // shooting ends the respawn protection
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
      if (res.enemy || res.player) hitAny = true;
      points.push(res.point);
    }
    if (hitAny) player.stats.shotsHit++;
    this.emit('playerShot', { pid: player.id, weapon: def.id, origin, points });
  }

  #shoot(player, origin, dir, def) {
    const wh = this.level.raycast(origin, dir, 250);
    const maxD = wh ? wh.dist : 250;
    const eh = this.enemies.raycast(origin, dir, maxD);
    const ph = this.pvp ? this.#raycastPlayers(origin, dir, eh ? eh.dist : maxD, player) : null;
    // a keg in the way blows up (players come first: the arena has no kegs)
    const kh = ph ? null : this.#raycastKegs(origin, dir, eh ? eh.dist : maxD);
    if (kh) {
      this.blowKeg(kh.keg, player);
      return { point: kh.point };
    }
    if (ph) {
      const falloff = def.id === 'shotgun' ? THREE.MathUtils.clamp(1 - (ph.dist - 7) / 25, 0.25, 1) : ph.dist > 45 ? 0.75 : 1;
      const dmg = def.dmg * (PVP_DMG[def.id] ?? 1) * (ph.head ? 2 : 1) * falloff;
      this.emit('impactPlayer', { point: ph.point, normal: dir.clone().negate() });
      const res = this.hitPlayer(ph.player, dmg, origin, 'bullet', null, { by: player, weapon: def.id, head: ph.head });
      if (res === 'hit') this.emit('hitConfirm', { pid: player.id, head: ph.head });
      return { point: ph.point, player: ph.player };
    }
    if (eh) {
      this.#hitEnemy(player, eh, dir, def, 1);
      // "Balles perforantes": the bullet goes on into one more enemy, a little weaker
      if (player.mods.pierce || def.pierce) {
        const next = this.enemies.raycast(eh.point, dir, maxD - eh.dist, eh.enemy);
        if (next) this.#hitEnemy(player, { ...next, dist: eh.dist + next.dist }, dir, def, 0.7);
      }
      return { point: eh.point, enemy: eh.enemy };
    }
    if (wh) {
      this.emit('impactWall', { point: wh.point, normal: wh.normal });
      return { point: wh.point };
    }
    return { point: origin.clone().addScaledVector(dir, 250) };
  }

  #raycastKegs(origin, dir, maxDist) {
    let best = null;
    for (const k of this.kegs) {
      if (!k.alive) continue;
      const t = rayCylinder(origin, dir, k.pos, KEG.radius, k.pos.y, k.pos.y + KEG.height);
      if (t !== null && t < maxDist && (!best || t < best.dist)) best = { keg: k, dist: t, point: origin.clone().addScaledVector(dir, t) };
    }
    return best;
  }

  // ---------- powder kegs ----------
  blowKeg(k, by = null) {
    if (!k.alive) return;
    k.alive = false;
    k.fuse = null;
    const owner = by && this.players.has(by.id) ? by : null;
    this.#blast(k.pos.clone().setY(k.pos.y + 0.5), { radius: KEG.blast, dmg: KEG.dmg, playerDmg: KEG.playerDmg }, owner, 'keg');
  }

  // the kegs stand again (at each wave)
  resetKegs() {
    for (const k of this.kegs) { k.alive = true; k.fuse = null; k.by = null; }
  }

  // kegs caught in a blast go off a moment later, one after the other
  #lightKegs(pos, radius, by) {
    for (const k of this.kegs) {
      if (!k.alive || k.fuse !== null) continue;
      if (k.pos.clone().setY(k.pos.y + 0.5).distanceTo(pos) > radius) continue;
      const [a, b] = KEG.chain;
      k.fuse = a + Math.random() * (b - a);
      k.by = by;
    }
  }

  #updateKegs(dt) {
    for (const k of this.kegs) {
      if (k.fuse === null) continue;
      k.fuse -= dt;
      if (k.fuse <= 0) this.blowKeg(k, k.by);
    }
  }

  // the other players, as standing cylinders with the head on top
  #raycastPlayers(origin, dir, maxDist, shooter) {
    let best = null;
    for (const p of this.players.values()) {
      if (p === shooter || p.dead) continue;
      const t = rayCylinder(origin, dir, p.pos, PLAYER_RADIUS, p.pos.y, p.pos.y + PLAYER_HEIGHT);
      if (t === null || t >= maxDist || (best && t >= best.dist)) continue;
      const point = origin.clone().addScaledVector(dir, t);
      best = { player: p, dist: t, point, head: point.y > p.headBase };
    }
    return best;
  }

  #hitEnemy(player, eh, dir, def, power) {
    const falloff = def.id === 'shotgun' ? THREE.MathUtils.clamp(1 - (eh.dist - 7) / 25, 0.25, 1) : eh.dist > 45 ? 0.75 : 1;
    const dmg = def.dmg * (eh.head ? player.mods.headMul : 1) * falloff * power;
    this.emit('impactEnemy', { point: eh.point, normal: dir.clone().negate(), enemyType: eh.enemy.type });
    this.enemies.damage(eh.enemy, dmg, dir, player);
    if (eh.head) player.waveStats.headshots++;
    if (eh.enemy.hp <= 0 && eh.head) {
      player.stats.headshots++;
      this.addScore(player, BONUS.headshotKill, 'TIR À LA TÊTE');
      this.emit('headshotKill', { pid: player.id });
    }
    this.emit('hitConfirm', { pid: player.id, head: eh.head });
  }

  // A mummy blowing up: hurts the players and the other enemies around, with knockback.
  explode(pos, cfg, killer) {
    this.emit('explosion', { pos: pos.clone(), radius: cfg.radius });
    this.#lightKegs(pos, cfg.radius, killer);
    for (const p of this.alivePlayers()) {
      const d = p.center.distanceTo(pos);
      if (d > cfg.radius) continue;
      const k = 1 - (d / cfg.radius) * 0.5;
      this.hitPlayer(p, cfg.dmg * k * this.enemies.dmgMul, pos, 'explosion', null, killer ? { by: killer, weapon: 'explosion' } : null);
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

  // ---------- grenades ----------
  throwGrenade(player) {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(player.aimQuaternion());
    const pos = player.eye.addScaledVector(dir, 0.45).add(new THREE.Vector3(0, -0.15, 0));
    const vel = dir.multiplyScalar(GRENADE.speed).add(new THREE.Vector3(0, GRENADE.lift, 0)).addScaledVector(player.vel, 0.5);
    this.grenades.push({ id: this.nextId(), pos, vel, fuse: GRENADE.fuse, owner: player });
  }

  // flight with gravity, bounces off the level, then the blast
  #updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.grenades.splice(i, 1);
        this.#grenadeBlast(g);
        continue;
      }
      g.vel.y -= GRAVITY_GRENADE * dt;
      const step = g.vel.clone().multiplyScalar(dt);
      const len = step.length();
      if (len < 1e-6) continue;
      const dir = step.clone().divideScalar(len);
      const hit = this.level.raycast(g.pos, dir, len + GRENADE.size);
      if (!hit) { g.pos.add(step); continue; }
      // bounce: the part of the speed into the surface comes back weaker, the rest slides with friction
      g.pos.copy(hit.point).addScaledVector(hit.normal, GRENADE.size);
      const into = g.vel.dot(hit.normal);
      const speed = g.vel.length();
      g.vel.addScaledVector(hit.normal, -into).multiplyScalar(0.7).addScaledVector(hit.normal, -into * 0.4);
      if (g.vel.length() < 0.6) g.vel.set(0, 0, 0);
      if (speed > 3) this.emit('grenadeBounce', { pos: g.pos.clone(), speed });
    }
  }

  #grenadeBlast(g) {
    const owner = this.players.has(g.owner.id) ? g.owner : null;
    this.#blast(g.pos.clone(), { radius: GRENADE.radius, dmg: GRENADE.dmg, playerDmg: GRENADE.playerDmg }, owner, 'grenade');
  }

  // A fire pot or a powder keg going off (kind 'grenade' or 'keg'): walls shelter from it.
  #blast(pos, cfg, owner, kind) {
    const R = cfg.radius;
    this.emit('explosion', { pos: pos.clone(), radius: R, kind });
    this.#lightKegs(pos, R, owner);
    const from = pos.clone().setY(pos.y + 0.3);
    const exposed = (p) => this.level.lineOfSight(from, p);
    for (const e of [...this.enemies.list]) {
      if (e.rise > 0.5 || e.hidden) continue;
      const c = e.pos.clone().setY(e.pos.y + e.lift + e.T.height * 0.5);
      const d = c.distanceTo(pos);
      if (d > R + e.T.radius || !exposed(c)) continue;
      const k = 1 - Math.min(1, d / (R + e.T.radius)) * 0.6;
      e.knock.copy(e.pos).sub(pos).setY(0).normalize().multiplyScalar(e.T.big ? 3 : 10);
      this.enemies.damage(e, cfg.dmg * k, e.pos.clone().sub(pos).normalize(), owner, kind);
    }
    // the thrower is hurt by their own pot, other players only in the arena; a keg hurts everyone near
    for (const p of this.alivePlayers()) {
      if (kind === 'grenade' && p !== owner && !this.pvp) continue;
      const d = p.center.distanceTo(pos);
      if (d > R || !exposed(p.center)) continue;
      const k = 1 - (d / R) * 0.6;
      this.hitPlayer(p, cfg.playerDmg * k, pos, 'explosion', null, owner ? { by: owner, weapon: kind } : null);
      p.impulse(p.pos.clone().sub(pos).setY(0).normalize().multiplyScalar(8 * k).add(new THREE.Vector3(0, 3.5 * k, 0)));
    }
  }

  // The pharaoh's second phase: the storm rises.
  bossPhase2(boss) {
    this.weather = 'sandstorm';
    this.emit('bossPhase2', { id: boss.id, pos: boss.pos.clone() });
    this.emit('weather', { kind: 'sandstorm' });
    this.emit('banner', { title: '', sub: this.world.texts.bossStorm, duration: 2.5 });
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
    const m = player.mods;
    const range = def.range * m.swordReach;
    const arc = 0.3 - (m.swordReach - 1) * 0.6; // "Grand arc" also widens the swing
    player.protect = 0;
    let hits = 0;
    if (this.pvp) hits += this.#meleePlayers(player, def, fwd, eye, range, arc);
    for (const e of [...this.enemies.list]) {
      if (e.rise > 0.5) continue;
      const to = new THREE.Vector3(e.pos.x - player.pos.x, 0, e.pos.z - player.pos.z);
      const reach = to.length() - e.T.radius;
      if (reach > range) continue;
      const base = e.pos.y + e.lift;
      if (eye.y < base - 0.8 || eye.y > base + e.T.height + 1.2) continue;
      to.normalize();
      if (fwd.dot(to) < arc && reach > 0.5) continue;
      this.emit('meleeImpact', { point: e.pos.clone().setY(base + e.T.height * 0.55), normal: to.clone().negate(), fwd: fwd.clone(), enemyType: e.type });
      this.enemies.meleeHit(e, def.dmg * m.swordDmg, to, player);
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

  // the arena: the blade also strikes the other players in the arc
  #meleePlayers(player, def, fwd, eye, range, arc) {
    let hits = 0;
    for (const o of this.players.values()) {
      if (o === player || o.dead) continue;
      const to = new THREE.Vector3(o.pos.x - player.pos.x, 0, o.pos.z - player.pos.z);
      const reach = to.length() - PLAYER_RADIUS;
      if (reach > range || eye.y < o.pos.y - 0.8 || eye.y > o.pos.y + PLAYER_HEIGHT + 1.2) continue;
      to.normalize();
      if (fwd.dot(to) < arc && reach > 0.5) continue;
      const res = this.hitPlayer(o, def.dmg * player.mods.swordDmg * PVP_DMG.sword, player.pos, 'melee', null, { by: player, weapon: 'sword' });
      if (res !== 'hit') continue;
      this.emit('impactPlayer', { point: o.center, normal: to.clone().negate() });
      o.impulse(to.clone().multiplyScalar(5));
      hits++;
    }
    return hits;
  }

  // Enemy attacks land here; a raised khépesh parries what comes from the front.
  // A parry raised at the last moment (Loadout.perfectParry) is perfect: no damage at all, the attacker
  // is staggered and the world slows down for an instant.
  // Returns 'hit', 'blocked', 'reflect' or 'perfect' (the last two: projectiles bounced back),
  // or 'immune' for a player just back in the arena.
  // src: the player behind the blow in the arena, { by, weapon, head }, to credit the kill.
  hitPlayer(player, dmg, from, kind, attacker = null, src = null) {
    if (player.dead) return 'hit';
    if (player.protect > 0) return 'immune';
    // explosions, orb rain and bullets cannot be parried
    if (player.loadout.blocking && kind !== 'explosion' && kind !== 'bullet') {
      const to = new THREE.Vector3(from.x - player.pos.x, 0, from.z - player.pos.z).normalize();
      if (player.flatForward().dot(to) > 0.3) {
        const perfect = player.loadout.perfectParry;
        if (perfect) {
          this.emit('perfectParry', { pid: player.id, pos: from.clone() });
          player.waveStats.perfectParries++;
          this.addScore(player, BONUS.perfectParry, 'PARADE PARFAITE');
          this.slowMo = 0.45;
          // a player's blade parried at the last moment throws its owner back
          if (src?.by) src.by.impulse(to.clone().multiplyScalar(-9));
          if (attacker) {
            attacker.stun = attacker.T.boss ? 0.6 : 1.4;
            attacker.act = null;
            attacker.knock.copy(to).negate().multiplyScalar(attacker.T.boss ? 1 : attacker.T.big ? 4 : 8);
          }
          return kind === 'projectile' ? 'perfect' : 'blocked';
        }
        if (kind === 'projectile') return 'reflect';
        this.emit('blocked', { pid: player.id });
        if (player.mods.blockFactor > 0) this.#hurt(player, dmg * player.mods.blockFactor, from, src);
        return 'blocked';
      }
    }
    this.#hurt(player, dmg, from, src);
    return 'hit';
  }

  #hurt(player, dmg, from, src = null) {
    if (player.dead) return;
    player.damage(dmg);
    player.stats.damageTaken += dmg;
    player.waveStats.damageTaken += dmg;
    this.emit('playerHurt', { pid: player.id, amount: dmg, from: from.clone() });
    if (!player.dead) return;
    this.emit('playerDown', { pid: player.id });
    this.mode.onKill?.(player, src?.by ?? null, src?.weapon ?? 'guardian', src?.head);
  }

  // returns false when the player cannot use it (full health, ammo maxed): the pickup stays
  pickup(player, kind) {
    if (kind === 'ammo') {
      const ammo = player.loadout.addAmmo(0.25 * player.mods.ammo);
      const pot = player.loadout.addGrenades(1); // ammo crates also hold a fire pot
      if (!ammo && !pot) return false;
    } else {
      if (player.health >= player.maxHealth) return false;
      player.health = Math.min(player.maxHealth, player.health + 35);
    }
    this.emit('pickup', { pid: player.id, kind });
    return true;
  }

  // the boss calls four of his minions around him
  summon(boss) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const p = boss.pos.clone().add(new THREE.Vector3(Math.cos(a) * 3.5, 0, Math.sin(a) * 3.5));
      p.y = this.level.groundAt(p.x, p.z, 0.4, boss.pos.y + 0.5);
      this.enemies.spawn(boss.T.summon, p);
    }
    this.emit('banner', { title: '', sub: this.world.texts.bossSummon, duration: 2 });
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
