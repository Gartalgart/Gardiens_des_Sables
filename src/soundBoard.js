// Sound test page (sons.html): every sound of the game on a button, through the same
// methods and volumes the game uses, marked by whether its file loaded.
import { Sound } from './audio.js';

const sound = new Sound();

// [label, what the game calls, the files it plays]
const GROUPS = {
  Armes: [
    ['Pistolet', (s) => s.shot('pistol'), ['weapons/pistol_fire']],
    ["Fusil d'assaut", (s) => s.shot('rifle'), ['weapons/rifle_fire']],
    ['Fusil à pompe + pompe', (s) => { s.shot('shotgun'); s.pump(0.13); }, ['weapons/shotgun_fire', 'weapons/shotgun_pump']],
    ['Précision + culasse', (s) => { s.shot('sniper'); s.bolt(0.28); }, ['weapons/sniper_fire', 'weapons/sniper_bolt']],
    ['Coéquipier au loin (fusil)', (s) => s.shot('rifle', 0.7, 0.25), ['weapons/rifle_fire']],
    ['Recharge pistolet', (s) => s.reload(1.25, 'pistol'), ['weapons/pistol_reload']],
    ['Recharge fusil', (s) => s.reload(2.1, 'rifle'), ['weapons/rifle_reload']],
    ['Recharge précision', (s) => s.reload(2.7, 'sniper'), ['weapons/rifle_reload', 'weapons/sniper_bolt']],
    ['Cartouche', (s) => s.shell(), ['weapons/shotgun_shell_insert']],
    ['Clic à vide', (s) => s.dry(), ['weapons/dry_fire']],
    ["Changement d'arme", (s) => s.weaponSwitch(), ['weapons/weapon_switch']],
    ['Khépesh (coup)', (s) => s.swoosh(), ['weapons/khopesh_swing']],
    ['Khépesh (touche)', (s) => s.slash(2), ['weapons/khopesh_hit']],
  ],
  Grenades: [
    ['Lancer', (s) => s.throw(), ['grenades/grenade_throw']],
    ['Rebond', (s) => s.thud(0, 1), ['grenades/grenade_bounce']],
    ['Explosion', (s) => s.explosion(0, 1), ['grenades/grenade_explosion']],
  ],
  'Pas dans le sable': [
    ['Marche', (s) => s.step(false), ['footsteps/sand_walk_1', 'footsteps/sand_walk_2', 'footsteps/sand_walk_3']],
    ['Course', (s) => s.step(true), ['footsteps/sand_run_1', 'footsteps/sand_run_2']],
    ['Réception de saut', (s) => s.step(true, true), ['footsteps/sand_land']],
    ['10 pas de marche', (s) => walk(s, false), ['footsteps/sand_walk_1']],
    ['10 pas de course', (s) => walk(s, true), ['footsteps/sand_run_1']],
  ],
  // the other surfaces (src/audio.js STEPS): 6 steps of walk then 6 of run; no file = made from noise
  'Pas par surface': [
    ['Pierre', (s) => walk(s, false, 'stone', 6).then(() => walk(s, true, 'stone', 6)), []],
    ['Planches', (s) => walk(s, false, 'wood', 6).then(() => walk(s, true, 'wood', 6)), ['footsteps/wood_step_1', 'footsteps/wood_step_2']],
    ['Eau', (s) => walk(s, false, 'water', 6).then(() => walk(s, true, 'water', 6)), ['footsteps/water_step']],
    ['Tôle', (s) => walk(s, false, 'metal', 6).then(() => walk(s, true, 'metal', 6)), []],
    ['Grille', (s) => walk(s, false, 'grate', 6).then(() => walk(s, true, 'grate', 6)), []],
    ['Résine de la ruche', (s) => walk(s, false, 'resin', 6).then(() => walk(s, true, 'resin', 6)), []],
    ['Terre, mousse', (s) => walk(s, false, 'soil', 6).then(() => walk(s, true, 'soil', 6)), []],
    ['Tapis, toile', (s) => walk(s, false, 'rug', 6).then(() => walk(s, true, 'rug', 6)), []],
    ['Flaque', (s) => walk(s, false, 'wet', 6).then(() => walk(s, true, 'wet', 6)), []],
    ['Réception sur tôle', (s) => s.step(true, true, 'metal'), []],
  ],
  Ennemis: [
    ['Coureur', (s) => s.growl(0, 1, false, 'runner'), ['enemies/runner_screech']],
    ['Tireur (cri)', (s) => s.growl(0, 1, false, 'shooter'), ['enemies/mummy_groan']],
    ['Tireur (tir)', (s) => s.enemyFire(0, 1), ['enemies/shooter_fire']],
    ['Colosse (cri)', (s) => s.growl(0, 1, true, 'tank'), ['enemies/tank_roar']],
    ['Colosse (frappe au sol)', (s) => s.slam(0, 1), ['enemies/tank_slam']],
    ['Momie', (s) => s.growl(0, 1, false, 'mummy'), ['enemies/mummy_groan']],
    ['Scarabées', (s) => s.growl(0, 1, false, 'scarab'), ['enemies/scarab_skitter']],
    ['Ennemi touché', (s) => s.hit(false), ['enemies/enemy_hit']],
    ['Ennemi tué', (s) => s.kill(0, 1, 'runner'), ['enemies/enemy_death_crumble']],
    ['Colosse tué', (s) => s.kill(0, 1, 'tank'), ['enemies/enemy_death_crumble']],
    ['Pharaon (rire, 1 fois / 6 s)', (s) => s.growl(0, 1, false, 'boss'), ['enemies/pharaoh_laugh']],
    ['Pharaon (téléportation)', (s) => s.warp(0, 1), ['enemies/pharaoh_teleport']],
    ['Pharaon (phase 2)', (s) => s.transform(), ['enemies/pharaoh_transform']],
    ['Pharaon (mort)', (s) => s.kill(0, 1, 'boss'), ['enemies/pharaoh_death']],
  ],
  // the pirates' (src/worlds/pirates.js voices): played as recorded, without the universe's routing
  Pirates: [
    ['Pistolet à silex', (s) => s.shot('flintlock'), ['weapons/flintlock_fire']],
    ['Tromblon', (s) => s.shot('blunderbuss'), ['weapons/blunderbuss_fire']],
    ['Canon portatif', (s) => s.shot('cannon'), ['weapons/cannon_fire']],
    ['Mousquet', (s) => s.shot('musket'), ['weapons/musket_fire']],
    ['Recharge par la bouche', (s) => s.reload(1.7, 'flintlock'), ['weapons/ramrod_reload']],
    ['Sabre (coup)', (s) => s.sample('weapons/cutlass_swing', { vol: 0.5 }), ['weapons/cutlass_swing']],
    ['Bombe (mèche)', (s) => s.sample('grenades/bomb_fuse', { vol: 0.45 }), ['grenades/bomb_fuse']],
    ['Squelette', (s) => s.sample('enemies/skeleton_rattle', { vol: 0.6 }), ['enemies/skeleton_rattle']],
    ['Squelette tué', (s) => s.sample('enemies/skeleton_death', { vol: 0.6 }), ['enemies/skeleton_death']],
    ['Crabe', (s) => s.sample('enemies/crab_clack', { vol: 0.6 }), ['enemies/crab_clack']],
    ['Artilleur fantôme', (s) => s.sample('enemies/gunner_moan', { vol: 0.6 }), ['enemies/gunner_moan']],
    ['Chant de la sirène', (s) => s.sample('enemies/siren_song', { vol: 0.7 }), ['enemies/siren_song']],
    ['Chauves-souris', (s) => s.sample('enemies/bats_screech', { vol: 0.6 }), ['enemies/bats_screech']],
    ['Kraken (rugissement)', (s) => s.sample('enemies/kraken_roar', { vol: 0.6 }), ['enemies/kraken_roar']],
    ['Kraken (mort)', (s) => s.sample('enemies/kraken_death', { vol: 0.9 }), ['enemies/kraken_death']],
    ['Tentacule (frappe)', (s) => s.sample('enemies/tentacle_slam', { vol: 0.8 }), ['enemies/tentacle_slam']],
    ['Encre', (s) => s.sample('enemies/ink_splat', { vol: 0.8 }), ['enemies/ink_splat']],
    ['Ponton brisé', (s) => s.sample('enemies/pier_break', { vol: 0.8 }), ['enemies/pier_break']],
    ["Kraken (sortie de l'eau)", (s) => s.sample('enemies/kraken_emerge', { vol: 1 }), ['enemies/kraken_emerge']],
    ['Kraken (pas)', (s) => s.sample('enemies/kraken_step', { vol: 0.8 }), ['enemies/kraken_step']],
    ['Kraken (balayage)', (s) => s.sample('enemies/kraken_sweep', { vol: 0.8 }), ['enemies/kraken_sweep']],
    ['Kraken (saisie)', (s) => s.sample('enemies/kraken_grab', { vol: 0.8 }), ['enemies/kraken_grab']],
    ['Maison écrasée', (s) => s.sample('enemies/house_collapse', { vol: 0.9 }), ['enemies/house_collapse']],
    ["Pas dans l'eau", (s) => s.sample('footsteps/water_step', { vol: 0.4 }), ['footsteps/water_step']],
    ['Pas sur les planches', (s) => s.sample('footsteps/wood_step_1', { vol: 0.4 }), ['footsteps/wood_step_1', 'footsteps/wood_step_2']],
  ],
  // the station's (src/worlds/station.js voices)
  Station: [
    ['Pistolet laser', (s) => s.shot('laser'), ['weapons/laser_fire']],
    ['Fusil à plasma', (s) => s.shot('plasma'), ['weapons/plasma_fire']],
    ['Fusil électromagnétique', (s) => s.shot('railgun'), ['weapons/railgun_fire']],
    ['Matraque électrique', (s) => s.sample('weapons/baton_swing', { vol: 0.5 }), ['weapons/baton_swing']],
    ['Parasite', (s) => s.sample('enemies/parasite_skitter', { vol: 0.6 }), ['enemies/parasite_skitter']],
    ['Hôte infecté', (s) => s.sample('enemies/host_groan', { vol: 0.6 }), ['enemies/host_groan']],
    ['Brute', (s) => s.sample('enemies/brute_roar', { vol: 0.6 }), ['enemies/brute_roar']],
    ['Rampant', (s) => s.sample('enemies/crawler_screech', { vol: 0.6 }), ['enemies/crawler_screech']],
    ['Reine (rugissement)', (s) => s.sample('enemies/queen_roar', { vol: 0.7 }), ['enemies/queen_roar']],
    ['Reine (mort)', (s) => s.sample('enemies/queen_death', { vol: 0.9 }), ['enemies/queen_death']],
    ['Reine (crachat)', (s) => s.sample('enemies/queen_spit', { vol: 0.7 }), ['enemies/queen_spit']],
    ['Acide', (s) => s.sample('enemies/acid_splash', { vol: 0.7 }), ['enemies/acid_splash']],
    ['Œuf qui éclot', (s) => s.sample('enemies/egg_hatch', { vol: 0.7 }), ['enemies/egg_hatch']],
    ['Coup de queue', (s) => s.sample('enemies/tail_slam', { vol: 0.8 }), ['enemies/tail_slam']],
    ['Coupure de courant', (s) => s.sample('station/power_down', { vol: 0.9 }), ['station/power_down']],
    ['Sas qui saute', (s) => s.sample('station/airlock_blow', { vol: 0.8 }), ['station/airlock_blow']],
  ],
  Médailles: [
    ['Tir à la tête (kill)', (s) => s.headshotKill(), ['medals/headshot']],
    ['Double Kill', (s) => s.medal(2), ['medals/medal_1']],
    ['Triple Kill', (s) => s.medal(3), ['medals/medal_2']],
    ['Overkill et plus', (s) => s.medal(4), ['medals/medal_3']],
    ['Série (Killing Spree)', (s) => s.medal(2, true), ['medals/spree']],
    ['Victoire', (s) => s.horn(true), ['medals/wave_cleared']],
  ],
};

async function walk(s, sprint, surface = 'sand', count = 10) {
  for (let i = 0; i < count; i++) {
    s.step(sprint, false, surface);
    await new Promise((r) => setTimeout(r, sprint ? 300 : 450));
  }
}

const board = document.getElementById('board');
const status = document.getElementById('status');
const buttons = [];
for (const [group, sounds] of Object.entries(GROUPS)) {
  const h = document.createElement('h2');
  h.textContent = group;
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const [label, play, files] of sounds) {
    const b = document.createElement('button');
    b.innerHTML = `${label}<small>${files.join(', ') || 'procédural'}</small>`;
    b.addEventListener('click', async () => {
      await start();
      play(sound);
    });
    buttons.push([b, files]);
    grid.append(b);
  }
  board.append(h, grid);
}

let started = null;
function start() {
  started ??= (async () => {
    sound.setVolumes(0.8, 1, Number(document.getElementById('music').value));
    sound.init();
    sound.resume();
    status.textContent = 'chargement des fichiers…';
    await sound.samplesReady;
    let missing = 0;
    for (const [b, files] of buttons) {
      const ok = files.length > 0 && files.every((f) => sound.hasSample(f));
      b.className = ok ? 'file' : 'proc';
      if (!ok && files.length) missing++;
    }
    status.textContent = missing ? `${missing} son(s) en procédural de secours (voir la console)` : 'tous les fichiers sont chargés';
  })();
  return started;
}

document.getElementById('start').addEventListener('click', start);
document.getElementById('music').addEventListener('input', (e) => {
  const v = sound.volumes;
  sound.setVolumes(v.master, v.sfx, Number(e.target.value));
});
document.getElementById('storm').addEventListener('change', (e) => sound.setStorm(e.target.checked ? 1 : 0));
