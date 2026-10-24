import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// What the level looks like: merged meshes, sky, moon, braziers and their lights.
// Collisions and navigation live in the simulation (src/sim/level.js).
// look: the universe's ambiance (fog, sky, moon, fire colours; see src/worlds/).
export class WorldView {
  constructor(scene, levelRoot, level, look) {
    this.scene = scene;
    this.look = look;
    this.braziers = level.braziers;
    this.flames = [];

    // a universe whose map is not modelled yet is drawn from its collision boxes
    if (levelRoot) this.#buildLevel(levelRoot);
    else this.#buildFromBoxes(level);
    this.#buildSky();
    this.#buildLights();
    this.#buildStorm();
    if (look.sea) this.#buildSea(look.sea);
  }

  // The sea (pirate port): a wide sheet from the shore to the horizon, its swell moved in the
  // vertex shader; flat shading turns the swell into facets that catch the moonlight. The sand
  // shows through it in the shallows.
  #buildSea(sea) {
    this.seaTime = { value: 0 };
    const geo = new THREE.PlaneGeometry(600, 420, 160, 110).rotateX(-Math.PI / 2).translate(0, sea.level, sea.shore + 210);
    const mat = new THREE.MeshStandardMaterial({ color: sea.color, roughness: 0.4, metalness: 0, transparent: true, opacity: 0.8, flatShading: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.time = this.seaTime;
      sh.uniforms.shore = { value: sea.shore };
      sh.vertexShader = 'uniform float time;\nuniform float shore;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        // calmer against the shore, longer swell out at sea
        float swell = mix(0.35, 1.0, smoothstep(shore, shore + 25.0, position.z));
        transformed.y += swell * (sin(position.x * 0.31 + time * 1.1) * 0.09 + sin(position.z * 0.47 - time * 1.6) * 0.07)
          + sin((position.x + position.z) * 0.93 + time * 2.4) * 0.025;`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
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

    root.traverse((o) => {
      if (!o.isMesh) return;
      // C_*: collision only (under the quay planks, the barrier along the deep water); Z_*: zones
      if (o.name.startsWith('C_') || o.name.startsWith('Z_')) return;
      if (o.name.startsWith('L_DecoFire')) {
        fires.push(o);
        return;
      }
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      // keep only shared attributes so geometries can be merged
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
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
      }
      const merged = mergeGeometries(list.map((e) => e.geo), false);
      if (isGround) addPlanarUVs(merged, 6);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = !isGround;
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
        stormColor: { value: new THREE.Color(0x4a3522) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform vec3 moonDir; uniform float storm; uniform vec3 stormColor;
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
          // the sandstorm swallows the sky, a little lighter towards the zenith
          col = mix(col, stormColor * (0.8 + 0.25 * h), storm);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
    this.skyMat = skyMat;

    // stars
    const n = 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.95 + 0.05;
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
    for (const p of this.braziers) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: L.fire.halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.22 }));
      halo.position.copy(p).add(new THREE.Vector3(0, -0.2, 0));
      halo.scale.setScalar(2.4);
      this.scene.add(halo);
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
    if (this.seaTime) this.seaTime.value = t;
    if (view) {
      this.lightTimer -= dt;
      if (this.lightTimer <= 0) { this.lightTimer = 0.3; this.#assignFireLights(view); }
    }
    for (const l of this.fireLights) {
      const u = l.userData;
      if (u.brazier < 0) { l.intensity = 0; continue; }
      u.fade = Math.min(1, u.fade + dt * 2.5);
      const ph = u.phase;
      l.intensity = 22 * u.fade * (0.82 + 0.12 * Math.sin(t * 9 + ph) + 0.08 * Math.sin(t * 23.7 + ph * 3));
    }
    for (const f of this.flames) {
      const ph = f.userData.phase;
      f.scale.set(1, 0.85 + 0.25 * Math.abs(Math.sin(t * 7 + ph)), 1);
      f.rotation.y = t * 1.5 + ph;
    }
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
