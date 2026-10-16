import * as THREE from 'three';

// What the co-op server and its clients say to each other (JSON over WebSocket).
//
// client -> server
//   { t: 'hello', name }                       first message, the player's name
//   { t: 'create' } / { t: 'join', code }      open a room / join one by its code
//   { t: 'config', mode, difficulty }          host only, before the game starts
//   { t: 'start' }                             host only
//   { t: 'cmd', s, d, c }                      one input command: sequence number, dt, command
//   { t: 'leave' }
// server -> client
//   { t: 'welcome', id }
//   { t: 'rooms', rooms: [{ code, host, players, mode, difficulty }] }   open rooms, to players in none
//   { t: 'room', code, host, players: [{ id, name }], mode, difficulty, playing }
//   { t: 'start', players: [{ id, name }], mode, difficulty }
//   { t: 'snap', ack, s }                      ack: last command of this client the server ran
//   { t: 'error', msg }
export const PORT = 8787;
export const TICK = 1 / 30; // the server steps the world 30 times per second

const r3 = (v) => Math.round(v * 1000) / 1000;
const vec = (v) => [r3(v.x), r3(v.y), r3(v.z)];
const setVec = (v, a) => v.set(a[0], a[1], a[2]);

// ---------- players: everything the owner needs to predict its own movement and weapons ----------
export function writePlayer(p) {
  const lo = p.loadout;
  return {
    id: p.id, name: p.name,
    pos: vec(p.pos), vel: vec(p.vel), push: vec(p.push), recoil: [r3(p.recoil.pitch), r3(p.recoil.yaw)],
    yaw: r3(p.yaw), pitch: r3(p.pitch), eyeY: r3(p.eyeY), stepDist: r3(p.stepDist),
    onGround: p.onGround, moving: p.moving, sprinting: p.sprinting,
    health: r3(p.health), maxHealth: p.maxHealth, lastHit: r3(p.lastHit),
    dead: p.dead, revive: r3(p.revive),
    score: p.score, stats: p.stats, mods: p.mods, upgrades: p.upgrades, cardOffer: p.cardOffer, waveStats: p.waveStats,
    lo: {
      index: lo.index, cooldown: r3(lo.cooldown), reloading: r3(lo.reloading), reloadTotal: r3(lo.reloadTotal ?? 0),
      switching: r3(lo.switching), adsT: r3(lo.adsT), triggerHeld: lo.triggerHeld,
      swingT: r3(lo.swingT), swingDir: lo.swingDir, swingHitDone: lo.swingHitDone,
      aimHeld: lo.aimHeld, aimPressedAt: r3(lo.aimPressedAt),
      // the pistol's endless reserve does not survive JSON: -1 stands for Infinity
      items: lo.items.map((it) => [it.mag, it.reserve === Infinity ? -1 : it.reserve, it.unlocked ? 1 : 0]),
    },
  };
}

export function readPlayer(p, s) {
  p.name = s.name;
  setVec(p.pos, s.pos); setVec(p.vel, s.vel); setVec(p.push, s.push);
  p.recoil.pitch = s.recoil[0]; p.recoil.yaw = s.recoil[1];
  p.yaw = s.yaw; p.pitch = s.pitch; p.eyeY = s.eyeY; p.stepDist = s.stepDist;
  p.onGround = s.onGround; p.moving = s.moving; p.sprinting = s.sprinting;
  p.health = s.health; p.maxHealth = s.maxHealth; p.lastHit = s.lastHit;
  p.dead = s.dead; p.revive = s.revive;
  p.score = s.score; p.stats = s.stats; p.mods = s.mods; p.upgrades = s.upgrades; p.cardOffer = s.cardOffer; p.waveStats = s.waveStats;
  const lo = p.loadout, l = s.lo;
  if (!lo) return;
  Object.assign(lo, {
    index: l.index, cooldown: l.cooldown, reloading: l.reloading, reloadTotal: l.reloadTotal, switching: l.switching,
    adsT: l.adsT, triggerHeld: l.triggerHeld, swingT: l.swingT, swingDir: l.swingDir, swingHitDone: l.swingHitDone,
    aimHeld: l.aimHeld, aimPressedAt: l.aimPressedAt,
  });
  l.items.forEach(([mag, reserve, unlocked], i) => {
    const it = lo.items[i];
    it.mag = mag; it.reserve = reserve < 0 ? Infinity : reserve; it.unlocked = !!unlocked;
  });
}

// ---------- the world ----------
// Attacks are sent as kind, progress and duration, with a number so a client can tell a new attack
// from the same one going on (the enemy view restarts the clip on a new attack).
let actCount = 0;
const actIds = new WeakMap();
function actId(a) {
  if (!actIds.has(a)) actIds.set(a, ++actCount);
  return actIds.get(a);
}

export function writeWorld(sim, events) {
  const m = sim.mode;
  return {
    time: r3(sim.time), weather: sim.weather, over: sim.over, victory: sim.victory,
    players: [...sim.players.values()].map(writePlayer),
    enemies: sim.enemies.list.map((e) => ({
      i: e.id, ty: e.type, el: e.elite ? 1 : 0, p: vec(e.pos), f: r3(e.facing), l: r3(e.lift), r: r3(e.rise),
      h: e.hidden ? 1 : 0, c: e.climbing ? 1 : 0, s: r3(e.speed), st: r3(e.stun), hp: Math.round(e.hp), mh: Math.round(e.maxHp),
      a: e.act ? [e.act.kind, r3(e.act.t), r3(e.act.dur), actId(e.act)] : 0,
    })),
    proj: sim.enemies.projectiles.map((p) => ({ i: p.id, ty: p.type, rf: p.reflected ? 1 : 0, p: vec(p.pos) })),
    pick: sim.enemies.pickups.map((p) => ({ i: p.id, k: p.kind, p: vec(p.pos) })),
    mode: {
      id: m.id, wave: m.wave, totalWaves: Number.isFinite(m.totalWaves) ? m.totalWaves : null,
      waveActive: m.waveActive, enemiesLeft: m.enemiesLeft, objective: m.objective,
    },
    events,
  };
}

// Events carry THREE.Vector3s, which JSON turns into { x, y, z }: turn them back.
export function reviveVectors(v) {
  if (Array.isArray(v)) return v.map(reviveVectors);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 3 && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number') return new THREE.Vector3(v.x, v.y, v.z);
    for (const k of keys) v[k] = reviveVectors(v[k]);
  }
  return v;
}

export function roomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c = '';
  for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
  return c;
}
