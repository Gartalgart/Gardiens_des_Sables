import * as THREE from 'three';
import { drawCards, pickObjective, freshWaveStats, objectiveDone, BONUS } from '../progression.js';
import { t } from '../../i18n.js';

const ELITE_FROM_WAVE = 3;
const ELITE_CHANCE = 0.1;
const CARD_TIMEOUT = 45; // a player who never picks gets a random card (keeps co-op games moving)

// Everything the wave modes share: spawning a wave's queue, the break between waves, weapon
// unlocks, upgrade cards and the wave's secondary objective. Subclasses say what each wave holds.
export class WaveBase {
  constructor(sim) {
    this.sim = sim;
    this.wave = 0;
    this.waveActive = false;
    this.queue = [];
    this.spawnTimer = 0;
    this.breakTimer = 2.5;
    this.cardWait = 0;
    this.objective = null;
  }

  // --- to override
  composition(n) { return {}; } // { type: count } of wave n
  isFinal(n) { return false; }
  cardsAfter(n) { return true; } // are upgrade cards offered once wave n is cleared?
  eliteChance(n) { return n >= ELITE_FROM_WAVE ? ELITE_CHANCE : 0; }
  extraAlive(n) { return 0; } // more enemies at once than the difficulty allows
  spawnGapScale(n) { return 1; }
  get totalWaves() { return Infinity; }
  nextWaveTitle(n) { return t('sim.wave', { n }); }

  start() {
    this.sim.emit('banner', { title: t('sim.wave', { n: 1 }), sub: this.sim.world.texts.start, duration: 3 });
    this.sim.emit('horn', { victory: false });
  }

  get enemiesLeft() { return this.queue.length + this.sim.enemies.alive; }

  #beginWave(n) {
    const sim = this.sim;
    this.wave = n;
    sim.enemies.setWave(n);
    sim.resetKegs(); // the powder kegs of the map stand again
    const q = [];
    const types = sim.world.enemies;
    const swarms = []; // [type, count] of the types that come as a swarm (scarabs)
    for (let [type, count] of Object.entries(this.composition(n))) {
      // co-op: more enemies for more players (still a single pharaoh)
      if (type !== 'boss') count = Math.round(count * sim.playerScale);
      if (types[type].swarm) { swarms.push([type, count]); continue; }
      for (let i = 0; i < count; i++) q.push(type);
    }
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    // swarms are inserted as blocks: a swarm rises together
    for (let [type, left] of swarms) {
      while (left > 0) {
        const k = Math.min(types[type].swarm, left);
        q.splice(1 + Math.floor(Math.random() * q.length), 0, ...Array(k).fill(type));
        left -= k;
      }
    }
    // the boss arrives first so the fight is about him
    const bi = q.indexOf('boss');
    if (bi > 0) { q.splice(bi, 1); q.unshift('boss'); }
    this.queue = q;
    this.waveActive = true;
    this.spawnTimer = 0.5;
    // a secondary objective for this wave
    this.objective = pickObjective(n, sim.world);
    // protect the chest: it starts full, and some of this wave's enemies will go for it
    sim.chest = this.objective.chest ? { pos: new THREE.Vector3(...sim.world.chest.pos), ring: sim.world.chest.ring, gold: 100, looters: sim.world.chest.looters } : null;
    // shut the airlocks that blow: the first one some seconds in
    sim.breaches = this.objective.breaches ? { t: sim.world.breaches.first, ...sim.world.breaches } : null;
    for (const p of sim.players.values()) p.waveStats = freshWaveStats();
    sim.emit('objective', { state: 'start', text: this.objective.text });
  }

  update(dt) {
    const sim = this.sim;
    if (!sim.alivePlayers().length) return sim.end(false);
    if (!this.waveActive) {
      // the break only counts down once everyone has picked a card
      const waiting = sim.alivePlayers().filter((p) => p.cardOffer);
      if (waiting.length) {
        this.cardWait += dt;
        if (this.cardWait > CARD_TIMEOUT) for (const p of waiting) sim.pickCard(p, Math.floor(Math.random() * p.cardOffer.length));
        return;
      }
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) this.#beginWave(this.wave + 1);
      return;
    }
    for (const p of sim.players.values()) {
      p.waveStats.time += dt;
      if (sim.chest) p.waveStats.chestLoss = 100 - sim.chest.gold;
      if (sim.breaches) p.waveStats.breachLeft = sim.breachLeft();
    }

    const D = sim.difficulty;
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0 && sim.enemies.load < (D.maxAlive + this.extraAlive(this.wave)) * sim.playerScale) {
      const type = this.queue.shift();
      const at = sim.pickSpawn(type);
      if (sim.world.enemies[type].swarm) {
        sim.enemies.spawn(type, at);
        // the rest of its block (two blocks side by side in the queue still rise one after the other)
        for (let n = 1; n < sim.world.enemies[type].swarm && this.queue[0] === type; n++) {
          this.queue.shift();
          sim.enemies.spawn(type, sim.spreadAround(at, type));
        }
      } else {
        const elite = type !== 'boss' && Math.random() < this.eliteChance(this.wave);
        sim.enemies.spawn(type, at, { elite });
      }
      const gap = D.spawnGap;
      this.spawnTimer = (this.wave >= 4 ? gap[2] : this.wave >= 2 ? gap[1] : gap[0]) * this.spawnGapScale(this.wave);
    }
    if (!this.queue.length && sim.enemies.alive === 0) this.#waveCleared();
  }

  #waveCleared() {
    const sim = this.sim;
    const n = this.wave;
    this.waveActive = false;
    sim.chest = null;
    sim.endBreaches();
    // objective and wave bonus for every player still standing
    // the end of a wave picks every downed player up
    for (const p of sim.players.values()) if (p.dead) { sim.raise(p, 0.5); sim.emit('playerRevived', { pid: p.id, by: null }); }
    const winners = new Set();
    for (const p of sim.alivePlayers()) {
      sim.addScore(p, BONUS.wavePerLevel * n);
      if (this.objective && objectiveDone(this.objective, p.waveStats)) {
        winners.add(p.id);
        sim.addScore(p, BONUS.objective);
      }
    }
    sim.emit('objective', { state: winners.size ? 'done' : 'failed', text: this.objective?.text ?? '', winners: [...winners] });
    if (this.isFinal(n)) {
      for (const p of sim.alivePlayers()) sim.addScore(p, BONUS.victory);
      return sim.end(true);
    }
    this.breakTimer = 7;
    this.cardWait = 0;
    const next = n + 1;
    let unlocked = null;
    for (const p of sim.players.values()) {
      const u = sim.world.unlocks[next] && p.loadout.unlock(sim.world.unlocks[next]);
      unlocked = unlocked || u;
      p.loadout.addAmmo(0.5);
      p.loadout.addGrenades(1);
      // upgrade cards: three to choose from, four after a completed objective
      if (!p.dead && this.cardsAfter(n)) {
        p.cardOffer = drawCards(p, winners.has(p.id) ? 4 : 3);
        if (!p.cardOffer.length) p.cardOffer = null;
        else sim.emit('cardOffer', { pid: p.id, cards: p.cardOffer });
      }
    }
    const sub = unlocked ? t('sim.newWeapon', { name: unlocked.def.name, slot: unlocked.slot })
      : this.composition(next).boss ? sim.world.texts.bossWakes : t('sim.restocked');
    sim.emit('banner', { title: this.nextWaveTitle(next), sub, duration: 4.5 });
    if (unlocked) sim.emit('unlock', { weapon: unlocked.def.id });
    sim.emit('horn', { victory: false });
  }
}
