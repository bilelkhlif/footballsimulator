# Règles des flèches tactiques

Ce document fixe ce qu'une flèche de passe ou de course a le droit d'être. Il répond à une remarque de l'évaluation : l'application laissait tracer des flèches sans logique, par exemple une passe partie du gazon, d'un joueur sans ballon, ou qui sortait du terrain.

Les règles sont vérifiées **avant** toute action. Une flèche refusée ne devient jamais une commande : elle n'entre donc ni dans le tableau ni dans l'historique (Annuler, Rétablir).

## 1. Sens des flèches

Le sens vient du tableau tactique du sprint 5 ([sprint-5.md](sprint-5.md)) :

| Flèche | Ce qu'elle représente | Dessin |
| --- | --- | --- |
| Passe | Le trajet du ballon | Trait plein, doré |
| Course | Le déplacement d'un joueur | Tirets, blancs |

Le ballon est un objet du tableau, avec sa propre place. Le **porteur** est le joueur le plus proche du ballon, à moins de 2,5 cm. Cela fait environ 4,4 m sur un vrai terrain, soit moins de deux zones de sélection de pion. Ce seuil est une convention de sélection adaptée aux pions agrandis, pas une mesure de possession réelle. Le tableau permet aussi de poser le ballon exactement aux pieds d’un joueur.

## 2. Règles

| N° | Règle | Raison du refus (code) | Message affiché |
| --- | --- | --- | --- |
| R1 | Une passe part du ballon, de son porteur ou de l'arrivée d'une passe déjà tracée (passe enchaînée) | `pass-needs-ball` | « Une passe part du ballon : touchez le ballon ou son porteur. » |
| R2 | Une course part d'un joueur | `run-needs-player` | « Une course part d'un joueur : touchez un joueur. » |
| R3 | L'arrivée est sur le terrain, lignes comprises ; la bande de gazon autour n'en fait pas partie | `off-pitch` | « Arrivée hors du terrain : visez l'intérieur des lignes. » |
| R4 | Le départ est sur le plateau. Un joueur ou le ballon peuvent être hors des lignes, par exemple pour une touche | `start-off-board` | « Départ hors du plateau. » |
| R5 | Une flèche mesure au moins 2 cm (environ 3,5 m réels) | `too-short` | « Flèche trop courte : visez plus loin. » |
| R6 | Coordonnées finies : ni NaN ni infini | `invalid-point` | « Point invalide : touchez de nouveau le terrain. » |
| R7 | Pas de doublon : même type, départ et arrivée à moins de 5 mm d'une flèche déjà tracée | `duplicate` | « Cette flèche est déjà tracée. » |
| R8 | Quand le passeur est connu, une passe ne s'arrête pas sur un adversaire | `pass-to-opponent` | « Passe vers un adversaire : visez un partenaire ou un espace libre. » |
| R9 | Un rayon qui ne touche ni le terrain ni un objet ne fait rien | `missed` | « Visez le terrain. » |

Si plusieurs joueurs sont dans le rayon de 2,5 cm autour du ballon, seul le porteur retenu par `findCarrier` peut partir de ce ballon. Un autre joueur proche ne peut pas se substituer à lui. Les arrivées de passes déjà tracées restent des départs indépendants : un enchaînement permis est conservé même si le ballon est plus près du joueur touché. Ce cas a révélé un défaut lors de la reprise ; le test de régression le refuse avant la correction, puis vérifie le porteur et l’enchaînement.

Deux règles de geste complètent ce tableau :

- **Toucher de nouveau le départ annule le tracé.** Cela vaut pour le ballon, le joueur qui court ou le passeur. Ce toucher ne crée donc jamais une autre action, comme une passe du porteur à lui-même.
- **Un second toucher au même endroit, en moins de 350 ms, est ignoré.** C'est un double toucher involontaire. Après un changement d'outil ou un abandon, le toucher suivant est traité normalement.

### Arrivée précise et receveur explicite

- Une arrivée touchée **sur un joueur** s'accroche à sa place. Ce joueur est le **receveur** : il est entouré dans l'aperçu, et le message final le nomme (« Passe vers le n° 7 des Bleus tracée. »).
- Une arrivée de passe touchée à moins de 1,2 cm de la **fin d'une course** s’accroche à cette fin. Cet accrochage est géométrique : les flèches enregistrent leurs points, sans identité de coureur. Il ne prouve donc pas que la course appartient à un partenaire ; aucun receveur explicite n’est déduit.
- Une arrivée touchée ailleurs est une **passe dans l'espace** : le point du gazon est pris tel quel.

### Qui est le passeur ?

| Départ touché | Départ de la flèche | Passeur |
| --- | --- | --- |
| Le ballon | Le ballon | Le porteur, s'il y en a un ; sinon inconnu |
| Le porteur du ballon | Le ballon (pas ses pieds) | Ce joueur |
| Le receveur d'une passe tracée | L'arrivée de cette passe | Ce joueur |
| Le gazon, à moins de 1,5 cm de l'arrivée d'une passe | Cette arrivée | Le joueur le plus proche, s'il y en a un ; sinon inconnu |
| Un autre joueur, ou le gazon ailleurs | Refusé (R1) | — |

Quand le passeur est inconnu, par exemple pour un ballon arrêté sur coup franc sans joueur à côté, R8 ne s'applique pas : l'application ne sait pas quelle équipe joue le ballon.

### Dribble, centre et tir (version 0.4)

Trois gestes du porteur s'ajoutent à la passe. Ils partent comme elle du ballon, de son porteur ou de l'arrivée d'une flèche de ballon déjà tracée. Leurs zones suivent les mesures IFAB du terrain réel de 105 × 68 m.

| Flèche | Départ | Arrivée | Refus |
| --- | --- | --- | --- |
| Dribble, pointillés orange | Le ballon, avec un porteur | Un point du terrain | Ballon sans porteur : « Un dribble part d’un porteur » |
| Centre, cyan | Un couloir (à plus de 20,16 m de l'axe, hors de la largeur de la surface), dans le dernier tiers (à moins de 35 m de la ligne de but adverse) | Un point de la surface de réparation adverse (40,32 × 16,5 m), ou un partenaire | Départ dans l'axe, départ trop loin, arrivée hors de la surface, receveur adverse |
| Tir, violet épais | Le ballon, à 40 m au plus du centre du but | Entre les poteaux (7,32 m), à moins de 2,5 m de la ligne de but ; un toucher sur le but lui-même est ramené sur la ligne | À côté du poteau, tir de plus de 40 m, tir vers son propre but |

Le but visé est celui de l'adversaire du porteur ; sans porteur, celui du côté de l'arrivée. Une passe peut partir de l'arrivée d'un dribble ou d'un centre (une remise après un centre, par exemple). Un tir termine l'action : son arrivée n'est pas un départ.

## 3. Ce qui reste possible, volontairement

Aucune règle du football n'est inventée. Restent possibles :

- passes longues, transversales, centres, passes en retrait vers son propre but ;
- passes enchaînées (une-deux, combinaisons), et plusieurs passes possibles depuis le même ballon ;
- courses en diagonale, courses qui se croisent, course jusqu'à la place d'un adversaire (pressing) ;
- position de hors-jeu apparente, joueurs qui se chevauchent, trajectoires qui traversent un joueur.

L'application ne juge ni le hors-jeu, ni les contacts, ni les interceptions. Elle ne sait pas à quel moment part la passe, ni où est chaque joueur à cet instant. Ces règles demanderaient un modèle de jeu qu'elle n'a pas.

## 4. Ce que voit l'utilisateur

| Moment | Retour |
| --- | --- |
| Outil Passe choisi | Anneaux dorés pulsés aux départs possibles : le ballon, l'arrivée des passes tracées |
| Départ refusé | Message en rouge dans le bandeau d'aide ; rien ne commence |
| Départ posé | Disque au départ ; le bandeau nomme le passeur ou le coureur ; bouton « Abandonner le tracé » |
| Pendant la visée (souris, doigt posé, AR) | Aperçu de la flèche aux couleurs de son type, cerclé à l'arrivée ; receveur entouré. **Rouge** si le toucher serait refusé |
| Arrivée refusée | Message en rouge ; le départ reste posé, pour viser ailleurs |
| Flèche tracée | Message doré ; prêt pour la flèche suivante |
| Annuler, Rétablir, Réinitialiser, ou changer d'outil pendant un tracé | Le tracé est abandonné et l'interface le dit : son départ a pu bouger ou disparaître |

L'aperçu et le toucher passent par **les mêmes fonctions** : ce que montre l'aperçu est ce que fera le toucher.

## 5. Exemples d'actions désormais impossibles

1. Une passe tracée depuis le gazon, loin du ballon.
2. Une passe tracée depuis un joueur qui n'a pas le ballon.
3. Une course qui part du ballon, ou d'un point vide du gazon.
4. Une flèche qui s'arrête sur la bande de gazon, derrière la ligne de touche ou de but.
5. Une passe vers un joueur debout hors des lignes : le ballon sortirait.
6. Une passe du porteur vers un adversaire.
7. Une passe du porteur à lui-même, ou une flèche de longueur nulle.
8. La même flèche tracée deux fois par un double toucher.
9. Une flèche aux coordonnées NaN ou infinies, quelle que soit son origine.
10. Une flèche partie de l'ancienne place du ballon, après « Annuler » pendant le tracé.
11. Une flèche refusée qui entrerait dans l'historique.

## 6. Repère du terrain

Tous les points sont exprimés dans le repère du terrain (`pitchGroup`) : x le long du terrain, z en largeur, en mètres. Le rayon du toucher est ramené dans ce repère par l'inverse de la matrice monde du terrain ([raycasting.mjs](../src/raycasting.mjs)). Les règles donnent donc le même résultat quand le terrain est tourné, déplacé, incliné ou ancré en AR. Des tests le vérifient sur un terrain tourné de 25°, puis sur un terrain tourné de -130° et incliné.

## 7. Où c'est écrit, où c'est testé

| Élément | Fichier |
| --- | --- |
| Règles, fonctions pures sans three.js | [src/arrow-rules.mjs](../src/arrow-rules.mjs) : `resolveArrowStart`, `resolveArrowEnd`, `validateArrow`, `findCarrier`, `passOrigins` |
| Dernière garde du tableau : R3 à R7 | [src/tactics-board.mjs](../src/tactics-board.mjs) : `addArrow`, `isOnPitch`, `sameArrowPath` |
| Gestes, aperçu, abandon, double toucher | [src/tactical-interaction.mjs](../src/tactical-interaction.mjs) |
| Aperçu rouge ou valide, receveur, départs possibles | [src/tactical-view.mjs](../src/tactical-view.mjs), [src/tactical-arrows.mjs](../src/tactical-arrows.mjs) |
| Tests des règles, sans moteur de rendu | [tests/unit/arrow-rules.test.mjs](../tests/unit/arrow-rules.test.mjs) (16 tests) |
| Tests des gestes : vue 3D, AR, terrain tourné et incliné | [tests/unit/tactical-interaction.test.mjs](../tests/unit/tactical-interaction.test.mjs) |
| Tests dans la vraie page, souris et clavier | [tests/run-tests.mjs](../tests/run-tests.mjs), `testArrowRules` |

Les constantes sont en tête de `src/arrow-rules.mjs` et de `src/tactics-board.mjs` :

| Constante | Valeur |
| --- | --- |
| `POSSESSION_RADIUS` | 2,5 cm |
| `ORIGIN_SNAP_RADIUS` | 1,5 cm |
| `RUN_END_SNAP_RADIUS` | 1,2 cm |
| `MIN_ARROW_LENGTH` | 2 cm |
| `DUPLICATE_TOLERANCE` | 5 mm |
| `LINE_TOLERANCE` | 1 mm |
| `REPEAT_TAP_MS` | 350 ms |
