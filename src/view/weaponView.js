import * as THREE from 'three';
import { findPart, baseName } from '../assets.js';
import { makeGlowTexture } from './worldView.js';
import { WEAPONS } from '../sim/weapons.js';

// How each weapon sits on screen. Rules (damage, ammo...) are in src/sim/weapons.js.
const VIEW = {
  sword: { hip: new THREE.Vector3(0.3, -0.31, -0.6), block: new THREE.Vector3(0.05, -0.2, -0.6), scale: 0.72 },
  pistol: { hip: new THREE.Vector3(0.16, -0.15, -0.4), adsZ: -0.3, scale: 0.9, sightY: null },
  rifle: { hip: new THREE.Vector3(0.15, -0.19, -0.3), adsZ: -0.24, scale: 1.0, sightY: null, holo: 'R_HoloGlass' },
  shotgun: { hip: new THREE.Vector3(0.16, -0.19, -0.26), adsZ: -0.2, scale: 1.0, sightY: null },
  sniper: { hip: new THREE.Vector3(0.17, -0.23, -0.42), adsZ: -0.22, scale: 0.85, sightY: null },
};

// Moving parts of each gun (names from blender/fps_assets.blend): the left arm's objects share a prefix,
// the magazine drops out on reload, the rack slides back once a new one is in, the action cycles after each shot.
// The pistol's magazine is hidden in its grip, so it is made here.
const RIG = {
  pistol: { arm: 'PL_', rack: [['P_Slide', 0.03]], action: { parts: [['P_Slide', 0.022]], at: [0, 0.07] } },
  rifle: { arm: 'RL_', mag: 'R_Mag' },
  shotgun: { arm: 'SL_', pump: 'S_Pump', action: { parts: [['S_Pump', 0.075]], at: [0.12, 0.4], arm: true } },
  sniper: { arm: 'NL_', mag: 'N_Mag', rack: [['N_Bolt', 0.07], ['N_BoltKnob', 0.07]], action: { parts: [['N_Bolt', 0.07], ['N_BoltKnob', 0.07]], at: [0.3, 0.72] } },
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
  constructor(assets, vmScene, effects, flashLight) {
    this.effects = effects;
    this.flashLight = flashLight;
    this.root = new THREE.Group();
    vmScene.add(this.root);

    const flashTex = makeGlowTexture('#ffd27a', 0.0);
    this.items = WEAPONS.map((def) => {
      const view = VIEW[def.id];
      const model = assets[def.id].clone(true);
      model.scale.setScalar(view.scale);
      model.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.flatShading = true;
          o.material.emissiveIntensity *= def.melee ? 0.25 : 0.12;
          if (def.melee) o.material.roughness = Math.max(o.material.roughness, 0.5);
          // bandaged hands: toned down so they sit in the night instead of glowing under the view model lights
          if (o.material.name === 'Linen' || o.material.name === 'Skin') o.material.color.multiplyScalar(0.55);
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
      item.flash.scale.setScalar(def.id === 'shotgun' ? 0.32 : 0.22);
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
      rig.magDown = new THREE.Vector3(0, -1, 0).applyQuaternion(mag.quaternion);
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
    ev.points.slice(0, 3).forEach((p) => this.effects.tracer(muzzleWorld, p));
    const heavy = ev.weapon === 'shotgun' || ev.weapon === 'sniper';
    // the shotgun bucks hard and twists a little
    this.kickBack = ev.weapon === 'shotgun' ? 0.14 : heavy ? 0.09 : 0.05;
    this.kickRot = ev.weapon === 'shotgun' ? 0.38 : heavy ? 0.22 : 0.1;
    if (ev.weapon === 'shotgun') this.kickRoll = (Math.random() < 0.5 ? -1 : 1) * 0.12;
    it.rig.actionT = 0;
    this.flashTime = 0.05;
    it.flash.material.rotation = Math.random() * Math.PI;
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
    if (loadout.reloading > 0) {
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
