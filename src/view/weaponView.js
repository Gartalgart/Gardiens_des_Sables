import * as THREE from 'three';
import { findPart, baseName } from '../assets.js';
import { makeGlowTexture } from './worldView.js';

// How each weapon sits on screen. Rules (damage, ammo...) are in src/worlds/.
// kick: how far the gun jumps back, tilts up and rolls on a shot; flash: the muzzle flash's size;
// smoke: black powder leaves a cloud at the mouth
const VIEW = {
  sword: { hip: new THREE.Vector3(0.3, -0.31, -0.6), block: new THREE.Vector3(0.05, -0.2, -0.6), scale: 0.72 },
  pistol: { hip: new THREE.Vector3(0.16, -0.15, -0.4), adsZ: -0.3, scale: 0.9, sightY: null, kick: [0.05, 0.1, 0] },
  rifle: { hip: new THREE.Vector3(0.15, -0.19, -0.3), adsZ: -0.24, scale: 1.0, sightY: null, holo: 'R_HoloGlass', kick: [0.05, 0.1, 0] },
  // the shotgun bucks hard and twists a little
  shotgun: { hip: new THREE.Vector3(0.16, -0.19, -0.26), adsZ: -0.2, scale: 1.0, sightY: null, kick: [0.14, 0.38, 0.12], flash: 0.32 },
  sniper: { hip: new THREE.Vector3(0.17, -0.23, -0.42), adsZ: -0.22, scale: 0.85, sightY: null, kick: [0.09, 0.22, 0] },
  // the pirates' (src/worlds/pirates.js)
  cutlass: { hip: new THREE.Vector3(0.3, -0.31, -0.6), block: new THREE.Vector3(0.05, -0.2, -0.6), scale: 0.72 },
  flintlock: { hip: new THREE.Vector3(0.16, -0.15, -0.4), adsZ: -0.42, scale: 0.9, kick: [0.08, 0.3, 0.05], flash: 0.3, smoke: 1 },
  blunderbuss: { hip: new THREE.Vector3(0.16, -0.21, -0.36), adsZ: -0.3, sightY: 0.11, scale: 1.0, kick: [0.15, 0.42, 0.14], flash: 0.42, smoke: 1.6 },
  musket: { hip: new THREE.Vector3(0.17, -0.23, -0.42), adsZ: -0.22, scale: 0.85, kick: [0.1, 0.3, 0.05], flash: 0.3, smoke: 1.2 },
  cannon: { hip: new THREE.Vector3(0.2, -0.28, -0.46), adsZ: -0.38, sightY: 0.21, scale: 0.95, kick: [0.22, 0.55, 0.1], flash: 0.55, smoke: 2.4 },
  // the station's (src/worlds/station.js); flashColor: the muzzle's light, trail: a melee weapon's
  // slash, beam: [width, seconds] of an energy shot
  baton: { hip: new THREE.Vector3(0.3, -0.31, -0.6), block: new THREE.Vector3(0.05, -0.2, -0.6), scale: 0.72, trail: 0x7ab8ff },
  laser: { hip: new THREE.Vector3(0.16, -0.15, -0.4), adsZ: -0.3, scale: 0.9, kick: [0.03, 0.06, 0], flash: 0.16, flashColor: 0xff4a30, beam: [0.012, 0.07] },
  plasma: { hip: new THREE.Vector3(0.17, -0.22, -0.46), adsZ: -0.36, scale: 1.0, kick: [0.05, 0.12, 0.03], flash: 0.24, flashColor: 0x6affb8, beam: [0.03, 0.1] },
  flamer: { hip: new THREE.Vector3(0.17, -0.22, -0.4), adsZ: -0.32, scale: 0.95, kick: [0.006, 0.012, 0], flash: 0.22, flashColor: 0xff9a3a },
  railgun: { hip: new THREE.Vector3(0.18, -0.24, -0.52), adsZ: -0.32, scale: 0.85, kick: [0.16, 0.42, 0.05], flash: 0.45, flashColor: 0x8ad0ff, beam: [0.07, 0.5] },
};

// Moving parts of each gun (names from blender/fps_assets.blend): the left arm's objects share a prefix,
// the magazine drops out on reload, the rack slides back once a new one is in, the action cycles after each shot.
// The pistol's magazine is hidden in its grip, so it is made here.
const RIG = {
  pistol: { arm: 'PL_', rack: [['P_Slide', 0.03]], action: { parts: [['P_Slide', 0.022]], at: [0, 0.07] } },
  rifle: { arm: 'RL_', mag: 'R_Mag' },
  shotgun: { arm: 'SL_', pump: 'S_Pump', action: { parts: [['S_Pump', 0.075]], at: [0.12, 0.4], arm: true } },
  sniper: { arm: 'NL_', mag: 'N_Mag', rack: [['N_Bolt', 0.07], ['N_BoltKnob', 0.07]], action: { parts: [['N_Bolt', 0.07], ['N_BoltKnob', 0.07]], at: [0.3, 0.72] } },
  // muzzle-loaders: the left hand brings a charge to the mouth, then rams it with the rod (its length);
  // the flintlock's hammer falls on a shot and is cocked again at the end of the reload
  flintlock: { arm: 'FL_', ram: { rod: 'F_Rod', len: 0.26, charge: 'paper' }, hammer: 'F_Hammer' },
  blunderbuss: { arm: 'BL_', ram: { rod: 'B_Rod', len: 0.38, charge: 'paper' } },
  cannon: { arm: 'CL_', ram: { charge: 'ball' } },
  musket: { arm: 'ML_', ram: { rod: 'M_Rod', len: 0.7, charge: 'paper' } },
  // energy weapons: no magazine, their coils (glow) brighten with heat or with the railgun's charge;
  // the flamethrower's fuel canister and the railgun's power cell come out like magazines
  laser: { arm: 'XL_', glow: 'X_Coil' },
  plasma: { arm: 'QL_', glow: 'Q_Coil' },
  flamer: { arm: 'GL_', mag: 'G_Tank', magDir: [0, -1, 0] },
  railgun: { arm: 'YL_', mag: 'Y_Cell', glow: 'Y_Coil' },
};

const ease = (x) => x * x * (3 - 2 * x);
// 0 before a, eases up to 1 at b
const seg = (x, a, b) => ease(THREE.MathUtils.clamp((x - a) / (b - a), 0, 1));
// out and back between a and b: snaps out fast, returns a bit slower
const pulse = (x, a, b) => {
  if (x <= a || x >= b) return 0;
  const mid = a + (b - a) * 0.35;
  return x < mid ? seg(x, a, mid) : 1 - seg(x, mid, b);
};

// First-person view model of the local player's loadout.
export class WeaponView {
  // weapons: the universe's weapon rules (src/worlds/), in slot order
  constructor(assets, vmScene, effects, flashLight, weapons) {
    this.effects = effects;
    this.flashLight = flashLight;
    this.root = new THREE.Group();
    vmScene.add(this.root);

    const flashTex = makeGlowTexture('#ffd27a', 0.0);
    this.items = weapons.map((def) => {
      const view = VIEW[def.id];
      const model = assets[def.id].clone(true);
      model.scale.setScalar(view.scale);
      model.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.flatShading = true;
          o.material.emissiveIntensity *= def.melee ? 0.25 : 0.12;
          if (def.melee) o.material.roughness = Math.max(o.material.roughness, 0.5);
          // hands and sleeves: toned down so they sit in the night instead of glowing under the view model lights
          if (['Linen', 'Skin', 'Shirt', 'Suit', 'SuitGlove', 'SuitCuff'].includes(o.material.name)) o.material.color.multiplyScalar(0.55);
        }
      });
      const holder = new THREE.Group();
      const pose = new THREE.Group(); // fixed resting orientation of the model inside the animated holder
      pose.add(model);
      holder.add(pose);
      holder.visible = false;
      this.root.add(holder);
      const item = { def, view, model, holder, pose };
      if (def.melee) {
        pose.rotation.set(0.95, -0.15, -0.55); // blade raised, leaning out to the right
        // two points along the blade feed the light trail of a slash
        item.tip = findPart(model, 'Tip');
        item.bladeBase = new THREE.Object3D();
        item.bladeBase.position.set(0, 0.03, -0.24);
        model.add(item.bladeBase);
        return item;
      }
      const sight = findPart(model, 'Sight');
      item.muzzle = findPart(model, 'Muzzle');
      const sightY = (view.sightY ?? sight.position.y) * view.scale;
      item.ads = new THREE.Vector3(-sight.position.x * view.scale, -sightY, view.adsZ);
      if (view.holo) this.#holoSight(findPart(model, view.holo));
      item.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      item.flash.scale.setScalar(view.flash ?? 0.22);
      if (view.flashColor) item.flash.material.color.set(view.flashColor);
      item.flash.visible = false;
      item.muzzle.add(item.flash);
      this.#rig(item);
      return item;
    });
    this.#buildTrail();
    this.reset();
  }

  // Groups the left arm under one pivot at the hand, and finds the parts that move.
  #rig(item) {
    const cfg = RIG[item.def.id];
    const body = item.muzzle.parent;
    const part = (name) => findPart(body, name);
    const arm = new THREE.Group();
    arm.position.copy(part(cfg.arm + 'Hand').position);
    body.add(arm);
    item.model.updateMatrixWorld(true);
    for (const o of [...body.children]) if (baseName(o.name).startsWith(cfg.arm)) arm.attach(o);
    const rig = { arm, armRest: arm.position.clone(), moving: new Map(), actionT: 9, prevK: 0 };
    const moving = (o) => {
      if (!rig.moving.has(o)) rig.moving.set(o, o.position.clone());
      return o;
    };
    let mag = cfg.mag && part(cfg.mag);
    if (item.def.id === 'pistol') {
      // a magazine inside the grip, its base plate just showing under it
      const grip = part('P_Grip');
      mag = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.1, 0.03), part('P_Slide').material);
      mag.quaternion.copy(grip.quaternion);
      mag.position.copy(grip.position).add(new THREE.Vector3(0, -0.013, 0).applyQuaternion(grip.quaternion));
      body.add(mag);
    }
    if (mag) {
      rig.mag = moving(mag);
      rig.magDown = cfg.magDir ? new THREE.Vector3(...cfg.magDir) : new THREE.Vector3(0, -1, 0).applyQuaternion(mag.quaternion);
      // the hand takes the magazine by its base
      mag.geometry.computeBoundingBox();
      const half = mag.geometry.boundingBox.max.y * mag.scale.y;
      rig.grab = mag.position.clone().addScaledVector(rig.magDown, half + 0.035);
    }
    rig.rack = (cfg.rack ?? []).map(([name, d]) => [moving(part(name)), d]);
    if (cfg.action) rig.action = { ...cfg.action, parts: cfg.action.parts.map(([name, d]) => [moving(part(name)), d]) };
    if (cfg.pump) {
      rig.pump = moving(part(cfg.pump));
      // a shell in the left hand while loading; it goes into the port under the receiver
      const shell = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.046), new THREE.MeshStandardMaterial({ color: 0x9c2418, roughness: 0.6, flatShading: true }));
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.012), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.8, roughness: 0.35, flatShading: true }));
      base.position.z = 0.028;
      shell.add(hull, base);
      shell.position.set(0, 0.03, -0.01);
      shell.visible = false;
      arm.add(shell);
      rig.shell = shell;
      rig.port = new THREE.Vector3(0, -0.035, -0.07);
    }
    if (cfg.ram) {
      // the charge in the left hand: a paper cartridge, or the cannon's ball
      const charge = cfg.ram.charge === 'ball'
        ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.7, roughness: 0.5, flatShading: true }))
        : new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.045, 6), new THREE.MeshStandardMaterial({ color: 0xb8ab8a, roughness: 0.9, flatShading: true }));
      charge.position.set(0, 0.035, -0.01);
      charge.visible = false;
      arm.add(charge);
      rig.ram = { ...cfg.ram, charge, mouth: item.muzzle.position.clone() };
      if (cfg.ram.rod) rig.ram.rod = moving(part(cfg.ram.rod));
    }
    if (cfg.hammer) {
      rig.hammer = part(cfg.hammer);
      rig.hammerRest = rig.hammer.rotation.x;
      rig.fired = false; // the hammer is down until the next reload cocks it
    }
    if (cfg.glow) {
      rig.glow = [];
      body.traverse((o) => { if (o.isMesh && baseName(o.name).startsWith(cfg.glow)) rig.glow.push([o.material, o.material.emissiveIntensity]); });
      rig.glowT = 0;
    }
    item.rig = rig;
  }

  // Holographic sight: a faint glass pane with a glowing red ring-and-dot reticle on it.
  #holoSight(glass) {
    glass.material = new THREE.MeshBasicMaterial({ color: 0x5aa8c8, transparent: true, opacity: 0.04, depthWrite: false, side: THREE.FrontSide });
    const reticle = new THREE.Mesh(
      new THREE.PlaneGeometry(0.024, 0.024),
      new THREE.MeshBasicMaterial({ map: makeReticleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    // just behind the glass, facing the eye (+Z in the weapon's space)
    reticle.position.copy(glass.position).add(new THREE.Vector3(0, 0, 0.002));
    reticle.renderOrder = 10;
    glass.parent.add(reticle);
  }

  // A ribbon between the blade's base and tip over the last few frames of a slash.
  #buildTrail() {
    const N = 16;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(N * 2), 1).setUsage(THREE.DynamicDrawUsage));
    const index = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      index.push(a, b, c, b, d, c);
    }
    geo.setIndex(index);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { color: { value: new THREE.Color(1.0, 0.72, 0.35) } },
      vertexShader: `attribute float alpha; varying float vA;
        void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 color; varying float vA;
        void main(){ gl_FragColor = vec4(color * vA, 1.0); }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.root.add(mesh);
    this.trail = { mesh, geo, N, samples: [], life: 0.13 };
  }

  #updateTrail(dt, it, loadout) {
    const tr = this.trail;
    for (const s of tr.samples) s.age += dt;
    while (tr.samples.length && tr.samples[tr.samples.length - 1].age > tr.life) tr.samples.pop();
    if (it.def.melee) tr.mesh.material.uniforms.color.value.set(it.view.trail ?? 0xffb859);
    if (it.def.melee && loadout.swingT >= 0) {
      const p = loadout.swingT / it.def.swing;
      if (p > 0.1 && p < 0.75) {
        it.holder.updateMatrixWorld(true);
        tr.samples.unshift({ tip: it.tip.getWorldPosition(new THREE.Vector3()), base: it.bladeBase.getWorldPosition(new THREE.Vector3()), age: 0 });
        if (tr.samples.length > tr.N) tr.samples.length = tr.N;
      }
    }
    const pos = tr.geo.attributes.position, alpha = tr.geo.attributes.alpha;
    tr.samples.forEach((s, i) => {
      const k = Math.max(0, 1 - s.age / tr.life) * (1 - i / tr.N);
      pos.setXYZ(i * 2, s.base.x, s.base.y, s.base.z);
      pos.setXYZ(i * 2 + 1, s.tip.x, s.tip.y, s.tip.z);
      alpha.setX(i * 2, k * 0.15);
      alpha.setX(i * 2 + 1, k * 0.9);
    });
    pos.needsUpdate = alpha.needsUpdate = true;
    tr.geo.setDrawRange(0, Math.max(0, tr.samples.length - 1) * 6);
  }

  reset() {
    this.kickBack = 0;
    this.kickRot = 0;
    this.kickRoll = 0;
    this.flashTime = 0;
    this.sway = new THREE.Vector2();
    this.shownIndex = -1;
  }

  // the local player fired: muzzle flash, kick, tracers from the muzzle of the view model
  onShot(ev, camera) {
    const it = this.items.find((w) => w.def.id === ev.weapon);
    if (!it?.muzzle) return;
    it.muzzle.updateWorldMatrix(true, false);
    // the view model camera sits at the camera origin, so the muzzle maps straight to world space
    const muzzleWorld = it.muzzle.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    if (it.view.beam) ev.points.slice(0, 3).forEach((p) => this.effects.beam(muzzleWorld, p, it.view.flashColor, ...it.view.beam));
    else ev.points.slice(0, 3).forEach((p) => this.effects.tracer(muzzleWorld, p));
    if (it.def.flame) {
      // a tongue of fire out of the nozzle, smoke curling over it
      const fx = this.effects;
      fx.burst(muzzleWorld, fwd, { count: 22, color: new THREE.Color(0.85, 0.28, 0.04), speed: 13, size: 0.42, life: 0.5, grav: -2.5, spread: 0.2 });
      fx.burst(muzzleWorld, fwd, { count: 10, color: new THREE.Color(0.9, 0.55, 0.15), speed: 9, size: 0.22, life: 0.3, grav: -1, spread: 0.1 });
      fx.burst(muzzleWorld, fwd, { count: 6, color: new THREE.Color(0.25, 0.35, 0.9), speed: 3, size: 0.08, life: 0.1, grav: 0, spread: 0.1 }); // the blue root of the flame
      fx.burst(muzzleWorld.clone().addScaledVector(fwd, 3), fwd, { count: 2, color: new THREE.Color(0.12, 0.1, 0.09), speed: 4, size: 0.7, life: 1.1, grav: -1.2, spread: 0.6 });
    }
    this.flashLight.color.set(it.view.flashColor ?? 0xffb060);
    const [back, rot, roll] = it.view.kick;
    this.kickBack = back;
    this.kickRot = rot;
    if (roll) this.kickRoll = (Math.random() < 0.5 ? -1 : 1) * roll;
    if (it.view.smoke) {
      const k = it.view.smoke;
      this.effects.burst(muzzleWorld, fwd, { count: Math.round(14 * k), color: new THREE.Color(0.16, 0.16, 0.15), speed: 2.5 * k, size: 0.2 * k, life: 1.1, grav: -0.6, spread: 0.6 });
    }
    it.rig.actionT = 0;
    it.rig.fired = true;
    this.flashTime = 0.05;
    it.flash.material.rotation = Math.random() * Math.PI;
  }

  // an energy weapon overheated: steam out of the muzzle
  onOverheat(camera) {
    const it = this.items[this.shownIndex];
    if (!it?.muzzle) return;
    const at = it.muzzle.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorld);
    this.effects.burst(at, new THREE.Vector3(0, 1, 0), { count: 22, color: new THREE.Color(0.5, 0.52, 0.55), speed: 1.6, size: 0.25, life: 1.2, grav: -0.8, spread: 0.8 });
  }

  onSlashHit() { this.kickRot = 0.08; }
  onBlocked() { this.kickRot = 0.15; }

  // the precision rifle seen through its scope: the view model gets out of the way
  scoped(loadout) { return !!loadout.current.def.scope && loadout.adsT > 0.85 && loadout.reloading <= 0; }

  update(dt, loadout, player, input, bob) {
    if (this.shownIndex !== loadout.index) {
      this.items.forEach((w, i) => (w.holder.visible = i === loadout.index));
      this.shownIndex = loadout.index;
    }
    this.items[loadout.index].holder.visible = !this.scoped(loadout);
    const it = this.items[loadout.index];
    const def = it.def;
    const t = loadout.adsT;

    // sway follows mouse movement, bob follows the walk cycle
    this.sway.x += (-input.mouse.dx * 0.0004 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (input.mouse.dy * 0.0004 - this.sway.y) * Math.min(1, dt * 10);
    const bobK = player.moving ? (1 - t * 0.85) : 0;
    const bx = Math.cos(bob) * 0.012 * bobK;
    const by = Math.abs(Math.sin(bob)) * 0.014 * bobK;

    const pos = it.view.hip.clone().lerp(def.melee ? it.view.block : it.ads, t);
    pos.x += bx + this.sway.x * (1 - t * 0.8);
    pos.y -= by - this.sway.y * (1 - t * 0.8);
    pos.z += this.kickBack;

    let rx = this.kickRot * (1 - t * 0.6), ry = 0, rz = this.kickRoll * (1 - t * 0.6);
    let snap = 25;
    if (def.melee) {
      rz += t * 1.45; rx -= t * 0.5; // block: blade held across the view
      if (loadout.swingT >= 0) {
        // the blade is laid flat, wound up on one side, then swept across the view
        const p = loadout.swingT / def.swing, d = loadout.swingDir;
        const ease = (x) => x * x * (3 - 2 * x);
        const sweep = p < 0.2 ? -0.55 * ease(p / 0.2) : p < 0.55 ? -0.55 + 1.55 * ease((p - 0.2) / 0.35) : 1 - ease((p - 0.55) / 0.45);
        const lay = Math.sin(Math.PI * Math.min(1, p * 1.15));
        rz += lay * 1.45 * d;
        ry += sweep * 1.15 * d;
        rx -= lay * 0.35;
        pos.x -= sweep * 0.4 * d + lay * 0.14;
        pos.y += lay * 0.12;
        pos.z -= lay * 0.1;
        snap = 70;
      }
    }
    if (player.sprinting) { rx -= 0.35; ry += 0.5; pos.x -= 0.05; pos.y -= 0.03; }
    // an overheated energy weapon is held aside while it vents; the railgun shakes as it charges
    const cur = loadout.current;
    if (def.heat && cur.locked > 0) { rz -= 0.55; rx += 0.25; pos.y -= 0.05; pos.x -= 0.04; }
    if (def.charge && loadout.charging >= 0) {
      const c = loadout.charging / def.charge;
      pos.x += (Math.random() - 0.5) * 0.006 * c;
      pos.y += (Math.random() - 0.5) * 0.006 * c;
      pos.z += c * 0.03;
    }
    if (loadout.reloading > 0 && it.rig?.ram) {
      // a muzzle-loader comes up, mouth high and toward the middle, so the rod can go down the barrel
      const k = 1 - loadout.reloading / (loadout.reloadTotal || def.reload);
      const tilt = seg(k, 0, 0.12) * (1 - seg(k, 0.88, 1));
      rx += tilt * 0.45; rz -= tilt * 0.2; ry += tilt * 0.15; pos.x -= tilt * 0.07; pos.y -= tilt * 0.04; pos.z -= tilt * 0.02;
    } else if (loadout.reloading > 0) {
      // tilted to show the magazine well (or the shotgun's loading port), held there while shells go in
      const k = 1 - loadout.reloading / (loadout.reloadTotal || def.reload);
      const tilt = def.shells ? 1 : Math.sin(Math.min(1, k) * Math.PI);
      rz -= tilt * (def.shells ? 0.75 : 0.7); rx += tilt * 0.3; pos.y += tilt * 0.1; pos.x -= tilt * 0.08;
    }
    if (loadout.switching > 0) pos.y -= (loadout.switching / 0.35) * 0.3;

    const k = 1 - Math.exp(-snap * dt);
    it.holder.position.lerp(pos, k);
    it.holder.rotation.x += (rx - it.holder.rotation.x) * k;
    it.holder.rotation.y += (ry - it.holder.rotation.y) * k;
    it.holder.rotation.z += (rz - it.holder.rotation.z) * k;

    this.kickBack *= Math.exp(-14 * dt);
    this.kickRot *= Math.exp(-12 * dt);
    this.kickRoll *= Math.exp(-10 * dt);
    if (it.rig) this.#animateRig(dt, it.rig, def, loadout, player);

    this.#updateTrail(dt, it, loadout);

    this.flashTime -= dt;
    const flashing = this.flashTime > 0;
    for (const w of this.items) if (w.flash) w.flash.visible = flashing && w === it;
    this.flashLight.intensity = flashing ? 40 : 0;
  }

  // Arm, magazine, slide, bolt and pump for this frame.
  #animateRig(dt, r, def, loadout, player) {
    for (const [o, rest] of r.moving) o.position.copy(rest);
    const arm = r.armRest.clone();
    let armTilt = 0;
    if (r.shell) r.shell.visible = false;
    const total = loadout.reloadTotal || def.reload;
    const k = loadout.reloading > 0 ? 1 - loadout.reloading / total : 0;

    if (loadout.reloading > 0 && def.shells) {
      // the left hand leaves the pump for the port, fetches each shell from below and pushes it in
      const m = player.mods.reload, sh = def.shells, left = loadout.reloading;
      const closing = loadout.shells === 0 ? 1 - left / (sh.close * m) : -1;
      const toPort = seg(total - left, 0, sh.open * m * 0.8) * (1 - seg(closing, 0, 0.5));
      arm.lerp(r.port, toPort);
      armTilt = toPort * 0.5;
      if (loadout.shells > 0) {
        const p = 1 - (left - ((loadout.shells - 1) * sh.each + sh.close) * m) / (sh.each * m);
        if (p >= 0) {
          const down = p < 0.45 ? seg(p, 0, 0.3) : 1 - seg(p, 0.45, 0.8);
          arm.y -= down * 0.14;
          arm.z += down * 0.05 + seg(p, 0.8, 1) * 0.03;
          r.shell.visible = p > 0.2 && p < 0.97;
        }
      }
      if (closing >= 0) {
        const back = pulse(closing, 0.4, 1) * 0.075;
        r.pump.position.z += back;
        arm.z += back;
      }
    } else if (loadout.reloading > 0 && r.ram) {
      // the hand brings the charge up to the mouth and drops it in, then draws the rod out, turns it
      // over the bore and rams twice, and puts it back; the cannon's ball is only pushed in
      const R = r.ram, mouth = R.mouth;
      const w = seg(k, 0, 0.1) * (1 - seg(k, 0.9, 1));
      const target = mouth.clone().add(new THREE.Vector3(0, 0.07 - seg(k, 0.22, 0.3) * 0.045, 0.03));
      R.charge.visible = k > 0.06 && k < 0.3;
      if (R.rod) {
        const L = R.len, rest = r.moving.get(R.rod);
        const out = seg(k, 0.34, 0.44) * (1 - seg(k, 0.86, 0.94));
        const up = seg(k, 0.44, 0.5) * (1 - seg(k, 0.8, 0.86));
        const ram = (pulse(k, 0.52, 0.64) + pulse(k, 0.64, 0.76)) * up;
        R.rod.position.z += -(L + 0.03) * out + L * 0.7 * ram;
        R.rod.position.y += (mouth.y - rest.y) * up;
        // the hand holds the rod by its front end
        if (k > 0.32) target.copy(R.rod.position).add(new THREE.Vector3(0, 0.02, -L / 2 - 0.01));
      } else if (k > 0.3) {
        target.copy(mouth).add(new THREE.Vector3(0, 0.03, 0.02 + pulse(k, 0.35, 0.65) * 0.06));
      }
      arm.lerp(target, w);
      armTilt = w * 0.4;
      if (r.prevK < 0.9 && k >= 0.9 && r.hammer) { r.fired = false; this.kickRot += 0.03; } // cocked
    } else if (loadout.reloading > 0 && r.mag) {
      // the hand takes the magazine down out of view, comes back with a full one and seats it
      const d = 0.35 * seg(k, 0.15, 0.38) * (1 - seg(k, 0.5, 0.72));
      const w = seg(k, 0, 0.15) * (1 - seg(k, 0.76, 0.92));
      r.mag.position.addScaledVector(r.magDown, d);
      arm.lerp(r.grab.clone().addScaledVector(r.magDown, d), w);
      armTilt = w * 0.35;
      for (const [o, dz] of r.rack) o.position.z += pulse(k, 0.8, 0.95) * dz;
      if (r.prevK < 0.72 && k >= 0.72) { this.kickRot += 0.05; this.kickBack += 0.012; } // seated
    }
    r.prevK = k;
    if (r.glow) {
      // heat (or charge) brightens the coils; a locked gun flickers
      r.glowT += dt;
      const it = loadout.current;
      const heat = def.heat ? it.heat : def.charge && loadout.charging >= 0 ? loadout.charging / def.charge : 0;
      const flick = it.locked > 0 ? 0.55 + 0.45 * Math.sin(r.glowT * 38) : 1;
      for (const [m, b] of r.glow) m.emissiveIntensity = b * (1 + 14 * heat) * flick;
    }
    if (r.ram && loadout.reloading <= 0) r.ram.charge.visible = false;
    if (r.hammer) {
      const aim = r.hammerRest - (r.fired ? 0.7 : 0);
      r.hammer.rotation.x += (aim - r.hammer.rotation.x) * (1 - Math.exp(-(r.fired ? 60 : 20) * dt));
    }

    // after a shot: the pistol's slide, the sniper's bolt, the shotgun's pump with the left hand riding it
    r.actionT += dt;
    if (r.action && loadout.reloading <= 0) {
      const a = pulse(r.actionT, r.action.at[0], r.action.at[1]);
      for (const [o, dz] of r.action.parts) o.position.z += a * dz;
      if (r.action.arm) arm.z += a * r.action.parts[0][1];
    }

    // the arm eases toward its target, so a reload cut short does not teleport the hand
    const f = 1 - Math.exp(-30 * dt);
    r.arm.position.lerp(arm, f);
    r.arm.rotation.z += (armTilt - r.arm.rotation.z) * f;
  }
}

function makeReticleTexture() {
  const size = 128, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.strokeStyle = g.fillStyle = '#ff3b2f';
  g.shadowColor = '#ff3b2f';
  g.shadowBlur = 8;
  g.lineWidth = 5;
  g.beginPath(); g.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(size / 2, size / 2, 5, 0, Math.PI * 2); g.fill();
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    g.beginPath();
    g.moveTo(size / 2 + Math.cos(a) * size * 0.36, size / 2 + Math.sin(a) * size * 0.36);
    g.lineTo(size / 2 + Math.cos(a) * size * 0.46, size / 2 + Math.sin(a) * size * 0.46);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
