# Conformité au cahier des charges

Audit final du dépôt, section par section, le 17 novembre 2026, sur `main`. Chaque exigence du cahier des charges y est reliée à sa preuve dans le dépôt, à son niveau de validation et à ce qu'il reste à faire.

**Validation** : **A** automatisée (tests unitaires et de bout en bout, `npm test`) ; **É** émulée (vraie session WebXR de Chrome sur PC, émulateur IWER) ; **P** physique (téléphone réel) ; **D** document présent dans le dépôt.

**Statut** :

- **PASS** : livré et vérifié au niveau que l'exigence demande.
- **PARTIAL** : livré, mais la mesure sur téléphone qu'exige le cahier reste à faire.
- **MISSING** : non livré.

Les essais P0 à P7 cités dans la dernière colonne sont décrits dans le protocole physique de [recette.md](recette.md#5-protocole-de-validation-physique).

## Bilan

| Statut | Exigences | Part |
| --- | ---: | ---: |
| PASS | 49 | 87,5 % |
| PARTIAL | 6 | 10,7 % |
| MISSING | 1 | 1,8 % |
| **Total** | **56** | 100 % |

Conformité stricte (PASS seulement) : **87,5 %**. En comptant une exigence partielle pour moitié : **92,9 %**.

Les sept écarts restants ne demandent plus de code. Six sont des mesures sur téléphone : stabilité d'une minute, 9 essais sur 10, 30 images par seconde, scénario de démonstration répété en vrai, et l'environnement de test physique que ces mesures supposent. Le septième est la vidéo, à tourner par l'équipe.

## Matrice

| § | Exigence | Preuve dans le dépôt | Valid. | Statut | Action restante |
| --- | --- | --- | --- | --- | --- |
| 1.4 | Objectifs 1 à 7 : session AR, hit test, terrain d'environ 60 × 40 cm, formations, raycasting, flèches, hors-ligne | Couverts par BF1 à BF7 et la PWA ; terrain de 60 × 38,9 cm (`src/config.js`) | A, É | PASS | — |
| 2.1 | Acteurs : entraîneur, joueur, créateur de contenu, jury | Diagramme de cas d'utilisation ([uml.md](uml.md)) | D | PASS | — |
| 2.2 | BF1 Démarrer une session AR (« Entrer en AR ») | `src/xr-session.js` ; 16 tests unitaires ; cinq entrées et sorties émulées de suite | A, É, P* | PASS | Confirmer sur la version finale (P1) |
| 2.2 | BF2 Réticule sur la surface détectée | `src/ar-surface.js`, `src/reticle.js` : hit test depuis l'espace `viewer` | A, É | PASS | Confirmer sur une vraie table (P1) |
| 2.2 | BF3 Poser le terrain d'un toucher | `src/ar-surface.js` : pose sur le résultat du hit test, puis `frame.createAnchor` | A, É | PASS | P1, P2 |
| 2.2 | BF4 Formation de chaque équipe (4-4-2, 4-3-3, 3-5-2, plus 4-2-3-1) | `src/formations.js`, `src/formation-panel.js` ; au millimètre, en 3D et en AR émulée | A, É | PASS | P5 |
| 2.2 | BF5 Sélectionner puis déplacer un joueur | `src/raycasting.js`, `src/tactical-interaction.js` ; 0,000 mm en 3D, au doigt et en AR émulée | A, É | PASS | Critère 9 sur 10 : P3 |
| 2.2 | BF6 Déplacer le ballon | `src/ball.js`, `MoveBallCommand` ; 0,000 mm | A | PASS | P3 (essais sur le ballon) |
| 2.2 | BF7 Flèche de passe ou de course | `src/tactical-arrows.js` ; passe avec aperçu en AR émulée | A, É | PASS | P5 |
| 2.2 | BF8 Annuler, réinitialiser | `src/commands.js` ; annulation exacte, formations comprises | A, É | PASS | P5 |
| 2.2 | BF9 Animer une action pas à pas (bonus) | `src/tactical-sequence.js`, `src/sequence-player.js` ; lecture exacte, en AR émulée sur un terrain tourné et ancré | A, É | PASS | P6 |
| 2.3 | Performance : 30 images par seconde sur un téléphone de milieu de gamme | `?diagnostics` ; banc sur PC : 62,5 images/s en AR émulée, processeur ralenti 4 fois (indicatif) | A | PARTIAL | Mesurer sur téléphone (P4) |
| 2.3 | Ergonomie : interface claire, gros boutons, une main | Boutons de 48 px au moins ; barre d'outils vérifiée dans un écran de 360 px | A | PASS | — |
| 2.3 | Accessibilité : URL ou QR code, sans installation obligatoire | https://bilelkhlif.github.io/footballsimulator/ ; QR code dans la présentation et le manuel | D | PASS | — |
| 2.3 | Disponibilité hors-ligne après le premier chargement | Service Worker à version de contenu ; rechargements hors-ligne testés | A | PASS | Confirmer (P7) |
| 2.3 | Sécurité : HTTPS exclusivement | GitHub Pages en HTTPS ; WebXR et le Service Worker exigent un contexte sécurisé | A | PASS | — |
| 2.5 | Hors périmètre : ni match simulé, ni IA, ni multijoueur, ni compte, ni serveur, ni occlusion, ni store | Application cliente seule ; l'action animée est saisie par l'utilisateur | D | PASS | — |
| 3.1 | Architecture sans serveur, fichiers statiques sur GitHub Pages | Dépôt servi tel quel, sans compilation | A | PASS | — |
| 3.2 | Terrain `PlaneGeometry` avec la texture des lignes ; groupe racine unique | `src/pitch.js` (lignes IFAB sur un canvas), `pitchGroup` dans `src/scene.js` | A | PASS | — |
| 3.2 | Joueurs : capsules colorées numérotées ; ballon : sphère blanche | `src/players.js` (`CapsuleGeometry`, numéros sur canvas, `InstancedMesh`), `src/ball.js` | A | PASS | — |
| 3.2 | Flèches « avec `ArrowHelper` ou `THREE.Line` » | Maillages plats dans `pitchGroup` : épaisseur lisible et tirets pour les courses ; écart expliqué dans [sprint-5.md](sprint-5.md#8-les-flèches-tactiques) | A | PASS (écart justifié) | — |
| 3.3 | Session AR : `navigator.xr.requestSession('immersive-ar')` | `src/xr-session.js` : `local-floor` et `webgpu` exigés ; `hit-test`, `anchors`, `dom-overlay` facultatifs | A, É, P* | PASS | — |
| 3.3 | Hit testing : `frame.getHitTestResults()` et réticule | `src/ar-surface.js` : `requestHitTestSource`, source annulée en fin de session | A, É | PASS | P1 |
| 3.3 | Ancrage spatial : `XRAnchor` | `frame.createAnchor`, `trackedAnchors`, ancre gardée quand le suivi s'interrompt, terrain recalé quand il reprend | A, É | PASS | P2 |
| 3.3 | Raycasting : `THREE.Raycaster` | Rayon du `targetRaySpace` de la source d'entrée en AR, de la caméra hors AR ; zones de sélection invisibles | A, É | PASS | P3 |
| 3.3 | DOM Overlay : boutons HTML sur la vue AR | `domOverlay.root` ; `beforexrselect` arrête les touchers sur l'interface | A, É | PASS | Confirmer en P5 |
| 3.3 | PWA : `manifest.json` et `sw.js` | Installable ; coquille de 48 entrées, à version de contenu | A | PASS | P7 |
| 3.4 | Strategy : une classe par formation | `FormationStrategy` et 4 sous-classes (`src/formations.js`) | A | PASS | — |
| 3.4 | Command : chaque action est une commande | 7 commandes et `CommandHistory` (`src/commands.js`) | A | PASS | — |
| 3.4 | Observer : l'interface suit la scène | `EventEmitter` (`src/events.js`) : session, pose, tableau, interaction, séquence | A | PASS | — |
| 3.4 | Factory : joueurs selon l'équipe | `PlayerFactory` et `TeamMeshes` (`src/players.js`) | A | PASS | — |
| 4.1 | Scénario de démonstration, étapes 1 à 8 | Rejoué par les tests en vue 3D et en AR émulée ; script de la vidéo | A, É | PARTIAL | Répéter sur téléphone devant une table (P1 à P5) |
| 4.2 | Smartphone Android ARCore avec Chrome | AR rendue en WebGPU réussie sur le TECNO POVA 6 Pro 5G le 14 novembre ; version finale non testée | P* | PARTIAL | Protocole P0 à P7 |
| 4.2 | Émulateur sur PC ; mesure des images par seconde | IWER 2.7.0 (`?iwer`), `?diagnostics`, `npm run bench` | A, É | PASS | — |
| 4.3 | Terrain stable pendant 1 minute | Pose de l'ancre inchangée en émulation ; suivi interrompu, puis rétabli (test unitaire) | A, É | PARTIAL | P2 |
| 4.3 | 11 joueurs bien placés | 4 formations × 2 équipes : numéros 1 à 11, chacun dans sa moitié, hors du rond central, écart minimal 7,1 cm | A, É | PASS | — |
| 4.3 | Sélection et déplacement : 9 essais sur 10 | 0,000 mm à chaque essai automatisé | A, É | PARTIAL | P3 |
| 4.3 | Au moins 30 images par seconde | 62,5 images/s en AR émulée sur PC (indicatif) | A | PARTIAL | P4 |
| 4.3 | Lancement hors-ligne après une première visite | Tests : rechargement hors-ligne à la racine et sous le sous-chemin de GitHub Pages, réseau très lent, après mise à jour ; site publié rechargé hors-ligne le 16 novembre | A | PASS | Confirmer (P7) |
| 5.1, 5.3 | Sprints d'une semaine ; planning S1 à S6 | Six comptes rendus ([sprint-1.md](sprint-1.md) à [sprint-6.md](sprint-6.md)), une pull request par sprint | D | PASS | — |
| 5.2 | Tests et rapport final réalisés par l'équipe | 261 tests automatisés ; [rapport-final.md](rapport-final.md) | A, D | PASS | Essais physiques par l'équipe (P0 à P7) |
| 5.4 | Cahier conceptuel : UML de cas d'utilisation, de séquence, de déploiement | [uml.md](uml.md), avec un diagramme des classes ; les 6 diagrammes rendus par Mermaid 11.4.1 | D | PASS | — |
| 5.4 | Code source : `index.html`, `main.js`, `formations.js`, `manifest.json`, `sw.js`, dossier `/assets` | Tous présents (`src/main.js`, `src/formations.js`) ; textures et pions générés par le code, donc aucun GLB ; `/assets` contient les icônes et les captures | D | PASS (écart justifié) | — |
| 5.4 | Documentation technique : installation, déploiement, architecture | [README](../README.md) (lancer, tester, déployer), [architecture.md](architecture.md), [guide-du-code.md](guide-du-code.md) | D | PASS | — |
| 5.4 | Manuel utilisateur illustré, en AR | [manuel-utilisateur.md](manuel-utilisateur.md) | D | PASS | — |
| 5.4, 7.3 | Vidéo de 5 minutes au plus, voix off, sans musique, diapositive d'ouverture (titre, équipe, date) | Storyboard et voix off : [video-demonstration.md](video-demonstration.md) ; diapositive d'ouverture : [presentation/](presentation/) | — | MISSING | Tourner et monter la vidéo (équipe) |
| 6.1 | HTTPS obligatoire ; AR sur Chrome Android avec ARCore | GitHub Pages ; détection de l'AR et messages d'aide (`src/xr-support.js`) | A | PASS | — |
| 6.1 | Peu de polygones et de lumières pour 22 joueurs | 7 409 triangles, 2 lumières sans ombre portée, 55 appels de dessin | A | PASS | — |
| 6.2 | Hypothèses : un téléphone ARCore, du réseau au premier chargement, des formes simples | TECNO POVA 6 Pro 5G ; coquille en cache après la première visite ; pions géométriques | P*, A | PASS | — |
| 6.3 | Risques : émulateur, sélection imprécise, terrain qui dérive | IWER ; zones de sélection invisibles plus larges que les pions ; `XRAnchor` et conseil de surface texturée (manuel) | A, É, D | PASS | — |
| 6.3 | Risques : performance (`InstancedMesh`, une lumière) ; planning (BF1 à BF5 d'abord) | Pions instanciés au sprint 6 ; deux lumières, écart mesuré ; BF1 à BF5 livrés avant le bonus | A, D | PASS | — |
| 7.1 | En-tête de chaque fonction et bloc HTML/CSS ; noms explicites ; modules | `@responsable`, `@date`, `@role`, vérifiés par `tests/unit/documentation.test.mjs` ; `pitchGroup`, `hitTestSource` | A | PASS | — |
| 7.2 | Arborescence `/src`, `/assets`, `/docs` ; une branche par fonctionnalité ; commits fréquents ; chaque push fonctionnel | 12 pull requests fusionnées après relecture ; `npm test` à chaque sprint | D | PASS | — |
| 7.2 | Déploiement final sur GitHub Pages | https://bilelkhlif.github.io/footballsimulator/, déployé et vérifié | A | PASS | — |
| Enseignant | WebGPU sans repli WebGL ; boucle de rendu expliquée ; PWA installable | `src/webgpu.js` ; README, partie « La boucle de rendu » ; tests sans aucun contexte WebGL | A, D | PASS | — |
| Enseignant | ATTRIBUTION.md tenu à jour ; en-tête de chaque fonction | [ATTRIBUTION.md](../ATTRIBUTION.md) ; [convention](convention-de-documentation.md) | D, A | PASS | — |

\* Essais physiques des 12 et 14 novembre, sur les versions publiées à ces dates, avant les sprints 5 et 6.

Sections informatives, sans exigence vérifiable : §2.4 (contextes d'utilisation) et la conclusion du cahier.
