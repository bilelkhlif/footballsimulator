# Propositions d’ajout à ATTRIBUTION.md

Texte à relire et à intégrer par l’équipe si elle l’approuve. **`ATTRIBUTION.md` est resté inchangé.** Ces propositions décrivent des travaux des assistants, sans attribuer à un étudiant une vérification qu’il n’a pas rapportée.

## Claude Code — retours d’évaluation, 23 novembre 2026

- **Composants concernés :** 36 modules applicatifs renommés en `.mjs`, `sw.mjs`, script de migration `sw.js`, règles pures de `arrow-rules.mjs`, interaction et aperçu, saisie tactile, interface à icônes, aide de première visite, raccourcis, tests, captures et première rédaction des documents d’ergonomie, de règles et de migration.
- **Usage principal :** demandes de Bilel Khlif relayant les trois exigences du professeur : améliorer l’ergonomie mobile/AR, empêcher les flèches incohérentes et utiliser `.mjs`. Six commits sur `feature/ux-fleches-mjs`, de `1fb4fc4` à `770d1e8` ; arrêt sur limite d’usage alors que les documents étaient encore modifiés sans commit.
- **Vérifications de l’assistant :** 225 tests unitaires rapportés sur le dernier correctif ; 95 vérifications de navigateur rapportées sur une version antérieure. Ces résultats historiques ont été repris et vérifiés par la suite avec Codex. Captures obtenues sur l’application dans Chrome, AR émulée avec IWER. Aucune nouvelle mesure physique attribuée à l’équipe.
- **Contribution humaine attestée :** Bilel Khlif a fourni les consignes, les contraintes de préservation de l’autre branche et la demande de reprise. Relecture finale, validation sur téléphone et décision de fusion restent à consigner par l’équipe.

## Codex — reprise et vérification, 23 novembre 2026

- **Composants concernés :** disposition HTML/CSS des panneaux et outils, cadrage hors AR dans `scene.mjs`, sélection du porteur cohérente entre les règles et le départ d’une passe, tests adaptatifs et AR, vérification du cycle de migration PWA, documentation actuelle et historique, nouvelles captures, notes d’intégration future.
- **Usage principal :** reprendre le travail interrompu dans le même worktree, préserver les modifications, corriger les défauts démontrés, terminer les documents, vérifier puis préparer une PR distincte sans la fusionner. Aucun code d’analyse vidéo ajouté et aucune modification de la PR #15.
- **Vérifications de l’assistant :** sauvegarde des modifications héritées ; reproduction du débordement de l’aide à 320 × 568 et d’un bouton inaccessible à 568 × 320 ; correction et tests sur sept dimensions ; 226 tests unitaires et 104 vérifications de navigateur réussis sans échec ni cas ignoré, AR WebGPU et mode test WebGL compris. Migration installée de l’ancien `sw.js` vers `sw.mjs`, un rechargement, un seul enregistrement/cache, puis démarrage hors-ligne. Contrôle des imports, en-têtes, coquille et liens documentaires. Aucune mesure sur téléphone réel.
- **Contribution humaine attestée :** périmètre et interdiction de fusion définis par Bilel Khlif ; `ATTRIBUTION.md` réservé à sa relecture. Ne pas transformer les vérifications automatisées ou émulées en résultats humains ou matériels.

La vidéo de démonstration et les essais P0–P10 restent des livrables de l’équipe. Les anciens noms `.js` des déclarations historiques restent valables pour les versions qu’elles décrivent ; leur correspondance actuelle est dans [migration-mjs.md](migration-mjs.md).

---

# Proposition consolidée du 24 novembre 2026

Préparée avec Claude Code, sur une branche séparée (`docs/attribution-academique`), à partir de l’historique Git, des pull requests #16 et #17, des documents du dépôt et des sessions de travail du 24 novembre. **`ATTRIBUTION.md` reste inchangé** : chaque bloc ci-dessous indique où le coller, et l’équipe décide de l’intégrer, de le modifier ou de l’écarter. Les sections précédentes de ce fichier restent valables ; ce qui suit les complète jusqu’à la fusion de la PR #17.

Le visualiseur de match (PR #15) n’est pas concerné : il ne fait pas partie de la version évaluée ; son attribution est sur sa branche (`docs/attribution-visualiseur.md`).

## 1. Ligne « Assistants utilisés » (§4) — remplacement proposé

> Assistants utilisés : **Claude Code** (Anthropic), du 5 au 24 novembre 2026 (modèle indiqué dans le journal de développement : Claude Opus 5.5), pour l’implémentation, les tests, la documentation et la vérification des fusions et du déploiement ; **OpenAI Codex**, les 23 et 24 novembre 2026, pour la reprise de la PR #16 et la réalisation de la PR #17 (implémentation, corrections, tests, documentation) ; **ChatGPT** pour la reformulation de ce fichier d’attribution.

Le modèle et la version de Codex ne sont pas consignés : ils ne sont pas cités.

## 2. Contributions de Bilel Khlif à ajouter (§4, après la contribution 22)

> 23. **Retours d’évaluation du professeur** (23 novembre 2026) : transmission des trois exigences (interface plus intuitive sur mobile et en AR, refus des flèches incohérentes, modules en `.mjs`), consignes données à Claude Code, puis reprise confiée à Codex après une limite d’usage ; fusion de la PR #16 autorisée explicitement (commit de fusion `27eff23`).
>
> 24. **Espaces de coaching** (24 novembre 2026) : organisation de l’interface en sept espaces, réalisée avec Codex (PR #17) ; revue finale demandée avant toute fusion ; fusion autorisée explicitement le 24 novembre 2026, avec vérification du déploiement (commit de fusion `48c293d`).

La branche du visualiseur numérote déjà 23 et 24 ses propres contributions : à la fusion éventuelle de la PR #15, ses numéros devront suivre ceux-ci.

## 3. Entrées par composant à ajouter (§4, déclaration détaillée)

*   **Composant ou Shader concerné :** retours d’évaluation, 23 novembre 2026 (PR #16, 8 commits de `1fb4fc4` à `d4d3f6b`) : modules applicatifs en `.mjs`, `sw.mjs` et script de migration `sw.js`, `src/arrow-rules.mjs`, interaction tactique, saisie au doigt, interface à icônes, aide de première visite, raccourcis, tests, `docs/regles-des-fleches.md`, `docs/ergonomie.md`, `docs/migration-mjs.md`

    * **Prompt ou usage principal :** voir les deux sections du 23 novembre ci-dessus : six commits de Claude Code (`1fb4fc4` à `770d1e8`), puis deux de Codex (`5f6a108`, `d4d3f6b`).

    * **Axe de vérification appliqué par l’étudiant :** consignes et exigences transmises par Bilel Khlif ; fusion autorisée par lui. Vérifications automatisées et émulées par les assistants : 226 tests unitaires et 104 vérifications de navigateur à la fusion (`docs/conformite.md`, addendum). Aucun essai sur téléphone de cette version.

*   **Composant ou Shader concerné :** sept espaces de coaching, 24 novembre 2026 (PR #17, commits `2885bd2` et `94bee9e`) : `index.html`, `src/workspace-controller.mjs`, `src/workspace-navigation.mjs`, modifications de `src/main.mjs`, `src/scene.mjs`, `src/onboarding.mjs`, `src/styles.css` et `sw.mjs` ; tests (`tests/workspace-tests.mjs`, `tests/coaching-workflow-tests.mjs`, `tests/final-ux-review-tests.mjs`, `tests/safe-area-review-tests.mjs`, `tests/workspace-test-helpers.mjs`, `tests/unit/workspace-controller.test.mjs`) ; `docs/espaces-coaching.md`, `docs/revue-finale-pr17.md`, `docs/integration-future-visualiseur.md`, captures de `docs/images/sidebar/` et `docs/images/revue/`

    * **Prompt ou usage principal :** demande de Bilel Khlif d’organiser l’application en espaces de coaching autour de la scène existante, sans perdre de fonctionnalité ; code, tests et documents réalisés par Codex ; revue finale par Codex, avec corrections du focus, de la touche Échap, du texte agrandi et des marges de sécurité.

    * **Axe de vérification appliqué par l’étudiant :** demande, revue finale exigée et fusion autorisée par Bilel Khlif. Vérifications rapportées par Codex : 229 tests unitaires et 140 vérifications de navigateur, mesures de rendu et de mémoire (`docs/validation/revue-pr17-mesures.json`). Aucun essai sur téléphone.

*   **Composant ou Shader concerné :** fusion de la PR #17 et vérification du déploiement, 24 novembre 2026 (commit de fusion `48c293d`)

    * **Prompt ou usage principal :** autorisation explicite de Bilel Khlif de terminer la fusion interrompue de Codex, avec contrôles préalables ; fusion et vérifications faites par Claude Code.

    * **Axe de vérification appliqué par l’étudiant :** autorisation et conditions de fusion fixées par Bilel Khlif. Vérifications de l’assistant : PR ouverte vers `main`, tête approuvée exacte, état « CLEAN » ; `npm test` sur la tête approuvée (une première exécution avec deux vérifications de navigateur instables, réussite complète à la relance) ; après fusion, 229 tests unitaires et 140 vérifications de navigateur sur `main` ; publication GitHub Pages réussie ; 128 des 129 vérifications applicables sur le site publié (la 129e attend `text/javascript` pour les fichiers de three.js, servis en `application/javascript` par GitHub Pages) ; passage réel d’une installation de la version précédente à la nouvelle, puis relance hors-ligne et sept espaces hors-ligne. Aucun essai sur téléphone.

## 4. Contributions et preuves — application évaluée

| Domaine | Responsabilité humaine documentée | Réalisation assistée | Preuves dans le dépôt | Validation |
| --- | --- | --- | --- | --- |
| Cahier des charges | Iyed Rachdi, Ghassen Dallekji et Bilel Khlif (cadrage collectif) | — | ATTRIBUTION.md, §4 | — |
| Architecture WebGPU/WebXR, session AR, hit test, ancre | Bilel Khlif : exigences du professeur transmises (WebGPU sans repli), décision du mode test WebGL réservé aux tests, essais sur téléphones (12 et 14 novembre) | Claude Code (sprints 2 et 3, mode test WebGL) | `src/webgpu.mjs`, `src/xr-session.mjs`, `src/ar-surface.mjs` ; `docs/sprint-2.md`, `docs/sprint-3.md` ; tests unitaires et parcours AR émulés | A, É, P (versions des 12 et 14 novembre) |
| Scène, terrain, pions, ballon | Sprint 1 piloté par Bilel Khlif ; guide du code relu | Claude Code | `src/scene.mjs`, `src/pitch.mjs`, `src/players.mjs`, `src/ball.mjs` ; PR #1 | A |
| Tactique : formations, tableau, commandes, séquences | Sprints lancés par Bilel Khlif à partir des critères collectifs | Claude Code (sprints 4 à 6) | `src/formations.mjs`, `src/tactics-board.mjs`, `src/commands.mjs`, `src/tactical-sequence.mjs` ; PR #8, #12, #13 | A, É |
| Règles des flèches | Exigence du professeur transmise | Claude Code (`e219f15`, `d702f70`) ; Codex (choix du porteur, `5f6a108`) | `src/arrow-rules.mjs`, `docs/regles-des-fleches.md`, `tests/unit/arrow-rules.test.mjs` | A, É |
| Ergonomie et interface (PR #16) | Exigence du professeur transmise | Claude Code (`3c47dfe`, `ac3c38d`, `770d1e8`) ; Codex (écrans courts, documents) | `docs/ergonomie.md`, captures | A, É |
| Sept espaces de coaching (PR #17) | Demande, revue finale exigée, fusion autorisée | Codex (`2885bd2`, `94bee9e`) | `docs/espaces-coaching.md`, `docs/revue-finale-pr17.md`, tests des espaces | A, É |
| Migration `.mjs` | Exigence du professeur transmise | Claude Code (`1fb4fc4`) ; Codex (vérification du cycle de migration) | `docs/migration-mjs.md`, test de migration | A |
| PWA et Service Worker | Défaut du réseau lent signalé (12 novembre) | Claude Code (sprints 3 et 6, `sw.mjs`) | `sw.mjs`, `sw.js`, `src/pwa.mjs`, tests PWA | A ; site publié vérifié le 24 novembre (passage de version et hors-ligne, dans Chrome) |
| Tests, fusions et déploiement | Décision de chaque fusion (PR #1 à #17) | Claude Code, puis Codex (PR #16 et #17) | Journaux de tests des sprints, `docs/validation/`, commits de fusion | A |

Niveaux : **A** automatisée, **É** émulée (WebXR de Chrome sur PC, IWER), **P** physique (téléphone réel).

## 5. En-têtes des fonctions : contrôle et corrections proposées

Méthode : pour chacune des 354 fonctions documentées de `src/` et de `sw.mjs` sur `main`, la date `@date` est comparée à la date du premier commit qui introduit sa signature (`git log -S`, ancien nom `.js` compris). 21 écarts apparaissent ; 19 s’expliquent : signature modifiée plus tard (fonction devenue asynchrone, paramètre ajouté, fonction déplacée), vérifiée par le nom, ou méthode homonyme d’une autre classe. **Deux dates sont inexactes** selon la convention (`docs/convention-de-documentation.md`) :

| Fonction | Date déclarée | Date proposée | Preuve |
| --- | --- | --- | --- |
| `resetPitchPose` (`src/ar-view.mjs`) | 2026-11-09 | 2026-11-14 | introduite par `b4925a9` (sprint 3) |
| `targetLabel` (`src/arrow-rules.mjs`) | 2026-11-15 | 2026-11-23 | introduite par `e219f15` (PR #16) |

Ces fichiers font partie de la coquille hors-ligne : la correction demande `npm run shell-version`, puis `npm test`.

`@responsable Bilel Khlif` figure sur toutes les fonctions : la convention le définit comme la personne responsable (consignes, revue, fusion), et la réalisation par les assistants est déclarée au §4. Aucune modification n’est proposée ; attribuer une partie à Iyed Rachdi ou à Ghassen Dallekji demanderait une preuve de leur responsabilité sur cette partie.

## 6. À confirmer par l’équipe

- L’orthographe du nom : « Ghassen Dallekji » dans ATTRIBUTION.md, « Ghassen Dalleji » dans la consigne du 24 novembre 2026.
- Les contributions individuelles d’Iyed Rachdi et de Ghassen Dallekji au-delà du cahier des charges (essais, vidéo, présentation…) : à consigner seulement avec leur confirmation.
- Les essais sur téléphone P0 à P10 de la version finale : non faits à ce jour.

## 7. Déclarations écartées, faute de preuve

- Qui a exécuté la fusion locale de la PR #16 (`27eff23`) : le commit indique Bilel Khlif comme auteur, pas l’outil.
- Une relecture humaine ligne à ligne du code des PR #16 et #17 : aucune trace n’en est consignée.
- Le modèle et la version de Codex.
- Tout essai sur téléphone des versions du 23 et du 24 novembre.
