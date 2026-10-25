import { SABLES } from './sables.js';

// "Station spatiale infestée" (U2): an orbital station gone dark, over a ringed planet.
// The map is its own (blender/station/station.py, dressed by dressing.py): a network of tunnels in
// three loops (round the reactor, through the main tunnels and the maintenance shafts, and the
// perimeter), five districts (reactor, greenhouse, hangar, crew quarters, labs) and two airlocks. The weapons
// (blender/station/weapons.py) and the enemies (blender/station/enemies.py) are its own; the boss
// is still the desert's pharaoh until the hive queen is made.
export const STATION = {
  ...SABLES,
  id: 'station',
  name: 'Station spatiale infestée',
  title: ['Station spatiale', 'infestée'],
  lede: "La station Hélios ne répond plus. Dans ses couloirs plongés dans le rouge des secours, quelque chose s'est réveillé.",

  files: {
    level: 'models/station/level.glb',
    // computed from level.glb by scripts/level-json-from-glb.mjs
    levelData: 'models/station/level.json',
    // floors and dressing without collision: drawn with the map, not in level.json
    decor: 'models/station/decor.glb',
    models: {
      baton: 'models/station/baton.glb',
      laser: 'models/station/laser.glb',
      plasma: 'models/station/plasma.glb',
      flamer: 'models/station/flamer.glb',
      railgun: 'models/station/railgun.glb',
      grenade: 'models/station/mine.glb',
      parasite: 'models/station/parasite.glb',
      host: 'models/station/host.glb',
      brute: 'models/station/brute.glb',
      drone: 'models/station/drone.glb',
      crawler: 'models/station/crawler.glb',
      boss: 'models/station/queen.glb',
      eggsac: 'models/station/eggsac.glb',
    },
  },
  props: null,

  // ---------- weapons ----------
  // heat: no magazine, every shot heats the gun (per), it cools by `cool` a second, and too much
  // heat locks it for `lock` seconds; burst: shots per pull (burstGap: the pause after a burst);
  // charge: seconds before the shot leaves; flame: a cone (range in m, angle in radians) that sets
  // enemies on fire for `burn` seconds; shock: seconds an enemy stays stunned after a baton blow
  weapons: [
    {
      id: 'baton', name: 'MATRAQUE ÉLECTRIQUE', short: 'Matraque', melee: true, dmg: 70, range: 2.8, swing: 0.3, hitAt: 0.09, cooldown: 0.38,
      spread: 0, adsSpread: 0, adsFov: 75, shock: 0.9,
    },
    {
      id: 'laser', name: 'PISTOLET LASER', short: 'Laser', dmg: 27, rpm: 400, auto: false, mag: 1, reserve: Infinity, pellets: 1,
      spread: 0.01, adsSpread: 0.001, reload: 0, recoil: 0.016, adsFov: 58, heat: { per: 0.065, cool: 0.75, lock: 1.4 }, beam: 0xff3a24,
    },
    {
      id: 'plasma', name: 'FUSIL À PLASMA', short: 'Plasma', dmg: 32, rpm: 720, auto: true, mag: 1, reserve: Infinity, pellets: 1,
      spread: 0.024, adsSpread: 0.005, reload: 0, recoil: 0.026, adsFov: 50, burst: 3, burstGap: 0.3,
      heat: { per: 0.055, cool: 0.32, lock: 3 }, beam: 0x5cffb4,
    },
    {
      id: 'flamer', name: 'LANCE-FLAMMES', short: 'Lance-flammes', dmg: 6, rpm: 600, auto: true, mag: 120, reserve: 360, pellets: 1,
      spread: 0, adsSpread: 0, reload: 2.3, recoil: 0.003, adsFov: 70, flame: { range: 7.5, angle: 0.3, burn: 3, burnDps: 16 },
    },
    {
      // for the last wave: charges for a moment, then a slug that goes through every enemy on its line
      id: 'railgun', name: 'FUSIL ÉLECTROMAGNÉTIQUE', short: 'Railgun', dmg: 280, rpm: 45, auto: false, mag: 4, reserve: 16, pellets: 1,
      spread: 0.03, adsSpread: 0, reload: 2.6, recoil: 0.16, adsFov: 30, charge: 0.7, pierceAll: true, beam: 0x6cc4ff,
    },
  ],
  startUnlocked: ['baton', 'laser'],
  unlocks: { 2: 'plasma', 3: 'flamer', 5: 'railgun' },
  grenade: 'mine', // G: sticky mines (MINE in src/sim/sim.js)
  // Where each kind comes from (SPAWN_n of the map, 1-based; see blender/station/station.py):
  // the infected crew from the quarters, the labs, the greenhouse and the reactor; parasites from
  // the nests of eggs; brutes from the hangar and the wide perimeter corners (the maintenance shafts
  // are too narrow for them); drones from their docks. Crawlers use the vents (Sim#pickSpawn).
  // the tunnels are 3.6 m inside: big bodies (the brute, 0.95 m round) keep one cell off the walls,
  // not two, or the hangar's brutes find no way out of it
  nav: { bigClear: 1 },
  spawnGates: {
    host: [1, 3, 4, 5, 6, 9],
    parasite: [3, 9, 10],
    brute: [1, 2, 8, 10],
    drone: [2, 7, 8],
  },

  // ---------- enemies (models: blender/station/enemies.py) ----------
  enemies: {
    ...SABLES.enemies,
    // the parasite: small and fast, comes in groups; it leaps at the face and clings there (sight
    // blurred, it feeds) until a blow of the baton knocks it off — bullets cannot reach it there
    parasite: {
      hp: 28, speed: 8.2, radius: 0.32, height: 0.45, headY: 0.3, early: 0.8,
      melee: { range: 1.1, dmg: 5, windup: 0.12, cd: 0.6 },
      leap: { min: 2.5, max: 7, dur: 0.45, dmg: 6, cd: [2.5, 4] },
      latch: { dps: 9, max: 10 }, // damage per second while on a face, seconds before it lets go
      swarm: 3, load: 0.5,
    },
    // the host: a crew member the infestation took over; slow and tough, it comes in numbers, and
    // what grows inside it sometimes bursts out when it dies
    host: {
      hp: 210, speed: 2.7, radius: 0.42, height: 1.85, headY: 1.45,
      melee: { range: 1.8, dmg: 18, windup: 0.4, cd: 1.3 },
      swarm: 2,
      burst: { type: 'parasite', chance: 0.3 },
    },
    // the armoured brute: a carapace in front stops half a blow; it charges in a straight line.
    // In tunnels you mostly meet it head on, so it is lighter than the desert's tank and its
    // carapace narrower than the crab's (it took whole magazines before, 25/10/2026)
    brute: {
      hp: 400, speed: 3.0, radius: 0.95, height: 2.6, headY: 2.0,
      melee: { range: 2.8, dmg: 32, windup: 0.5, cd: 1.6 },
      charge: { min: 5, max: 22, wind: 0.75, speed: 13, dur: 1.3, dmg: 30, cd: [5, 7] },
      armor: { mul: 0.5, arc: 0.7 }, // damage × mul within ±45° of its face
      big: true,
    },
    // the security drone, gone rogue: it hovers under the ceiling, fires salvos of laser bolts when
    // it sees you in range, then slips out of sight for a moment (Enemies#drone)
    drone: {
      hp: 90, speed: 5.5, radius: 0.45, height: 0.5, headY: 0.3,
      fly: { height: 2.4, reach: 0, spawn: 2.2 }, // hovering height of its middle, height over a gate when it comes
      melee: { range: 0.01, dmg: 0, windup: 1, cd: 99 },
      ranged: { min: 0, max: 30, cd: 2.4, windup: 0.5, speed: 30, dmg: 7, count: 1, spread: 0, salvo: 3, gap: 0.15 },
      drone: { range: 22, hide: [1.5, 2.6] }, // fires within range; seconds out of sight between salvos
      muzzle: [0, 0.1, 0.32],
      load: 0.7,
    },
    // the duct crawler: comes out of the air vents in the walls and ceilings, fast and low; badly
    // hurt, it runs back into the nearest vent and comes out of another one a few seconds later
    crawler: {
      hp: 60, speed: 7.2, radius: 0.38, height: 0.6, headY: 0.45,
      melee: { range: 1.4, dmg: 9, windup: 0.15, cd: 0.7 },
      leap: { min: 3, max: 6, dur: 0.4, dmg: 10, cd: [2.5, 4] },
      vent: { retreat: 0.5, hide: [2.5, 4] }, // flees below that share of its health; seconds in the ducts
      load: 0.5,
    },
    // the Hive Queen (U2 phase 5, Enemies#queen): clinging to the reactor column in the middle of the
    // reactor room, she turns to face whoever she hunts and draws her blows at random. Phase 1: acid
    // volleys, acid rain, tail slam, claw sweep, a sac laid now and then. Phase 2 (half health, the
    // power cut: Sim#powerCut): shut in her carapace while a brood hatches; shooting every sac breaks
    // her open. Phase 3 (a third, the airlocks blown: Sim#breach): faster, and her tail grabs.
    boss: {
      hp: 4600, speed: 0, radius: 3.9, height: 6.8, headY: 4.4,
      melee: { range: 0.01, dmg: 0, windup: 1, cd: 99 },
      ranged: { min: 0, max: 40, cd: 0, windup: 0.42, speed: 17, dmg: 13, count: 3, spread: 0.1 },
      strike: { reach: 9, radius: 2.6, windup: 1.0, dmg: 30, throw: 8 }, // her tail, on a red circle (windup: its warning)
      muzzle: [0, 4.7, 6.4], // her mouth, out in front of the column
      // her head and claws reach out past her cylinder: spheres in front of it (model space, x y z)
      hits: [{ at: [0, 5.0, 5.6], r: 1.1, head: true }, { at: [0, 4.0, 4.6], r: 1.4 }],
      big: true, boss: true, stay: true, hover: 0, // on the floor (the pharaoh floats)
      summon: 'parasite',
      queen: {
        anchor: [0, 0, 0], // the reactor's axis
        gap: [0.9, 1.6], // seconds between two blows (× 0.65 in her last phase)
        warn: [1, 0.3, 0.12], // the colour of her red circles (her own colour is near black)
        // her claws across the floor in front of the column: a circle `at` m out, towards the player
        sweep: { reach: 7.5, at: 5.2, radius: 3.0, windup: 0.75, dmg: 24, throw: 10 },
        // acid dripping from the ceiling: `drops` circles round each player, falling after `delay` s
        rain: { windup: 0.9, drops: 4, delay: 1.2, radius: 1.7, dmg: 14 },
        // last phase: the tail grabs whoever stays in its circle, drags them to her jaws for `hold` s,
        // then bites; `free`: the damage she must take meanwhile to let go
        grab: { reach: 10, radius: 1.6, windup: 0.9, hold: 3.2, free: 220, bite: 34 },
        // phase 2: shut in her shell (at most `max` s) with `sacs` sacs round her, `crew` hosts coming
        // down the tunnels, acid rain every `rainEvery` s; broken open, `exposed` s of double damage
        guard: { sacs: 6, crew: 3, rainEvery: 7, max: 45, exposed: 6 },
        exposedMul: 2,
        sacs: 4, // how many she starts with and keeps up at most (out of her shell)
        layEvery: 18, lay: 1.2, // seconds between two layings, and how long one takes
        roar: 2.2, // her coming and her changes of phase: she cannot be hurt meanwhile
        // where sacs are laid: the floor of the room round her, clear of the generators and the doors
        nests: [[6.6, -2.9], [7.4, 3.2], [-7.4, -3.2], [-6.6, 2.9], [3.2, 7.4], [-3.2, 7.4], [3.2, -7.4], [-3.2, -7.4]],
      },
    },
    // an egg sac of the Queen's: hatches a parasite every few seconds while she lives
    eggsac: {
      hp: 130, speed: 0, radius: 0.75, height: 1.3, headY: 99, stay: true, part: true, load: 0,
      melee: { range: 0.01, dmg: 0, windup: 1, cd: 99 },
      eggs: { hatch: [6, 9], cap: 8 }, // seconds between two hatchings; at most that many parasites about
    },
  },
  waves: [
    { host: 6, parasite: 6 },
    { host: 8, parasite: 9, brute: 1, crawler: 2 },
    { host: 9, parasite: 9, brute: 2, drone: 3, crawler: 3 },
    { host: 10, parasite: 12, brute: 3, drone: 4, crawler: 4 },
    { host: 6, parasite: 9, brute: 2, drone: 2, crawler: 2, boss: 1 },
  ],
  survival: [
    { type: 'host', cost: 2, from: 1, count: 2 }, // a pair
    { type: 'parasite', cost: 1.5, from: 1, count: 3 }, // a whole group
    { type: 'brute', cost: 4, from: 2 },
    { type: 'crawler', cost: 1.5, from: 2 },
    { type: 'drone', cost: 2.5, from: 3 },
  ],
  arenaGuards: ['host', 'host', 'brute'],
  targets: [['host', 2], ['parasite', 3], ['brute', 1], ['drone', 2], ['crawler', 2]],
  // the creatures' cries: the desert's recordings, pitched (src/audio.js setVoices)
  voices: {
    growls: { parasite: 'enemies/scarab_skitter', host: 'enemies/mummy_groan', brute: 'enemies/tank_roar', crawler: 'enemies/runner_screech' },
    rates: { parasite: 1.5, host: 0.8, brute: 0.75, crawler: 1.4 },
  },
  looks: {
    parasite: { color: [0.85, 0.72, 0.5], dot: '#e0c08a' },
    host: { color: [0.55, 0.9, 0.35], dot: '#9de070' },
    brute: { color: [1, 0.35, 0.15], dot: '#ff5a2a' },
    drone: { color: [1, 0.15, 0.1], dot: '#ff3020' },
    crawler: { color: [0.6, 0.85, 0.3], dot: '#a0e050' },
    boss: { color: [0.04, 0.07, 0.03], dot: '#80ff40', shot: [0.5, 1, 0.2] }, // shot: her acid // a dim glow: she is black, wet and glossy
    eggsac: { color: [0.75, 0.62, 0.4], dot: '#c0a070' },
  },

  texts: {
    ...SABLES.texts,
    // the map's oxygen bottles blow up when shot (the port's powder kegs)
    start: 'Matraque [1] et pistolet laser [2] — mines [G] — tenez la station',
    meleeName: 'matraque',
    bladeObjective: 'à la matraque',
    grenadeName: 'Mines collantes',
    grenadeHelp: "Lancer une mine collante (elle saute au passage d'un ennemi)",
    grenadeKill: 'MINE',
    kegKill: 'BONBONNE',
    airlockKill: 'DANS LE VIDE',
    bossName: 'LA REINE-RUCHE',
    bossWakes: 'La Reine-ruche se réveille sur le réacteur…',
    bossSummon: 'La Reine appelle sa couvée !',
    bossLay: 'La Reine pond un sac d’œufs',
    bossPower: 'La Reine coupe le courant !',
    bossBreach: 'La Reine fait sauter les sas !',
    bossGuard: 'La Reine s’enferme dans sa carapace — détruisez ses sacs d’œufs !',
    bossExposed: 'La carapace s’ouvre — la Reine est exposée !',
    grabbed: 'LA QUEUE DE LA REINE VOUS TIENT — TIREZ-LUI DESSUS !',
    latched: 'UN PARASITE VOUS AGRIPPE — MATRAQUE [1] !',
    killsLabel: 'Créatures abattues',
    airlockOpen: 'Sas ouvert — dépressurisation !',
    airlockClosed: 'Sas refermé',
    airlockUse: '[E] Ouvrir le sas',
    airlockShut: '[E] Refermer le sas',
    tips: "Les tirs à la tête infligent double dégâts. La matraque électrique paralyse ce qu'elle frappe, et sa parade renvoie les tirs. Les armes à énergie n'ont pas de chargeur mais chauffent : trop insister les bloque quelques secondes. Le lance-flammes enflamme tout ce qui est devant vous. Une bonbonne d'oxygène explose quand on tire dessus. La lampe torche [F] perce le noir. Un levier [E] ouvre le sas voisin : l'air qui s'échappe aspire tout ce qui est en vue vers le vide pendant quelques secondes — ne restez pas devant. La santé se régénère après quelques secondes sans blessure.",
    victory: 'Les lumières de la station se rallument une à une. Hélios répond de nouveau.',
  },

  ambiance: {
    // inside: a thin haze; outside the windows, black space, the stars all round and the planet
    fog: { color: 0x020304, density: 0.03 },
    sky: { zenith: [0.0, 0.0, 0.004], horizon: [0.004, 0.006, 0.014], haze: [0.03, 0.01, 0.04], glow: [0.5, 0.45, 0.35] },
    stars: 0xe8eeff,
    // the sun, high in the south-west: it comes in through the greenhouse roof and lights the planet's face
    moon: { dir: [-0.35, 0.65, 0.5], disc: '#fff6e0', light: 0xdfe8ff, intensity: 1.0 },
    hemi: { sky: 0x1c2228, ground: 0x050506, intensity: 0.16 },
    // the ceiling neons: cold white tubes, many of them dying or dead; intensity of a working one
    fire: { light: 0xbcd4ff, halo: 0xb8d0ff, glow: '#d8e6ff', neon: true, intensity: 4 },
    // the lit surfaces of the map (tubes, screens, the reactor's rings, the grow lamps, the accent
    // bands) at half what Blender exports: the bloom does the rest
    emissiveScale: 0.5,
    // a gentler bloom than the other universes: only the brightest sources flare
    bloom: { strength: 0.4, threshold: 0.9 },
    space: {
      planet: { dir: [0.9, -0.1, 0.25], size: 170, color: '#c98a52', band: '#7a4a2c', ring: '#d6c3a0', atmosphere: '#7fb4ff' },
    },
    // the emergency lighting: a red glow over everything that pulses slowly
    alarm: { color: 0xff1a10, intensity: 0.18, period: 3.2 },
    // rotating amber beacons and their sweeping beams (FX_Beacon_n), sparks, drips
    beacon: { color: 0xff5a10, spot: 12, beam: 0.3 },
    flashlight: { intensity: 9 }, // the dark: a torch on the gun, F to turn it off
    // shafts of sunlight through the greenhouse's glass roof (y: the roof, at: where they come in)
    sunShafts: { y: 5.6, at: [[-9, -38], [-4, -33], [4, -38], [9, -33], [-7, -28.5], [6, -28.5]], radius: 1.0, strength: 0.045 },
    film: true, // grain, vignette and scanlines over the picture
    // the hum of the machines instead of the wind
    hum: true,
    indoor: true, // ceilings: the minimap leaves out what is overhead
    keg: 'oxygen',
  },
  menuCamera: { orbit: [0, 0], radius: 4.4, height: 5.2, look: [0, 2.2, 0] },
};
