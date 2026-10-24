import * as THREE from 'three';
import { KEG } from '../sim/sim.js';

// The map's powder kegs (pirate port): a dark barrel with iron hoops and a fuse on its lid,
// hidden while blown up. The simulation owns them (sim.kegs); this only shows them.
export class KegView {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
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
