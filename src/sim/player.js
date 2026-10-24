import * as THREE from 'three';
import { STEP, EYE, PLAYER_RADIUS, PLAYER_HEIGHT, GRAVITY, WATER_SLOW } from './constants.js';
import { Loadout } from './weapons.js';
import { baseMods, freshWaveStats } from './progression.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

// An empty command: what a player does when no input arrives.
export function emptyCommand() {
  return { moveX: 0, moveZ: 0, sprint: false, jump: false, fire: false, aim: false, reload: false, use: false, grenade: false, slot: null, cycle: 0, pickCard: null, yaw: 0, pitch: 0 };
}

// One player in the simulation. Commands drive it; the client only reads it.
export class PlayerSim {
  constructor(id, sim) {
    this.id = id;
    this.sim = sim;
    this.team = 'players';
    this.pos = sim.level.playerStart.clone();
    this.vel = new THREE.Vector3();
    this.push = new THREE.Vector3(); // knockback / lunge, decays on its own
    this.drift = new THREE.Vector3(); // a siren's song pulling the player toward her, set by the enemies each step
    this.charm = 0; // 0..1, how far the song has taken hold (the client blurs the screen)
    this.ink = 0; // seconds of the Kraken's ink still over the eyes
    this.grabbed = null; // a Kraken's tentacle holding the player: { by: enemy id, at: where }
    this.recoil = { pitch: 0, yaw: 0 };
    this.yaw = 0; // looking north (-Z), towards the temple
    this.pitch = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.lastHit = -99;
    this.onGround = true;
    this.eyeY = this.pos.y + EYE;
    this.stepDist = 0;
    this.sprinting = false;
    this.moving = false;
    this.dead = false; // alone: game over; in co-op: down, until a teammate picks them up
    this.revive = 0; // 0..1, how far a teammate got picking this player up
    this.reviveBy = null; // id of the teammate doing it this step
    this.respawn = 0; // arena: seconds before a dead player comes back
    this.protect = 0; // arena: seconds of invulnerability after coming back
    this.killedBy = null; // arena: id of the player who scored the last kill on this one
    this.multi = 0; // kills in a row, each less than MULTI_WINDOW after the previous one
    this.lastKillAt = -99;
    this.spree = 0; // arena: kills since the last death
    this.name = id;
    this.stats = { kills: 0, headshots: 0, damageTaken: 0, shotsFired: 0, shotsHit: 0, frags: 0, deaths: 0 };
    this.score = 0;
    this.mods = baseMods(); // what the upgrade cards changed (see progression.js)
    this.upgrades = {}; // card id -> times taken
    this.cardOffer = null; // card ids to choose from between waves
    this.waveStats = freshWaveStats(); // for the wave's secondary objective
    this.loadout = new Loadout(this, sim);
  }

  get eye() { return new THREE.Vector3(this.pos.x, this.eyeY, this.pos.z); }
  // bounds used by enemy projectiles / melee
  get center() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.0, this.pos.z); }
  // the head, for shots from other players in the arena
  get headBase() { return this.pos.y + PLAYER_HEIGHT - 0.32; }
  get accuracy() { return this.stats.shotsFired ? Math.round((this.stats.shotsHit / this.stats.shotsFired) * 100) : 0; }

  // view orientation including the recoil currently applied
  aimQuaternion() {
    _e.set(this.pitch + this.recoil.pitch, this.yaw + this.recoil.yaw, 0, 'YXZ');
    return _q.setFromEuler(_e);
  }

  flatForward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  move(dt, cmd, aiming) {
    const level = this.sim.level;
    this.yaw = cmd.yaw;
    this.pitch = THREE.MathUtils.clamp(cmd.pitch, -1.5, 1.5);

    this.ink = Math.max(0, this.ink - dt);
    // held by a tentacle: no walking, a little off the ground, until it lets go
    if (this.grabbed) {
      this.vel.set(0, 0, 0);
      this.push.set(0, 0, 0);
      this.pos.lerp(this.grabbed.at, 1 - Math.exp(-6 * dt));
      this.eyeY = this.pos.y + EYE;
      this.moving = false;
      this.sprinting = false;
      this.onGround = false;
      const rk = 1 - Math.exp(-10 * dt); // the recoil still recovers (the player keeps shooting)
      this.recoil.pitch -= this.recoil.pitch * rk;
      this.recoil.yaw -= this.recoil.yaw * rk;
      return;
    }

    // input direction in local space
    let fx = cmd.moveX, fz = cmd.moveZ;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }

    this.sprinting = cmd.sprint && fz < 0 && !aiming && this.onGround;
    this.wading = level.inWater(this.pos.x, this.pos.z, this.pos.y);
    const speed = (aiming ? 3.2 : this.sprinting ? 8.8 : 5.6) * this.mods.speed * (this.wading ? WATER_SLOW : 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = (fx * cos + fz * sin) * speed;
    const wz = (-fx * sin + fz * cos) * speed;
    const accel = this.onGround ? 14 : 3;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    if (this.onGround && cmd.jump) {
      this.vel.y = 5.6;
      this.onGround = false;
    }
    this.vel.y -= GRAVITY * dt;

    const beforeY = this.pos.y;
    level.moveBody(this.pos, (this.vel.x + this.push.x + this.drift.x) * dt, (this.vel.z + this.push.z + this.drift.z) * dt, PLAYER_RADIUS, PLAYER_HEIGHT);
    this.push.multiplyScalar(Math.exp(-6 * dt));
    this.pos.y += this.vel.y * dt;
    const ground = level.groundAt(this.pos.x, this.pos.z, PLAYER_RADIUS, Math.max(this.pos.y, beforeY));
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -6) this.sim.emit('step', { pid: this.id, sprint: true, land: true, high: this.pos.y > 0.5 });
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.pos.y > ground + 0.05 && this.onGround && this.vel.y <= 0) {
      // walking off a ledge or down a step: snap if small, else start falling
      if (this.pos.y - ground <= STEP) this.pos.y = ground;
      else this.onGround = false;
    }

    // smoothed eye height on steps (shots leave from here)
    const target = this.pos.y + EYE;
    this.eyeY += (target - this.eyeY) * (1 - Math.exp(-18 * dt));
    if (Math.abs(target - this.eyeY) > 1.2) this.eyeY = target;
    const hv = Math.hypot(this.vel.x, this.vel.z);
    this.moving = hv > 0.5 && this.onGround;
    if (this.moving) {
      this.stepDist += hv * dt;
      const stride = this.sprinting ? 2.6 : 2.1;
      if (this.stepDist > stride) { this.stepDist = 0; this.sim.emit('step', { pid: this.id, sprint: this.sprinting, water: this.wading, high: this.pos.y > 0.5 }); }
    }

    // recoil recovers over time
    const rk = 1 - Math.exp(-10 * dt);
    this.recoil.pitch -= this.recoil.pitch * rk;
    this.recoil.yaw -= this.recoil.yaw * rk;

    const D = this.sim.difficulty;
    const regenDelay = Math.max(0.5, D.regenDelay - this.mods.regenDelayCut);
    if (!this.dead && this.sim.time - this.lastHit > regenDelay && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + D.regenRate * this.mods.regenMul * dt);
    }
  }

  impulse(v) {
    this.push.x += v.x;
    this.push.z += v.z;
    if (v.y > 0) { this.vel.y = Math.max(this.vel.y, v.y); this.onGround = false; }
  }

  kick(pitch, yaw) {
    this.recoil.pitch += pitch;
    this.recoil.yaw += yaw;
    // part of the recoil is permanent, as in most shooters: the client adds it to its own view angles
    this.pitch += pitch * 0.35;
    this.sim.emit('kick', { pid: this.id, pitch: pitch * 0.35 });
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.lastHit = this.sim.time;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }
}
