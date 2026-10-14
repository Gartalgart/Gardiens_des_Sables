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

## Phase 4 — Animations squelettiques `[~]` (terminée, à valider en jeu)
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
- **À faire avec la phase 5 :** l'animation de passage du pharaon en phase 2.

## Phase 5 — Nouveaux ennemis, variété, boss en deux phases `[ ]`
- [ ] **Momie kamikaze** (à partir de la vague 3) : elle s'illumine puis explose.
- [ ] **Scarabées grimpeurs** en essaims, avec leur propre couche de navigation (murs et toits).
- [ ] **Élites** (halo doré, double de vie, objet lâché garanti) et variantes de teinte.
- [ ] **Boss, phase 2 :** tempête de sable, pluie d'orbes sur des cercles marqués au sol, téléportations.

## Phase 6 — Progression et rejouabilité `[ ]`
- [ ] Cartes d'amélioration entre les vagues : 3 au choix sur une douzaine d'effets (liste à valider).
- [ ] Objectifs secondaires par vague, avec récompenses.
- [ ] Score et classement local (top 10 par difficulté et par mode).
- [ ] Mode Survie infini, avec un boss toutes les 5 vagues.

## Phase 7 — Décor et ambiance `[ ]`
- [ ] Détails au sol (ossements, poteries, palmiers morts, colonnes brisées), affichés par instanciation.
- [ ] Bâtiments à intérieur, certains avec accès au toit. ⚠️ Exige une **navigation multi-niveaux**.
- [ ] Tempête de sable (brouillard, particules, vent).
- [ ] Musique dynamique générée, dont l'intensité suit le combat.

## Phase 8 — Prototype multijoueur coopératif `[ ]`
- [ ] Dossier `server/` : Node + WebSocket, simulation à 30 mises à jour par seconde, salons rejoints par code.
- [ ] Côté client : déplacement anticipé localement puis corrigé par le serveur, et lissage des autres entités.
- [ ] Modèle 3D de joueur fait dans Blender.
- [ ] **Règles de la coopération :**
  - un joueur à 0 PV tombe à terre et un coéquipier le relève en 3 s ;
  - la fin de la vague relève tout le monde ;
  - le nombre d'ennemis augmente avec le nombre de joueurs.
- **Validation :** une partie à deux en local.
- **PvP :** préparé par l'architecture, sans mode construit (phase 9 éventuelle).

## Décisions à prendre plus tard
- **Phase 6 :** liste des cartes d'amélioration.
- **Phase 7 :** nombre de bâtiments à intérieur.
- **Phase 8 :** hébergement du serveur.
