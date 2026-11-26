# Architecture

Football Simulator s'exécute entièrement dans le navigateur : des fichiers statiques servis en HTTPS par GitHub Pages, sans serveur applicatif ni étape de compilation.

Cette page résume l'architecture. Le détail de chaque fichier, avec les raisons des choix, est dans [guide-du-code.md](guide-du-code.md), celui de la session AR dans [sprint-2.md](sprint-2.md), celui du rendu WebGPU, de la pose sur une surface réelle et de la boucle de rendu dans [sprint-3.md](sprint-3.md), celui de l'interaction tactique (raycasting, flèches, patron Command) dans [sprint-5.md](sprint-5.md), et celui de la performance, de la séquence animée et de la PWA versionnée dans [sprint-6.md](sprint-6.md). Les diagrammes UML (cas d'utilisation, séquence, déploiement, classes) sont dans [uml.md](uml.md).

Le rendu passe par **WebGPU**, avec three.js r187, **sans repli WebGL** : sans WebGPU, l'application affiche un message au lieu du terrain.

## Modules

| Fichier | Rôle | Patron |
| --- | --- | --- |
| `src/main.mjs` | Assemble la scène, les équipes, l'AR et la PWA, puis lance la boucle de rendu | |
| `src/workspace-controller.mjs` | Espace actif, panneau ouvert, disponibilité avant la pose AR ; aucune donnée tactique | Observer (sujet) |
| `src/workspace-navigation.mjs` | Rail, panneaux persistants, focus, Retour navigateur, résumés de sélection / positions, états AR et PWA | Observer |
| `src/webgpu.mjs` | Moteur de rendu WebGPU sans repli WebGL (`WebGpuOnlyRenderer`), causes d'échec | |
| `src/webgl-test-mode.mjs` | Mode test WebGL, seulement avec `?webgl` dans l'adresse : réservé aux tests, ce n'est pas un repli | |
| `src/scene.mjs` | Moteur de rendu, caméra, lumières, contrôles d'orbite, groupe racine `pitchGroup` | |
| `src/pitch.mjs` | Plateau, gazon texturé (lignes tracées sur un canvas), buts | |
| `src/formations.mjs` | Une classe par formation (4-4-2, 4-3-3, 3-5-2, 4-2-3-1, 4-1-4-1, 3-4-3, 5-3-2), qui calcule les 11 positions | Strategy |
| `src/tactics-board.mjs` | État tactique : formation de chaque équipe (sprint 4), place de chaque joueur et du ballon, flèches (sprint 5) ; refuse un état incohérent ; émet `formationchange` et `change` | Observer (sujet) |
| `src/commands.mjs` | Déplacer un joueur ou le ballon, tracer une flèche, changer de formation, réinitialiser : des commandes annulables ; historique Annuler / Rétablir (sprint 5) ; ajouter une image clé, effacer la séquence (sprint 6) | Command |
| `src/tactical-sequence.mjs` | Images clés de la séquence animée : places des joueurs et du ballon dans le repère du terrain, 12 au plus ; émet `change` (sprint 6, BF9) | Observer (sujet) |
| `src/sequence-player.mjs` | Lecture de la séquence : temps écoulé, interpolation, pause, vitesse ; s'arrête à tout changement du tableau ou de la séquence (sprint 6) | Observer |
| `src/sequence-panel.mjs` | Panneau de la séquence : Image clé, Lecture / Pause, Recommencer, vitesses, Effacer, ligne d'état (sprint 6) | Observer |
| `src/arrow-rules.mjs` | Fonctions pures : départ, arrivée, géométrie et logique des passes et courses, appelées avant les commandes | |
| `src/keyboard-shortcuts.mjs` | Raccourcis des outils, abandon et historique, hors champs de saisie | |
| `src/onboarding.mjs` | Aide non modale à la première visite, réouverture et focus | |
| `src/tactical-interaction.mjs` | Machine à états de l'interaction : un rayon devient une sélection, un déplacement ou une flèche (sprint 5) | Observer (sujet) |
| `src/raycasting.mjs` | Rayon depuis la caméra ou depuis une pose WebXR, zones de sélection, plan du terrain et changement de repère (sprint 5) | |
| `src/pointer-input.mjs` | Souris et doigt hors AR : tap, survol (sprint 5) | |
| `src/xr-input.mjs` | Touchers en AR : rayon du `targetRaySpace` ; sépare la pose du terrain de l'interaction tactique (sprint 5) | |
| `src/tactical-view.mjs` | La scène suit le tableau tactique : joueurs, ballon, flèches, anneau de sélection, aperçu (sprint 5) | Observer |
| `src/tactical-arrows.mjs` | Flèches de passe et de course en 3D, dans le repère du terrain, et leur aperçu (sprint 5) | |
| `src/tactical-toolbar.mjs` | Barre d'outils (modes, Annuler, Rétablir, Réinitialiser) et bandeau d'aide (sprint 5) | Observer |
| `src/diagnostics.mjs` | Mode diagnostic, avec `?diagnostics` : images par seconde, durée d'une image, rendu, session XR, appels de dessin, triangles (sprint 5) ; temps CPU par image et mémoire GPU estimée (sprint 6) | |
| `src/formation-panel.mjs` | Boutons de formation, créés depuis le registre des stratégies ; s'abonne au tableau tactique (sprint 4) | Observer |
| `src/formation-transition.mjs` | Places cibles d'une formation et déplacement des joueurs, image par image (sprint 4) | |
| `src/players.mjs` | Crée un pion selon l'équipe : couleur, numéro, orientation ; depuis le sprint 6, les maillages instanciés de chaque équipe (`TeamMeshes`), qui dessinent socles, flèches et corps des 11 joueurs en 3 appels | Factory |
| `src/team.mjs` | Place les 11 joueurs d'une équipe selon sa formation ; donne à chacun le poste de son numéro (`assignFormationRoles`, `applyFormation`) | |
| `src/ball.mjs` | Ballon, avec sa zone de sélection invisible (sprint 5) | |
| `src/xr-support.mjs` | Détecte `immersive-ar` et met à jour le badge d'état | |
| `src/xr-session.mjs` | Ouvre et ferme la session `immersive-ar` rendue en WebGPU (`webgpu`, `local-floor` ; `hit-test`, `anchors`), la relie à three.js et signale son cycle de vie | Observer (sujet) |
| `src/events.mjs` | Émetteur d'événements : abonnement, désabonnement, notification | Observer |
| `src/ar-surface.mjs` | Hit test, réticule, toucher pour poser le terrain, ancre ; états de la pose | Observer (sujet) |
| `src/ar-view.mjs` | Passe la scène de la vue 3D à la vue AR, affiche le réticule, pose le terrain, le recale sur son ancre, et restaure la vue 3D | |
| `src/ar-placement.mjs` | Calcule la pose du terrain : sur la surface visée, ou devant l'utilisateur sans hit test | |
| `src/reticle.mjs` | Réticule de visée, matériau en TSL | |
| `src/render-loop.mjs` | Boucle de rendu : contrôles d'orbite hors AR ; en AR, cible XR alignée sur les vues et pose du terrain ; tâches de chaque image, avant et après le rendu (sprint 5), et au tout début de l'image (`beforeFrame`, sprint 6) | |
| `src/dev-emulator.mjs` | Installe l'émulateur IWER quand l'adresse contient `?iwer` | |
| `src/dev-xr-emulation.mjs` | Avec `?iwer` seulement : liaison WebXR/WebGPU, table virtuelle pour le hit test, toucher simulé par une manette visant le point cliqué, `beforexrselect` comme le DOM Overlay | |
| `src/pwa.mjs`, `sw.mjs` (et `sw.js` pour migrer les installations anciennes) | Service Worker et cache hors-ligne (coquille à version de contenu depuis le sprint 6), bouton d'installation, avis de nouvelle version, badge hors-ligne | |
| `src/config.mjs` | Constantes partagées : dimensions, échelle, équipes, couleurs | |

Le patron Observer est en place depuis le sprint 2 : `main.mjs` s'abonne aux événements `sessionstart`, `sessionend` et `sessionerror` de la session AR, et depuis le sprint 3 à l'événement `statechange` de la pose du terrain.

Les [sept espaces de coaching](espaces-coaching.md) partagent la même scène, le même tableau,
le même historique et la même séquence. Le contrôleur ne connaît que des identifiants d'interface.
Un changement d'espace masque et affiche des éléments existants : aucune copie du terrain,
aucun nouvel abonnement métier et aucune nouvelle boucle de rendu. La racine `#overlay` reste
la racine DOM Overlay de la session AR. Le canvas réserve la largeur du panneau, ou sa hauteur
en portrait ; le cadrage s'adapte en gardant la rotation choisie.

Depuis le sprint 5, une action de l'utilisateur suit toujours le même chemin, en quatre temps séparés :

```text
saisie                      interaction                 commande                 état                 scène
pointer-input.mjs  ─rayon─▶  tactical-interaction.mjs ─▶ commands.mjs  ─────────▶ tactics-board.mjs ─change─▶ tactical-view.mjs
xr-input.mjs                (machine à états)           (historique, Undo)       (Observer, sujet)          (Observer)
```

Depuis les retours de l’évaluation, `tactical-interaction.mjs` appelle les fonctions pures de `arrow-rules.mjs` avant de construire une commande. Un refus colore l’aperçu en rouge et ne modifie ni le tableau ni l’historique. `TacticsBoard.addArrow` garde une seconde protection géométrique. Voir les [règles exactes](regles-des-fleches.md).

La saisie ne fait que produire un rayon ; l'interaction ne dessine rien et ne modifie pas l'état elle-même ; les commandes ne connaissent ni la scène ni les gestes ; la scène ne fait que suivre l'état. Annuler, rétablir ou réinitialiser passe par le même chemin : la scène ne peut pas diverger de l'état tactique.

Depuis le sprint 6, une seule exception, voulue et bornée : pendant la lecture d'une séquence (`sequence-player.mjs`), la scène montre des places interpolées entre deux images clés, sans toucher au tableau ni à l'historique. Tout changement du tableau ou de la séquence arrête la lecture, et la scène rejoint le tableau (`TacticalView.returnToBoard`).

## Graphe de scène

```text
scene
├── lumières            hémisphérique et directionnelle, sans ombres portées
├── table               vue 3D hors AR seulement
├── reticle             réticule du hit test, en AR seulement (sprint 3)
└── pitchGroup          groupe racine : le déplacer ou l'ancrer déplace tout le terrain
    ├── pitch           plateau, gazon et buts
    ├── team-blue       11 joueurs : numéro et zone de sélection de chacun
    ├── team-red        11 joueurs
    ├── player-meshes-blue  socles, flèches et corps des Bleus : 3 InstancedMesh (sprint 6)
    ├── player-meshes-red   idem pour les Rouges
    ├── ball            avec sa zone de sélection invisible (sprint 5)
    ├── tactical-arrows flèches de passe et de course (sprint 5)
    ├── arrow-preview   aperçu de la flèche en cours de tracé
    ├── selection-ring  anneau sous le joueur ou le ballon sélectionné
    └── arrow-start     repère du départ de la flèche en cours
```

Chaque joueur est un `THREE.Group` qui contient son numéro (sprite toujours tourné vers la caméra) et une zone de sélection invisible nommée `hitbox`. Son `userData` donne l'équipe, le numéro et le poste. Jusqu'au sprint 5, il contenait aussi son socle, sa flèche d'orientation et son corps en capsule. Depuis le sprint 6, ces trois formes sont dessinées par les maillages instanciés de son équipe, à la pose de son `Group` : `TeamMeshes.update()` recopie, à chaque image, la matrice des joueurs qui ont bougé. Déplacer, animer ou sélectionner un joueur passe toujours par son `Group`.

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
| Coquille de l'application (`APP_SHELL` : page, code, styles, three.js, icônes, manifeste) | Installée d'un bloc dans le cache de sa version, puis cache d'abord | Une page ne mélange jamais deux versions, et se lance aussitôt, même sur un réseau lent ou coupé |
| Autres requêtes de la même origine (module de l'émulateur, autres pages) | Réseau d'abord, repli sur le cache, ou après 3 secondes sans réponse | Sans effet sur l'application elle-même |

Depuis le sprint 6, le cache s'appelle `football-simulator-<SHELL_VERSION>`. `SHELL_VERSION` est une empreinte SHA-256 du contenu des entrées de `APP_SHELL`, y compris les deux modules de navigation, écrite dans `sw.mjs` par `npm run shell-version` : un fichier modifié change `sw.mjs`, et le navigateur installe la nouvelle version, d'un bloc (`cache.addAll`, sans le cache HTTP). Le numéro `CACHE_VERSION`, incrémenté à la main jusqu'au sprint 5, n'existe plus. Deux règles, vérifiées par `npm test` : tout nouveau fichier de l'application est ajouté à `APP_SHELL`, et `SHELL_VERSION` est recalculée après chaque modification. Les modules de l'émulateur, chargés seulement avec `?iwer`, restent hors de la coquille.

Le fichier `sw.js` ne sert plus cette coquille : il migre les anciens enregistrements vers `sw.mjs`, sans gestionnaire `fetch`. Détail du cycle, des exceptions tierces et des limites de déploiement : [migration-mjs.md](migration-mjs.md).
