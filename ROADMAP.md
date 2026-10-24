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

## Phase 8 — Prototype multijoueur coopératif `[x]`
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
- [x] 35 tests automatisés, dont deux qui lancent le vrai serveur avec plusieurs clients.
- **Validation :** une partie à deux en local (deux onglets, ou deux PC sur le même réseau avec l'adresse IP du serveur). Validée le 16/10/2026.
- **Corrigé après validation :** il fallait recopier le code du salon à la main. L'écran Coopération liste maintenant les salons ouverts, chacun avec un bouton Rejoindre ; la saisie du code reste possible. Deux joueurs au même pseudo sont numérotés (« Joueur 2 »).
- **PvP :** préparé par l'architecture, construit en phase 9.
- **Limites connues du prototype :** pas de compensation de latence pour les tirs (sans effet en réseau local), on ne peut pas rejoindre une partie déjà lancée.

## Phase 9 — Arène joueur contre joueur `[x]`
Choix validés : chacun pour soi, quelques gardiens dans l'arène, victoire au score ou au chrono, les quatre armes dès le départ.
- [x] **Mode Arène** (`src/sim/modes/arena.js`), choisi par l'hôte dans le salon (2 à 4 joueurs) :
  - chacun pour soi ; une élimination rapporte 1 point ;
  - le premier à 15 éliminations gagne, sinon le meilleur score au bout de 8 minutes ; l'hôte règle les deux (10, 15 ou 25 ; 5, 8 ou 12 min) ;
  - les quatre armes dès le départ, munitions pleines ; pas de cartes ni d'objectifs.
- [x] **Combats entre joueurs :**
  - les balles et le khépesh touchent les autres joueurs, avec tirs à la tête ;
  - dégâts ajustés contre les joueurs (deux coups de khépesh, deux tirs du fusil à pompe à bout portant) ;
  - le khépesh pare les coups d'épée venus de face ; une parade parfaite repousse l'attaquant ; les balles ne se parent pas ;
  - les explosions de momie blessent tout le monde.
- [x] **Mort et réapparition :** pas de joueur à terre. Réapparition au bout de 4 s, loin des autres joueurs et hors de leur vue, avec 2 s d'invulnérabilité (perdue dès qu'on tire).
- [x] **Gardiens :** quelques chacals et prêtres rôdent (davantage avec plus de joueurs) et attaquent tout le monde. En abattre un lâche toujours un soin ou des munitions, mais ne rapporte pas de point.
- [x] **Interface :**
  - HUD : éliminations du joueur, temps restant, rang, et annonces des éliminations en haut à droite ;
  - tableau des scores en maintenant **Tab** ;
  - écran « Éliminé par … » avec le compte à rebours ;
  - minicarte : un adversaire apparaît 2 s quand il tire ;
  - écran de fin : classement de la partie, victoire pour le premier.
- [x] 40 tests automatisés, dont 5 pour l'arène : départ, dégâts entre joueurs, réapparition protégée, khépesh et parade, fin au score et au chrono.
- **Validation :** une partie à deux en local. Validée le 16/10/2026.
- **Corrigé après validation :** le bouton « Coopération » devient « Multijoueur », car l'arène s'y trouvait sans que rien ne l'indique.

## Phase 10 — Grenades, fusil de précision, points à l'écran et médailles `[x]`
Choix validés : médailles en anglais comme dans Halo, séries d'éliminations dans l'arène seulement, grenades lancées avec G qui explosent au bout de 2 s.
- [x] **Grenades** (tous les modes) :
  - pot de feu en terre cuite avec sa mèche, modélisé dans Blender (`blender/grenade.py`, `grenade.glb`) ;
  - lancé en cloche avec **G** : il rebondit sur le sol et les murs, puis explose au bout de 2 s ;
  - explosion de 5 m de rayon, arrêtée par les murs ; elle blesse les gardiens, son lanceur, et les autres joueurs dans l'arène (pas les coéquipiers) ;
  - 2 au départ, 4 au maximum ; +1 par caisse de munitions et +1 à la fin de chaque vague ;
  - compteur dans le HUD, à côté des munitions.
- [x] **Points à l'écran, comme dans Call of Duty :** chaque gain s'affiche à droite du viseur (« +100 ÉLIMINATION », « +50 TIR À LA TÊTE », « +50 KHÉPESH », etc.), et le total grimpe tant que les gains s'enchaînent.
- [x] **Médailles, comme dans Halo :**
  - éliminations multiples à moins de 4 s d'intervalle : Double Kill, Triple Kill, Overkill, Killtacular, Killtrocity, Killimanjaro, Killtastrophe, Killpocalypse, Killionaire ;
  - dans l'arène, les séries sans mourir : Killing Spree (5), Killing Frenzy (10), Running Riot (15), Rampage (20), Untouchable (25), Invincible (30) ;
  - titre doré à l'écran avec un accord de cuivres. La voix anglaise lue par le navigateur a été essayée puis retirée : elle rendait mal.
- [x] **Son du tir à la tête mortel, comme dans Call of Duty :** un claquement sec suivi d'un tintement métallique, à la place du son de touche habituel.
- [x] **Fusil de précision** (touche 5), débloqué pour la dernière vague (la vague 5 en Vagues comme en Survie), disponible dès le départ dans l'arène :
  - modélisé dans Blender (`blender/sniper.py`, `sniper.glb`) : arme à verrou, lunette à bagues de bronze, crosse en bois, mêmes mains bandées que les autres armes ;
  - 150 dégâts (un chacal d'une balle), 5 balles par chargeur, 25 en réserve ; très imprécis à la hanche, parfait en visant ;
  - la balle traverse un premier ennemi ;
  - vue dans la lunette : zoom à 16°, réticule noir au point rouge, l'arme disparaît, la souris ralentit ;
  - dans l'arène, 90 dégâts au corps et 180 à la tête.
- [x] 45 tests automatisés, dont 5 nouveaux : trajectoire et explosion des grenades, points, éliminations multiples, séries, et la balle du fusil de précision qui traverse.
- **Validation :** une partie solo et une partie dans l'arène. Validée le 16/10/2026.

## Nouveaux univers — U1 · L'Île des pirates maudits
Huit univers sont prévus ; les idées et le plan de U1 en 7 phases sont dans le document « Univers du FPS — idées et plan U1 » (https://claude.ai/artifact/WWpyYvVv1c2J47Cwv3isxe).

### U1 Phase 1 — Socle multi-univers `[x]`
- [x] **Une fiche par univers** dans `src/worlds/` (`sables.js`, `pirates.js`, `index.js`) : fichiers de la carte, armes et déblocages, types d'ennemis, vagues, survie, gardiens de l'arène, textes, ambiance de la nuit, caméra du menu.
- [x] **La simulation lit l'univers** (`sim.world`) au lieu de tables écrites en dur. Le comportement d'un ennemi vient de ses champs (mêlée, tir, bond, charge, explosion, grimpeur, essaim, boss) : un nouvel univers habille les mêmes comportements avec ses modèles et ses chiffres. Le boss s'appelle toujours `boss`.
- [x] **Choix de l'univers sur l'écran titre**, enregistré dans le navigateur ; en changer recharge la page. Titre, texte d'accroche, ciel, brouillard, lune et lanternes suivent l'univers. Classement séparé par univers (le désert garde ses anciens scores).
- [x] **Pirates jouable avec une carte provisoire** (`scripts/pirates-stub-level.mjs` → `public/models/pirates/level.json`, dessinée à partir des boîtes de collision) et, en attendant les phases 3 à 6, les armes et les ennemis du désert.
- [x] Le multijoueur reste réservé au désert (le serveur ne connaît que sa carte).
- [x] 51 tests automatisés, dont 4 nouveaux : fiches complètes, univers inconnu, navigation sur le port, cinq vagues des pirates jusqu'à la victoire.
- **Validation :** Gardiens des Sables se joue exactement comme avant ; l'univers Pirates apparaît au menu. Validée le 24/10/2026.

### U1 Phase 2 — La carte du port et son ambiance `[x]`
- [x] **Le port modélisé dans Blender** (`blender/pirates/port.py`, fichier `blender/pirates/port.blend`) :
  - falaises tout autour de la crique, un canyon d'où arrivent les ennemis, la grotte au trésor (coffre, tas d'or, crânes) ;
  - un village en ruine : quatre maisons où l'on entre (une sans toit, une au toit effondré), un puits, des étals, et une taverne pleine avec une terrasse sur le toit ;
  - le quai en planches et deux pontons au-dessus de l'eau, avec garde-corps au-dessus de l'eau profonde ;
  - le galion échoué : escalier depuis la plage, pont principal avec mâts, voiles et canons, gaillard arrière surélevé avec la barre ;
  - 17 lanternes de navire (les lumières de feu), 6 points d'apparition.
- [x] **Une seule hauteur de sol par endroit :** la grille de navigation ne connaît qu'un sol par case. Une cale sous le pont ou une salle sous la terrasse cacheraient ces étages aux ennemis : la coque, le gaillard et la taverne sont donc pleins. Rampes latérales sur les escaliers (comme au temple du désert), pour qu'on n'y monte que par la première marche.
- [x] **L'eau :** une zone d'eau peu profonde (`Z_Water`) ralentit joueurs et ennemis (×0,6) et fait des éclaboussures aux pas ; au-delà, l'eau profonde est fermée par un mur invisible (`C_*`). La mer est dessinée jusqu'à l'horizon, avec une houle et le reflet de la lune.
- [x] **Les barils de poudre** (10 sur la carte, `KEG_n`) : un tir les fait exploser (dégâts aux ennemis et aux joueurs proches), une explosion voisine les fait sauter en chaîne, et ils reviennent à chaque vague. Points « BARIL » pour les ennemis tués ainsi.
- [x] **Ambiance :** ressac sur la plage, lanternes chaudes, objets éparpillés sur le sable (cordages, bouteilles, planches, crânes, carapaces de crabe, palmiers), choisis par l'univers.
- [x] **Mode Exploration** sur l'écran titre : la carte sans ennemis, pour la visiter.
- [x] **Export :** la sécurité de Blender interdit d'écrire des fichiers depuis Python ; la carte est exportée en `level.glb` et `scripts/level-json-from-glb.mjs` en tire `level.json` (même règle que `blender/export_level_json.py`, vérifiée identique sur le désert).
- [x] 59 tests automatisés, dont 11 nouveaux : un chacal rejoint le joueur depuis chaque apparition et sur chaque hauteur (ponton, pont, gaillard, terrasse, grotte, canyon), l'eau ralentit, les barils explosent en chaîne et reviennent.
- **Validation :** se promener sur le port en mode Exploration (eau, barils, ambiance), puis une partie en Vagues. Validée le 24/10/2026.

### U1 Phase 3 — Les armes `[x]`
- [x] **Cinq armes modélisées dans Blender** (`blender/pirates/weapons.py`, scène « Weapons » de `blender/pirates/port.blend`, exportées dans `public/models/pirates/`), avec des mains en gants de cuir sans doigts et des manches de chemise retroussées (`blender/hands.py` accepte maintenant un style de mains) :
  - **[1] Sabre d'abordage** : lame courbe, garde et branche de garde en laiton. Mêlée et parade au clic droit, comme le khépesh.
  - **[2] Pistolet à silex** : un seul coup de 130 dégâts (un chacal ou un prêtre d'une balle), puis 1,7 s de recharge. Le chien s'abat au tir et se réarme à la fin de la recharge.
  - **[3] Tromblon** à deux canons évasés : deux gerbes de 12 plombs, puis recharge des deux canons. Débloqué après la vague 1.
  - **[4] Canon portatif** en bronze : un boulet qui vole en cloche et explose sur ce qu'il touche (120 dégâts directs, 230 dans un rayon de 4,5 m). Le tir repousse le joueur en arrière. Débloqué après la vague 2.
  - **[G] Bombes à mèche** : boulets de fer à mèche fumante, qui rebondissent et explosent comme les pots de feu.
- [x] **Recharge par la bouche** pour les trois armes à feu : l'arme se relève, la main gauche apporte une cartouche de papier (ou le boulet) à la bouche, tire la baguette, bourre deux fois et la remet en place. Fumée de poudre noire à chaque tir.
- [x] **Sons procéduraux** : détonation sourde de la poudre noire précédée du claquement de la platine, papier déchiré, baguette et réarmement. Les sons enregistrés viendront en phase 7.
- [x] **Mode Exploration** : toutes les armes en main dès le départ, quatre bombes, et la touche **N** appelle un groupe d'ennemis (3 chacals, 2 prêtres, 1 colosse) et recharge les munitions.
- [x] Le moteur lit les modèles propres à l'univers (`files.models`), la dispersion des plombs vaut pour toute arme à plusieurs plombs, et le bonus de mêlée prend le nom de l'arme de l'univers.
- [x] 63 tests automatisés, dont 4 nouveaux : le pistolet à silex tire un coup puis recharge, le tromblon tire deux fois, le boulet vole, explose et repousse le tireur, l'Exploration donne toutes les armes et appelle des cibles.
- **Validation :** essayer les armes en Exploration contre les ennemis du désert (touche N). Validée le 24/10/2026.

### U1 Phase 4 — Ennemis de base `[x]`
- [x] **Trois ennemis modélisés, avec squelette et animations** (`blender/pirates/enemies.py`, scène « Enemies » de `port.blend`, exportés dans `public/models/pirates/`) :
  - **Matelot squelette** (comme le chacal) : os, bandana rouge, yeux verts maudits, sabre au poing. Il arrive par groupes de trois, zigzague, se fend sur le joueur et se défait en os quand il meurt (cliquetis d'os).
  - **Crabe géant** (comme le colosse) : il sort de l'eau au large de la plage ouest. Sa carapace ne laisse passer que 30 % des coups portés de face (étincelles et bruit de métal). Il charge de côté, le flanc tourné vers le joueur : c'est le moment de tirer.
  - **Artilleur fantôme** (comme le prêtre) : un fantôme translucide en tricorne qui flotte à son poste sur le pont ou le gaillard du galion. Il tire des boulets en cloche avec un pierrier ; une ombre et un cercle rouge montrent où le boulet va tomber. Il n'a pas besoin de voir le joueur, mais il ne tire pas sur quelqu'un qui est sous un toit. Il ne quitte son poste que si on monte à bord.
- [x] **Le moteur généralise les comportements** : armure de face (`armor`), charge de côté (`charge.side`), poste fixe (`post` et `posts` de l'univers), apparition dans une zone d'eau (`fromWater`), tir en cloche (`ranged.lob`), zigzag (`weave`) et rafale (`ranged.burst`) deviennent des champs de la fiche au lieu de noms de types écrits en dur. Un groupe (`swarm`) arrive maintenant par blocs de sa taille.
- [x] **Vagues des pirates** : squelettes, puis artilleurs (vague 2), puis crabes (vague 3) ; le pharaon reste le boss en attendant le Kraken (phase 6). En Exploration, la touche N appelle 3 squelettes, 2 artilleurs et 1 crabe.
- [x] **Corrections après le premier essai :**
  - le boss pouvait apparaître à une porte d'où un gros corps ne sort pas (la grotte, le pont du galion, un rocher en mer) : chaque type n'utilise plus que les points d'apparition dont il peut sortir, et l'écart aléatoire autour d'une porte ne le met plus dans un mur ; le point d'apparition ouest en mer est déplacé hors du rocher (`port.py`, `level.json`) ;
  - **[5] Mousquet à longue-vue** pour la dernière vague, comme le fusil de précision du désert : long mousquet à lunette de laiton (`weapons.py`, `musket.glb`), une balle de 160 dégâts qui traverse un premier ennemi, imprécis à la hanche, parfait dans la longue-vue (zoom à 18°), rechargé par la bouche avec la baguette.
- [x] 70 tests automatisés, dont 7 nouveaux : la carapace du crabe, son apparition dans l'eau, sa marche jusqu'au joueur et sa charge de côté ; les postes des artilleurs et leurs tirs en cloche, l'abri d'un toit ; les squelettes par trois ; le boss par une porte praticable ; les déblocages des vagues jusqu'au mousquet.
- **Validation :** jouer des vagues avec ces trois ennemis (ou les appeler avec N en Exploration), jusqu'au boss de la vague 5. Validée le 24/10/2026.

### U1 Phase 5 — Ennemis spéciaux `[x]`
- [x] **Sirène** (`enemies.py`, `siren.glb`, avec squelette et animations) : elle sort de l'eau dans la crique et y reste. Quand elle voit le joueur, elle chante 5 s, bras ouverts, puis se tait 3 à 5 s. Le chant charme : l'écran se brouille, une brume rose se referme sur les bords, la vue tangue, et le joueur est tiré vers elle (jusqu'à 2,8 m/s quand le charme est complet, en 2,5 s). Trop près, elle griffe. Se mettre à couvert ou la tuer coupe le chant, et le charme retombe en un peu plus d'une seconde. Le chant est une mélodie procédurale qui vient de sa direction.
- [x] **Nuée de chauves-souris** (`bat.glb`, une chauve-souris dont le jeu bat les ailes, douze par nuée) : premier ennemi volant. Elle ne suit pas la grille de navigation : elle arrive par-dessus les falaises, fonce droit sur le joueur, contourne un mur en virant ou en montant, et tourne autour de sa tête en mordillant (4 dégâts toutes les 0,35 s). Une explosion (bombe, boulet, baril) la disperse d'un coup (dégâts des explosions ×5).
- [x] **Vagues des pirates** : nuées dès la vague 2, sirènes dès la vague 3 ; en Exploration, N appelle aussi une sirène et une nuée.
- [x] **Correction : des ennemis coincés bloquaient les vagues.** Un ennemi pouvait naître hors de la carte (le point d'apparition ouest en mer est près du bord, et les membres d'un groupe étaient dispersés sans vérification), dans un mur, ou rester pris dans un piège du décor (le pied de l'escalier du galion, où la grille de navigation n'a qu'un sol par case), alors qu'une vague attend que tous soient morts. Maintenant :
  - les membres d'un groupe et l'écart autour d'une porte ne tombent que sur du sol praticable de la carte, à la même hauteur ;
  - un ennemi hors de la zone jouable pour sa taille (hors carte, dans un mur, un crabe sur le pont du galion) revient par une porte au bout de 2 s ;
  - un ennemi loin des joueurs (plus de 6 m) qui a bougé de moins de 1,5 m en 6 s revient aussi par une porte ;
  - une nuée qui ne voit pas le joueur suit le chemin au sol, en vol, au lieu de foncer dans un mur.
  Douze parties simulées, le joueur immobile à divers endroits et ne tuant que ce qui l'approche, vont toutes au bout des cinq vagues.
- [x] 74 tests automatisés, dont 4 nouveaux : le chant de la sirène (charme, attirance, elle ne bouge pas, tout s'arrête à sa mort) ; la nuée qui arrive en vol, mord à répétition et meurt dans l'explosion d'un baril ; un ennemi hors carte ou piégé qui revient par une porte ; des vagues qui finissent toujours, même pour un joueur qui ne tue que ce qui s'approche. Le test de la charge du crabe ne dépend plus du hasard.
- **Validation :** jouer des vagues qui mélangent les cinq ennemis (ou les appeler avec N en Exploration). Validée le 24/10/2026.

### U1 Phase 6 — Le Kraken `[x]`
- [x] **Deux modèles avec squelette et animations** (`blender/pirates/kraken.py`, scène « Kraken » de `port.blend`) : la tête (grand manteau violet, yeux jaunes à pupille fendue, bec, moignons de bras) et une tentacule sur une chaîne de six os (ventouses, frappe, saisie, étreinte).
- [x] **Phase 1** : le corps attend sous l'eau, au large entre les deux pontons, intouchable. Quatre tentacules surgissent le long du quai, des pontons et de la plage ouest, près du joueur. Chacune s'abat là où il se tient, après un cercle rouge d'avertissement (1,1 s). Couper une tentacule l'oblige à replonger, coûte 8 % de sa vie au Kraken (points « TENTACULE »), et elle ressort ailleurs 4 à 6 s plus tard.
- [x] **Phase 2, à la moitié de sa vie** : la tête sort de l'eau et devient la cible. Elle crache en cloche, par-dessus la barrière de l'eau profonde, une boule d'encre annoncée par son ombre, qui aveugle 4 s (taches noires sur l'écran). Elle appelle quatre squelettes depuis la terre, puis d'autres toutes les 22 s.
- [x] **Phase 3, au dernier tiers** : il brise le ponton le plus proche du joueur (les collisions et la navigation changent, une barrière referme l'eau profonde, quiconque est dessus est rejeté dans les hauts-fonds). Ses tentacules saisissent désormais un joueur trop proche : immobilisé et blessé, il se libère en infligeant 70 dégâts à celle qui le tient, sinon elle le rejette au bout de 6 s. Le ponton est de nouveau là à la partie suivante.
- [x] Le Kraken est le boss de la vague 5 et de la survie ; en Exploration, la touche **B** l'appelle. Ses rugissements sont ceux du colosse, très ralentis ; chaque univers peut maintenant avoir ses propres voix (`voices`) et couleurs (`looks`).
- [x] 79 tests automatisés, dont 5 nouveaux : le Kraken immergé et ses quatre tentacules, l'avertissement puis la frappe, la tentacule coupée qui replonge et revient, la tête qui sort, l'encre et les renforts, le ponton brisé, la saisie et la libération, le ponton restauré.
- **Validation :** affronter le Kraken seul (B en Exploration), puis à la fin de la vague 5. Validée le 24/10/2026.

## Décisions à prendre plus tard
- **Phase 8 :** hébergement du serveur.
- **Multijoueur retiré de la version normale (24/10/2026) :** le bouton Multijoueur et les touches propres à la coopération et à l'arène sont masqués. Le code reste en place et testé. Pour le remettre : `npm run dev:multi` ou `npm run build:multi` (fichier `.env.multiplayer`, interrupteur dans `src/features.js`).
