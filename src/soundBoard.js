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
  Médailles: [
    ['Tir à la tête (kill)', (s) => s.headshotKill(), ['medals/headshot']],
    ['Double Kill', (s) => s.medal(2), ['medals/medal_1']],
    ['Triple Kill', (s) => s.medal(3), ['medals/medal_2']],
    ['Overkill et plus', (s) => s.medal(4), ['medals/medal_3']],
    ['Série (Killing Spree)', (s) => s.medal(2, true), ['medals/spree']],
    ['Victoire', (s) => s.horn(true), ['medals/wave_cleared']],
  ],
};

async function walk(s, sprint) {
  for (let i = 0; i < 10; i++) {
    s.step(sprint);
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
    b.innerHTML = `${label}<small>${files.join(', ')}</small>`;
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
      const ok = files.every((f) => sound.hasSample(f));
      b.className = ok ? 'file' : 'proc';
      if (!ok) missing++;
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
