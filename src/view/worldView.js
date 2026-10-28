import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sea } from './sea.js';
import { dressMaterial, wetSand } from './surfaces.js';
import { StationFx } from './stationFx.js';
import { beamMaterial, makeBeam } from './lightBeams.js';

// What the level looks like: merged meshes, sky, moon, braziers and their lights.
// Collisions and navigation live in the simulation (src/sim/level.js).
// look: the universe's ambiance (fog, sky, moon, fire colours; see src/worlds/). A station (look.space)
// has stars all round and a planet, neon lights that stutter, a red emergency glow, airlock doors and
// their levers, and steam leaking from pipes.
// breakable: rectangles of the map that can break during a game ({ minX, maxX, minZ, maxZ, maxY },
// the Kraken's piers): their meshes are kept apart from the merged ones so they can be hidden.
export class WorldView {
  constructor(scene, levelRoot, level, look, breakable = []) {
    this.scene = scene;
    this.look = look;
    this.braziers = level.braziers;
    this.flames = [];
    this.breakable = breakable.map((rect) => ({ rect, group: new THREE.Group() }));
    this.outLights = new Set(); // braziers of a broken part of the map: their lights stay off
    for (const b of this.breakable) scene.add(b.group);
    this.neons = []; // L_DecoNeon_n: the tube of light n, drawn on its own to flicker with it
    this.doors = []; // D_Airlock_n: the door of airlock n, slid up when it opens
    this.steamAt = []; // FX_Steam_n empties
    this.fxAt = { beacons: [], sparks: [], drips: [] }; // FX_Beacon_n, FX_Spark_n, FX_Drip_n (see StationFx)
    this.alarmMats = new Set(); // the red emergency lights, pulsing with the alarm
    this.power = 1; // 1 lit .. 0 the Hive Queen has cut the power (neons out, the alarm up): setPower
    this.powerT = 0; // seconds since the power went or came back
    this.litMats = []; // the map's lit surfaces and their glow, dimmed with the power: [material, base]

    // a universe whose map is not modelled yet is drawn from its collision boxes
    if (levelRoot) this.#buildLevel(levelRoot);
    else this.#buildFromBoxes(level);
    this.#buildSky();
    this.#buildLights();
    this.#buildStorm();
    if (look.sea) this.sea = new Sea(scene, look.sea, look, level);
    if (look.space?.planet) this.#buildPlanet(look.space.planet);
    if (look.alarm) {
      this.alarm = new THREE.HemisphereLight(look.alarm.color, 0x000000, 0);
      scene.add(this.alarm);
    }
    this.#buildAirlocks(level);
    this.#buildSteam();
    this.#buildBeams(look);
    const { beacons, sparks, drips } = this.fxAt;
    if (beacons.length + sparks.length + drips.length) this.fx = new StationFx(scene, this.fxAt, look);
  }

  // ---------- the station ----------
  // a ringed planet far out, lit by the sun (the moon light) so it has a night side
  #buildPlanet(P) {
    const dir = new THREE.Vector3(...P.dir).normalize();
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const base = new THREE.Color(P.color), band = new THREE.Color(P.band);
    for (let y = 0; y < 256; y++) {
      // latitude bands, wavy, with a darker storm belt
      const v = y / 256;
      const k = 0.5 + 0.5 * Math.sin(v * 38 + Math.sin(v * 9) * 2.5) * Math.sin(v * 11);
      const col = base.clone().lerp(band, k * 0.75);
      for (let x = 0; x < 512; x += 4) {
        const w = 0.92 + 0.08 * Math.sin(x * 0.05 + y * 0.31) * Math.sin(x * 0.013 - y * 0.07);
        g.fillStyle = `rgb(${col.r * 255 * w | 0},${col.g * 255 * w | 0},${col.b * 255 * w | 0})`;
        g.fillRect(x, y, 4, 1);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(P.size, 48, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, fog: false }));
    planet.position.copy(dir).multiplyScalar(400);
    planet.rotation.set(0.35, 0, 0.2);
    this.scene.add(planet);
    // its rings: a flat band of dust, tilted, fading in and out across its width
    const rc = document.createElement('canvas');
    rc.width = 256; rc.height = 4;
    const rg = rc.getContext('2d');
    for (let x = 0; x < 256; x++) {
      const a = (0.25 + 0.6 * Math.abs(Math.sin(x * 0.11) * Math.sin(x * 0.037))) * Math.min(1, x / 20, (256 - x) / 20) * (x > 150 && x < 162 ? 0.1 : 1);
      rg.fillStyle = P.ring; rg.globalAlpha = a; rg.fillRect(x, 0, 1, 4);
    }
    const rtex = new THREE.CanvasTexture(rc);
    rtex.colorSpace = THREE.SRGBColorSpace;
    const ringGeo = new THREE.RingGeometry(P.size * 1.3, P.size * 2.2, 96, 1);
    // the texture runs across the ring's width: u from the radius
    const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - P.size * 1.3) / (P.size * 0.9), 0.5);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ map: rtex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1, fog: false }));
    ring.position.copy(planet.position);
    ring.rotation.set(-Math.PI / 2 + 0.32, 0.25, 0);
    this.scene.add(ring);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(P.atmosphere, 0.0), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.45 }));
    halo.position.copy(planet.position).addScaledVector(dir, 40);
    halo.scale.setScalar(P.size * 2.6);
    this.scene.add(halo);
  }

  // Levers next to the airlocks (on the wall nearest to their spot): a handle up while the door is
  // shut, down while it is open, and a lamp, green or blinking red. Plus dust drawn into an open door.
  #buildAirlocks(level) {
    this.airlocks = level.airlocks.map((a) => {
      const at = a.lever.clone();
      let hit = null;
      for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
        const h = level.raycast(at, new THREE.Vector3(...d), 1.2);
        if (h && (!hit || h.dist < hit.dist)) hit = h;
      }
      const g = new THREE.Group();
      g.position.copy(hit ? hit.point : at);
      if (hit) g.lookAt(g.position.clone().add(hit.normal));
      const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.7 });
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.08).translate(0, 0, 0.04), dark));
      const handle = new THREE.Group();
      handle.position.set(0, -0.05, 0.1);
      handle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 6).translate(0, 0.18, 0), dark));
      handle.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6).translate(0, 0.37, 0), new THREE.MeshStandardMaterial({ color: 0xc8261a, roughness: 0.4 })));
      g.add(handle);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6).translate(0, 0.24, 0.09), new THREE.MeshBasicMaterial({ color: 0x30ff50 }));
      g.add(lamp);
      this.scene.add(g);
      const box = a.door, size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const axis = size.x < size.z ? 'x' : 'z';
      return { handle, lamp, open: false, slide: 0, height: size.y + 0.1, center, axis, sign: Math.sign(center[axis]) || 1, width: Math.max(size.x, size.z) };
    });
    // dust and scraps streaming to the open door
    const n = 260, pos = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb8c0c8, size: 0.03, transparent: true, opacity: 0.8, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.dust.visible = false;
    this.dust.userData.speed = new Float32Array(n);
    this.scene.add(this.dust);
  }

  // Light in the haze: a soft cone under each neon (flickering with it), and shafts of sunlight
  // through the greenhouse roof (look.sunShafts: the roof's height and the spots they come through).
  #buildBeams(look) {
    this.neonBeams = [];
    if (look.fire.neon)
      this.neonBeams = this.braziers.map((p) => {
        const mat = beamMaterial(look.fire.light, 0.045, 1.3);
        const beam = makeBeam(mat, 0.55, 2.2, p.y, p.clone().setY(p.y + 0.1), new THREE.Vector3(0, -1, 0));
        this.scene.add(beam);
        return mat;
      });
    const S = look.sunShafts;
    if (!S) return;
    const dir = new THREE.Vector3(...look.moon.dir).normalize().negate();
    const len = S.y / -dir.y;
    for (const [x, z] of S.at) {
      const mat = beamMaterial(look.moon.light, S.strength, 0.9);
      this.scene.add(makeBeam(mat, S.radius, S.radius * 1.15, len, new THREE.Vector3(x, S.y, z), dir));
    }
  }

  // the sim's 'airlock' event: { id, open }
  setAirlock(id, open) {
    const a = this.airlocks[id];
    if (!a) return;
    a.open = open;
    if (open) {
      const p = this.dust.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) this.#dustSpawn(a, i, true);
    }
  }

  // shut doors and levers up, for a new game
  closeAirlocks() {
    for (const a of this.airlocks) a.open = false;
  }

  // the station's power (the sim's 'power' event): the neons die out in a last stutter, or come back
  setPower(on, instant = false) {
    if (this.powerOn !== on) this.powerT = 0;
    this.powerOn = on;
    if (instant) this.power = on ? 1 : 0;
  }

  #dustSpawn(a, i, anywhere) {
    const p = this.dust.geometry.attributes.position, side = a.axis === 'x' ? 'z' : 'x';
    const v = new THREE.Vector3();
    v[a.axis] = a.center[a.axis] - a.sign * (anywhere ? 1 + Math.random() * 14 : 10 + Math.random() * 6);
    v[side] = a.center[side] + (Math.random() - 0.5) * (a.width + 8);
    v.y = 0.05 + Math.random() * Math.min(3, a.height);
    p.setXYZ(i, v.x, v.y, v.z);
    this.dust.userData.speed[i] = 4 + Math.random() * 6;
  }

  #updateAirlocks(t, dt) {
    let any = null;
    this.airlocks.forEach((a, i) => {
      a.slide += ((a.open ? 1 : 0) - a.slide) * Math.min(1, dt * (a.open ? 6 : 2.5));
      const door = this.doors[i];
      if (door) door.position.y = door.userData.y + a.slide * a.height;
      a.handle.rotation.x = THREE.MathUtils.lerp(-0.5, 1.1, a.slide);
      a.lamp.material.color.setHex(a.open ? (Math.sin(t * 12) > 0 ? 0xff2010 : 0x300000) : 0x30ff50);
      if (a.open) any = a;
    });
    this.dust.visible = !!any;
    if (!any) return;
    const p = this.dust.geometry.attributes.position, sp = this.dust.userData.speed;
    const v = new THREE.Vector3(), to = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      to.copy(any.center).setY(Math.min(v.y, any.height * 0.6)).sub(v);
      const d = to.length();
      if (d < 0.6 || (v[any.axis] - any.center[any.axis]) * any.sign > 0) { this.#dustSpawn(any, i, false); continue; }
      sp[i] = Math.min(25, sp[i] + dt * 12);
      v.addScaledVector(to, (sp[i] * dt) / d);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    p.needsUpdate = true;
  }

  // steam puffing from leaking pipes: soft sprites that rise, swell and fade
  #buildSteam() {
    if (!this.steamAt.length) return;
    const tex = makeGlowTexture('rgba(220,228,236,1)', 0.0);
    this.steam = [];
    for (const at of this.steamAt)
      for (let k = 0; k < 14; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
        s.userData = { at, age: Math.random() * 2.4, life: 2.4, vel: new THREE.Vector3() };
        s.position.copy(at);
        this.scene.add(s);
        this.steam.push(s);
      }
  }

  #updateSteam(dt) {
    for (const s of this.steam ?? []) {
      const u = s.userData;
      u.age += dt;
      if (u.age >= u.life) {
        u.age = 0;
        s.position.copy(u.at);
        u.vel.set((Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8);
      }
      s.position.addScaledVector(u.vel, dt);
      const k = u.age / u.life;
      s.scale.setScalar(0.3 + k * 1.8);
      s.material.opacity = 0.16 * Math.min(1, k * 6) * (1 - k);
    }
  }

  // Neon tubes: steady most of the time, then a short stutter; one in three is dying and stutters
  // often, one in five is dead and only flashes now and then. 0..1 for light n (BRAZIER_n).
  static neonLevel(t, n) {
    if (n % 5 === 0) return (t + n * 1.7) % 9 < 0.12 && Math.sin(t * 90) > 0 ? 0.8 : 0;
    const dying = n % 3 === 0;
    const cycle = dying ? 2.3 + (n % 4) * 0.4 : 7 + (n % 5) * 1.7;
    const u = (t + n * 3.17) % cycle;
    if (u > (dying ? 0.9 : 0.45)) return dying ? 0.75 : 1;
    return Math.sin(u * 70 + n) > 0.1 ? 1 : 0.06;
  }

  // a part of the map broke (the sim's 'pierBreak' event gives its rectangle); restoreBroken() for a new game
  breakArea(rect) {
    const b = this.breakable.find(({ rect: r }) => Math.abs(r.minX - rect.minX) < 0.01 && Math.abs(r.minZ - rect.minZ) < 0.01);
    if (!b) return;
    b.group.visible = false;
    if (!b.rect.ruin) return;
    (b.rubble ??= this.#rubble(b)).visible = true;
    // the lanterns of a fallen house go out
    const r = b.rect;
    this.braziers.forEach((p, i) => { if (p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ) this.outLights.add(i); });
    this.lightTimer = 0;
  }

  restoreBroken() {
    for (const b of this.breakable) {
      b.group.visible = true;
      if (b.rubble) b.rubble.visible = false;
    }
    this.outLights.clear();
    this.lightTimer = 0;
  }

  // what is left of a house or a stall the giant Kraken walked through: a heap of its own walls and
  // thatch, low enough to walk over (it has no collision)
  #rubble(b) {
    const { minX, maxX, minZ, maxZ } = b.rect;
    const mats = [];
    // (not the glass of a lantern: lit chunks would glow in the heap)
    b.group.traverse((o) => { if (o.isMesh && !mats.includes(o.material) && !(o.material.emissive?.getHex() > 0)) mats.push(o.material); });
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const n = Math.round((maxX - minX) * (maxZ - minZ) * 0.7);
    for (let i = 0; i < n && mats.length; i++) {
      const m = new THREE.Mesh(geo, mats[i % mats.length]);
      // heaped toward the middle, the bigger slabs lying flat
      const u = Math.random(), w = 0.3 + Math.random() * 1.4;
      m.scale.set(w, 0.12 + Math.random() * 0.4 * (1 - u * 0.5), 0.3 + Math.random() * 1.2);
      const k = 0.35 + 0.65 * Math.sqrt(Math.random());
      m.position.set((minX + maxX) / 2 + (Math.random() - 0.5) * (maxX - minX) * k, m.scale.y * 0.4 + Math.random() * 0.35 * (1 - k), (minZ + maxZ) / 2 + (Math.random() - 0.5) * (maxZ - minZ) * k);
      m.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * Math.PI, (Math.random() - 0.5) * 0.6);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
    this.scene.add(group);
    return group;
  }

  // Sandstorm of the pharaoh's second phase: thick ochre fog and sand blowing past the camera.
  #buildStorm() {
    this.storm = 0; // 0 clear .. 1 full storm
    this.stormTarget = 0;
    this.clearFog = { color: this.scene.fog.color.clone(), density: this.scene.fog.density };
    this.stormFog = { color: new THREE.Color(0x4a3522), density: 0.05 };
    const n = 2500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 40, Math.random() * 12, (Math.random() - 0.5) * 40], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    // fixed pixel size: grains passing right by the camera must not turn into big squares
    this.sand = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc9a46a, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
    this.sand.frustumCulled = false;
    this.scene.add(this.sand);
  }

  setWeather(kind) { this.stormTarget = kind === 'sandstorm' ? 1 : 0; }

  #updateStorm(dt, view) {
    this.storm += (this.stormTarget - this.storm) * Math.min(1, dt * 0.6);
    const k = this.storm;
    this.scene.fog.color.copy(this.clearFog.color).lerp(this.stormFog.color, k);
    this.scene.fog.density = this.clearFog.density + (this.stormFog.density - this.clearFog.density) * k;
    this.sand.material.opacity = 0.75 * k;
    this.skyMat.uniforms.storm.value = k;
    this.stars.material.opacity = 0.85 * (1 - k);
    this.moonSprite.material.opacity = 1 - k * 0.9;
    this.sand.visible = k > 0.01;
    if (!this.sand.visible || !view) return;
    // grains blow along the wind and wrap around a box that follows the camera
    const p = this.sand.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) + dt * 18, y = p.getY(i) - dt * 1.5, z = p.getZ(i) + dt * 6;
      if (x > view.x + 20) x -= 40; else if (x < view.x - 20) x += 40;
      if (z > view.z + 20) z -= 40; else if (z < view.z - 20) z += 40;
      if (y < 0) y += 12;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }

  #buildLevel(root) {
    root.updateMatrixWorld(true);
    const byMaterial = new Map();
    const fires = [];
    const scaled = new Set();

    root.traverse((o) => {
      if (o.name.startsWith('FX_Steam')) this.steamAt.push(o.getWorldPosition(new THREE.Vector3()));
      const fx = /^FX_(Beacon|Spark|Drip)_/.exec(o.name);
      if (fx) this.fxAt[fx[1].toLowerCase() + 's'].push(o.getWorldPosition(new THREE.Vector3()));
      if (!o.isMesh) return;
      // the universe's lit surfaces, dimmed as a whole (look.emissiveScale), each material once;
      // they shine by their own light, not by reflecting the torch: a dark, matt base colour
      if (this.look.emissiveScale && o.material && !scaled.has(o.material)) {
        scaled.add(o.material);
        o.material.emissiveIntensity *= this.look.emissiveScale;
        if (o.material.emissiveIntensity > 0 && !o.material.name.startsWith('S_Alarm')) this.litMats.push([o.material, o.material.emissiveIntensity]);
        if (o.material.emissiveIntensity > 0) {
          o.material.color.multiplyScalar(0.35);
          o.material.roughness = Math.max(o.material.roughness, 0.6);
        }
      }
      if (o.material?.name?.startsWith('S_Alarm')) this.alarmMats.add(o.material);
      // an airlock's door and a neon tube move or flicker on their own
      const door = /^D_Airlock_(\d+)/.exec(o.name), neon = /^L_DecoNeon_(\d+)/.exec(o.name);
      if (door || neon) {
        const m = new THREE.Mesh(o.geometry, neon ? o.material.clone() : o.material);
        o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
        if (door) {
          dressMaterial(m.material);
          m.castShadow = m.receiveShadow = true;
          m.userData.y = m.position.y;
          this.doors[Number(door[1]) - 1] = m;
        } else {
          m.userData.base = m.material.emissiveIntensity * 0.5; // the bloom does the rest
          this.neons[Number(neon[1]) - 1] = m;
        }
        this.scene.add(m);
        return;
      }
      // C_*: collision only (under the quay planks, the barrier along the deep water); Z_*: zones
      if (o.name.startsWith('C_') || o.name.startsWith('Z_')) return;
      if (o.name.startsWith('L_DecoFire')) {
        fires.push(o);
        return;
      }
      // a part of something that can break: drawn on its own
      const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      const part = this.breakable.find(({ rect: r }) => c.x >= r.minX && c.x <= r.maxX && c.z >= r.minZ && c.z <= r.maxZ && c.y <= r.maxY);
      if (part) {
        const m = new THREE.Mesh(o.geometry, o.material);
        o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
        m.castShadow = m.receiveShadow = true;
        part.group.add(m);
        m.updateMatrixWorld();
        this.#addFloorProbe(m, part.group);
        return;
      }
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      // keep only shared attributes so geometries can be merged
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      if (!o.material?.name?.startsWith('S_Glass')) this.#addFloorProbe(new THREE.Mesh(geo, o.material));
      const list = byMaterial.get(o.material) || [];
      list.push({ geo, name: o.name });
      byMaterial.set(o.material, list);
    });

    for (const [material, list] of byMaterial) {
      material.flatShading = true;
      const isGround = list.some((e) => e.name === 'Ground');
      if (isGround) {
        material.map = makeSandTexture();
        material.color.set(0xffffff);
        material.color.setRGB(0.42, 0.4, 0.42);
        if (this.look.sea) wetSand(material, this.look.sea.shore);
      } else dressMaterial(material);
      // window panes: faintly tinted, and the sun goes through them
      const glass = material.name.startsWith('S_Glass');
      if (glass) Object.assign(material, { transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, roughness: 0.05, metalness: 0.5 });
      // puddles: a dark, glossy film over the deck
      if (material.name.startsWith('S_Wet')) Object.assign(material, { transparent: true, opacity: 0.55, depthWrite: false });
      const merged = mergeGeometries(list.map((e) => e.geo), false);
      if (isGround) addPlanarUVs(merged, 6);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = !isGround && !glass;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    for (const f of fires) {
      const m = new THREE.Mesh(f.geometry, f.material);
      f.getWorldPosition(m.position);
      f.getWorldQuaternion(m.quaternion);
      m.userData.phase = Math.random() * 10;
      f.material.emissiveIntensity = 2.2;
      this.scene.add(m);
      this.flames.push(m);
    }
  }

  // ---------- what the feet stand on ----------
  // Every mesh of the map is kept (unmerged, out of the scene) in a grid of 4 m cells, so a short
  // ray down from the feet finds the material of the floor: the footsteps follow it.
  #addFloorProbe(mesh, group = null) {
    if (!mesh.material?.name) return;
    const box = new THREE.Box3().setFromObject(mesh);
    this.floorGrid ??= new Map();
    for (let x = Math.floor(box.min.x / 4); x <= Math.floor(box.max.x / 4); x++)
      for (let z = Math.floor(box.min.z / 4); z <= Math.floor(box.max.z / 4); z++) {
        const k = x * 1000 + z;
        if (!this.floorGrid.has(k)) this.floorGrid.set(k, []);
        this.floorGrid.get(k).push({ mesh, box, group });
      }
  }

  // the name of the material under the feet (as named in Blender: 'Sandstone', 'P_Plank',
  // 'S_Grating'...), or null over nothing modelled
  floorAt(pos) {
    const list = this.floorGrid?.get(Math.floor(pos.x / 4) * 1000 + Math.floor(pos.z / 4));
    if (!list) return null;
    const ray = (this.floorRay ??= new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 1));
    ray.ray.origin.set(pos.x, pos.y + 0.4, pos.z);
    let best = null;
    for (const { mesh, box, group } of list) {
      if (pos.x < box.min.x || pos.x > box.max.x || pos.z < box.min.z || pos.z > box.max.z) continue;
      if (box.min.y > pos.y + 0.4 || box.max.y < pos.y - 0.6 || (group && !group.visible)) continue;
      const hit = ray.intersectObject(mesh, false)[0];
      if (hit && (!best || hit.distance < best.distance)) best = { distance: hit.distance, mesh };
    }
    return best ? best.mesh.material.name.replace(/\.\d+$|\d{3}$/, '') : null;
  }

  // Stand-in for a map still to be modelled: sand under everything and plain wooden blocks.
  #buildFromBoxes(level) {
    const ground = new THREE.MeshStandardMaterial({ map: makeSandTexture(), color: 0x6a6a6a, roughness: 1, flatShading: true });
    const plane = new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2);
    addPlanarUVs(plane, 6);
    const floor = new THREE.Mesh(plane, ground);
    floor.receiveShadow = true;
    this.scene.add(floor);
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 0.95, flatShading: true });
    const geos = level.boxes.map((b) => {
      const size = b.getSize(new THREE.Vector3()), mid = b.getCenter(new THREE.Vector3());
      return new THREE.BoxGeometry(size.x, size.y, size.z).translate(mid.x, mid.y, mid.z).deleteAttribute('uv');
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), wood);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  #buildSky() {
    const L = this.look;
    this.scene.fog = new THREE.FogExp2(L.fog.color, L.fog.density);
    const skyGeo = new THREE.SphereGeometry(450, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        moonDir: { value: new THREE.Vector3(...L.moon.dir).normalize() },
        zenith: { value: new THREE.Vector3(...L.sky.zenith) },
        horizon: { value: new THREE.Vector3(...L.sky.horizon) },
        haze: { value: new THREE.Vector3(...L.sky.haze) },
        glow: { value: new THREE.Vector3(...L.sky.glow) },
        storm: { value: 0 },
        space: { value: L.space ? 1 : 0 },
        stormColor: { value: new THREE.Color(0x4a3522) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform vec3 moonDir; uniform float storm; uniform vec3 stormColor; uniform float space;
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 haze; uniform vec3 glow;
        void main(){
          float h = max(vDir.y, 0.0);
          vec3 col = mix(horizon, zenith, pow(h, 0.45));
          // faint warm haze opposite to the moon, like a dying sunset
          float warm = pow(max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), vec3(0.6, 0.0, 0.8)), 0.0), 6.0) * (1.0 - smoothstep(0.0, 0.25, h));
          col += haze * warm;
          float m = max(dot(vDir, moonDir), 0.0);
          col += glow * pow(m, 60.0) * 0.6;
          if (vDir.y < 0.0) col = horizon * 0.9;
          // space: no ground, the same deep black below, and the faint band of the galaxy across it
          if (space > 0.5) {
            float b = 1.0 - abs(dot(vDir, normalize(vec3(0.35, 0.8, -0.45))));
            col = mix(horizon, zenith, pow(abs(vDir.y), 0.45)) + haze * pow(b, 10.0) * (0.7 + 0.3 * sin(vDir.x * 23.0 + vDir.z * 17.0));
            col += glow * pow(m, 60.0) * 0.6;
          }
          // the sandstorm swallows the sky, a little lighter towards the zenith
          col = mix(col, stormColor * (0.8 + 0.25 * h), storm);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
    this.skyMat = skyMat;

    // stars
    const n = L.space ? 4000 : 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      if (!L.space) v.y = Math.abs(v.y) * 0.95 + 0.05;
      v.normalize().multiplyScalar(420);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: L.stars, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    this.scene.add(stars);
    this.stars = stars;

    // moon disc
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(L.moon.disc, 0.42), fog: false, depthWrite: false }));
    moon.position.copy(skyMat.uniforms.moonDir.value).multiplyScalar(400);
    moon.scale.setScalar(34);
    this.scene.add(moon);
    this.moonSprite = moon;
  }

  #buildLights() {
    const L = this.look;
    this.scene.add(new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, L.hemi.intensity));

    const moon = new THREE.DirectionalLight(L.moon.light, L.moon.intensity);
    moon.position.set(...L.moon.dir).multiplyScalar(100);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    this.moon = moon;
    const s = moon.shadow.camera;
    s.left = -62; s.right = 62; s.top = 62; s.bottom = -62; s.near = 1; s.far = 220;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.04;
    this.scene.add(moon);
    this.scene.add(moon.target);

    const glow = makeGlowTexture(L.fire.glow, 0.0);
    this.fireLights = [];
    this.lightTimer = 0;
    this.setFireLightCount(6);
    this.halos = [];
    for (const p of this.braziers) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: L.fire.halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.22 }));
      halo.position.copy(p).add(new THREE.Vector3(0, -0.2, 0));
      halo.scale.setScalar(2.4);
      this.scene.add(halo);
      this.halos.push(halo);
    }
  }

  // A fixed pool of point lights follows the braziers nearest to the viewer: every extra
  // light costs on every lit pixel, so 14 permanent lights were the main GPU expense.
  setFireLightCount(n) {
    for (const l of this.fireLights) this.scene.remove(l);
    this.fireLights = [];
    for (let i = 0; i < Math.min(n, this.braziers.length); i++) {
      const light = new THREE.PointLight(this.look.fire.light, 0, 20, 1.8);
      light.userData = { brazier: -1, fade: 0, phase: Math.random() * 10 };
      this.scene.add(light);
      this.fireLights.push(light);
    }
    this.lightTimer = 0;
  }

  #assignFireLights(view) {
    const nearest = this.braziers
      .map((p, i) => ({ i, d: p.distanceToSquared(view) }))
      .filter((e) => !this.outLights.has(e.i))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.fireLights.length)
      .map((e) => e.i);
    const kept = new Set(this.fireLights.map((l) => l.userData.brazier).filter((b) => nearest.includes(b)));
    const free = nearest.filter((b) => !kept.has(b));
    for (const l of this.fireLights) {
      if (kept.has(l.userData.brazier)) continue;
      const b = free.shift();
      l.userData.brazier = b ?? -1;
      l.userData.fade = 0;
      if (b !== undefined) l.position.copy(this.braziers[b]);
    }
  }

  update(t, dt = 0.016, view = null) {
    this.#updateStorm(dt, view);
    if (view) {
      this.lightTimer -= dt;
      if (this.lightTimer <= 0) { this.lightTimer = 0.3; this.#assignFireLights(view); }
    }
    for (const l of this.fireLights) {
      const u = l.userData;
      if (u.brazier < 0) { l.intensity = 0; continue; }
      u.fade = Math.min(1, u.fade + dt * 2.5);
      const ph = u.phase;
      l.intensity = this.look.fire.neon
        ? this.look.fire.intensity * u.fade * WorldView.neonLevel(t, u.brazier + 1) * this.power
        : 22 * u.fade * (0.82 + 0.12 * Math.sin(t * 9 + ph) + 0.08 * Math.sin(t * 23.7 + ph * 3));
    }
    // the power going (0.8 s of stutter, then a fade to black over 1.2 s) or coming back (a slower
    // fade up, a flicker as it catches)
    this.powerT += dt;
    const T = this.powerT;
    if (this.powerOn === false) this.power = T < 0.8 ? (Math.sin(T * 53) > 0 ? 1 : 0.15) : Math.max(0, 1 - (T - 0.8) / 1.2);
    else if (this.power < 1) this.power = Math.min(1, T / 2.5) * (Math.sin(T * 41) > -0.6 ? 1 : 0.3);
    for (const [m, base] of this.litMats) m.emissiveIntensity = base * (0.12 + 0.88 * this.power);
    this.neons.forEach((m, i) => {
      if (!m) return;
      const k = WorldView.neonLevel(t, i + 1) * this.power;
      m.material.emissiveIntensity = m.userData.base * k;
      if (this.neonBeams[i]) this.neonBeams[i].uniforms.strength.value = 0.045 * k;
      if (this.halos[i]) this.halos[i].material.opacity = 0.05 * k;
    });
    if (this.alarm) {
      const A = this.look.alarm, pulse = 0.5 + 0.5 * Math.sin((t / A.period) * Math.PI * 2);
      const dark = 1 + 1.6 * (1 - this.power); // in the dark, the emergency lights are all there is
      this.alarm.intensity = A.intensity * pulse * pulse * dark;
      for (const m of this.alarmMats) m.emissiveIntensity = (0.2 + 0.8 * pulse) * dark;
    }
    this.#updateAirlocks(t, dt);
    this.#updateSteam(dt);
    this.fx?.update(t, dt, view);
    for (const f of this.flames) {
      const ph = f.userData.phase;
      f.scale.set(1, 0.85 + 0.25 * Math.abs(Math.sin(t * 7 + ph)), 1);
      f.rotation.y = t * 1.5 + ph;
    }
    this.sea?.update(t, this.fireLights);
  }
}

// ---------- procedural textures ----------
function makeSandTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const ripple = Math.sin((x * 0.09 + Math.sin(y * 0.05) * 2.2)) * 0.5 + 0.5;
      const v = 150 + ripple * 30 + (Math.random() - 0.5) * 40;
      const i = (y * s + x) * 4;
      img.data[i] = v * 1.1; img.data[i + 1] = v * 0.86; img.data[i + 2] = v * 0.62; img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function addPlanarUVs(geo, scale) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / scale; uv[i * 2 + 1] = p.getZ(i) / scale; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function makeGlowTexture(color, core = 0.0) {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, color);
  if (core > 0) { grad.addColorStop(core, color); grad.addColorStop(core + 0.04, 'rgba(200,210,255,0.25)'); }
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
