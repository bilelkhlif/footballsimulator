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

Préparée avec Claude Code, sur une branche séparée (`docs/attribution-academique`), à partir de l’historique Git, des pull requests #16 et #17, des documents du dépôt et des sessions de travail du 24 novembre. **`ATTRIBUTION.md` reste inchangé**, comme tous les documents historiques : chaque bloc ci-dessous indique où le coller, et l’équipe décide de l’intégrer, de le modifier ou de l’écarter. Les sections précédentes de ce fichier restent valables ; ce qui suit les complète jusqu’à la fusion de la PR #17.

Le visualiseur de match (PR #15) n’est pas concerné : il ne fait pas partie de la version évaluée ; son attribution est sur sa branche (`docs/attribution-visualiseur.md`).

## Types de preuves

Chaque affirmation ci-dessous porte le type de sa preuve :

- **[G] vérifié dans Git** : commit, date, fichiers modifiés, message de commit, état d’une pull request sur GitHub. Tous les commits du dépôt sont publiés sous le nom de Bilel Khlif : Git ne dit pas quel outil ou quelle personne a écrit le code.
- **[A] rapporté par un assistant** : comptes rendus de Claude Code ou de Codex (résultats de tests, mesures, répartition des commits entre assistants), consignés dans les documents du dépôt ou dans les sessions. Non vérifiable dans Git.
- **[É] déclaré par l’équipe** : ATTRIBUTION.md, README, demandes et autorisations de Bilel Khlif dans les sessions de travail.

## 1. Ligne « Assistants utilisés » (§4) — remplacement proposé

> Assistants utilisés : **Claude Code** (Anthropic), du 5 au 24 novembre 2026 (modèle indiqué dans le journal de développement : Claude Opus 5.5), pour l’implémentation, les tests, la documentation et la vérification des fusions et du déploiement ; **OpenAI Codex**, les 23 et 24 novembre 2026, pour la reprise de la PR #16 et la réalisation de la PR #17 (implémentation, corrections, tests, documentation) ; **ChatGPT** pour la reformulation de ce fichier d’attribution.

Sources : [A] sessions et sections du 23 novembre ci-dessus ; [É] ATTRIBUTION.md pour ChatGPT. Le modèle et la version de Codex ne sont pas consignés : ils ne sont pas cités.

## 2. Contributions de Bilel Khlif à ajouter (§4, après la contribution 22)

> 23. **Retours d’évaluation du professeur** (23 novembre 2026) : transmission des trois exigences (interface plus intuitive sur mobile et en AR, refus des flèches incohérentes, modules en `.mjs`), consignes données à Claude Code, puis reprise confiée à Codex après une limite d’usage ; fusion de la PR #16 autorisée.
>
> 24. **Espaces de coaching** (24 novembre 2026) : organisation de l’interface en sept espaces, réalisée avec Codex (PR #17) ; revue finale demandée avant toute fusion ; fusion autorisée explicitement le 24 novembre 2026, avec vérification du déploiement.

Preuves : [G] PR #16 fusionnée par le commit `27eff23` le 23 novembre 2026, dont le message indique « Fusion explicitement autorisée par Bilel Khlif » ; l’outil qui a fait cette fusion n’est pas consigné. [G] PR #17 fusionnée par `48c293d` le 24 novembre 2026, par l’API de GitHub. [É] autorisation de la fusion de la PR #17 donnée par Bilel Khlif dans la session de Claude Code du 24 novembre. [A] reprise par Codex après la limite d’usage de Claude Code (section du 23 novembre ci-dessus).

La branche du visualiseur numérote déjà 23 et 24 ses propres contributions : à la fusion éventuelle de la PR #15, ses numéros devront suivre ceux-ci.

## 3. Entrées par composant à ajouter (§4, déclaration détaillée)

*   **Composant ou Shader concerné :** retours d’évaluation, 23 novembre 2026 (PR #16) : modules applicatifs en `.mjs`, `sw.mjs` et script de migration `sw.js`, `src/arrow-rules.mjs`, interaction tactique, saisie au doigt, interface à icônes, aide de première visite, raccourcis, tests, `docs/regles-des-fleches.md`, `docs/ergonomie.md`, `docs/migration-mjs.md`

    * **Prompt ou usage principal :** [G] huit commits du 23 novembre 2026, de `1fb4fc4` à `d4d3f6b`. [A] six commits de Claude Code (`1fb4fc4` à `770d1e8`), puis deux de Codex (`5f6a108`, `d4d3f6b`) : voir les deux sections du 23 novembre ci-dessus.

    * **Axe de vérification appliqué par l’étudiant :** [É] consignes et exigences transmises par Bilel Khlif ; [G] fusion par `27eff23`. [A] 226 tests unitaires et 104 vérifications de navigateur rapportés à la fusion (`docs/conformite.md`, addendum). Aucun essai sur téléphone de cette version n’est consigné.

*   **Composant ou Shader concerné :** sept espaces de coaching, 24 novembre 2026 (PR #17) : `index.html`, `src/workspace-controller.mjs`, `src/workspace-navigation.mjs`, modifications de `src/main.mjs`, `src/scene.mjs`, `src/onboarding.mjs`, `src/styles.css` et `sw.mjs` ; tests (`tests/workspace-tests.mjs`, `tests/coaching-workflow-tests.mjs`, `tests/final-ux-review-tests.mjs`, `tests/safe-area-review-tests.mjs`, `tests/workspace-test-helpers.mjs`, `tests/unit/workspace-controller.test.mjs`) ; `docs/espaces-coaching.md`, `docs/revue-finale-pr17.md`, `docs/integration-future-visualiseur.md`, captures de `docs/images/sidebar/` et `docs/images/revue/`

    * **Prompt ou usage principal :** [G] commits `2885bd2` et `94bee9e` du 24 novembre 2026 et leurs 39 fichiers. [É][A] demande de Bilel Khlif d’organiser l’application en espaces de coaching autour de la scène existante, sans perdre de fonctionnalité ; code, tests, revue finale et documents réalisés par Codex, d’après les sessions du 24 novembre et `docs/revue-finale-pr17.md`.

    * **Axe de vérification appliqué par l’étudiant :** [É] demande, revue finale exigée et fusion autorisée par Bilel Khlif. [A] 229 tests unitaires et 140 vérifications de navigateur rapportés par Codex, mesures de rendu et de mémoire (`docs/validation/revue-pr17-mesures.json`). Aucun essai sur téléphone n’est consigné.

*   **Composant ou Shader concerné :** fusion de la PR #17 et vérification du déploiement, 24 novembre 2026

    * **Prompt ou usage principal :** [É] autorisation explicite de Bilel Khlif de terminer la fusion interrompue de Codex, avec contrôles préalables ; [G] fusion par `48c293d` ; [A] fusion et vérifications faites par Claude Code.

    * **Axe de vérification appliqué par l’étudiant :** [É] autorisation et conditions de fusion fixées par Bilel Khlif. [G] PR #17 fusionnée vers `main` à sa tête approuvée `94bee9e` ; publication GitHub Pages réussie pour `48c293d`. [A] `npm test` sur la tête approuvée (une première exécution avec deux vérifications de navigateur instables, réussite complète à la relance) ; après fusion, 229 tests unitaires et 140 vérifications de navigateur ; 128 des 129 vérifications applicables sur le site publié (la 129e attend `text/javascript` pour les fichiers de three.js, servis en `application/javascript` par GitHub Pages) ; passage d’une installation de la version précédente à la nouvelle, relance hors-ligne et sept espaces hors-ligne, dans Chrome sur PC. Aucun essai sur téléphone.

## 4. Contributions et preuves — application évaluée

| Domaine | Responsabilité prévue (cahier §5.2, table de l’équipe du README) [É] | Responsabilité documentée | Réalisation assistée [A] | Preuves dans le dépôt [G] | Validation |
| --- | --- | --- | --- | --- | --- |
| Cahier des charges | Équipe | [É] Iyed Rachdi, Ghassen Dalleji et Bilel Khlif (cadrage collectif, ATTRIBUTION.md §4) | — | — | — |
| Session WebXR, hit test, ancre | Iyed Rachdi | [É] Bilel Khlif : exigences du professeur transmises (WebGPU sans repli), mode test WebGL réservé aux tests, essais sur téléphones les 12 et 14 novembre (ATTRIBUTION.md, contributions 11, 15, 17 et 19) | Claude Code (sprints 2 et 3, mode test WebGL) | `src/xr-session.mjs`, `src/ar-surface.mjs`, `src/webgpu.mjs` ; `docs/sprint-2.md`, `docs/sprint-3.md` | A, É ; P sur les versions des 12 et 14 novembre [É] |
| Scène three.js, terrain, joueurs, formations | Bilel Khlif | [É] sprint 1 piloté par Bilel Khlif ; guide du code relu (ATTRIBUTION.md) | Claude Code | `src/scene.mjs`, `src/pitch.mjs`, `src/players.mjs`, `src/formations.mjs` ; PR #1 | A |
| Interface HTML | Ghassen Dalleji | [É] demandes d’ergonomie transmises par Bilel Khlif (PR #16, #17) | Claude Code ; Codex (PR #16, #17) | `index.html`, `src/styles.css`, `docs/ergonomie.md`, `docs/espaces-coaching.md` | A, É |
| Raycasting | Ghassen Dalleji | [É] sprint 5 demandé par Bilel Khlif | Claude Code | `src/raycasting.mjs`, `src/tactical-interaction.mjs` ; PR #12 | A, É |
| PWA | Ghassen Dalleji | [É] défaut du réseau lent signalé par Bilel Khlif (12 novembre) | Claude Code ; Codex (cycle de migration) | `sw.mjs`, `sw.js`, `src/pwa.mjs` | A ; site publié vérifié le 24 novembre dans Chrome sur PC [A] |
| Documentation | Ghassen Dalleji | [É] demandes de documentation de Bilel Khlif (ATTRIBUTION.md, contribution 6) | Claude Code ; Codex | `README.md`, `docs/` | — |
| Tactique : tableau, commandes, séquences | — | [É] sprints 4 à 6 lancés par Bilel Khlif à partir des critères collectifs | Claude Code | `src/tactics-board.mjs`, `src/commands.mjs`, `src/tactical-sequence.mjs` ; PR #8, #12, #13 | A, É |
| Règles des flèches | — | [É] exigence du professeur transmise | Claude Code (`e219f15`, `d702f70`) ; Codex (choix du porteur, `5f6a108`) | `src/arrow-rules.mjs`, `docs/regles-des-fleches.md`, `tests/unit/arrow-rules.test.mjs` | A, É |
| Sept espaces de coaching | — | [É] demande, revue finale exigée, fusion autorisée | Codex (`2885bd2`, `94bee9e`) | `docs/espaces-coaching.md`, `docs/revue-finale-pr17.md` | A, É |
| Migration `.mjs` | — | [É] exigence du professeur transmise | Claude Code (`1fb4fc4`) ; Codex (vérification) | `docs/migration-mjs.md`, test de migration | A |

Niveaux de validation : **A** automatisée, **É** émulée (WebXR de Chrome sur PC, IWER), **P** physique (téléphone réel). La colonne « Responsabilité prévue » reprend la répartition du cahier des charges citée par le README ; les contributions individuelles effectives d’Iyed Rachdi et de Ghassen Dalleji au-delà du cahier des charges ne sont pas documentées (ATTRIBUTION.md, §4) : elles restent à confirmer par l’équipe, sans être retirées ni réattribuées ici.

## 5. En-têtes des fonctions : contrôle et corrections proposées

Méthode [G] : pour chacune des 354 fonctions documentées de `src/` et de `sw.mjs` sur `main`, la date `@date` est comparée à la date du premier commit qui introduit sa signature (`git log -S`, ancien nom `.js` compris). 21 écarts apparaissent ; 19 s’expliquent : signature modifiée plus tard (fonction devenue asynchrone, paramètre ajouté, fonction déplacée), vérifiée par le nom, ou méthode homonyme d’une autre classe. **Deux dates sont inexactes** selon la convention (`docs/convention-de-documentation.md`) :

| Fonction | Date déclarée | Date proposée | Preuve [G] |
| --- | --- | --- | --- |
| `resetPitchPose` (`src/ar-view.mjs`) | 2026-11-09 | 2026-11-14 | introduite par `b4925a9` |
| `targetLabel` (`src/arrow-rules.mjs`) | 2026-11-15 | 2026-11-23 | introduite par `e219f15`, sans code supprimé ailleurs |

Ces corrections ne sont **pas appliquées** dans cette proposition : les deux fichiers font partie de la coquille hors-ligne, et les modifier demande `npm run shell-version`, donc une nouvelle version de l’application installée, puis `npm test`.

`@responsable Bilel Khlif` figure sur toutes les fonctions : la convention le définit comme la personne responsable (consignes, revue, fusion), et la réalisation par les assistants est déclarée au §4. Aucune modification n’est proposée ; attribuer une partie à Iyed Rachdi ou à Ghassen Dalleji demanderait une preuve de leur responsabilité sur cette partie.

## 6. Orthographe du nom : Ghassen Dalleji

Bilel Khlif a indiqué le 24 novembre 2026 que l’orthographe correcte est **Ghassen Dalleji** [É] ; cette proposition l’emploie. Le dépôt écrit « Dallekji » aux endroits suivants [G], **laissés inchangés** pour que l’équipe relise chaque document historique avant correction :

| Fichier | Emplacement |
| --- | --- |
| `ATTRIBUTION.md` | ligne 5 (équipe), ligne 169 (§4, cadrage collectif), ligne 327 (sprint 4) |
| `README.md` | ligne 503 (table de l’équipe, ajoutée par `34dac61` le 5 novembre 2026) |
| `docs/rapport-final.md` | ligne 10 |
| `docs/video-demonstration.md` | ligne 16 |
| `docs/etat-de-l-art/etat_de_l_art.tex` | lignes 46 et 134 (le PDF du rapport est à régénérer après correction) |
| `docs/presentation/football-simulator-soutenance.pdf` | texte de la présentation (à corriger dans sa source, puis à réexporter) |

## 7. À confirmer par l’équipe

- La correction du nom dans les documents ci-dessus.
- Les contributions individuelles effectives d’Iyed Rachdi et de Ghassen Dalleji (essais, vidéo, présentation, relectures…) : à consigner seulement avec leur confirmation.
- Les essais sur téléphone P0 à P10 de la version finale : non faits à ce jour.

## 8. Déclarations écartées, faute de preuve

- Qui a exécuté la fusion locale de la PR #16 (`27eff23`) : le commit indique Bilel Khlif comme auteur, pas l’outil.
- Une relecture humaine ligne à ligne du code des PR #16 et #17 : aucune trace n’en est consignée.
- Le modèle et la version de Codex.
- Tout essai sur téléphone des versions du 23 et du 24 novembre.
- Toute répartition des commits entre assistants présentée comme une preuve Git : elle ne vient que des comptes rendus des sessions.
