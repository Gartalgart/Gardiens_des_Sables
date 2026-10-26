import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Level } from '../src/sim/level.js';
import { Sim } from '../src/sim/sim.js';
import { emptyCommand } from '../src/sim/player.js';
import { applyUpgrade, drawCards, UPGRADES, pickObjective, WORLD_OBJECTIVES } from '../src/sim/progression.js';
import { WORLDS, getWorld } from '../src/worlds/index.js';
import { t } from '../src/i18n.js';

const DT = 1 / 60;
// every event type handled by the client (src/main.js, handleEvents)
const KNOWN_EVENTS = [
  'playerShot', 'impactWall', 'impactEnemy', 'hitConfirm', 'meleeImpact', 'swing', 'slash', 'reload', 'shell', 'dry', 'switch',
  'kick', 'step', 'reflectHit', 'blocked', 'playerHurt', 'playerDown', 'pickup', 'enemyKill', 'slam', 'wallStun', 'reflect',
  'growl', 'enemyFire', 'enemySpawn', 'enemyHit', 'ring', 'projectileEnd', 'banner', 'horn', 'unlock', 'gameOver',
  'perfectParry', 'objective', 'cardOffer', 'cardPicked', 'frag', 'respawn', 'impactPlayer', 'points', 'multikill', 'spree', 'grenadeThrow', 'grenadeBounce', 'headshotKill', 'prime', 'explosion', 'bossPhase2', 'weather', 'rainMark', 'rainStrike', 'teleportOut', 'teleportIn', 'song', 'tentacleCut', 'grab', 'inked', 'pierBreak', 'chestHit', 'airlock', 'charge', 'overheat', 'vented', 'mineStick', 'latch', 'burst', 'ventOpen',
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
  }, 15000); // thirty short games

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
    expect(pts).toEqual([t('pts.kill'), t('pts.grenade')]);
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
    const runners = port.spawns.map((s) => pacify(sim.enemies.spawn('skeleton', s)));
    run(sim, 25, () => emptyCommand());
    for (const e of runners) expect(e.pos.distanceTo(player.pos)).toBeLessThan(3);
  });

  // every place of the port a player can stand on, and a skeleton walking there from the village
  const SPOTS = {
    'pier end': [-22.5, 1, 36],
    'galleon deck': [24, 4, 20],
    sterncastle: [35, 6.6, 18],
    'tavern roof': [14, 3.9, -22],
    'treasure cave': [-35, 0, -36],
    canyon: [10, 0, -50],
  };
  for (const [name, [x, y, z]] of Object.entries(SPOTS)) {
    it(`the pirate port: a skeleton reaches a player on the ${name}`, () => {
      const port = levelOf('pirates');
      const sim = new Sim(port, { mode: 'sandbox', world: 'pirates' });
      const player = sim.addPlayer('p1');
      player.pos.set(x, y + 0.05, z);
      run(sim, 0.5, () => emptyCommand());
      expect(player.pos.y).toBeCloseTo(y, 1); // standing on it, not inside a wall
      const e = pacify(sim.enemies.spawn('skeleton', new THREE.Vector3(-6, 0, -8)));
      run(sim, 25, () => emptyCommand());
      expect(e.pos.distanceTo(player.pos)).toBeLessThan(3);
    });
  }

  it('the station: enemies find their way from every spawn to the player', () => {
    const station = levelOf('station');
    const sim = new Sim(station, { mode: 'sandbox', world: 'station' });
    const player = sim.addPlayer('p1');
    expect(station.spawns.length).toBe(10);
    expect(station.airlocks.length).toBe(2);
    player.pos.set(2, 0, 31); // in the hangar, open on three sides: no crowd jams a single door
    const runners = station.spawns.map((s) => pacify(sim.enemies.spawn('runner', s)));
    // each one gets close at some point (ten bodies end up crowding round the player)
    const best = runners.map(() => Infinity);
    run(sim, 25, () => {
      player.health = player.maxHealth; // a dead player stops the hunt
      runners.forEach((e, n) => { best[n] = Math.min(best[n], e.pos.distanceTo(player.pos)); });
      return emptyCommand();
    });
    for (const d of best) expect(d).toBeLessThan(4);
  });

  it('the station: brutes get out of the hangar and through the tunnels to every district', () => {
    const station = levelOf('station');
    for (const [x, z] of [[36, 0], [-36, -2], [0, -33], [34, -28]]) {
      const sim = new Sim(station, { mode: 'sandbox', world: 'station' });
      const player = sim.addPlayer('p1');
      player.pos.set(x, 0, z);
      const brute = pacify(sim.enemies.spawn('tank', station.spawns[0]));
      let best = Infinity;
      run(sim, 40, () => {
        player.health = player.maxHealth;
        best = Math.min(best, brute.pos.distanceTo(player.pos));
        return emptyCommand();
      });
      expect(best, `brute to (${x}, ${z})`).toBeLessThan(4);
    }
  });

  describe('the station airlocks', () => {
    const station = () => levelOf('station');
    // the use key pressed for one step, then let go
    const pressUse = (sim) => { sim.step(DT, new Map([['p1', { ...emptyCommand(), use: true }]])); sim.step(DT, new Map([['p1', emptyCommand()]])); };

    it('a lever opens the door on the void, a second press closes it; it also closes by itself', () => {
      const lv = station();
      const sim = new Sim(lv, { mode: 'sandbox', world: 'station' });
      const player = sim.addPlayer('p1');
      const a = sim.airlocks[0]; // the hangar's bay door
      player.pos.set(a.lever.x - 1, 0, a.lever.z);
      const boxes = lv.boxes.length;
      pressUse(sim);
      expect(a.open).toBe(true);
      expect(lv.boxes.length).toBe(boxes - 1);
      run(sim, 1.2, () => emptyCommand());
      pressUse(sim);
      expect(a.open).toBe(false);
      expect(lv.boxes.length).toBe(boxes);
      run(sim, 1.2, () => emptyCommand());
      pressUse(sim);
      run(sim, 8, () => emptyCommand());
      expect(a.open).toBe(false);
      // far from any lever, the key does nothing
      player.pos.set(0, 0, 16.5);
      run(sim, 1.2, () => emptyCommand());
      pressUse(sim);
      expect(sim.airlocks.some((o) => o.open)).toBe(false);
    });

    it('the open bay door drags enemies out into the void, credited to who opened it', () => {
      const sim = new Sim(station(), { mode: 'sandbox', world: 'station' });
      const player = sim.addPlayer('p1');
      const a = sim.airlocks[0];
      player.pos.set(a.lever.x - 1, 0, a.lever.z);
      const e = pacify(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 38)));
      e.T = { ...e.T, speed: 0 };
      pressUse(sim);
      const before = player.stats.kills;
      run(sim, 4, () => emptyCommand());
      expect(sim.enemies.list).not.toContain(e);
      expect(player.stats.kills).toBe(before + 1);
    });

    it('a player standing in front of the open door is pulled out, one walking away at the far end of the hangar escapes', () => {
      const sim = new Sim(station(), { mode: 'sandbox', world: 'station' });
      const player = sim.addPlayer('p1');
      sim.setAirlock(sim.airlocks[0], true);
      player.pos.set(0, 0, 40);
      run(sim, 3, () => emptyCommand());
      expect(player.dead).toBe(true);

      const sim2 = new Sim(station(), { mode: 'sandbox', world: 'station' });
      const p2 = sim2.addPlayer('p1');
      p2.pos.set(-4, 0, 27.5); // by the hangar's north door
      sim2.setAirlock(sim2.airlocks[0], true);
      run(sim2, 3, () => ({ ...emptyCommand(), moveZ: -1 })); // walking north, away from the door
      expect(p2.dead).toBe(false);
      expect(p2.pos.z).toBeLessThan(27.5);
    });

    it('a new game closes the doors again', () => {
      const lv = station();
      const sim = new Sim(lv, { mode: 'sandbox', world: 'station' });
      sim.setAirlock(sim.airlocks[1], true);
      expect(lv.airlocks[1].open).toBe(true);
      new Sim(lv, { mode: 'sandbox', world: 'station' });
      expect(lv.airlocks[1].open).toBe(false);
      expect(lv.boxes).toContain(lv.airlocks[1].door);
    });
  });

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
    const near = sim.enemies.spawn('skeleton', keg.pos.clone().add(new THREE.Vector3(0, 0, -1.5))); // beside, not in front
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
    const e = pacify(sim.enemies.spawn('skeleton', new THREE.Vector3(0, 0, 28)));
    e.T = { ...e.T, speed: 0 };
    const lo = player.loadout;
    expect(lo.current.def.id).toBe('flintlock');
    run(sim, 0.3, (p, i) => aimAt(p, e.pos.clone().setY(1.0), { fire: i === 0 }));
    expect(sim.enemies.list).not.toContain(e); // one ball is enough for a skeleton
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
    const tank = pacify(sim.enemies.spawn('crab', new THREE.Vector3(0, 0, 18)));
    tank.T = { ...tank.T, speed: 0, armor: null }; // the shell would stop most of it (tested below)
    const runner = pacify(sim.enemies.spawn('skeleton', new THREE.Vector3(2, 0, 17)));
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
    expect(sim.enemies.list.length).toBe(sim.world.targets.reduce((n, [, k]) => n + k, 0));
  });
});

describe('pirate enemies', () => {
  const port = () => new Level(JSON.parse(readFileSync(new URL(`../public/${getWorld('pirates').files.levelData}`, import.meta.url), 'utf8')));
  const pirateSim = (mode = 'sandbox') => {
    const sim = new Sim(port(), { mode, world: 'pirates' });
    const player = sim.addPlayer('p1');
    return { sim, player };
  };

  it('the crab shell stops most of a blow from the front, not from behind', () => {
    const { sim } = pirateSim();
    const crab = sim.enemies.spawn('crab', new THREE.Vector3(-6, 0, 0));
    crab.facing = 0; // looks toward +Z
    sim.enemies.damage(crab, 100, new THREE.Vector3(0, 0, -1)); // shot from in front
    expect(crab.maxHp - crab.hp).toBeCloseTo(30);
    sim.enemies.damage(crab, 100, new THREE.Vector3(0, 0, 1)); // from behind
    expect(crab.maxHp - crab.hp).toBeCloseTo(130);
    const hits = sim.drainEvents().filter((e) => e.type === 'enemyHit');
    expect(hits.map((e) => e.armored)).toEqual([true, false]);
  });

  it('the crab comes out of the sea and charges sideways, its flank toward the player', () => {
    const { sim, player } = pirateSim();
    player.pos.set(-6, 0, 4);
    run(sim, 0.1); // the paths to the player are worked out on the first step
    for (let i = 0; i < 5; i++) {
      const at = sim.pickSpawn('crab');
      expect(sim.level.inWater(at.x, at.z, 0)).toBe(true);
      expect(at.x).toBeLessThan(-31.5); // off the west beach, not behind the quay or the galleon
    }
    // and walks out of the sea to the player
    const walker = pacify(sim.enemies.spawn('crab', sim.pickSpawn('crab')));
    // (standing right on the player, even a pacified crab lands the odd blow; caught on a corner
    // for long, it is sent back through a gate and walks again)
    let closest = Infinity;
    run(sim, 40, () => {
      player.health = 100;
      closest = Math.min(closest, Math.hypot(walker.pos.x - player.pos.x, walker.pos.z - player.pos.z));
      return emptyCommand();
    });
    expect(closest).toBeLessThan(4);
    sim.enemies.list.length = 0;
    // a spot 12 m away on open ground, from where it sees the player (a charge needs a clear line)
    let spot = null;
    for (let a = 0; a < Math.PI * 2 && !spot; a += 0.2) {
      const c = new THREE.Vector3(player.pos.x + Math.sin(a) * 12, 0, player.pos.z - Math.cos(a) * 12);
      if (sim.level.nav.floorAt(c.x, c.z) < 0.05 && !sim.level.occupied(c.x, c.z, 1.2)
        && sim.level.lineOfSight(c.clone().setY(1.1), player.center)) spot = c;
    }
    expect(spot).not.toBeNull();
    const crab = sim.enemies.spawn('crab', spot);
    crab.rise = 0;
    crab.chargeCd = 0;
    let sideways = null;
    run(sim, 5, () => {
      // measured once it has turned (a charge cut short by a hit ends quickly)
      if (crab.act?.kind === 'charge' && crab.act.t > 0.15 && sideways === null) {
        const toPlayer = Math.atan2(player.pos.x - crab.pos.x, player.pos.z - crab.pos.z);
        sideways = Math.abs(Math.cos(crab.facing - toPlayer));
      }
      return emptyCommand();
    });
    expect(sideways).not.toBeNull();
    expect(sideways).toBeLessThan(0.3); // about 90 degrees off
  });

  it('ghost gunners take a post on the galleon, stay there, and lob balls that land under a shadow', () => {
    const { sim, player } = pirateSim();
    player.pos.set(-6, 0, 4);
    const posts = sim.world.posts;
    const a = sim.enemies.spawn('gunner', sim.pickSpawn('gunner'));
    const b = sim.enemies.spawn('gunner', sim.pickSpawn('gunner'));
    expect(posts.some(([x, , z]) => x === a.pos.x && z === a.pos.z)).toBe(true);
    expect(a.pos.distanceTo(b.pos)).toBeGreaterThan(1); // two different posts
    const start = a.pos.clone();
    let mark = null, strike = null;
    run(sim, 6, () => {
      for (const ev of sim.drainEvents()) {
        if (ev.type === 'rainMark' && ev.kind === 'lob' && !mark) mark = ev;
        if (ev.type === 'rainStrike' && mark && ev.id === mark.id) strike = ev;
      }
      player.health = 100;
      return emptyCommand();
    });
    expect(Math.hypot(a.pos.x - start.x, a.pos.z - start.z)).toBeLessThan(1);
    expect(mark).not.toBeNull();
    expect(mark.from.y).toBeGreaterThan(4); // from the deck
    expect(Math.hypot(mark.pos.x - player.pos.x, mark.pos.z - player.pos.z)).toBeLessThan(3);
    expect(strike).not.toBeNull();
  });

  it('a lobbed ball hurts a player in the open; a roof shelters from the gunners', () => {
    const { sim, player } = pirateSim();
    player.pos.set(-6, 0, 4);
    sim.lob(new THREE.Vector3(24, 6, 21), player, sim.world.enemies.gunner.ranged, 1);
    run(sim, 3, () => emptyCommand());
    expect(player.health).toBeLessThan(100);
    sim.drainEvents();
    // inside a house, under its roof, no gunner fires
    const nav = sim.level.nav;
    let inside = null;
    for (let x = -40; x < 40 && !inside; x += 0.5) for (let z = -40; z < 10 && !inside; z += 0.5) {
      if (nav.coveredAt(x, z) && nav.floorAt(x, z) < 0.3) inside = new THREE.Vector3(x, nav.floorAt(x, z), z);
    }
    expect(inside).not.toBeNull();
    player.pos.copy(inside);
    player.health = 100;
    const g = sim.enemies.spawn('gunner', sim.pickSpawn('gunner'));
    g.rise = 0;
    g.fireCd = 0;
    run(sim, 4, () => emptyCommand());
    expect(sim.strikes.length).toBe(0);
    expect(sim.drainEvents().some((e) => e.type === 'rainMark')).toBe(false);
  });

  it('big bodies only come through gates they can walk out of', () => {
    const { sim, player } = pirateSim();
    player.pos.set(-6, 0, 4);
    run(sim, 0.1);
    const nav = sim.level.nav;
    sim.world = { ...sim.world, enemies: { ...sim.world.enemies, brute: { ...sim.world.enemies.crab, fromWater: null } } };
    for (let i = 0; i < 30; i++) {
      const at = sim.pickSpawn('brute'); // a crab that comes through the gates
      expect(nav.layers.big.dist[nav.index(at.x, at.z)]).toBeLessThan(Infinity);
    }
    // every gate lets a small body out
    for (const s of sim.level.spawns) expect(nav.layers.small.dist[nav.index(s.x, s.z)]).toBeLessThan(Infinity);
  });

  it('the waves unlock the blunderbuss, the cannon, then the scoped musket for the last wave', () => {
    const { sim, player } = pirateSim('waves');
    sim.start();
    const unlocked = [];
    for (let i = 0; i < 40000 && !sim.over; i++) {
      sim.mode.breakTimer = Math.min(sim.mode.breakTimer, 0.1);
      sim.mode.spawnTimer = Math.min(sim.mode.spawnTimer, 0.05);
      player.health = 100;
      if (player.cardOffer) sim.pickCard(player, 0);
      for (const e of [...sim.enemies.list]) if (e.rise === 0) sim.enemies.damage(e, e.T.boss ? 600 : 1e6, null, player);
      sim.step(DT, new Map([['p1', emptyCommand()]]));
      for (const ev of sim.drainEvents()) if (ev.type === 'unlock') unlocked.push([sim.mode.wave + 1, ev.weapon]);
    }
    expect(sim.victory).toBe(true);
    expect(unlocked).toEqual([[2, 'blunderbuss'], [3, 'cannon'], [5, 'musket']]);
  });

  it('the siren stays in the water; her song charms the player and pulls them toward her, until she dies', () => {
    const { sim, player } = pirateSim();
    player.pos.set(-10, 1, 14.5); // on the quay
    run(sim, 0.1);
    const at = sim.pickSpawn('siren');
    expect(sim.level.inWater(at.x, at.z, 0)).toBe(true);
    const siren = sim.enemies.spawn('siren', new THREE.Vector3(-10, 0, 24));
    siren.T = { ...siren.T, melee: { ...siren.T.melee, range: 0.01 } };
    siren.songCd = 0;
    const start = siren.pos.clone();
    const d0 = Math.hypot(player.pos.x - siren.pos.x, player.pos.z - siren.pos.z);
    let sang = false;
    run(sim, 3, () => {
      if (siren.act?.kind === 'sing') sang = true;
      player.health = 100;
      return emptyCommand();
    });
    expect(sang).toBe(true);
    expect(player.charm).toBeGreaterThan(0.5);
    expect(Math.hypot(player.pos.x - siren.pos.x, player.pos.z - siren.pos.z)).toBeLessThan(d0 - 1); // pulled closer
    expect(siren.pos.distanceTo(start)).toBeLessThan(0.5); // she does not move
    sim.enemies.damage(siren, 1e6, null, player);
    run(sim, 2, () => emptyCommand());
    expect(player.charm).toBe(0);
    expect(player.drift.length()).toBe(0);
  });

  it('a swarm of bats flies straight in, nibbles the player again and again, and a blast scatters it', () => {
    const { sim, player } = pirateSim();
    player.pos.set(-6, 0, 4);
    const bats = sim.enemies.spawn('bats', new THREE.Vector3(-6, 6, -22));
    expect(bats.rise).toBe(0);
    let hits = 0;
    run(sim, 8, () => {
      for (const ev of sim.drainEvents()) if (ev.type === 'playerHurt') hits++;
      player.health = 100;
      return emptyCommand();
    });
    expect(Math.hypot(bats.pos.x - player.pos.x, bats.pos.z - player.pos.z)).toBeLessThan(2.5);
    expect(hits).toBeGreaterThan(3);
    // a powder keg going off beside it kills the whole swarm
    const keg = sim.kegs[0];
    keg.pos.set(bats.pos.x + 1, sim.level.groundAt(bats.pos.x + 1, bats.pos.z, 0.4, bats.pos.y), bats.pos.z);
    sim.blowKeg(keg, player);
    expect(sim.enemies.list).not.toContain(bats);
  });

  it('an enemy out of the map, or trapped far from the player, comes back through a gate', () => {
    const { sim, player } = pirateSim();
    player.pos.set(-6, 0, 4);
    const out = sim.enemies.spawn('skeleton', new THREE.Vector3(-48, 0, 19)); // past the western cliffs
    out.rise = 0;
    const trapped = pacify(sim.enemies.spawn('skeleton', new THREE.Vector3(-6, 0, -12)));
    trapped.T = { ...trapped.T, speed: 0 }; // stands still, 16 m away
    run(sim, 7, () => { player.health = 100; return emptyCommand(); });
    expect(sim.level.nav.inWorld(out.pos.x, out.pos.z)).toBe(true);
    // in plain view it stays (it would vanish under the player's eyes)...
    expect(trapped.pos.distanceTo(new THREE.Vector3(-6, 0, -12))).toBeLessThan(0.5);
    // ...out of sight, it comes back through a gate
    const eye = trapped.pos.clone().setY(trapped.T.height * 0.85);
    let hide = null;
    for (let x = -30; x <= 30 && !hide; x += 2)
      for (let z = -30; z <= 30 && !hide; z += 2) {
        const at = new THREE.Vector3(x, 0, z);
        if (at.distanceTo(trapped.pos) > 10 && sim.level.nav.inWorld(x, z) && !sim.level.lineOfSight(eye, at.clone().setY(1))) hide = at;
      }
    player.pos.copy(hide);
    sim.enemies.damage(out, 1e5, null, null); // done with it: walking up, it could jostle the trapped one
    run(sim, 13, () => { player.pos.copy(hide); player.health = 100; return emptyCommand(); }); // two trap checks
    expect(trapped.pos.distanceTo(new THREE.Vector3(-6, 0, -12))).toBeGreaterThan(3);
  });

  it('the waves always end, even for a player who only kills what comes near', () => {
    const { sim, player } = pirateSim('waves');
    sim.start();
    let last = 0;
    for (let i = 0; i < 60 * 400 && !sim.over && i - last < 60 * 60; i++) {
      player.pos.set(0, 0, -40); // in the canyon, far from the sea and the galleon
      player.health = 100;
      sim.mode.breakTimer = Math.min(sim.mode.breakTimer, 0.1);
      if (player.cardOffer) sim.pickCard(player, 0);
      sim.step(DT, new Map([['p1', emptyCommand()]]));
      sim.drainEvents();
      for (const e of [...sim.enemies.list]) {
        if (e.rise > 0) continue;
        const near = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 6;
        if (near || e.T.stay || e.T.post) { sim.enemies.damage(e, e.T.boss ? 40 : 1e6, null, player); last = i; }
      }
    }
    expect(sim.victory).toBe(true);
  });

  it('skeletons rise in groups of three in the waves', () => {
    const { sim } = pirateSim('waves');
    sim.start();
    let group = 0;
    for (let i = 0; i < 400 && !group; i++) {
      sim.step(DT, new Map([['p1', emptyCommand()]]));
      const spawns = sim.drainEvents().filter((e) => e.type === 'enemySpawn');
      if (spawns.length) group = spawns.length;
    }
    expect(group).toBe(3);
  });
});

describe('the Kraken', () => {
  const port = new Level(JSON.parse(readFileSync(new URL(`../public/${getWorld('pirates').files.levelData}`, import.meta.url), 'utf8')));
  const krakenGame = () => {
    const sim = new Sim(port, { mode: 'sandbox', world: 'pirates' });
    const player = sim.addPlayer('p1');
    player.pos.set(-10, 1, 15); // on the quay
    run(sim, 0.1);
    const kraken = sim.enemies.spawn('boss', sim.pickSpawn('boss'));
    return { sim, player, kraken, tentacles: kraken.parts };
  };
  const keep = (player) => () => { player.health = 100; return emptyCommand(); };

  it('waits under the water with four tentacles along the shore; only the body counts as an enemy left', () => {
    const { sim, kraken, tentacles } = krakenGame();
    expect(kraken.submerged).toBe(true);
    expect(tentacles.length).toBe(4);
    for (const t of tentacles) expect(t.pos.z).toBeGreaterThan(18); // in the water
    expect(sim.enemies.alive).toBe(1);
    // bullets cannot reach the body under the water
    const hit = sim.enemies.raycast(new THREE.Vector3(-8.5, 3, 20), new THREE.Vector3(0, 0, 1), 40);
    expect(hit?.enemy).not.toBe(kraken);
  });

  it('a tentacle warns with a red circle, then strikes where the player stood', () => {
    const { sim, player, tentacles } = krakenGame();
    let ring = null, slam = null, after = null;
    const hp0 = 100;
    // long enough for the slowest rise and cooldowns the dice can give
    run(sim, 12, () => {
      for (const ev of sim.drainEvents()) {
        if (ev.type === 'ring' && ev.enemyType === 'tentacle' && !ring) ring = ev;
        if (ev.type === 'slam' && ring && !slam) { slam = ev; after = player.health; } // before it heals
      }
      if (!slam) player.health = hp0;
      return emptyCommand();
    });
    expect(ring).not.toBeNull();
    expect(Math.hypot(ring.pos.x - player.pos.x, ring.pos.z - player.pos.z)).toBeLessThan(3);
    expect(slam).not.toBeNull();
    expect(after).toBeLessThan(hp0);
    expect(tentacles.some((t) => t.act === null || t.act?.kind === 'strike')).toBe(true);
  });

  it('cutting a tentacle makes it dive and costs the Kraken a share of its health; it comes up again elsewhere', () => {
    const { sim, player, kraken, tentacles } = krakenGame();
    run(sim, 3, keep(player)); // let them rise
    const t = tentacles[0];
    const from = t.pos.clone();
    sim.enemies.damage(t, 1e6, null, player);
    expect(t.diving).toBe(true);
    expect(kraken.hp).toBeCloseTo(kraken.maxHp * 0.92);
    expect(sim.enemies.list).toContain(t); // dived, not dead
    run(sim, 8, keep(player));
    expect(t.diving).toBe(false);
    expect(t.hp).toBe(t.maxHp);
    expect(player.score).toBeGreaterThan(0);
    void from;
  });

  it('at half health its head comes up, spits ink that blinds, and calls the crew from the land', () => {
    const { sim, player, kraken } = krakenGame();
    kraken.hp = kraken.maxHp * 0.49;
    let skeletons = 0, inked = false;
    run(sim, 12, () => {
      for (const ev of sim.drainEvents()) {
        if (ev.type === 'enemySpawn' && ev.enemyType === 'skeleton') skeletons++;
        if (ev.type === 'inked') inked = true;
      }
      player.health = 100;
      return emptyCommand();
    });
    expect(kraken.stage).toBe(2);
    expect(kraken.submerged).toBe(false);
    expect(kraken.rise).toBe(0);
    expect(skeletons).toBeGreaterThanOrEqual(4);
    for (const e of sim.enemies.list.filter((x) => x.type === 'skeleton')) expect(e.pos.z).toBeLessThan(18); // on land
    expect(inked).toBe(true);
    // up, the head can be shot
    const hit = sim.enemies.raycast(new THREE.Vector3(-8.5, 3.5, 20), new THREE.Vector3(0, 0, 1), 40);
    expect(hit?.enemy).toBe(kraken);
  });

  it('at a third it smashes the nearest pier, and its tentacles grab; hurting the one that holds you frees you', () => {
    const { sim, player, kraken, tentacles } = krakenGame();
    player.pos.set(-22.5, 1, 24); // out on the western pier
    const boxes = port.boxes.length;
    kraken.stage = 2;
    kraken.submerged = false;
    kraken.hp = kraken.maxHp * 0.3;
    run(sim, 0.1, keep(player));
    expect(kraken.stage).toBe(3);
    expect(sim.drainEvents().some((e) => e.type === 'pierBreak')).toBe(true);
    expect(port.boxes.length).toBeLessThan(boxes);
    expect(port.groundAt(-22.5, 26, 0.4, 2)).toBe(0); // no more pier
    expect(player.pos.z).toBeLessThan(28); // thrown back into the shallows, inside the barrier
    // a tentacle next to the player grabs them
    player.pos.set(-12, 1, 15);
    const t = tentacles[0];
    t.pos.set(-12, 0, 17.5);
    t.rise = 0; t.diving = false; t.act = null; t.leapCd = 0; t.attackCd = 99;
    run(sim, 1.5, keep(player));
    expect(player.grabbed?.by).toBe(t.id);
    const held = player.pos.clone();
    run(sim, 0.5, () => ({ ...emptyCommand(), moveZ: -1 })); // cannot walk away
    expect(player.pos.distanceTo(held)).toBeLessThan(0.3);
    sim.enemies.damage(t, 80, null, player);
    expect(player.grabbed).toBeNull();
    expect(t.diving).toBe(true);
    // a new game finds the pier standing again
    new Sim(port, { mode: 'sandbox', world: 'pirates' });
    expect(port.boxes.length).toBe(boxes);
    expect(port.groundAt(-22.5, 26, 0.4, 2)).toBe(1);
  });
});

describe('pirate objectives', () => {
  const port = new Level(JSON.parse(readFileSync(new URL(`../public/${getWorld('pirates').files.levelData}`, import.meta.url), 'utf8')));
  const wavesGame = () => {
    const sim = new Sim(port, { mode: 'waves', world: 'pirates' });
    const player = sim.addPlayer('p1');
    return { sim, player };
  };
  it('the port adds its own objectives to the draw: powder kegs and the chest', () => {
    const ids = new Set();
    for (let i = 0; i < 300; i++) ids.add(pickObjective(2, getWorld('pirates')).id);
    expect(ids.has('kegs')).toBe(true);
    expect(ids.has('chest')).toBe(true);
    for (let i = 0; i < 100; i++) expect(['kegs', 'chest']).not.toContain(pickObjective(2, getWorld('sables')).id);
    expect(pickObjective(2, getWorld('pirates')).text).not.toContain(getWorld('sables').texts.meleeName);
  });

  it('keg kills count for the powder-keg objective', () => {
    const { sim, player } = wavesGame();
    sim.mode.objective = { id: 'kegs', target: 2, stat: 'kegKills' };
    const keg = sim.kegs[0];
    keg.pos.set(0, 0, -5);
    for (const dx of [-1.5, 1.5]) { const e = sim.enemies.spawn('skeleton', keg.pos.clone().add(new THREE.Vector3(dx, 0, -1))); e.rise = 0; }
    sim.blowKeg(keg, player);
    expect(player.waveStats.kegKills).toBe(2);
  });

  it('looters go for the chest in the cave and empty it, unless a player stands guard', () => {
    const sim = new Sim(port, { mode: 'sandbox', world: 'pirates' }); // no wave to reset the chest
    const player = sim.addPlayer('p1');
    sim.chest = { pos: new THREE.Vector3(-36, 0, -39.2), gold: 100, looters: 1 };
    player.pos.set(-6, 0, 4); // far from the cave
    run(sim, 0.1);
    const looter = sim.enemies.spawn('skeleton', new THREE.Vector3(-20, 0, -20));
    looter.rise = 0;
    expect(looter.looter).toBe(true);
    let reached = false;
    run(sim, 12, () => {
      player.health = 100;
      if (Math.hypot(looter.pos.x + 36, looter.pos.z + 37.7) < 2.5) reached = true;
      return emptyCommand();
    });
    expect(reached).toBe(true);
    expect(sim.chest.gold).toBeLessThan(100);
    // a player in the cave: the looter turns on them instead
    player.pos.set(-35, 0, -35);
    const gold = sim.chest.gold;
    run(sim, 2, () => { player.health = 100; return emptyCommand(); });
    expect(sim.chest.gold).toBeGreaterThan(gold - 3);
  });
});

describe('station weapons', () => {
  // on the desert's open sand, with the station's loadout
  const stationGame = () => newGame({ world: 'station' });
  const still = (e) => { e.T = { ...e.T, speed: 0 }; return e; };
  const events = (sim, type) => sim.drainEvents().filter((ev) => ev.type === type);

  it('the laser pistol uses no ammo but heats up, locks when too hot, then cools', () => {
    const { sim, player } = stationGame();
    const lo = player.loadout;
    expect(lo.current.def.id).toBe('laser');
    run(sim, 6, (p, i) => ({ ...emptyCommand(), fire: i % 8 < 4 }));
    const it = lo.current;
    expect(it.mag).toBe(1);
    expect(events(sim, 'overheat').length).toBeGreaterThan(0);
    // locked: the trigger does nothing
    it.heat = 1; it.locked = 1;
    run(sim, 0.5, (p, i) => ({ ...emptyCommand(), fire: i % 8 < 4 }));
    expect(events(sim, 'playerShot').length).toBe(0);
    run(sim, 4);
    expect(it.locked).toBe(0);
    expect(it.heat).toBe(0);
  });

  it('the plasma rifle fires three shots per pull', () => {
    const { sim, player } = stationGame();
    player.loadout.unlock('plasma');
    run(sim, 0.5);
    sim.drainEvents();
    run(sim, 0.25, (p, i) => ({ ...emptyCommand(), fire: i === 0 }));
    expect(events(sim, 'playerShot').length).toBe(3);
  });

  it('the railgun charges, then its slug goes through every enemy on its line', () => {
    const { sim, player } = stationGame();
    player.loadout.unlock('railgun');
    run(sim, 0.5);
    const line = [28, 24, 20].map((z) => still(pacify(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, z)))));
    const target = line[2].pos.clone().setY(1.0);
    run(sim, 0.5, (p) => aimAt(p, target, { aim: true })); // through the sights: no spread
    run(sim, 0.4, (p, i) => aimAt(p, target, { aim: true, fire: i === 0 }));
    expect(sim.enemies.list.length).toBe(3); // still charging
    run(sim, 0.6, (p) => aimAt(p, target, { aim: true }));
    for (const e of line) expect(sim.enemies.list).not.toContain(e);
  });

  it('the railgun goes through two overlapping bodies once each (no endless ping-pong)', () => {
    const { sim } = stationGame();
    const a = still(pacify(sim.enemies.spawn('tank', new THREE.Vector3(0, 0, 24))));
    const b = still(pacify(sim.enemies.spawn('tank', new THREE.Vector3(0.2, 0, 24.1))));
    const from = new THREE.Vector3(0, 1, 34), dir = new THREE.Vector3(0, 0, -1);
    const first = sim.enemies.raycast(from, dir, 100);
    const second = sim.enemies.raycast(first.point, dir, 100, new Set([first.enemy]));
    expect([a, b]).toContain(second.enemy);
    expect(second.enemy).not.toBe(first.enemy);
    expect(sim.enemies.raycast(second.point, dir, 100, new Set([a, b]))).toBeNull();
  });

  it('the flamethrower sets what is in front on fire; the burn goes on after the flames', () => {
    const { sim, player } = stationGame();
    player.loadout.unlock('flamer');
    run(sim, 0.5);
    const front = still(pacify(sim.enemies.spawn('tank', new THREE.Vector3(0, 0, 33))));
    const behind = still(pacify(sim.enemies.spawn('runner', new THREE.Vector3(0, 0, 43))));
    const aim = front.pos.clone().setY(1.2);
    run(sim, 0.5, (p) => aimAt(p, aim, { fire: true }));
    expect(front.burn).toBeTruthy();
    expect(behind.burn).toBeFalsy();
    const hp = front.hp;
    run(sim, 1, (p) => aimAt(p, aim));
    expect(front.hp).toBeLessThan(hp);
    expect(behind.hp).toBe(behind.T.hp);
  });

  it('the electric baton stuns what it hits', () => {
    const { sim, player } = stationGame();
    player.loadout.switchTo(0);
    run(sim, 0.5);
    const e = still(pacify(sim.enemies.spawn('tank', new THREE.Vector3(0, 0, 36))));
    run(sim, 0.15, (p, i) => aimAt(p, e.pos.clone().setY(1.2), { fire: i === 0 }));
    expect(e.stun).toBeGreaterThan(0.2);
  });

  it('a sticky mine sticks where it lands and goes off when an enemy comes near', () => {
    const { sim, player } = stationGame();
    run(sim, 0.3, (p, i) => aimAt(p, new THREE.Vector3(0, 0, 32), { grenade: i === 0 }));
    run(sim, 1.5);
    const mine = sim.grenades.find((g) => g.kind === 'mine');
    expect(mine?.stuck).toBe(true);
    const e = pacify(sim.enemies.spawn('runner', mine.pos.clone().add(new THREE.Vector3(0, 0, -12))));
    e.T = { ...e.T, hp: 60 };
    e.hp = 60;
    const blasts = [];
    run(sim, 6, (p) => { for (const ev of sim.events) if (ev.type === 'explosion') blasts.push(ev); return emptyCommand(); });
    expect(sim.grenades).not.toContain(mine);
    expect(sim.enemies.list).not.toContain(e);
  });
});

describe('station enemies', () => {
  const stationGame = () => newGame({ world: 'station' });

  it('a parasite leaps onto the face, feeds there out of reach of bullets, and a baton blow knocks it off', () => {
    const { sim, player } = stationGame();
    const e = sim.enemies.spawn('parasite', new THREE.Vector3(0, 0, 33));
    e.rise = 0;
    e.leapCd = 0;
    run(sim, 3, (p) => aimAt(p, e.pos.clone().setY(0.3)));
    expect(player.latch).toBe(e);
    const hp = player.health;
    run(sim, 1);
    expect(player.health).toBeLessThan(hp);
    // shooting straight ahead does not touch it
    const lo = player.loadout;
    run(sim, 0.3, (p, i) => ({ ...emptyCommand(), yaw: p.yaw, fire: i === 0 }));
    expect(sim.enemies.list).toContain(e);
    expect(player.latch).toBe(e);
    // the baton does
    lo.switchTo(0);
    run(sim, 0.5, (p) => ({ ...emptyCommand(), yaw: p.yaw }));
    run(sim, 0.3, (p, i) => ({ ...emptyCommand(), yaw: p.yaw, fire: i === 0 }));
    expect(player.latch).toBeFalsy();
  });

  it('a host that dies may let a parasite out of its body', () => {
    const { sim } = stationGame();
    const h = sim.enemies.spawn('host', new THREE.Vector3(0, 0, 30));
    h.T = { ...h.T, burst: { ...h.T.burst, chance: 1 } };
    sim.enemies.damage(h, 9999, null, null);
    expect(sim.enemies.list.filter((e) => e.type === 'parasite').length).toBe(1);
  });

  it("the brute's carapace stops half a blow from the front, none from behind", () => {
    const { sim } = stationGame();
    const b = sim.enemies.spawn('brute', new THREE.Vector3(0, 0, 30));
    b.facing = 0; // facing +Z
    const hp = b.hp;
    sim.enemies.damage(b, 100, new THREE.Vector3(0, 0, -1), null); // a shot coming at its face
    const front = hp - b.hp;
    sim.enemies.damage(b, 100, new THREE.Vector3(0, 0, 1), null); // in the back
    const back = hp - front - b.hp;
    expect(front).toBeCloseTo(50);
    expect(back).toBeCloseTo(100);
  });
});

describe('station drones and duct crawlers', () => {
  const levelOf = (w) => new Level(JSON.parse(readFileSync(new URL(`../public/${getWorld(w).files.levelData}`, import.meta.url), 'utf8')));
  const station = () => {
    const sim = new Sim(levelOf('station'), { mode: 'sandbox', world: 'station' });
    const player = sim.addPlayer('p1');
    return { sim, player };
  };

  it('a crawler climbs out of a vent, and badly hurt goes back into the ducts and out of another', () => {
    const { sim, player } = station();
    expect(sim.level.vents.length).toBe(13);
    player.pos.set(14, 0, 0);
    const at = sim.pickSpawn('crawler');
    const e = sim.enemies.spawn('crawler', at);
    e.T = { ...e.T, leap: null, melee: { ...e.T.melee, range: 0.01 } }; // no leap to lift it off the floor
    expect(e.act?.kind).toBe('emerge');
    expect(e.lift).toBeGreaterThan(0);
    run(sim, 2.5); // from the reactor room's ceiling, 7 m up, it takes 1.4 s
    expect(e.lift).toBe(0);
    sim.enemies.damage(e, e.maxHp * 0.6, null, player);
    let hid = false, out = null;
    run(sim, 12, () => {
      if (e.hidden) hid = true;
      if (hid && !e.hidden && !out) out = e.pos.clone();
      return emptyCommand();
    });
    expect(hid).toBe(true);
    expect(out).toBeTruthy();
    expect(sim.enemies.list).toContain(e);
  });

  it('a drone flies to a firing spot, fires a salvo of three bolts, then goes out of sight', () => {
    const { sim, player } = station();
    player.pos.set(34, 0, 28); // down the perimeter's south-east leg
    const d = sim.enemies.spawn('drone', new THREE.Vector3(34, 2.2, 13));
    d.fireCd = 0;
    let shots = 0, coverSeen = false;
    run(sim, 6, () => {
      for (const ev of sim.events) if (ev.type === 'enemyFire') shots++;
      if (d.droneState === 'cover') coverSeen = true;
      player.health = 100;
      return emptyCommand();
    });
    expect(shots).toBeGreaterThanOrEqual(3);
    expect(coverSeen).toBe(true);
    expect(d.pos.y).toBeGreaterThan(1.5); // still hovering under the ceiling
  });
});

describe('the Hive Queen', () => {
  const levelOf = (w) => new Level(JSON.parse(readFileSync(new URL(`../public/${getWorld(w).files.levelData}`, import.meta.url), 'utf8')));
  const queenGame = () => {
    const sim = new Sim(levelOf('station'), { mode: 'sandbox', world: 'station' });
    const player = sim.addPlayer('p1');
    player.pos.set(0, 0, 14); // in the south tunnel's mouth, looking into the reactor room
    sim.mode.callBoss();
    return { sim, player, queen: sim.enemies.boss };
  };
  const alive = (sim) => (player) => { player.health = player.maxHealth; return emptyCommand(); };

  it('wakes on the reactor with a roar, her egg sacs round the room on clear floor', () => {
    const { sim, queen } = queenGame();
    expect(queen.pos.length()).toBeLessThan(0.01);
    const sacs = sim.enemies.list.filter((e) => e.type === 'eggsac');
    expect(sacs.length).toBe(4);
    for (const s of sacs) {
      expect(sim.level.nav.inWorld(s.pos.x, s.pos.z)).toBe(true);
      expect(sim.level.groundAt(s.pos.x, s.pos.z, 0.75, 1)).toBe(0); // nothing under or in it
    }
    // the sacs are parts: the wave only waits for her
    expect(sim.enemies.alive).toBe(1);
    const hp = queen.hp;
    sim.enemies.damage(queen, 500, null, null); // still roaring
    expect(queen.hp).toBe(hp);
  });

  it('her sacs hatch parasites; a sac shot down is laid again later', () => {
    const { sim, player, queen } = queenGame();
    run(sim, 12, alive(sim));
    expect(sim.enemies.list.filter((e) => e.type === 'parasite').length).toBeGreaterThan(0);
    const sac = sim.enemies.list.find((e) => e.type === 'eggsac');
    sim.enemies.damage(sac, 9999, null, player);
    expect(sim.enemies.list.filter((e) => e.type === 'eggsac').length).toBe(3);
    run(sim, queen.T.queen.layEvery + 2, alive(sim));
    expect(sim.enemies.list.filter((e) => e.type === 'eggsac').length).toBe(4);
  });

  it('a shot at her head, out in front of the column, is a head shot', () => {
    const { sim, queen } = queenGame();
    queen.facing = 0; // facing +Z, towards the shooter
    const from = new THREE.Vector3(0, 1.6, 14);
    const dir = new THREE.Vector3(0, 5, 5.6).sub(from).normalize();
    const hit = sim.enemies.raycast(from, dir, 100);
    expect(hit.enemy).toBe(queen);
    expect(hit.head).toBe(true);
  });

  it('at half health she cuts the power and shuts herself in; every sac shot breaks her open', () => {
    const { sim, player, queen } = queenGame();
    run(sim, queen.T.queen.roar + 0.2, alive(sim));
    sim.drainEvents();
    sim.enemies.damage(queen, queen.maxHp * 0.55, null, player);
    run(sim, 1.5, alive(sim)); // the blow she was winding up, if any
    expect(sim.power).toBe(false);
    expect(sim.drainEvents().some((ev) => ev.type === 'power' && !ev.on)).toBe(true);
    run(sim, queen.T.queen.roar + 0.5, alive(sim));
    expect(queen.act?.kind).toBe('guard');
    const sacs = sim.enemies.list.filter((e) => e.type === 'eggsac');
    expect(sacs.length).toBe(queen.T.queen.guard.sacs);
    const hp = queen.hp;
    sim.enemies.damage(queen, 300, null, player); // shut in: nothing gets through
    expect(queen.hp).toBe(hp);
    for (const s of sacs) sim.enemies.damage(s, 9999, null, player);
    run(sim, 0.1, alive(sim));
    expect(queen.act?.kind).toBe('exposed');
    sim.enemies.damage(queen, 100, null, player);
    expect(hp - queen.hp).toBeCloseTo(200); // double damage while exposed
  });

  it('at a third she blows the airlocks by turns; her death puts things back', () => {
    const { sim, player, queen } = queenGame();
    queen.stage = 2;
    queen.guarded = true; // her shell already broken
    queen.act = null;
    sim.power = false;
    sim.enemies.damage(queen, queen.maxHp * 0.7, null, player);
    run(sim, 1.5, alive(sim));
    expect(queen.stage).toBe(3);
    expect(sim.breached).toBeTruthy();
    expect(sim.airlocks.filter((a) => a.open).length).toBe(1);
    const first = sim.airlocks.findIndex((a) => a.open);
    run(sim, 12.5, alive(sim));
    expect(sim.airlocks.findIndex((a) => a.open)).not.toBe(first); // the other one now
    sim.enemies.damage(queen, 1e6, null, player);
    expect(sim.power).toBe(true);
    expect(sim.breached).toBeNull();
    expect(player.grabbed).toBeNull();
    expect(sim.enemies.list.filter((e) => e.type === 'eggsac').length).toBe(0);
  });

  it('she varies her blows: several kinds, never the same twice running, each warned on the floor', () => {
    const { sim, player, queen } = queenGame();
    player.pos.set(0, 0, 6.8); // close enough for every blow
    const blows = [];
    let rings = 0, rains = 0, hurt = false;
    run(sim, 40, (p) => {
      const k = queen.act?.kind;
      if (k && k !== blows[blows.length - 1] && k !== 'transform' && k !== 'lay') blows.push(k);
      for (const ev of sim.drainEvents()) {
        if (ev.type === 'ring') rings++;
        if (ev.type === 'rainMark' && ev.kind === 'acid') rains++;
        if (ev.type === 'playerHurt') hurt = true;
      }
      p.health = p.maxHealth;
      p.pos.set(0, 0, 6.8);
      return emptyCommand();
    });
    expect(new Set(blows).size).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < blows.length; i++) expect(blows[i]).not.toBe(blows[i - 1]);
    expect(rings).toBeGreaterThan(0);
    expect(rains).toBeGreaterThan(0);
    expect(hurt).toBe(true);
  });

  it('in her last phase her tail grabs and drags; shot enough she lets go', () => {
    const { sim, player, queen } = queenGame();
    run(sim, queen.T.queen.roar + 0.2, alive(sim));
    queen.stage = 3;
    player.pos.set(0, 0, 8);
    queen.act = { kind: 'grab', t: 0, dur: 0.01, at: player.pos.clone(), player };
    run(sim, 0.1, alive(sim));
    expect(player.grabbed).toBeTruthy();
    const from = player.pos.clone();
    run(sim, 1.2, alive(sim));
    expect(player.pos.distanceTo(queen.pos)).toBeLessThan(from.distanceTo(queen.pos) - 0.5); // dragged in
    sim.enemies.damage(queen, queen.T.queen.grab.free + 10, null, player);
    run(sim, 0.1, alive(sim));
    expect(player.grabbed).toBeNull();
  });

  it('a blow comes down where a red circle warned, near her', () => {
    const { sim, player } = queenGame();
    player.pos.set(0, 0, 7.5);
    let ring = null, slam = null, hp = 0;
    run(sim, 20, (p) => {
      for (const ev of sim.drainEvents()) {
        if (ev.type === 'ring' && !ring) ring = ev;
        if (ev.type === 'slam' && ring && !slam) { slam = ev; hp = p.health; }
      }
      if (!slam) p.health = p.maxHealth;
      p.pos.set(0, 0, 7.5);
      return emptyCommand();
    });
    expect(ring).not.toBeNull();
    expect(Math.hypot(ring.pos.x - player.pos.x, ring.pos.z - player.pos.z)).toBeLessThan(3); // her tail on them, or her claws' arc
    expect(slam).not.toBeNull();
    expect(hp).toBeLessThan(player.maxHealth);
  });
});

describe('the station objectives', () => {
  const levelOf = (w) => new Level(JSON.parse(readFileSync(new URL(`../public/${getWorld(w).files.levelData}`, import.meta.url), 'utf8')));
  const wavesGame = () => {
    const sim = new Sim(levelOf('station'), { mode: 'waves', world: 'station' });
    const player = sim.addPlayer('p1');
    sim.start();
    for (let i = 0; i < 600 && !sim.mode.waveActive; i++) sim.step(DT, new Map([['p1', emptyCommand()]])); // the countdown to wave 1
    for (const e of [...sim.enemies.list]) sim.enemies.damage(e, 1e6, null, null);
    sim.mode.queue = []; // only what the test puts in
    // one still enemy far off in the greenhouse, so the wave does not end (and its objective with it)
    const keeper = pacify(sim.enemies.spawn('parasite', new THREE.Vector3(0, 0, -38)));
    keeper.T = { ...keeper.T, speed: 0, stay: true };
    keeper.looter = false;
    return { sim, player };
  };
  const hold = (player, x, z) => (p) => { p.health = p.maxHealth; p.pos.set(x, 0, z); return emptyCommand(); };

  it('the reactor objective: hosts go and sabotage it, from whatever side they come', () => {
    const { sim, player } = wavesGame();
    sim.mode.objective = { id: 'reactor', ...WORLD_OBJECTIVES.reactor.make(1, sim.world) };
    sim.chest = { pos: new THREE.Vector3(0, 0, 0), ring: 2.9, gold: 100, looters: 1 };
    const host = pacify(sim.enemies.spawn('host', new THREE.Vector3(-36, 0, 0))); // in the labs
    expect(host.looter).toBe(true);
    run(sim, 40, hold(player, 36, -8)); // the player far off in the crew quarters
    expect(host.pos.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(5); // at the reactor (2.2 m round)
    expect(sim.chest.gold).toBeLessThan(100);
    expect(player.waveStats.chestLoss).toBeGreaterThan(0);
  });

  it('the airlocks objective: a blown airlock shut in time is fine, one left open fails it', () => {
    const { sim, player } = wavesGame();
    sim.mode.objective = { id: 'breaches', ...WORLD_OBJECTIVES.breaches.make(1, sim.world) };
    sim.breaches = { ...sim.world.breaches, t: 0 };
    run(sim, 0.1, hold(player, 0, 0));
    const blown = sim.airlocks.find((a) => a.open);
    expect(blown).toBeTruthy();
    expect(player.waveStats.breachLeft).toBeGreaterThan(14);
    run(sim, 5, hold(player, 0, 0));
    expect(blown.open).toBe(true); // it stays open until someone shuts it
    // the lever, pulled from where it is
    player.pos.copy(blown.lever).setY(0);
    run(sim, 0.1, (p, i) => { p.health = p.maxHealth; p.pos.copy(blown.lever).setY(0); return { ...emptyCommand(), use: i === 0 }; });
    expect(blown.open).toBe(false);
    expect(player.waveStats.breachLate).toBe(0);
    // the next one is left open
    sim.breaches.t = 0;
    run(sim, sim.world.breaches.close + 1, hold(player, 0, 0));
    expect(player.waveStats.breachLate).toBe(1);
    // the wave over, the airlocks close
    sim.endBreaches();
    expect(sim.airlocks.every((a) => !a.open)).toBe(true);
  });

  it('neither objective falls in the Hive Queen\'s wave', () => {
    const world = getWorld('station');
    for (let i = 0; i < 50; i++) expect(['reactor', 'breaches']).not.toContain(pickObjective(5, world).id);
  });
});

// Web portals run on every kind of screen: 30, 60 or 144 frames a second must play the same game.
describe('frame rate', () => {
  const RATES = [30, 60, 144];
  const spread = (xs) => Math.max(...xs) - Math.min(...xs);

  it('a jump reaches the same height at any frame rate', () => {
    const apex = RATES.map((hz) => {
      const { sim, player } = newGame();
      let top = player.pos.y;
      for (let i = 0; i < hz; i++) {
        sim.step(1 / hz, new Map([[player.id, { ...emptyCommand(), jump: i === 0 }]]));
        top = Math.max(top, player.pos.y);
      }
      return top - level.playerStart.y;
    });
    expect(apex[1]).toBeGreaterThan(0.5);
    expect(spread(apex)).toBeLessThan(0.01);
  });

  it('a grenade flies the same arc at any frame rate', () => {
    const at = RATES.map((hz) => {
      const { sim, player } = newGame();
      sim.step(1 / hz, new Map([[player.id, { ...emptyCommand(), pitch: 0.3 }]]));
      sim.throwGrenade(player);
      for (let i = 0; i < hz / 2; i++) sim.step(1 / hz, new Map([[player.id, emptyCommand()]]));
      return sim.grenades[0].pos.clone();
    });
    expect(spread(at.map((p) => p.y))).toBeLessThan(0.02);
    expect(spread(at.map((p) => p.z))).toBeLessThan(0.02);
  });
});
