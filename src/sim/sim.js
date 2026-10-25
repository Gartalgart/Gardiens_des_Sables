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
// a weapon's ball (the pirates' hand cannon) flies in the same list but blows up where it lands
const BALL_SIZE = 0.09;
// powder kegs of the map (pirate port): a standing cylinder; a shot or a blast nearby sets one off
export const KEG = { radius: 0.42, height: 1.0, blast: 5.5, dmg: 220, playerDmg: 70, chain: [0.12, 0.3] };
// the station's airlocks: a lever opens the door on the void, and for a few seconds the air rushing
// out drags bodies towards it (m/s at the door, fading out at reach + reachPerWidth × the door's
// width); whoever goes through the door is lost. use: how close to the lever a player must stand.
export const AIRLOCK = { dur: 7, pull: 10, reach: 10, reachPerWidth: 0.9, use: 1.8, cooldown: 1 };
// the Hive Queen's breach (Sim#breach): the airlocks open by turns, for `open` s every `every` s,
// and pull from farther (reach × reachMul)
export const BREACH = { open: 6, every: 12, reachMul: 1.6 };
// the station's sticky mines (world.grenade 'mine'): they stick to what they hit, arm, and go off
// when an enemy comes near (or after `fuse` seconds on an enemy's back)
export const MINE = { speed: 16, lift: 2, arm: 0.6, trigger: 2.4, fuse: 1.3, radius: 4.6, dmg: 200, playerDmg: 60, life: 60 };
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
    this.strikes = []; // orb rain or lobbed balls about to land: { id, pos, radius, dmg, t, kind }
    // fire pots in flight: { id, pos, vel, fuse, owner }; a cannon ball also has kind 'ball',
    // gravity and the weapon's blast, and has no fuse
    this.grenades = [];
    this.chest = null; // the pirate port's chest while an objective protects it: { pos, gold, looters }
    // the map's powder kegs; fuse: seconds before a keg caught in a blast goes off too
    this.kegs = level.kegs.map((pos, id) => ({ id, pos: pos.clone(), alive: true, fuse: null, by: null }));
    // the station's airlocks (the doors themselves are boxes of the level, see Level#setDoor):
    // axis: the door's normal ('x' or 'z'), sign: the way out; side: the axis along the door
    this.airlocks = level.airlocks.map((a, id) => {
      const size = a.door.getSize(new THREE.Vector3()), center = a.door.getCenter(new THREE.Vector3()).setY(0);
      const axis = size.x < size.z ? 'x' : 'z', side = axis === 'x' ? 'z' : 'x';
      return {
        id, center, axis, side, sign: Math.sign(center[axis]) || 1, lever: a.lever.clone(),
        reach: AIRLOCK.reach + AIRLOCK.reachPerWidth * size[side], open: false, t: 0, by: null, cd: 0,
      };
    });
    this.power = true; // the station's lights (the Hive Queen cuts them: Sim#powerCut)
    this.breached = null; // { t, next } while the Queen keeps the airlocks blowing (Sim#breach)
    this.breaches = null; // the wave objective of airlocks blowing (Sim#updateBreaches): { t, every, close, ... }
    // the Level is shared by the games: a pier the Kraken broke stands again, and the nav grid
    // forgets the previous game's targets
    level.restore();
    level.setNavOptions(this.world.nav);
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
    this.#useLever(p, cmd);
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
    this.#updateBurns(dt * this.timeScale);
    this.#updateAirlocks(dt);
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
    if (cause === 'melee') this.addScore(killer, BONUS.meleeKill, this.world.weapons.find((w) => w.melee)?.name ?? 'MÊLÉE');
    if (cause === 'grenade') this.addScore(killer, BONUS.grenadeKill, this.world.texts.grenadeKill ?? 'GRENADE');
    if (cause === 'ball') this.addScore(killer, BONUS.grenadeKill, 'BOULET');
    if (cause === 'keg') this.addScore(killer, BONUS.grenadeKill, this.world.texts.kegKill ?? 'BARIL');
    if (cause === 'airlock') this.addScore(killer, BONUS.grenadeKill, this.world.texts.airlockKill ?? 'SAS');
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
      const falloff = def.pellets > 1 ? THREE.MathUtils.clamp(1 - (ph.dist - 7) / 25, 0.25, 1) : ph.dist > 45 ? 0.75 : 1;
      const dmg = def.dmg * (PVP_DMG[def.id] ?? 1) * (ph.head ? 2 : 1) * falloff;
      this.emit('impactPlayer', { point: ph.point, normal: dir.clone().negate() });
      const res = this.hitPlayer(ph.player, dmg, origin, 'bullet', null, { by: player, weapon: def.id, head: ph.head });
      if (res === 'hit') this.emit('hitConfirm', { pid: player.id, head: ph.head });
      return { point: ph.point, player: ph.player };
    }
    if (eh && def.pierceAll) {
      // the railgun: through every enemy on its line, up to the wall
      // (each one once: two bodies overlapping would otherwise send the ray back and forth forever)
      let at = eh, from = origin, done = 0;
      const pierced = new Set();
      while (at) {
        pierced.add(at.enemy);
        this.#hitEnemy(player, { ...at, dist: done + at.dist }, dir, def, 1);
        done += at.dist;
        from = at.point;
        at = this.enemies.raycast(from, dir, maxD - done, pierced);
      }
      if (wh) this.emit('impactWall', { point: wh.point, normal: wh.normal });
      return { point: wh ? wh.point : origin.clone().addScaledVector(dir, 250), enemy: eh.enemy };
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

  // A weapon that fires a ball (def.ball): it flies with gravity and blows up on what it meets.
  fireBall(player, def, spread) {
    player.protect = 0;
    const q = player.aimQuaternion();
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const dir = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, -1).normalize().applyQuaternion(q);
    const pos = player.eye.addScaledVector(dir, 0.6);
    const vel = dir.multiplyScalar(def.ball.speed);
    this.grenades.push({ id: this.nextId(), kind: 'ball', pos, vel, fuse: Infinity, owner: player, ball: def.ball });
    this.emit('playerShot', { pid: player.id, weapon: def.id, origin: player.eye, points: [] });
  }

  // The flamethrower: everything in a short cone in front catches fire (direct damage, then a burn
  // that goes on for a few seconds); an oxygen bottle in the flames blows up.
  fireFlame(player, def) {
    player.protect = 0;
    const F = def.flame, eye = player.eye;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(player.aimQuaternion());
    const cos = Math.cos(F.angle);
    const inCone = (c, r) => {
      const to = c.clone().sub(eye);
      const d = to.length();
      return d <= F.range + r && (d < r + 0.5 || to.divideScalar(d).dot(fwd) >= cos) && this.level.lineOfSight(eye, c);
    };
    let hit = false;
    for (const e of [...this.enemies.list]) {
      if (e.rise > 0.5 || e.hidden || e.submerged) continue;
      if (!inCone(e.pos.clone().setY(e.pos.y + e.lift + e.T.height * 0.5), e.T.radius)) continue;
      hit = true;
      e.burn = { t: F.burn, dps: F.burnDps, by: player, acc: 0 };
      this.enemies.damage(e, def.dmg, fwd, player, 'fire');
    }
    for (const k of this.kegs) if (k.alive && k.fuse === null && inCone(k.pos.clone().setY(k.pos.y + 0.5), KEG.radius)) this.blowKeg(k, player);
    if (hit) this.emit('hitConfirm', { pid: player.id, head: false });
    this.emit('playerShot', { pid: player.id, weapon: def.id, origin: eye, points: [], dir: fwd });
  }

  // burning enemies lose health every quarter of a second until the fire dies down
  #updateBurns(dt) {
    for (const e of [...this.enemies.list]) {
      const b = e.burn;
      if (!b) continue;
      b.t -= dt;
      b.acc += dt;
      if (b.acc >= 0.25 || b.t <= 0) {
        this.enemies.damage(e, b.dps * b.acc, null, this.players.has(b.by.id) ? b.by : null, 'fire');
        b.acc = 0;
      }
      if (b.t <= 0) e.burn = null;
    }
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

  // ---------- airlocks ----------
  // the use key pressed (not held) next to a lever works its airlock
  #useLever(p, cmd) {
    const press = cmd.use && !p.useHeld;
    p.useHeld = cmd.use;
    if (!press) return;
    for (const a of this.airlocks) {
      if (a.cd > 0 || Math.hypot(a.lever.x - p.pos.x, a.lever.z - p.pos.z) > AIRLOCK.use || Math.abs(a.lever.y - p.pos.y) > 2) continue;
      this.setAirlock(a, !a.open, p);
      return;
    }
  }

  // by: the player who opened it, credited with what goes out
  setAirlock(a, open, by = null) {
    if (a.open === open) return;
    a.open = open;
    a.t = open ? AIRLOCK.dur : 0;
    if (!open) a.blown = null; // shut: no longer a breach of the airlocks objective
    a.by = open ? by : null;
    a.cd = AIRLOCK.cooldown;
    this.level.setDoor(a.id, open);
    this.emit('airlock', { id: a.id, open, pos: a.center.clone() });
    const T = this.world.texts;
    this.emit('banner', { title: '', sub: open ? T.airlockOpen ?? 'Sas ouvert !' : T.airlockClosed ?? 'Sas refermé', duration: 1.8 });
  }

  #updateAirlocks(dt) {
    this.#updateBreaches(dt);
    // the Queen's breach: one airlock after the other blows open
    const B = this.breached;
    if (B && this.airlocks.length) {
      B.t -= dt;
      if (B.t <= 0) {
        B.t = BREACH.every;
        const a = this.airlocks[B.next++ % this.airlocks.length];
        this.setAirlock(a, true);
        a.t = BREACH.open;
      }
    }
    for (const a of this.airlocks) {
      a.cd = Math.max(0, a.cd - dt);
      if (!a.open) continue;
      a.t -= dt;
      if (a.t <= 0) { this.setAirlock(a, false); continue; } // it closes by itself
      for (const p of this.players.values()) {
        if (p.dead || !this.#suck(a, p.pos, PLAYER_RADIUS, PLAYER_HEIGHT, dt)) continue;
        this.hitPlayer(p, 9999, a.center, 'explosion', null, a.by && a.by !== p ? { by: a.by, weapon: 'airlock' } : null);
      }
      for (const e of [...this.enemies.list]) {
        // what keeps to its spot (a boss, a turret) holds on
        if (e.T.stay || e.T.part || e.T.boss || e.hidden || e.latched) continue;
        if (this.#suck(a, e.pos, e.T.radius, e.T.height, dt)) this.enemies.space(e, a.by && this.players.has(a.by.id) ? a.by : null);
      }
    }
  }

  // The airlocks objective: now and then a closed airlock blows open and stays open until a player
  // shuts it with its lever; one left open longer than `close` s fails the objective for everyone.
  #updateBreaches(dt) {
    const B = this.breaches;
    if (!B) return;
    for (const a of this.airlocks) {
      if (a.blown == null) continue;
      a.blown += dt;
      if (a.blown > B.close && !a.late) {
        a.late = true;
        for (const p of this.players.values()) p.waveStats.breachLate++;
        this.emit('banner', { title: '', sub: this.world.texts.breachLate, duration: 2.5 });
      }
    }
    B.t -= dt;
    if (B.t > 0) return;
    B.t = B.every[0] + Math.random() * (B.every[1] - B.every[0]);
    const shut = this.airlocks.filter((a) => !a.open);
    if (!shut.length) return;
    const a = shut[Math.floor(Math.random() * shut.length)];
    this.setAirlock(a, true);
    a.t = Infinity; // until someone pulls the lever
    a.blown = 0;
    a.late = false;
    this.emit('banner', { title: '', sub: this.world.texts.breachBlow, duration: 3 });
    this.emit('horn', { victory: false });
  }

  // seconds left to shut the airlock blown longest ago, or null when none is open
  breachLeft() {
    const open = this.airlocks.filter((a) => a.blown != null && !a.late);
    return open.length ? Math.max(0, this.breaches.close - Math.max(...open.map((a) => a.blown))) : null;
  }

  // the wave is over: the blown airlocks close
  endBreaches() {
    if (!this.breaches) return;
    this.breaches = null;
    for (const a of this.airlocks) if (a.blown != null) this.setAirlock(a, false);
  }

  // Drags a body in sight of an open airlock towards it, harder the closer it is; true once it
  // has gone past the door.
  #suck(a, pos, r, h, dt) {
    const dx = a.center.x - pos.x, dz = a.center.z - pos.z, d = Math.hypot(dx, dz);
    const reach = a.reach * (this.breached ? BREACH.reachMul : 1);
    if (d > reach) return false;
    const from = a.center.clone().setY(1.2);
    if (d > 1.5 && !this.level.lineOfSight(from, pos.clone().setY(pos.y + 1.2))) return false;
    // aimed past the door, so a body at the door goes on through
    const out = a.center.clone();
    out[a.axis] += a.sign * 3;
    const tx = out.x - pos.x, tz = out.z - pos.z, tl = Math.hypot(tx, tz) || 1;
    const step = AIRLOCK.pull * Math.pow(1 - d / reach, 0.7) * dt;
    this.level.moveBody(pos, (tx / tl) * step, (tz / tl) * step, r, h);
    return (pos[a.axis] - a.center[a.axis]) * a.sign > 0;
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
    const falloff = def.pellets > 1 ? THREE.MathUtils.clamp(1 - (eh.dist - 7) / 25, 0.25, 1) : eh.dist > 45 ? 0.75 : 1;
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
      this.enemies.damage(e, cfg.enemyDmg * k * (e.T.blastMul ?? 1), e.pos.clone().sub(pos).normalize(), killer);
    }
  }

  // ---------- grenades ----------
  throwGrenade(player) {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(player.aimQuaternion());
    if (this.world.grenade === 'mine') {
      const pos = player.eye.addScaledVector(dir, 0.45).add(new THREE.Vector3(0, -0.15, 0));
      const vel = dir.multiplyScalar(MINE.speed).add(new THREE.Vector3(0, MINE.lift, 0)).addScaledVector(player.vel, 0.5);
      this.grenades.push({ id: this.nextId(), kind: 'mine', pos, vel, fuse: MINE.life, owner: player, stuck: false, armed: -1, normal: null, on: null });
      return;
    }
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
      if (g.kind === 'mine' && this.#updateMine(g, dt)) { this.grenades.splice(i, 1); this.#grenadeBlast(g); continue; }
      if (g.stuck) continue;
      g.vel.y -= (g.ball ? g.ball.gravity : GRAVITY_GRENADE) * dt;
      const step = g.vel.clone().multiplyScalar(dt);
      const len = step.length();
      if (len < 1e-6) continue;
      const dir = step.clone().divideScalar(len);
      const hit = this.level.raycast(g.pos, dir, len + (g.ball ? BALL_SIZE : GRENADE.size));
      if (g.ball) {
        // the first thing on its way: a wall, an enemy, a keg (or a player in the arena)
        let d = hit ? hit.dist : len + BALL_SIZE;
        const eh = this.enemies.raycast(g.pos, dir, d);
        if (eh) d = eh.dist;
        const ph = this.pvp ? this.#raycastPlayers(g.pos, dir, d, g.owner) : null;
        if (ph) d = ph.dist;
        const kh = this.#raycastKegs(g.pos, dir, d);
        if (kh) d = kh.dist;
        const struck = eh || ph || kh || hit;
        if (!struck && g.pos.y > -20) { g.pos.add(step); continue; }
        this.grenades.splice(i, 1);
        g.pos.addScaledVector(dir, Math.max(0, d - BALL_SIZE));
        if (eh && !ph && !kh) this.#hitEnemy(g.owner, { ...eh, head: false }, dir, { dmg: g.ball.hit, pellets: 1 }, 1);
        this.#grenadeBlast(g);
        continue;
      }
      if (g.kind === 'mine') {
        // it sticks to the first enemy or surface on its way
        const eh = this.enemies.raycast(g.pos, dir, hit ? hit.dist : len + GRENADE.size);
        if (eh) {
          g.stuck = true;
          g.on = eh.enemy;
          g.offset = eh.point.clone().sub(eh.enemy.pos);
          g.normal = dir.clone().negate();
          g.pos.copy(eh.point);
          g.armed = MINE.fuse; // on an enemy, it goes off after its fuse
          this.emit('mineStick', { pos: g.pos.clone(), enemy: true });
        } else if (hit) {
          g.stuck = true;
          g.normal = hit.normal.clone();
          g.pos.copy(hit.point).addScaledVector(hit.normal, 0.02);
          g.armed = MINE.arm;
          this.emit('mineStick', { pos: g.pos.clone(), enemy: false });
        } else g.pos.add(step);
        continue;
      }
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

  // a stuck mine: rides on its enemy, arms, then waits for an enemy to come near; true when it goes off
  #updateMine(g, dt) {
    if (!g.stuck) return false;
    if (g.on) {
      if (this.enemies.list.includes(g.on)) g.pos.copy(g.on.pos).add(g.offset);
      g.armed -= dt;
      return g.armed <= 0;
    }
    if (g.armed > 0) { g.armed -= dt; return false; }
    for (const e of this.enemies.list) {
      if (e.rise > 0.5 || e.hidden || e.submerged) continue;
      const c = e.pos.clone().setY(e.pos.y + e.lift + e.T.height * 0.5);
      if (c.distanceTo(g.pos) < MINE.trigger + e.T.radius) return true;
    }
    return false;
  }

  #grenadeBlast(g) {
    const owner = this.players.has(g.owner.id) ? g.owner : null;
    const cfg = g.ball ?? (g.kind === 'mine' ? MINE : { radius: GRENADE.radius, dmg: GRENADE.dmg, playerDmg: GRENADE.playerDmg });
    this.#blast(g.pos.clone(), cfg, owner, g.ball ? 'ball' : 'grenade');
  }

  // A fire pot, a cannon ball or a powder keg going off (kind 'grenade', 'ball' or 'keg'): walls shelter from it.
  #blast(pos, cfg, owner, kind) {
    const R = cfg.radius;
    this.emit('explosion', { pos: pos.clone(), radius: R, kind });
    this.#lightKegs(pos, R, owner);
    const from = pos.clone().setY(pos.y + 0.3);
    const exposed = (p) => this.level.lineOfSight(from, p);
    for (const e of [...this.enemies.list]) {
      if (e.rise > 0.5 || e.hidden || e.submerged) continue;
      const c = e.pos.clone().setY(e.pos.y + e.lift + e.T.height * 0.5);
      const d = c.distanceTo(pos);
      if (d > R + e.T.radius || !exposed(c)) continue;
      const k = 1 - Math.min(1, d / (R + e.T.radius)) * 0.6;
      e.knock.copy(e.pos).sub(pos).setY(0).normalize().multiplyScalar(e.T.big ? 3 : 10);
      // a blast scatters a swarm of bats (blastMul) much more than it hurts a single body
      this.enemies.damage(e, cfg.dmg * k * (e.T.blastMul ?? 1), e.pos.clone().sub(pos).normalize(), owner, kind);
    }
    // the thrower is hurt by their own pot or ball, other players only in the arena; a keg hurts everyone near
    for (const p of this.alivePlayers()) {
      if (kind !== 'keg' && p !== owner && !this.pvp) continue;
      const d = p.center.distanceTo(pos);
      if (d > R || !exposed(p.center)) continue;
      const k = 1 - (d / R) * 0.6;
      this.hitPlayer(p, cfg.playerDmg * k, pos, 'explosion', null, owner ? { by: owner, weapon: kind } : null);
      p.impulse(p.pos.clone().sub(pos).setY(0).normalize().multiplyScalar(8 * k).add(new THREE.Vector3(0, 3.5 * k, 0)));
    }
  }

  // The Kraken's last phase: it smashes the pier nearest the player. Anyone out on it is thrown
  // into the shallows, and a barrier closes the gap it leaves in the deep water's edge.
  breakPier(kraken, player) {
    const piers = kraken.T.kraken.piers;
    const [x0, x1] = piers.reduce((best, p) => Math.abs((p[0] + p[1]) / 2 - player.pos.x) < Math.abs((best[0] + best[1]) / 2 - player.pos.x) ? p : best);
    const rect = { minX: x0 - 0.3, maxX: x1 + 0.3, minZ: 18, maxZ: 38.5, maxY: 3.3 };
    this.level.breakArea(rect, [[x0, 0, 30, x1, 3, 31]]);
    for (const p of this.players.values()) {
      if (p.pos.x < rect.minX || p.pos.x > rect.maxX || p.pos.z < rect.minZ) continue;
      p.pos.set((x0 + x1) / 2, Math.max(p.pos.y, 1), Math.min(p.pos.z, 27));
      p.impulse(new THREE.Vector3(0, 4, -3));
    }
    this.emit('pierBreak', rect);
    this.emit('banner', { title: '', sub: this.world.texts.bossPier, duration: 2.5 });
    this.emit('horn', { victory: false });
  }

  // The Hive Queen at half health: the power goes, the station is dark but for the red alarm
  // (and the torches, forced on: see 'power' in src/main.js).
  powerCut(queen) {
    this.power = false;
    this.emit('power', { on: false, pos: queen.pos.clone() });
    this.emit('banner', { title: '', sub: this.world.texts.bossPower, duration: 2.5 });
    this.emit('horn', { victory: false });
  }

  // At a third: she blows the airlocks; from now on they open by turns and pull harder (BREACH).
  breach(queen) {
    this.breached = { t: 0, next: 0 };
    this.emit('banner', { title: '', sub: this.world.texts.bossBreach, duration: 2.5 });
    this.emit('horn', { victory: false });
  }

  // the Queen is dead: the lights come back, the airlocks stop blowing (an open one closes on its own)
  hiveDown() {
    this.breached = null;
    if (!this.power) {
      this.power = true;
      this.emit('power', { on: true });
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

  // The Hive Queen spits at the ceiling: acid drips down on red circles round each player, one of them
  // where the player is heading (R: her rain settings, see `queen.rain` in src/worlds/station.js).
  acidRain(queen, R) {
    const dmg = R.dmg * this.enemies.dmgMul;
    for (const p of this.alivePlayers()) {
      const spots = [p.pos.clone().addScaledVector(p.vel.clone().setY(0), R.delay)];
      for (let i = 1; i < R.drops; i++) {
        const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 4.5;
        spots.push(p.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)));
      }
      spots.forEach((s, i) => {
        s.y = this.level.groundAt(s.x, s.z, 0.5, p.pos.y + 0.6);
        const strike = { id: this.nextId(), pos: s, radius: R.radius, dmg, t: R.delay + i * 0.12, kind: 'acid' };
        this.strikes.push(strike);
        this.emit('rainMark', { id: strike.id, pos: s.clone(), radius: strike.radius, delay: strike.t, kind: 'acid' });
      });
    }
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

  // A ball lobbed from `from` (the ghost gunner's swivel gun) onto where the player is heading: its
  // shadow on the ground shows where it falls, and it lands after a flight that grows with distance.
  lob(from, player, R, dmgMul) {
    const flight = THREE.MathUtils.clamp(from.distanceTo(player.pos) / R.speed, 1.1, 2.4);
    const pos = player.pos.clone().addScaledVector(player.vel.clone().setY(0), flight * 0.5);
    pos.y = this.level.groundAt(pos.x, pos.z, 0.5, player.pos.y + 0.6);
    // ink: the Kraken's, a blob that blinds whoever it lands on for that many seconds
    const strike = { id: this.nextId(), pos, radius: R.radius, dmg: R.dmg * dmgMul, t: flight, kind: 'lob', ink: R.ink ?? 0 };
    this.strikes.push(strike);
    this.emit('rainMark', { id: strike.id, pos: pos.clone(), radius: strike.radius, delay: flight, from: from.clone(), kind: 'lob', ink: strike.ink > 0 });
  }

  #updateStrikes(dt) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      if (s.t > 0) continue;
      this.strikes.splice(i, 1);
      this.emit('rainStrike', { id: s.id, pos: s.pos.clone(), radius: s.radius, kind: s.kind, ink: s.ink > 0 });
      if (s.kind === 'lob' && !s.ink) this.#lightKegs(s.pos, s.radius, null);
      for (const p of this.alivePlayers()) {
        const d = Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z);
        if (d < s.radius && Math.abs(p.pos.y - s.pos.y) < 2.5) {
          this.hitPlayer(p, s.dmg, s.pos, 'explosion');
          if (s.ink) { p.ink = Math.max(p.ink, s.ink); this.emit('inked', { pid: p.id }); }
        }
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
      this.emit('meleeImpact', { point: e.pos.clone().setY(base + e.T.height * 0.55), normal: to.clone().negate(), fwd: fwd.clone(), enemyType: e.type, shock: !!def.shock });
      this.enemies.meleeHit(e, def.dmg * m.swordDmg, to, player);
      // the electric baton: a shock that leaves the enemy twitching on the spot
      if (def.shock && !e.T.boss && this.enemies.list.includes(e)) e.stun = Math.max(e.stun, e.T.big ? def.shock * 0.4 : def.shock);
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
    if (player.loadout.blocking && kind !== 'explosion' && kind !== 'bullet' && kind !== 'latch') {
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
      // the Kraken, out in the deep water, calls its crew from the land
      this.enemies.spawn(boss.T.summon, boss.T.kraken ? this.pickSpawn(boss.T.summon) : p);
    }
    this.emit('banner', { title: '', sub: this.world.texts.bossSummon, duration: 2 });
    this.emit('horn', { victory: false });
  }

  // A spot a little way from `at` for another member of a group, on open ground of the playable world
  // at about the same height (never in a wall, off a deck, or past the edge of the map); else `at`.
  spreadAround(at, type, spread = 2.5) {
    const nav = this.level.nav, T = this.world.enemies[type];
    const layer = T.climber ? 'climb' : T.radius > 0.6 ? 'big' : 'small'; // big bodies keep clear of walls
    for (let i = 0; i < 8; i++) {
      const x = at.x + (Math.random() - 0.5) * spread, z = at.z + (Math.random() - 0.5) * spread;
      if (!nav.inWorld(x, z, layer, 0) || this.level.occupied(x, z, T.radius)) continue;
      if (Math.abs(nav.floorAt(x, z) - nav.floorAt(at.x, at.z)) > 0.3) continue;
      return new THREE.Vector3(x, at.y, z);
    }
    return at.clone();
  }

  // Most enemies rise from the sand inside the city, out of every player's sight; the rest come through the gates.
  // Some types have their own places: a post of the universe (the gunners on the galleon's deck), or
  // a stretch of shallow water (the crab comes out of the sea).
  pickSpawn(type) {
    const D = this.difficulty;
    const players = this.alivePlayers();
    const T = this.world.enemies[type];
    if (T.kraken) return new THREE.Vector3(...T.kraken.anchor); // out in the deep water, between the piers
    if (T.queen) return new THREE.Vector3(...T.queen.anchor); // on the reactor
    // the gates this kind comes through, when the universe says (the station: crew from the
    // quarters and labs, parasites from the nests, brutes from the hangar, drones from their docks)
    const gates = this.world.spawnGates?.[type]?.map((n) => this.level.spawns[n - 1]).filter(Boolean);
    if (T.post && this.world.posts?.length) {
      const free = this.world.posts.filter(([x, , z]) => !this.enemies.list.some((e) => e.T.post && Math.hypot(e.pos.x - x, e.pos.z - z) < 1.5));
      const pool = free.length ? free : this.world.posts;
      return new THREE.Vector3(...pool[Math.floor(Math.random() * pool.length)]);
    }
    // flyers come over the cliffs: a gate, high up (under the station's ceilings, not so high)
    if (T.fly) {
      const pool = gates?.length ? gates : this.level.spawns;
      const s = pool[Math.floor(Math.random() * pool.length)].clone();
      s.y += T.fly.spawn ?? 6;
      return s;
    }
    // duct crawlers come out of a vent not too close to the players, nor too far
    if (T.vent && this.level.vents.length) {
      const vents = this.level.vents;
      const ok = vents.filter((v) => players.every((pl) => v.out.distanceTo(pl.pos) > 6) && players.some((pl) => v.out.distanceTo(pl.pos) < 26));
      const pool = ok.length ? ok : vents;
      return pool[Math.floor(Math.random() * pool.length)].out.clone();
    }
    if (T.fromWater) {
      const p = this.level.nav.ambushPoint(8, 80, (c) => this.level.inWater(c.x, c.z, 0) && players.every((pl) => c.distanceTo(pl.pos) > 9), T.fromWater);
      if (p) return p;
    }
    if (type !== 'boss' && !gates?.length && Math.random() < D.ambush) {
      const p = this.level.nav.ambushPoint(D.ambushMin, 44, (c) => players.every((pl) =>
        c.distanceTo(pl.pos) > 14 && !this.level.lineOfSight(c.clone().setY(1.6), pl.eye)));
      if (p) return p;
    }
    const minDist = (s) => Math.min(...players.map((pl) => s.distanceTo(pl.pos)));
    // only the gates this body can walk out of: a big one (the boss, a crab) does not fit through the
    // treasure cave or down the galleon's stairs
    const nav = this.level.nav;
    const layer = nav.layers[T.climber ? 'climb' : T.radius > 0.6 ? 'big' : 'small'];
    const all = gates?.length ? gates : this.level.spawns;
    const open = all.filter((s) => layer.dist[nav.index(s.x, s.z)] < Infinity);
    const usable = open.length ? open : all;
    const far = usable.filter((s) => minDist(s) > 25);
    const pool = far.length ? far : usable;
    const s = pool[Math.floor(Math.random() * pool.length)].clone();
    // a little spread around the gate, unless that would put the body in a wall
    return this.spreadAround(s, type, 3);
  }
}
