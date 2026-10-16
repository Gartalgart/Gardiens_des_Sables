// Co-op server: rooms joined by a four-letter code, each running the shared simulation
// (src/sim) 30 times per second. Clients send their input commands and get snapshots back.
//   npm run server        (listens on port 8787, or $PORT)
import { WebSocketServer } from 'ws';
import { readFileSync } from 'node:fs';
import { Level } from '../src/sim/level.js';
import { Sim } from '../src/sim/sim.js';
import { DIFFICULTIES } from '../src/sim/difficulty.js';
import { PORT, TICK, writeWorld, roomCode } from '../src/net/protocol.js';

const LEVEL_DATA = JSON.parse(readFileSync(new URL('../public/models/level.json', import.meta.url), 'utf8'));
const MAX_PLAYERS = 4;
const MODES = ['waves', 'survival'];

const rooms = new Map();
const clients = new Set();
let lastClientId = 0;

// the rooms a player could join, sent to everyone who is not in a room yet
function openRooms() {
  return [...rooms.values()].filter((r) => !r.playing && r.clients.length < MAX_PLAYERS)
    .map((r) => ({ code: r.code, host: r.host?.name, players: r.clients.length, mode: r.mode, difficulty: r.difficulty }));
}
function broadcastRooms() {
  const s = JSON.stringify({ t: 'rooms', rooms: openRooms() });
  for (const c of clients) if (!c.room) c.ws.send(s);
}

class Room {
  constructor(code) {
    this.code = code;
    this.clients = []; // in joining order: the first one is the host
    this.mode = 'waves';
    this.difficulty = 'normal';
    this.sim = null;
    this.timer = null;
    // each room has its own level: the navigation grid keeps state about its players
    this.level = new Level(LEVEL_DATA);
  }

  get host() { return this.clients[0] ?? null; }
  get playing() { return !!this.sim && !this.sim.over; }

  send(msg) {
    const s = JSON.stringify(msg);
    for (const c of this.clients) c.ws.send(s);
  }

  broadcastRoom() {
    this.send({
      t: 'room', code: this.code, host: this.host?.id, mode: this.mode, difficulty: this.difficulty, playing: this.playing,
      players: this.clients.map((c) => ({ id: c.id, name: c.name })),
    });
    broadcastRooms();
  }

  add(client) {
    // two "Joueur" in one room would be indistinguishable in the HUD
    const base = client.name;
    for (let n = 2; this.clients.some((c) => c.name === client.name); n++) client.name = `${base.slice(0, 13)} ${n}`;
    client.room = this;
    this.clients.push(client);
    this.broadcastRoom();
  }

  remove(client) {
    this.clients = this.clients.filter((c) => c !== client);
    client.room = null;
    this.sim?.removePlayer(client.id);
    broadcastRooms();
    if (!this.clients.length) return this.close();
    if (this.sim && !this.sim.alivePlayers().length) this.sim.end(false);
    this.broadcastRoom();
  }

  close() {
    clearInterval(this.timer);
    rooms.delete(this.code);
    broadcastRooms();
  }

  start() {
    if (this.playing) return;
    this.sim = new Sim(this.level, { mode: this.mode, difficulty: this.difficulty });
    this.clients.forEach((c, i) => {
      const p = this.sim.addPlayer(c.id);
      p.name = c.name;
      p.pos.x += (i - (this.clients.length - 1) / 2) * 1.6; // side by side at the start
      c.cmds = [];
      c.ack = 0;
    });
    this.sim.start();
    broadcastRooms();
    this.send({ t: 'start', mode: this.mode, difficulty: this.difficulty, players: this.clients.map((c) => ({ id: c.id, name: c.name })) });
    this.last = performance.now();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), TICK * 1000);
  }

  tick() {
    const sim = this.sim;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // every command each client sent since the last tick, in order, each with its own dt
    for (const c of this.clients) {
      const p = sim.players.get(c.id);
      for (const { s, d, c: cmd } of c.cmds) {
        if (p) sim.stepPlayer(p, cmd, Math.min(0.05, d));
        c.ack = s;
      }
      c.cmds = [];
    }
    sim.stepWorld(dt);
    const world = JSON.stringify(writeWorld(sim, sim.drainEvents()));
    for (const c of this.clients) c.ws.send(`{"t":"snap","ack":${c.ack},"s":${world}}`);
    if (sim.over) {
      clearInterval(this.timer);
      this.broadcastRoom();
    }
  }
}

const wss = new WebSocketServer({ port: Number(process.env.PORT) || PORT });
wss.on('connection', (ws) => {
  const client = { id: `p${++lastClientId}`, name: 'Joueur', ws, room: null, cmds: [], ack: 0 };
  const error = (msg) => ws.send(JSON.stringify({ t: 'error', msg }));
  clients.add(client);
  ws.send(JSON.stringify({ t: 'welcome', id: client.id }));
  ws.send(JSON.stringify({ t: 'rooms', rooms: openRooms() }));

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const room = client.room;
    switch (m.t) {
      case 'hello':
        client.name = String(m.name || 'Joueur').slice(0, 16);
        break;
      case 'create': {
        if (room) room.remove(client);
        let code;
        do code = roomCode(); while (rooms.has(code));
        const r = new Room(code);
        rooms.set(code, r);
        r.add(client);
        break;
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return error('Aucun salon avec ce code.');
        if (r.playing) return error('La partie de ce salon a déjà commencé.');
        if (r.clients.length >= MAX_PLAYERS) return error(`Salon complet (${MAX_PLAYERS} joueurs).`);
        if (room) room.remove(client);
        r.add(client);
        break;
      }
      case 'config':
        if (!room || room.host !== client || room.playing) return;
        if (MODES.includes(m.mode)) room.mode = m.mode;
        if (DIFFICULTIES[m.difficulty]) room.difficulty = m.difficulty;
        room.broadcastRoom();
        break;
      case 'start':
        if (room && room.host === client) room.start();
        break;
      case 'cmd':
        if (room?.playing && Number.isFinite(m.s) && m.c) client.cmds.push(m);
        break;
      case 'leave':
        if (room) room.remove(client);
        break;
    }
  });
  ws.on('close', () => { clients.delete(client); client.room?.remove(client); });
});

console.log(`Serveur coop des Gardiens des Sables : ws://localhost:${wss.options.port}`);
