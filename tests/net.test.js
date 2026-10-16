import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import WebSocket from 'ws';
import { Level } from '../src/sim/level.js';
import { Sim } from '../src/sim/sim.js';
import { PlayerSim, emptyCommand } from '../src/sim/player.js';
import { writePlayer, readPlayer, writeWorld, reviveVectors } from '../src/net/protocol.js';

let level;
beforeAll(() => {
  level = new Level(JSON.parse(readFileSync(new URL('../public/models/level.json', import.meta.url), 'utf8')));
});

describe('protocol', () => {
  it('a player read back from a snapshot predicts exactly like the server', () => {
    const sim = new Sim(level, { mode: 'sandbox' });
    const server = sim.addPlayer('p1');
    const cmds = [];
    for (let i = 0; i < 90; i++) cmds.push({ ...emptyCommand(), moveZ: -1, moveX: i > 40 ? 1 : 0, sprint: i < 30, jump: i === 50, yaw: i * 0.01, fire: i % 20 === 0 });
    // the server runs the first 60 commands, the client the same 60 and then 30 more
    for (const c of cmds.slice(0, 60)) { sim.stepPlayer(server, c, 1 / 60); sim.stepWorld(1 / 60); }
    const ctx = { level, difficulty: sim.difficulty, time: sim.time, emit() {}, fireWeapon() {}, meleeAttack: () => 0 };
    const client = new PlayerSim('p1', ctx);
    readPlayer(client, JSON.parse(JSON.stringify(writePlayer(server))));
    for (const c of cmds.slice(60)) { client.move(1 / 60, c, client.loadout.adsT > 0.5); client.loadout.update(1 / 60, c); }
    for (const c of cmds.slice(60)) { sim.stepPlayer(server, c, 1 / 60); sim.stepWorld(1 / 60); }
    expect(client.pos.distanceTo(server.pos)).toBeLessThan(0.01);
    expect(client.loadout.current.mag).toBe(server.loadout.current.mag);
    expect(client.loadout.items[1].reserve).toBe(Infinity);
  });

  it('a world snapshot survives JSON, vectors included', () => {
    const sim = new Sim(level, { mode: 'sandbox' });
    sim.addPlayer('p1');
    sim.enemies.spawn('runner', new THREE.Vector3(3, 0, 3), { elite: true });
    const s = JSON.parse(JSON.stringify(writeWorld(sim, sim.drainEvents())));
    expect(s.enemies[0]).toMatchObject({ ty: 'runner', el: 1, p: [3, 0, 3] });
    const ev = reviveVectors(s.events).find((e) => e.type === 'enemySpawn');
    expect(ev.pos).toBeInstanceOf(THREE.Vector3);
  });
});

// The real server, in its own process, with two clients that create a room, join it and play.
describe('server', () => {
  const PORT = 18000 + Math.floor(Math.random() * 1000);
  let proc;
  beforeAll(async () => {
    proc = spawn(process.execPath, [fileURLToPath(new URL('../server/index.js', import.meta.url))], { env: { ...process.env, PORT: String(PORT) } });
    await new Promise((resolve, reject) => {
      proc.stdout.on('data', (d) => { if (String(d).includes('ws://')) resolve(); });
      proc.on('exit', () => reject(new Error('server exited')));
    });
  });
  afterAll(() => proc?.kill());

  function client(name) {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const c = { ws, msgs: [], id: null };
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'welcome') c.id = m.id;
      c.msgs.push(m);
    });
    c.open = new Promise((r) => ws.on('open', r)).then(() => ws.send(JSON.stringify({ t: 'hello', name })));
    c.send = (m) => ws.send(JSON.stringify(m));
    c.wait = async (pred, ms = 3000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const m = c.msgs.find(pred);
        if (m) return m;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error('timeout');
    };
    return c;
  }

  it('two players share a room, a game and the world', async () => {
    const a = client('Alice'), b = client('Bob');
    await Promise.all([a.open, b.open]);
    a.send({ t: 'create' });
    const room = await a.wait((m) => m.t === 'room');
    expect(room.code).toMatch(/^[A-Z]{4}$/);
    b.send({ t: 'join', code: room.code });
    const full = await b.wait((m) => m.t === 'room' && m.players.length === 2);
    expect(full.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    b.send({ t: 'start' }); // not the host: ignored
    a.send({ t: 'config', mode: 'waves', difficulty: 'easy' });
    await b.wait((m) => m.t === 'room' && m.difficulty === 'easy');
    a.send({ t: 'start' });
    await b.wait((m) => m.t === 'start');

    // Bob walks forward for half a second; Alice sees him move
    const first = await a.wait((m) => m.t === 'snap');
    const bob0 = first.s.players.find((p) => p.id === b.id).pos;
    for (let i = 1; i <= 30; i++) b.send({ t: 'cmd', s: i, d: 1 / 60, c: { ...emptyCommand(), moveZ: -1 } });
    const later = await a.wait((m) => m.t === 'snap' && m.s.players.find((p) => p.id === b.id).pos[2] < bob0[2] - 1);
    expect(later.s.players.length).toBe(2);
    const bobAck = await b.wait((m) => m.t === 'snap' && m.ack === 30);
    expect(bobAck.s.mode.id).toBe('waves');

    // Bob leaves: Alice plays on alone
    b.ws.close();
    await a.wait((m) => m.t === 'room' && m.players.length === 1);
    a.msgs.length = 0;
    const alone = await a.wait((m) => m.t === 'snap');
    expect(alone.s.players.map((p) => p.name)).toEqual(['Alice']);
    a.ws.close();
  });

  it('a wrong code is refused', async () => {
    const c = client('Carl');
    await c.open;
    c.send({ t: 'join', code: 'ZZZZ' });
    const err = await c.wait((m) => m.t === 'error');
    expect(err.msg).toMatch(/Aucun salon/);
    c.ws.close();
  });
});
