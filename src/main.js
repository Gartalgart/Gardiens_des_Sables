import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadAssets } from './assets.js';
import { Level } from './sim/level.js';
import { Sim } from './sim/sim.js';
import { DIFFICULTIES } from './sim/difficulty.js';
import { WorldView } from './view/worldView.js';
import { EnemyView, ENEMY_LOOK } from './view/enemyView.js';
import { WeaponView } from './view/weaponView.js';
import { Input } from './input.js';
import { Effects } from './effects.js';
import { Hud, fmtTime } from './hud.js';
import { Sound } from './audio.js';
import { settings, updateSettings, onSettingsChange, DEFAULTS, QUALITY } from './settings.js';

const LOCAL_ID = 'local';

const $ = (id) => document.getElementById(id);
for (const id of ['help-main', 'help-pause']) $(id).appendChild($('help-tpl').content.cloneNode(true));

// ---------- renderer & scenes ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// the moon only shadows the static level (enemies use contact blobs), so render the map once
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 900);
scene.add(camera);

// first-person weapon is drawn in its own pass so it never clips into walls
const vmScene = new THREE.Scene();
vmScene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
vmScene.environmentIntensity = 0.35;
const vmCamera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0x8090c0, 0x2a1a10, 1.6));
const vmKey = new THREE.DirectionalLight(0xffc890, 1.4);
vmKey.position.set(1, 1, 0.5);
vmScene.add(vmKey);
const vmFlash = new THREE.PointLight(0xffb060, 0, 3, 1.5);
vmFlash.position.set(0.1, -0.05, -0.8);
vmScene.add(vmFlash);
// lights the scene for an instant when a mummy blows up (always in the scene: adding lights recompiles shaders)
const blastLight = new THREE.PointLight(0x9dff6a, 0, 18, 1.6);
scene.add(blastLight);
const worldFlash = new THREE.PointLight(0xffb060, 0, 14, 1.6);
camera.add(worldFlash);
worldFlash.position.set(0, 0, -1);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const vmPass = new RenderPass(vmScene, vmCamera);
vmPass.clear = false;
vmPass.clearDepth = true;
composer.addPass(vmPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  for (const c of [camera, vmCamera]) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- loading ----------
const sound = new Sound();
const input = new Input(canvas);

const game = {
  state: 'loading', // loading | menu | playing | paused | over
  sim: null,
  bob: 0,
  difficulty: 'normal',
  get player() { return this.sim?.players.get(LOCAL_ID) ?? null; },
  get enemies() { return this.sim?.enemies ?? null; },
};
window.__game = game; // handy for debugging from the console

const btnPlay = $('btn-play');
const [assets, levelData] = await Promise.all([
  loadAssets((p) => (btnPlay.textContent = `Chargement… ${Math.round(p * 100)}%`)),
  fetch('models/level.json').then((r) => r.json()),
]);
const level = new Level(levelData);
const worldView = new WorldView(scene, assets.level, level);
const effects = new Effects(scene);
const weaponView = new WeaponView(assets, vmScene, effects, worldFlash);
const enemyView = new EnemyView(scene, assets, effects);
const hud = new Hud(level);
Object.assign(game, { level, assets, worldView, weaponView, enemyView, camera, input, renderer, composer, effects });

// ---------- settings ----------
let appliedQuality = null;
function applySettings(s) {
  const Q = QUALITY[s.quality];
  if (appliedQuality !== s.quality) {
    appliedQuality = s.quality;
    const pr = Math.min(devicePixelRatio, Q.pixelRatio);
    renderer.setPixelRatio(pr);
    composer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    const sh = worldView.moon.shadow;
    if (sh.mapSize.x !== Q.shadowSize) {
      sh.mapSize.set(Q.shadowSize, Q.shadowSize);
      sh.map?.dispose();
      sh.map = null;
    }
    bloom.enabled = Q.bloom;
    worldView.setFireLightCount(Q.fireLights);
    effects.density = Q.particles;
    renderer.shadowMap.needsUpdate = true;
  }
  sound.setVolumes(s.volMaster, s.volSfx, s.volMusic);
  $('fps').classList.toggle('hidden', !s.showFps);
}
onSettingsChange(applySettings);

// options screen, reachable from the title screen and the pause menu
const optionInputs = {
  sensitivity: { el: $('o-sens'), out: $('v-sens'), fmt: (v) => `${v.toFixed(2)}×` },
  fov: { el: $('o-fov'), out: $('v-fov'), fmt: (v) => `${v}°` },
  volMaster: { el: $('o-master'), out: $('v-master'), fmt: (v) => `${Math.round(v * 100)} %` },
  volSfx: { el: $('o-sfx'), out: $('v-sfx'), fmt: (v) => `${Math.round(v * 100)} %` },
  volMusic: { el: $('o-music'), out: $('v-music'), fmt: (v) => `${Math.round(v * 100)} %` },
};
function syncOptionsForm() {
  for (const [key, o] of Object.entries(optionInputs)) { o.el.value = settings[key]; o.out.textContent = o.fmt(settings[key]); }
  $('o-invert').checked = settings.invertY;
  $('o-fps').checked = settings.showFps;
  $('o-shake').checked = settings.cameraShake;
  document.querySelectorAll('#o-quality button').forEach((b) => b.classList.toggle('active', b.dataset.q === settings.quality));
}
for (const [key, o] of Object.entries(optionInputs)) {
  o.el.addEventListener('input', () => { updateSettings({ [key]: Number(o.el.value) }); o.out.textContent = o.fmt(settings[key]); });
}
$('o-invert').addEventListener('change', (e) => updateSettings({ invertY: e.target.checked }));
$('o-fps').addEventListener('change', (e) => updateSettings({ showFps: e.target.checked }));
$('o-shake').addEventListener('change', (e) => updateSettings({ cameraShake: e.target.checked }));
document.querySelectorAll('#o-quality button').forEach((b) => b.addEventListener('click', () => { updateSettings({ quality: b.dataset.q }); syncOptionsForm(); }));
$('btn-options-reset').addEventListener('click', () => { updateSettings({ ...DEFAULTS }); syncOptionsForm(); });
let optionsOpen = false;
document.querySelectorAll('.btn-options').forEach((b) => b.addEventListener('click', () => { optionsOpen = true; syncOptionsForm(); refreshScreens(); }));
$('btn-options-back').addEventListener('click', () => { optionsOpen = false; refreshScreens(); });

// difficulty picker on the title screen, remembered between visits
const diffButtons = document.querySelectorAll('#difficulty button');
function pickDifficulty(key) {
  game.difficulty = key;
  diffButtons.forEach((b) => b.classList.toggle('active', b.dataset.diff === key));
  try { localStorage.setItem('gds-difficulty', key); } catch {}
}
diffButtons.forEach((b) => b.addEventListener('click', () => pickDifficulty(b.dataset.diff)));
let savedDiff = 'normal';
try { savedDiff = localStorage.getItem('gds-difficulty') || 'normal'; } catch {}
pickDifficulty(DIFFICULTIES[savedDiff] ? savedDiff : 'normal');

btnPlay.disabled = false;
btnPlay.textContent = 'Jouer';
game.state = 'menu';

// ---------- game flow ----------
// A new simulation per game; the local player is one of its players (alone, for now).
function startGame() {
  game.sim = new Sim(level, { difficulty: game.difficulty, mode: 'waves' });
  game.sim.addPlayer(LOCAL_ID);
  enemyView.clear();
  weaponView.reset();
  worldView.setWeather('clear');
  input.resetLook();
  game.bob = 0;
  game.sim.start();
  handleEvents();
}
game.start = () => startGame();

btnPlay.addEventListener('click', () => {
  sound.init();
  startGame();
  input.lock();
});
$('btn-resume').addEventListener('click', () => input.lock());
$('btn-restart').addEventListener('click', () => { startGame(); input.lock(); });
$('btn-again').addEventListener('click', () => { startGame(); input.lock(); });

// Every button that starts or resumes play requests the pointer lock; the lock is what un-pauses.
input.onLockChange = (locked) => {
  if (locked) {
    game.state = 'playing';
    sound.resume();
  } else if (game.state === 'playing') {
    game.state = 'paused';
    sound.suspend();
  }
  refreshScreens();
};

function refreshScreens() {
  if (game.state === 'playing') optionsOpen = false;
  $('options').classList.toggle('hidden', !optionsOpen);
  $('menu').classList.toggle('hidden', game.state !== 'menu' || optionsOpen);
  $('pause').classList.toggle('hidden', game.state !== 'paused' || optionsOpen);
  $('end').classList.toggle('hidden', game.state !== 'over');
  hud.show(game.state === 'playing' || game.state === 'paused');
}

function endGame(victory) {
  const sim = game.sim, p = game.player;
  game.state = 'over';
  $('end-title').textContent = victory ? 'Victoire' : 'Défaite';
  $('end-sub').textContent = victory
    ? 'La cité-temple retrouve son silence. Les gardiens sont retournés au sable.'
    : `Tombé pendant la vague ${sim.mode.wave}.`;
  const rows = [
    ['Temps', fmtTime(sim.time)],
    ['Difficulté', sim.difficulty.label],
    ['Vague atteinte', `${sim.mode.wave} / ${sim.mode.totalWaves}`],
    ['Ennemis abattus', p.stats.kills],
    ['Tirs à la tête', p.stats.headshots],
    ['Précision', `${p.accuracy} %`],
    ['Dégâts subis', Math.round(p.stats.damageTaken)],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('');
  document.exitPointerLock();
  refreshScreens();
}

// ---------- simulation events -> sound, effects, HUD ----------
const primes = new Map(); // priming mummies: id -> time since the last beep
const _right = new THREE.Vector3();
function pan(pos) {
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  return _right.dot(pos.clone().sub(camera.position).normalize());
}
const vol = (pos, range = 60) => Math.max(0, 1 - pos.distanceTo(camera.position) / range);

// ---------- camera shake: trauma that decays; the shake grows with its square ----------
const shake = { trauma: 0 };
function addShake(amount) { shake.trauma = Math.min(1, shake.trauma + amount); }
const wobble = (x) => Math.sin(x) * 0.6 + Math.sin(x * 2.13 + 1.3) * 0.4;
function applyShake(dt, t) {
  shake.trauma = Math.max(0, shake.trauma - dt * 1.8);
  if (!settings.cameraShake || shake.trauma <= 0) return;
  const s = shake.trauma * shake.trauma;
  camera.rotation.x += 0.05 * s * wobble(t * 31.1);
  camera.rotation.y += 0.05 * s * wobble(t * 27.3 + 7);
  camera.rotation.z += 0.04 * s * wobble(t * 23.7 + 3);
}

// golden sparks where the blade meets the blow, just in front of the camera
const _fwd = new THREE.Vector3(), _down = new THREE.Vector3();
function parrySparks(count) {
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _down.set(0, -1, 0).applyQuaternion(camera.quaternion);
  const pos = camera.position.clone().addScaledVector(_fwd, 0.8).addScaledVector(_down, 0.12);
  effects.burst(pos, _fwd.clone().negate(), { count, color: new THREE.Color(1, 0.78, 0.35), speed: 4.5, size: 0.035, life: 0.32, grav: 5 });
}

const SHOT_SHAKE = { pistol: 0.12, rifle: 0.05, shotgun: 0.35 };

function handleEvents() {
  const sim = game.sim;
  let hit = null;
  for (const ev of sim.drainEvents()) {
    const mine = ev.pid === LOCAL_ID;
    switch (ev.type) {
      case 'playerShot':
        if (mine) { sound.shot(ev.weapon); weaponView.onShot(ev, camera); addShake(SHOT_SHAKE[ev.weapon] ?? 0); }
        break;
      case 'impactWall': effects.impactWall(ev.point, ev.normal); break;
      case 'impactEnemy': effects.impactEnemy(ev.point, ev.normal, ENEMY_LOOK[ev.enemyType].color); break;
      case 'hitConfirm':
        // several pellets or shots in one frame make a single hit marker
        if (mine) { hit = hit || { head: false }; hit.head ||= ev.head; }
        break;
      case 'meleeImpact':
        effects.impactEnemy(ev.point, ev.normal, ENEMY_LOOK[ev.enemyType].color);
        effects.burst(ev.point, ev.fwd, { count: 18, color: new THREE.Color(1, 0.8, 0.5), speed: 7, size: 0.07, life: 0.25 });
        break;
      case 'swing': if (mine) sound.swoosh(); break;
      case 'slash': if (mine) { sound.slash(ev.hits); hud.hit(false); weaponView.onSlashHit(); } break;
      case 'reload': if (mine) sound.reload(ev.duration); break;
      case 'dry': if (mine) sound.dry(); break;
      case 'switch': if (mine) sound.click(0.7); break;
      case 'kick': if (mine) input.addPitch(ev.pitch); break;
      case 'step': if (mine) sound.step(ev.sprint); break;
      case 'reflectHit': if (mine) { hud.hit(false); sound.hit(false); } break;
      case 'blocked': if (mine) { sound.clang(); weaponView.onBlocked(); parrySparks(14); addShake(0.2); } break;
      case 'perfectParry':
        if (mine) { sound.perfect(); weaponView.onBlocked(); parrySparks(40); hud.perfectParry(); addShake(0.45); }
        break;
      case 'playerHurt':
        if (mine) {
          sound.hurt();
          addShake(Math.min(0.6, ev.amount / 35));
          const p = game.player;
          const dx = ev.from.x - p.pos.x, dz = ev.from.z - p.pos.z;
          const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
          hud.hurt(Math.atan2(dx * c - dz * s, -(dx * s + dz * c)));
        }
        break;
      case 'pickup':
        if (mine) { hud.pickup(ev.kind === 'ammo' ? '+ MUNITIONS' : '+ 35 SANTÉ'); sound.pickup(); }
        break;
      case 'enemyKill':
        enemyView.onEvent(ev);
        sound.crumble(0, Math.max(0.15, vol(ev.pos, 50)), ev.enemyType === 'tank' || ev.enemyType === 'boss');
        if (ev.enemyType === 'tank' || ev.enemyType === 'boss') addShake(0.3 * vol(ev.pos, 25));
        break;
      case 'slam': enemyView.onEvent(ev); sound.crumble(0, 1, true); addShake(0.6 * vol(ev.pos, 25)); break;
      case 'wallStun': enemyView.onEvent(ev); sound.crumble(pan(ev.pos), vol(ev.pos), true); addShake(0.5 * vol(ev.pos, 20)); break;
      case 'reflect':
        enemyView.onEvent(ev);
        if (mine && ev.perfect) { sound.perfect(); parrySparks(30); hud.perfectParry(); addShake(0.3); }
        else if (mine) { sound.clang(); parrySparks(12); addShake(0.12); }
        else sound.clang();
        break;
      case 'growl': sound.growl(pan(ev.pos), ev.loud ? 1 : vol(ev.pos), ev.low); break;
      case 'enemyFire': sound.enemyFire(pan(ev.pos), vol(ev.pos)); break;
      case 'enemySpawn': case 'enemyHit': case 'ring': case 'projectileEnd':
        enemyView.onEvent(ev);
        break;
      case 'prime': primes.set(ev.id, 0); break;
      case 'explosion':
        enemyView.onEvent(ev);
        primes.clear();
        sound.explosion(pan(ev.pos), Math.max(0.3, vol(ev.pos, 70)));
        addShake(0.8 * vol(ev.pos, 22));
        blastLight.position.copy(ev.pos);
        blastLight.intensity = 120;
        break;
      case 'rainMark': enemyView.onEvent(ev); break;
      case 'rainStrike':
        enemyView.onEvent(ev);
        sound.crumble(pan(ev.pos), vol(ev.pos, 40), true);
        addShake(0.35 * vol(ev.pos, 12));
        break;
      case 'teleportOut': case 'teleportIn': enemyView.onEvent(ev); sound.warp(pan(ev.pos), vol(ev.pos, 70)); break;
      case 'bossPhase2': enemyView.onEvent(ev); addShake(0.5); break;
      case 'weather': worldView.setWeather(ev.kind); sound.setStorm(ev.kind === 'sandstorm' ? 1 : 0); break;
      case 'banner': hud.banner(ev.title, ev.sub, ev.duration); break;
      case 'horn': sound.horn(ev.victory); break;
      case 'unlock': sound.pickup(); break;
      case 'gameOver': endGame(ev.victory); break;
    }
  }
  if (hit) { hud.hit(hit.head); sound.hit(hit.head); }
}

// ---------- loop ----------
const timer = new THREE.Timer();
timer.connect(document);
let menuAngle = 0;
const fpsMeter = { frames: 0, time: 0 };

function frame(ts) {
  timer.update(ts);
  fpsMeter.frames++;
  fpsMeter.time += timer.getDelta();
  if (fpsMeter.time >= 0.5) {
    if (settings.showFps) $('fps').textContent = `${Math.round(fpsMeter.frames / fpsMeter.time)} FPS`;
    fpsMeter.frames = 0;
    fpsMeter.time = 0;
  }
  tick(Math.min(timer.getDelta(), 0.05), timer.getElapsed());
  requestAnimationFrame(frame);
}

// One frame of the game: simulation step, views, render. Also driven by hand from tests
// (window.__game.tick), since a hidden browser window throttles requestAnimationFrame.
let tickClock = 0;
function tick(dt, now = (tickClock += dt)) {
  worldView.update(now, dt, camera.position);
  const sim = game.sim;
  if (game.state === 'playing') {
    const p = game.player;
    const lo = p.loadout;
    const aiming = lo.adsT > 0.5;
    const cmd = input.buildCommand(lo.current.def.melee ? 1 : 1 - lo.adsT * 0.45);
    sim.step(dt, new Map([[LOCAL_ID, cmd]]));

    // camera: the player's eye with a walking bob, plus the recoil the simulation applied
    const hv = Math.hypot(p.vel.x, p.vel.z);
    if (p.moving) game.bob += hv * dt * 1.6;
    const bobY = p.moving ? Math.sin(game.bob * 2) * 0.035 * (aiming ? 0.15 : 1) : 0;
    camera.position.set(p.pos.x, p.eyeY + bobY, p.pos.z);
    camera.rotation.set(p.pitch + p.recoil.pitch, p.yaw + p.recoil.yaw, 0, 'YXZ');
    applyShake(dt, now);
    camera.updateMatrixWorld();

    handleEvents();
    weaponView.update(dt, lo, p, input, game.bob);

    const def = lo.current.def;
    // ADS zoom is relative to the chosen field of view
    const fov = settings.fov * THREE.MathUtils.lerp(1, def.adsFov / 75, lo.adsT) + (p.sprinting ? 6 : 0);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 14); camera.updateProjectionMatrix(); }

    // debris and poses slow down with the sword hit-stop and the parry slow motion, like the enemies
    const viewDt = dt * sim.timeScale;
    enemyView.sync(sim.enemies, viewDt, sim.time);

    // priming mummies beep faster and faster until they blow up
    for (const [id, t] of primes) {
      const e = sim.enemies.list.find((x) => x.id === id);
      if (!e || e.act?.kind !== 'prime') { primes.delete(id); continue; }
      const p = e.act.t / e.act.dur;
      if (t + viewDt > 0.25 - p * 0.18) { sound.beep(pan(e.pos), Math.max(0.2, vol(e.pos, 40)), 1 + p); primes.set(id, 0); }
      else primes.set(id, t + viewDt);
    }
    blastLight.intensity *= Math.exp(-dt * 7);

    hud.update(dt, {
      wave: Math.max(1, sim.mode.wave),
      time: sim.time,
      enemiesLeft: sim.mode.enemiesLeft,
      health: p.health,
      weapon: lo.current,
      weaponIndex: lo.index,
      unlocked: lo.items.map((w) => w.unlocked),
      reloading: lo.reloading > 0,
      spread: THREE.MathUtils.lerp(def.spread, def.adsSpread, lo.adsT) + (p.moving ? 0.012 : 0),
      ads: lo.adsT,
      boss: sim.enemies.boss,
    });
    hud.drawMinimap(p, sim.enemies);
  } else if (game.state === 'menu') {
    if (Math.abs(camera.fov - settings.fov) > 0.01) { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
    // slow fly-around of the temple city behind the title screen
    menuAngle += dt * 0.05;
    camera.position.set(Math.sin(menuAngle) * 34, 13, Math.cos(menuAngle) * 34 - 4);
    camera.lookAt(0, 3, 12);
  }

  effects.update(game.state === 'paused' ? 0 : dt);
  vmScene.visible = game.state === 'playing' || game.state === 'paused';
  vmFlash.intensity = worldFlash.intensity * 0.15;
  composer.render();
  input.endFrame();
}
game.tick = tick;

refreshScreens();
frame();
