import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILES = {
  level: 'models/level.glb',
  props: 'models/props.glb',
  player: 'models/player.glb',
  runner: 'models/runner.glb',
  shooter: 'models/shooter.glb',
  tank: 'models/tank.glb',
  boss: 'models/boss.glb',
  pistol: 'models/pistol.glb',
  rifle: 'models/rifle.glb',
  shotgun: 'models/shotgun.glb',
  sword: 'models/sword.glb',
  mummy: 'models/mummy.glb',
  scarab: 'models/scarab.glb',
};

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const out = { clips: {} }; // clips: animations of each model, by file key
  let done = 0;
  const keys = Object.keys(FILES);
  await Promise.all(keys.map(async (k) => {
    const gltf = await loader.loadAsync(FILES[k]);
    out[k] = gltf.scene;
    out.clips[k] = gltf.animations;
    done++;
    onProgress?.(done / keys.length);
  }));
  return out;
}

// Blender gives duplicate names a ".001" suffix and three.js strips the dot ("ArmR001").
export function baseName(name) {
  return name.replace(/\.?\d{3}$/, '');
}

export function findPart(root, name) {
  let found = null;
  root.traverse((o) => {
    if (!found && baseName(o.name) === name) found = o;
  });
  return found;
}
