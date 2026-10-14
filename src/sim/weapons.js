// Weapon rules and the per-player loadout state. Display (view model poses, flashes) lives in the client.
export const WEAPONS = [
  {
    id: 'sword', name: 'KHÉPESH', melee: true, dmg: 85, range: 3.0, swing: 0.34, hitAt: 0.1, cooldown: 0.42,
    spread: 0, adsSpread: 0, adsFov: 75,
  },
  {
    id: 'pistol', name: 'PISTOLET', dmg: 34, rpm: 330, auto: false, mag: 12, reserve: Infinity, pellets: 1,
    spread: 0.014, adsSpread: 0.002, reload: 1.25, recoil: 0.028, adsFov: 58,
  },
  {
    id: 'rifle', name: "FUSIL D'ASSAUT", dmg: 23, rpm: 640, auto: true, mag: 30, reserve: 210, pellets: 1,
    spread: 0.034, adsSpread: 0.004, reload: 2.1, recoil: 0.013, adsFov: 50,
  },
  {
    id: 'shotgun', name: 'FUSIL À POMPE', dmg: 14, rpm: 78, auto: false, mag: 6, reserve: 42, pellets: 9,
    spread: 0.085, adsSpread: 0.055, reload: 2.4, recoil: 0.07, adsFov: 62,
  },
];

const START_UNLOCKED = ['sword', 'pistol'];

export class Loadout {
  constructor(player, sim) {
    this.player = player;
    this.sim = sim;
    this.items = WEAPONS.map((def) => ({
      def, mag: def.mag, reserve: def.reserve, unlocked: START_UNLOCKED.includes(def.id),
    }));
    this.index = 1;
    this.cooldown = 0;
    this.reloading = 0;
    this.switching = 0;
    this.adsT = 0;
    this.triggerHeld = false;
    this.swingT = -1;
    this.swingDir = 1;
    this.swingHitDone = false;
    this.aimHeld = false;
    this.aimPressedAt = -99;
  }

  get current() { return this.items[this.index]; }
  get blocking() { return !!this.current.def.melee && this.adsT > 0.5; }
  // the parry was raised less than a quarter of a second ago (it takes ~0.05 s to come up)
  get perfectParry() { return this.blocking && this.sim.time - this.aimPressedAt <= 0.25; }

  switchTo(i) {
    if (i === this.index || i < 0 || i >= this.items.length || !this.items[i].unlocked) return;
    this.index = i;
    this.reloading = 0;
    this.swingT = -1;
    this.switching = 0.35;
    this.cooldown = Math.max(this.cooldown, 0.3);
    this.sim.emit('switch', { pid: this.player.id, index: i });
  }

  // Returns { def, slot } when the weapon was newly unlocked.
  unlock(id) {
    const i = this.items.findIndex((it) => it.def.id === id);
    const it = this.items[i];
    if (!it || it.unlocked) return null;
    it.unlocked = true;
    it.mag = it.def.mag;
    it.reserve = it.def.reserve;
    this.switchTo(i);
    return { def: it.def, slot: i + 1 };
  }

  startReload() {
    const it = this.current;
    if (it.def.melee || this.reloading > 0 || it.mag >= it.def.mag || it.reserve <= 0) return;
    this.reloading = it.def.reload;
    this.sim.emit('reload', { pid: this.player.id, duration: it.def.reload });
  }

  addAmmo(fraction) {
    let any = false;
    for (const it of this.items) {
      if (!it.unlocked || it.def.melee || it.def.reserve === Infinity) continue;
      const add = Math.ceil(it.def.reserve * fraction);
      const before = it.reserve;
      it.reserve = Math.min(it.def.reserve * 1.5, it.reserve + add);
      if (it.reserve > before) any = true;
    }
    return any;
  }

  update(dt, cmd) {
    const player = this.player;
    const it = this.current;
    const def = it.def;

    if (cmd.slot != null) this.switchTo(cmd.slot);
    if (cmd.cycle) {
      const n = this.items.length;
      let i = this.index;
      do { i = (i + Math.sign(cmd.cycle) + n) % n; } while (!this.items[i].unlocked);
      this.switchTo(i);
    }
    if (cmd.reload) this.startReload();
    if (cmd.aim && !this.aimHeld) this.aimPressedAt = this.sim.time;
    this.aimHeld = cmd.aim;

    this.cooldown -= dt;
    this.switching = Math.max(0, this.switching - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const cur = this.current;
        const take = Math.min(cur.def.mag - cur.mag, cur.reserve);
        cur.mag += take;
        if (cur.reserve !== Infinity) cur.reserve -= take;
        this.reloading = 0;
      }
    }

    const swinging = this.swingT >= 0;
    const aiming = cmd.aim && this.reloading <= 0 && this.switching <= 0 && !player.sprinting && !swinging;
    this.adsT += ((aiming ? 1 : 0) - this.adsT) * (1 - Math.exp(-14 * dt));

    if (!cmd.fire) this.triggerHeld = false;
    const ready = this.cooldown <= 0 && this.reloading <= 0 && this.switching <= 0;
    if (def.melee) {
      // holding the button keeps slashing, alternating directions
      if (cmd.fire && ready && !this.blocking) this.#startSwing();
      this.#updateSwing(dt);
    } else {
      const wantFire = cmd.fire && (def.auto || !this.triggerHeld);
      if (wantFire && ready) {
        if (it.mag > 0) this.#fire();
        else if (!this.triggerHeld) { this.sim.emit('dry', { pid: player.id }); this.startReload(); }
        this.triggerHeld = true;
      }
      if (it.mag === 0 && it.reserve > 0 && this.reloading <= 0 && !cmd.fire) this.startReload();
    }
  }

  #startSwing() {
    const def = this.current.def;
    const player = this.player;
    this.swingT = 0;
    this.swingDir *= -1;
    this.swingHitDone = false;
    this.cooldown = def.cooldown;
    this.sim.emit('swing', { pid: player.id, dir: this.swingDir });
    // small lunge forward
    const fwd = player.flatForward();
    player.impulse(fwd.multiplyScalar(player.onGround ? 4.5 : 2));
  }

  #updateSwing(dt) {
    if (this.swingT < 0) return;
    const def = this.current.def;
    this.swingT += dt;
    if (!this.swingHitDone && this.swingT >= def.hitAt) {
      this.swingHitDone = true;
      this.player.stats.shotsFired++;
      const hits = this.sim.meleeAttack(this.player, def);
      if (hits > 0) this.player.stats.shotsHit++;
    }
    if (this.swingT >= def.swing) this.swingT = -1;
  }

  #fire() {
    const player = this.player;
    const it = this.current;
    const def = it.def;
    it.mag--;
    this.cooldown = 60 / def.rpm;
    player.stats.shotsFired++;

    const moveSpread = player.moving ? (player.sprinting ? 0.03 : 0.012) : 0;
    const airSpread = player.onGround ? 0 : 0.03;
    const spread = def.spread + (def.adsSpread - def.spread) * this.adsT + moveSpread * (1 - this.adsT * 0.7) + airSpread;
    this.sim.fireWeapon(player, def, spread);

    const kick = def.recoil * (1 - this.adsT * 0.45);
    player.kick(kick, (Math.random() - 0.5) * kick * 0.6);
  }
}
