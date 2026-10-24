import * as THREE from 'three';
import { KEG } from '../sim/sim.js';

// The map's powder kegs (pirate port): a dark barrel with iron hoops and a fuse on its lid,
// hidden while blown up. The simulation owns them (sim.kegs); this only shows them.
// style 'oxygen' (the station): a tall oxygen bottle in a cradle instead.
export class KegView {
  constructor(scene, style = 'powder') {
    this.scene = scene;
    this.meshes = [];
    if (style === 'oxygen') { this.#oxygen(); return; }
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2414, roughness: 0.9, flatShading: true });
    const iron = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.5, metalness: 0.7, flatShading: true });
    const powder = new THREE.MeshStandardMaterial({ color: 0x8a1c10, roughness: 0.8, flatShading: true });
    const r = KEG.radius, h = KEG.height;
    // a barrel bulges in the middle: a lathe profile
    const profile = [0, 0.25, 0.5, 0.75, 1].map((t) => new THREE.Vector2(r * (0.86 + 0.14 * Math.sin(t * Math.PI)), t * h));
    this.parts = [
      [new THREE.LatheGeometry(profile, 12), wood],
      [new THREE.CylinderGeometry(r * 0.99, r * 0.99, 0.06, 12).translate(0, h * 0.15, 0), iron],
      [new THREE.CylinderGeometry(r * 0.99, r * 0.99, 0.06, 12).translate(0, h * 0.85, 0), iron],
      [new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.02, 12).translate(0, h, 0), powder], // the lid, painted red
      [new THREE.CylinderGeometry(0.02, 0.02, 0.18, 5).translate(0.1, h + 0.09, 0), iron], // the fuse
    ];
  }

  #oxygen() {
    const body = new THREE.MeshStandardMaterial({ color: 0x2f5d8a, roughness: 0.35, metalness: 0.4, flatShading: true });
    const white = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.3, metalness: 0.3, flatShading: true });
    const steel = new THREE.MeshStandardMaterial({ color: 0x55595f, roughness: 0.35, metalness: 0.9, flatShading: true });
    const label = new THREE.MeshStandardMaterial({ color: 0x20d050, emissive: 0x10a030, emissiveIntensity: 0.6, roughness: 0.5 });
    const r = 0.27, h = KEG.height;
    this.parts = [
      [new THREE.CylinderGeometry(r, r, h * 0.72, 14).translate(0, h * 0.38, 0), body],
      [new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, h * 0.74, 0), white], // the white shoulder
      [new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8).translate(0, h * 0.74 + r, 0), steel], // the valve
      [new THREE.CylinderGeometry(0.1, 0.1, 0.03, 8).translate(0, h * 0.74 + r + 0.06, 0), steel],
      [new THREE.BoxGeometry(0.14, 0.2, 0.02).translate(0, h * 0.45, r + 0.005), label], // an O2 tag
      [new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.05, 14).translate(0, h * 0.04, 0), steel], // the cradle's ring
      [new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.05, 14).translate(0, h * 0.55, 0), steel],
    ];
  }

  // kegs: sim.kegs ([] in co-op, whose server only knows the desert)
  sync(kegs = []) {
    while (this.meshes.length < kegs.length) {
      const g = new THREE.Group();
      for (const [geo, mat] of this.parts) {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      }
      g.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(g);
      this.meshes.push(g);
    }
    this.meshes.forEach((g, i) => {
      const k = kegs[i];
      g.visible = !!k?.alive;
      if (k) g.position.copy(k.pos);
    });
  }
}
