import * as THREE from 'three';
import { WATER_SLOW, EYE } from './constants.js';

// Enemy rules. Each universe gives its enemy types (src/worlds/); colours and models are the
// client's business (see src/view/enemyView.js).

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _h = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const rand = (a, b) => a + Math.random() * (b - a);

export class Enemies {
  constructor(sim) {
    this.sim = sim;
    this.level = sim.level;
    this.list = [];
    this.projectiles = [];
    this.pickups = [];
    this.wave = 1;
    this.clock = 0;
  }

  get D() { return this.sim.difficulty; }

  // Each wave makes enemies tougher, faster and harder hitting.
  setWave(wave) { this.wave = wave; }
  get hpMul() { return 1 + this.D.hpPerWave * (this.wave - 1); }
  get speedMul() { return this.D.speed * (1 + this.D.speedPerWave * (this.wave - 1)); }
  get dmgMul() { return this.D.dmg * (1 + this.D.dmgPerWave * (this.wave - 1)); }

  // opts.elite: golden elite — twice the health, faster, harder hitting, always drops something
  spawn(type, position, opts = {}) {
    const T = this.sim.world.enemies[type];
    const elite = !!opts.elite;
    const hp = T.hp * this.hpMul * (elite ? 2 : 1) * (T.boss ? this.sim.playerScale : 1);
    const e = {
      id: this.sim.nextId(),
      type, T, elite,
      pos: position.clone(),
      hp, maxHp: hp,
      facing: Math.random() * Math.PI * 2,
      phase: Math.random() * 10,
      speed: 0,
      rise: T.fly ? 0 : 1.0, // flyers come in through the air instead of rising from the ground
      act: null, // current attack: { kind, t, dur, ... }
      attackCd: rand(0.3, 0.8),
      fireCd: rand(0.8, 1.6),
      leapCd: rand(0.5, 1.5),
      chargeCd: rand(1, 2.5),
      slamCd: 3,
      songCd: rand(1, 2.5),
      losTimer: Math.random() * 0.2,
      hasLos: false,
      target: null,
      strafe: Math.random() < 0.5 ? 1 : -1,
      strafeTimer: rand(1, 2.5),
      stun: 0,
      knock: new THREE.Vector3(),
      lift: 0,
      stuckCheck: 0.8,
      stuckFrom: position.clone(),
      unstick: 0,
      unstickDir: new THREE.Vector3(),
      summoned: 0,
      engagedUntil: 0,
      climbing: false,
      hidden: false, // the pharaoh between two points of a teleport
      phase2: false,
      rainCd: 0,
      teleportCd: 0,
      exploded: false,
      lost: 0, // seconds spent outside the playable world (see #think)
      trapClock: 0, // and the check that it still gets somewhere: where it stood a few seconds ago
      trapFrom: position.clone(),
    };
    // a duct crawler comes out of the vent it was given (Sim#pickSpawn)
    if (T.vent) {
      const v = this.level.vents.find((o) => o.out.distanceTo(position) < 0.6);
      if (v) this.#emerge(e, v);
    }
    // while the chest is to be protected, some of the enemies that can loot go for it
    if (T.loot && this.sim.chest && Math.random() < this.sim.chest.looters) e.looter = true;
    this.list.push(e);
    this.sim.emit('enemySpawn', { id: e.id, enemyType: type, pos: position.clone(), elite });
    if (T.queen) {
      // the Hive Queen wakes on the reactor with a roar (she cannot be hurt meanwhile), her egg sacs
      // already round the room
      e.rise = 0;
      e.stage = 1;
      e.parts = [];
      e.layT = T.queen.layEvery;
      e.facing = Math.PI; // towards the hangar, where the tunnels from the boss gate come in
      e.act = { kind: 'transform', t: 0, dur: T.queen.roar };
      for (let i = 0; i < T.queen.sacs; i++) this.#laySac(e, false);
    }
    if (T.kraken) {
      // the body stays under the water at first; its tentacles rise around the quay
      e.submerged = true;
      e.stage = 1;
      e.parts = [];
      e.summonT = T.kraken.summonEvery;
      for (let i = 0; i < T.kraken.tentacles; i++) {
        const t = this.spawn(T.kraken.tentacle, this.#tentacleSpot(e, null));
        t.owner = e;
        t.rise = 1 + i * 0.4; // one after the other
        e.parts.push(t);
      }
    }
    return e;
  }

  // the parts of a boss (the Kraken's tentacles) do not count as enemies left
  get alive() { return this.list.reduce((n, e) => n + (e.T.part ? 0 : 1), 0); }
  // how much of the spawn limit the living enemies use (scarabs are light)
  get load() { return this.list.reduce((s, e) => s + (e.T.load ?? 1), 0); }
  get boss() { return this.list.find((e) => e.T.boss) || null; }

  // ---------- player attacks ----------
  // skip: one enemy, or a Set of them (the railgun, through a whole line)
  raycast(origin, dir, maxDist, skip = null) {
    let best = null;
    for (const e of this.list) {
      // a parasite on a player's face is out of the line of fire (only a blow knocks it off)
      if (e === skip || skip?.has?.(e) || e.hidden || e.submerged || e.diving || e.latched) continue;
      const base = e.pos.y + e.lift - e.rise * e.T.height;
      const t = rayCylinder(origin, dir, e.pos, e.T.radius, base, base + e.T.height);
      if (t !== null && t < maxDist && (!best || t < best.dist)) {
        const point = origin.clone().addScaledVector(dir, t);
        const head = point.y - base > e.T.headY;
        best = { enemy: e, dist: t, point, head };
      }
      // parts of a big body out past its cylinder (the Queen's head, reaching out from the column)
      for (const h of e.T.hits ?? []) {
        const c = Math.cos(e.facing), s = Math.sin(e.facing);
        const at = _h.set(e.pos.x + h.at[0] * c + h.at[2] * s, base + h.at[1], e.pos.z - h.at[0] * s + h.at[2] * c);
        const th = raySphere(origin, dir, at, h.r);
        if (th !== null && th < maxDist && (!best || th < best.dist)) best = { enemy: e, dist: th, point: origin.clone().addScaledVector(dir, th), head: !!h.head };
      }
    }
    return best;
  }

  // cause: 'ranged' (bullets, reflected orbs) or 'melee' (khépesh) — only melee kills drop health
  damage(e, amount, dir, killer, cause = 'ranged') {
    if (e.hidden || e.act?.kind === 'transform') return; // the pharaoh cannot be hurt while changing or teleporting
    if (e.diving) return; // a cut tentacle going back under
    // the Hive Queen: shut in her carapace nothing gets through; broken open, she takes double
    if (e.act?.kind === 'guard') { this.sim.emit('enemyHit', { id: e.id, armored: true, pos: e.pos.clone() }); return; }
    if (e.act?.kind === 'exposed' && e.T.queen) amount *= e.T.queen.exposedMul;
    if (e.act?.kind === 'hold' && e.T.queen) e.act.taken += amount;
    // a shell in front (the crab): blows that come at its face lose most of their force
    const A = e.T.armor;
    const armored = !!(A && dir && -(Math.sin(e.facing) * dir.x + Math.cos(e.facing) * dir.z) / (Math.hypot(dir.x, dir.z) || 1) > A.arc);
    if (armored) amount *= A.mul;
    e.hp -= amount;
    this.sim.emit('enemyHit', { id: e.id, armored, pos: armored ? e.pos.clone() : undefined });
    if (e.T.tentacle) {
      // a tentacle is never killed: cut, or hurt enough to let go of a player, it dives
      if (e.act?.kind === 'hold') e.act.taken += amount;
      if (e.hp <= 0 || (e.act?.kind === 'hold' && e.act.taken >= e.T.grab.free)) this.#cut(e, killer);
      return;
    }
    if (e.hp <= 0) this.#kill(e, dir, killer, cause);
  }

  // sucked out of an airlock: gone, whatever its health
  space(e, killer) {
    if (this.list.includes(e)) this.#kill(e, null, killer, 'airlock');
  }

  // sword hit: damage plus knockback and a short stagger that cancels attacks
  meleeHit(e, amount, dir, killer) {
    if (e.latched) this.release(e, 8); // knocked off the face
    const big = !!e.T.big;
    e.knock.copy(dir).setY(0).normalize().multiplyScalar(big ? (e.T.boss ? 1 : 3) : 9);
    if (!e.T.boss) {
      e.stun = big ? 0.25 : 0.55;
      if (e.act && e.act.kind !== 'charge') e.act = null;
    }
    this.damage(e, amount, dir, killer, 'melee');
  }

  // perfect: parried at the last moment, the orb comes back even harder
  reflect(p, by, perfect = false) {
    if (p.reflected) return;
    p.reflected = true;
    p.reflectedBy = by;
    p.life = 3;
    const owner = this.list.find((e) => e.id === p.ownerId);
    const speed = p.vel.length() * 1.4;
    if (owner) p.vel.subVectors(owner.pos.clone().setY(owner.pos.y + owner.T.height * 0.6), p.pos).normalize().multiplyScalar(speed);
    else p.vel.multiplyScalar(-1.4);
    p.dmg *= perfect ? 6 : 4;
    this.sim.emit('reflect', { id: p.id, pos: p.pos.clone(), pid: by?.id ?? null, perfect });
  }

  #kill(e, dir, killer, cause) {
    const i = this.list.indexOf(e);
    if (i < 0) return;
    this.list.splice(i, 1);
    // the Kraken's tentacles go with it
    for (const t of e.parts ?? []) {
      this.#release(t);
      const j = this.list.indexOf(t);
      if (j >= 0) this.list.splice(j, 1);
    }
    if (e.latched) this.release(e);
    if (e.act?.kind === 'hold') this.#release(e); // the Queen dead with a player in her tail's grip
    this.sim.emit('enemyKill', { id: e.id, enemyType: e.type, pos: e.pos.clone(), dir: dir ? dir.clone() : null, cause, killer: killer?.id ?? null });
    if (killer) {
      killer.stats.kills++;
      this.sim.scoreKill(killer, e, cause);
      this.sim.registerKill(killer, false);
      if (cause === 'keg') killer.waveStats.kegKills++;
      if (cause === 'melee') {
        killer.waveStats.meleeKills++;
        if (killer.mods.lifesteal && !killer.dead) killer.health = Math.min(killer.maxHealth, killer.health + killer.mods.lifesteal);
      }
    }
    if (e.T.queen) this.sim.hiveDown();
    if (e.T.boss && this.sim.weather !== 'clear' && !this.list.some((o) => o.T.boss)) {
      this.sim.weather = 'clear';
      this.sim.emit('weather', { kind: 'clear' });
    }
    if (e.T.explode && !e.exploded) {
      e.exploded = true;
      this.sim.explode(e.pos.clone().setY(e.pos.y + 1), e.T.explode, killer);
    }
    // an infected host: what grew inside it sometimes comes out of the body
    const B = e.T.burst;
    if (B && cause !== 'airlock' && Math.random() < B.chance) {
      const out = this.spawn(B.type, e.pos);
      out.rise = 0;
      out.stun = 0.4;
      this.sim.emit('burst', { pos: e.pos.clone().setY(e.pos.y + e.T.height * 0.6), enemyType: e.type });
    }
    if (!e.T.boss && cause !== 'self' && cause !== 'airlock') { // nothing drops in the void
      // health only rewards blade kills; ammo can drop either way; elites always drop something
      const luck = killer?.mods.drops ?? 1; // the "Pillard" card
      const always = !!this.sim.mode.alwaysDrop; // the arena: every guardian leaves something
      const healthDrop = cause === 'melee' ? (e.elite || always || Math.random() < (e.T.big ? 1 : 0.5) * luck) : always && Math.random() < 0.5;
      if (healthDrop) this.#dropPickup(e.pos, 'health');
      else if (e.elite || always || Math.random() < (e.T.big ? 0.9 : 0.3) * luck) this.#dropPickup(e.pos, 'ammo');
    }
  }

  #dropPickup(pos, kind) {
    this.pickups.push({ id: this.sim.nextId(), kind, life: 30, pos: pos.clone().setY(pos.y + 0.6) });
  }

  // ---------- frame update ----------
  update(dt) {
    const players = this.sim.alivePlayers();
    if (!players.length) return;
    this.level.nav.update(dt, players.map((p) => p.pos));

    // only a few enemies may strike at once; the others circle and wait for an opening
    // (a slot is held for the whole attack cycle, cooldown included)
    this.clock += dt;
    this.maxMelee = this.D.maxMelee(this.wave);
    this.meleeActive = this.list.filter((e) => !e.T.big && e.engagedUntil > this.clock).length;

    // a siren's song: each one singing adds its pull; the charm grows while a song is heard and fades after
    for (const p of players) { p.hearing = false; p.drift.set(0, 0, 0); }
    for (const e of this.list) this.#think(e, dt, players);
    for (const p of players) {
      const rise = p.hearing ? p.hearing.rise : 1;
      p.charm = p.hearing ? Math.min(1, p.charm + dt / rise) : Math.max(0, p.charm - dt * 0.7);
      p.drift.multiplyScalar(p.charm);
    }

    this.#updateProjectiles(dt);
    this.#updatePickups(dt);
  }

  #nearest(e, players) {
    let best = players[0], bd = Infinity;
    for (const p of players) {
      const d = p.pos.distanceToSquared(e.pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  #think(e, dt, players) {
    const T = e.T;
    if (T.kraken) return this.#kraken(e, dt, players);
    if (T.queen) return this.#queen(e, dt, players);
    if (T.eggs) return this.#eggSac(e, dt);
    if (e.latched) return this.#latch(e, dt);
    // the duct crawler: hurt, it goes back into the nearest vent, and comes out of another later
    if (T.vent) {
      if (e.ventHide > 0) return this.#inDuct(e, dt, players);
      if (e.fleeTo) return this.#flee(e, dt);
      if (!e.fled && !e.act && e.stun <= 0 && e.hp < e.maxHp * T.vent.retreat && this.level.vents.length) {
        e.fled = true;
        e.fleeTo = this.level.vents.reduce((a, b) => (a.out.distanceToSquared(e.pos) < b.out.distanceToSquared(e.pos) ? a : b));
        return this.#flee(e, dt);
      }
    }
    if (T.tentacle) return this.#tentacle(e, dt, players);
    if (e.rise > 0) {
      e.rise = Math.max(0, e.rise - dt * 1.3);
      e.speed = 0;
      return;
    }
    // a body that ended up out of the map, in a wall, or somewhere too narrow for its size (a crab up
    // the galleon's stairs) comes back through a gate after 2 s, so a wave can always be finished
    // (flyers, the siren in the sea and the gunners at their posts aside); big bodies keep 1 m from
    // walls on their layer, hence the wider reach
    if (!T.fly && !T.stay && !T.post) {
      const big = !T.climber && T.radius > 0.6;
      const inWorld = this.level.nav.inWorld(e.pos.x, e.pos.z, T.climber ? 'climb' : big ? 'big' : 'small', big ? 3 : 1);
      e.lost = inWorld ? 0 : e.lost + dt;
      if (e.lost > 2) return this.#relocate(e);
    }
    const player = this.#nearest(e, players);
    if (e.target !== player) { e.target = player; e.losTimer = 0; }
    const toPlayer = _v.subVectors(player.pos, e.pos).setY(0);
    const dist = toPlayer.length();
    // caught in a trap of the scenery (the foot of a balustrade, a corner the nav grid gets wrong):
    // far from every player and hardly moved in 6 s, it comes back through a gate too; never under
    // the player's eyes (it would vanish), only once out of sight
    if (!T.stay && !T.post) {
      e.trapClock += dt;
      if (e.trapClock >= 6) {
        const moved = Math.hypot(e.pos.x - e.trapFrom.x, e.pos.z - e.trapFrom.z) + Math.abs(e.pos.y - e.trapFrom.y);
        e.trapClock = 0;
        e.trapFrom.copy(e.pos);
        if (moved < 1.5 && dist > 6 && !e.hasLos && !e.act && e.stun <= 0) return this.#relocate(e);
      }
    }
    // a looter heads for the chest and empties it, unless a player is right there to fight
    if (e.looter && this.sim.chest?.gold > 0 && !e.act && e.stun <= 0
      && !(dist < 7 && this.level.lineOfSight(e.pos.clone().setY(e.pos.y + T.height * 0.85), player.center))) return this.#loot(e, dt);
    toPlayer.divideScalar(dist || 1);
    const dy = player.pos.y - e.pos.y;

    e.losTimer -= dt;
    if (e.losTimer <= 0) {
      e.losTimer = 0.15;
      const eye = e.pos.clone().setY(e.pos.y + T.height * 0.85);
      e.hasLos = this.level.lineOfSight(eye, player.center);
    }
    for (const k of ['attackCd', 'fireCd', 'leapCd', 'chargeCd', 'slamCd', 'rainCd', 'teleportCd', 'songCd']) e[k] -= dt;

    // the pharaoh changes at half health: invulnerable while he rises, then the storm
    if (T.boss && !e.phase2 && e.hp / e.maxHp < 0.5) {
      e.phase2 = true;
      e.stun = 0;
      e.act = { kind: 'transform', t: 0, dur: 2.0 };
      this.sim.bossPhase2(e);
    }

    // knockback slide
    if (e.knock.lengthSq() > 0.01) {
      this.level.moveBody(e.pos, e.knock.x * dt, e.knock.z * dt, T.radius, T.height);
      e.knock.multiplyScalar(Math.exp(-7 * dt));
    }

    if (T.drone) return this.#drone(e, dt, player, dist);
    if (T.fly) return this.#fly(e, dt, player, toPlayer, dist);

    let move = null;
    let speed = T.speed * this.speedMul * (e.elite ? 1.15 : 1) * (T.early && this.wave <= 2 ? T.early : 1)
      * (this.level.inWater(e.pos.x, e.pos.z, e.pos.y) ? WATER_SLOW : 1);
    let moved = 0;

    if (e.stun > 0) {
      e.stun -= dt;
    } else if (e.act) {
      const r = this.#runAction(e, dt, player, toPlayer, dist, dy);
      move = r.move; speed = r.speed ?? speed;
    } else {
      this.#chooseAction(e, player, toPlayer, dist, dy);
      if (!e.act) move = this.#chooseMove(e, dt, toPlayer, dist);
      else if (e.act.kind === 'ranged' || e.act.kind === 'melee') speed *= 0.3, move = dist > T.melee.range * 0.8 ? toPlayer.clone() : null;
    }

    // separation from other enemies
    const sep = _w.set(0, 0, 0);
    for (const o of this.list) {
      if (o === e || o.rise > 0 || o.T.fly || o.T.part || o.T.kraken) continue; // a swarm flies over the others, the Kraken is out at sea
      const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z;
      const min = T.radius + o.T.radius + 0.25;
      const d2 = ox * ox + oz * oz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        sep.x += (ox / d) * (min - d);
        sep.z += (oz / d) * (min - d);
      }
    }

    if (T.climber) {
      moved = this.#climb(e, move, speed, sep, dt);
    } else {
      if (move || sep.lengthSq() > 0) {
        const mx = (move ? move.x * speed : 0) * dt + sep.x * 5 * dt;
        const mz = (move ? move.z * speed : 0) * dt + sep.z * 5 * dt;
        const bx = e.pos.x, bz = e.pos.z;
        const blocked = this.level.moveBody(e.pos, mx, mz, T.radius, T.height);
        this.#roundCorner(e, blocked, mx, mz, speed * dt);
        e.lastBlocked = blocked.x || blocked.z;
        moved = Math.hypot(e.pos.x - bx, e.pos.z - bz) / dt;
      }
      // follow the floor: step up at once, ease down
      const g = this.level.groundAt(e.pos.x, e.pos.z, T.radius, e.pos.y);
      e.pos.y = g > e.pos.y ? g : e.pos.y + (g - e.pos.y) * Math.min(1, dt * 14);
    }

    // stuck detection: wanted to move but barely did → wander sideways for a moment
    e.stuckCheck -= dt;
    if (e.stuckCheck <= 0) {
      const progressed = Math.hypot(e.pos.x - e.stuckFrom.x, e.pos.z - e.stuckFrom.z);
      if (move && !e.act && progressed < 0.5 && dist > 2.5) {
        e.unstick = rand(0.5, 0.9);
        const side = Math.random() < 0.5 ? 1 : -1;
        e.unstickDir.set(-toPlayer.z * side, 0, toPlayer.x * side).addScaledVector(toPlayer, -0.3).normalize();
      }
      e.stuckFrom.copy(e.pos);
      e.stuckCheck = 0.8;
    }
    if (e.unstick > 0) e.unstick -= dt;

    // facing
    const charging = e.act?.kind === 'charge' || e.act?.kind === 'leap';
    const faceDir = charging ? e.act.dir : (e.hasLos && dist < 35) || !move ? toPlayer : move;
    // the crab runs at you sideways, its flank (without the shell) turned toward you
    const side = e.act?.kind === 'charge' && T.charge.side ? Math.PI / 2 : 0;
    let dA = Math.atan2(faceDir.x, faceDir.z) + side - e.facing;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    e.facing += dA * Math.min(1, dt * 10);

    // the boss calls for help twice
    if (T.boss) {
      const ratio = e.hp / e.maxHp;
      if ((ratio < 0.66 && e.summoned === 0) || (ratio < 0.33 && e.summoned === 1)) {
        e.summoned++;
        this.sim.summon(e);
      }
    }

    e.speed = moved;
    e.phase += dt * (2.5 + moved * 2.0); // drives the runners' weave
  }

  // ---------- the parasite on a player's face ----------
  // It holds on and feeds until a blow knocks it off (Enemies#meleeHit), the player goes down, or
  // it has fed for T.latch.max seconds; bullets cannot reach it there (see raycast).
  #latchOn(e, player, dmg) {
    e.act = null;
    e.latched = player;
    e.latchT = 0;
    e.latchAcc = 0;
    player.latch = e;
    this.sim.hitPlayer(player, dmg, e.pos, 'latch', e);
    this.sim.emit('latch', { pid: player.id, id: e.id, on: true, pos: player.eye });
  }

  #latch(e, dt) {
    const p = e.latched, L = e.T.latch;
    e.latchT += dt;
    if (p.dead || !this.sim.players.has(p.id) || e.latchT > L.max) return this.release(e);
    const fwd = p.flatForward();
    e.pos.copy(p.pos).addScaledVector(fwd, 0.3);
    e.lift = EYE - e.T.height * 0.6; // over the face
    e.facing = Math.atan2(-fwd.x, -fwd.z);
    e.speed = 0;
    e.latchAcc += dt;
    if (e.latchAcc >= 0.5) {
      this.sim.hitPlayer(p, L.dps * e.latchAcc * this.dmgMul, e.pos, 'latch', e);
      e.latchAcc = 0;
    }
  }

  // off the face, thrown `knock` m/s forward and dazed
  release(e, knock = 0) {
    const p = e.latched;
    if (!p) return;
    p.latch = null;
    e.latched = null;
    e.lift = 0;
    const fwd = p.flatForward();
    e.pos.copy(p.pos);
    this.level.moveBody(e.pos, fwd.x * 0.9, fwd.z * 0.9, e.T.radius, e.T.height);
    e.knock.copy(fwd).multiplyScalar(knock);
    e.stun = 1.2;
    e.leapCd = Math.max(e.leapCd, 2);
    this.sim.emit('latch', { pid: p.id, id: e.id, on: false, pos: e.pos.clone() });
  }

  // ---------- the duct crawler ----------
  #emerge(e, v) {
    e.pos.copy(v.out);
    e.rise = 0;
    e.lift = Math.max(0, v.pos.y - v.out.y);
    e.act = { kind: 'emerge', t: 0, dur: 0.4 + e.lift * 0.15, from: e.lift };
    const away = v.out.clone().sub(v.pos).setY(0);
    if (away.lengthSq() > 0.01) e.facing = Math.atan2(away.x, away.z);
    this.sim.emit('ventOpen', { pos: v.pos.clone(), id: e.id });
  }

  // back to a vent along the nav grid, then into the ducts
  #flee(e, dt) {
    const T = e.T, v = e.fleeTo, nav = this.level.nav;
    const to = new THREE.Vector3(v.out.x - e.pos.x, 0, v.out.z - e.pos.z);
    if (to.length() < 0.7) {
      e.fleeTo = null;
      e.hidden = true;
      e.act = null;
      e.ventHide = rand(...T.vent.hide);
      this.sim.emit('ventOpen', { pos: v.pos.clone(), id: e.id });
      return;
    }
    const dir = nav.directionIn(nav.fieldTo(v.out), e.pos, new THREE.Vector3(), 'small') ?? to.normalize();
    const speed = T.speed * this.speedMul * 1.2;
    const bx = e.pos.x, bz = e.pos.z;
    this.level.moveBody(e.pos, dir.x * speed * dt, dir.z * speed * dt, T.radius, T.height);
    e.pos.y = this.level.groundAt(e.pos.x, e.pos.z, T.radius, e.pos.y);
    e.speed = Math.hypot(e.pos.x - bx, e.pos.z - bz) / dt;
    e.facing = Math.atan2(dir.x, dir.z);
    e.trapClock = 0;
  }

  // in the ducts: a few seconds, its wounds half healed, then out of a vent near a player
  #inDuct(e, dt, players) {
    e.ventHide -= dt;
    if (e.ventHide > 0) return;
    e.ventHide = 0;
    e.hidden = false;
    e.fled = false;
    e.hp = Math.max(e.hp, e.maxHp * 0.75);
    const near = this.level.vents.filter((v) => players.some((p) => { const d = v.out.distanceTo(p.pos); return d > 5 && d < 18; }));
    const pool = near.length ? near : this.level.vents;
    this.#emerge(e, pool[Math.floor(Math.random() * pool.length)]);
  }

  // ---------- the security drone ----------
  // It hovers under the ceiling, closes in until it sees its target in range, stops, fires a salvo
  // of laser bolts, then slips out of sight for a moment before coming back.
  #drone(e, dt, player, dist) {
    const T = e.T, F = T.fly, R = T.ranged, Dr = T.drone;
    if (e.stun > 0) { e.stun -= dt; e.speed = 0; return; }
    const center = e.pos.clone().setY(e.pos.y + T.height / 2);
    const to = player.center.setY(player.pos.y + 1.2).sub(center);
    let want = null, speed = T.speed * this.speedMul;
    e.droneT = (e.droneT ?? 0) - dt;
    e.droneState ??= 'approach';
    if (e.droneState === 'approach') {
      if (e.hasLos && dist < Dr.range && e.fireCd <= 0) {
        e.droneState = 'aim';
        e.droneT = R.windup;
        e.shots = R.salvo;
        this.sim.emit('growl', { pos: e.pos.clone(), enemyType: e.type });
      } else if (e.hasLos && dist < Dr.range * 0.7) {
        // in range, waiting to fire again: it drifts from side to side
        want = new THREE.Vector3(-to.z * e.strafe, 0, to.x * e.strafe);
        e.strafeTimer -= dt;
        if (e.strafeTimer <= 0) { e.strafe *= -1; e.strafeTimer = rand(1, 2); }
        speed *= 0.4;
      } else if (e.hasLos) want = to.clone().setY(0);
      else {
        const ground = e.pos.clone().setY(this.level.groundAt(e.pos.x, e.pos.z, 0.2, e.pos.y + 0.5));
        want = this.level.nav.direction(ground, new THREE.Vector3(), 'small') ?? to.clone().setY(0);
      }
    } else if (e.droneState === 'aim') {
      if (e.droneT <= 0) {
        if (e.shots > 0 && e.hasLos) {
          this.#fire(e, player);
          e.shots--;
          e.droneT = R.gap;
        } else {
          e.fireCd = R.cd * this.D.fireCd * rand(0.8, 1.2);
          e.droneState = 'cover';
          e.cover = this.#coverSpot(e, center, player);
          e.droneT = rand(...Dr.hide);
        }
      }
    } else {
      if (e.cover) { want = e.cover.clone().sub(center).setY(0); if (want.length() < 0.4) want = null; }
      if (e.droneT <= 0) e.droneState = 'approach';
    }
    // it faces its target while aiming or in range, else where it flies
    const face = e.droneState === 'aim' || (e.hasLos && dist < Dr.range) ? to : want;
    if (face && (face.x || face.z)) {
      let dA = Math.atan2(face.x, face.z) - e.facing;
      dA = Math.atan2(Math.sin(dA), Math.cos(dA));
      e.facing += dA * Math.min(1, dt * 8);
    }
    e.speed = 0;
    if (want && want.lengthSq() > 1e-4) {
      want.normalize();
      const step = speed * dt;
      // the first of these directions with nothing in the way: straight on, then turning aside
      for (const turn of [0, 0.7, -0.7, 1.4, -1.4]) {
        const c = want.clone().applyAxisAngle(UP, turn);
        if (!this.level.raycast(center, c, step + T.radius)) { e.pos.addScaledVector(c, step); e.speed = speed; break; }
      }
    }
    // it hovers at its height over the floor under it, bobbing a little, but never up into the
    // ceiling (over a crate it would climb, take the ceiling for its floor and leave the tunnel)
    let hover = this.level.groundAt(e.pos.x, e.pos.z, 0.2, e.pos.y + 0.5) + F.height - T.height / 2;
    const roof = this.level.raycast(center, UP, F.height + 1);
    if (roof) hover = Math.min(hover, roof.point.y - T.height / 2 - 0.15);
    e.pos.y += (hover + Math.sin(e.phase * 2) * 0.08 - e.pos.y) * Math.min(1, dt * 3);
    e.phase += dt;
  }

  // the nearest spot round the drone, out of the player's sight, that it can fly to in a straight line
  #coverSpot(e, center, player) {
    let best = null, bd = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const r of [3, 5, 7]) {
        if (r >= bd) break;
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        if (this.level.raycast(center, dir, r + e.T.radius)) break;
        const p = center.clone().addScaledVector(dir, r);
        if (!this.level.nav.inWorld(p.x, p.z, 'small') || this.level.lineOfSight(p, player.eye)) continue;
        bd = r;
        best = p;
      }
    }
    return best;
  }

  // ---------- the Hive Queen ----------
  // Three phases that play differently (T.queen):
  //   1. on the reactor: she turns to face the nearest player and draws her next attack at random
  //      among those that reach (never the same twice running): acid volley, acid raining from the
  //      ceiling on red circles, tail smashed down where a player stands, claws swept across the
  //      front of the column; she lays a new egg sac now and then.
  //   2. at half health she cuts the power and shuts herself in her carapace ("guard": she cannot be
  //      hurt) while a brood hatches from new sacs and the crew comes down the tunnels; only acid
  //      rain falls. Shooting every sac breaks her guard: stunned, she takes double damage for a few
  //      seconds, then fights on.
  //   3. at a third she blows the airlocks, fights faster, and her tail grabs: it drags a player to
  //      her jaws unless they shoot her enough to make her let go.
  // Each change of phase comes with a roar during which she cannot be hurt.
  #queen(e, dt, players) {
    const T = e.T, Q = T.queen;
    const player = this.#nearest(e, players);
    const toPlayer = _v.subVectors(player.pos, e.pos).setY(0);
    const dist = toPlayer.length();
    toPlayer.divideScalar(dist || 1);
    const a = e.act;
    // she keeps turning to face her prey, except while a blow is on its way or her guard is up
    if (!['strike', 'sweep', 'grab', 'hold', 'guard', 'exposed'].includes(a?.kind)) {
      let dA = Math.atan2(toPlayer.x, toPlayer.z) - e.facing;
      dA = Math.atan2(Math.sin(dA), Math.cos(dA));
      e.facing += dA * Math.min(1, dt * (e.stage >= 3 ? 1.8 : 1.3));
    }
    e.losTimer -= dt;
    if (e.losTimer <= 0) {
      e.losTimer = 0.2;
      e.hasLos = this.level.lineOfSight(this.muzzleOf(e), player.center);
    }
    if (a?.kind === 'transform') {
      a.t += dt;
      if (a.t < a.dur) return;
      e.act = null;
      // out of the roar at half health: into her shell, a brood round her
      if (e.stage === 2 && !e.guarded) this.#queenGuard(e);
      return;
    }
    if (a?.kind === 'guard') return this.#queenGuarding(e, dt);
    if (a?.kind === 'exposed') {
      a.t += dt;
      if (a.t >= a.dur) { e.act = null; e.attackCd = 0.6; }
      return;
    }
    if (a?.kind === 'hold') return this.#queenHold(e, dt);
    const ratio = e.hp / e.maxHp;
    if (!a && e.stage === 1 && ratio <= 0.5) {
      e.stage = 2;
      e.act = { kind: 'transform', t: 0, dur: Q.roar };
      this.sim.emit('growl', { pos: e.pos.clone(), enemyType: e.type, low: true, loud: true });
      this.sim.powerCut(e);
      return;
    }
    if (!a && e.stage === 2 && ratio <= 1 / 3) {
      e.stage = 3;
      e.act = { kind: 'transform', t: 0, dur: Q.roar };
      this.sim.emit('growl', { pos: e.pos.clone(), enemyType: e.type, low: true, loud: true });
      this.sim.breach(e);
      return;
    }
    e.layT -= dt;
    e.attackCd -= dt;
    if (a) {
      a.t += dt;
      if (a.t < a.dur) return;
      e.act = null;
      e.attackCd = rand(...Q.gap) * (e.stage >= 3 ? 0.65 : 1);
      if (a.kind === 'ranged') this.#fire(e, player);
      else if (a.kind === 'rain') this.sim.acidRain(e, Q.rain);
      else if (a.kind === 'lay') this.#laySac(e);
      else if (a.kind === 'strike') this.#queenBlow(e, a.at, T.strike);
      else if (a.kind === 'sweep') this.#queenBlow(e, a.at, Q.sweep);
      else if (a.kind === 'grab') this.#queenGrab(e, a);
      return;
    }
    // a new sac when one is missing (sooner in her last phase)
    if (e.layT <= 0) {
      e.layT = Q.layEvery * (e.stage >= 3 ? 0.6 : 1);
      if (this.#sacsOf(e).length < Q.sacs) {
        e.act = { kind: 'lay', t: 0, dur: Q.lay };
        return;
      }
    }
    if (e.attackCd > 0) return;
    const kind = this.#queenPick(e, player, dist);
    e.lastBlow = kind;
    const fast = e.stage >= 3 ? 0.8 : 1;
    const ring = (at, radius, life) => this.sim.emit('ring', { pos: at.clone(), radius, enemyType: e.type, life, color: Q.warn });
    if (kind === 'ranged') e.act = { kind, t: 0, dur: T.ranged.windup };
    else if (kind === 'rain') e.act = { kind, t: 0, dur: Q.rain.windup };
    else if (kind === 'strike' || kind === 'grab') {
      // where the player is heading
      const at = player.pos.clone().addScaledVector(player.vel.clone().setY(0), 0.3);
      at.y = this.level.groundAt(at.x, at.z, 0.4, player.pos.y + 0.6);
      const B = kind === 'grab' ? Q.grab : T.strike;
      e.act = { kind, t: 0, dur: B.windup * fast, at, player };
      ring(at, B.radius, e.act.dur);
    } else if (kind === 'sweep') {
      // a wide arc of the floor in front of her, round towards the player
      const at = e.pos.clone().addScaledVector(toPlayer, Q.sweep.at);
      at.y = this.level.groundAt(at.x, at.z, 0.4, e.pos.y + 0.6);
      e.act = { kind, t: 0, dur: Q.sweep.windup * fast, at };
      ring(at, Q.sweep.radius, e.act.dur);
    }
  }

  // her next blow: drawn among those that reach the player, weighted, never the last one again
  #queenPick(e, player, dist) {
    const T = e.T, Q = T.queen;
    const pool = [];
    if (e.hasLos && dist < T.ranged.max) pool.push(['ranged', 3]);
    pool.push(['rain', 2]);
    if (dist < T.strike.reach) pool.push(['strike', 3]);
    if (dist < Q.sweep.reach) pool.push(['sweep', 4]);
    if (e.stage >= 3 && dist < Q.grab.reach && !player.grabbed) pool.push(['grab', 4]);
    const fresh = pool.length > 1 ? pool.filter(([k]) => k !== e.lastBlow) : pool;
    let r = Math.random() * fresh.reduce((n, [, w]) => n + w, 0);
    for (const [k, w] of fresh) if ((r -= w) <= 0) return k;
    return fresh[0][0];
  }

  // a blow on a circle of the floor (her tail, her claws): hurts and throws whoever is still in it
  #queenBlow(e, at, B) {
    this.sim.emit('slam', { pos: at.clone() });
    for (const p of this.sim.alivePlayers()) {
      const away = new THREE.Vector3(p.pos.x - at.x, 0, p.pos.z - at.z);
      if (away.length() < B.radius && Math.abs(p.pos.y - at.y) < 2.2) {
        this.sim.hitPlayer(p, B.dmg * this.dmgMul, at, 'melee', e);
        if (away.lengthSq() < 1e-4) away.set(p.pos.x - e.pos.x, 0, p.pos.z - e.pos.z);
        p.impulse(away.normalize().multiplyScalar(B.throw ?? 8).add(new THREE.Vector3(0, 3.5, 0)));
      }
    }
  }

  // her last phase: the tail closes on whoever stayed in its circle and drags them to her jaws
  #queenGrab(e, a) {
    const Q = e.T.queen, p = a.player;
    if (p.dead || p.grabbed || Math.hypot(p.pos.x - a.at.x, p.pos.z - a.at.z) > Q.grab.radius) {
      this.sim.emit('slam', { pos: a.at.clone() });
      return;
    }
    p.grabbed = { by: e.id, at: p.pos.clone().setY(p.pos.y + 0.6) };
    e.act = { kind: 'hold', t: 0, dur: Q.grab.hold, taken: 0, player: p, from: p.pos.clone() };
    this.sim.emit('grab', { pid: p.id, id: e.id });
  }

  #queenHold(e, dt) {
    const Q = e.T.queen, a = e.act, p = a.player;
    a.t += dt;
    // dragged in to the foot of her body, under her jaws (fast at first)
    const jaws = e.pos.clone().addScaledVector(new THREE.Vector3(a.from.x - e.pos.x, 0, a.from.z - e.pos.z).normalize(), e.T.radius + 0.7);
    const k = 1 - (1 - Math.min(1, a.t / a.dur)) ** 2;
    p.grabbed.at.lerpVectors(a.from, jaws, k).setY(a.from.y + 0.6 + k * 0.8);
    const free = a.taken >= Q.grab.free;
    if (!free && a.t < a.dur && !p.dead) return;
    p.grabbed = null;
    this.sim.emit('grab', { pid: p.id, id: e.id, released: true });
    e.act = null;
    e.attackCd = rand(...Q.gap);
    const out = new THREE.Vector3(p.pos.x - e.pos.x, 0, p.pos.z - e.pos.z).normalize();
    if (free) {
      // shot enough, she lets go with a shriek
      e.act = { kind: 'exposed', t: 0, dur: 1.2 };
      this.sim.emit('growl', { pos: e.pos.clone(), enemyType: e.type, loud: true });
      p.impulse(out.multiplyScalar(6).add(new THREE.Vector3(0, 3, 0)));
    } else if (!p.dead) {
      // the jaws: a bite, and thrown back across the room
      this.sim.hitPlayer(p, Q.grab.bite * this.dmgMul, e.pos, 'melee', e);
      this.sim.emit('slam', { pos: p.pos.clone() });
      p.impulse(out.multiplyScalar(11).add(new THREE.Vector3(0, 5, 0)));
    }
  }

  // into her shell: a full set of new sacs, the crew down the tunnels
  #queenGuard(e) {
    const Q = e.T.queen;
    e.guarded = true;
    e.act = { kind: 'guard', t: 0, dur: Q.guard.max, rain: Q.guard.rainEvery * 0.5 };
    while (this.#sacsOf(e).length < Q.guard.sacs) {
      const n = this.#sacsOf(e).length;
      this.#laySac(e, false);
      if (this.#sacsOf(e).length === n) break; // no free nest left
    }
    for (const s of this.#sacsOf(e)) s.hatchT = Math.min(s.hatchT, rand(1, 3));
    for (let i = 0; i < Q.guard.crew; i++) this.spawn('host', this.sim.pickSpawn('host'));
    this.sim.emit('banner', { title: '', sub: this.sim.world.texts.bossGuard, duration: 3 });
  }

  // shut in: acid now and then; when every sac is down (or she has waited long enough), she opens up
  #queenGuarding(e, dt) {
    const Q = e.T.queen, a = e.act;
    a.t += dt;
    a.rain -= dt;
    if (a.rain <= 0) {
      a.rain = Q.guard.rainEvery;
      this.sim.acidRain(e, Q.rain);
    }
    if (this.#sacsOf(e).length && a.t < a.dur) return;
    e.act = { kind: 'exposed', t: 0, dur: Q.guard.exposed };
    this.sim.emit('growl', { pos: e.pos.clone(), enemyType: e.type, low: true, loud: true });
    this.sim.emit('banner', { title: '', sub: this.sim.world.texts.bossExposed, duration: 2.5 });
  }

  #sacsOf(queen) {
    return queen.parts.filter((s) => this.list.includes(s));
  }

  // a new egg sac on a free nest of the room, the one farthest from the players
  #laySac(queen, announce = true) {
    const taken = this.#sacsOf(queen).map((s) => s.pos);
    const players = this.sim.alivePlayers();
    let best = null, bd = -1;
    for (const [x, z] of queen.T.queen.nests) {
      const p = new THREE.Vector3(queen.pos.x + x, queen.pos.y, queen.pos.z + z);
      if (taken.some((t) => t.distanceTo(p) < 1)) continue;
      const d = players.reduce((m, pl) => Math.min(m, pl.pos.distanceTo(p)), Infinity);
      if (d > bd) { bd = d; best = p; }
    }
    if (!best) return;
    const s = this.spawn('eggsac', best);
    s.owner = queen;
    s.hatchT = rand(...s.T.eggs.hatch) * 0.6;
    queen.parts.push(s);
    if (announce) this.sim.emit('banner', { title: '', sub: this.sim.world.texts.bossLay, duration: 1.6 });
  }

  // an egg sac: every few seconds one of its eggs hatches a parasite, while not too many are about
  #eggSac(e, dt) {
    if (e.rise > 0) { e.rise = Math.max(0, e.rise - dt * 0.8); return; }
    e.hatchT -= dt;
    if (e.hatchT > 0) return;
    const E = e.T.eggs;
    e.hatchT = rand(...E.hatch) * (e.owner?.act?.kind === 'guard' ? 0.55 : e.owner?.stage >= 3 ? 0.7 : 1);
    if (this.list.filter((o) => o.type === 'parasite').length >= E.cap) return;
    const out = this.spawn('parasite', e.pos.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4))));
    out.rise = 0;
    out.stun = 0.3;
    this.sim.emit('burst', { pos: e.pos.clone().setY(e.pos.y + 1), enemyType: e.type });
  }

  // ---------- the Kraken ----------
  // The body: under the water at first (only cutting its tentacles hurts it); at half health its head
  // comes up between the piers, spits ink and calls the crew; at a third it smashes a pier, and from
  // then on its tentacles grab.
  #kraken(e, dt, players) {
    const T = e.T, K = T.kraken;
    const player = this.#nearest(e, players);
    const toPlayer = _v.subVectors(player.pos, e.pos).setY(0);
    const dist = toPlayer.length();
    toPlayer.divideScalar(dist || 1);
    let dA = Math.atan2(toPlayer.x, toPlayer.z) - e.facing;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    e.facing += dA * Math.min(1, dt * 1.5);
    const ratio = e.hp / e.maxHp;
    if (e.stage === 1 && ratio <= 0.5) {
      e.stage = 2;
      e.submerged = false;
      this.sim.emit('banner', { title: '', sub: this.sim.world.texts.bossRise, duration: 2.5 });
      this.sim.emit('growl', { pos: e.pos.clone(), enemyType: e.type, low: true, loud: true });
      this.sim.summon(e);
    }
    if (e.stage === 2 && ratio <= 1 / 3) {
      e.stage = 3;
      this.sim.breakPier(e, player);
    }
    e.rise = e.submerged ? 1 : Math.max(0, e.rise - dt * 0.5);
    if (e.stage < 2 || e.rise > 0) return;
    // up: ink at whoever it sees, and the crew every so often
    e.summonT -= dt;
    if (e.summonT <= 0) { e.summonT = K.summonEvery; this.sim.summon(e); }
    e.fireCd -= dt;
    e.losTimer -= dt;
    if (e.losTimer <= 0) {
      e.losTimer = 0.2;
      e.hasLos = this.level.lineOfSight(e.pos.clone().setY(e.pos.y + T.height * 0.6), player.center);
    }
    // its ink is lobbed over the deep water's edge: no need to see the player, only open sky over them
    const canFire = T.ranged.lob ? !this.level.nav.coveredAt(player.pos.x, player.pos.z) : e.hasLos;
    if (e.act) {
      e.act.t += dt;
      if (e.act.t >= e.act.dur) { this.#fire(e, player); e.act = null; }
    } else if (canFire && e.fireCd <= 0) {
      e.act = { kind: 'ranged', t: 0, dur: T.ranged.windup };
      e.fireCd = T.ranged.cd * rand(0.8, 1.2);
    }
  }

  // A tentacle: it rises at a spot of the shore near the player and strikes where they stand (a red
  // circle warns first); in the last phase, close enough, it grabs.
  #tentacle(e, dt, players) {
    const T = e.T;
    if (e.diving) {
      e.rise = Math.min(1, e.rise + dt * 1.6);
      e.diveT -= dt;
      if (e.diveT <= 0) {
        e.diving = false;
        e.pos.copy(this.#tentacleSpot(e.owner, e));
        e.rise = 1;
        e.attackCd = rand(1, 2);
      }
      return;
    }
    if (e.rise > 0) { e.rise = Math.max(0, e.rise - dt * 0.9); return; }
    const player = this.#nearest(e, players);
    const toPlayer = _v.subVectors(player.pos, e.pos).setY(0);
    const dist = toPlayer.length();
    toPlayer.divideScalar(dist || 1);
    let dA = Math.atan2(toPlayer.x, toPlayer.z) - e.facing;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    e.facing += dA * Math.min(1, dt * 4);
    e.attackCd -= dt;
    e.leapCd -= dt;
    const a = e.act;
    const dmgMul = this.dmgMul;
    if (a) {
      a.t += dt;
      if (a.kind === 'strike' && a.t >= a.dur) {
        this.sim.emit('slam', { pos: a.at.clone() });
        for (const p of this.sim.alivePlayers()) {
          const away = new THREE.Vector3(p.pos.x - a.at.x, 0, p.pos.z - a.at.z);
          if (away.length() < T.strike.radius && Math.abs(p.pos.y - a.at.y) < 2.2) {
            this.sim.hitPlayer(p, T.strike.dmg * dmgMul, a.at, 'melee', e);
            p.impulse(away.normalize().multiplyScalar(7).add(new THREE.Vector3(0, 3, 0)));
          }
        }
        e.act = null;
        e.attackCd = rand(...T.strike.cd);
      } else if (a.kind === 'grab' && a.t >= a.dur) {
        e.act = null;
        if (dist < T.grab.range + 0.6 && !player.grabbed && !player.dead) {
          const at = e.pos.clone().addScaledVector(toPlayer, 1.4).setY(Math.max(player.pos.y, e.pos.y) + 1.2);
          player.grabbed = { by: e.id, at };
          e.act = { kind: 'hold', t: 0, dur: T.grab.hold, taken: 0, player, tick: 0 };
          this.sim.emit('grab', { pid: player.id, id: e.id });
        }
      } else if (a.kind === 'hold') {
        a.tick -= dt;
        if (a.tick <= 0) { a.tick = 0.5; this.sim.hitPlayer(a.player, T.grab.dps * 0.5 * dmgMul, e.pos, 'melee', e); }
        if (a.t >= a.dur || a.player.dead) {
          // thrown back onto the shore
          const p = a.player;
          this.#release(e);
          p.impulse(toPlayer.clone().multiplyScalar(6).add(new THREE.Vector3(0, 5, 0)));
          e.act = null;
        }
      }
      return;
    }
    if (e.owner?.stage >= 3 && e.leapCd <= 0 && dist < T.grab.range && !player.grabbed) {
      e.act = { kind: 'grab', t: 0, dur: T.grab.windup };
      e.leapCd = T.grab.cd;
      this.sim.emit('ring', { pos: player.pos.clone(), radius: 1.2, enemyType: e.type, life: T.grab.windup });
      return;
    }
    if (e.attackCd <= 0 && dist < T.strike.reach && Math.abs(player.pos.y - e.pos.y) < 3) {
      const at = player.pos.clone().addScaledVector(player.vel.clone().setY(0), 0.3);
      at.y = this.level.groundAt(at.x, at.z, 0.4, player.pos.y + 0.6);
      e.act = { kind: 'strike', t: 0, dur: T.strike.windup, at };
      this.sim.emit('ring', { pos: at.clone(), radius: T.strike.radius, enemyType: e.type, life: T.strike.windup });
    }
  }

  // a spot of the shore for a tentacle: the free one nearest the players
  #tentacleSpot(kraken, self) {
    const K = kraken.T.kraken;
    const players = this.sim.alivePlayers();
    const taken = (kraken.parts ?? []).filter((t) => t !== self && !t.diving).map((t) => t.pos);
    const score = ([x, , z]) => Math.min(...players.map((p) => Math.hypot(p.pos.x - x, p.pos.z - z)), 1e9);
    const free = K.spots.filter(([x, , z]) => taken.every((q) => Math.hypot(q.x - x, q.z - z) > 3));
    const pool = (free.length ? free : K.spots).slice().sort((a, b) => score(a) - score(b));
    // one of the three nearest, so they do not always come up at the same places
    return new THREE.Vector3(...pool[Math.floor(Math.random() * Math.min(3, pool.length))]);
  }

  // cut (or hurt enough to let go): the tentacle dives, the Kraken loses a share of its health
  #cut(e, killer) {
    this.#release(e);
    e.act = null;
    e.diving = true;
    e.diveT = rand(...e.owner.T.kraken.dive);
    e.hp = e.maxHp;
    this.sim.emit('tentacleCut', { id: e.id, pos: e.pos.clone() });
    if (killer) this.sim.addScore(killer, 150, 'TENTACULE');
    if (e.owner && this.list.includes(e.owner)) this.damage(e.owner, e.owner.maxHp * e.owner.T.kraken.cut, null, killer);
  }

  #release(e) {
    const p = e.act?.kind === 'hold' ? e.act.player : null;
    if (p) {
      p.grabbed = null;
      this.sim.emit('grab', { pid: p.id, id: e.id, released: true });
    }
    if (e.act?.kind === 'hold') e.act = null;
  }

  // A looter on its way to the chest, or at it, taking the gold
  #loot(e, dt) {
    const T = e.T, chest = this.sim.chest;
    // the front of the chest (it stands against the back of the cave)
    const front = chest.pos.clone().add(new THREE.Vector3(0, 0, 1.5));
    const to = new THREE.Vector3(front.x - e.pos.x, 0, front.z - e.pos.z);
    const d = to.length();
    if (d < 1.2 + T.radius) {
      e.trapClock = 0; // standing still at the chest is no trap
      chest.gold = Math.max(0, chest.gold - dt * 3); // a looter alone takes half the gold in about 17 s
      e.speed = 0;
      e.facing = Math.atan2(chest.pos.x - e.pos.x, chest.pos.z - e.pos.z);
      e.lootTick = (e.lootTick ?? 0) - dt;
      if (e.lootTick <= 0) { e.lootTick = 1; this.sim.emit('chestHit', { pos: chest.pos.clone(), gold: chest.gold }); }
      return;
    }
    const nav = this.level.nav;
    const dir = nav.directionIn(nav.fieldTo(front), e.pos, new THREE.Vector3(), T.radius > 0.6 ? 'big' : 'small') ?? to.normalize();
    const speed = T.speed * this.speedMul * (this.level.inWater(e.pos.x, e.pos.z, e.pos.y) ? WATER_SLOW : 1);
    const bx = e.pos.x, bz = e.pos.z;
    this.level.moveBody(e.pos, dir.x * speed * dt, dir.z * speed * dt, T.radius, T.height);
    const g = this.level.groundAt(e.pos.x, e.pos.z, T.radius, e.pos.y);
    e.pos.y = g > e.pos.y ? g : e.pos.y + (g - e.pos.y) * Math.min(1, dt * 14);
    e.speed = Math.hypot(e.pos.x - bx, e.pos.z - bz) / dt;
    let dA = Math.atan2(dir.x, dir.z) - e.facing;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    e.facing += dA * Math.min(1, dt * 10);
    e.phase += dt * (2.5 + e.speed * 2.0);
  }

  // back through a gate, rising from the ground again (see #think: out of the world, or trapped)
  #relocate(e) {
    // not back at the trap it came from (the gate on the galleon's deck can lead to the same corner)
    let at = this.sim.pickSpawn(e.type);
    for (let i = 0; i < 6 && at.distanceTo(e.pos) < 10; i++) at = this.sim.pickSpawn(e.type);
    e.pos.copy(at);
    e.rise = e.T.fly ? 0 : 1;
    e.lost = 0;
    e.trapClock = 0;
    e.trapFrom.copy(e.pos);
    e.act = null;
    e.lift = 0;
    e.knock.set(0, 0, 0);
    this.sim.emit('enemySpawn', { id: e.id, enemyType: e.type, pos: e.pos.clone(), elite: e.elite });
  }

  // Scarabs follow the climbing layer and ignore box collisions: facing a wall they crawl up it,
  // past a roof edge they drop down.
  // Stopped by a wall the body only grazes on the other axis (the end of a parapet beside a doorway):
  // slip sideways past its edge rather than stay pressed against it. Only when that wall stands across
  // the way: sliding along a wall is the move itself.
  #roundCorner(e, blocked, mx, mz, step) {
    const r = e.T.radius;
    for (const [axis, other] of [['x', 'z'], ['z', 'x']]) {
      const b = blocked[axis + 'Box'];
      if (!b || blocked[other] || Math.abs(axis === 'x' ? mx : mz) < Math.abs(axis === 'x' ? mz : mx)) continue;
      const pastMin = e.pos[other] + r - b.min[other], pastMax = b.max[other] - (e.pos[other] - r);
      const graze = Math.min(pastMin, pastMax);
      if (graze <= 0 || graze > 0.2) continue;
      const d = Math.min(graze + 1e-3, step) * (pastMin < pastMax ? -1 : 1);
      this.level.moveBody(e.pos, other === 'x' ? d : 0, other === 'z' ? d : 0, r, e.T.height);
    }
  }

  #climb(e, move, speed, sep, dt) {
    const nav = this.level.nav;
    const mx = (move ? move.x * speed : 0) * dt + sep.x * 5 * dt;
    const mz = (move ? move.z * speed : 0) * dt + sep.z * 5 * dt;
    const len = Math.hypot(mx, mz);
    let moved = 0;
    e.climbing = false;
    if (len > 1e-6) {
      const ahead = nav.floorAt(e.pos.x + (mx / len) * 0.35, e.pos.z + (mz / len) * 0.35);
      // a wall ahead: crawl up it, unless a roof is overhead (inside a house)
      if (ahead > e.pos.y + 0.3 && !nav.coveredAt(e.pos.x, e.pos.z) && nav.climbableAt(e.pos.x + (mx / len) * 0.35, e.pos.z + (mz / len) * 0.35)) {
        e.pos.y = Math.min(ahead, e.pos.y + 3.5 * dt);
        e.climbing = true;
        moved = 3.5;
      } else {
        // the walls and roofs of houses are off limits: slide along them instead
        const here = nav.climbableAt(e.pos.x, e.pos.z);
        const ok = (dx, dz) => !here || nav.climbableAt(e.pos.x + dx, e.pos.z + dz);
        let dx = mx, dz = mz;
        if (!ok(dx, dz)) {
          if (ok(dx, 0)) dz = 0;
          else if (ok(0, dz)) dx = 0;
          else dx = dz = 0;
        }
        e.pos.x = THREE.MathUtils.clamp(e.pos.x + dx, -60, 60);
        e.pos.z = THREE.MathUtils.clamp(e.pos.z + dz, -60, 60);
        moved = Math.hypot(dx, dz) / dt;
      }
    }
    if (!e.climbing) {
      const f = nav.floorAt(e.pos.x, e.pos.z);
      e.pos.y = e.pos.y > f ? Math.max(f, e.pos.y - 9 * dt) : f;
    }
    return moved;
  }

  #chooseAction(e, player, toPlayer, dist, dy) {
    const T = e.T;
    const D = this.D;
    const level = Math.abs(dy) < 1.2;
    if (e.phase2) {
      // second phase: teleports away when cornered (or too far), and calls down orb rain
      if (e.teleportCd <= 0 && (dist < 5 || dist > 26 || Math.random() < 0.004)) {
        e.act = { kind: 'teleport', t: 0, dur: 0.6 };
        e.hidden = true;
        this.sim.emit('teleportOut', { id: e.id, pos: e.pos.clone() });
        return;
      }
      if (e.rainCd <= 0) {
        this.sim.orbRain(e);
        e.rainCd = rand(5, 7);
      }
    }
    if (T.song && e.songCd <= 0 && e.hasLos && dist < T.song.range) {
      e.act = { kind: 'sing', t: 0, dur: T.song.dur };
      this.sim.emit('song', { id: e.id, pos: e.pos.clone(), on: true });
      return;
    }
    if (T.prime && dist < T.prime.range && e.hasLos && Math.abs(dy) < 2) {
      e.act = { kind: 'prime', t: 0, dur: T.prime.dur };
      this.sim.emit('prime', { id: e.id, pos: e.pos.clone() });
      return;
    }
    if (T.slam && dist < T.slam.range && e.slamCd <= 0 && Math.abs(dy) < 2) {
      e.act = { kind: 'slam', t: 0, dur: T.slam.windup };
      e.slamCd = T.slam.cd;
      this.sim.emit('ring', { pos: e.pos.clone(), radius: T.slam.range, enemyType: e.type, life: T.slam.windup });
      this.sim.emit('growl', { pos: e.pos.clone(), enemyType: e.type, low: true, loud: true });
      return;
    }
    const token = T.big || this.meleeActive < this.maxMelee;
    if (dist < T.melee.range && e.attackCd <= 0 && Math.abs(dy) < 2.2 && token) {
      this.meleeActive++;
      e.engagedUntil = this.clock + T.melee.windup + T.melee.cd;
      e.act = { kind: 'melee', t: 0, dur: T.melee.windup };
      e.attackCd = T.melee.cd * D.attackCd;
      if (Math.random() < 0.4) this.sim.emit('growl', { pos: e.pos.clone(), enemyType: e.type, low: !!T.big });
      return;
    }
    if (T.leap && e.hasLos && level && dist > T.leap.min && dist < T.leap.max && e.leapCd <= 0 && token) {
      this.meleeActive++;
      e.engagedUntil = this.clock + T.leap.dur + 0.8;
      e.act = { kind: 'leap', t: 0, dur: T.leap.dur, dir: toPlayer.clone(), speed: (dist - 1.0) / T.leap.dur, hit: false };
      e.leapCd = rand(...T.leap.cd) * D.leapCd;
      this.sim.emit('growl', { pos: e.pos.clone(), enemyType: e.type, low: false });
      return;
    }
    if (T.charge && e.hasLos && level && dist > T.charge.min && dist < T.charge.max && e.chargeCd <= 0) {
      e.act = { kind: 'charge-wind', t: 0, dur: T.charge.wind, dir: toPlayer.clone() };
      e.chargeCd = rand(...T.charge.cd) * D.chargeCd;
      this.sim.emit('growl', { pos: e.pos.clone(), enemyType: e.type, low: true });
      return;
    }
    // a lobbed ball needs no line of sight, only open sky over the player (a roof shelters)
    const sight = T.ranged?.lob ? !this.level.nav.coveredAt(player.pos.x, player.pos.z) : e.hasLos;
    if (T.ranged && sight && dist < T.ranged.max && e.fireCd <= 0) {
      e.act = { kind: 'ranged', t: 0, dur: T.ranged.windup };
      e.fireCd = T.ranged.cd * D.fireCd * rand(0.75, 1.15) / Math.sqrt(this.speedMul);
    }
  }

  #runAction(e, dt, player, toPlayer, dist, dy) {
    const T = e.T, a = e.act;
    a.t += dt;
    const dmgMul = this.dmgMul * (e.elite ? 1.2 : 1);
    switch (a.kind) {
      case 'sing':
        // heard as long as she sees her target: the song pulls the player toward her
        if (e.hasLos && dist < T.song.range) {
          player.hearing = T.song;
          player.drift.addScaledVector(toPlayer, -T.song.pull);
        }
        if (a.t >= a.dur || (dist < T.melee.range && e.attackCd <= 0)) {
          e.act = null;
          e.songCd = rand(...T.song.rest);
          this.sim.emit('song', { id: e.id, pos: e.pos.clone(), on: false });
        }
        return { move: null };
      case 'emerge':
        // climbing down out of its vent (see #emerge)
        e.lift = a.from * (1 - Math.min(1, a.t / a.dur));
        if (a.t >= a.dur) { e.act = null; e.lift = 0; }
        return { move: null };
      case 'prime':
        // blows up when the fuse ends (killing it earlier blows it up too, see #kill)
        if (a.t >= a.dur) { e.act = null; this.damage(e, Infinity, null, null, 'self'); }
        return { move: null };
      case 'transform':
        if (a.t >= a.dur) { e.act = null; e.rainCd = 1.5; e.teleportCd = 4; }
        return { move: null };
      case 'teleport':
        if (a.t >= a.dur) {
          const p = this.level.nav.ambushPoint(10, 24, () => true);
          if (p) e.pos.copy(p);
          e.hidden = false;
          e.act = null;
          e.teleportCd = rand(8, 11);
          this.sim.emit('teleportIn', { id: e.id, pos: e.pos.clone() });
        }
        return { move: null };
      case 'melee':
        if (a.t >= a.dur) {
          if (dist < T.melee.range + 0.5 && Math.abs(dy) < 2.5) this.sim.hitPlayer(player, T.melee.dmg * dmgMul, e.pos, 'melee', e);
          e.act = null;
        }
        return { move: dist > T.melee.range * 0.7 ? toPlayer.clone() : null, speed: T.speed * 0.35 };
      case 'ranged':
        if (a.t >= a.dur) { this.#fire(e, player); e.act = null; }
        return { move: null };
      case 'slam':
        if (a.t >= a.dur) {
          this.sim.emit('slam', { pos: e.pos.clone() });
          // the shockwave hits every player in range
          for (const p of this.sim.alivePlayers()) {
            const to = new THREE.Vector3(p.pos.x - e.pos.x, 0, p.pos.z - e.pos.z);
            if (to.length() < T.slam.range && Math.abs(p.pos.y - e.pos.y) < 2) {
              this.sim.hitPlayer(p, T.slam.dmg * dmgMul, e.pos, 'melee', e);
              p.impulse(to.normalize().multiplyScalar(10).add(new THREE.Vector3(0, 5, 0)));
            }
          }
          e.act = null;
        }
        return { move: null };
      case 'leap': {
        const p = Math.min(1, a.t / a.dur);
        e.lift = Math.sin(Math.PI * p) * 1.1;
        const c = e.pos.clone().setY(e.pos.y + e.lift + 1);
        if (!a.hit && c.distanceTo(player.center) < 1.5) {
          a.hit = true;
          // the parasite: onto the face, if that face is free
          if (T.latch && !player.latch && !player.dead && !player.loadout.blocking) { this.#latchOn(e, player, T.leap.dmg * dmgMul); return { move: null }; }
          this.sim.hitPlayer(player, T.leap.dmg * dmgMul, e.pos, 'melee', e);
          player.impulse(a.dir.clone().multiplyScalar(3));
        }
        if (p >= 1) { e.act = null; e.lift = 0; e.attackCd = Math.max(e.attackCd, 0.35); }
        return { move: a.dir, speed: a.speed };
      }
      case 'charge-wind':
        a.dir.copy(toPlayer);
        if (a.t >= a.dur) { e.act = { kind: 'charge', t: 0, dur: T.charge.dur, dir: toPlayer.clone(), hit: false }; }
        return { move: null };
      case 'charge': {
        if (!a.hit && dist < T.radius + 1.0 && Math.abs(dy) < 2) {
          a.hit = true;
          this.sim.hitPlayer(player, T.charge.dmg * dmgMul, e.pos, 'melee', e);
          player.impulse(a.dir.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4, 0)));
          a.t = a.dur - 0.15;
        }
        if (e.lastBlocked && a.t > 0.15) {
          // slammed into a wall: dazed
          this.sim.emit('wallStun', { pos: e.pos.clone() });
          e.stun = 1.0;
          e.act = null;
          return { move: null };
        }
        if (a.t >= a.dur) e.act = null;
        return { move: a.dir, speed: T.charge.speed * this.speedMul };
      }
    }
    e.act = null;
    return { move: null };
  }

  #chooseMove(e, dt, toPlayer, dist) {
    const T = e.T;
    if (e.unstick > 0) return e.unstickDir.clone();
    const nav = this.level.nav.direction(e.pos, new THREE.Vector3(), T.climber ? 'climb' : T.radius > 0.6 ? 'big' : 'small');
    const path = dist < 2.5 || !nav ? toPlayer.clone() : nav;
    if (T.stay) return null; // the siren keeps to her spot in the water
    // the ghost gunner keeps its post on the deck, unless a player comes aboard to fight it
    if (T.post) return dist < 6 && dist > T.melee.range * 0.8 ? path : null;
    if (T.ranged && !T.boss && e.hasLos && dist < T.ranged.max) {
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) { e.strafe *= -1; e.strafeTimer = rand(1, 2.2); }
      const side = new THREE.Vector3(-toPlayer.z * e.strafe, 0, toPlayer.x * e.strafe);
      if (dist < T.ranged.min) return toPlayer.clone().negate().add(side).normalize();
      if (dist > 16) return path.add(side.multiplyScalar(0.5)).normalize(); // close in while weaving
      return side;
    }
    // no attack slot free: circle the player just out of reach
    if (!T.big && !T.ranged && dist < 4 && this.meleeActive >= this.maxMelee) {
      const side = new THREE.Vector3(-toPlayer.z * e.strafe, 0, toPlayer.x * e.strafe);
      return side.addScaledVector(toPlayer, dist < 2.6 ? -0.8 : 0.2).normalize();
    }
    if (dist <= T.melee.range * 0.8) return null;
    // runners weave a little on the way in, which makes them harder to hit
    if (T.weave && dist > 5 && e.hasLos) {
      const w = Math.sin(e.phase * 0.35) * 0.45;
      return path.add(new THREE.Vector3(-path.z * w, 0, path.x * w)).normalize();
    }
    return path;
  }

  // A flying swarm (the bats): when it sees the player it heads straight for them, turning aside or
  // climbing when a wall is ahead; out of sight it follows the path on the ground, flying over it.
  // Close enough, it nibbles a little damage again and again.
  #fly(e, dt, player, toPlayer, dist) {
    const T = e.T, F = T.fly;
    if (e.stun > 0) { e.stun -= dt; e.speed = 0; return; }
    const center = e.pos.clone().setY(e.pos.y + T.height / 2);
    const target = player.center.setY(player.pos.y + 1.2);
    const want = target.clone().sub(center);
    const d3 = want.length();
    if (!e.hasLos && d3 > F.reach) {
      const ground = e.pos.clone().setY(this.level.groundAt(e.pos.x, e.pos.z, 0.2, e.pos.y + 0.5));
      const path = this.level.nav.direction(ground, new THREE.Vector3(), 'small');
      if (path) want.set(path.x * 6, THREE.MathUtils.clamp(target.y - center.y, -1, 1), path.z * 6);
    }
    if (d3 < F.reach) {
      if (e.attackCd <= 0) {
        e.attackCd = T.melee.cd;
        this.sim.hitPlayer(player, T.melee.dmg * this.dmgMul * (e.elite ? 1.2 : 1), e.pos, 'melee', e);
      }
      want.set(Math.sin(e.phase * 2) * 0.6, Math.sin(e.phase * 3.1) * 0.3, Math.cos(e.phase * 2) * 0.6); // swirl around the head
    }
    want.normalize();
    const speed = T.speed * this.speedMul * (d3 < F.reach ? 0.4 : 1);
    const step = speed * dt;
    // the first of these directions with nothing in the way: straight on, then turning aside, then up
    let dir = null;
    for (const [turn, up] of [[0, 0], [0.7, 0], [-0.7, 0], [1.4, 0], [-1.4, 0], [0, 1.2]]) {
      const c = want.clone().applyAxisAngle(UP, turn);
      c.y += up;
      c.normalize();
      if (!this.level.raycast(center, c, step + T.radius)) { dir = c; break; }
    }
    if (dir) {
      e.pos.addScaledVector(dir, step);
      // never below a little height over the ground under it
      const floor = this.level.groundAt(e.pos.x, e.pos.z, 0.2, e.pos.y + 0.5) + F.height - T.height / 2;
      if (e.pos.y < floor) e.pos.y += Math.min(floor - e.pos.y, 6 * dt);
      e.facing = Math.atan2(dir.x, dir.z);
    }
    e.speed = dir ? speed : 0;
    e.phase += dt * 4;
  }

  muzzleOf(e) {
    const m = e.T.muzzle;
    if (!m) return e.pos.clone().setY(e.pos.y + e.T.height * 0.8);
    const c = Math.cos(e.facing), s = Math.sin(e.facing);
    return new THREE.Vector3(e.pos.x + m[0] * c + m[2] * s, e.pos.y + e.lift + m[1], e.pos.z - m[0] * s + m[2] * c);
  }

  #fire(e, player) {
    const R = e.T.ranged;
    const from = this.muzzleOf(e);
    if (R.lob) {
      this.sim.emit('enemyFire', { pos: from.clone(), enemyType: e.type });
      this.sim.lob(from, player, R, this.dmgMul * (e.elite ? 1.2 : 1));
      return;
    }
    const flight = from.distanceTo(player.center) / R.speed;
    const aim = player.center.addScaledVector(player.vel, flight * 0.6);
    const base = aim.sub(from).normalize();
    this.sim.emit('enemyFire', { pos: from.clone(), enemyType: e.type });
    // shooters fire a three-orb burst from a given wave on
    const count = R.burst && this.wave >= this.D.shooterBurstWave ? 3 : R.count;
    const spread = R.burst ? 0.05 : R.spread;
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i / (count - 1) - 0.5) * 2 : 0;
      const dir = base.clone().applyAxisAngle(UP, off * spread * 2).normalize();
      this.projectiles.push({
        id: this.sim.nextId(), type: e.type, pos: from.clone(), vel: dir.multiplyScalar(R.speed),
        dmg: R.dmg * this.dmgMul, life: 5, from: e.pos.clone(), ownerId: e.id, reflected: false, reflectedBy: null,
        ink: R.ink ?? 0, // the Kraken's: blinds the player it hits for that many seconds
      });
    }
  }

  #updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const step = p.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const hit = this.level.raycast(p.pos, step.clone().divideScalar(len), len);
      p.pos.add(step);

      let done = !!hit || p.life <= 0;
      if (p.reflected) {
        for (const e of this.list) {
          const base = e.pos.y + e.lift;
          const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
          if (dx * dx + dz * dz < (e.T.radius + 0.3) ** 2 && p.pos.y > base && p.pos.y < base + e.T.height) {
            this.damage(e, p.dmg, p.vel.clone().normalize(), p.reflectedBy);
            this.sim.emit('reflectHit', { pid: p.reflectedBy?.id ?? null });
            done = true;
            break;
          }
        }
      } else {
        // player bodies: a vertical segment from feet to head
        for (const pl of this.sim.alivePlayers()) {
          const pc = pl.center;
          const py = THREE.MathUtils.clamp(p.pos.y, pl.pos.y + 0.2, pl.pos.y + 1.7);
          const dx = p.pos.x - pc.x, dz = p.pos.z - pc.z, dyy = p.pos.y - py;
          if (dx * dx + dz * dz + dyy * dyy < 0.6 * 0.6) {
            const res = this.sim.hitPlayer(pl, p.dmg, p.from, 'projectile', null);
            if (p.ink && res !== 'reflect' && res !== 'perfect') { pl.ink = Math.max(pl.ink, p.ink); this.sim.emit('inked', { pid: pl.id }); }
            if (res === 'reflect' || res === 'perfect') { this.reflect(p, pl, res === 'perfect'); done = false; } else done = true;
            break;
          }
        }
      }
      if (done) {
        this.sim.emit('projectileEnd', { id: p.id, pos: p.pos.clone(), normal: hit?.normal ?? null, enemyType: p.type, reflected: p.reflected });
        this.projectiles.splice(i, 1);
      }
    }
  }

  #updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      let taken = false;
      for (const pl of this.sim.alivePlayers()) {
        const dx = p.pos.x - pl.pos.x, dz = p.pos.z - pl.pos.z;
        const close = dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(p.pos.y - 0.6 - pl.pos.y) < 1.5;
        if (close && this.sim.pickup(pl, p.kind)) { taken = true; break; }
      }
      if (taken || p.life <= 0) this.pickups.splice(i, 1);
    }
  }
}

// Ray against a vertical cylinder; returns distance or null.
// distance along the ray (o, d normalized) to the sphere (c, r), or null
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  if (-b - sq >= 0) return -b - sq;
  return -b + sq >= 0 ? -b + sq : null;
}

export function rayCylinder(o, d, c, r, y0, y1) {
  const ox = o.x - c.x, oz = o.z - c.z;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return null;
  const b = 2 * (ox * d.x + oz * d.z);
  const cc = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0) continue;
    const y = o.y + d.y * t;
    if (y >= y0 && y <= y1) return t;
  }
  return null;
}
