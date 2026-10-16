import * as THREE from 'three';
import { PlayerSim } from '../sim/player.js';
import { Enemies, TYPES } from '../sim/enemies.js';
import { makeDifficulty } from '../sim/difficulty.js';
import { readPlayer, reviveVectors, PORT } from './protocol.js';

// How far behind the newest snapshot the other entities are drawn, so there is always a pair of
// snapshots to interpolate between (the server sends one every 33 ms).
const INTERP_DELAY = 0.07;
// what the client already did itself for its own player: the server's copies of these are skipped
const PREDICTED = new Set(['playerShot', 'swing', 'reload', 'dry', 'switch', 'kick', 'step']);

const lerpAngle = (a, b, k) => a + (((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k;

export function defaultServer() {
  return `${location.hostname || 'localhost'}:${PORT}`;
}

// The client side of a co-op game. It looks like a Sim to the rest of the client (players,
// enemies, mode, step, drainEvents) but the world comes from the server:
// - its own player is predicted: every command moves it at once, and when a snapshot arrives the
//   server's state is taken and the commands the server has not run yet are replayed on top;
// - the other players and the enemies are drawn a little in the past, between two snapshots.
export class NetSession {
  constructor(level) {
    this.level = level;
    this.ws = null;
    this.id = null;
    this.room = null;
    this.on = {}; // callbacks: room, start, snapshot, error, close
  }

  // ---------- connection and lobby ----------
  connect(address, name) {
    this.close();
    return new Promise((resolve, reject) => {
      const url = /^wss?:\/\//.test(address) ? address : `ws://${address}`;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      this.ws = ws;
      ws.onopen = () => { this.#send({ t: 'hello', name }); };
      ws.onerror = () => reject(new Error(`Impossible de joindre le serveur ${address}`));
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.on.close?.(); } };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'welcome') { this.id = m.id; resolve(); }
        else if (m.t === 'room') { this.room = m; this.on.room?.(m); }
        else if (m.t === 'error') this.on.error?.(m.msg);
        else if (m.t === 'start') this.#startGame(m);
        else if (m.t === 'snap') this.#snapshot(m);
      };
    });
  }

  get connected() { return this.ws?.readyState === WebSocket.OPEN; }
  get isHost() { return !!this.room && this.room.host === this.id; }

  create() { this.#send({ t: 'create' }); }
  join(code) { this.#send({ t: 'join', code }); }
  configure(mode, difficulty) { this.#send({ t: 'config', mode, difficulty }); }
  start() { this.#send({ t: 'start' }); }
  leave() { this.#send({ t: 'leave' }); this.room = null; }
  close() {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  #send(msg) { if (this.connected) this.ws.send(JSON.stringify(msg)); }

  // ---------- a game ----------
  #startGame(m) {
    this.difficulty = makeDifficulty(m.difficulty);
    this.time = 0;
    this.over = false;
    this.victory = null;
    this.weather = 'clear';
    this.events = [];
    this.players = new Map();
    this.names = new Map(m.players.map((p) => [p.id, p.name]));
    this.mode = { id: m.mode, wave: 0, totalWaves: m.mode === 'waves' ? 5 : Infinity, waveActive: false, enemiesLeft: 0, objective: null };
    this.enemies = { list: [], projectiles: [], pickups: [], get boss() { return this.list.find((e) => e.T.boss) || null; }, get alive() { return this.list.length; } };
    this.byId = new Map(); // enemy mirrors by id, kept between snapshots
    this.snaps = [];
    this.renderTime = null;
    this.viewOffset = new THREE.Vector3(); // eases out prediction corrections on the camera

    // the predicted player runs the real player code against a stand-in for the simulation
    this.seq = 0;
    this.pending = [];
    this.replaying = false;
    const self = this;
    this.ctx = {
      level: this.level,
      difficulty: this.difficulty,
      time: 0,
      emit(type, data = {}) { if (!self.replaying) self.events.push({ ...data, type }); },
      fireWeapon: (player, def, spread) => this.#fireCosmetic(player, def, spread),
      meleeAttack: () => 0, // the server decides what the blade hits
    };
    this.local = new PlayerSim(this.id, this.ctx);
    this.players.set(this.id, this.local);
    this.on.start?.(m);
  }

  // a shot as the client sees it at once: flash, sound and tracers; hits come from the server
  #fireCosmetic(player, def, spread) {
    if (this.replaying) return;
    const origin = player.eye;
    const q = player.aimQuaternion();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const points = [];
    for (let i = 0; i < def.pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const wh = this.level.raycast(origin, dir, 250);
      const eh = Enemies.prototype.raycast.call(this.enemies, origin, dir, wh ? wh.dist : 250);
      points.push(eh ? eh.point : wh ? wh.point : origin.clone().addScaledVector(dir, 250));
    }
    this.events.push({ type: 'playerShot', pid: player.id, weapon: def.id, origin, points });
  }

  // a frame of the client: run the command on the predicted player, and send it
  step(dt, commands) {
    const cmd = commands.get(this.id);
    if (!cmd || this.over) return;
    const c = { ...cmd, seq: ++this.seq, dt };
    this.pending.push(c);
    this.#send({ t: 'cmd', s: c.seq, d: dt, c: cmd });
    this.#predict(cmd, dt);
    this.ctx.time += dt;
    this.time += dt;
    this.viewOffset.multiplyScalar(Math.exp(-12 * dt));
    this.#interpolate(dt);
  }

  // while paused the world goes on: keep drawing it, without moving the player
  idle(dt) {
    this.viewOffset.multiplyScalar(Math.exp(-12 * dt));
    this.#interpolate(dt);
  }

  #predict(cmd, dt) {
    const p = this.local;
    if (p.dead) return;
    p.move(dt, cmd, p.loadout.adsT > 0.5);
    p.loadout.update(dt, cmd);
  }

  drainEvents() { const e = this.events; this.events = []; return e; }
  get timeScale() { return 1; }

  #snapshot(m) {
    if (!this.players) return;
    const s = m.s;
    this.time = Math.max(this.time, s.time);
    this.weather = s.weather;
    Object.assign(this.mode, s.mode, { totalWaves: s.mode.totalWaves ?? Infinity });

    // own player: the server's state, then the commands it has not run yet
    const me = s.players.find((p) => p.id === this.id);
    if (me) {
      const before = this.local.pos.clone();
      readPlayer(this.local, me);
      this.pending = this.pending.filter((c) => c.seq > m.ack);
      this.replaying = true;
      this.ctx.time = s.time;
      for (const c of this.pending) { this.#predict(c, c.dt); this.ctx.time += c.dt; }
      this.replaying = false;
      const err = before.sub(this.local.pos);
      if (err.lengthSq() < 4) this.viewOffset.add(err); else this.viewOffset.set(0, 0, 0);
    }

    // the other players: drawn between snapshots (see #interpolate)
    const seen = new Set([this.id]);
    for (const ps of s.players) {
      if (ps.id === this.id) continue;
      seen.add(ps.id);
      let o = this.players.get(ps.id);
      if (!o) {
        o = { id: ps.id, remote: true, pos: new THREE.Vector3(...ps.pos), vel: new THREE.Vector3(), push: new THREE.Vector3(), recoil: { pitch: 0, yaw: 0 }, yaw: ps.yaw };
        this.players.set(ps.id, o);
      }
      readPlayer(o, ps);
      o.weaponIndex = ps.lo.index;
      o.aiming = ps.lo.adsT > 0.5;
    }
    for (const id of [...this.players.keys()]) if (!seen.has(id)) this.players.delete(id);

    // enemies, orbs and pickups that exist now; their positions are interpolated
    const live = new Set();
    for (const es of s.enemies) {
      live.add(es.i);
      let e = this.byId.get(es.i);
      if (!e) {
        e = { id: es.i, type: es.ty, T: TYPES[es.ty], elite: !!es.el, pos: new THREE.Vector3(...es.p), facing: es.f, act: null };
        this.byId.set(es.i, e);
      }
      Object.assign(e, { lift: es.l, rise: es.r, hidden: !!es.h, climbing: !!es.c, speed: es.s, stun: es.st, hp: es.hp, maxHp: es.mh });
      if (!es.a) e.act = null;
      else if (e.act?.n === es.a[3]) { e.act.t = es.a[1]; e.act.dur = es.a[2]; }
      else e.act = { kind: es.a[0], t: es.a[1], dur: es.a[2], n: es.a[3] };
    }
    for (const id of [...this.byId.keys()]) if (!live.has(id)) this.byId.delete(id);
    this.enemies.list = [...this.byId.values()];
    const orbs = new Map(this.enemies.projectiles.map((p) => [p.id, p]));
    this.enemies.projectiles = s.proj.map((p) => {
      const o = orbs.get(p.i) || { id: p.i, type: p.ty, pos: new THREE.Vector3(...p.p) };
      o.reflected = !!p.rf;
      return o;
    });
    this.enemies.pickups = s.pick.map((p) => ({ id: p.i, kind: p.k, pos: new THREE.Vector3(...p.p) }));

    // keep the positions for interpolation
    const snap = { time: s.time, en: new Map(), pl: new Map(), pr: new Map() };
    for (const es of s.enemies) snap.en.set(es.i, es);
    for (const ps of s.players) snap.pl.set(ps.id, ps);
    for (const p of s.proj) snap.pr.set(p.i, p.p);
    this.snaps.push(snap);
    while (this.snaps.length > 12) this.snaps.shift();
    if (this.renderTime === null) this.renderTime = s.time - INTERP_DELAY;

    for (const ev of reviveVectors(s.events)) {
      if (ev.pid === this.id && PREDICTED.has(ev.type)) continue;
      this.events.push(ev);
    }
    if (s.over && !this.over) { this.over = true; this.victory = s.victory; }
  }

  #interpolate(dt) {
    if (!this.snaps.length) return;
    const newest = this.snaps[this.snaps.length - 1];
    const target = newest.time - INTERP_DELAY;
    this.renderTime += dt;
    // stay close behind the newest snapshot: jump on big gaps, drift gently otherwise
    if (Math.abs(this.renderTime - target) > 0.25) this.renderTime = target;
    else this.renderTime += (target - this.renderTime) * 0.08;
    const t = this.renderTime;
    let a = this.snaps[0], b = newest;
    for (let i = 0; i < this.snaps.length - 1; i++) {
      if (this.snaps[i].time <= t && this.snaps[i + 1].time >= t) { a = this.snaps[i]; b = this.snaps[i + 1]; break; }
    }
    const k = b.time > a.time ? THREE.MathUtils.clamp((t - a.time) / (b.time - a.time), 0, 1) : 1;
    for (const e of this.enemies.list) {
      const ea = a.en.get(e.id), eb = b.en.get(e.id);
      if (ea && eb) {
        e.pos.set(ea.p[0] + (eb.p[0] - ea.p[0]) * k, ea.p[1] + (eb.p[1] - ea.p[1]) * k, ea.p[2] + (eb.p[2] - ea.p[2]) * k);
        e.facing = lerpAngle(ea.f, eb.f, k);
      } else if (eb || ea) {
        const s = eb || ea;
        e.pos.set(...s.p);
        e.facing = s.f;
      }
    }
    for (const o of this.players.values()) {
      if (!o.remote) continue;
      const pa = a.pl.get(o.id), pb = b.pl.get(o.id);
      if (!pa || !pb) continue;
      o.pos.set(pa.pos[0] + (pb.pos[0] - pa.pos[0]) * k, pa.pos[1] + (pb.pos[1] - pa.pos[1]) * k, pa.pos[2] + (pb.pos[2] - pa.pos[2]) * k);
      o.yaw = lerpAngle(pa.yaw, pb.yaw, k);
      o.pitch = pa.pitch + (pb.pitch - pa.pitch) * k;
    }
    for (const p of this.enemies.projectiles) {
      const pa = a.pr.get(p.id), pb = b.pr.get(p.id);
      if (pa && pb) p.pos.set(pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k, pa[2] + (pb[2] - pa[2]) * k);
      else if (pb || pa) p.pos.set(...(pb || pa));
    }
  }
}
