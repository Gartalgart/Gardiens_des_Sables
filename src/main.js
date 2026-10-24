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
import { PropsView } from './view/propsView.js';
import { PlayerView } from './view/playerView.js';
import { GrenadeView } from './view/grenadeView.js';
import { KegView } from './view/kegView.js';
import { multiKillName, spreeName } from './medals.js';
import { NetSession, defaultServer } from './net/session.js';
import { MULTIPLAYER } from './features.js';
import { emptyCommand } from './sim/player.js';
import { WorldView } from './view/worldView.js';
import { EnemyView, ENEMY_LOOK } from './view/enemyView.js';
import { WeaponView } from './view/weaponView.js';
import { Input } from './input.js';
import { Effects } from './effects.js';
import { Hud, fmtTime } from './hud.js';
import { Sound } from './audio.js';
import { settings, updateSettings, onSettingsChange, DEFAULTS, QUALITY } from './settings.js';
import { topScores, recordScore } from './leaderboard.js';
import { upgradeInfo } from './sim/progression.js';
import { WORLDS, getWorld } from './worlds/index.js';

const SOLO_ID = 'local';

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

// the composer renders off-screen, where the canvas' antialias does not apply: multisample its targets instead
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
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
  mode: 'waves',
  localId: SOLO_ID, // the server's id for this client in co-op
  net: null, // the NetSession while a co-op game runs
  get player() { return this.sim?.players.get(this.localId) ?? null; },
  get enemies() { return this.sim?.enemies ?? null; },
};
window.__game = game; // handy for debugging from the console

// ---------- universe ----------
// The universe is picked on the title screen and loaded with the page: changing it reloads.
let savedWorld = null;
try { savedWorld = localStorage.getItem('gds-world'); } catch {}
const world = getWorld(savedWorld);
game.world = world;
$('menu-title').innerHTML = `${world.title[0]}<br /><span>${world.title[1]}</span>`;
$('menu-lede').textContent = world.lede;
document.title = world.name;
$('world').innerHTML = Object.values(WORLDS).map((w) => `<button data-world="${w.id}" class="${w === world ? 'active' : ''}">${w.name}</button>`).join('');
$('world').addEventListener('click', (e) => {
  const id = e.target.closest('button[data-world]')?.dataset.world;
  if (!id || id === world.id) return;
  try { localStorage.setItem('gds-world', id); } catch {}
  location.reload();
});

const btnPlay = $('btn-play');
const [assets, levelData] = await Promise.all([
  loadAssets(world, (p) => (btnPlay.textContent = `Chargement… ${Math.round(p * 100)}%`)),
  fetch(world.files.levelData).then((r) => r.json()),
]);
const level = new Level(levelData);
const worldView = new WorldView(scene, assets.level, level, world.ambiance);
const propsView = assets.props ? new PropsView(scene, assets.props, level, world.props) : null;
const effects = new Effects(scene);
const weaponView = new WeaponView(assets, vmScene, effects, worldFlash, world.weapons);
const enemyView = new EnemyView(scene, assets, effects);
const playerView = new PlayerView(scene, assets, effects);
const grenadeView = new GrenadeView(scene, assets, effects);
const kegView = new KegView(scene);
sound.setSurf(!!world.ambiance.surf);
const hud = new Hud(level, world.texts.bossName);
Object.assign(game, { level, assets, worldView, propsView, playerView, weaponView, enemyView, camera, input, renderer, composer, effects, hud });

// ---------- settings ----------
let appliedQuality = null;
function applySettings(s) {
  const Q = QUALITY[s.quality];
  if (appliedQuality !== s.quality) {
    appliedQuality = s.quality;
    const pr = Math.min(devicePixelRatio, Q.pixelRatio);
    renderer.setPixelRatio(pr);
    composer.setPixelRatio(pr);
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) { rt.samples = Q.msaa; rt.dispose(); }
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
  $('health-num').classList.toggle('hidden', !s.showHealthNum);
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
  $('o-hpnum').checked = settings.showHealthNum;
  $('o-shake').checked = settings.cameraShake;
  $('o-name').value = settings.playerName;
  document.querySelectorAll('#o-quality button').forEach((b) => b.classList.toggle('active', b.dataset.q === settings.quality));
}
for (const [key, o] of Object.entries(optionInputs)) {
  o.el.addEventListener('input', () => { updateSettings({ [key]: Number(o.el.value) }); o.out.textContent = o.fmt(settings[key]); });
}
$('o-invert').addEventListener('change', (e) => updateSettings({ invertY: e.target.checked }));
$('o-fps').addEventListener('change', (e) => updateSettings({ showFps: e.target.checked }));
$('o-hpnum').addEventListener('change', (e) => updateSettings({ showHealthNum: e.target.checked }));
$('o-shake').addEventListener('change', (e) => updateSettings({ cameraShake: e.target.checked }));
$('o-name').addEventListener('input', (e) => updateSettings({ playerName: e.target.value.trim().slice(0, 16) || 'Joueur' }));
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

// game mode picker: the five waves, or endless survival
const modeButtons = document.querySelectorAll('#mode button');
function pickMode(key) {
  game.mode = key;
  modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === key));
  try { localStorage.setItem('gds-mode', key); } catch {}
}
modeButtons.forEach((b) => b.addEventListener('click', () => pickMode(b.dataset.mode)));
let savedMode = 'waves';
try { savedMode = localStorage.getItem('gds-mode') || 'waves'; } catch {}
pickMode(['survival', 'sandbox'].includes(savedMode) ? savedMode : 'waves');

// ---------- leaderboard ----------
const MODE_LABEL = { waves: 'Vagues', survival: 'Survie' };
function boardTable(mode, difficulty, highlight = -1) {
  const rows = topScores(world.id, mode, difficulty);
  if (!rows.length) return '<table class="board"><tr><td class="empty">Aucun score pour l\'instant.</td></tr></table>';
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<table class="board"><tr><th>#</th><th>Pseudo</th><th class="num">Score</th><th class="num">Vague</th><th class="num">Temps</th></tr>${
    rows.map((r, i) => `<tr class="${i === highlight ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.score.toLocaleString('fr-FR')}</td><td class="num">${r.wave}</td><td class="num">${fmtTime(r.time)}</td></tr>`).join('')
  }</table>`;
}
const board = { mode: 'waves', difficulty: 'normal' };
function refreshBoard() {
  document.querySelectorAll('#board-mode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === board.mode));
  document.querySelectorAll('#board-diff button').forEach((b) => b.classList.toggle('active', b.dataset.diff === board.difficulty));
  $('board-table').innerHTML = boardTable(board.mode, board.difficulty);
}
document.querySelectorAll('#board-mode button').forEach((b) => b.addEventListener('click', () => { board.mode = b.dataset.mode; refreshBoard(); }));
document.querySelectorAll('#board-diff button').forEach((b) => b.addEventListener('click', () => { board.difficulty = b.dataset.diff; refreshBoard(); }));
let boardOpen = false;
$('btn-board').addEventListener('click', () => { boardOpen = true; board.mode = game.mode; board.difficulty = game.difficulty; refreshBoard(); refreshScreens(); });
$('btn-board-back').addEventListener('click', () => { boardOpen = false; refreshScreens(); });

// ---------- co-op: connection, rooms and lobby ----------
// Hidden unless built in multiplayer mode (src/features.js); the code stays wired up.
// The server only knows the desert's map, so the other universes are solo only.
if (!MULTIPLAYER || world.id !== 'sables') document.querySelectorAll('.mp-only').forEach((el) => el.classList.add('hidden'));
const net = new NetSession(level);
let coopScreen = null; // null, 'coop' (connect / join) or 'lobby'
let configureOnJoin = false;
try { $('c-server').value = localStorage.getItem('gds-server') || defaultServer(); } catch { $('c-server').value = defaultServer(); }
function coopStatus(id, text, ok = false) {
  $(id).textContent = text;
  $(id).classList.toggle('ok', ok);
}
async function connectCoop() {
  if (net.connected) return true;
  const address = $('c-server').value.trim() || defaultServer();
  try { localStorage.setItem('gds-server', address); } catch {}
  coopStatus('coop-status', 'Connexion…', true);
  try {
    await net.connect(address, settings.playerName);
    coopStatus('coop-status', '');
    return true;
  } catch (e) {
    coopStatus('coop-status', `${e.message}. Le serveur est-il lancé (npm run server) ?`);
    return false;
  }
}
function renderLobby(room) {
  $('lobby-code').textContent = room.code;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('lobby-players').innerHTML = room.players.map((p) =>
    `<li class="${p.id === net.id ? 'me' : ''}">${esc(p.name)}${p.id === room.host ? '<span class="tag">HÔTE</span>' : ''}</li>`).join('');
  const host = net.isHost;
  document.querySelectorAll('#lobby-mode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === room.mode));
  document.querySelectorAll('#lobby-diff button').forEach((b) => b.classList.toggle('active', b.dataset.diff === room.difficulty));
  document.querySelectorAll('#lobby-score button').forEach((b) => b.classList.toggle('active', Number(b.dataset.score) === room.arena?.scoreLimit));
  document.querySelectorAll('#lobby-time button').forEach((b) => b.classList.toggle('active', Number(b.dataset.time) === room.arena?.timeLimit));
  $('lobby-arena').classList.toggle('hidden', room.mode !== 'arena');
  $('lobby-mode-help').textContent = MODE_HELP[room.mode] ?? '';
  for (const id of ['lobby-mode', 'lobby-diff', 'lobby-score', 'lobby-time']) $(id).classList.toggle('locked', !host);
  $('btn-lobby-start').classList.toggle('hidden', !host);
  $('lobby-sub').textContent = room.playing ? 'Une partie est en cours dans ce salon.'
    : host ? `Donne ce code aux autres joueurs (${room.players.length}/4).` : 'En attente du lancement par l\'hôte…';
}
const MODE_NAMES = { waves: 'Vagues', survival: 'Survie', arena: 'Arène' };
const DIFF_NAMES = { easy: 'facile', normal: 'normal', hard: 'difficile' };
function renderOpenRooms(list) {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('coop-rooms').innerHTML = list.length
    ? list.map((r) => `<li><span class="code">${r.code}</span><span class="info">${esc(r.host ?? '')} · ${r.players}/4 · ${MODE_NAMES[r.mode] ?? r.mode}, ${DIFF_NAMES[r.difficulty] ?? r.difficulty}</span><button class="secondary" data-code="${r.code}">Rejoindre</button></li>`).join('')
    : `<li class="empty">${net.connected ? "Aucun salon ouvert pour l'instant." : 'Pas encore connecté au serveur.'}</li>`;
}
$('coop-rooms').addEventListener('click', async (e) => {
  const code = e.target.closest('button[data-code]')?.dataset.code;
  if (code && (await connectCoop())) net.join(code);
});
net.on.rooms = renderOpenRooms;
// opening the co-op screen connects at once, so the open rooms show up without a click
$('btn-coop').addEventListener('click', async () => {
  sound.init();
  coopScreen = net.room ? 'lobby' : 'coop';
  refreshScreens();
  if (coopScreen === 'coop') { renderOpenRooms(net.openRooms); await connectCoop(); }
});
$('c-server').addEventListener('change', async () => { net.close(); renderOpenRooms([]); await connectCoop(); });
$('btn-coop-back').addEventListener('click', () => { coopScreen = null; net.close(); refreshScreens(); });
$('btn-coop-create').addEventListener('click', async () => {
  if (!(await connectCoop())) return;
  configureOnJoin = true;
  net.create();
});
$('btn-coop-join').addEventListener('click', async () => {
  const code = $('c-code').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return coopStatus('coop-status', 'Le code d\'un salon a 4 lettres.');
  if (await connectCoop()) net.join(code);
});
const MODE_HELP = world.texts.modes;
const configure = (change) => { const r = net.room; net.configure(change.mode ?? r.mode, change.difficulty ?? r.difficulty, { ...r.arena, ...change.arena }); };
document.querySelectorAll('#lobby-mode button').forEach((b) => b.addEventListener('click', () => configure({ mode: b.dataset.mode })));
document.querySelectorAll('#lobby-diff button').forEach((b) => b.addEventListener('click', () => configure({ difficulty: b.dataset.diff })));
document.querySelectorAll('#lobby-score button').forEach((b) => b.addEventListener('click', () => configure({ arena: { scoreLimit: Number(b.dataset.score) } })));
document.querySelectorAll('#lobby-time button').forEach((b) => b.addEventListener('click', () => configure({ arena: { timeLimit: Number(b.dataset.time) } })));
$('btn-lobby-start').addEventListener('click', () => net.start());
$('btn-lobby-leave').addEventListener('click', () => { net.leave(); coopScreen = 'coop'; refreshScreens(); });
net.on.error = (msg) => coopStatus(coopScreen === 'lobby' ? 'lobby-status' : 'coop-status', msg);
net.on.room = (room) => {
  // the host's room starts with the mode and difficulty picked on the title screen
  if (configureOnJoin && net.isHost) { configureOnJoin = false; net.configure(game.mode, game.difficulty); }
  renderLobby(room);
  if (game.state === 'menu' && coopScreen) { coopScreen = 'lobby'; coopStatus('lobby-status', ''); refreshScreens(); }
};
net.on.start = () => {
  game.net = net;
  game.sim = net;
  game.localId = net.id;
  coopScreen = null;
  resetViews();
  // the pointer lock needs a click: the pause screen asks for one if this one is refused
  game.state = 'paused';
  input.lock();
  refreshScreens();
};
net.on.close = () => {
  const inGame = !!game.net;
  net.openRooms = [];
  renderOpenRooms([]);
  quitCoopGame();
  coopScreen = 'coop';
  refreshScreens();
  coopStatus('coop-status', inGame ? 'Connexion au serveur perdue.' : 'Déconnecté du serveur.');
};
// back to the title screen from a co-op game (the room is left)
function quitCoopGame() {
  if (net.room) net.leave();
  if (game.net) { game.net = null; game.sim = null; resetViews(); }
  game.localId = SOLO_ID;
  if (game.state !== 'menu') { game.state = 'menu'; if (document.pointerLockElement) document.exitPointerLock(); }
}
function leaveCoop() {
  if (net.room) net.leave();
  game.net = null;
}

btnPlay.disabled = false;
btnPlay.textContent = 'Jouer';
game.state = 'menu';

// ---------- game flow ----------
// A new simulation per game; the local player is one of its players (alone, for now).
function startGame() {
  leaveCoop();
  game.localId = SOLO_ID;
  game.sim = new Sim(level, { difficulty: game.difficulty, mode: game.mode, world: world.id });
  game.sim.addPlayer(SOLO_ID);
  resetViews();
  game.sim.start();
  handleEvents();
}
game.start = () => startGame();

// the siren's charm off: no blur, no haze, no song
function clearCharm() {
  game.shownCharm = 0;
  canvas.style.filter = '';
  $('charm').style.opacity = 0;
  sound.setSong(0);
}

function resetViews() {
  clearCharm();
  enemyView.clear();
  playerView.clear();
  hud.team([]);
  hud.prompt(null);
  hud.downed(null);
  hud.clearKillfeed();
  hud.clearPoints();
  grenadeView.clear();
  hud.scoreboard(null);
  lastShots.clear();
  weaponView.reset();
  worldView.setWeather('clear');
  input.resetLook();
  game.bob = 0;
}

btnPlay.addEventListener('click', () => {
  sound.init();
  startGame();
  input.lock();
});
$('btn-resume').addEventListener('click', () => input.lock());
$('btn-restart').addEventListener('click', () => {
  if (game.net) { quitCoopGame(); coopScreen = null; refreshScreens(); return; } // "Quitter la partie"
  startGame(); input.lock();
});
$('btn-again').addEventListener('click', () => {
  if (game.net) {
    // "Retour au salon": the host can start another game
    game.net = null; game.sim = null; resetViews();
    game.state = 'menu'; coopScreen = 'lobby';
    if (net.room) renderLobby(net.room);
    refreshScreens();
    return;
  }
  startGame(); input.lock();
});
$('btn-menu').addEventListener('click', () => { if (game.net) quitCoopGame(); coopScreen = null; game.state = 'menu'; refreshScreens(); });

// Every button that starts or resumes play requests the pointer lock; the lock is what un-pauses.
input.onLockChange = (locked) => {
  if (locked) {
    game.state = 'playing';
    sound.resume();
  } else if (game.state === 'playing') {
    game.state = 'paused';
    if (!game.net) sound.suspend(); // co-op: the game goes on, and so does its sound
  }
  refreshScreens();
};

function refreshScreens() {
  if (game.state === 'playing') optionsOpen = false;
  if (game.state !== 'menu') boardOpen = false;
  $('options').classList.toggle('hidden', !optionsOpen);
  $('board').classList.toggle('hidden', !boardOpen);
  $('menu').classList.toggle('hidden', game.state !== 'menu' || optionsOpen || boardOpen || !!coopScreen);
  $('coop').classList.toggle('hidden', game.state !== 'menu' || optionsOpen || coopScreen !== 'coop');
  $('lobby').classList.toggle('hidden', game.state !== 'menu' || optionsOpen || coopScreen !== 'lobby');
  $('pause').classList.toggle('hidden', game.state !== 'paused' || optionsOpen);
  // co-op: the world goes on during the pause, and a game cannot be restarted alone
  $('pause').querySelector('h2').textContent = game.net ? 'Partie en cours' : 'Pause';
  $('btn-resume').textContent = game.net ? 'Jouer' : 'Reprendre';
  $('btn-restart').textContent = game.net ? 'Quitter la partie' : 'Recommencer';
  $('end').classList.toggle('hidden', game.state !== 'over');
  hud.show(game.state === 'playing' || game.state === 'paused');
}

function endGame(victory, winner) {
  const sim = game.sim, p = game.player;
  game.state = 'over';
  if (sim.mode.pvp) return endArena(winner);
  const survival = sim.mode.id === 'survival';
  $('end-title').textContent = survival ? 'Fin de la survie' : victory ? 'Victoire' : 'Défaite';
  $('end-sub').textContent = survival
    ? `Tu as tenu jusqu'à la vague ${sim.mode.wave}.`
    : victory ? world.texts.victory
      : `Tombé pendant la vague ${sim.mode.wave}.`;
  // score and local leaderboard
  const rank = recordScore(world.id, sim.mode.id, sim.difficulty.key, { name: settings.playerName + (game.net ? ' (coop)' : ''), score: p.score, wave: sim.mode.wave, time: sim.time });
  $('btn-again').textContent = game.net ? 'Retour au salon' : 'Rejouer';
  $('end-score').innerHTML = `${p.score.toLocaleString('fr-FR')} pts${rank === 0 ? '<small>NOUVEAU RECORD !</small>' : rank > 0 ? `<small>${rank + 1}e du classement</small>` : ''}`;
  $('end-board').innerHTML = `<div class="label" style="margin-bottom:6px">CLASSEMENT — ${MODE_LABEL[sim.mode.id]} · ${sim.difficulty.label}</div>${boardTable(sim.mode.id, sim.difficulty.key, rank)}`;
  const cards = Object.entries(p.upgrades).map(([id, n]) => upgradeInfo(id).name + (n > 1 ? ' ×2' : '')).join(', ') || '—';
  const rows = [
    ['Temps', fmtTime(sim.time)],
    ['Mode', `${MODE_LABEL[sim.mode.id]} · ${sim.difficulty.label}`],
    ['Vague atteinte', Number.isFinite(sim.mode.totalWaves) ? `${sim.mode.wave} / ${sim.mode.totalWaves}` : sim.mode.wave],
    ['Améliorations', cards],
    ['Ennemis abattus', p.stats.kills],
    ['Tirs à la tête', p.stats.headshots],
    ['Précision', `${p.accuracy} %`],
    ['Dégâts subis', Math.round(p.stats.damageTaken)],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('');
  document.exitPointerLock();
  refreshScreens();
}

// the arena's end: the match ranking instead of the local leaderboard
function endArena(winnerId) {
  const sim = game.sim, p = game.player;
  const ranked = arenaRanking();
  const best = sim.players.get(winnerId) ?? ranked[0];
  const won = winnerId === game.localId;
  $('end-title').textContent = won ? 'Victoire' : 'Défaite';
  $('end-sub').textContent = won ? 'Tu règnes sur l\'arène.'
    : `${best?.name ?? 'Un adversaire'} remporte l'arène avec ${best?.stats.frags ?? 0} éliminations.`;
  $('btn-again').textContent = 'Retour au salon';
  $('end-score').innerHTML = `${p.stats.frags} élimination${p.stats.frags > 1 ? 's' : ''}<small>${ranked.indexOf(p) + 1}${ranked.indexOf(p) === 0 ? 'er' : 'e'} sur ${ranked.length}</small>`;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('end-board').innerHTML = `<div class="label" style="margin-bottom:6px">CLASSEMENT DE LA PARTIE</div><table class="board"><tr><th>#</th><th>Joueur</th><th class="num">Élim.</th><th class="num">Morts</th><th class="num">Gardiens</th></tr>${
    ranked.map((o, i) => `<tr class="${o === p ? 'me' : ''}"><td>${i + 1}</td><td>${esc(o.name)}</td><td class="num">${o.stats.frags}</td><td class="num">${o.stats.deaths}</td><td class="num">${o.stats.kills}</td></tr>`).join('')}</table>`;
  const rows = [
    ['Temps', fmtTime(sim.mode.timeLimit - sim.mode.timeLeft)],
    ['Mode', `Arène · ${sim.mode.scoreLimit} éliminations`],
    ['Éliminations', p.stats.frags],
    ['Morts', p.stats.deaths],
    ['Gardiens abattus', p.stats.kills],
    ['Précision', `${p.accuracy} %`],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('');
  document.exitPointerLock();
  refreshScreens();
}

// best first: more kills, then fewer deaths (as the server's ArenaMode.ranking)
function arenaRanking() {
  return [...game.sim.players.values()].sort((a, b) => b.stats.frags - a.stats.frags || a.stats.deaths - b.stats.deaths);
}

// the arena's minimap shows an opponent for 2 s after each shot
const lastShots = new Map(); // player id -> seconds since their last shot

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

const SHOT_SHAKE = { pistol: 0.12, rifle: 0.05, shotgun: 0.35, sniper: 0.3, flintlock: 0.25, blunderbuss: 0.45, cannon: 0.7, musket: 0.3 };
const PLAYER_HIT_COLOR = new THREE.Color(0.75, 0.15, 0.1);
const nameOf = (id) => String(game.sim?.players.get(id)?.name ?? 'Un allié').toUpperCase();

function handleEvents() {
  const sim = game.sim;
  let hit = null;
  let multi = 0, spree = 0; // the best medals of this frame: a grenade can take several kills at once
  let headshotKill = false;
  for (const ev of sim.drainEvents()) {
    const mine = ev.pid === game.localId;
    switch (ev.type) {
      case 'playerShot':
        if (mine) {
          sound.shot(ev.weapon); weaponView.onShot(ev, camera); addShake(SHOT_SHAKE[ev.weapon] ?? 0);
          if (ev.weapon === 'shotgun') sound.pump(0.13);
          else if (ev.weapon === 'sniper') sound.bolt(0.28);
        }
        else { playerView.onEvent(ev); sound.shot(ev.weapon, pan(ev.origin), 0.6 * Math.max(0.1, vol(ev.origin, 90))); lastShots.set(ev.pid, 0); }
        break;
      case 'impactPlayer': effects.impactEnemy(ev.point, ev.normal, PLAYER_HIT_COLOR); break;
      case 'grenadeThrow': if (mine) sound.throw(); break;
      case 'grenadeBounce': sound.thud(pan(ev.pos), Math.min(1, ev.speed / 12) * vol(ev.pos, 40)); break;
      case 'points': if (mine) hud.points(ev.amount, ev.label); break;
      case 'headshotKill': if (mine) headshotKill = true; break;
      case 'multikill': if (mine) multi = Math.max(multi, ev.count); break;
      case 'spree': if (mine) spree = Math.max(spree, ev.count); break;
      case 'frag': {
        const killer = ev.by ? sim.players.get(ev.by)?.name ?? '?' : null;
        hud.frag(killer, sim.players.get(ev.pid)?.name ?? '?', ev.weapon, ev.head, mine || ev.by === game.localId);
        if (ev.by === game.localId) { hud.pickup(`${nameOf(ev.pid)} ÉLIMINÉ${ev.head ? ' — TÊTE' : ''}`); sound.horn(true); }
        break;
      }
      case 'respawn':
        if (mine) { input.setLook(ev.yaw, 0); hud.pickup('DE RETOUR DANS L\'ARÈNE'); sound.pickup(); }
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
      case 'swing': if (mine) sound.swoosh(); else playerView.onEvent(ev); break;
      case 'slash': if (mine) { sound.slash(ev.hits); hud.hit(false); weaponView.onSlashHit(); } break;
      case 'reload': if (mine) sound.reload(ev.duration, ev.weapon); break;
      case 'shell': if (mine) { sound.shell(); if (ev.left === 0) sound.pump(0.2); } break;
      case 'dry': if (mine) sound.dry(); break;
      case 'switch': if (mine) sound.weaponSwitch(); break;
      case 'kick': if (mine) input.addPitch(ev.pitch); break;
      case 'step': if (mine) sound.step(ev.sprint, ev.land, ev.water); break;
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
        sound.kill(0, Math.max(0.15, vol(ev.pos, 50)), ev.enemyType);
        if (world.enemies[ev.enemyType]?.big) addShake(0.3 * vol(ev.pos, 25));
        break;
      case 'slam': enemyView.onEvent(ev); sound.slam(0, 1); addShake(0.6 * vol(ev.pos, 25)); break;
      case 'wallStun': enemyView.onEvent(ev); sound.slam(pan(ev.pos), vol(ev.pos)); addShake(0.5 * vol(ev.pos, 20)); break;
      case 'reflect':
        enemyView.onEvent(ev);
        if (mine && ev.perfect) { sound.perfect(); parrySparks(30); hud.perfectParry(); addShake(0.3); }
        else if (mine) { sound.clang(); parrySparks(12); addShake(0.12); }
        else sound.clang();
        break;
      case 'growl': sound.growl(pan(ev.pos), ev.loud ? 1 : vol(ev.pos), ev.low, ev.enemyType); break;
      case 'enemyFire':
        // the ghost gunner's swivel gun booms like the hand cannon, further off
        if (world.enemies[ev.enemyType]?.ranged?.lob) sound.shot('cannon', pan(ev.pos), 0.7 * Math.max(0.2, vol(ev.pos, 80)));
        else sound.enemyFire(pan(ev.pos), vol(ev.pos));
        break;
      case 'enemyHit':
        enemyView.onEvent(ev);
        if (ev.armored) sound.clang();
        break;
      case 'enemySpawn': case 'ring': case 'projectileEnd':
        enemyView.onEvent(ev);
        break;
      case 'prime': primes.set(ev.id, 0); break;
      case 'song': if (ev.on) sound.growl(pan(ev.pos), vol(ev.pos, 50), false, 'siren'); break;
      case 'explosion':
        // fire pots, cannon balls and powder kegs burst into flames; a mummy's blast is green
        if (ev.kind === 'grenade' || ev.kind === 'keg' || ev.kind === 'ball') grenadeView.explode(ev.pos);
        else { enemyView.onEvent(ev); primes.clear(); }
        blastLight.color.setHex(ev.kind === 'grenade' ? 0xff8a3a : ev.kind === 'keg' || ev.kind === 'ball' ? 0xffa040 : 0x9dff6a);
        sound.explosion(pan(ev.pos), Math.max(0.3, vol(ev.pos, 70)));
        addShake(0.8 * vol(ev.pos, 22));
        blastLight.position.copy(ev.pos);
        blastLight.intensity = 120;
        break;
      case 'rainMark': enemyView.onEvent(ev); break;
      case 'rainStrike':
        enemyView.onEvent(ev);
        if (ev.kind === 'lob') sound.explosion(pan(ev.pos), 0.6 * Math.max(0.3, vol(ev.pos, 60)));
        else sound.crumble(pan(ev.pos), vol(ev.pos, 40), true);
        addShake((ev.kind === 'lob' ? 0.5 : 0.35) * vol(ev.pos, 12));
        break;
      case 'teleportOut': case 'teleportIn': enemyView.onEvent(ev); sound.warp(pan(ev.pos), vol(ev.pos, 70)); break;
      case 'bossPhase2': enemyView.onEvent(ev); sound.transform(); addShake(0.5); break;
      case 'weather': worldView.setWeather(ev.kind); sound.setStorm(ev.kind === 'sandstorm' ? 1 : 0); break;
      case 'banner': hud.banner(ev.title, ev.sub, ev.duration); break;
      case 'horn': sound.horn(ev.victory); break;
      case 'unlock': sound.pickup(); break;
      case 'cardOffer': break; // the HUD reads the offer from the player
      case 'cardPicked': if (mine) { sound.pickup(); hud.pickup(upgradeInfo(ev.card).name.toUpperCase()); } break;
      case 'objective':
        if (ev.state === 'done' && ev.winners.includes(game.localId)) { hud.pickup('OBJECTIF RÉUSSI  +1000'); sound.horn(true); }
        else if (ev.state === 'failed' && ev.text) hud.pickup('OBJECTIF MANQUÉ');
        break;
      case 'playerDown':
        if (!mine && game.net && !sim.mode.pvp) { hud.pickup(`${nameOf(ev.pid)} EST À TERRE !`); sound.horn(false); }
        break;
      case 'playerRevived':
        if (mine) { hud.pickup('RELEVÉ !'); sound.pickup(); }
        else if (ev.by === game.localId) { hud.pickup(`${nameOf(ev.pid)} RELEVÉ  +200`); sound.pickup(); }
        break;
      case 'gameOver': clearCharm(); endGame(ev.victory, ev.winner); break;
    }
  }
  // Call of Duty: a kill to the head has its own crack and ring, instead of the plain hit sound
  if (headshotKill) sound.headshotKill();
  else if (hit) sound.hit(hit.head);
  if (hit || headshotKill) hud.hit(!!(hit?.head || headshotKill));
  // Halo: the medal on screen and a brass sting
  if (multi || spree) {
    const lines = [multi && multiKillName(multi), spree && spreeName(spree)].filter(Boolean);
    hud.medal(lines[0].toUpperCase(), spree && multi ? spreeName(spree).toUpperCase() : spree ? `${spree} ÉLIMINATIONS SANS MOURIR` : '');
    sound.medal(multi || spree / 5 + 1, !multi);
  }
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
  // co-op: the shared world goes on while this player is in the pause menu
  if (sim && game.player && (game.state === 'playing' || (game.net && game.state === 'paused'))) {
    const p = game.player;
    const lo = p.loadout;
    const aiming = lo.adsT > 0.5;
    const cmd = game.state === 'playing'
      // aiming slows the mouse down, much more through the precision rifle's scope
      ? input.buildCommand(lo.current.def.melee ? 1 : 1 - lo.adsT * (lo.current.def.scope ? 0.75 : 0.45), !!p.cardOffer)
      : { ...emptyCommand(), yaw: input.yaw, pitch: input.pitch };
    // exploration: N calls a group of enemies to try the weapons on
    if (game.state === 'playing' && !game.net && sim.mode.callTargets && input.wasPressed('KeyN')) sim.mode.callTargets();
    sim.step(dt, new Map([[game.localId, cmd]]));

    // camera: the player's eye with a walking bob, plus the recoil the simulation applied
    const hv = Math.hypot(p.vel.x, p.vel.z);
    if (p.moving) game.bob += hv * dt * 1.6;
    const bobY = p.moving ? Math.sin(game.bob * 2) * 0.035 * (aiming ? 0.15 : 1) : 0;
    camera.position.set(p.pos.x, p.eyeY + bobY, p.pos.z);
    if (sim.viewOffset) camera.position.add(sim.viewOffset); // eases out the server's corrections
    camera.rotation.set(p.pitch + p.recoil.pitch, p.yaw + p.recoil.yaw, 0, 'YXZ');
    if (p.dead) { camera.position.y = p.pos.y + 0.45; camera.rotation.z = 0.35; } // down on the sand
    applyShake(dt, now);
    // a siren's song: the view sways while it holds
    if (p.charm > 0) camera.rotation.z += Math.sin(now * 1.7) * 0.05 * p.charm;
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
    grenadeView.sync(sim.grenades, viewDt);
    kegView.sync(sim.kegs);
    if (game.net) coopHud(p, dt);
    const ranked = sim.mode.pvp ? arenaRanking() : null;

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
      totalWaves: sim.mode.totalWaves,
      score: p.score,
      objective: sim.mode.objective,
      waveStats: p.waveStats,
      waveActive: sim.mode.waveActive,
      cardOffer: p.cardOffer,
      upgrades: p.upgrades,
      time: sim.time,
      enemiesLeft: sim.mode.enemiesLeft,
      health: p.health,
      weapon: lo.current,
      weaponIndex: lo.index,
      grenades: lo.grenades,
      unlocked: lo.items.map((w) => w.unlocked),
      reloading: lo.reloading > 0,
      spread: THREE.MathUtils.lerp(def.spread, def.adsSpread, lo.adsT) + (p.moving ? 0.012 : 0),
      ads: lo.adsT,
      scoped: weaponView.scoped(lo) && !p.dead && game.state === 'playing',
      boss: sim.enemies.boss,
      arena: ranked && {
        frags: p.stats.frags, deaths: p.stats.deaths, scoreLimit: sim.mode.scoreLimit, timeLeft: sim.mode.timeLeft,
        rank: ranked.indexOf(p) + 1, players: ranked.length,
      },
    });
    if (ranked) {
      for (const [id, t] of lastShots) lastShots.set(id, t + dt);
      const foes = [...lastShots].filter(([id, t]) => t < 2 && sim.players.get(id) && !sim.players.get(id).dead)
        .map(([id, t]) => ({ pos: sim.players.get(id).pos, fade: (2 - t) * 2 }));
      hud.drawMinimap(p, sim.enemies, [], foes);
      hud.scoreboard(game.state === 'playing' && input.down('Tab') ? ranked.map((o) => ({ name: o.name, frags: o.stats.frags, deaths: o.stats.deaths, kills: o.stats.kills, me: o === p })) : null,
        `Premier à ${sim.mode.scoreLimit} · ${fmtTime(Math.ceil(sim.mode.timeLeft))} restantes`);
    } else hud.drawMinimap(p, sim.enemies, game.net ? [...sim.players.values()].filter((o) => o !== p) : []);
    // the siren's song: blurred, tinted view; the loudest singer is heard
    const charm = p.charm ?? 0;
    if (Math.abs(charm - (game.shownCharm ?? 0)) > 0.01) {
      game.shownCharm = charm;
      canvas.style.filter = charm > 0.02 ? `blur(${(charm * 2.5).toFixed(2)}px) saturate(${(1 + charm * 0.6).toFixed(2)})` : '';
      $('charm').style.opacity = (charm * 0.9).toFixed(2);
    }
    let singer = null, loud = 0;
    for (const e of sim.enemies.list) {
      if (e.act?.kind !== 'sing') continue;
      const v = vol(e.pos, 50);
      if (v > loud) { loud = v; singer = e; }
    }
    sound.setSong(singer ? Math.max(loud, charm) : 0, singer ? pan(singer.pos) : 0);
    // the music follows the fight: calm between waves, louder in combat, fiercer against the pharaoh
    sound.setMusicIntensity(sim.over ? 0 : ranked ? 1 : sim.enemies.boss ? 2 : sim.mode.waveActive && sim.enemies.alive ? 1 : 0);
  } else if (game.state === 'menu') {
    sound.setMusicIntensity(0);
    if (Math.abs(camera.fov - settings.fov) > 0.01) { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
    // slow fly-around of the map behind the title screen
    const mc = world.menuCamera;
    menuAngle += dt * 0.05;
    camera.position.set(mc.orbit[0] + Math.sin(menuAngle) * mc.radius, mc.height, mc.orbit[1] + Math.cos(menuAngle) * mc.radius);
    camera.lookAt(...mc.look);
  }

  effects.update(game.state === 'paused' && !game.net ? 0 : dt);
  vmScene.visible = (game.state === 'playing' || game.state === 'paused') && !game.player?.dead;
  vmFlash.intensity = worldFlash.intensity * 0.15;
  composer.render();
  input.endFrame();
}
game.tick = tick;

// co-op HUD: teammates, the use prompt next to a downed teammate, and the downed screen
function coopHud(p, dt) {
  const sim = game.sim;
  playerView.sync(sim.players, game.localId, dt, !!sim.mode.pvp);
  if (sim.mode.pvp) {
    // the arena: no teammates, and a countdown instead of the downed screen
    hud.team([]);
    hud.prompt(null);
    hud.eliminated(p.dead ? { by: p.killedBy ? sim.players.get(p.killedBy)?.name ?? null : null, respawn: p.respawn, total: 4 } : null);
    return;
  }
  const mates = [...sim.players.values()].filter((o) => o !== p);
  hud.team(mates);
  let near = null, nd = 2.2;
  if (!p.dead) {
    for (const o of mates) {
      const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      if (o.dead && d < nd) { nd = d; near = o; }
    }
  }
  hud.prompt(near ? `Maintiens [E] pour relever ${near.name} — ${Math.round(near.revive * 100)} %` : null);
  hud.downed(p.dead ? p.revive : null, mates.every((o) => o.dead));
}

refreshScreens();
frame();
