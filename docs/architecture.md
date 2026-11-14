# Architecture

Football Simulator s'exécute entièrement dans le navigateur : des fichiers statiques servis en HTTPS par GitHub Pages, sans serveur applicatif ni étape de compilation.

Cette page résume l'architecture. Le détail de chaque fichier, avec les raisons des choix, est dans [guide-du-code.md](guide-du-code.md), celui de la session AR dans [sprint-2.md](sprint-2.md), et celui du rendu WebGPU, de la pose sur une surface réelle et de la boucle de rendu dans [sprint-3.md](sprint-3.md).

Le rendu passe par **WebGPU**, avec three.js r187, **sans repli WebGL** : sans WebGPU, l'application affiche un message au lieu du terrain.

## Modules

| Fichier | Rôle | Patron |
| --- | --- | --- |
| `src/main.js` | Assemble la scène, les équipes, l'AR et la PWA, puis lance la boucle de rendu | |
| `src/webgpu.js` | Moteur de rendu WebGPU sans repli WebGL (`WebGpuOnlyRenderer`), causes d'échec | |
| `src/webgl-test-mode.js` | Mode test WebGL, seulement avec `?webgl` dans l'adresse : réservé aux tests, ce n'est pas un repli | |
| `src/scene.js` | Moteur de rendu, caméra, lumières, contrôles d'orbite, groupe racine `pitchGroup` | |
| `src/pitch.js` | Plateau, gazon texturé (lignes tracées sur un canvas), buts | |
| `src/formations.js` | Une classe par formation, qui calcule les 11 positions | Strategy |
| `src/players.js` | Crée un pion selon l'équipe : couleur, numéro, orientation | Factory |
| `src/team.js` | Place les 11 joueurs d'une équipe selon sa formation | |
| `src/ball.js` | Ballon | |
| `src/xr-support.js` | Détecte `immersive-ar` et met à jour le badge d'état | |
| `src/xr-session.js` | Ouvre et ferme la session `immersive-ar` rendue en WebGPU (`webgpu`, `local-floor` ; `hit-test`, `anchors`), la relie à three.js et signale son cycle de vie | Observer (sujet) |
| `src/events.js` | Émetteur d'événements : abonnement, désabonnement, notification | Observer |
| `src/ar-surface.js` | Hit test, réticule, toucher pour poser le terrain, ancre ; états de la pose | Observer (sujet) |
| `src/ar-view.js` | Passe la scène de la vue 3D à la vue AR, affiche le réticule, pose le terrain, le recale sur son ancre, et restaure la vue 3D | |
| `src/ar-placement.js` | Calcule la pose du terrain : sur la surface visée, ou devant l'utilisateur sans hit test | |
| `src/reticle.js` | Réticule de visée, matériau en TSL | |
| `src/render-loop.js` | Boucle de rendu : contrôles d'orbite hors AR ; en AR, cible XR alignée sur les vues et pose du terrain | |
| `src/dev-emulator.js` | Installe l'émulateur IWER quand l'adresse contient `?iwer` | |
| `src/dev-xr-emulation.js` | Avec `?iwer` seulement : liaison WebXR/WebGPU, table virtuelle pour le hit test, toucher simulé | |
| `src/pwa.js`, `sw.js` | Service Worker et cache hors-ligne, bouton d'installation, avis de nouvelle version, badge hors-ligne | |
| `src/config.js` | Constantes partagées : dimensions, échelle, équipes, couleurs | |

Le patron Observer est en place depuis le sprint 2 : `main.js` s'abonne aux événements `sessionstart`, `sessionend` et `sessionerror` de la session AR, et depuis le sprint 3 à l'événement `statechange` de la pose du terrain. Le patron Command (annulation) arrive au sprint 5.

## Graphe de scène

```text
scene
├── lumières            hémisphérique et directionnelle, sans ombres portées
├── table               vue 3D hors AR seulement
├── reticle             réticule du hit test, en AR seulement (sprint 3)
└── pitchGroup          groupe racine : le déplacer ou l'ancrer déplace tout le terrain
    ├── pitch           plateau, gazon et buts
    ├── team-blue       11 joueurs
    ├── team-red        11 joueurs
    └── ball
```

Chaque joueur est un `THREE.Group` qui contient un socle, une flèche d'orientation, un corps en capsule, un numéro (sprite toujours tourné vers la caméra) et une zone de sélection invisible nommée `hitbox`. Son `userData` donne l'équipe, le numéro et le poste.

## Repère et unités

- L'unité est le mètre. Le terrain réel de 105 × 68 m devient 0,6 × 0,389 m (échelle d'environ 1/175) : il se pose tel quel sur une table en AR.
- En AR, le repère est l'espace `local-floor` : origine au sol, sous la position de départ du téléphone. Le terrain posé a son gazon 8 mm au-dessus de la surface détectée, l'épaisseur du plateau.
- Le gazon est le plan y = 0. L'axe X suit la longueur du terrain, l'axe Z sa largeur.
- L'équipe bleue attaque vers +X, l'équipe rouge vers −X.
- Les formations utilisent un repère normalisé propre à chaque équipe : x = 0 sur sa ligne de but et x = 0,5 sur la ligne médiane ; y = 0 sur son flanc gauche et y = 1 sur son flanc droit. `toPitchCoordinates` convertit ces positions en coordonnées de la scène.
- Les lignes suivent les mesures IFAB. Les pions (1,8 cm de diamètre au socle, 2,8 cm de haut) et les buts sont exagérés pour rester lisibles sur une table.

## Mise en cache

| Ressources | Stratégie | Raison |
| --- | --- | --- |
| `src/vendor/`, `assets/` | Cache d'abord | Elles ne changent pas d'une version à l'autre ; la version de three.js est dans le nom de son dossier (`three-r187`) |
| Page, code, styles | Réseau d'abord, repli sur le cache, ou après 3 secondes sans réponse | Une mise à jour arrive dès que l'appareil est en ligne, sans bloquer sur un réseau lent |

`APP_SHELL` compte 33 fichiers, et `CACHE_VERSION` vaut 2 depuis le passage à three.js r187. Tout nouveau fichier de l'application doit être ajouté à `APP_SHELL` dans `sw.js`. Incrémenter `CACHE_VERSION` quand une bibliothèque ou une ressource change. Les modules de l'émulateur chargés seulement avec `?iwer` restent hors du cache.
