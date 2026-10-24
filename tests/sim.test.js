import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Level } from '../src/sim/level.js';
import { Sim } from '../src/sim/sim.js';
import { emptyCommand } from '../src/sim/player.js';
import { applyUpgrade, drawCards, UPGRADES } from '../src/sim/progression.js';
import { WORLDS, getWorld } from '../src/worlds/index.js';

const DT = 1 / 60;
// every event type handled by the client (src/main.js, handleEvents)
const KNOWN_EVENTS = [
  'playerShot', 'impactWall', 'impactEnemy', 'hitConfirm', 'meleeImpact', 'swing', 'slash', 'reload', 'shell', 'dry', 'switch',
  'kick', 'step', 'reflectHit', 'blocked', 'playerHurt', 'playerDown', 'pickup', 'enemyKill', 'slam', 'wallStun', 'reflect',
  'growl', 'enemyFire', 'enemySpawn', 'enemyHit', 'ring', 'projectileEnd', 'banner', 'horn', 'unlock', 'gameOver',
  'perfectParry', 'objective', 'cardOffer', 'cardPicked', 'frag', 'respawn', 'impactPlayer', 'points', 'multikill', 'spree', 'grenadeThrow', 'grenadeBounce', 'headshotKill', 'prime', 'explosion', 'bossPhase2', 'weather', 'rainMark', 'rainStrike', 'teleportOut', 'teleportIn',
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
    expect(level.boxes.length).toBe(313);
    expect(level.spawns.length).toBe(5);
    expect(level.braziers.length).toBe(17); // 14 in the streets, one in each house you can enter
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
    run(sim, 3.1);
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

describe('houses', () => {
  // H1: a house you can walk into, door on its east side; T1: a house with stairs up to a roof terrace
  const H1 = { x: -18.55, z: 7.89, w: 6.1, d: 6.6 };
  const inH1 = (p) => Math.abs(p.x - H1.x) < H1.w / 2 && Math.abs(p.z - H1.z) < H1.d / 2;

  it('a jackal walks round the house and in through the door', () => {
    const { sim, player } = newGame();
    player.pos.set(H1.x + 1, 0, H1.z);
    player.health = player.maxHealth = 1e9;
    const e = pacify(sim.enemies.spawn('runner', new THREE.Vector3(H1.x - 6, 0, H1.z + 9)));
    let maxY = 0;
    run(sim, 15, () => { if (inH1(e.pos)) maxY = Math.max(maxY, e.pos.y); return emptyCommand(); });
    expect(e.pos.distanceTo(player.pos)).toBeLessThan(2);
    expect(maxY).toBeLessThan(0.5); // on the floor, not on the roof
  });

  it('a jackal climbs the outside stairs to a player on the roof terrace', () => {
    const { sim, player } = newGame();
    player.pos.set(20.5, 4.99, 8.7);
    player.health = player.maxHealth = 1e9;
    const e = pacify(sim.enemies.spawn('runner', new THREE.Vector3(28, 0, 16)));
    run(sim, 15);
    expect(e.pos.y).toBeGreaterThan(4.5);
    expect(e.pos.distanceTo(player.pos)).toBeLessThan(2.5);
  });

  it('slower walkers (priest, mummy) get past the parapet at the top of those stairs', () => {
    for (const type of ['shooter', 'mummy']) {
      const { sim, player } = newGame();
      player.pos.set(20.5, 4.99, 8.7);
      player.health = player.maxHealth = 1e9;
      const e = pacify(sim.enemies.spawn(type, new THREE.Vector3(28, 0, 16)));
      e.T = { ...e.T, prime: null };
      run(sim, 15);
      expect(e.pos.y).toBeGreaterThan(4.5);
      expect(e.pos.distanceTo(player.pos)).toBeLessThan(2.5);
    }
  });

  it('scarabs do not climb onto a roof to reach a player inside', () => {
    const { sim, player } = newGame();
    player.pos.set(H1.x + 1, 0, H1.z);
    player.health = player.maxHealth = 1e9;
    const sc = pacify(sim.enemies.spawn('scarab', new THREE.Vector3(H1.x - 1, 0, H1.z - 6)));
    let maxY = 0;
    run(sim, 15, () => { if (inH1(sc.pos)) maxY = Math.max(maxY, sc.pos.y); return emptyCommand(); });
    expect(maxY).toBeLessThan(0.5);
    expect(sc.pos.distanceTo(player.pos)).toBeLessThan(2);
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

describe('shotgun', () => {
  it('reloads one shell at a time, and a trigger pull stops the reload', () => {
    const { sim, player } = newGame();
    const lo = player.loadout;
    const sg = lo.items[3];
    sg.unlocked = true;
    lo.switchTo(3);
    run(sim, 0.5);
    sg.mag = 2;
    const reserve = sg.reserve;
    lo.startReload();
    expect(lo.shells).toBe(4);
    run(sim, 0.35 + 0.34 * 2 + 0.01); // open, then two shells
    expect(sg.mag).toBe(4);
    expect(sg.reserve).toBe(reserve - 2);
    run(sim, 0.1, () => ({ ...emptyCommand(), fire: true }));
    expect(lo.reloading).toBe(0);
    run(sim, 0.4, () => ({ ...emptyCommand(), fire: true }));
    expect(sg.mag).toBe(3); // it fired once the pump closed
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
    player.pos.set(0, 0, 24); // close enough that the cornered pharaoh teleports away
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
    run(sim, 12, () => {
      for (const ev of sim.drainEvents()) types.add(ev.type);
      // stay on top of him: a cornered pharaoh always teleports (otherwise it is left to chance)
      if (!boss.hidden) player.pos.set(boss.pos.x, boss.pos.y, boss.pos.z + 3);
      return emptyCommand();
    });
    for (const t of ['bossPhase2', 'rainMark', 'rainStrike', 'teleportOut', 'teleportIn']) expect(types).toContain(t);
    expect(player.stats.damageTaken).toBeGreaterThan(0);
  });
});

describe('progression', () => {
  it('upgrade cards change the rules: bigger magazines, faster reload, stronger blade', () => {
    const { sim, player } = newGame();
    applyUpgrade(player, 'bigMags');
    applyUpgrade(player, 'quickHands');
    const lo = player.loadout;
    const pistol = lo.items[1];
    pistol.mag = 0;
    lo.startReload();
    expect(lo.reloading).toBeCloseTo(1.25 * 0.7, 5);
    run(sim, 1);
    expect(pistol.mag).toBe(18); // 12 * 1.5
    applyUpgrade(player, 'vitality');
    expect(player.maxHealth).toBe(125);
    expect(player.health).toBe(125);
  });

  it('a card at its maximum is never drawn again', () => {
    const { player } = newGame();
    applyUpgrade(player, 'piercing');
    expect(applyUpgrade(player, 'piercing')).toBe(false);
    for (let i = 0; i < 50; i++) expect(drawCards(player, 4)).not.toContain('piercing');
    for (const u of UPGRADES) while (applyUpgrade(player, u.id));
    expect(drawCards(player, 3)).toEqual([]);
  });

  it('piercing bullets go through the first enemy into the next one', () => {
    const { sim, player } = newGame();
    applyUpgrade(player, 'piercing');
    const a = pacify(sim.enemies.spawn('tank', new THREE.Vector3(0, 0, 30)));
    const b = pacify(sim.enemies.spawn('tank', new THREE.Vector3(0, 0, 24)));
    a.T = b.T = { ...a.T, speed: 0 };
    run(sim, 0.05, (p) => aimAt(p, new THREE.Vector3(0, 1.3, 20), { fire: true }));
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('clearing a wave offers cards (four after a completed objective) and scores the wave', () => {
    const { sim, player } = newGame({ mode: 'waves' });
    sim.start();
    run(sim, 3); // wave 1 begins
    sim.mode.objective = { id: 'blade', text: 'test', target: 1, stat: 'meleeKills' };
    player.waveStats.meleeKills = 1;
    sim.mode.queue = [];
    for (const e of [...sim.enemies.list]) sim.enemies.damage(e, 1e6, null, null);
    run(sim, 0.1);
    expect(player.cardOffer.length).toBe(4);
    expect(player.score).toBe(500 + 1000);
    const wave = sim.mode.wave;
    run(sim, 10);
    expect(sim.mode.wave).toBe(wave); // the break waits for the card
    sim.step(DT, new Map([['p1', { ...emptyCommand(), pickCard: 2 }]]));
    expect(player.cardOffer).toBe(null);
    expect(Object.keys(player.upgrades).length).toBe(1);
    run(sim, 8);
    expect(sim.mode.wave).toBe(wave + 1);
  });

  it('kills are scored by type, doubled for elites and scaled by difficulty', () => {
    const { sim, player } = newGame({ difficulty: 'hard' });
    sim.enemies.damage(sim.enemies.spawn('tank', new THREE.Vector3(0, 0, 0)), 1e6, null, player);
    expect(player.score).toBe(600); // 400 x 1.5
    sim.enemies.damage(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 0), { elite: true }), 1e6, null, player);
    expect(player.score).toBe(900);
  });
});

describe('co-op', () => {
  function coopGame(mode = 'sandbox') {
    const sim = new Sim(level, { mode });
    const a = sim.addPlayer('a'), b = sim.addPlayer('b');
    b.pos.x += 1.5;
    return { sim, a, b };
  }
  const use = (id) => (p) => ({ ...emptyCommand(), use: p.id === id });

  it('a downed player is picked up by a teammate holding the use key for 3 s', () => {
    const { sim, a, b } = coopGame();
    sim.hitPlayer(b, 500, b.pos.clone().add(new THREE.Vector3(0, 0, -1)), 'melee');
    expect(b.dead).toBe(true);
    expect(sim.over).toBe(false); // a teammate still stands
    run(sim, 2, use('a'));
    expect(b.dead).toBe(true);
    expect(b.revive).toBeGreaterThan(0.6);
    run(sim, 1.2, use('a'));
    expect(b.dead).toBe(false);
    expect(b.health).toBeCloseTo(b.maxHealth * 0.4, 0);
    expect(a.score).toBeGreaterThan(0);
    expect(sim.drainEvents().some((e) => e.type === 'playerRevived' && e.pid === 'b' && e.by === 'a')).toBe(true);
  });

  it('too far away nobody gets picked up, and the progress fades when the key is let go', () => {
    const { sim, a, b } = coopGame();
    sim.hitPlayer(b, 500, b.pos.clone(), 'explosion');
    run(sim, 1.5, use('a'));
    const half = b.revive;
    run(sim, 1, () => emptyCommand());
    expect(b.revive).toBeLessThan(half);
    a.pos.x += 6;
    run(sim, 4, use('a'));
    expect(b.dead).toBe(true);
  });

  it('the game is lost when every player is down', () => {
    const { sim, a, b } = coopGame('waves');
    sim.start();
    sim.hitPlayer(a, 500, a.pos.clone(), 'explosion');
    run(sim, 0.5);
    expect(sim.over).toBe(false);
    sim.hitPlayer(b, 500, b.pos.clone(), 'explosion');
    run(sim, 0.5);
    expect(sim.over).toBe(true);
    expect(sim.victory).toBe(false);
  });

  it('more players bring more enemies, and the end of a wave picks the downed up', () => {
    const { sim, a, b } = coopGame('waves');
    a.health = a.maxHealth = b.health = b.maxHealth = 1e9;
    sim.start();
    run(sim, 3); // the first break, then wave 1 begins
    expect(sim.mode.wave).toBe(1);
    expect(sim.mode.enemiesLeft).toBe(Math.round(8 * 1.6)); // 8 jackals alone
    b.health = 1; sim.hitPlayer(b, 10, b.pos.clone(), 'explosion');
    expect(b.dead).toBe(true);
    // a clears the wave
    for (let i = 0; i < 4000 && sim.mode.wave === 1 && sim.mode.waveActive; i++) {
      for (const e of sim.enemies.list) if (e.rise <= 0) sim.enemies.damage(e, 1e6, null, a);
      run(sim, DT);
    }
    expect(sim.mode.waveActive).toBe(false);
    expect(b.dead).toBe(false);
  });
});

describe('survival mode', () => {
  it('goes on past wave 5, with the pharaoh every fifth wave', () => {
    const { sim, player } = newGame({ mode: 'survival' });
    sim.start();
    const bosses = [];
    const cardWaves = [];
    for (let i = 0; i < 60000 && sim.mode.wave < 11; i++) {
      if (player.cardOffer && !cardWaves.includes(sim.mode.wave)) cardWaves.push(sim.mode.wave);
      sim.mode.breakTimer = Math.min(sim.mode.breakTimer, 0.1);
      sim.mode.spawnTimer = Math.min(sim.mode.spawnTimer, 0.05);
      player.health = player.maxHealth;
      if (player.cardOffer) sim.pickCard(player, 0);
      for (const e of [...sim.enemies.list]) if (e.rise === 0) {
        if (e.T.boss && !bosses.includes(sim.mode.wave)) bosses.push(sim.mode.wave);
        sim.enemies.damage(e, e.T.boss ? 900 : 1e6, null, player);
      }
      sim.step(DT, new Map([['p1', emptyCommand()]]));
    }
    expect(sim.over).toBe(false);
    expect(sim.mode.wave).toBe(11);
    expect(bosses).toEqual([5, 10]);
    expect(cardWaves).toEqual([5, 10]); // cards only after every fifth wave
    expect(sim.mode.totalWaves).toBe(Infinity);
  });
});

describe('waves mode', () => {
  it('runs the five waves to victory and unlocks the rifle, the shotgun, then the precision rifle', () => {
    const { sim, player } = newGame({ mode: 'waves', difficulty: 'normal' });
    sim.start();
    const unlocks = [];
    const types = new Set();
    let kills = 0;
    for (let i = 0; i < 20000 && !sim.over; i++) {
      sim.mode.breakTimer = Math.min(sim.mode.breakTimer, 0.1);
      sim.mode.spawnTimer = Math.min(sim.mode.spawnTimer, 0.05);
      player.health = 100;
      if (player.cardOffer) sim.pickCard(player, 0);
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
    expect(unlocks).toEqual(['rifle', 'shotgun', 'sniper']);
    expect(kills).toBe(112); // 104 wave enemies + two summons of 4 jackals
    expect(player.loadout.items.every((it) => it.unlocked)).toBe(true);
    // every event the client must react to is there, and no data field replaced an event type
    for (const t of ['enemySpawn', 'enemyHit', 'enemyKill', 'banner', 'horn', 'unlock', 'gameOver']) expect(types).toContain(t);
    for (const t of types) expect(KNOWN_EVENTS).toContain(t);
  });
});

describe('arena mode', () => {
  // two players face to face on the open sand south of the city, no guardian in the way
  function arenaGame(opts = {}) {
    const sim = new Sim(level, { mode: 'arena', arena: opts });
    const a = sim.addPlayer('a'), b = sim.addPlayer('b');
    sim.start();
    sim.mode.guardTimer = 1e9;
    a.pos.set(0, 0, 38); b.pos.set(0, 0, 30);
    a.eyeY = b.eyeY = 1.65;
    sim.drainEvents();
    return { sim, a, b };
  }
  const idle = () => emptyCommand();

  it('starts everyone at a different gate with all four weapons', () => {
    const sim = new Sim(level, { mode: 'arena' });
    const a = sim.addPlayer('a'), b = sim.addPlayer('b');
    sim.start();
    expect(a.pos.distanceTo(b.pos)).toBeGreaterThan(10);
    for (const p of [a, b]) expect(p.loadout.items.every((it) => it.unlocked)).toBe(true);
    expect(sim.mode.scoreLimit).toBe(15);
    expect(sim.mode.timeLimit).toBe(480);
  });

  it('bullets hurt the other players, more in the head', () => {
    const { sim, a, b } = arenaGame();
    const fire = (target) => (p) => (p === a ? aimAt(a, target, { fire: true }) : idle());
    run(sim, DT, fire(b.center));
    expect(b.health).toBeCloseTo(100 - 34 * 0.8, 1);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'hitConfirm' && e.pid === 'a' && !e.head)).toBe(true);
    b.health = 100;
    run(sim, 0.3, idle);
    run(sim, DT, fire(new THREE.Vector3(b.pos.x, b.pos.y + 1.64, b.pos.z)));
    expect(b.health).toBeLessThan(100 - 34 * 0.8 * 1.9);
  });

  it('a kill scores a point, the victim comes back 4 s later elsewhere, protected for a moment', () => {
    const { sim, a, b } = arenaGame();
    sim.hitPlayer(b, 500, a.pos, 'bullet', null, { by: a, weapon: 'rifle' });
    expect(b.dead).toBe(true);
    expect(a.stats.frags).toBe(1);
    expect(a.score).toBe(1);
    expect(b.stats.deaths).toBe(1);
    expect(sim.drainEvents().some((e) => e.type === 'frag' && e.pid === 'b' && e.by === 'a' && e.weapon === 'rifle')).toBe(true);
    const where = b.pos.clone();
    run(sim, 3.5, idle);
    expect(b.dead).toBe(true);
    run(sim, 0.6, idle);
    expect(b.dead).toBe(false);
    expect(b.health).toBe(100);
    expect(b.pos.distanceTo(where)).toBeGreaterThan(5);
    expect(b.pos.distanceTo(a.pos)).toBeGreaterThan(15);
    expect(sim.hitPlayer(b, 50, a.pos, 'bullet', null, { by: a, weapon: 'rifle' })).toBe('immune');
    run(sim, 2.1, idle);
    expect(sim.hitPlayer(b, 50, a.pos, 'bullet', null, { by: a, weapon: 'rifle' })).toBe('hit');
    // dying to a guardian costs no one a point
    sim.hitPlayer(a, 500, b.pos, 'melee');
    expect(b.stats.frags).toBe(0);
  });

  it('the khépesh strikes players and parries their blade, but not bullets', () => {
    const { sim, a, b } = arenaGame();
    b.pos.set(0, 0, 36.5);
    const sword = (p) => ({ ...aimAt(p, (p === a ? b : a).center), slot: 0 });
    run(sim, 0.5, sword);
    // a swings at b, who does nothing: two strikes take most of a full life
    run(sim, 0.2, (p) => (p === a ? { ...sword(p), fire: true } : sword(p)));
    expect(b.health).toBeCloseTo(100 - 85 * 0.6, 0);
    run(sim, 0.6, sword);
    b.health = 100;
    // b raises the blade: the strike is blocked
    run(sim, 0.4, (p) => ({ ...sword(p), aim: p === b }));
    run(sim, 0.2, (p) => ({ ...sword(p), aim: p === b, fire: p === a }));
    expect(b.health).toBeGreaterThan(100 - 85 * 0.6 * 0.3);
    expect(sim.hitPlayer(b, 20, a.pos, 'bullet', null, { by: a, weapon: 'pistol' })).toBe('hit');
  });

  it('ends at the score limit, or with the best player when the time runs out', () => {
    const { sim, a, b } = arenaGame({ scoreLimit: 10 });
    for (let i = 0; i < 10; i++) {
      sim.raise(b, 1);
      b.protect = 0;
      sim.hitPlayer(b, 500, a.pos, 'bullet', null, { by: a, weapon: 'pistol' });
    }
    expect(sim.over).toBe(true);
    expect(sim.winner).toBe('a');
    expect(sim.drainEvents().some((e) => e.type === 'gameOver' && e.winner === 'a')).toBe(true);

    const t = arenaGame({ timeLimit: 300 });
    expect(t.sim.mode.timeLimit).toBe(300);
    t.sim.hitPlayer(t.a, 500, t.b.pos, 'bullet', null, { by: t.b, weapon: 'pistol' });
    t.sim.mode.timeLeft = 0.01;
    run(t.sim, 0.1, idle);
    expect(t.sim.over).toBe(true);
    expect(t.sim.winner).toBe('b');
  });
});

describe('phase 10: grenades, points and the announcer', () => {
  it('a fire pot flies in an arc, bounces, and blows up after 2 s', () => {
    const { sim, player } = newGame();
    player.health = player.maxHealth = 1e6;
    expect(player.loadout.grenades).toBe(2);
    run(sim, DT, () => ({ ...emptyCommand(), grenade: true }));
    expect(player.loadout.grenades).toBe(1);
    expect(sim.grenades.length).toBe(1);
    const g = sim.grenades[0];
    const types = [];
    let landed = null;
    for (let i = 0; i < 200 && sim.grenades.length; i++) {
      landed = g.pos.clone();
      run(sim, DT);
      for (const ev of sim.drainEvents()) types.push(ev);
    }
    expect(sim.grenades.length).toBe(0);
    expect(types.some((e) => e.type === 'grenadeBounce')).toBe(true);
    const blast = types.find((e) => e.type === 'explosion' && e.kind === 'grenade');
    expect(blast).toBeTruthy();
    // thrown north from the start, it lands well ahead, on the ground
    expect(player.pos.z - landed.z).toBeGreaterThan(8);
    expect(landed.y).toBeLessThan(0.5);
    // the pouch holds four at most; a G press with an empty pouch does nothing
    player.loadout.grenades = 0;
    run(sim, DT, () => ({ ...emptyCommand(), grenade: true }));
    expect(sim.grenades.length).toBe(0);
    expect(player.loadout.addGrenades(9)).toBe(true);
    expect(player.loadout.grenades).toBe(4);
  });

  it('the blast kills guardians in range, hurts its thrower, and walls stop it', () => {
    const { sim, player } = newGame();
    const near = pacify(sim.enemies.spawn('runner', new THREE.Vector3(2, 0, 30)));
    const far = pacify(sim.enemies.spawn('runner', new THREE.Vector3(9, 0, 30)));
    sim.grenades.push({ id: 99, pos: new THREE.Vector3(0, 0.12, 30), vel: new THREE.Vector3(), fuse: 0.01, owner: player });
    player.pos.set(0, 0, 33);
    run(sim, 0.05);
    expect(sim.enemies.list).not.toContain(near);
    expect(sim.enemies.list).toContain(far);
    expect(player.health).toBeLessThan(100);
    expect(player.stats.kills).toBe(1);
    const pts = sim.drainEvents().filter((e) => e.type === 'points' && e.pid === player.id).map((e) => e.label);
    expect(pts).toEqual(['ÉLIMINATION', 'GRENADE']);
  });

  it('kills less than 4 s apart make a multi-kill; slower ones start over', () => {
    const { sim, player } = newGame();
    const kill = () => sim.enemies.damage(pacify(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 10))), 1e6, null, player);
    kill(); run(sim, 1); kill(); run(sim, 3); kill();
    const multis = sim.drainEvents().filter((e) => e.type === 'multikill').map((e) => e.count);
    expect(multis).toEqual([2, 3]);
    run(sim, 4.5);
    kill();
    expect(sim.drainEvents().some((e) => e.type === 'multikill')).toBe(false);
  });

  it('arena: sprees every 5 kills without dying, reset by a death', () => {
    const sim = new Sim(level, { mode: 'arena', arena: { scoreLimit: 25 } });
    const a = sim.addPlayer('a'), b = sim.addPlayer('b');
    sim.start();
    sim.mode.guardTimer = 1e9;
    sim.drainEvents();
    const fragB = () => { sim.raise(b, 1); b.protect = 0; sim.hitPlayer(b, 500, a.pos, 'bullet', null, { by: a, weapon: 'rifle' }); };
    for (let i = 0; i < 10; i++) { fragB(); run(sim, 5); }
    const sprees = sim.drainEvents().filter((e) => e.type === 'spree').map((e) => e.count);
    expect(sprees).toEqual([5, 10]);
    sim.hitPlayer(a, 500, b.pos, 'melee');
    expect(a.spree).toBe(0);
    // guardian kills do not count in the arena
    sim.enemies.damage(pacify(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 10))), 1e6, null, b);
    sim.enemies.damage(pacify(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 10))), 1e6, null, b);
    expect(sim.drainEvents().some((e) => e.type === 'multikill')).toBe(false);
  });
});

describe('precision rifle', () => {
  it('aimed, its bullet goes through a first jackal into the one behind', () => {
    const { sim, player } = newGame();
    const lo = player.loadout;
    lo.unlock('sniper');
    expect(lo.current.def.id).toBe('sniper');
    const front = pacify(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 26)));
    const back = pacify(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 20)));
    const target = new THREE.Vector3(0, 1.0, 26);
    // both stand still in line, one behind the other
    const hold = (x) => () => { front.pos.set(0, 0, 26); back.pos.set(0, 0, 20); return aimAt(player, target, x); };
    run(sim, 0.6, hold({ aim: true })); // switch done, scope up
    expect(lo.adsT).toBeGreaterThan(0.9);
    run(sim, DT, hold({ aim: true, fire: true }));
    expect(sim.enemies.list).not.toContain(front); // 150 damage: a jackal in one shot
    expect(back.hp).toBeLessThan(back.maxHp);
    expect(lo.current.mag).toBe(4);
  });
});

describe('universes', () => {
  const levelOf = (w) => new Level(JSON.parse(readFileSync(new URL(`../public/${getWorld(w).files.levelData}`, import.meta.url), 'utf8')));

  it('every universe has the tables the engine reads', () => {
    for (const w of Object.values(WORLDS)) {
      const ids = w.weapons.map((d) => d.id);
      for (const id of [...w.startUnlocked, ...Object.values(w.unlocks)]) expect(ids).toContain(id);
      const types = Object.keys(w.enemies);
      for (const wave of w.waves) for (const t of Object.keys(wave)) expect(types).toContain(t);
      for (const r of w.survival) expect(types).toContain(r.type);
      for (const t of w.arenaGuards) expect(types).toContain(t);
      expect(w.enemies.boss?.boss).toBe(true); // the boss type is always called 'boss'
      expect(types).toContain(w.enemies.boss.summon);
    }
  });

  it('an unknown universe falls back to the desert', () => {
    expect(getWorld('nowhere')).toBe(WORLDS.sables);
    expect(new Sim(level).world.id).toBe('sables');
  });

  it('the pirate port: enemies find their way from every spawn to the player', () => {
    const port = levelOf('pirates');
    const sim = new Sim(port, { mode: 'sandbox', world: 'pirates' });
    const player = sim.addPlayer('p1');
    expect(player.pos.toArray()).toEqual([-6, 0, 4]);
    expect(port.spawns.length).toBe(6);
    const runners = port.spawns.map((s) => pacify(sim.enemies.spawn('runner', s)));
    run(sim, 25, () => emptyCommand());
    for (const e of runners) expect(e.pos.distanceTo(player.pos)).toBeLessThan(3);
  });

  // every place of the port a player can stand on, and a jackal walking there from the village
  const SPOTS = {
    'pier end': [-22.5, 1, 36],
    'galleon deck': [24, 4, 20],
    sterncastle: [35, 6.6, 18],
    'tavern roof': [14, 3.9, -22],
    'treasure cave': [-35, 0, -36],
    canyon: [10, 0, -50],
  };
  for (const [name, [x, y, z]] of Object.entries(SPOTS)) {
    it(`the pirate port: a jackal reaches a player on the ${name}`, () => {
      const port = levelOf('pirates');
      const sim = new Sim(port, { mode: 'sandbox', world: 'pirates' });
      const player = sim.addPlayer('p1');
      player.pos.set(x, y + 0.05, z);
      run(sim, 0.5, () => emptyCommand());
      expect(player.pos.y).toBeCloseTo(y, 1); // standing on it, not inside a wall
      const e = pacify(sim.enemies.spawn('runner', new THREE.Vector3(-6, 0, -8)));
      run(sim, 25, () => emptyCommand());
      expect(e.pos.distanceTo(player.pos)).toBeLessThan(3);
    });
  }

  it('shallow water slows players and enemies; the quay and the deck are dry', () => {
    const port = levelOf('pirates');
    expect(port.inWater(-30, 24, 0)).toBe(true);
    expect(port.inWater(-6, 15, 1)).toBe(false); // on the quay
    expect(port.inWater(24, 20, 4)).toBe(false); // on the galleon's deck
    const sim = new Sim(port, { mode: 'sandbox', world: 'pirates' });
    const p = sim.addPlayer('p1');
    const walk = (x, z) => {
      p.pos.set(x, 0, z);
      p.vel.set(0, 0, 0);
      run(sim, 1, () => ({ ...emptyCommand(), moveX: 1, yaw: 0 }));
      return p.pos.x - x;
    };
    const dry = walk(-36, 8), wet = walk(-32, 21);
    expect(wet / dry).toBeCloseTo(0.6, 1);
  });

  it('a shot sets off a powder keg: it kills the enemies around, chains to the next keg, and is back next wave', () => {
    const port = levelOf('pirates');
    expect(port.kegs.length).toBe(10);
    const sim = new Sim(port, { mode: 'sandbox', world: 'pirates' });
    const player = sim.addPlayer('p1');
    const keg = sim.kegs[0];
    keg.pos.set(0, 0, -5); // out on the open sand
    player.pos.set(12, 0, -5);
    const near = sim.enemies.spawn('runner', keg.pos.clone().add(new THREE.Vector3(0, 0, -1.5))); // beside, not in front
    near.rise = 0;
    near.stun = 5; // stays by the keg instead of running into the line of fire
    const other = sim.kegs.find((k) => k !== keg);
    other.pos.copy(keg.pos).add(new THREE.Vector3(0, 0, 3)); // a second keg close by
    player.loadout.switchTo(1);
    run(sim, 0.4, (p) => aimAt(p, keg.pos.clone().setY(keg.pos.y + 0.5), { fire: true }));
    expect(keg.alive).toBe(false);
    expect(sim.enemies.list).not.toContain(near);
    expect(player.score).toBeGreaterThan(0);
    run(sim, 0.5, () => emptyCommand());
    expect(other.alive).toBe(false);
    const events = sim.drainEvents();
    expect(events.filter((e) => e.type === 'explosion' && e.kind === 'keg').length).toBe(2);
    sim.resetKegs();
    expect(sim.kegs.every((k) => k.alive)).toBe(true);
  });

  it('the pirate universe runs its waves to victory', () => {
    const sim = new Sim(levelOf('pirates'), { mode: 'waves', world: 'pirates' });
    const player = sim.addPlayer('p1');
    sim.start();
    for (let i = 0; i < 20000 && !sim.over; i++) {
      sim.mode.breakTimer = Math.min(sim.mode.breakTimer, 0.1);
      sim.mode.spawnTimer = Math.min(sim.mode.spawnTimer, 0.05);
      player.health = 100;
      if (player.cardOffer) sim.pickCard(player, 0);
      for (const e of [...sim.enemies.list]) if (e.rise === 0) sim.enemies.damage(e, e.T.boss ? 600 : 1e6, null, player);
      sim.step(DT, new Map([['p1', emptyCommand()]]));
      sim.drainEvents();
    }
    expect(sim.victory).toBe(true);
  });
});

describe('pirate weapons', () => {
  // on the desert's open sand, with the pirates' loadout
  const pirateGame = () => newGame({ world: 'pirates' });
  const slot = (player, id) => player.loadout.items.findIndex((it) => it.def.id === id);

  it('the flintlock fires one heavy ball, then reloads by itself', () => {
    const { sim, player } = pirateGame();
    const e = pacify(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 28)));
    e.T = { ...e.T, speed: 0 };
    const lo = player.loadout;
    expect(lo.current.def.id).toBe('flintlock');
    run(sim, 0.3, (p, i) => aimAt(p, e.pos.clone().setY(1.0), { fire: i === 0 }));
    expect(sim.enemies.list).not.toContain(e); // one ball is enough for a jackal
    expect(lo.current.mag).toBe(0);
    expect(lo.reloading).toBeGreaterThan(1.2);
    run(sim, 1.8);
    expect(lo.current.mag).toBe(1);
  });

  it('the blunderbuss fires two cones of shot before its reload', () => {
    const { sim, player } = pirateGame();
    const lo = player.loadout;
    lo.unlock('blunderbuss');
    run(sim, 0.5);
    const shots = [];
    run(sim, 1.2, (p, i) => ({ ...emptyCommand(), fire: i % 10 < 5 }));
    for (const ev of sim.drainEvents()) if (ev.type === 'playerShot') shots.push(ev);
    expect(shots.length).toBe(2);
    expect(shots[0].points.length).toBe(12);
    expect(lo.current.mag).toBe(0);
    expect(lo.reloading).toBeGreaterThan(0);
  });

  it('the cannon ball flies in an arc, blows up on what it meets, and the shot shoves the gunner back', () => {
    const { sim, player } = pirateGame();
    const lo = player.loadout;
    lo.unlock('cannon');
    expect(lo.index).toBe(slot(player, 'cannon'));
    const tank = pacify(sim.enemies.spawn('tank', new THREE.Vector3(0, 0, 18)));
    tank.T = { ...tank.T, speed: 0 };
    const runner = pacify(sim.enemies.spawn('runner', new THREE.Vector3(2, 0, 17)));
    runner.T = { ...runner.T, speed: 0 };
    run(sim, 0.5);
    const z0 = player.pos.z;
    const target = tank.pos.clone().setY(1.6);
    run(sim, 0.1, (p, i) => aimAt(p, target, { fire: i === 0 }));
    expect(sim.grenades.filter((g) => g.kind === 'ball').length).toBe(1);
    run(sim, 0.4);
    expect(player.pos.z).toBeGreaterThan(z0 + 0.3); // pushed back, away from the target
    run(sim, 0.6);
    expect(sim.grenades.length).toBe(0);
    expect(sim.drainEvents().some((ev) => ev.type === 'explosion' && ev.kind === 'ball')).toBe(true);
    expect(tank.hp).toBeLessThan(tank.maxHp - 250); // direct hit plus the blast
    expect(sim.enemies.list).not.toContain(runner); // caught in the blast
    expect(player.health).toBe(100); // far from its own blast
  });

  it('exploration: every weapon in hand, and N calls a group of targets', () => {
    const { sim, player } = pirateGame();
    sim.start();
    expect(player.loadout.items.every((it) => it.unlocked)).toBe(true);
    sim.mode.callTargets();
    expect(sim.enemies.list.length).toBe(6);
  });
});
