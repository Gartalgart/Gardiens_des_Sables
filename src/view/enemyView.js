import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { makeGlowTexture } from './worldView.js';

// Colours of each enemy type: glow, particles, minimap dot.
export const ENEMY_LOOK = {
  runner: { color: new THREE.Color(1, 0.55, 0.15), dot: '#ff9a3c' },
  shooter: { color: new THREE.Color(0.3, 0.9, 1), dot: '#5fe1ff' },
  tank: { color: new THREE.Color(1, 0.25, 0.1), dot: '#ff4a2a' },
  boss: { color: new THREE.Color(1, 0.75, 0.25), dot: '#ffd36b' },
  mummy: { color: new THREE.Color(0.5, 1, 0.3), dot: '#8dff5a' },
  scarab: { color: new THREE.Color(0.3, 1, 0.85), dot: '#3fe0c0' },
  // the pirates'
  skeleton: { color: new THREE.Color(0.45, 1, 0.55), dot: '#7dff8c' },
  crab: { color: new THREE.Color(1, 0.4, 0.15), dot: '#ff6a2a' },
  gunner: { color: new THREE.Color(0.4, 1, 0.9), dot: '#6af0e0' },
  siren: { color: new THREE.Color(1, 0.45, 0.85), dot: '#ff73d9' },
  bats: { color: new THREE.Color(0.9, 0.2, 0.2), dot: '#e64040' },
  tentacle: { color: new THREE.Color(0.9, 0.2, 0.4), dot: '#d94080' },
};
const ELITE_GOLD = new THREE.Color(1, 0.78, 0.3);
const REFLECTED = new THREE.Color(1, 0.85, 0.4); // orbs parried back by a player
const UP = new THREE.Vector3(0, 1, 0);
const rand = (a, b) => a + Math.random() * (b - a);

// Clip played for each attack of the simulation, and how many seconds of the clip lead up to the
// moment the blow lands: the clip is sped up or slowed down so that moment matches the game's windup.
const ACT_CLIPS = {
  melee: ['attack', 0.4], ranged: ['cast', 0.4], leap: ['leap', 0.5],
  'charge-wind': ['chargeWind', 0.65], charge: ['charge', 0], slam: ['slam', 0.8],
  prime: ['prime', 0], transform: ['transform', 0], sing: ['sing', 0],
  // the Kraken's tentacles: the strike is warned by a red circle for its whole windup
  strike: ['attack', 0.4], grab: ['grab', 0.4], hold: ['hold', 0],
};
// speed (m/s) at which the walk / run clips play at their authored pace
const GAIT = {
  runner: { run: 3.5, walkRef: 2.4, runRef: 7 },
  shooter: { run: 99, walkRef: 2.2, runRef: 4 },
  tank: { run: 99, walkRef: 2.0, runRef: 5 },
  boss: { run: 99, walkRef: 2.0, runRef: 4 },
  mummy: { run: 3.2, walkRef: 1.8, runRef: 4.6 },
  scarab: { run: 2, walkRef: 2.5, runRef: 7.5 },
  skeleton: { run: 3.5, walkRef: 2.4, runRef: 7 },
  crab: { run: 99, walkRef: 2.2, runRef: 5 },
  gunner: { run: 99, walkRef: 1.2, runRef: 3 },
  siren: { run: 99, walkRef: 1, runRef: 3 },
  tentacle: { run: 99, walkRef: 1, runRef: 3 },
};
// a swarm (the bats): this many copies of the one-bat model, flapping around the swarm's centre
const SWARM = 12;

// Draws what the simulation's enemies, orbs and pickups are doing, and plays their deaths.
export class EnemyView {
  constructor(scene, assets, effects) {
    this.scene = scene;
    this.assets = assets;
    this.effects = effects;
    this.views = new Map(); // enemy id -> view
    this.orbs = new Map(); // projectile id -> mesh
    this.pickupMeshes = new Map(); // pickup id -> mesh
    this.debris = [];
    this.fallingOrbs = []; // orb rain coming down on a marked circle
    this.lobs = []; // the gunners' balls in flight, each with its shadow on the ground
    this.ballGeo = new THREE.IcosahedronGeometry(0.16, 1);
    this.ballMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.7, roughness: 0.45, flatShading: true });
    this.inkMat = new THREE.MeshStandardMaterial({ color: 0x14081c, emissive: 0x2a0a3a, roughness: 0.2, flatShading: true });

    this.orbGeo = new THREE.IcosahedronGeometry(0.16, 1);
    this.orbTex = makeGlowTexture('#ffffff', 0.0);
    this.pickupGeo = new THREE.BoxGeometry(0.45, 0.3, 0.3);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    // soft contact shadow under each enemy: lets the moon shadow map stay static (level only)
    this.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false, opacity: 0.75 });
    this.orbPool = [];
  }

  clear() {
    for (const v of this.views.values()) { this.scene.remove(v.mesh); this.scene.remove(v.blob); }
    for (const m of this.orbs.values()) this.#releaseOrb(m);
    for (const m of this.pickupMeshes.values()) this.scene.remove(m);
    for (const d of this.debris) this.scene.remove(d.mesh);
    for (const f of this.fallingOrbs) this.#releaseOrb(f.mesh);
    this.fallingOrbs.length = 0;
    for (const l of this.lobs) this.#dropLob(l);
    this.lobs.length = 0;
    this.views.clear();
    this.orbs.clear();
    this.pickupMeshes.clear();
    this.debris.length = 0;
  }

  #createView(e) {
    const look = ENEMY_LOOK[e.type];
    const mesh = e.T.fly ? this.#swarm(e) : SkeletonUtils.clone(this.assets[e.type]);
    const mats = [];
    // small variations so that a crowd is not made of copies: shade and hue drift, picked from the id
    const vary = e.T.boss ? 0 : ((e.id * 2654435761) % 1000) / 1000;
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.flatShading = true;
      if (vary) o.material.color.offsetHSL((vary - 0.5) * 0.06, (vary - 0.5) * 0.2, (vary - 0.5) * 0.08);
      // the ghost gunner is see-through
      if (o.material.name.startsWith('Ghost')) { o.material.transparent = true; o.material.opacity = 0.6; o.material.depthWrite = false; }
      if (o.material.emissive.getHex() === 0) {
        o.material.emissive.copy(e.elite ? ELITE_GOLD : look.color).multiplyScalar(e.elite ? 0.16 : 0.07);
        o.material.emissiveIntensity = 1;
      } else o.material.emissiveIntensity = Math.min(o.material.emissiveIntensity * 0.6, e.T.boss ? 2 : 3.5); // eyes: lit, but no glare
      mats.push({ m: o.material, emissive: o.material.emissive.clone(), ei: o.material.emissiveIntensity });
    });
    if (e.elite) {
      // golden elite: a bit bigger, with a halo
      mesh.scale.setScalar(1.12);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.orbTex, color: ELITE_GOLD, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }));
      halo.scale.setScalar(e.T.height * 1.6);
      halo.position.y = e.T.height * 0.55;
      mesh.add(halo);
    }
    mesh.position.copy(e.pos);
    this.scene.add(mesh);
    const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
    blob.renderOrder = -1;
    this.scene.add(blob);
    if (e.T.fly) {
      const v = { mesh, mats, blob, phase: Math.random() * 10, flash: 0, last: e, mixer: null, actions: {}, current: null, actRef: null };
      this.views.set(e.id, v);
      return v;
    }
    // animations authored in Blender (blender/anims.py): one action per clip name
    const mixer = new THREE.AnimationMixer(mesh);
    const actions = {};
    for (const clip of this.assets.clips[e.type]) {
      if (clip.name === 'hit') {
        // the flinch is added on top of whatever is playing
        const add = THREE.AnimationUtils.makeClipAdditive(clip.clone());
        const a = mixer.clipAction(add);
        a.blendMode = THREE.AdditiveAnimationBlendMode;
        a.setLoop(THREE.LoopOnce, 1);
        actions.hit = a;
        continue;
      }
      const a = mixer.clipAction(clip);
      if (!['idle', 'walk', 'run', 'stun', 'charge', 'sing', 'hold'].includes(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions[clip.name] = a;
    }
    actions.idle.play();
    const v = { mesh, mats, blob, phase: Math.random() * 10, flash: 0, last: e, mixer, actions, current: 'idle', actRef: null };
    this.views.set(e.id, v);
    return v;
  }

  // The bats: copies of the bat model, each at its own place in the swarm, wings on pivots
  #swarm(e) {
    const group = new THREE.Group();
    group.userData.bats = [];
    for (let i = 0; i < SWARM; i++) {
      const bat = this.assets[e.type].clone(true);
      bat.scale.setScalar(0.8 + Math.random() * 0.5);
      group.add(bat);
      group.userData.bats.push({
        bat, wings: [bat.getObjectByName('WingL'), bat.getObjectByName('WingR')],
        orbit: 0.3 + Math.random() * 0.6, speed: 1.5 + Math.random() * 2, angle: Math.random() * Math.PI * 2,
        lift: (Math.random() - 0.5) * 0.7, flap: 18 + Math.random() * 8, seed: Math.random() * 10,
      });
    }
    return group;
  }

  onEvent(ev) {
    switch (ev.type) {
      case 'enemySpawn':
        this.effects.burst(ev.pos.clone().setY(ev.pos.y + 0.3), UP, { count: 25, color: new THREE.Color(0.35, 0.27, 0.18), speed: 3, size: 0.5, life: 1.1, grav: 2 });
        break;
      case 'enemyHit': {
        const v = this.views.get(ev.id);
        if (v) {
          v.flash = 0.08;
          v.actions.hit?.reset().play();
        }
        // a blow glancing off the crab's shell
        if (ev.armored) this.effects.burst(ev.pos.clone().setY(ev.pos.y + 0.9), null, { count: 14, color: new THREE.Color(1, 0.85, 0.5), speed: 6, size: 0.06, life: 0.25, grav: 8 });
        break;
      }
      case 'enemyKill': {
        const v = this.views.get(ev.id);
        const look = ENEMY_LOOK[ev.enemyType];
        const big = !!v?.last.T.big;
        if (v) { this.#shatter(v, ev.pos, ev.dir); this.views.delete(ev.id); }
        this.effects.burst(ev.pos.clone().setY(ev.pos.y + (v?.last.T.height ?? 2) * 0.5), null, { count: big ? 60 : 25, color: look.color, speed: 5, size: 0.14, life: 0.6, grav: 4 });
        break;
      }
      case 'ring':
        this.#ring(ev.pos, ev.radius, ENEMY_LOOK[ev.enemyType].color, ev.life);
        break;
      case 'rainMark': {
        if (ev.kind === 'lob') {
          // a ball lobbed from the galleon: its shadow darkens and grows where it will land
          const shadow = new THREE.Mesh(this.blobGeo, this.blobMat.clone());
          shadow.position.copy(ev.pos).setY(ev.pos.y + 0.04);
          shadow.renderOrder = -1;
          this.scene.add(shadow);
          const ball = new THREE.Mesh(this.ballGeo, ev.ink ? this.inkMat : this.ballMat);
          if (ev.ink) ball.scale.setScalar(1.8); // the Kraken's blob of ink
          ball.castShadow = true;
          this.scene.add(ball);
          this.lobs.push({ id: ev.id, ball, shadow, from: ev.from.clone(), to: ev.pos.clone(), radius: ev.radius, t: 0, dur: ev.delay });
          // a dull red edge, since a dark shadow hardly shows on the sand at night
          this.#ring(ev.pos, ev.radius, new THREE.Color(0.6, 0.12, 0.05), ev.delay);
          break;
        }
        // a red circle grows on the ground while the orb falls onto it
        this.#ring(ev.pos, ev.radius, new THREE.Color(1, 0.3, 0.15), ev.delay);
        const mesh = this.#acquireOrb(new THREE.Color(1, 0.45, 0.2));
        mesh.scale.setScalar(2);
        this.fallingOrbs.push({ id: ev.id, mesh, to: ev.pos.clone(), t: 0, dur: ev.delay });
        break;
      }
      case 'rainStrike': {
        if (ev.kind === 'lob') {
          const i = this.lobs.findIndex((l) => l.id === ev.id);
          if (i >= 0) { this.#dropLob(this.lobs[i]); this.lobs.splice(i, 1); }
          if (ev.ink) {
            this.effects.burst(ev.pos.clone().setY(ev.pos.y + 0.3), UP, { count: 60, color: new THREE.Color(0.08, 0.03, 0.12), speed: 6, size: 0.35, life: 0.9, grav: 8, spread: 1.6 });
            break;
          }
          this.effects.burst(ev.pos.clone().setY(ev.pos.y + 0.2), UP, { count: 50, color: new THREE.Color(1, 0.6, 0.25), speed: 8, size: 0.22, life: 0.5, grav: 5, spread: 1.4 });
          this.effects.burst(ev.pos.clone().setY(ev.pos.y + 0.4), UP, { count: 30, color: new THREE.Color(0.18, 0.17, 0.16), speed: 3, size: 0.6, life: 1.3, grav: -0.5, spread: 2 });
          break;
        }
        const i = this.fallingOrbs.findIndex((f) => f.id === ev.id);
        if (i >= 0) { const f = this.fallingOrbs[i]; f.mesh.scale.setScalar(1); this.#releaseOrb(f.mesh); this.fallingOrbs.splice(i, 1); }
        this.effects.burst(ev.pos.clone().setY(ev.pos.y + 0.2), UP, { count: 40, color: new THREE.Color(1, 0.45, 0.2), speed: 7, size: 0.2, life: 0.6, grav: 6, spread: 1.6 });
        break;
      }
      case 'explosion':
        this.effects.burst(ev.pos, null, { count: 90, color: new THREE.Color(0.55, 1, 0.3), speed: 10, size: 0.3, life: 0.7, grav: 3 });
        this.effects.burst(ev.pos, UP, { count: 50, color: new THREE.Color(1, 0.6, 0.2), speed: 6, size: 0.45, life: 0.9, grav: -1, spread: 1.5 });
        this.effects.burst(ev.pos.clone().setY(ev.pos.y - 0.8), UP, { count: 40, color: new THREE.Color(0.35, 0.27, 0.18), speed: 4, size: 0.7, life: 1.4, grav: 1, spread: 2 });
        break;
      case 'teleportOut': case 'teleportIn':
        this.effects.burst(ev.pos.clone().setY(ev.pos.y + 2.2), null, { count: 60, color: ENEMY_LOOK.boss.color, speed: 6, size: 0.25, life: 0.7, grav: 0 });
        break;
      case 'bossPhase2':
        this.effects.burst(ev.pos.clone().setY(ev.pos.y + 2.5), UP, { count: 120, color: new THREE.Color(1, 0.7, 0.3), speed: 9, size: 0.3, life: 1.2, grav: 1, spread: 2 });
        break;
      case 'slam':
        this.effects.burst(ev.pos.clone().setY(ev.pos.y + 0.2), UP, { count: 70, color: new THREE.Color(0.5, 0.38, 0.25), speed: 9, size: 0.45, life: 0.8, grav: 6, spread: 2 });
        break;
      case 'wallStun':
        this.effects.burst(ev.pos.clone().setY(ev.pos.y + 1.5), null, { count: 30, color: new THREE.Color(0.5, 0.4, 0.3), speed: 4, size: 0.35, life: 0.7 });
        break;
      case 'reflect': {
        const m = this.orbs.get(ev.id);
        if (m) { m.material.color.copy(REFLECTED).multiplyScalar(3); m.children[0].material.color.copy(REFLECTED); }
        this.effects.burst(ev.pos, null, { count: 16, color: REFLECTED, speed: 5, size: 0.1, life: 0.3 });
        break;
      }
      case 'projectileEnd': {
        const m = this.orbs.get(ev.id);
        if (m) { this.#releaseOrb(m); this.orbs.delete(ev.id); }
        this.effects.burst(ev.pos, ev.normal, { count: 14, color: ev.reflected ? REFLECTED : ENEMY_LOOK[ev.enemyType].color, speed: 4, size: 0.12, life: 0.35 });
        break;
      }
    }
  }

  // mirror the simulation state: create, move and pose meshes; drop the ones that are gone
  sync(enemies, dt, time) {
    const seen = new Set();
    for (const e of enemies.list) {
      seen.add(e.id);
      const v = this.views.get(e.id) || this.#createView(e);
      v.last = e;
      this.#pose(v, e, dt);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { this.scene.remove(v.mesh); this.scene.remove(v.blob); this.views.delete(id); }

    const live = new Set();
    for (const p of enemies.projectiles) {
      live.add(p.id);
      let m = this.orbs.get(p.id);
      if (!m) { m = this.#acquireOrb(p.reflected ? REFLECTED : ENEMY_LOOK[p.type].color); this.orbs.set(p.id, m); }
      m.position.copy(p.pos);
      if (Math.random() < 0.5) this.effects.emit(p.pos, new THREE.Vector3(), p.reflected ? REFLECTED : ENEMY_LOOK[p.type].color, 0.18, 0.25);
    }
    for (const [id, m] of this.orbs) if (!live.has(id)) { this.#releaseOrb(m); this.orbs.delete(id); }

    const pk = new Set();
    enemies.pickups.forEach((p, i) => {
      pk.add(p.id);
      let m = this.pickupMeshes.get(p.id);
      if (!m) { m = this.#pickupMesh(p.kind); this.pickupMeshes.set(p.id, m); }
      m.position.set(p.pos.x, p.pos.y + Math.sin(time * 3 + i) * 0.12, p.pos.z);
      m.rotation.y += dt * 2;
    });
    for (const [id, m] of this.pickupMeshes) if (!pk.has(id)) { this.scene.remove(m); this.pickupMeshes.delete(id); }

    // a lobbed ball flies in an arc; its shadow grows darker and wider as it comes down
    for (const l of this.lobs) {
      l.t += dt;
      const k = Math.min(1, l.t / l.dur);
      const arc = Math.max(4, l.from.distanceTo(l.to) * 0.35);
      l.ball.position.lerpVectors(l.from, l.to, k);
      l.ball.position.y += Math.sin(Math.PI * k) * arc;
      l.shadow.scale.setScalar(l.radius * (0.6 + 1.4 * k));
      l.shadow.material.opacity = 0.35 + 0.65 * k;
      if (Math.random() < 0.5) this.effects.emit(l.ball.position, new THREE.Vector3(0, 0.5, 0), new THREE.Color(0.14, 0.14, 0.13), 0.16, 0.6, -0.3);
    }

    for (const f of this.fallingOrbs) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.mesh.position.set(f.to.x, f.to.y + 30 * (1 - k * k), f.to.z);
      if (Math.random() < 0.6) this.effects.emit(f.mesh.position, new THREE.Vector3(0, 6, 0), new THREE.Color(1, 0.45, 0.2), 0.3, 0.3);
    }

    this.#updateDebris(dt);
  }

  #acquireOrb(color) {
    let mesh = this.orbPool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(this.orbGeo, new THREE.MeshBasicMaterial());
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.orbTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.setScalar(1.3);
      mesh.add(glow);
    }
    mesh.scale.setScalar(1);
    mesh.material.color.copy(color).multiplyScalar(3);
    mesh.children[0].material.color.copy(color);
    this.scene.add(mesh);
    return mesh;
  }

  #dropLob(l) {
    this.scene.remove(l.ball);
    this.scene.remove(l.shadow);
    l.shadow.material.dispose();
  }

  #releaseOrb(mesh) {
    this.scene.remove(mesh);
    this.orbPool.push(mesh);
  }

  #pickupMesh(kind) {
    const color = kind === 'ammo' ? 0x56d8ff : 0xff4a4a;
    const mesh = new THREE.Mesh(this.pickupGeo, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 2.5 }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.orbTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    halo.scale.setScalar(1.6);
    mesh.add(halo);
    this.scene.add(mesh);
    return mesh;
  }

  #shatter(v, pos, dir) {
    v.mesh.updateMatrixWorld(true);
    const parts = [];
    v.mesh.traverse((o) => { if (o.isMesh) parts.push(o); });
    const push = dir ? dir.clone().setY(0).normalize() : new THREE.Vector3();
    for (const o of parts) {
      this.scene.attach(o);
      const out = o.position.clone().sub(pos).setY(0).normalize();
      const vel = out.multiplyScalar(rand(2, 5)).addScaledVector(push, rand(3, 6));
      vel.y = rand(2, 6);
      o.material.emissive.setRGB(0, 0, 0);
      o.material.transparent = true;
      this.debris.push({ mesh: o, vel, spin: new THREE.Vector3().randomDirection().multiplyScalar(8), life: rand(2.5, 3.5), floor: pos.y });
    }
    this.scene.remove(v.mesh);
    this.scene.remove(v.blob);
  }

  #ring(pos, radius, color, life) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2), transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(pos).setY(pos.y + 0.06);
    m.scale.setScalar(0.1);
    this.scene.add(m);
    this.debris.push({ mesh: m, ring: true, radius, life, total: life });
  }

  #updateDebris(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.ring) {
        const k = 1 - d.life / d.total;
        d.mesh.scale.setScalar(Math.max(0.1, k * d.radius));
        d.mesh.material.opacity = 0.3 + 0.5 * k;
      } else {
        d.vel.y -= 18 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        const floor = d.floor + 0.1;
        if (d.mesh.position.y < floor) {
          d.mesh.position.y = floor;
          d.vel.y *= -0.3; d.vel.x *= 0.6; d.vel.z *= 0.6; d.spin.multiplyScalar(0.6);
        }
        d.mesh.rotation.x += d.spin.x * dt;
        d.mesh.rotation.y += d.spin.y * dt;
        d.mesh.rotation.z += d.spin.z * dt;
        if (d.life < 1) {
          d.mesh.material.opacity = Math.max(0, d.life);
          d.mesh.position.y -= dt * 0.3;
        }
      }
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.material.dispose();
        this.debris.splice(i, 1);
      }
    }
  }

  // pick the clip that matches what the simulation says the enemy is doing
  #animate(v, e, dt) {
    if (!v.mixer) return;
    const a = e.act;
    const gait = GAIT[e.type];
    let name, timeScale = 1;
    if (e.rise > 0) name = 'idle';
    else if (e.stun > 0) name = 'stun';
    else if (a && ACT_CLIPS[a.kind] && v.actions[ACT_CLIPS[a.kind][0]]) {
      const [clip, lead] = ACT_CLIPS[a.kind];
      name = clip;
      if (lead) timeScale = lead / a.dur;
    } else if (e.speed > gait.run && v.actions.run) {
      name = 'run';
      timeScale = THREE.MathUtils.clamp(e.speed / gait.runRef, 0.7, 1.6);
    } else if (e.speed > 0.3) {
      name = 'walk';
      timeScale = THREE.MathUtils.clamp(e.speed / gait.walkRef, 0.6, 2.2);
    } else name = 'idle';

    const next = v.actions[name];
    // a new attack restarts its clip, even if the previous attack used the same one
    const restart = a && a !== v.actRef && ACT_CLIPS[a.kind];
    v.actRef = a;
    if (name !== v.current || restart) {
      const prev = v.actions[v.current];
      next.reset();
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.play();
      if (prev && prev !== next) prev.crossFadeTo(next, 0.15, false);
      v.current = name;
    }
    next.setEffectiveTimeScale(timeScale);
    v.mixer.update(dt);
  }

  // place the model and its shadow, play its animation, and flash it when hit
  #pose(v, e, dt) {
    const T = e.T;
    const a = e.act;
    const p = a ? Math.min(1, a.t / a.dur) : 0;
    v.phase += dt;
    this.#animate(v, e, dt);

    const shake = a?.kind === 'charge-wind' || a?.kind === 'prime' ? Math.sin(v.phase * 60) * (a.kind === 'prime' ? 0.03 + p * 0.05 : 0.05) : 0;
    const hover = T.hover ?? (T.boss ? 0.4 : 0);
    v.mesh.position.set(e.pos.x + shake, e.pos.y + e.lift + hover - e.rise * T.height, e.pos.z);
    v.mesh.rotation.y = e.facing;
    if (T.fly) {
      // each bat circles the swarm's centre, bobbing, its wings beating
      v.mesh.position.y += T.height / 2;
      for (const b of v.mesh.userData.bats) {
        b.angle += dt * b.speed;
        b.bat.position.set(Math.cos(b.angle) * b.orbit, b.lift + Math.sin(v.phase * 3 + b.seed) * 0.15, Math.sin(b.angle) * b.orbit);
        b.bat.rotation.y = -b.angle;
        const f = Math.sin(v.phase * b.flap + b.seed) * 0.9;
        if (b.wings[0]) b.wings[0].rotation.z = -f;
        if (b.wings[1]) b.wings[1].rotation.z = f;
      }
    }
    // a cut tentacle sends up a spray as it goes under
    if (e.diving && e.rise < 0.9 && Math.random() < 0.4) this.effects.emit(e.pos.clone().setY(0.4), new THREE.Vector3((Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3), new THREE.Color(0.6, 0.75, 0.8), 0.2, 0.6, 9);
    // a climbing scarab stands up against the wall
    v.mesh.rotation.order = 'YXZ';
    v.mesh.rotation.x += ((e.climbing ? -Math.PI / 2 : 0) - v.mesh.rotation.x) * Math.min(1, dt * 12);
    v.mesh.visible = !e.hidden;
    v.blob.visible = !e.hidden && !T.fly;
    const shadowSize = T.radius * 2.6 * (1 - Math.min(0.5, e.lift * 0.3)) * (1 - e.rise);
    v.blob.position.set(e.pos.x, e.pos.y + 0.03, e.pos.z);
    v.blob.scale.setScalar(Math.max(0.01, shadowSize));

    // hit flash, and a charge glow while winding up a ranged attack
    v.flash = Math.max(0, v.flash - dt);
    // glow ramps up while winding up a ranged attack; a primed mummy blinks faster and faster
    let charge = a?.kind === 'ranged' || a?.kind === 'slam' ? p : 0;
    if (a?.kind === 'prime') charge = 1.5 + Math.sin(v.phase * (12 + p * 40)) * 1.5;
    for (const m of v.mats) {
      if (v.flash > 0) { m.m.emissive.setRGB(1, 0.9, 0.8); m.m.emissiveIntensity = 0.6; }
      else { m.m.emissive.copy(m.emissive); m.m.emissiveIntensity = m.ei * (1 + charge * 2); }
    }
  }
}

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
