# Feuille de route — Gardiens des Sables

Choix validés :
- **Multijoueur :** coopératif d'abord, PvP plus tard.
- **Réseau :** serveur Node + WebSocket autoritaire.
- **Animations :** squelettes faits dans Blender.
- **Exécution :** phase par phase. Le joueur teste et valide chaque phase avant la suivante.

**Hors périmètre :** manette, mise en ligne.

**Légende :** `[ ]` à faire · `[~]` en cours · `[x]` fait et validé

---

## Phase 1 — Options et performances `[x]`
- [x] **Menu d'options** (écran titre et pause, enregistré dans le navigateur) :
  - sensibilité de la souris et inversion de l'axe vertical ;
  - champ de vision ;
  - volumes : général, effets, musique ;
  - qualité graphique : basse, moyenne, haute ;
  - compteur d'images par seconde.
- [x] **Performances :**
  - un nombre fixe de lumières de feu, attribuées aux braseros les plus proches ;
  - projectiles, traçantes et débris réutilisés au lieu d'être recréés ;
  - ombres du décor fixe calculées une seule fois ;
  - bloom en demi-résolution.
- **Validation :** comparer les images par seconde avant et après.
- **Corrigé après validation :** bandes sur le sol du temple, causées par des dalles décoratives placées à la même hauteur que le sol.
- **Mesuré (GPU Radeon 780M, 12 ennemis) :** 10,9 ms par image avant, contre 7,7 ms en qualité haute, 2,1 ms en moyenne et 1,0 ms en basse.

## Phase 2 — Fondations multijoueur (aucun changement visible) `[x]`
- [x] **Simulation séparée** dans `src/sim/` : sans rendu, sans accès à la page, exécutable dans Node (`sim.js`, `level.js`, `nav.js`, `player.js`, `weapons.js`, `enemies.js`, `difficulty.js`).
- [x] **Commandes de joueur en entrée, événements en sortie.** Le client (`main.js`, `src/view/*`) traduit les événements en sons, effets et HUD.
- [x] **Plusieurs joueurs :**
  - identifiants et équipes pour les entités ;
  - les ennemis ciblent le joueur vivant le plus proche ;
  - navigation vers tous les joueurs à la fois ;
  - le ralenti des coups d'épée n'est activé qu'en solo.
- [x] **Modes de jeu interchangeables** : `src/sim/modes/` contient `waves` et `sandbox` (bac à sable, pour les tests). Le joueur qui tue un ennemi est crédité (les tirs alliés restent à régler avec le PvP).
- [x] **Collisions du niveau exportées depuis Blender** dans `public/models/level.json` (script `blender/export_level_json.py`). Identiques aux anciennes, à 0,00005 m près.
- [x] **Tests automatisés de la simulation** (Vitest, `npm test`) : 11 tests (collisions, déplacement, régénération, navigation vers le temple et vers le joueur le plus proche, tir, khépesh et objets lâchés, parade, défaite, 5 vagues jusqu'à la victoire).
- **Validation :** le jeu se comporte exactement comme avant.

## Phase 3 — Ressenti des combats `[x]`
- [x] **Mains et avant-bras** modélisés dans Blender (`blender/hands.py`, bandages en lin et bracelets dorés), exportés avec chaque arme. Les coudes sont placés hors champ, depuis la position de la caméra.
- [x] **Viseur holographique** sur le fusil d'assaut : fenêtre en verre avec un réticule rouge (cercle et point), zoom modéré à 50°. Il remplace la lunette, jugée trop zoomée.
- [x] **Traînée dorée** derrière la lame du khépesh, et **étincelles** à chaque parade.
- [x] **Parade parfaite :** parer dans le quart de seconde avant le coup annule les dégâts, étourdit l'attaquant 1,4 s (0,6 s pour le boss), le repousse et déclenche un ralenti de 0,45 s (en solo). Un orbe renvoyé ainsi inflige 6 fois ses dégâts au lieu de 4. Éclair doré et carillon.
- [x] **Secousses de caméra** progressives : tirs (surtout au fusil à pompe), coups subis, onde de choc du boss, colosse qui percute un mur, gros ennemis abattus, parades. Elles se désactivent dans les options.

## Phase 4 — Animations squelettiques `[x]`
- [x] **Une armature dans Blender pour chaque ennemi** (`blender/rig.py`), avec bassin, colonne, tête, bras et avant-bras, cuisses et tibias. Chaque pièce rigide est rattachée à un os : pas de déformation, le style en blocs reste.
- [x] **30 animations** (`blender/anims.py`) :
  - chacal et colosse : repos, marche, course, attaque, étourdissement, impact ; bond (chacal) ; préparation de charge et charge (colosse) ;
  - prêtre et pharaon : repos, déplacement, incantation, coup de bâton ou de sceptre, étourdissement, impact ; onde de choc (pharaon).
- [x] **Export glTF par pistes NLA** : chaque fichier ne contient que les animations de son ennemi.
- [x] **Dans le jeu** (`src/view/enemyView.js`) :
  - le clip est choisi selon l'état de la simulation, avec des fondus enchaînés ;
  - la marche et la course suivent la vitesse réelle ;
  - les attaques sont étirées pour que le coup tombe pile quand la simulation le fait porter ;
  - la réaction aux impacts est ajoutée par-dessus le clip en cours ;
  - coût mesuré : 0,3 ms par image pour 16 ennemis.
- [x] La mort par éclatement en pièces est conservée.
- L'animation de passage du pharaon en phase 2 a été livrée avec la phase 5.

## Phase 5 — Nouveaux ennemis, variété, boss en deux phases `[x]`
- [x] **Momie kamikaze** (vagues 3 à 5), modélisée et animée dans Blender (démarche bras tendus, amorçage bras écartés) :
  - à 3,2 m d'un joueur, elle s'amorce 1 s : elle tremble, clignote de plus en plus vite et bipe, puis explose ;
  - tuée de n'importe quelle façon, elle explose aussi : 4,5 m de rayon, blesse les joueurs et les autres ennemis, réactions en chaîne possibles ;
  - l'explosion ne se pare pas.
- [x] **Scarabées grimpeurs** en essaims de 5 (vagues 2 à 5), modélisés et animés (galop à six pattes) :
  - une couche de navigation « escalade » les fait monter aux murs et passer par les toits, et ils se redressent contre les parois ;
  - ils ne comptent que pour un quart d'ennemi dans la limite de présence.
- [x] **Élites** (10 % à partir de la vague 3) : halo doré, taille ×1,12, double de vie, +15 % de vitesse, +20 % de dégâts, objet lâché garanti. Les autres ennemis reçoivent de légères variations de teinte.
- [x] **Pharaon, phase 2** (sous 50 % de vie) :
  - transformation de 2 s, invulnérable, bras écartés ;
  - tempête de sable : brouillard ocre, ciel voilé, sable qui défile, vent plus fort ;
  - pluie d'orbes sur des cercles marqués au sol autour des joueurs, dont un là où ils se dirigent ;
  - téléportations quand on le serre de trop près ou qu'on s'éloigne trop.
- [x] Vagues recomposées : 104 ennemis au total, plus les 8 chacals invoqués. 17 tests automatisés.

## Phase 6 — Progression et rejouabilité `[x]`
- [x] **12 cartes d'amélioration** (`src/sim/progression.js`), cumulables deux fois sauf Balles perforantes et Garde de bronze. Entre deux vagues, 3 cartes sont proposées (4 si l'objectif est réussi) et se choisissent avec les touches 1 à 4. La pause attend le choix, avec un tirage automatique au bout de 45 s pour la coopération.
- [x] **Objectifs secondaires**, un par vague, avec progression affichée dans le HUD : tuer au khépesh, tirs à la tête, parades parfaites, perdre moins de 40 PV, finir la vague à temps. Un objectif réussi rapporte +1000 points et une carte de plus au choix.
- [x] **Score** : points par ennemi selon son type (doublés pour un élite), bonus pour les morts au khépesh, les tirs à la tête, les parades parfaites, chaque vague franchie et la victoire, le tout multiplié selon la difficulté. **Classement local** (top 10 par mode et difficulté) dans le menu et sur l'écran de fin. Le pseudo se règle dans les options.
- [x] **Mode Survie** (choisi dans le menu) : vagues générées de plus en plus fournies, nouveaux types d'ennemis au fil des vagues, pharaon toutes les 5 vagues. La tempête se dissipe à la mort du pharaon.
- [x] Le déroulé des vagues est commun aux deux modes (`src/sim/modes/waveBase.js`). 23 tests automatisés.

## Phase 7 — Décor et ambiance `[x]`
- [x] Détails au sol (ossements, crânes, tessons, jarres brisées, tambours de colonne, palmiers morts) : `props.glb` fait dans Blender, 72 objets placés par une graine fixe et affichés par instanciation (`src/view/propsView.js`), sans collision.
- [x] Trois maisons à intérieur (porte, fenêtre, mobilier, brasero) et une maison à toit-terrasse avec escalier extérieur et parapet (`blender/houses.py`).
  - Navigation multi-niveaux évitée par conception : les toits des maisons à intérieur sont inaccessibles, la terrasse est une maison pleine comme les gradins du temple.
  - Les scarabées n'escaladent plus les maisons à intérieur : ils passent par la porte.
- [x] Tempête de sable : déjà faite en phase 5 (phase 2 du pharaon).
- [x] Musique dynamique générée (`src/music.js`) : bourdon, percussions maqsum et mélodie en mode Hijaz, à 3 intensités (calme, combat, pharaon).

## Phase 8 — Prototype multijoueur coopératif `[~]` (terminée, à valider en jeu)
- [x] **Serveur** `server/index.js` (`npm run server`, port 8787) : Node + WebSocket (`ws`), salons de 4 joueurs maximum rejoints par un code de 4 lettres, simulation partagée à 30 mises à jour par seconde. L'hôte choisit le mode et la difficulté.
- [x] **Protocole** `src/net/protocol.js` : commandes numérotées vers le serveur, états du monde vers les clients (JSON).
- [x] **Client** `src/net/session.js` :
  - son propre joueur est anticipé : chaque commande le déplace aussitôt, puis l'état du serveur est repris et les commandes pas encore traitées sont rejouées par-dessus ; les petites corrections sont lissées sur la caméra ;
  - tirs, sons et animations d'arme partent tout de suite en local ; les dégâts viennent du serveur ;
  - les autres joueurs et les ennemis sont dessinés avec 70 ms de retard, interpolés entre deux états.
- [x] **Modèle 3D de joueur** fait dans Blender (`blender/player.py`) : gardien en lin au foulard bleu, avec le fusil ou le khépesh. Animations : repos, marche, course, à terre, coup de lame.
- [x] **Règles de la coopération :**
  - un joueur à 0 PV tombe à terre ; un coéquipier le relève en maintenant **E** pendant 3 s à moins de 2,2 m (40 % de vie, +200 points) ;
  - la fin de la vague relève tout le monde (50 % de vie) ;
  - la partie est perdue quand tous les joueurs sont à terre ;
  - ennemis ×1,6 par joueur en plus (deux joueurs : 13 chacals à la vague 1 au lieu de 8), limite de présence et vie du pharaon augmentées d'autant.
- [x] **Interface :** bouton Coopération, écran de salon (code, joueurs, hôte), coéquipiers sur la minicarte et dans le HUD, nom au-dessus de la tête, écran « À terre », pause qui ne fige pas la partie.
- [x] 34 tests automatisés, dont un qui lance le vrai serveur avec deux clients.
- **Validation :** une partie à deux en local (deux onglets, ou deux PC sur le même réseau avec l'adresse IP du serveur).
- **PvP :** préparé par l'architecture, sans mode construit (phase 9 éventuelle).
- **Limites connues du prototype :** pas de compensation de latence pour les tirs (sans effet en réseau local), on ne peut pas rejoindre une partie déjà lancée.

## Décisions à prendre plus tard
- **Phase 8 :** hébergement du serveur.
