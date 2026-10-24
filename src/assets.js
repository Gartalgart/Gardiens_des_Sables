import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// models shared by every universe for now (the map and its props come from the universe)
const FILES = {
  player: 'models/player.glb',
  runner: 'models/runner.glb',
  shooter: 'models/shooter.glb',
  tank: 'models/tank.glb',
  boss: 'models/boss.glb',
  pistol: 'models/pistol.glb',
  rifle: 'models/rifle.glb',
  shotgun: 'models/shotgun.glb',
  sniper: 'models/sniper.glb',
  sword: 'models/sword.glb',
  mummy: 'models/mummy.glb',
  scarab: 'models/scarab.glb',
  grenade: 'models/grenade.glb',
};

// world: the universe (src/worlds/); a map or props file it does not have yet is left null
export async function loadAssets(world, onProgress) {
  const loader = new GLTFLoader();
  const out = { clips: {}, level: null, props: null }; // clips: animations of each model, by file key
  const files = { ...FILES };
  if (world.files.level) files.level = world.files.level;
  if (world.files.props) files.props = world.files.props;
  let done = 0;
  const keys = Object.keys(files);
  await Promise.all(keys.map(async (k) => {
    const gltf = await loader.loadAsync(files[k]);
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
