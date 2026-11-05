# Architecture

AR Football Tactics s'exécute entièrement dans le navigateur : des fichiers statiques servis en HTTPS par GitHub Pages, sans serveur applicatif ni étape de compilation.

## Modules

| Fichier | Rôle | Patron |
| --- | --- | --- |
| `src/main.js` | Assemble la scène, les équipes et l'interface, puis lance la boucle de rendu | |
| `src/scene.js` | Moteur de rendu, caméra, lumières, contrôles d'orbite, groupe racine `pitchGroup` | |
| `src/pitch.js` | Plateau, gazon texturé (lignes tracées sur un canvas), buts | |
| `src/formations.js` | Une classe par formation, qui calcule les 11 positions | Strategy |
| `src/players.js` | Crée un pion selon l'équipe : couleur, numéro, orientation | Factory |
| `src/team.js` | Place les 11 joueurs d'une équipe selon sa formation | |
| `src/ball.js` | Ballon | |
| `src/xr-support.js` | Détecte `immersive-ar` et met à jour le badge d'état | |
| `src/dev-emulator.js` | Installe l'émulateur IWER quand l'adresse contient `?iwer` | |
| `src/pwa.js`, `sw.js` | Installation de l'application et cache hors-ligne | |
| `src/config.js` | Constantes partagées : dimensions, échelle, équipes, couleurs | |

Les patrons Command (annulation, sprint 5) et Observer (interface abonnée aux événements de la scène, sprints 4 et 5) restent à mettre en place.

## Graphe de scène

```text
scene
├── lumières            hémisphérique et directionnelle, sans ombres portées
├── table               vue 3D hors AR seulement
└── pitchGroup          groupe racine : le déplacer ou l'ancrer déplace tout le terrain
    ├── pitch           plateau, gazon et buts
    ├── team-blue       11 joueurs
    ├── team-red        11 joueurs
    └── ball
```

Chaque joueur est un `THREE.Group` qui contient un socle, une flèche d'orientation, un corps en capsule, un numéro (sprite toujours tourné vers la caméra) et une zone de sélection invisible nommée `hitbox`. Son `userData` donne l'équipe, le numéro et le poste.

## Repère et unités

- L'unité est le mètre. Le terrain réel de 105 × 68 m devient 0,6 × 0,389 m (échelle d'environ 1/175) : il se posera tel quel sur une table en AR.
- Le gazon est le plan y = 0. L'axe X suit la longueur du terrain, l'axe Z sa largeur.
- L'équipe bleue attaque vers +X, l'équipe rouge vers −X.
- Les formations utilisent un repère normalisé propre à chaque équipe : x = 0 sur sa ligne de but et x = 0,5 sur la ligne médiane ; y = 0 sur son flanc gauche et y = 1 sur son flanc droit. `toPitchCoordinates` convertit ces positions en coordonnées de la scène.
- Les lignes suivent les mesures IFAB. Les pions (1,8 cm de diamètre au socle, 2,8 cm de haut) et les buts sont exagérés pour rester lisibles sur une table.

## Mise en cache

| Ressources | Stratégie | Raison |
| --- | --- | --- |
| `src/vendor/`, `assets/` | Cache d'abord | Elles ne changent pas d'une version à l'autre |
| Page, code, styles | Réseau d'abord, repli sur le cache | Une mise à jour arrive dès que l'appareil est en ligne |

Tout nouveau fichier de l'application doit être ajouté à `APP_SHELL` dans `sw.js`. Incrémenter `CACHE_VERSION` quand une bibliothèque ou une ressource change.
