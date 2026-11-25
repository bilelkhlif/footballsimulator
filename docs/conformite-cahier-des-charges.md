# Conformité au cahier des charges — matrice des exigences

Matrice établie le 25 novembre 2026 sur la branche `feature/glass-demos-academique`, à partir du cahier des
charges du projet (« Tableau tactique de football en réalité augmentée », SUP'COM, INDP3-SIA 2026–2027).
**Ce n'est pas une grille de notation officielle** : c'est la liste des exigences écrites dans le cahier,
chacune reliée à son implémentation, à sa preuve, à son test et à sa responsabilité documentée.
L'audit historique du 17 novembre et son addendum du 23 novembre restent dans [conformite.md](conformite.md).

## Lire la matrice

**Statut**

| Code | Signification |
|---|---|
| **Vérifié** | Implémenté et vérifié au niveau que l'exigence demande. |
| **Partiel** | Implémenté, mais la vérification demandée par le cahier n'est pas complète (en général : mesure sur téléphone réel). |
| **Non fait** | Non implémenté. |
| **Sans objet** | Ne s'applique pas, avec la justification donnée. |

**Niveau de vérification** (colonne Test) : **A** automatisé (`npm test`, tests Python) ; **É** émulé (session
WebXR de Chrome sur PC, émulateur IWER) ; **P** physique (téléphone réel) ; **D** document présent.
Une vérification émulée ne vaut jamais validation physique de l'AR.

**Contributeur** : **Prévu** reprend la répartition du cahier (§5.2) ; **Réalisé** dit qui a fait le travail,
selon [ATTRIBUTION.md](../ATTRIBUTION.md) et [la matrice des contributions](matrice-contributions-academiques.md).
BK = Bilel Khlif (pilotage, consignes, revue, fusion, essais physiques) ; IR = Iyed Rachdi ; GD = Ghassen
Dalleji ; CC = Claude Code ; CX = Codex (assistants d'IA, déclarés). Aucune contribution n'est attribuée à
IR ou GD au-delà du cahier des charges sans leur confirmation.

## Bilan

| Statut | Exigences | Part |
|---|---:|---:|
| Vérifié | 44 | 81,5 % |
| Partiel | 8 | 14,8 % |
| Non fait | 1 | 1,9 % |
| Sans objet | 1 | 1,9 % |
| **Total** | **54** | 100 % |

Aucune des exigences restantes ne demande de code. Sept des huit exigences partielles attendent une mesure
sur téléphone réel : entrée en AR sur la version actuelle, 30 images par seconde (deux lignes du cahier),
scénario complet devant une table, appareil de test, stabilité d'une minute, 9 essais sur 10. La huitième est
la confirmation, par l'équipe, des contributions individuelles. L'exigence non faite est la vidéo, à tourner
par l'équipe. Protocole : [recette.md](recette.md#5-protocole-de-validation-physique). Les lignes « Vérifié
(émulé) » sont vérifiées dans l'émulation de Chrome et d'IWER, pas sur téléphone.

## 1. Objectifs et besoins fonctionnels (cahier §1.4, §2.2)

| Exigence | Statut | Implémentation | Preuve | Test | Contributeur |
|---|---|---|---|---|---|
| Objectifs 1 à 7 : session AR, hit test, terrain d'environ 60 × 40 cm, formations, raycasting, flèches, hors-ligne | Vérifié | Couverts par BF1 à BF8 et la PWA ; terrain de 60 × 38,9 cm | `src/config.mjs`, `src/pitch.mjs` | A, É | Prévu : équipe. Réalisé : CC sous le pilotage de BK |
| BF1 Démarrer une session AR (« Entrer en AR ») | Partiel | `requestSession('immersive-ar')`, `local-floor` et `webgpu` exigés | `src/xr-session.mjs` | A : `tests/unit/xr-session.test.mjs` ; É : parcours AR de `tests/run-tests.mjs` ; P : 12 et 14 novembre sur des versions antérieures | Prévu : IR. Réalisé : CC sous le pilotage de BK ; essais physiques BK |
| BF2 Réticule sur la surface détectée | Vérifié (émulé) | Hit test depuis l'espace `viewer`, réticule en TSL | `src/ar-surface.mjs`, `src/reticle.mjs` | A : `tests/unit/ar-surface.test.mjs` ; É | Prévu : IR. Réalisé : CC, pilotage BK |
| BF3 Poser le terrain d'un toucher, puis l'ancrer | Vérifié (émulé) | Pose sur le résultat du hit test, `frame.createAnchor` | `src/ar-surface.mjs`, `src/ar-placement.mjs` | A : `tests/unit/ar-placement.test.mjs` ; É | Prévu : IR. Réalisé : CC, pilotage BK |
| BF4 Formation de chaque équipe (4-4-2, 4-3-3, 3-5-2 ; plus 4-2-3-1) | Vérifié | Patron Strategy, transitions animées | `src/formations.mjs`, `src/formation-panel.mjs` | A : `tests/unit/formations.test.mjs`, `formation-transition.test.mjs` ; É | Prévu : BK. Réalisé : CC, pilotage BK |
| BF5 Sélectionner puis déplacer un joueur | Vérifié | Raycasting souris, doigt, `targetRaySpace` en AR | `src/raycasting.mjs`, `src/tactical-interaction.mjs` | A : `tests/unit/raycasting.test.mjs`, `tactical-interaction.test.mjs` ; É | Prévu : GD (raycasting). Réalisé : CC, pilotage BK |
| BF6 Déplacer le ballon | Vérifié | `MoveBallCommand` | `src/ball.mjs`, `src/commands.mjs` | A : `tests/unit/commands.test.mjs` | Réalisé : CC, pilotage BK |
| BF7 Flèche de passe ou de course | Vérifié | Règles vérifiées avant la commande (R1–R9), aperçu rouge | `src/tactical-arrows.mjs`, `src/arrow-rules.mjs` | A : `tests/unit/arrow-rules.test.mjs` ; É | Réalisé : CC (sprint 5, PR #16), CX (PR #16) ; exigence du professeur transmise par BK |
| BF8 Annuler, rétablir, réinitialiser | Vérifié | Patron Command, historique unique | `src/commands.mjs` | A : `tests/unit/commands.test.mjs` ; É | Réalisé : CC, pilotage BK |
| BF9 (bonus) Animer une action pas à pas | Vérifié | Images clés interpolées dans la boucle de rendu | `src/tactical-sequence.mjs`, `src/sequence-player.mjs` | A : `tests/unit/sequence.test.mjs` ; É : séquence en AR émulée | Réalisé : CC, pilotage BK |

## 2. Exigences non fonctionnelles (§2.3) et périmètre (§2.5)

| Exigence | Statut | Implémentation | Preuve | Test | Contributeur |
|---|---|---|---|---|---|
| Au moins 30 images par seconde sur un téléphone de milieu de gamme | Partiel | Pions instanciés (115 → 55 appels de dessin), mode `?diagnostics` | `src/players.mjs`, `docs/sprint-6.md` | A : `npm run bench`, 62,5 images/s en AR émulée, processeur ralenti 4 fois (indicatif) ; P : à mesurer | Réalisé : CC, pilotage BK ; mesure physique : équipe |
| Ergonomie : interface claire, gros boutons, utilisable d'une main | Vérifié (automatisé) | Sept espaces de coaching, cibles de 44 px au moins, navigation basse en portrait, thèmes clair et sombre | `index.html`, `src/styles.css`, `docs/espaces-coaching.md` | A : `tests/final-ux-review-tests.mjs`, `safe-area-review-tests.mjs`, `tests/unit/theme-gallery.test.mjs` | Prévu : GD (interface). Réalisé : CC, CX (PR #17), CC (thèmes) ; consignes BK |
| Accès par URL ou QR code, sans installation obligatoire | Vérifié | GitHub Pages ; QR code dans la présentation et le manuel | https://bilelkhlif.github.io/footballsimulator/ | D ; site publié vérifié après chaque fusion | Réalisé : CC, BK (publication) |
| Disponibilité hors-ligne après le premier chargement | Vérifié | Service Worker à version de contenu, coquille installée d'un bloc | `sw.mjs`, `src/pwa.mjs` | A : `tests/unit/service-worker*.test.mjs`, rechargements hors-ligne dans Chrome | Prévu : GD (PWA). Réalisé : CC, CX ; défaut du réseau lent signalé par BK |
| Sécurité : HTTPS exclusivement | Vérifié | GitHub Pages ; WebXR et Service Worker exigent un contexte sécurisé | `docs/rapport-final.md` | A | Réalisé : CC |
| Hors périmètre : ni match simulé, ni IA des joueurs, ni serveur pour l'application | Sans objet (justifié) | L'application évaluée reste cliente et statique. Le visualiseur de match par IA est une **extension** demandée après le projet : il n'anime pas les joueurs du tableau, son serveur d'analyse reste local et n'est jamais publié | `docs/visualiseur-match.md`, `LICENSING.md` | A : `tests/unit/pages-package.test.mjs` (aucun serveur, poids ni base publiés) | Extension demandée par BK, réalisée par CC |

## 3. Architecture, modélisation et concepts techniques (§3)

| Exigence | Statut | Implémentation | Preuve | Test | Contributeur |
|---|---|---|---|---|---|
| Architecture sans serveur, fichiers statiques sur GitHub Pages | Vérifié | Dépôt servi tel quel, sans compilation | `tests/prepare-pages.mjs` | A : `tests/unit/pages-package.test.mjs` | Réalisé : CC |
| Terrain `PlaneGeometry` texturé ; groupe racine unique | Vérifié | Lignes IFAB sur canvas, `pitchGroup` | `src/pitch.mjs`, `src/scene.mjs` | A | Prévu : BK. Réalisé : CC |
| Joueurs en capsules colorées et numérotées ; ballon en sphère | Vérifié | `CapsuleGeometry`, `InstancedMesh`, numéros sur canvas | `src/players.mjs`, `src/ball.mjs` | A : `tests/unit/team-meshes.test.mjs` | Prévu : BK. Réalisé : CC |
| Flèches avec `ArrowHelper` ou `THREE.Line` | Vérifié (écart justifié) | Maillages plats dans `pitchGroup` : épaisseur lisible, tirets des courses | `src/tactical-arrows.mjs`, [sprint-5.md](sprint-5.md) | A | Réalisé : CC |
| Session `immersive-ar` | Vérifié (émulé) ; physique partielle | `navigator.xr.requestSession('immersive-ar')` | `src/xr-session.mjs` | A, É ; P sur versions antérieures | Prévu : IR. Réalisé : CC ; essais BK |
| Hit testing et réticule | Vérifié (émulé) | `requestHitTestSource`, source annulée en fin de session | `src/ar-surface.mjs` | A, É | Prévu : IR. Réalisé : CC |
| Ancrage spatial `XRAnchor` | Vérifié (émulé) | Ancre gardée quand le suivi s'interrompt, terrain recalé ensuite | `src/ar-surface.mjs` | A, É | Prévu : IR. Réalisé : CC |
| Raycasting `THREE.Raycaster` | Vérifié | Rayon du `targetRaySpace` en AR, de la caméra hors AR | `src/raycasting.mjs`, `src/xr-input.mjs` | A : `tests/unit/xr-input.test.mjs` ; É | Prévu : GD. Réalisé : CC |
| DOM Overlay : boutons HTML sur la vue AR | Vérifié (émulé) | `domOverlay.root`, `beforexrselect` | `src/xr-session.mjs`, `index.html` | A, É | Prévu : GD. Réalisé : CC |
| PWA : `manifest.json` et Service Worker | Vérifié | Installable, coquille versionnée | `manifest.json`, `sw.mjs` | A | Prévu : GD. Réalisé : CC, CX |
| Patron Strategy | Vérifié | `FormationStrategy` et quatre sous-classes | `src/formations.mjs` | A | Réalisé : CC |
| Patron Command | Vérifié | Sept commandes et `CommandHistory` | `src/commands.mjs` | A | Réalisé : CC |
| Patron Observer | Vérifié | `EventEmitter` : session, pose, tableau, interaction, séquence | `src/events.mjs` | A : `tests/unit/events.test.mjs` | Réalisé : CC |
| Patron Factory | Vérifié | `PlayerFactory`, `TeamMeshes` | `src/players.mjs` | A | Réalisé : CC |
| Exigence de l'enseignant : WebGPU sans repli WebGL | Vérifié | `WebGpuOnlyRenderer` sans `getFallback` ; mode `?webgl` réservé aux tests | `src/webgpu.mjs`, `src/webgl-test-mode.mjs` | A : tests sans aucun contexte WebGL ; `tests/unit/webgpu.test.mjs` | Exigence transmise et arbitrage test/production : BK. Réalisé : CC |
| Exigence de l'enseignant : boucle de rendu expliquée | Vérifié | Partie « La boucle de rendu » du README | `README.md`, `src/render-loop.mjs` | D ; A : `tests/unit/render-loop.test.mjs` | Réalisé : CC |
| Exigence de l'enseignant : modules en `.mjs` | Vérifié | 36 modules renommés, migration du Service Worker | [migration-mjs.md](migration-mjs.md) | A : `tests/unit/migration-mjs.test.mjs` | Exigence transmise par BK. Réalisé : CC, CX (PR #16) |

## 4. Démonstration, tests et critères d'acceptation (§4)

| Exigence | Statut | Implémentation | Preuve | Test | Contributeur |
|---|---|---|---|---|---|
| Scénario de démonstration, étapes 1 à 8 | Partiel | Rejoué en vue 3D et en AR émulée ; guide pas à pas | [guide-demonstration-soutenance.md](guide-demonstration-soutenance.md) | A, É ; P : à répéter devant une table | Réalisé : CC ; répétition physique : équipe |
| Smartphone Android ARCore avec Chrome | Partiel | AR WebGPU réussie le 14 novembre sur le TECNO POVA 6 Pro 5G ; version actuelle non testée | `docs/sprint-3.md` (partie 13), `docs/recette.md` | P sur version antérieure | Essais : BK |
| Émulateur sur PC et mesure des images par seconde | Vérifié | IWER 2.7.0 (`?iwer`), `?diagnostics`, `npm run bench` | `src/dev-emulator.mjs`, `tests/benchmark.mjs` | A, É | Réalisé : CC |
| Terrain stable pendant une minute | Partiel | Pose de l'ancre inchangée en émulation ; suivi interrompu puis rétabli | `src/ar-surface.mjs` | A, É ; P : essai P2 | Mesure physique : équipe |
| Onze joueurs bien placés | Vérifié | Quatre formations × deux équipes, numéros 1 à 11, écart minimal 7,1 cm | `src/formations.mjs` | A, É | Réalisé : CC |
| Sélection et déplacement réussis 9 fois sur 10 | Partiel | 0,000 mm d'écart à chaque essai automatisé | `src/raycasting.mjs` | A, É ; P : essai P3 | Mesure physique : équipe |
| Au moins 30 images par seconde | Partiel | Voir §2.3 | `docs/sprint-6.md` | A (indicatif) ; P : essai P4 | Mesure physique : équipe |
| Lancement hors-ligne après une première visite | Vérifié | Rechargement hors-ligne à la racine et sous le sous-chemin de GitHub Pages, réseau très lent, après mise à jour | `sw.mjs` | A ; site publié rechargé hors-ligne | Réalisé : CC, CX |

## 5. Méthodologie, livrables et règles (§5, §6, §7)

| Exigence | Statut | Implémentation | Preuve | Test | Contributeur |
|---|---|---|---|---|---|
| Sprints d'une semaine ; planning S1 à S6 | Vérifié | Six comptes rendus, une pull request par sprint (PR #1, #3, #6, #8, #12, #13) | [sprint-1.md](sprint-1.md) à [sprint-6.md](sprint-6.md) | D | Pilotage : BK. Réalisé : CC |
| Rôles de l'équipe (§5.2) | Partiel | Répartition prévue reprise dans le README ; contributions individuelles d'IR et de GD au-delà du cahier non documentées | [matrice-contributions-academiques.md](matrice-contributions-academiques.md) | D | À confirmer par l'équipe |
| Tests et rapport final réalisés par l'équipe | Vérifié (automatisé) | Tests automatisés à chaque fusion ; rapport final | [rapport-final.md](rapport-final.md), [dossier-evaluation.md](dossier-evaluation.md) | A, D ; essais physiques à faire | Réalisé : CC ; revue BK |
| UML : cas d'utilisation, séquence, déploiement | Vérifié | Six diagrammes Mermaid, rendus et vérifiés | [uml.md](uml.md) | D | Réalisé : CC |
| Code source : `index.html`, `main`, `formations`, `manifest.json`, Service Worker, `/assets` | Vérifié (écart justifié) | Noms devenus `src/main.mjs`, `src/formations.mjs`, `sw.mjs` à la demande du professeur ; aucun modèle GLB, pions et textures générés par le code | Dépôt | A, D | Réalisé : CC, CX |
| Documentation technique : installation, déploiement, architecture | Vérifié | README, architecture, guide du code, explications techniques | [architecture.md](architecture.md), [guide-du-code.md](guide-du-code.md), [explications-techniques.md](explications-techniques.md) | D | Prévu : GD (documentation). Réalisé : CC |
| Manuel utilisateur illustré, en AR | Vérifié | Manuel illustré | [manuel-utilisateur.md](manuel-utilisateur.md) | D | Réalisé : CC |
| Vidéo de 5 minutes au plus, voix off, sans musique | Non fait | Storyboard et voix off prêts | [video-demonstration.md](video-demonstration.md) | — | À tourner par l'équipe |
| HTTPS ; Chrome Android avec ARCore | Vérifié | GitHub Pages ; détection de l'AR et messages d'aide | `src/xr-support.mjs` | A | Réalisé : CC |
| Peu de polygones et de lumières pour 22 joueurs | Vérifié | 7 409 triangles, deux lumières sans ombre portée, 55 appels de dessin | `docs/sprint-6.md` | A | Réalisé : CC |
| Risques : émulateur, sélection imprécise, dérive du terrain, performance, planning | Vérifié | IWER ; zones de sélection élargies ; `XRAnchor` ; pions instanciés ; BF1 à BF5 livrés avant le bonus | `docs/rapport-final.md` | A, É, D | Réalisé : CC |
| En-tête de chaque fonction et de chaque bloc HTML/CSS | Vérifié | `@responsable`, `@date`, `@role` ; renvoi à ATTRIBUTION.md en tête de fichier | [convention-de-documentation.md](convention-de-documentation.md) | A : `tests/unit/documentation.test.mjs` | Contenu défini par BK. Réalisé : CC |
| Noms explicites, modules, arborescence `/src`, `/assets`, `/docs` | Vérifié | `pitchGroup`, `hitTestSource`… ; modules ES | Dépôt | A, D | Réalisé : CC |
| Une branche par fonctionnalité, fusion après revue, commits fréquents | Vérifié | 23 pull requests, fusions après revue et tests | Historique GitHub | D | Revue et fusions : BK |
| Déploiement final sur GitHub Pages | Vérifié | Publication à chaque fusion sur `main` | https://bilelkhlif.github.io/footballsimulator/ | A : vérification du site publié | Publication : BK, vérifications : CC |
| ATTRIBUTION.md tenu à jour | Vérifié | Mis à jour le 25 novembre 2026 : PR #16 et #17, numérotation 25 et 26, orthographe « Dalleji », travail du 25 novembre | [ATTRIBUTION.md](../ATTRIBUTION.md) | D | Relecture et décision : BK |

## 6. Extensions après le projet (hors cahier, demandées par le professeur ou par l'équipe)

Ces lignes ne sont pas comptées dans le bilan : le cahier ne les demande pas.

| Extension | Statut | Implémentation | Preuve | Test | Contributeur |
|---|---|---|---|---|---|
| Sept espaces de coaching | Vérifié (automatisé) | Rail, panneaux contextuels, une seule scène et un seul historique | `docs/espaces-coaching.md` | A : `tests/workspace-tests.mjs`, `coaching-workflow-tests.mjs` | Réalisé : CX (PR #17) ; demande et fusion : BK |
| Interface « verre », thèmes clair, sombre et automatique | Vérifié (automatisé, Chrome) | Jetons de conception, surfaces translucides limitées, `@supports` de repli, réduction des animations | `src/styles.css`, `src/theme.mjs`, `docs/images/glass/` | A : `tests/unit/theme-gallery.test.mjs`, suites de mise en page | Réalisé : CC ; demande : BK |
| Visualiseur de match par IA (Bêta) | Vérifié (automatisé) | Analyse locale sur GPU, démonstrations statiques, terrain 3D WebGPU synchronisé | `docs/visualiseur-match.md`, `analysis/` | A : tests Python, `tests/visualizer-*.mjs` | Réalisé : CC ; demande et revue : BK |
| Démonstrations réelles sous licence vérifiée | Vérifié | Trois vidéos de Wikimedia Commons, droits relus, empreintes enregistrées | `demo/media-licenses.json`, `SOURCE.md` | A : garde des droits de `tests/prepare-pages.mjs` | Réalisé : CC ; demande : BK |
| Calibration stabilisée et contrôlée visuellement | Vérifié (sur séquences à vérité connue) ; justesse sur vidéo réelle : contrôle visuel | Filtre complémentaire, verdict par démonstration, positions masquées si rejetée | [stabilisation-homographie.md](stabilisation-homographie.md) | A : `analysis/tests/test_stabilisation.py`, `test_reference_calibration.py` | Réalisé : CC |
