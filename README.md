# Football Simulator

Tableau tactique de football en réalité augmentée, accessible depuis un simple lien web.

Application web progressive (PWA) construite avec WebXR et three.js : elle pose un mini-terrain 3D d'environ 60 × 40 cm sur une vraie table, à travers la caméra d'un smartphone Android. Sans AR, elle s'utilise en vue 3D.

Projet du module de Réalité Étendue, SUP'COM, département SIA, année 2026–2027.

## Avancement

| Sprint | Contenu | État |
| --- | --- | --- |
| S1 | Dépôt, structure PWA, scène three.js : terrain et joueurs visibles hors AR | Terminé |
| S2 | Session `immersive-ar`, `XRWebGLLayer`, espace de référence `local-floor` | À faire |
| S3 | Hit testing, réticule, pose du terrain par un tap | À faire |
| S4 | Changement de formation (Strategy), deux équipes, ballon, boutons HTML | À faire |
| S5 | Sélection et déplacement des joueurs (raycasting), flèches, annulation (Command) | À faire |
| S6 | Service Worker finalisé, optimisation mobile, tests, vidéo ; bonus : animation | À faire |

Le compte rendu du sprint 1 est dans [docs/sprint-1.md](docs/sprint-1.md).

## Lancer l'application en local

Les modules JavaScript et le Service Worker exigent un serveur HTTP : ouvrir `index.html` directement depuis le disque ne fonctionne pas. Aucune installation ni compilation n'est nécessaire, three.js est copié dans `src/vendor/three/`.

```bash
npx serve .                    # puis ouvrir http://localhost:3000
python -m http.server 8080     # ou bien, puis ouvrir http://localhost:8080
```

Sous Windows, si le navigateur refuse les modules avec une erreur de type MIME, utiliser `npx serve`.

### Tester l'AR sur PC

Ajouter `?iwer` à l'adresse, par exemple `http://localhost:3000/?iwer`. L'émulateur IWER simule un casque Meta Quest 3 et le badge affiche « AR émulée (IWER) ».

- Une session `immersive-ar` s'ouvre, avec `local-floor` et les ancres.
- Le hit test demande en plus le module `@iwer/sem`, à décider au sprint 3.
- Le DOM Overlay n'est pas émulé : l'interface HTML se teste dans la vue 3D.

### Tester sur un téléphone Android

WebXR exige HTTPS. Deux possibilités :

1. **GitHub Pages** : Settings → Pages → Deploy from a branch → `main`, dossier `/ (root)`. L'application est alors servie à l'adresse `https://bilelkhlif.github.io/footballsimulator/`.
2. **Redirection de port USB** : brancher le téléphone, ouvrir `chrome://inspect/#devices` sur le PC et rediriger le port du serveur local. Sur le téléphone, `http://localhost:<port>` est alors un contexte sécurisé.

## Arborescence

```text
├── index.html           Page, carte d'import et interface superposée
├── manifest.json        Manifeste de la PWA
├── sw.js                Service Worker (cache hors-ligne)
├── src/
│   ├── main.js          Point d'entrée : assemble la scène et l'interface
│   ├── config.js        Dimensions, échelle, équipes et couleurs
│   ├── scene.js         Moteur de rendu, caméra, lumières, contrôles, pitchGroup
│   ├── pitch.js         Terrain : plateau, gazon, lignes et buts
│   ├── formations.js    Formations 4-4-2, 4-3-3 et 3-5-2 (Strategy)
│   ├── players.js       Fabrique de joueurs (Factory)
│   ├── team.js          Placement d'une équipe selon sa formation
│   ├── ball.js          Ballon
│   ├── xr-support.js    Détection de l'AR et badge d'état
│   ├── dev-emulator.js  Émulateur IWER, en développement seulement
│   ├── pwa.js           Enregistrement du Service Worker
│   ├── styles.css       Styles de l'interface
│   └── vendor/three/    three.js r186 (licence MIT)
├── assets/icons/        Icônes de l'application
└── docs/                Architecture et comptes rendus de sprint
```

L'architecture est détaillée dans [docs/architecture.md](docs/architecture.md).

## Règles de développement

Issues du cahier des charges (§7) :

- un commentaire d'en-tête pour chaque fonction JavaScript et chaque bloc HTML ou CSS ;
- des noms explicites : `pitchGroup`, `currentFormation`, `hitTestSource`, `selectedPlayer` ;
- une branche par fonctionnalité, fusionnée dans `main` après relecture ;
- des commits fréquents, et chaque push laisse l'application fonctionnelle ;
- tout nouveau fichier de l'application est ajouté à `APP_SHELL` dans `sw.js`.

## Équipe

| Membre | Responsabilités |
| --- | --- |
| Iyed Rachdi | Session WebXR, hit testing, ancrage du terrain |
| Bilel Khlif | Scène three.js, modélisation du terrain et des joueurs, formations |
| Ghassen Dallekji | Interface HTML, raycasting, PWA, documentation |

Encadrant : Dr. Ing. Mohamed-Bécha Kaâniche.

## Crédits

- [three.js](https://github.com/mrdoob/three.js) r186, licence MIT (`src/vendor/three/LICENSE`).
- [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) 2.7.0, Meta, licence MIT, chargé depuis jsDelivr en développement seulement.

La licence du projet reste à définir par l'équipe.
