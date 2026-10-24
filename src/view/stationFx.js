import * as THREE from 'three';
import { beamMaterial, makeBeam } from './lightBeams.js';

// The station's small life, placed by empties of the decor (blender/station/station.py):
// - FX_Beacon_n: a rotating amber beacon, two beams sweeping round it; the beacon nearest to the
//   viewer also sweeps a real spot light over the walls;
// - FX_Spark_n: a cut cable that spits a shower of sparks now and then;
// - FX_Drip_n: water dripping from the ceiling, a drop every second or so.
// onSound(kind, pos) lets the client play the crackle of a spark or the tick of a drop.
export class StationFx {
  constructor(scene, { beacons = [], sparks = [], drips = [] }, look) {
    this.scene = scene;
    this.onSound = null;
    const color = new THREE.Color(look.beacon?.color ?? 0xff5a10);

    // ---------- beacons ----------
    const housing = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5, metalness: 0.6 });
    const dome = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.3 });
    // two soft beams out of the bulb, aimed a little down, short enough to stay in a corridor
    const beamMat = beamMaterial(color, 0.55, 1.4);
    const tilt = 0.3, beamDir = (s) => new THREE.Vector3(s * Math.cos(tilt), -Math.sin(tilt), 0);
    this.beacons = beacons.map((pos) => {
      const g = new THREE.Group();
      g.position.copy(pos);
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 10).translate(0, 0.08, 0), housing));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), dome));
      const spin = new THREE.Group();
      spin.position.y = -0.06;
      spin.add(makeBeam(beamMat, 0.07, 0.8, 3, new THREE.Vector3(), beamDir(1)), makeBeam(beamMat, 0.07, 0.8, 3, new THREE.Vector3(), beamDir(-1)));
      g.add(spin);
      scene.add(g);
      return { g, spin, phase: Math.random() * 6 };
    });
    // one spot light, always there (adding lights later would recompile every material)
    this.spot = new THREE.SpotLight(color, 0, 16, 0.5, 0.6, 1.5);
    this.spot.target = new THREE.Object3D();
    scene.add(this.spot, this.spot.target);

    // ---------- sparks ----------
    const n = 24;
    this.sparks = sparks.map((pos) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd28a, size: 0.05, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      pts.frustumCulled = false;
      pts.visible = false;
      scene.add(pts);
      return { pos, pts, vel: Array.from({ length: n }, () => new THREE.Vector3()), t: 0, next: 1 + Math.random() * 4 };
    });
    this.sparkLight = new THREE.PointLight(0xffb060, 0, 7, 2);
    scene.add(this.sparkLight);

    // ---------- drips ----------
    const dropGeo = new THREE.SphereGeometry(0.018, 5, 4).scale(1, 3, 1);
    const dropMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.05, metalness: 0.2 });
    this.drips = drips.map((pos) => {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.visible = false;
      scene.add(m);
      return { pos, m, y: pos.y, v: 0, next: Math.random() * 1.5 };
    });
  }

  update(t, dt, view) {
    // beacons turn; the spot follows the one nearest to the viewer
    let near = null, nd = Infinity;
    for (const b of this.beacons) {
      b.spin.rotation.y = t * 3.4 + b.phase;
      const d = view ? b.g.position.distanceToSquared(view) : Infinity;
      if (d < nd) { nd = d; near = b; }
    }
    if (near && nd < 22 * 22) {
      const ang = near.spin.rotation.y;
      this.spot.position.copy(near.g.position);
      this.spot.target.position.copy(near.g.position).add(new THREE.Vector3(Math.cos(ang) * 4, -1.6, -Math.sin(ang) * 4));
      this.spot.intensity = 30;
    } else this.spot.intensity = 0;

    // sparks: a burst, falling and fading, then a wait
    let flash = 0;
    for (const s of this.sparks) {
      s.next -= dt;
      if (s.next <= 0) {
        s.next = 2 + Math.random() * 6;
        s.t = 0.9;
        s.pts.visible = true;
        const p = s.pts.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          p.setXYZ(i, s.pos.x, s.pos.y, s.pos.z);
          s.vel[i].set((Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4);
        }
        this.onSound?.('spark', s.pos);
      }
      if (s.t <= 0) continue;
      s.t -= dt;
      if (s.t <= 0) { s.pts.visible = false; continue; }
      const p = s.pts.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = s.vel[i];
        v.y -= 9.8 * dt;
        let y = p.getY(i) + v.y * dt;
        if (y < 0.02) { y = 0.02; v.y *= -0.3; v.x *= 0.5; v.z *= 0.5; }
        p.setXYZ(i, p.getX(i) + v.x * dt, y, p.getZ(i) + v.z * dt);
      }
      p.needsUpdate = true;
      s.pts.material.opacity = Math.min(1, s.t * 2);
      if (s.t > 0.6 && (!view || s.pos.distanceToSquared(view) < 30 * 30)) { flash = Math.max(flash, (s.t - 0.6) / 0.3); this.sparkLight.position.copy(s.pos); }
    }
    this.sparkLight.intensity = flash * 12 * (0.6 + 0.4 * Math.random());

    // drips: a drop falls from the ceiling and vanishes on the floor
    for (const d of this.drips) {
      if (!d.m.visible) {
        d.next -= dt;
        if (d.next > 0) continue;
        d.m.visible = true;
        d.y = d.pos.y;
        d.v = 0;
      }
      d.v += 9.8 * dt;
      d.y -= d.v * dt;
      if (d.y <= 0.02) {
        d.m.visible = false;
        d.next = 0.7 + Math.random() * 1.4;
        this.onSound?.('drip', d.pos);
        continue;
      }
      d.m.position.set(d.pos.x, d.y, d.pos.z);
    }
  }
}
