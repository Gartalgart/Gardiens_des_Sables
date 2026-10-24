// The per-player loadout state. Weapon rules come from the universe (src/worlds/); display (view model
// poses, flashes) lives in the client.
export const GRENADES = { start: 2, max: 4, cooldown: 0.9, lower: 0.45 };

export class Loadout {
  constructor(player, sim) {
    this.player = player;
    this.sim = sim;
    // the weapons and the ones held from the start belong to the universe (src/worlds/)
    // heat (energy weapons, def.heat): 0..1, and seconds still locked after it overheated
    this.items = sim.world.weapons.map((def) => ({
      def, mag: def.mag, reserve: def.reserve, unlocked: sim.world.startUnlocked.includes(def.id), heat: 0, locked: 0, coolWait: 0,
    }));
    this.index = 1;
    this.cooldown = 0;
    this.reloading = 0;
    this.shells = 0; // shells still to load in a shell-by-shell reload
    this.switching = 0;
    this.adsT = 0;
    this.triggerHeld = false;
    this.swingT = -1;
    this.swingDir = 1;
    this.swingHitDone = false;
    this.aimHeld = false;
    this.aimPressedAt = -99;
    this.grenades = GRENADES.start;
    this.grenadeCd = 0;
    this.burstLeft = 0; // shots still to come in a burst (def.burst)
    this.charging = -1; // seconds a charged shot (def.charge) has been charging, -1 when not
  }

  // returns true when the pouch took at least one
  addGrenades(n) {
    const before = this.grenades;
    this.grenades = Math.min(GRENADES.max, this.grenades + n);
    return this.grenades > before;
  }

  get current() { return this.items[this.index]; }
  // magazine size, enlarged by the "Chargeurs étendus" card
  magSize(it) { return Math.round(it.def.mag * this.player.mods.mag); }
  get blocking() { return !!this.current.def.melee && this.adsT > 0.5; }
  // the parry was raised less than a quarter of a second ago (it takes ~0.05 s to come up)
  get perfectParry() { return this.blocking && this.sim.time - this.aimPressedAt <= this.player.mods.parryWindow; }

  switchTo(i) {
    if (i === this.index || i < 0 || i >= this.items.length || !this.items[i].unlocked) return;
    this.index = i;
    this.reloading = 0;
    this.burstLeft = 0;
    this.charging = -1;
    this.shells = 0;
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
    it.mag = this.magSize(it);
    it.reserve = it.def.reserve;
    this.switchTo(i);
    return { def: it.def, slot: i + 1 };
  }

  startReload() {
    const it = this.current;
    if (it.def.melee || this.reloading > 0 || it.mag >= this.magSize(it) || it.reserve <= 0) return;
    const m = this.player.mods.reload, sh = it.def.shells;
    if (sh) {
      this.shells = Math.min(this.magSize(it) - it.mag, it.reserve);
      this.reloading = (sh.open + this.shells * sh.each + sh.close) * m;
    } else this.reloading = it.def.reload * m;
    this.reloadTotal = this.reloading;
    this.sim.emit('reload', { pid: this.player.id, duration: this.reloading, weapon: it.def.id });
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
    this.grenadeCd -= dt;
    this.#cool(dt);
    // G: the weapon goes down for a moment while the other hand throws a fire pot
    if (cmd.grenade && this.grenades > 0 && this.grenadeCd <= 0 && this.swingT < 0) {
      this.grenades--;
      this.grenadeCd = GRENADES.cooldown;
      this.reloading = 0;
      this.shells = 0;
      this.switching = Math.max(this.switching, GRENADES.lower);
      this.sim.throwGrenade(player);
      this.sim.emit('grenadeThrow', { pid: player.id });
    }
    this.switching = Math.max(0, this.switching - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      // shell by shell: one goes in each time the time left drops past the share of the shells after it
      const sh = this.current.def.shells, m = this.player.mods.reload;
      while (sh && this.shells > 0 && this.reloading <= ((this.shells - 1) * sh.each + sh.close) * m) {
        const cur = this.current;
        cur.mag++;
        cur.reserve--;
        this.shells--;
        this.sim.emit('shell', { pid: player.id, left: this.shells });
      }
      if (this.reloading <= 0) {
        const cur = this.current;
        const take = Math.min(this.magSize(cur) - cur.mag, cur.reserve);
        cur.mag += take;
        if (cur.reserve !== Infinity) cur.reserve -= take;
        this.reloading = 0;
      }
    }

    const swinging = this.swingT >= 0;
    const aiming = cmd.aim && this.reloading <= 0 && this.switching <= 0 && !player.sprinting && !swinging;
    this.adsT += ((aiming ? 1 : 0) - this.adsT) * (1 - Math.exp(-14 * dt));

    if (!cmd.fire) this.triggerHeld = false;
    // a shell-by-shell reload stops on a fresh trigger pull once there is something to fire
    if (def.shells && this.reloading > 0 && cmd.fire && !this.triggerHeld && it.mag > 0) {
      this.reloading = 0;
      this.shells = 0;
      this.cooldown = Math.max(this.cooldown, def.shells.close * 0.6);
    }
    const ready = this.cooldown <= 0 && this.reloading <= 0 && this.switching <= 0;
    if (def.melee) {
      // holding the button keeps slashing, alternating directions
      if (cmd.fire && ready && !this.blocking) this.#startSwing();
      this.#updateSwing(dt);
    } else {
      const wantFire = cmd.fire && (def.auto || !this.triggerHeld);
      const hot = def.heat && it.locked > 0;
      if (this.burstLeft > 0) {
        // the rest of a burst goes on by itself, unless the gun locks up
        if (hot) this.burstLeft = 0;
        else if (this.cooldown <= 0 && this.switching <= 0) this.#fire();
      } else if (this.charging >= 0) {
        // a charged shot leaves once charged, whatever the trigger does
        this.charging += dt;
        if (this.charging >= def.charge) { this.charging = -1; if (it.mag > 0) this.#fire(); }
      } else if (wantFire && ready) {
        if (hot) { if (!this.triggerHeld) this.sim.emit('dry', { pid: player.id }); }
        else if (it.mag > 0 && def.charge) {
          this.charging = 0;
          this.sim.emit('charge', { pid: player.id, weapon: def.id, time: def.charge });
        } else if (it.mag > 0) this.#fire();
        else if (!this.triggerHeld) { this.sim.emit('dry', { pid: player.id }); this.startReload(); }
        this.triggerHeld = true;
      }
      if (it.mag === 0 && it.reserve > 0 && this.reloading <= 0 && !cmd.fire) this.startReload();
    }
  }

  // energy weapons cool down a moment after the last shot; an overheated one stays locked a while
  #cool(dt) {
    for (const it of this.items) {
      const H = it.def.heat;
      if (!H) continue;
      if (it.locked > 0) {
        it.locked -= dt;
        it.heat = Math.max(0.3, it.heat - H.cool * dt * 0.5);
        if (it.locked <= 0) { it.locked = 0; this.sim.emit('vented', { pid: this.player.id, weapon: it.def.id }); }
        continue;
      }
      it.coolWait -= dt;
      if (it.coolWait <= 0) it.heat = Math.max(0, it.heat - H.cool * dt);
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
    if (def.heat) {
      // no magazine: every shot heats it, and too much heat locks it up
      it.heat = Math.min(1, it.heat + def.heat.per);
      it.coolWait = 0.25;
      if (it.heat >= 1) {
        it.locked = def.heat.lock;
        this.burstLeft = 0;
        this.sim.emit('overheat', { pid: player.id, weapon: def.id });
      }
    } else it.mag--;
    this.cooldown = 60 / def.rpm;
    if (def.burst) {
      // one pull, `burst` shots, then a pause
      this.burstLeft = this.burstLeft > 0 ? this.burstLeft - 1 : def.burst - 1;
      if (it.locked > 0) this.burstLeft = 0;
      if (this.burstLeft === 0) this.cooldown = def.burstGap;
    }
    player.stats.shotsFired++;

    const moveSpread = player.moving ? (player.sprinting ? 0.03 : 0.012) : 0;
    const airSpread = player.onGround ? 0 : 0.03;
    const spread = def.spread + (def.adsSpread - def.spread) * this.adsT + moveSpread * (1 - this.adsT * 0.7) + airSpread;
    if (def.ball) this.sim.fireBall(player, def, spread);
    else if (def.flame) this.sim.fireFlame(player, def);
    else this.sim.fireWeapon(player, def, spread);

    const kick = def.recoil * (1 - this.adsT * 0.45);
    player.kick(kick, (Math.random() - 0.5) * kick * 0.6);
    // a heavy gun shoves its shooter back
    if (def.knockback) player.impulse(player.flatForward().multiplyScalar(-def.knockback));
  }
}
