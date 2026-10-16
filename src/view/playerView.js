import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { baseName } from '../assets.js';

const GUN_PARTS = ['GunBody', 'GunBarrel', 'GunStock', 'GunMag'];
const SWORD_PARTS = ['SwordGrip', 'SwordBlade', 'SwordHook'];

// The other players of a co-op game: the guardian model from Blender (blender/player.py), its
// animation picked from what the player is doing, their weapon in hand and their name above.
export class PlayerView {
  constructor(scene, assets, effects) {
    this.scene = scene;
    this.assets = assets;
    this.effects = effects;
    this.views = new Map();
    this.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
  }

  clear() {
    for (const v of this.views.values()) this.#remove(v);
    this.views.clear();
  }

  #remove(v) {
    this.scene.remove(v.mesh, v.blob, v.tag);
  }

  #create(p) {
    const mesh = SkeletonUtils.clone(this.assets.player);
    const gun = [], sword = [];
    mesh.traverse((o) => {
      const n = baseName(o.name);
      if (GUN_PARTS.includes(n)) gun.push(o);
      if (SWORD_PARTS.includes(n)) sword.push(o);
      if (o.isMesh) { o.material = o.material.clone(); o.material.flatShading = true; }
    });
    this.scene.add(mesh);
    const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
    blob.scale.setScalar(0.9);
    this.scene.add(blob);
    const tag = makeNameTag(p.name);
    this.scene.add(tag);

    const mixer = new THREE.AnimationMixer(mesh);
    const actions = {};
    for (const clip of this.assets.clips.player) {
      if (clip.name === 'slash') {
        const a = mixer.clipAction(THREE.AnimationUtils.makeClipAdditive(clip.clone()));
        a.blendMode = THREE.AdditiveAnimationBlendMode;
        a.setLoop(THREE.LoopOnce, 1);
        actions.slash = a;
        continue;
      }
      actions[clip.name] = mixer.clipAction(clip);
    }
    actions.idle.play();
    const v = { mesh, blob, tag, gun, sword, mixer, actions, current: 'idle', name: p.name };
    this.views.set(p.id, v);
    return v;
  }

  // players: every player of the game; localId: the one seen in first person (not drawn)
  // pvp: in the arena, names do not show through walls, and a player just back glows gold
  sync(players, localId, dt, pvp = false) {
    const seen = new Set();
    for (const p of players.values()) {
      if (p.id === localId) continue;
      seen.add(p.id);
      const v = this.views.get(p.id) || this.#create(p);
      // the model faces +Z: turn it to the player's yaw (yaw 0 looks towards -Z)
      v.mesh.position.copy(p.pos);
      v.mesh.rotation.y = p.yaw + Math.PI;
      v.blob.position.set(p.pos.x, p.pos.y + 0.03, p.pos.z);
      v.tag.position.set(p.pos.x, p.pos.y + (p.dead ? 0.9 : 2.25), p.pos.z);
      v.tag.material.color.set(p.dead ? 0xff5040 : p.protect > 0 ? 0xffc84a : 0xffffff);
      v.tag.material.depthTest = pvp;
      const sword = p.weaponIndex === 0;
      for (const o of v.gun) o.visible = !sword && !p.dead;
      for (const o of v.sword) o.visible = sword && !p.dead;

      let name = 'idle';
      if (p.dead) name = 'down';
      else if (p.moving) name = sword ? 'run_sword' : p.sprinting ? 'run' : 'walk';
      else if (sword) name = 'idle_sword';
      if (name !== v.current) {
        const next = v.actions[name], prev = v.actions[v.current];
        next.reset().play();
        prev.crossFadeTo(next, 0.2, false);
        v.current = name;
      }
      v.actions[name].setEffectiveTimeScale(name === 'walk' ? 1.3 : 1);
      v.mixer.update(dt);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { this.#remove(v); this.views.delete(id); }
  }

  // events of the other players: their shots and sword swings
  onEvent(ev) {
    const v = this.views.get(ev.pid);
    if (!v) return;
    if (ev.type === 'playerShot') {
      const muzzle = v.mesh.localToWorld(new THREE.Vector3(0.1, 1.26, 0.9));
      ev.points.slice(0, 3).forEach((p) => this.effects.tracer(muzzle, p));
      this.effects.emit(muzzle, new THREE.Vector3(), new THREE.Color(1, 0.75, 0.35), 0.35, 0.06);
    } else if (ev.type === 'swing') {
      v.actions.slash?.reset().play();
    }
  }
}

function makeNameTag(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 34px Rajdhani, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.strokeText(name, 128, 32);
  g.fillStyle = '#f3e6cc';
  g.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.2, 0.3, 1);
  s.renderOrder = 10;
  return s;
}
