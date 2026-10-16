import * as THREE from 'three';

// Enemy rules. Colours and models are the client's business (see src/view/enemyView.js).
export const TYPES = {
  runner: {
    hp: 70, speed: 7.2, radius: 0.4, height: 1.75, headY: 1.3,
    melee: { range: 1.7, dmg: 11, windup: 0.18, cd: 0.75 },
    leap: { min: 3.5, max: 8, dur: 0.5, dmg: 15, cd: [2.2, 3.8] },
  },
  shooter: {
    hp: 95, speed: 4.2, radius: 0.45, height: 1.95, headY: 1.55,
    melee: { range: 1.7, dmg: 9, windup: 0.25, cd: 1.0 },
    ranged: { min: 8, max: 28, cd: 1.7, windup: 0.35, speed: 22, dmg: 13, count: 1, spread: 0 },
    muzzle: [0.36, 2.2, 0.3], // staff orb, in model space (model faces +Z)
  },
  tank: {
    hp: 480, speed: 2.9, radius: 0.95, height: 2.75, headY: 2.25,
    melee: { range: 2.8, dmg: 30, windup: 0.45, cd: 1.5 },
    charge: { min: 6, max: 22, wind: 0.65, speed: 11, dur: 1.4, dmg: 26, cd: [5, 7] },
    big: true,
  },
  mummy: {
    hp: 110, speed: 4.6, radius: 0.42, height: 1.8, headY: 1.38,
    melee: { range: 1.6, dmg: 8, windup: 0.3, cd: 1.2 },
    // kamikaze: primes near a player, then blows up; it also blows up however it dies
    prime: { range: 3.2, dur: 1.0 },
    explode: { radius: 4.5, dmg: 42, enemyDmg: 160 },
  },
  scarab: {
    hp: 18, speed: 7.8, radius: 0.3, height: 0.5, headY: 0.35,
    melee: { range: 1.1, dmg: 4, windup: 0.12, cd: 0.55 },
    climber: true, // goes over walls and roofs
    load: 0.25, // a swarm of four counts as one enemy for the spawn limit
  },
  boss: {
    hp: 3400, speed: 2.7, radius: 1.3, height: 4.5, headY: 3.4,
    melee: { range: 3.8, dmg: 38, windup: 0.55, cd: 1.8 },
    ranged: { min: 0, max: 50, cd: 1.9, windup: 0.55, speed: 18, dmg: 15, count: 5, spread: 0.16 },
    slam: { range: 7, dmg: 30, windup: 0.8, cd: 5 },
    muzzle: [1.0, 4.6, 0.15], // scepter orb, including the boss's hover
    big: true, boss: true,
  },
};

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
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
    const T = TYPES[type];
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
      rise: 1.0,
      act: null, // current attack: { kind, t, dur, ... }
      attackCd: rand(0.3, 0.8),
      fireCd: rand(0.8, 1.6),
      leapCd: rand(0.5, 1.5),
      chargeCd: rand(1, 2.5),
      slamCd: 3,
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
    };
    this.list.push(e);
    this.sim.emit('enemySpawn', { id: e.id, enemyType: type, pos: position.clone(), elite });
    return e;
  }

  get alive() { return this.list.length; }
  // how much of the spawn limit the living enemies use (scarabs are light)
  get load() { return this.list.reduce((s, e) => s + (e.T.load ?? 1), 0); }
  get boss() { return this.list.find((e) => e.T.boss) || null; }

  // ---------- player attacks ----------
  raycast(origin, dir, maxDist, skip = null) {
    let best = null;
    for (const e of this.list) {
      if (e === skip) continue;
      const base = e.pos.y + e.lift - e.rise * e.T.height;
      const t = rayCylinder(origin, dir, e.pos, e.T.radius, base, base + e.T.height);
      if (t !== null && t < maxDist && (!best || t < best.dist)) {
        const point = origin.clone().addScaledVector(dir, t);
        const head = point.y - base > e.T.headY;
        best = { enemy: e, dist: t, point, head };
      }
    }
    return best;
  }

  // cause: 'ranged' (bullets, reflected orbs) or 'melee' (khépesh) — only melee kills drop health
  damage(e, amount, dir, killer, cause = 'ranged') {
    if (e.hidden || e.act?.kind === 'transform') return; // the pharaoh cannot be hurt while changing or teleporting
    e.hp -= amount;
    this.sim.emit('enemyHit', { id: e.id });
    if (e.hp <= 0) this.#kill(e, dir, killer, cause);
  }

  // sword hit: damage plus knockback and a short stagger that cancels attacks
  meleeHit(e, amount, dir, killer) {
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
    this.sim.emit('enemyKill', { id: e.id, enemyType: e.type, pos: e.pos.clone(), dir: dir ? dir.clone() : null, cause, killer: killer?.id ?? null });
    if (killer) {
      killer.stats.kills++;
      this.sim.scoreKill(killer, e, cause);
      if (cause === 'melee') {
        killer.waveStats.meleeKills++;
        if (killer.mods.lifesteal && !killer.dead) killer.health = Math.min(killer.maxHealth, killer.health + killer.mods.lifesteal);
      }
    }
    if (e.T.boss && this.sim.weather !== 'clear' && !this.list.some((o) => o.T.boss)) {
      this.sim.weather = 'clear';
      this.sim.emit('weather', { kind: 'clear' });
    }
    if (e.T.explode && !e.exploded) {
      e.exploded = true;
      this.sim.explode(e.pos.clone().setY(e.pos.y + 1), e.T.explode, killer);
    }
    if (!e.T.boss && cause !== 'self') {
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

    for (const e of this.list) this.#think(e, dt, players);

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
    if (e.rise > 0) {
      e.rise = Math.max(0, e.rise - dt * 1.3);
      e.speed = 0;
      return;
    }
    const player = this.#nearest(e, players);
    if (e.target !== player) { e.target = player; e.losTimer = 0; }
    const toPlayer = _v.subVectors(player.pos, e.pos).setY(0);
    const dist = toPlayer.length();
    toPlayer.divideScalar(dist || 1);
    const dy = player.pos.y - e.pos.y;

    e.losTimer -= dt;
    if (e.losTimer <= 0) {
      e.losTimer = 0.15;
      const eye = e.pos.clone().setY(e.pos.y + T.height * 0.85);
      e.hasLos = this.level.lineOfSight(eye, player.center);
    }
    for (const k of ['attackCd', 'fireCd', 'leapCd', 'chargeCd', 'slamCd', 'rainCd', 'teleportCd']) e[k] -= dt;

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

    let move = null;
    let speed = T.speed * this.speedMul * (e.elite ? 1.15 : 1);
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
      if (o === e || o.rise > 0) continue;
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
        e.lastBlocked = blocked.x || blocked.z;
        moved = Math.hypot(e.pos.x - bx, e.pos.z - bz) / dt;
      }
      // follow the floor: step up at once, ease down
      const g = this.level.groundAt(e.pos.x, e.pos.z, T.radius * 0.7, e.pos.y);
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
    let dA = Math.atan2(faceDir.x, faceDir.z) - e.facing;
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

  // Scarabs follow the climbing layer and ignore box collisions: facing a wall they crawl up it,
  // past a roof edge they drop down.
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
    if (T.prime && dist < T.prime.range && e.hasLos && Math.abs(dy) < 2) {
      e.act = { kind: 'prime', t: 0, dur: T.prime.dur };
      this.sim.emit('prime', { id: e.id, pos: e.pos.clone() });
      return;
    }
    if (T.slam && dist < T.slam.range && e.slamCd <= 0 && Math.abs(dy) < 2) {
      e.act = { kind: 'slam', t: 0, dur: T.slam.windup };
      e.slamCd = T.slam.cd;
      this.sim.emit('ring', { pos: e.pos.clone(), radius: T.slam.range, enemyType: e.type, life: T.slam.windup });
      this.sim.emit('growl', { pos: e.pos.clone(), low: true, loud: true });
      return;
    }
    const token = T.big || this.meleeActive < this.maxMelee;
    if (dist < T.melee.range && e.attackCd <= 0 && Math.abs(dy) < 2.2 && token) {
      this.meleeActive++;
      e.engagedUntil = this.clock + T.melee.windup + T.melee.cd;
      e.act = { kind: 'melee', t: 0, dur: T.melee.windup };
      e.attackCd = T.melee.cd * D.attackCd;
      if (Math.random() < 0.4) this.sim.emit('growl', { pos: e.pos.clone(), low: !!T.big });
      return;
    }
    if (T.leap && e.hasLos && level && dist > T.leap.min && dist < T.leap.max && e.leapCd <= 0 && token) {
      this.meleeActive++;
      e.engagedUntil = this.clock + T.leap.dur + 0.8;
      e.act = { kind: 'leap', t: 0, dur: T.leap.dur, dir: toPlayer.clone(), speed: (dist - 1.0) / T.leap.dur, hit: false };
      e.leapCd = rand(...T.leap.cd) * D.leapCd;
      this.sim.emit('growl', { pos: e.pos.clone(), low: false });
      return;
    }
    if (T.charge && e.hasLos && level && dist > T.charge.min && dist < T.charge.max && e.chargeCd <= 0) {
      e.act = { kind: 'charge-wind', t: 0, dur: T.charge.wind, dir: toPlayer.clone() };
      e.chargeCd = rand(...T.charge.cd) * D.chargeCd;
      this.sim.emit('growl', { pos: e.pos.clone(), low: true });
      return;
    }
    if (T.ranged && e.hasLos && dist < T.ranged.max && e.fireCd <= 0) {
      e.act = { kind: 'ranged', t: 0, dur: T.ranged.windup };
      e.fireCd = T.ranged.cd * D.fireCd * rand(0.75, 1.15) / Math.sqrt(this.speedMul);
    }
  }

  #runAction(e, dt, player, toPlayer, dist, dy) {
    const T = e.T, a = e.act;
    a.t += dt;
    const dmgMul = this.dmgMul * (e.elite ? 1.2 : 1);
    switch (a.kind) {
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
    if (e.type === 'runner' && dist > 5 && e.hasLos) {
      const w = Math.sin(e.phase * 0.35) * 0.45;
      return path.add(new THREE.Vector3(-path.z * w, 0, path.x * w)).normalize();
    }
    return path;
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
    const flight = from.distanceTo(player.center) / R.speed;
    const aim = player.center.addScaledVector(player.vel, flight * 0.6);
    const base = aim.sub(from).normalize();
    this.sim.emit('enemyFire', { pos: from.clone() });
    // shooters fire a three-orb burst from a given wave on
    const count = e.type === 'shooter' && this.wave >= this.D.shooterBurstWave ? 3 : R.count;
    const spread = e.type === 'shooter' ? 0.05 : R.spread;
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i / (count - 1) - 0.5) * 2 : 0;
      const dir = base.clone().applyAxisAngle(UP, off * spread * 2).normalize();
      this.projectiles.push({
        id: this.sim.nextId(), type: e.type, pos: from.clone(), vel: dir.multiplyScalar(R.speed),
        dmg: R.dmg * this.dmgMul, life: 5, from: e.pos.clone(), ownerId: e.id, reflected: false, reflectedBy: null,
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
