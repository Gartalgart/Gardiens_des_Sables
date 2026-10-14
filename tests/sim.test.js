import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Level } from '../src/sim/level.js';
import { Sim } from '../src/sim/sim.js';
import { emptyCommand } from '../src/sim/player.js';

const DT = 1 / 60;
// every event type handled by the client (src/main.js, handleEvents)
const KNOWN_EVENTS = [
  'playerShot', 'impactWall', 'impactEnemy', 'hitConfirm', 'meleeImpact', 'swing', 'slash', 'reload', 'dry', 'switch',
  'kick', 'step', 'reflectHit', 'blocked', 'playerHurt', 'playerDown', 'pickup', 'enemyKill', 'slam', 'wallStun', 'reflect',
  'growl', 'enemyFire', 'enemySpawn', 'enemyHit', 'ring', 'projectileEnd', 'banner', 'horn', 'unlock', 'gameOver',
  'perfectParry', 'prime', 'explosion', 'bossPhase2', 'weather', 'rainMark', 'rainStrike', 'teleportOut', 'teleportIn',
];
let level;

beforeAll(() => {
  const data = JSON.parse(readFileSync(new URL('../public/models/level.json', import.meta.url), 'utf8'));
  level = new Level(data);
});

// sandbox by default: no waves, so a test only meets the enemies it spawns
function newGame(opts = {}) {
  const sim = new Sim(level, { mode: 'sandbox', ...opts });
  const player = sim.addPlayer('p1');
  return { sim, player };
}

// command that looks at a point from the player's eye
function aimAt(player, target, extra = {}) {
  const eye = player.eye;
  const dx = target.x - eye.x, dy = target.y - eye.y, dz = target.z - eye.z;
  return { ...emptyCommand(), yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), ...extra };
}

function run(sim, seconds, cmdFor) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && !sim.over; i++) {
    const cmds = new Map();
    for (const p of sim.players.values()) cmds.set(p.id, cmdFor ? cmdFor(p, i) : emptyCommand());
    sim.step(DT, cmds);
  }
}

// keep enemies harmless when a test only checks movement or navigation
function pacify(e) {
  e.T = { ...e.T, leap: null, charge: null, ranged: null, slam: null, melee: { ...e.T.melee, range: 0.01 } };
  e.rise = 0;
  return e;
}

describe('level', () => {
  it('loads the collision data exported from Blender', () => {
    expect(level.boxes.length).toBe(251);
    expect(level.spawns.length).toBe(5);
    expect(level.braziers.length).toBe(14);
    expect(level.playerStart.toArray()).toEqual([0, 0, 38]);
  });

  it('blocks bodies against walls and lets them climb steps', () => {
    const pos = new THREE.Vector3(10, 0, -40); // x = 10: away from the north gate at x = 0
    for (let i = 0; i < 200; i++) level.moveBody(pos, 0, -0.1, 0.4, 1.8); // the north wall spans z -45..-47
    expect(pos.z).toBeCloseTo(-45 + 0.4, 2);
    expect(level.groundAt(0, -13.2, 0.3, 0.9)).toBeCloseTo(1.35, 2); // third step of the temple stairs
    expect(level.groundAt(0, -14, 0.3, 0.9)).toBe(0); // the fourth one (1.8 m) is too high from 0.9 m
  });
});

describe('player', () => {
  it('walks north when moving forward with yaw 0', () => {
    const { sim, player } = newGame();
    run(sim, 1, () => ({ ...emptyCommand(), moveZ: -1 }));
    expect(player.pos.z).toBeLessThan(38 - 4);
    expect(Math.abs(player.pos.x)).toBeLessThan(0.01);
  });

  it('regenerates health after the delay of the difficulty', () => {
    const { sim, player } = newGame({ difficulty: 'normal' });
    player.health = 40;
    player.lastHit = 0;
    run(sim, 2);
    expect(player.health).toBe(40);
    run(sim, 3);
    expect(player.health).toBe(100);
  });
});

describe('navigation', () => {
  it('brings enemies from the city to the top of the temple', () => {
    const { sim, player } = newGame();
    player.pos.set(0, 5.4, -27);
    player.health = player.maxHealth = 1e9; // jackals standing right on the player can still land a blow
    const starts = [[-2.9, -13.5], [-25, -10], [30, 20], [-40, -40]];
    const enemies = starts.map(([x, z], i) => pacify(sim.enemies.spawn(i === 3 ? 'tank' : 'runner', new THREE.Vector3(x, 0, z))));
    const reached = new Set();
    // 45 s: the tank walks round to the front of the stairs, about 90 m at 2.75 m/s
    run(sim, 45, () => {
      // big bodies stop further out, behind the jackals already crowding the player
      for (const e of enemies) if (e.pos.distanceTo(player.pos) < e.T.radius + 3) reached.add(e);
      return emptyCommand();
    });
    expect(reached.size).toBe(enemies.length);
  });

  it('sends each enemy after the nearest player', () => {
    const { sim, player } = newGame();
    const p2 = sim.addPlayer('p2');
    player.pos.set(-30, 0, 30);
    player.health = p2.health = 1e9;
    p2.pos.set(30, 0, 30);
    const e = pacify(sim.enemies.spawn('runner', new THREE.Vector3(25, 0, 10)));
    run(sim, 6);
    expect(e.target).toBe(p2);
    expect(e.pos.distanceTo(p2.pos)).toBeLessThan(4);
  });
});

describe('combat', () => {
  it('pistol shots damage the enemy in the crosshair and report hits', () => {
    const { sim, player } = newGame();
    const e = pacify(sim.enemies.spawn('tank', new THREE.Vector3(0, 0, 28)));
    e.T = { ...e.T, speed: 0 };
    const target = e.pos.clone().setY(1.2);
    run(sim, 0.5, (p, i) => aimAt(p, target, { fire: i % 2 === 0 }));
    expect(e.hp).toBeLessThan(e.maxHp);
    const events = sim.drainEvents().map((ev) => ev.type);
    expect(events).toContain('playerShot');
    expect(events).toContain('hitConfirm');
  });

  it('one khépesh slash kills the jackals in front and only blade kills drop health', () => {
    let health = 0, ammo = 0, killed = 0;
    for (let n = 0; n < 30; n++) {
      const { sim, player } = newGame();
      sim.step(DT, new Map([['p1', { ...emptyCommand(), slot: 0 }]]));
      run(sim, 0.4);
      const e = pacify(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 36)));
      e.T = { ...e.T, speed: 0 };
      run(sim, 0.3, (p, i) => ({ ...emptyCommand(), fire: i < 3 }));
      if (!sim.enemies.list.includes(e)) killed++;
      for (const p of sim.enemies.pickups) p.kind === 'health' ? health++ : ammo++;
      expect(player.stats.kills).toBe(sim.enemies.list.includes(e) ? 0 : 1);
    }
    expect(killed).toBe(30);
    expect(health).toBeGreaterThan(5);

    // ranged kills never drop health
    const { sim } = newGame();
    for (let i = 0; i < 40; i++) sim.enemies.damage(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 0)), 1e5, null, null);
    expect(sim.enemies.pickups.every((p) => p.kind === 'ammo')).toBe(true);
  });

  it('a parry sends the orb back into the shooter', () => {
    const { sim, player } = newGame();
    sim.step(DT, new Map([['p1', { ...emptyCommand(), slot: 0 }]]));
    run(sim, 0.4);
    const sh = sim.enemies.spawn('shooter', new THREE.Vector3(0, 0, 22));
    sh.rise = 0;
    sh.fireCd = 0;
    sh.T = { ...sh.T, speed: 0 };
    const hp0 = player.health;
    run(sim, 3, (p) => aimAt(p, sh.pos.clone().setY(1.5), { aim: true }));
    expect(player.health).toBe(hp0);
    expect(sh.hp).toBeLessThan(sh.maxHp);
  });

  it('a parry raised at the last moment is perfect: no damage, stagger and slow motion', () => {
    for (const late of [false, true]) {
      const { sim, player } = newGame();
      sim.step(DT, new Map([['p1', { ...emptyCommand(), slot: 0 }]]));
      run(sim, 0.4);
      const e = sim.enemies.spawn('tank', new THREE.Vector3(0, 0, 36));
      e.rise = 0;
      // the parry is raised now: perfect for a quarter of a second, a plain block afterwards
      run(sim, late ? 0.6 : 0.1, () => ({ ...emptyCommand(), aim: true }));
      const hp0 = player.health;
      sim.hitPlayer(player, 30, e.pos, 'melee', e);
      if (late) {
        expect(player.health).toBeCloseTo(hp0 - 30 * 0.25, 5);
        expect(e.stun).toBe(0);
      } else {
        expect(player.health).toBe(hp0);
        expect(e.stun).toBeGreaterThan(1);
        expect(sim.timeScale).toBeLessThan(1);
        expect(sim.drainEvents().map((ev) => ev.type)).toContain('perfectParry');
      }
    }
  });

  it('a dead player ends the game in defeat', () => {
    const { sim, player } = newGame({ mode: 'waves' });
    sim.hitPlayer(player, 500, new THREE.Vector3(0, 0, 30), 'melee');
    run(sim, 0.1);
    expect(sim.over).toBe(true);
    expect(sim.victory).toBe(false);
  });
});

describe('phase 5 enemies', () => {
  it('a mummy primes near the player and blows up, hurting the player and its neighbours', () => {
    const { sim, player } = newGame();
    player.health = player.maxHealth = 1000;
    const m = sim.enemies.spawn('mummy', new THREE.Vector3(0, 0, 35.5));
    m.rise = 0;
    const tank = pacify(sim.enemies.spawn('tank', new THREE.Vector3(2, 0, 34)));
    tank.T = { ...tank.T, speed: 0 };
    run(sim, 2);
    const types = sim.drainEvents().map((ev) => ev.type);
    expect(types).toContain('prime');
    expect(types).toContain('explosion');
    expect(sim.enemies.list.includes(m)).toBe(false);
    expect(player.health).toBeLessThan(1000);
    expect(tank.hp).toBeLessThan(tank.maxHp);
  });

  it('a mummy shot from afar still explodes, and chains into another mummy', () => {
    const { sim, player } = newGame();
    const a = pacify(sim.enemies.spawn('mummy', new THREE.Vector3(0, 0, 10)));
    const b = pacify(sim.enemies.spawn('mummy', new THREE.Vector3(1.5, 0, 10)));
    sim.enemies.damage(a, 1e6, null, player);
    expect(sim.enemies.list.includes(b)).toBe(false); // 160 damage at 1.5 m kills the second one
    expect(sim.drainEvents().filter((ev) => ev.type === 'explosion').length).toBe(2);
    expect(player.stats.kills).toBe(2);
  });

  it('scarabs climb straight up the temple wall instead of walking round to the stairs', () => {
    const { sim, player } = newGame();
    player.pos.set(-9, 2.7, -25); // first tier of the temple, west side
    player.health = player.maxHealth = 1e9;
    const sc = pacify(sim.enemies.spawn('scarab', new THREE.Vector3(-15, 0, -25)));
    const walker = pacify(sim.enemies.spawn('runner', new THREE.Vector3(-15, 0, -26)));
    let tScarab = null, tWalker = null, climbed = false;
    run(sim, 20, (p, i) => {
      if (sc.climbing) climbed = true;
      if (tScarab === null && sc.pos.distanceTo(player.pos) < 1.6) tScarab = i * DT;
      if (tWalker === null && walker.pos.distanceTo(player.pos) < 2.5) tWalker = i * DT;
      return emptyCommand();
    });
    expect(climbed).toBe(true);
    expect(tScarab).not.toBeNull();
    expect(tScarab).toBeLessThan(tWalker ?? Infinity);
  });

  it('elites have twice the health and always drop something', () => {
    const { sim } = newGame();
    const e = sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 0), { elite: true });
    expect(e.hp).toBe(140);
    for (let i = 0; i < 20; i++) sim.enemies.damage(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 0), { elite: true }), 1e6, null, null);
    expect(sim.enemies.pickups.length).toBe(20);
  });

  it('the pharaoh changes at half health: immune while rising, then storm, orb rain and teleports', () => {
    const { sim, player } = newGame();
    player.health = player.maxHealth = 1e6;
    const boss = sim.enemies.spawn('boss', new THREE.Vector3(0, 0, 20));
    boss.rise = 0;
    sim.enemies.damage(boss, boss.maxHp * 0.55, null, player);
    run(sim, 0.1);
    expect(boss.act?.kind).toBe('transform');
    expect(sim.weather).toBe('sandstorm');
    const hp = boss.hp;
    sim.enemies.damage(boss, 500, null, player);
    expect(boss.hp).toBe(hp); // immune while changing
    const types = new Set();
    run(sim, 12, () => { for (const ev of sim.drainEvents()) types.add(ev.type); return emptyCommand(); });
    for (const t of ['bossPhase2', 'rainMark', 'rainStrike', 'teleportOut', 'teleportIn']) expect(types).toContain(t);
    expect(player.stats.damageTaken).toBeGreaterThan(0);
  });
});

describe('waves mode', () => {
  it('runs the five waves to victory and unlocks the rifle then the shotgun', () => {
    const { sim, player } = newGame({ mode: 'waves', difficulty: 'normal' });
    sim.start();
    const unlocks = [];
    const types = new Set();
    let kills = 0;
    for (let i = 0; i < 20000 && !sim.over; i++) {
      sim.mode.breakTimer = Math.min(sim.mode.breakTimer, 0.1);
      sim.mode.spawnTimer = Math.min(sim.mode.spawnTimer, 0.05);
      player.health = 100;
      // the boss loses health in chunks so he goes through both summon thresholds
      for (const e of [...sim.enemies.list]) if (e.rise === 0) sim.enemies.damage(e, e.T.boss ? 600 : 1e6, null, player);
      sim.step(DT, new Map([['p1', emptyCommand()]]));
      for (const ev of sim.drainEvents()) {
        types.add(ev.type);
        if (ev.type === 'enemyKill') kills++;
        if (ev.type === 'unlock') unlocks.push(ev.weapon);
      }
    }
    expect(sim.over).toBe(true);
    expect(sim.victory).toBe(true);
    expect(unlocks).toEqual(['rifle', 'shotgun']);
    expect(kills).toBe(112); // 104 wave enemies + two summons of 4 jackals
    expect(player.loadout.items.every((it) => it.unlocked)).toBe(true);
    // every event the client must react to is there, and no data field replaced an event type
    for (const t of ['enemySpawn', 'enemyHit', 'enemyKill', 'banner', 'horn', 'unlock', 'gameOver']) expect(types).toContain(t);
    for (const t of types) expect(KNOWN_EVENTS).toContain(t);
  });
});
