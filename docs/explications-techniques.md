# Explications techniques

Quatre fiches courtes pour la soutenance : WebGPU, WebXR, génie logiciel, IA et vision par ordinateur.
Chaque fiche dit ce que fait le projet, où le voir dans le code, et ce qu'il ne fait pas. Les détails sont
dans [architecture.md](architecture.md), [guide-du-code.md](guide-du-code.md) et les comptes rendus de sprint.

## 1. WebGPU

**Ce que c'est.** L'API graphique moderne du navigateur, successeur de WebGL : files de commandes, pipelines
compilés à l'avance, shaders WGSL. three.js r187 la pilote par son `WebGPURenderer`.

**Dans le projet**

- **Sans repli WebGL.** Le `WebGPURenderer` de three.js bascule seul vers WebGL quand WebGPU manque ; la
  classe `WebGpuOnlyRenderer` (`src/webgpu.mjs`) reprend son constructeur sans cette branche. Sans WebGPU,
  l'application affiche la cause au lieu de dessiner autrement. Le mode `?webgl`
  (`src/webgl-test-mode.mjs`) ne sert qu'aux tests sur un téléphone sans WebGPU : aucun bouton n'y mène.
- **Boucle de rendu** (`src/render-loop.mjs`) : `renderer.setAnimationLoop` appelle une fonction à chaque
  image ; elle met à jour les contrôles ou la pose AR, les animations, les tâches de l'image, puis dessine.
  Aucune allocation dans la boucle en dehors du tracé d'une flèche.
- **Performance** : les 22 pions sont des `InstancedMesh` (trois appels de dessin par équipe) ; 115 → 55
  appels de dessin, 7 409 triangles, deux lumières sans ombre portée (`docs/sprint-6.md`).
- **Matériaux à nœuds (TSL)** : le réticule de l'AR est écrit en TSL (`src/reticle.mjs`), compilé en WGSL.
- **AR en WebGPU** : la session demande la fonctionnalité `webgpu` ; three.js crée la couche de projection
  par `XRGPUBinding`. Un défaut de three.js r187 (cible de rendu XR à deux couches sur un appareil à une
  vue) est contourné par son API publique (`matchXrTargetToViews`), sans modifier la bibliothèque.
- **Visualiseur** : un second rendu WebGPU dessine le terrain 3D par-dessus la vidéo. Une perte du
  périphérique WebGPU (processus GPU de Chrome perdu) arrête proprement le terrain 3D et relance la vidéo
  au lieu de laisser la page figée.

**Limites** : la liaison WebXR–WebGPU reste derrière un réglage de Chrome sur la plupart des téléphones ;
l'AR WebGPU a réussi sur un TECNO POVA 6 Pro 5G le 14 novembre, pas sur la version actuelle.

## 2. WebXR

**Ce que c'est.** L'API du navigateur pour la réalité augmentée et virtuelle : sessions, espaces de
référence, poses, entrées, détection de surfaces.

**Dans le projet** (`src/xr-session.mjs`, `src/ar-surface.mjs`, `src/xr-input.mjs`)

1. **Session** : `navigator.xr.requestSession('immersive-ar')` avec `local-floor` et `webgpu` exigés ;
   `hit-test`, `anchors` et `dom-overlay` facultatifs. Chaque échec (caméra refusée, ARCore absent) a son
   message.
2. **Hit test** : une source de hit test depuis l'espace `viewer` lance un rayon vers l'avant de la caméra ;
   le premier résultat sur une surface donne la pose du réticule.
3. **Pose et ancre** : un toucher pose le terrain sur le résultat, puis `frame.createAnchor` l'ancre au monde
   réel. Si le suivi s'interrompt, l'ancre est gardée et le terrain recalé quand il reprend.
4. **Raycasting** : en AR, le rayon vient du `targetRaySpace` de la source d'entrée (le doigt sur l'écran) ;
   hors AR, de la caméra. Le même `Raycaster` de three.js sert à la souris, au doigt et à l'AR ; le point
   touché est ramené dans le repère du terrain ancré.
5. **DOM Overlay** : les boutons HTML restent sur la vue AR ; `beforexrselect` empêche un toucher sur un
   bouton d'atteindre la scène.

**Vérification** : parcours AR complet dans la session WebXR émulée de Chrome et avec IWER (émulateur de
Meta) ; essais physiques des 12 et 14 novembre sur des versions antérieures. Une vérification émulée ne
remplace pas l'essai sur téléphone ([recette.md](recette.md)).

## 3. Génie logiciel

- **Patrons imposés par le cahier (§3.4)** : Strategy (une classe par formation, `src/formations.mjs`),
  Command (sept commandes et un historique pour annuler et rétablir, `src/commands.mjs`), Observer
  (`EventEmitter`, `src/events.mjs` : l'interface suit la session, la pose et le tableau), Factory
  (`PlayerFactory`, `src/players.mjs`).
- **État séparé du rendu** : le tableau tactique (`src/tactics-board.mjs`) ne connaît pas three.js ; la vue
  (`src/tactical-view.mjs`) le dessine. Les règles des flèches sont des fonctions pures (`src/arrow-rules.mjs`)
  vérifiées avant toute commande.
- **Modules ES (`.mjs`)**, sans compilation ; dépendances copiées et épinglées (`src/vendor/three-r187/`).
- **PWA** : coquille hors-ligne versionnée par l'empreinte de son contenu (`npm run shell-version`),
  installée d'un bloc ; délai d'attente du réseau pour qu'un réseau lent ne bloque pas le lancement ; les
  vidéos ne sont jamais mises en cache, et les requêtes de plage (HTTP 206) passent intactes.
- **Thèmes et interface** : jetons de conception (couleurs, rayons, ombres, flou, mouvement) définis pour
  les thèmes sombre et clair ; le mode automatique suit le système ; surfaces de verre seulement sur les
  éléments flottants, avec repli opaque sans `backdrop-filter` ; animations coupées si l'utilisateur
  demande moins de mouvement.
- **Tests** : tests unitaires (`node --test`), tests de navigateur dans Chrome (Playwright, AR émulée),
  tests Python (`unittest`). Des erreurs introduites volontairement vérifient que les tests échouent.
- **Traçabilité** : une branche et une pull request par évolution, revue avant fusion ; en-tête
  `@responsable`, `@date`, `@role` à chaque fonction, contrôlé par un test ; [ATTRIBUTION.md](../ATTRIBUTION.md)
  pour les sources, les assets et l'IA ; licences relevées et fichiers annotés au format REUSE.

## 4. IA et vision par ordinateur (visualiseur de match)

Extension hors cahier : le cahier exclut toute IA des joueurs du tableau (§2.5), et l'application évaluée
n'en contient pas. Le visualiseur analyse une **vidéo** de match.

| Étape | Méthode | Code |
|---|---|---|
| Détection | YOLOv8 entraîné par Roboflow Sports : joueurs, gardiens, arbitres ; modèle dédié au ballon | `detection.py` |
| Suivi | ByteTrack (bibliothèque trackers) ; coupures de plan détectées par PySceneDetect | `tracking.py` |
| Équipes | Plongements SigLIP du torse, réduits par UMAP, regroupés par KMeans en deux équipes, plus un groupe « autres » sans équipe quand il est démontré ; vote par trajectoire | `teams.py`, `streaming_teams.py` |
| Identités | Échanges d'identifiants corrigés aux contacts masqués quand les maillots le prouvent | `identity.py` |
| Calibration | 32 points clés du terrain (YOLOv8 pose), homographie RANSAC, erreur hors échantillon | `calibration.py` |
| Stabilisation | Filtre complémentaire : prédiction par le flux optique de la caméra, fusion avec la mesure, mesures aberrantes écartées | `calibration.py` (`HomographyStabilizer`) |
| Référence | Repères annotés sur des images clés, suivis par le flux optique ; écart de la calibration automatique mesuré | `reference_calibration.py` |
| Qualité | Couverture de calibration, continuité du suivi, déplacements invraisemblables, coupures, équilibre des équipes | `metrics.py` |
| Export | Segments JSON, manifeste avec empreintes, lecture sans serveur | `static_export.py` |

**Ce qui a été mesuré** : sur trois vidéos réelles, la stabilisation fait passer la part de déplacements
de plus de 12 m/s de 29,2 %, 52,9 % et 70,6 % à 5,0 %, 10,9 % et 11,2 %, sur les mêmes détections
([stabilisation-homographie.md](stabilisation-homographie.md)).

**Ce qui a été découvert** : sur deux des trois vues (derrière le but, plongeante), le modèle de points
clés confond des lignes de même forme ; l'erreur hors échantillon reste faible alors que tout le terrain est
faux. Le contrôle visuel l'a révélé : le visualiseur masque alors positions, vitesses et distances.

**Limites** : aucune vérité terrain ; numéros de maillot non lus (les étiquettes sont des identifiants de
suivi) ; ballon supposé au sol ; vitesses et distances exploratoires ; équipes parfois fausses sous un
éclairage contrasté. Le calcul reste local (serveur Python sur la boucle locale) ; poids et vidéos privées
ne sont jamais publiés.
