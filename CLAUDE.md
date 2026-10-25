# Règles du projet

## Chaque univers a sa propre interface

Toute nouvelle carte (univers, `src/worlds/*.js`) doit avoir une interface de jeu pensée pour son univers, différente de celles des autres cartes. Ne jamais réutiliser telle quelle l'interface d'une autre carte.

- **Le bloc `hud` du fichier de la carte** est obligatoire et complet : police d'affichage, couleurs d'accent, texte, cadres, boutons, barre de vie, icône des grenades (couleur et forme) et couleurs de la mini-carte. Le modèle commenté est dans `src/worlds/sables.js`.
- **La police et la couleur d'accent** doivent être propres à l'univers. Exemples : Cinzel et or pour le désert, IM Fell English SC et vert-de-gris pour les pirates, Orbitron et bleu glacé pour la station. Une nouvelle police Google Fonts s'ajoute au lien de `index.html`.
- **Les textes** du HUD, de l'aide et des écrans de fin viennent de `texts` dans le fichier de la carte, jamais en dur dans `hud.js`, `main.js` ou `index.html`. Ils parlent le langage de l'univers : nom des armes, des grenades et des ennemis (`guards`), boss, victoire, défaite.
- **Les effets d'écran propres à l'univers** (encre du Kraken, parasite sur le visage…) passent par une superposition dédiée dans `index.html` et `style.css`.
- **Le menu principal reste neutre.** Il est commun à toutes les cartes (style de `:root` dans `style.css`). La seule touche de l'univers y est sa carte de sélection, écrite dans sa police et sa couleur.
- **Le test `tests/worlds.test.js` vérifie ces règles** : bloc `hud` complet, police et accent uniques, textes requis présents.
- **Le thème d'interface se propose dans le plan de la carte** (Claude Doc), puis se valide avec l'utilisateur en jeu, comme les autres phases.
