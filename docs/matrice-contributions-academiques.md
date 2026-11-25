# Matrice des contributions académiques

Qui a fait quoi dans Football Simulator, avec la preuve de chaque affirmation. Document du 25 novembre
2026. Il complète [ATTRIBUTION.md](../ATTRIBUTION.md), qui reste la déclaration officielle, et reprend la
méthode de la proposition de la PR #18 ([attribution-proposee.md](attribution-proposee.md)).

## 1. Règles de preuve

Chaque affirmation porte le type de sa preuve :

- **[G] Git et GitHub** : commit, date, fichiers, pull request, fusion. **Les 147 commits de `main` au
  25 novembre 2026, avant cette branche, sont publiés sous le nom de Bilel Khlif** (deux adresses) : Git dit
  qui a publié, pas qui a écrit le code. Les revues et commentaires des 23 pull requests sont tous de son compte.
- **[A] assistant** : compte rendu de Claude Code ou de Codex (tests, mesures, réalisation), consigné dans
  le dépôt. Non vérifiable dans Git.
- **[É] équipe** : déclaration de l'équipe, d'abord dans ATTRIBUTION.md, ou demande de Bilel Khlif dans les
  sessions de travail.
- **[P] physique** : essai sur un appareil réel, rapporté par la personne qui l'a fait.

Une affirmation sans preuve n'est pas écrite. Aucune contribution n'est retirée ni réattribuée : ce qui
n'est pas documenté est marqué « à confirmer par l'équipe ».

## 2. Rôles employés

| Rôle | Définition dans ce document |
|---|---|
| **Auteur** | A écrit le contenu (code, texte, mesure). |
| **Contributeur** | A apporté une partie identifiable : exigence, idée, correction, essai. |
| **Responsable** | A fixé le périmètre et les consignes, et répond du résultat (`@responsable` des en-têtes). |
| **Relecteur** | A relu, approuvé ou refusé, puis décidé de la fusion. |
| **Partagé** | Travail collectif dont la répartition n'est pas documentée. |
| **Assisté par IA** | Réalisé par un assistant (Claude Code, Codex) sur consignes humaines, déclaré au §4 d'ATTRIBUTION.md. |

## 3. Matrice par domaine

Colonnes : responsabilité **prévue** par le cahier des charges (§5.2) ; **réalisation** documentée ;
**pilotage et relecture** ; **validation**. A automatisée, É émulée, P physique.

| Domaine | Prévu (§5.2) | Réalisation | Pilotage et relecture | Validation | Preuves |
|---|---|---|---|---|---|
| Cahier des charges | Équipe | Partagé : Iyed Rachdi, Bilel Khlif, Ghassen Dalleji [É] | — | — | ATTRIBUTION.md §4 |
| Session WebXR, hit test, ancre | Iyed Rachdi | Assisté par IA : Claude Code (sprints 2 et 3) [A] | Bilel Khlif : exigence WebGPU sans repli, mode test WebGL réservé aux tests [É] ; PR #3, #6, #7 fusionnées [G] | A, É ; P par Bilel Khlif les 12 et 14 novembre sur ces versions [P] | `src/xr-session.mjs`, `src/ar-surface.mjs`, `docs/sprint-2.md`, `docs/sprint-3.md` |
| Scène three.js, terrain, joueurs, formations | Bilel Khlif | Assisté par IA : Claude Code [A] | Bilel Khlif : sprint 1 piloté, guide du code relu, PR #1 et #8 [G][É] | A, É | `src/scene.mjs`, `src/pitch.mjs`, `src/players.mjs`, `src/formations.mjs` |
| Interface HTML | Ghassen Dalleji | Assisté par IA : Claude Code ; Codex pour les PR #16 et #17 [A] | Bilel Khlif : exigences d'ergonomie transmises, revue et fusions [É][G] | A | `index.html`, `src/styles.css`, `docs/espaces-coaching.md` |
| Raycasting | Ghassen Dalleji | Assisté par IA : Claude Code (sprint 5) [A] | Bilel Khlif : consignes détaillées du sprint 5, PR #12 [É][G] | A, É | `src/raycasting.mjs`, `src/tactical-interaction.mjs` |
| PWA et Service Worker | Ghassen Dalleji | Assisté par IA : Claude Code ; Codex (migration) [A] | Bilel Khlif : défaut du réseau lent signalé le 12 novembre, PR #5 [É][G] | A ; site publié vérifié dans Chrome sur PC [A] | `sw.mjs`, `src/pwa.mjs` |
| Documentation | Ghassen Dalleji | Assisté par IA : Claude Code, Codex [A] | Bilel Khlif : demandes de documentation, ATTRIBUTION.md relu le 9 novembre [É] | D | `README.md`, `docs/` |
| Tactique : commandes, flèches, séquences | — | Assisté par IA : Claude Code ; Codex (choix du porteur) [A] | Bilel Khlif : sprints 4 à 6 lancés, exigence du professeur sur les flèches transmise [É] ; PR #8, #12, #13, #16 [G] | A, É | `src/commands.mjs`, `src/arrow-rules.mjs`, `src/tactical-sequence.mjs` |
| Sept espaces de coaching | — | Assisté par IA : Codex (`2885bd2`, `94bee9e`) [G][A] | Bilel Khlif : demande, revue finale exigée, fusion autorisée [É] ; PR #17 [G] | A | `docs/espaces-coaching.md`, `docs/revue-finale-pr17.md` |
| Visualiseur de match par IA | — (hors cahier) | Assisté par IA : Claude Code [A] | Bilel Khlif : demande, revue critique, règle « aucune coordonnée inventée » [É] ; PR #15, #19, #20, #21, #23 [G] | A ; analyses réelles sur RTX 2050 [A] | `analysis/`, `src/visualizer/`, `docs/visualiseur-match.md` |
| Interface « verre », démonstrations réelles, dossier d'évaluation | — (hors cahier) | Assisté par IA : Claude Code, 25 novembre [A] | Bilel Khlif : consignes et interdits de la contribution 27 [É] | A ; aucun essai sur téléphone | Cette branche ; [dossier-evaluation.md](dossier-evaluation.md) |
| Essais sur téléphone de la version actuelle | Équipe (§5.2 : « tests réalisés par toute l'équipe ») | Non faits | — | — | [recette.md](recette.md) |
| Vidéo de démonstration | Équipe | Non faite (storyboard prêt) | — | — | [video-demonstration.md](video-demonstration.md) |

## 4. Contributions vérifiables de Bilel Khlif

Chaque entrée dit ce qui a été fait, pourquoi c'était difficile, où le voir, et ce que cela a produit.
Bilel Khlif est responsable et relecteur de ces travaux ; leur écriture est assistée par IA (§4
d'ATTRIBUTION.md). Rien ici ne lui attribue du code qu'il n'a pas écrit.

### 4.1 Rendu WebGPU sans repli, et un mode WebGL réservé aux tests

- **Fait** : transmission de l'exigence du professeur (WebGPU sans repli WebGL), puis décision qu'un rendu
  WebGL n'existerait que pour tester l'AR sur son seul téléphone, sans jamais servir de repli [É].
- **Difficulté** : la liaison WebXR–WebGPU (`XRGPUBinding`) était encore expérimentale dans Chrome ; le
  `WebGPURenderer` de three.js bascule seul vers WebGL ; un défaut de cible de rendu XR de three.js r187
  cassait l'AR sur un appareil à une seule vue.
- **Où** : `src/webgpu.mjs` (classe `WebGpuOnlyRenderer`), `src/webgl-test-mode.mjs`, PR #6 et #7 [G].
- **Tests** : vérifications « aucun contexte WebGL » et parcours AR émulé dans les deux modes [A].
- **Résultat** : AR rendue en WebGPU réussie sur le TECNO POVA 6 Pro 5G, et AR du mode test sur le
  Galaxy S10e, essais de Bilel Khlif du 14 novembre 2026 [P] (`docs/sprint-3.md`, partie 13).

### 4.2 Essais sur appareils réels et défaut du réseau lent

- **Fait** : essais le 12 novembre sur deux Android (Chrome), un iPhone 15 (Safari) et un PC ; signalement
  d'une AR qui ne démarrait plus après des problèmes de réseau [P][É].
- **Difficulté** : le défaut n'apparaissait qu'en conditions réelles ; il fallait le reproduire.
- **Où** : PR #4 et #5 [G] ; délai d'attente du réseau dans le Service Worker, retard simulé dans
  `tests/serve.mjs`.
- **Résultat** : le nouveau test échoue avec l'ancien Service Worker (page non prête après 30 s) et réussit
  avec le correctif (prête en 3,7 s) [A].

### 4.3 Pilotage des six sprints et des fusions

- **Fait** : consignes détaillées de chaque sprint d'après le cahier (§5.3), relecture, refus ou approbation,
  fusions des PR #1, #3, #6, #7, #8, #12, #13 [G][É].
- **Difficulté** : faire respecter par un assistant les patrons imposés (Strategy, Command, Observer,
  Factory), la mesure avant/après des performances et l'interdiction d'inventer un résultat physique.
- **Résultat** : six sprints livrés en douze jours, chacun avec ses tests et son compte rendu
  (`docs/sprint-1.md` à `docs/sprint-6.md`).

### 4.4 Retours d'évaluation et espaces de coaching

- **Fait** : transmission des trois exigences du professeur (ergonomie mobile et AR, flèches cohérentes,
  modules `.mjs`) le 23 novembre, puis demande des sept espaces de coaching et revue finale exigée [É].
- **Où** : PR #16 (fusion `27eff23`) et PR #17 (fusion `48c293d`) [G].
- **Résultat** : 226 puis 229 tests unitaires et 104 puis 140 vérifications de navigateur rapportés [A].

### 4.5 Visualiseur de match et démonstrations réelles

- **Fait** : demande d'un visualiseur par IA fondé sur des solutions libres, avec la règle « aucune
  coordonnée inventée » ; revue critique exigée ; le 25 novembre, exigence de vraies vidéos aux droits
  vérifiés et d'un suivi amélioré par des mesures [É].
- **Difficulté** : licences des poids et des bibliothèques (AGPL-3.0 d'Ultralytics), droits des vidéos,
  justesse de la calibration sans vérité terrain.
- **Où** : PR #15, #19, #20, #21, #23 [G] ; contribution 27 sur cette branche.
- **Résultat** : déplacements invraisemblables ramenés de 70,6 % à 11,2 % (France–Allemagne) et de 29,2 % à
  5,0 % (Samsunspor–Altınordu) sur les mêmes détections ; calibrations fausses détectées et masquées
  ([stabilisation-homographie.md](stabilisation-homographie.md)) [A].

### 4.6 Traçabilité académique

- **Fait** : mise en place d'ATTRIBUTION.md selon le modèle de l'enseignant, relecture intégrale le
  9 novembre, en-têtes `@responsable`, `@date`, `@role` demandés, relecture du guide du code [É] ;
  PR #2, #10, #11 [G].
- **Résultat** : convention vérifiée automatiquement (`tests/unit/documentation.test.mjs`).

## 5. Iyed Rachdi et Ghassen Dalleji

- **Documenté** : coauteurs du cahier des charges, qui fixe les fonctionnalités, les contraintes
  d'architecture et le scénario de démonstration [É].
- **Prévu par le cahier (§5.2)** : Iyed Rachdi pour la session WebXR, le hit test et l'ancre ; Ghassen
  Dalleji pour l'interface HTML, le raycasting, la PWA et la documentation ; vidéo, tests et rapport final
  pour toute l'équipe.
- **Non documenté** : leurs contributions individuelles au-delà du cahier (code, essais, relectures,
  vidéo). Aucun commit, aucune revue de pull request et aucun compte rendu d'essai à leur nom ne figure
  dans le dépôt ; le dépôt compte un second collaborateur GitHub, sans commit, revue ni commentaire [G]. **À confirmer par l'équipe**, preuves à l'appui (comptes rendus d'essai, relectures datées,
  enregistrements de la vidéo) ; ce document ne les retire ni ne les réattribue.
- **Orthographe** : « Ghassen Dalleji », confirmée par Bilel Khlif le 24 novembre 2026.
- **Licence** : la licence de l'application académique attend toujours leur accord ([LICENSING.md](../LICENSING.md)) ;
  rien n'est décidé à leur place.

## 6. Assistants d'IA

| Assistant | Période | Travail | Contrôle humain |
|---|---|---|---|
| Claude Code (Anthropic) | 5–25 novembre 2026 | Code des sprints 1 à 6, visualiseur, tests, documents, vérification des fusions et du déploiement, travail du 25 novembre | Consignes, relecture, essais physiques et fusions par Bilel Khlif |
| OpenAI Codex | 23–24 novembre 2026 | Reprise de la PR #16, PR #17 | Revue finale exigée, fusion autorisée par Bilel Khlif |
| ChatGPT | — | Reformulation d'ATTRIBUTION.md | Relecture de Bilel Khlif |

Méthode de contrôle des sorties des assistants : tests automatisés à chaque fusion, erreurs introduites
volontairement pour vérifier que les tests échouent (12 au sprint 5, 16 au sprint 6), essais sur téléphone
des versions des 12 et 14 novembre, et, le 25 novembre, contrôle visuel de la calibration image par image.

## 7. En-têtes des fonctions

- `@responsable Bilel Khlif` figure sur les fonctions du dépôt : la convention
  ([convention-de-documentation.md](convention-de-documentation.md)) le définit comme la personne qui a fixé
  les consignes, relu et fusionné. Ce n'est pas une déclaration d'écriture : la réalisation par les
  assistants est déclarée au §4 d'ATTRIBUTION.md. Attribuer une fonction à Iyed Rachdi ou à Ghassen
  Dalleji demanderait une preuve de leur responsabilité sur cette fonction.
- `@date` : date du premier commit qui introduit la fonction (`git log -S`). Deux dates inexactes relevées
  par la PR #18 ont été vérifiées dans Git et corrigées le 25 novembre 2026 : `resetPitchPose`
  (`src/ar-view.mjs`, 14 novembre, commit `b4925a9`) et `targetLabel` (`src/arrow-rules.mjs`, 23 novembre,
  commit `e219f15`).
- Les bibliothèques tierces (`src/vendor/`) ne sont jamais modifiées ni annotées.
- Les nouvelles fonctions du 25 novembre (JavaScript et Python) portent les trois balises, vérifiées par
  `tests/unit/documentation.test.mjs` pour le JavaScript.
