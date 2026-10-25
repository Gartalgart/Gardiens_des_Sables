import { ENEMY_LOOK } from './view/enemyView.js';
import { upgradeInfo } from './sim/progression.js';

const $ = (id) => document.getElementById(id);
const RANGE = 40; // metres shown from centre to edge of the minimap
const MAP_PX = 5; // pixels per metre in the pre-rendered map
const HALF = 60;

export class Hud {
  // level: collision data of the level (boxes and braziers are drawn on the minimap)
  // world: the universe, for its texts (the boss's name, its enemies in the arena) and its look
  // (src/worlds/*.js `hud`: the minimap's colours); an indoor map has ceilings, left out of the
  // minimap (anything starting 3 m up)
  constructor(level, world) {
    this.el = $('hud');
    this.mm = $('minimap');
    this.ctx = this.mm.getContext('2d');
    this.theme = world.hud;
    this.guards = world.texts.guards;
    this.map = this.#renderMap(level, !!world.ambiance.indoor, world.ambiance.fire.glow);
    const bossName = world.texts.bossName;
    this.hitTimer = 0;
    this.bannerTimer = 0;
    this.pickupTimer = 0;
    this.lastHealth = 100;
    this.medalTimer = 0;

    this.bossBar = document.createElement('div');
    this.bossBar.id = 'boss-bar';
    this.bossBar.innerHTML = `<div class="boss-name">${bossName}</div><div class="boss-track"><div class="boss-fill"></div></div>`;
    this.bossBar.style.cssText = 'position:absolute;top:92px;left:50%;transform:translateX(-50%);width:min(520px,60vw);text-align:center;display:none';
    this.el.appendChild(this.bossBar);
    const st = document.createElement('style');
    st.textContent = `.boss-name{font-family:var(--display);font-weight:800;letter-spacing:.2em;color:var(--accent-hi);font-size:15px;margin-bottom:4px}
      .boss-track{height:10px;background:rgba(0,0,0,.6);border:1px solid var(--line)}
      .boss-fill{height:100%;background:linear-gradient(90deg,#8c1a10,var(--accent));transform-origin:left;transition:transform .15s}`;
    document.head.appendChild(st);
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  // ---------- co-op ----------
  // names and health of the other players
  team(mates) {
    const html = mates.map((m) => {
      const esc = String(m.name).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const k = m.dead ? m.revive : m.health / m.maxHealth;
      return `<div class="mate${m.dead ? ' down' : ''}">${esc}${m.dead ? ' — À TERRE' : ''}<div class="bar"><i style="transform:scaleX(${Math.max(0, Math.min(1, k)).toFixed(3)})"></i></div></div>`;
    }).join('');
    if (this.teamHtml !== html) { $('team').innerHTML = html; this.teamHtml = html; }
  }

  prompt(text) {
    const el = $('prompt');
    el.classList.toggle('hidden', !text);
    if (text && el.textContent !== text) el.textContent = text;
  }

  // progress: null when standing, else how far a teammate got picking the player up
  downed(progress, alone) {
    $('downed').classList.toggle('hidden', progress === null);
    if (progress === null) return;
    this.set('downed-title', 'À terre');
    $('downed-fill').style.width = `${Math.round(progress * 100)}%`;
    this.set('downed-sub', alone ? 'Tous tes coéquipiers sont tombés…' : progress > 0 ? 'Un coéquipier te relève !' : 'Un coéquipier peut te relever (E)');
  }

  // ---------- arena ----------
  // killed: null when alive, else { by: killer's name or null, respawn: seconds left, total }
  eliminated(killed) {
    $('downed').classList.toggle('hidden', !killed);
    if (!killed) return;
    this.set('downed-title', 'Éliminé');
    $('downed-fill').style.width = `${Math.round((1 - killed.respawn / killed.total) * 100)}%`;
    const back = `réapparition dans ${Math.max(1, Math.ceil(killed.respawn))} s`;
    this.set('downed-sub', killed.by ? `par ${killed.by} — ${back}` : back);
  }

  // a line in the kill feed, top right; mine: the local player is in it
  frag(killer, victim, weapon, head, mine) {
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const el = document.createElement('div');
    el.className = mine ? 'me' : '';
    el.innerHTML = killer
      ? `${esc(killer)}<span class="w${head ? ' head' : ''}">${WEAPON_LABEL[weapon] ?? weapon}${head ? ' · TÊTE' : ''}</span>${esc(victim)}`
      : `${esc(victim)}<span class="w">${weapon === 'guardian' ? this.guards.toUpperCase() : weapon === 'grenade' ? 'SA GRENADE' : 'CHUTE'}</span>`;
    el.dataset.life = 5;
    const feed = $('killfeed');
    feed.prepend(el);
    while (feed.children.length > 5) feed.lastChild.remove();
  }

  #fadeKillfeed(dt) {
    for (const el of [...$('killfeed').children]) {
      const life = Number(el.dataset.life) - dt;
      el.dataset.life = life;
      if (life < 0.6) el.style.opacity = Math.max(0, life / 0.6);
      if (life <= 0) el.remove();
    }
  }

  clearKillfeed() { $('killfeed').innerHTML = ''; }

  // held Tab: every player of the arena, best first
  scoreboard(rows, meta) {
    const el = $('scoreboard');
    el.classList.toggle('hidden', !rows);
    if (!rows) return;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const html = `<h3>Arène</h3><div class="meta">${meta}</div><table class="board"><tr><th>#</th><th>Joueur</th><th class="num">Élim.</th><th class="num">Morts</th><th class="num">${this.guards}</th></tr>${
      rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.frags}</td><td class="num">${r.deaths}</td><td class="num">${r.kills}</td></tr>`).join('')}</table>`;
    if (this.boardHtml !== html) { el.innerHTML = html; this.boardHtml = html; }
  }

  // the ground and walls in the universe's colours (walls lighter the taller they are), its lights
  // (braziers, lanterns, neons) as dots of their glow
  #renderMap(level, indoor, glow) {
    const c = document.createElement('canvas');
    c.width = c.height = HALF * 2 * MAP_PX;
    const g = c.getContext('2d');
    const { ground, wall } = this.theme.map;
    g.fillStyle = ground;
    g.fillRect(0, 0, c.width, c.height);
    const boxes = [...level.boxes].sort((a, b) => a.max.y - b.max.y);
    for (const b of boxes) {
      if (b.max.y < 0.8 || (indoor && b.min.y >= 3)) continue;
      const h = Math.min(1, b.max.y / 9);
      const l = 70 + h * 110;
      g.fillStyle = `rgb(${wall.map((k) => Math.min(255, Math.round(l * k))).join(', ')})`;
      g.fillRect((b.min.x + HALF) * MAP_PX, (b.min.z + HALF) * MAP_PX, (b.max.x - b.min.x) * MAP_PX, (b.max.z - b.min.z) * MAP_PX);
    }
    for (const p of level.braziers) {
      g.fillStyle = glow;
      g.beginPath(); g.arc((p.x + HALF) * MAP_PX, (p.z + HALF) * MAP_PX, 3, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  // mates: the other players (co-op), drawn as blue arrows; foes: arena players who just fired, in red
  drawMinimap(player, enemies, mates = [], foes = []) {
    const g = this.ctx, W = this.mm.width, R = W / 2;
    const scale = R / RANGE;
    const yaw = player.yaw;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(10, 10, 18, 0.6)';
    g.fillRect(0, 0, W, W);

    g.translate(R, R);
    g.rotate(yaw);
    g.scale(scale, scale);
    g.translate(-player.pos.x, -player.pos.z);
    g.globalAlpha = 0.9;
    g.drawImage(this.map, -HALF, -HALF, HALF * 2, HALF * 2);
    g.globalAlpha = 1;

    // pickups and projectiles
    for (const p of enemies.pickups) {
      g.fillStyle = p.kind === 'ammo' ? '#56d8ff' : '#ff4a4a';
      g.fillRect(p.pos.x - 0.6, p.pos.z - 0.6, 1.2, 1.2);
    }
    for (const p of enemies.projectiles) {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(p.pos.x, p.pos.z, 0.45, 0, Math.PI * 2); g.fill();
    }
    g.restore();

    // enemies (drawn in screen space so dot size stays constant)
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const t = performance.now() / 1000;
    for (const e of enemies.list) {
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      let sx = (dx * cos - dz * sin) * scale, sy = (dx * sin + dz * cos) * scale;
      const d = Math.hypot(sx, sy);
      const color = ENEMY_LOOK[e.type].dot;
      if (d > R - 10) {
        // off-map: arrow on the rim
        const a = Math.atan2(sy, sx);
        g.save();
        g.translate(R + Math.cos(a) * (R - 9), R + Math.sin(a) * (R - 9));
        g.rotate(a);
        g.fillStyle = color;
        g.globalAlpha = 0.75;
        g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4.5); g.lineTo(-4, 4.5); g.closePath(); g.fill();
        g.restore();
        continue;
      }
      const size = e.T.boss ? 7 : e.T.big ? 5 : 3.6;
      g.fillStyle = color;
      g.shadowColor = color; g.shadowBlur = 8;
      g.beginPath(); g.arc(R + sx, R + sy, size + (e.act ? Math.sin(t * 30) * 1.2 : 0), 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    }

    for (const m of mates) {
      const dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z;
      let sx = (dx * cos - dz * sin) * scale, sy = (dx * sin + dz * cos) * scale;
      const d = Math.hypot(sx, sy);
      if (d > R - 10) { sx *= (R - 10) / d; sy *= (R - 10) / d; }
      g.save();
      g.translate(R + sx, R + sy);
      g.rotate(yaw - m.yaw);
      g.fillStyle = m.dead ? (Math.sin(t * 8) > 0 ? '#ff4a4a' : '#7a1d14') : '#6fe3ff';
      g.beginPath(); g.moveTo(0, -7); g.lineTo(-5, 5); g.lineTo(0, 2.5); g.lineTo(5, 5); g.closePath(); g.fill();
      g.restore();
    }
    for (const f of foes) {
      const dx = f.pos.x - player.pos.x, dz = f.pos.z - player.pos.z;
      let sx = (dx * cos - dz * sin) * scale, sy = (dx * sin + dz * cos) * scale;
      const d = Math.hypot(sx, sy);
      if (d > R - 10) { sx *= (R - 10) / d; sy *= (R - 10) / d; }
      g.globalAlpha = Math.min(1, f.fade);
      g.fillStyle = '#ff4a3a';
      g.shadowColor = '#ff4a3a'; g.shadowBlur = 10;
      g.beginPath(); g.arc(R + sx, R + sy, 5, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      g.globalAlpha = 1;
    }

    // compass letters on the rim (north = -Z)
    const dirs = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['O', -1, 0]];
    g.font = '700 13px Rajdhani, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [label, x, z] of dirs) {
      const sx = x * cos - z * sin, sy = x * sin + z * cos;
      g.fillStyle = label === 'N' ? this.theme.accent : this.theme.inkDim;
      g.fillText(label, R + sx * (R - 12), R + sy * (R - 12));
    }

    // view cone + player arrow
    g.fillStyle = 'rgba(255, 240, 200, 0.08)';
    g.beginPath(); g.moveTo(R, R); g.arc(R, R, R * 0.7, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); g.closePath(); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(R, R - 8); g.lineTo(R - 5.5, R + 6); g.lineTo(R, R + 3); g.lineTo(R + 5.5, R + 6); g.closePath(); g.fill();
  }

  set(id, value) {
    const el = $(id);
    if (el.textContent !== String(value)) el.textContent = value;
  }

  update(dt, s) {
    const arena = s.arena;
    this.set('wave-word', arena ? 'ÉLIMINATIONS' : 'VAGUE');
    this.set('wave-num', arena ? arena.frags : s.wave);
    this.set('wave-total', arena ? `/${arena.scoreLimit}` : Number.isFinite(s.totalWaves) ? `/${s.totalWaves}` : '');
    this.set('left-label', arena ? 'RANG' : 'ENNEMIS RESTANTS');
    this.set('score-label', arena ? 'MORTS' : 'SCORE');
    this.set('score', arena ? arena.deaths : s.score.toLocaleString('fr-FR'));
    this.#objective(s.objective, s.waveStats, s.waveActive);
    this.#cards(s.cardOffer, s.upgrades);
    this.set('timer', fmtTime(arena ? Math.ceil(arena.timeLeft) : s.time));
    $('timer').classList.toggle('low', !!arena && arena.timeLeft < 30);
    this.set('enemies-left', arena ? `${arena.rank}${arena.rank === 1 ? 'er' : 'e'} / ${arena.players}` : s.enemiesLeft);
    this.#fadeKillfeed(dt);

    const hp = Math.ceil(s.health);
    this.set('health-num', hp);
    const fill = $('health-fill');
    fill.style.transform = `scaleX(${s.health / 100})`;
    fill.classList.toggle('low', s.health < 35);
    $('health-ghost').style.transform = `scaleX(${s.health / 100})`;
    $('vignette').style.opacity = Math.max(0, (1 - s.health / 100) * 1.1 - 0.15 + this.hurtFlash);
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt * 2);

    this.#grenades(s.grenades);
    this.#updatePoints(dt);
    this.medalTimer -= dt;
    if (this.medalTimer <= 0) $('medal').classList.add('hidden');

    const w = s.weapon;
    this.set('weapon-name', w.def.name);
    const melee = !!w.def.melee;
    // an energy weapon shows its heat, and a warning while it is locked
    const heat = !!w.def.heat;
    this.set('ammo-mag', melee ? '—' : heat ? `${Math.round(w.heat * 100)}%` : w.mag);
    this.set('ammo-res', melee ? (s.ads > 0.5 ? ' PARADE' : '') : heat ? (w.locked > 0 ? ' SURCHAUFFE' : ' CHALEUR') : w.reserve === Infinity ? '∞' : w.reserve);
    $('ammo-mag').classList.toggle('empty', !melee && (heat ? w.locked > 0 || w.heat > 0.8 : w.mag === 0));
    $('ammo-sep').style.display = melee || heat ? 'none' : '';
    $('reload-hint').classList.toggle('hidden', melee || heat || !(w.mag <= Math.ceil(w.def.mag * 0.25) && !s.reloading && w.reserve > 0));
    document.querySelectorAll('.slot').forEach((el, i) => {
      el.classList.toggle('active', i === s.weaponIndex);
      el.classList.toggle('locked', !s.unlocked[i]);
    });

    // crosshair: gap grows with spread, fades when aiming
    const gap = 6 + s.spread * 260;
    const ch = $('crosshair');
    ch.style.opacity = s.scoped ? 0 : s.reloading ? 0.3 : melee ? 0.5 : 1 - s.ads;
    ch.querySelector('.t').style.top = `${-gap - 9}px`;
    ch.querySelector('.b').style.top = `${gap}px`;
    ch.querySelector('.l').style.left = `${-gap - 9}px`;
    ch.querySelector('.r').style.left = `${gap}px`;
    this.parryFlash = Math.max(0, (this.parryFlash || 0) - dt * 2.5);
    $('parry-flash').style.opacity = this.parryFlash;
    $('ads-vignette').style.opacity = s.scoped ? 0 : s.ads * 0.9;
    $('scope').classList.toggle('hidden', !s.scoped);

    this.hitTimer -= dt;
    $('hitmarker').style.opacity = Math.max(0, this.hitTimer / 0.15);

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) $('banner').classList.add('hidden');
    }
    this.pickupTimer -= dt;
    $('pickup-msg').style.opacity = this.pickupTimer > 0 ? 1 : 0;

    const boss = s.boss;
    this.bossBar.style.display = boss ? 'block' : 'none';
    if (boss) this.bossBar.querySelector('.boss-fill').style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
  }

  // secondary objective of the wave and its progress
  #objective(obj, st, active) {
    const el = document.getElementById('objective');
    if (!obj || !active) { if (el.textContent) el.textContent = ''; return; }
    const v = st[obj.stat];
    let progress, done = false;
    if (obj.stat === 'time') progress = `${Math.max(0, Math.ceil(obj.target - v))} s`;
    else if (obj.stat === 'chestLoss') { progress = `${obj.unit ?? 'or'} : ${Math.round(100 - v)} %`; done = false; }
    else if (obj.stat === 'breachLate') progress = v ? 'trop tard' : st.breachLeft != null ? `sas ouvert : ${Math.ceil(st.breachLeft)} s` : 'sas fermés';
    else if (obj.under) progress = `${Math.round(v)} / ${obj.target} PV`;
    else { progress = `${Math.min(v, obj.target)} / ${obj.target}`; done = v >= obj.target; }
    const html = `Objectif : ${obj.text} — <b>${done ? '✓' : progress}</b>`;
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.toggle('done', done);
  }

  // upgrade cards to choose from between waves (keys 1-4)
  #cards(offer, upgrades) {
    const box = document.getElementById('cards');
    const key = offer ? offer.join(',') : '';
    if (key === this.cardsKey) return;
    this.cardsKey = key;
    box.classList.toggle('hidden', !offer);
    if (!offer) return;
    document.getElementById('cards-sub').textContent = offer.length > 3 ? 'Objectif réussi : une carte de plus au choix !' : '';
    document.getElementById('cards-list').innerHTML = offer.map((id, i) => {
      const u = upgradeInfo(id);
      const have = upgrades[id] || 0;
      return `<div class="card"><span class="key">${i + 1}</span><div class="name">${u.name}</div><div class="desc">${u.desc}</div>
        <div class="count">${u.max > 1 ? `NIVEAU ${have + 1} / ${u.max}` : 'UNIQUE'}</div></div>`;
    }).join('');
  }

  hit(head) {
    this.hitTimer = head ? 0.25 : 0.15;
    $('hitmarker').classList.toggle('head', head);
  }

  hurt(angle) {
    this.hurtFlash = 0.35;
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    el.style.transform = `rotate(${angle}rad)`;
    $('damage-dirs').appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = 0));
    setTimeout(() => el.remove(), 1000);
  }

  perfectParry() { this.parryFlash = 1; }

  // ---------- grenades, points, medals ----------
  #grenades(n) {
    if (n === this.grenadeCount) return;
    this.grenadeCount = n;
    $('grenades').innerHTML = 'G' + Array.from({ length: 4 }, (_, i) => `<i class="${i < n ? '' : 'empty'}"></i>`).join('');
  }

  // Call of Duty: each gain is a line next to the crosshair, and the total grows while they chain
  points(amount, label) {
    this.pointsTotal = (this.pointsTotal ?? 0) + amount;
    this.pointsTimer = 2.2;
    const total = $('points-total');
    total.textContent = `+${this.pointsTotal.toLocaleString('fr-FR')}`;
    total.style.opacity = 1;
    total.classList.remove('bump'); void total.offsetWidth; total.classList.add('bump');
    const line = document.createElement('div');
    line.innerHTML = `${label}<b>+${amount.toLocaleString('fr-FR')}</b>`;
    line.dataset.life = 2.2;
    const list = $('points-list');
    list.prepend(line);
    while (list.children.length > 4) list.lastChild.remove();
  }

  #updatePoints(dt) {
    if (this.pointsTimer > 0) {
      this.pointsTimer -= dt;
      if (this.pointsTimer <= 0) { this.pointsTotal = 0; $('points-total').style.opacity = 0; }
    }
    for (const el of [...$('points-list').children]) {
      const life = Number(el.dataset.life) - dt;
      el.dataset.life = life;
      if (life < 0.4) el.style.opacity = Math.max(0, life / 0.4);
      if (life <= 0) el.remove();
    }
  }

  clearPoints() {
    this.pointsTotal = 0; this.pointsTimer = 0;
    $('points-total').style.opacity = 0;
    $('points-list').innerHTML = '';
    $('medal').classList.add('hidden');
  }

  // Halo: the medal's name, big and gold, under the top of the screen
  medal(title, sub = '') {
    const el = $('medal');
    el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
    this.medalTimer = 2.4;
  }

  banner(title, sub, duration = 2.5) {
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    const b = $('banner');
    b.classList.remove('hidden');
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    this.bannerTimer = duration;
  }

  pickup(text) {
    this.set('pickup-msg', text);
    this.pickupTimer = 1.4;
  }
}

const WEAPON_LABEL = { sword: 'KHÉPESH', pistol: 'PISTOLET', rifle: 'FUSIL', shotgun: 'POMPE', sniper: 'PRÉCISION', explosion: 'MOMIE', grenade: 'GRENADE' };

export function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
