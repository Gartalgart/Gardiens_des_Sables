import * as THREE from 'three';

const SPARK_COLOR = new THREE.Color(1, 0.6, 0.2);
const SMOKE_COLOR = new THREE.Color(0.14, 0.14, 0.13);
const UP = new THREE.Vector3(0, 1, 0);

// The fire pots in flight (grenade.glb, made in blender/grenade.py, or the universe's own, like the
// pirates' bombs): they tumble as they fly and their fuse throws sparks. Cannon balls (kind 'ball')
// fly in the same list, trailing smoke. The station's sticky mines (kind 'mine') lie flat on what
// they stuck to, their light blinking faster once armed. The blast itself is drawn by explode().
export class GrenadeView {
  constructor(scene, assets, effects) {
    this.scene = scene;
    this.model = assets.grenade;
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, metalness: 0.7, roughness: 0.45, flatShading: true }));
    this.effects = effects;
    this.views = new Map(); // grenade id -> { mesh, spark, last }
    this.sparkTimer = 0;
  }

  clear() {
    for (const v of this.views.values()) this.scene.remove(v.mesh);
    this.views.clear();
  }

  sync(grenades, dt) {
    const seen = new Set();
    this.sparkTimer -= dt;
    const emit = this.sparkTimer <= 0;
    if (emit) this.sparkTimer = 0.03;
    for (const g of grenades) {
      seen.add(g.id);
      let v = this.views.get(g.id);
      if (!v) {
        const mesh = (g.kind === 'ball' ? this.ball : this.model).clone(true);
        mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.scene.add(mesh);
        v = { mesh, spark: mesh.getObjectByName('Spark'), last: g.pos.clone() };
        const led = mesh.getObjectByName('Led');
        if (led) { led.material = led.material.clone(); v.led = led; }
        this.views.set(g.id, v);
      }
      if (g.kind === 'mine' && g.stuck) {
        v.mesh.position.copy(g.pos);
        if (g.normal) v.mesh.quaternion.setFromUnitVectors(UP, g.normal);
        if (v.led) v.led.material.emissiveIntensity = (performance.now() / 1000) % (g.armed > 0 ? 0.6 : 0.25) < 0.08 ? 8 : 0.3;
        v.last.copy(g.pos);
        continue;
      }
      // tumble with the speed it moves at
      const moved = v.last.distanceTo(g.pos);
      v.mesh.position.copy(g.pos);
      v.mesh.rotation.x += moved * 6;
      v.mesh.rotation.z += moved * 3;
      v.last.copy(g.pos);
      if (emit && g.kind === 'ball') this.effects.emit(g.pos, new THREE.Vector3(0, 0.6, 0), SMOKE_COLOR, 0.14, 0.8, -0.3);
      if (emit && v.spark) {
        const p = v.spark.getWorldPosition(new THREE.Vector3());
        const up = new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5);
        this.effects.emit(p, up, SPARK_COLOR, 0.05, 0.3, 4);
      }
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { this.scene.remove(v.mesh); this.views.delete(id); }
  }

  // fire and smoke instead of the mummy's green blast
  explode(pos) {
    const fx = this.effects;
    const UP = new THREE.Vector3(0, 1, 0);
    fx.burst(pos, null, { count: 90, color: new THREE.Color(1, 0.55, 0.15), speed: 11, size: 0.3, life: 0.55, grav: 2 });
    fx.burst(pos, UP, { count: 50, color: new THREE.Color(1, 0.8, 0.35), speed: 6, size: 0.45, life: 0.7, grav: -1, spread: 1.4 });
    fx.burst(pos.clone().setY(pos.y + 0.3), UP, { count: 45, color: new THREE.Color(0.22, 0.18, 0.15), speed: 3.5, size: 0.8, life: 1.6, grav: -0.5, spread: 2 });
    fx.burst(pos, UP, { count: 30, color: new THREE.Color(0.45, 0.33, 0.2), speed: 8, size: 0.12, life: 0.9, grav: 12, spread: 1.2 });
  }
}
